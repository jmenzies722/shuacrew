/**
 * The merge queue: approved runs land on their base branch one at a time.
 *
 * For each run: rebase its branch onto the latest base, re-run the check the run itself last
 * passed (so "it passed in the run" still means something after the rebase), then fast-forward the
 * base. A conflict or a failing check sends the run back to review with the reason — never a
 * half-landed merge.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { EventStore } from "./store.js";
import type { Worktrees } from "./worktrees.js";

/** How long after you asked a merge is still finished on restart. */
const RECOVER_WITHIN_MS = 24 * 3_600_000;

export class MergeQueue {
  private queue: string[] = [];
  private busy = false;

  constructor(
    private store: EventStore,
    private worktrees: Worktrees,
  ) {}

  /** Queue a reviewed run. Returns its position (1 = next). */
  enqueue(run: string): number {
    if (!this.queue.includes(run)) this.queue.push(run);
    const position = this.queue.indexOf(run) + 1;
    this.store.append("merge.queued", { position }, { run });
    void this.drain();
    return position;
  }

  /**
   * After a restart: the queue is rebuilt from the log. A merge you asked for that neither landed nor failed is
   * queued again, in the order you asked, unless the session has moved on since (a new turn, a rejection, a cancel)
   * or you asked more than a day ago: an old merge never lands by surprise.
   * Landing is safe to repeat: the rebase and the fast-forward are no-ops when they already happened.
   */
  recover(now = Date.now()): string[] {
    const last = new Map<string, { kind: string; seq: number; at: number }>();
    for (const kind of ["merge.queued", "merge.landed", "merge.failed"] as const) {
      for (const e of this.store.ofKinds(kind)) if (e.run && (last.get(e.run)?.seq ?? 0) < e.seq) last.set(e.run, { kind, seq: e.seq, at: e.at });
    }
    const stranded = [...last].filter(([, at]) => at.kind === "merge.queued" && now - at.at <= RECOVER_WITHIN_MS).sort((a, b) => a[1].seq - b[1].seq).filter(([run, at]) => {
      const since = this.store.forRun(run).filter((e) => e.seq > at.seq);
      return !since.some((e) => e.kind === "turn.started" || (e.kind === "run.status" && ["merged", "failed", "cancelled"].includes(e.body.status)) || e.kind === "run.archived");
    }).map(([run]) => run).filter((run) => !this.queue.includes(run));
    this.queue.push(...stranded);
    if (stranded.length) void this.drain();
    return stranded;
  }

  get pending(): string[] {
    return [...this.queue];
  }

  /** Resolves when the queue is empty — for tests and shutdown. */
  async idle(): Promise<void> {
    while (this.busy || this.queue.length) await new Promise((r) => setTimeout(r, 20));
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const run = this.queue[0]!;
        await this.land(run);
        this.queue.shift();
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * The check that must pass after the rebase: the repo's own `.shuacrew/merge-check` if it has one,
   * else the check this run last passed. The mock runtime's checks are simulated — they never ran —
   * so they are never re-run as if they were real.
   */
  private checkFor(repo: string, runtime: string, events: ReturnType<EventStore["forRun"]>): string | undefined {
    const configured = path.join(repo, ".shuacrew", "merge-check");
    if (existsSync(configured)) return readFileSync(configured, "utf8").trim() || undefined;
    if (runtime === "mock") return undefined;
    const lastPassing = [...events].reverse().find((e) => e.kind === "check.ran" && e.body.exitCode === 0);
    return lastPassing?.kind === "check.ran" ? lastPassing.body.command : undefined;
  }

  private async land(run: string): Promise<void> {
    const events = this.store.forRun(run);
    const created = events.find((e) => e.kind === "run.created");
    const tree = events.find((e) => e.kind === "run.worktree");
    if (created?.kind !== "run.created" || tree?.kind !== "run.worktree" || !created.body.repo) {
      this.store.append("merge.failed", { reason: "this run has no repo branch to land" }, { run });
      return;
    }
    const check = this.checkFor(created.body.repo, created.body.runtime, events);
    const result = await this.worktrees.land(created.body.repo, tree.body, check, created.body.title);
    if (result.ok) {
      this.store.append("merge.landed", { commit: result.commit, branch: tree.body.branch }, { run });
      this.store.append("run.status", { status: "merged", reason: `landed on ${tree.body.base}` }, { run });
      await this.worktrees.remove(created.body.repo, tree.body.path, tree.body.branch);
    } else {
      this.store.append("merge.failed", { reason: result.reason }, { run });
      this.store.append("run.status", { status: "reviewing", reason: result.reason }, { run });
    }
  }
}
