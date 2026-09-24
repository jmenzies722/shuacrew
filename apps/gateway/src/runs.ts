/**
 * The run supervisor: queues runs, gives each its own worktree, drives a runtime, and records
 * everything that happens as facts.
 *
 * Three rules shape it:
 *   - Every tool call goes through the one policy engine; a person decides what policy can't.
 *   - A subscription's usage window running out pauses a run, never fails it: it resumes by
 *     itself when the window resets (or on another runtime, if failover is on).
 *   - Concurrency is capped per runtime, so ten parallel agents don't burn a plan's window in
 *     one burst.
 */
import { randomUUID } from "node:crypto";
import {
  agentEnv,
  allowAll,
  decide,
  defaultContext,
  defaultRules,
  normalise,
  standingRule,
  type AnyEvent,
  type Layer,
  type PolicyContext,
  type RunStatus,
} from "@shuacrew/core";
import type { ApprovalAnswer, Runtime, RunSpec } from "@shuacrew/runtimes";
import type { EventStore } from "./store.js";
import { Worktrees } from "./worktrees.js";

export interface LaunchSpec {
  ask: string;
  title?: string;
  repo?: string;
  project?: string;
  runtime?: string;
  model?: string;
  effort?: string;
  parent?: string;
  labels?: string[];
  approveAll?: boolean;
  incognito?: boolean;
}

interface Waiting {
  run: string;
  resolve: (answer: ApprovalAnswer) => void;
  tool: string;
  input: unknown;
}

export interface SupervisorOptions {
  workspace: string; // where runs with no repo work
  roots?: string[];
  protectedFolders?: string[];
  concurrency?: Record<string, number>;
  failover?: boolean;
  approvalTimeoutMs?: number;
}

export class Supervisor {
  private active = new Map<string, AbortController>();
  private halted = false;
  private waiting = new Map<string, Waiting>();
  private approveAll = new Set<string>();
  private resumeTimers = new Map<string, NodeJS.Timeout>();
  readonly worktrees = new Worktrees();

  constructor(
    private store: EventStore,
    private runtimes: Map<string, Runtime>,
    private options: SupervisorOptions,
  ) {}

  /** Record a fact — unless the gateway is shutting down, when runs stop without a word so the
   * log still says they were running and the next boot resumes them. */
  private rec(...args: Parameters<EventStore["append"]>): AnyEvent | undefined {
    return this.halted ? undefined : this.store.append(...args);
  }

  /** Stop every run for a gateway shutdown, recording nothing. */
  shutdown(): void {
    this.halted = true;
    for (const timer of this.resumeTimers.values()) clearTimeout(timer);
    for (const controller of this.active.values()) controller.abort();
    for (const wait of this.waiting.values()) wait.resolve({ allow: false, reason: "gateway stopping" });
    this.waiting.clear();
  }

  // ── launching ────────────────────────────────────────────────────────────────────────

  launch(spec: LaunchSpec): string {
    const id = `r_${randomUUID().slice(0, 8)}`;
    const runtime = spec.runtime ?? this.defaultRuntime();
    this.rec(
      "run.created",
      {
        title: spec.title ?? titleFrom(spec.ask),
        ask: spec.ask,
        project: spec.project,
        repo: spec.repo,
        runtime,
        model: spec.model,
        effort: spec.effort,
        parent: spec.parent,
        labels: spec.labels ?? [],
        incognito: spec.incognito ?? false,
      },
      { run: id },
    );
    if (spec.approveAll) this.approveAll.add(id);
    queueMicrotask(() => this.pump());
    return id;
  }

  cancel(run: string, reason = "cancelled by you"): void {
    this.active.get(run)?.abort();
    for (const [id, wait] of this.waiting) {
      if (wait.run === run) {
        this.waiting.delete(id);
        wait.resolve({ allow: false, reason });
      }
    }
    if (this.status(run) && !isFinished(this.status(run)!)) this.setStatus(run, "cancelled", reason);
  }

  /** Start whatever is queued, within each runtime's concurrency cap. */
  pump(): void {
    if (this.halted) return;
    const runs = this.projectRuns();
    const queued = runs.filter((r) => r.status === "queued").sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    for (const run of queued) {
      if (this.limitedUntil(run.runtime) > Date.now()) continue;
      const cap = this.options.concurrency?.[run.runtime] ?? (run.runtime === "mock" ? 8 : 2);
      const busy = runs.filter((r) => r.runtime === run.runtime && this.active.has(r.id)).length;
      if (busy >= cap) continue;
      void this.execute(run.id);
      run.status = "running"; // so the next iteration counts it
      this.active.set(run.id, this.active.get(run.id) ?? new AbortController());
    }
  }

  // ── running ──────────────────────────────────────────────────────────────────────────

  private async execute(runId: string): Promise<void> {
    const created = this.store.forRun(runId).find((e) => e.kind === "run.created");
    if (!created || created.kind !== "run.created") return;
    const spec = created.body;
    const runtimeId = this.currentRuntime(runId, spec.runtime);
    const runtime = this.runtimes.get(runtimeId);
    const controller = this.active.get(runId) ?? new AbortController();
    this.active.set(runId, controller);
    if (!runtime) {
      this.setStatus(runId, "failed", `no runtime called ${runtimeId}`);
      this.active.delete(runId);
      return;
    }

    let cwd = this.options.workspace;
    try {
      if (spec.repo) {
        const existing = this.store.forRun(runId).find((e) => e.kind === "run.worktree");
        if (existing && existing.kind === "run.worktree") {
          cwd = existing.body.path;
        } else {
          const tree = await this.worktrees.create(spec.repo, runId);
          cwd = tree.path;
          this.rec("run.worktree", tree, { run: runId });
        }
      }
    } catch (error) {
      this.setStatus(runId, "failed", `could not create a worktree: ${(error as Error).message}`);
      this.active.delete(runId);
      return;
    }

    this.setStatus(runId, "running");
    const turn = this.turns(runId) + 1;
    const ask = this.currentAsk(runId, spec.ask);
    this.rec("turn.started", { turn, text: ask, by: "you" }, { run: runId });
    const started = Date.now();
    const policy = this.policyFor(runId, cwd);
    // A conversation id only means something to the runtime that owns it. A run that moved to
    // another agent starts a fresh conversation there, with a recap of the work so far.
    const resume = this.backendSession(runId, runtime.id);
    const moved = !resume && turn > 1;
    const model = this.modelFor(runId, runtime.id, spec.model);
    const run: RunSpec = {
      id: runId,
      ask: moved ? `${this.recap(runId)}\n\n---\n\n${ask}` : ask,
      cwd,
      model,
      effort: spec.effort,
      resume,
    };

    let ended = false;
    let buffered = "";
    const flush = () => {
      if (buffered) this.rec("agent.delta", { turn, text: buffered }, { run: runId });
      buffered = "";
    };
    const flusher = setInterval(flush, 50); // coalesce token deltas: one fact per 50ms, not per token
    try {
      for await (const event of runtime.start(run, {
        signal: controller.signal,
        env: agentEnv(process.env, runtime.authMode),
        approve: (tool, input, meta) => this.gate(runId, policy, tool, input, meta?.subagent),
      })) {
        if (event.type !== "text" || event.final) flush();
        switch (event.type) {
          case "session":
            this.rec("run.session", { runtime: runtime.id, id: event.id }, { run: runId });
            break;
          case "text":
            if (event.final) this.rec("agent.message", { turn, text: event.text, final: true }, { run: runId });
            else buffered += event.text;
            break;
          case "thinking":
            this.rec("agent.thinking", { turn, text: event.text }, { run: runId });
            break;
          case "tool-call":
            this.rec("tool.called", { id: event.id, tool: event.tool, input: event.input, subagent: event.subagent }, { run: runId });
            break;
          case "tool-result":
            this.rec("tool.returned", { id: event.id, ok: event.ok, output: event.output.slice(0, 20_000), durationMs: event.durationMs }, { run: runId });
            break;
          case "file":
            this.rec("file.changed", { path: event.path, change: event.change ?? "modified" }, { run: runId });
            break;
          case "check":
            this.rec("check.ran", { command: event.command, exitCode: event.exitCode, output: (event.output ?? "").slice(0, 4000) }, { run: runId });
            break;
          case "subagent-start":
            this.rec("subagent.started", { id: event.id, name: event.name, task: event.task }, { run: runId });
            break;
          case "subagent-end":
            this.rec("subagent.finished", { id: event.id, ok: event.ok, summary: event.summary ?? "" }, { run: runId });
            break;
          case "usage":
            this.rec(
              "usage.recorded",
              {
                runtime: runtime.id,
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                cacheTokens: event.cacheTokens ?? 0,
                costUsd: runtime.authMode === "subscription" ? undefined : event.costUsd,
                contextUsed: event.contextUsed,
                contextLimit: event.contextLimit,
              },
              { run: runId },
            );
            break;
          case "checkpoint": {
            const commit = spec.repo ? await this.worktrees.checkpoint(cwd, `turn ${turn}: ${event.note ?? ""}`).catch(() => undefined) : undefined;
            this.rec("checkpoint.created", { turn, commit, note: event.note ?? "" }, { run: runId });
            break;
          }
          case "limited":
            this.limited(runId, runtime.id, event.until, event.message);
            ended = true;
            return;
          case "done":
            this.rec("agent.message", { turn, text: event.text, final: true }, { run: runId });
            this.rec(
              "turn.completed",
              { turn, route: { runtime: runtime.id, model, effort: spec.effort }, durationMs: Date.now() - started, backendSession: this.backendSession(runId, runtime.id) },
              { run: runId },
            );
            this.setStatus(runId, spec.repo && this.changedFiles(runId) ? "reviewing" : "done");
            ended = true;
            break;
          case "error":
            this.rec("error.raised", { message: event.message, fatal: true }, { run: runId });
            this.setStatus(runId, "failed", event.message);
            ended = true;
            break;
        }
      }
      if (!ended) this.setStatus(runId, "done");
    } catch (error) {
      if (this.halted) return; // shutting down: the log must keep saying this run was running
      const message = (error as Error).message;
      if (controller.signal.aborted) {
        if (!isFinished(this.status(runId) ?? "queued")) this.setStatus(runId, "cancelled");
      } else {
        this.rec("error.raised", { message, fatal: true }, { run: runId });
        this.setStatus(runId, "failed", message);
      }
    } finally {
      clearInterval(flusher);
      this.active.delete(runId);
      if (!this.halted) {
        flush();
        this.pump();
      }
    }
  }

  /** The runtime a run is on now: its latest routing, else the one it was launched on. */
  private currentRuntime(run: string, launched: string): string {
    let current = launched;
    for (const e of this.store.forRun(run)) if (e.kind === "run.routed" && this.runtimes.has(e.body.runtime)) current = e.body.runtime;
    return current;
  }

  /** The model to use on this runtime: the launch's choice if it belongs here; after a failover,
   * this runtime's model of the same tier (a fast model moves to a fast model, not the priciest). */
  private modelFor(run: string, runtime: string, launched?: string): string | undefined {
    for (const e of this.store.forRun(run)) if (e.kind === "run.routed" && e.body.runtime === runtime && e.body.model) return e.body.model;
    const models = this.runtimes.get(runtime)?.models ?? [];
    if (!launched) return undefined;
    if (models.length === 0 || models.some((m) => m.id === launched)) return launched;
    const tier = [...this.runtimes.values()].flatMap((r) => r.models).find((m) => m.id === launched)?.tier;
    return models.find((m) => m.tier === tier)?.id;
  }

  /** The runtime's own conversation for this run — only if that runtime owns it. */
  private backendSession(run: string, runtime: string): string | undefined {
    let found: string | undefined;
    for (const e of this.store.forRun(run)) if (e.kind === "run.session" && e.body.runtime === runtime) found = e.body.id;
    return found;
  }

  /** What another agent needs to carry on: what was asked, what was said, what changed. */
  private recap(run: string): string {
    const lines = ["You are continuing a ShuaCrew run that another agent started. Here is where it stands:"];
    const files = new Set<string>();
    for (const e of this.store.forRun(run)) {
      if (e.kind === "turn.started") lines.push(`\n> ${e.body.text.split("\n")[0]}`);
      if (e.kind === "agent.message" && e.body.final) lines.push(e.body.text.slice(0, 600));
      if (e.kind === "file.changed") files.add(e.body.path);
      if (e.kind === "check.ran") lines.push(`(check ${e.body.exitCode === 0 ? "passed" : "failed"}: ${e.body.command})`);
    }
    if (files.size) lines.push(`\nFiles changed so far: ${[...files].slice(0, 20).join(", ")}`);
    return lines.join("\n");
  }

  // ── the usage window ────────────────────────────────────────────────────────────────

  private limited(run: string, runtime: string, until: number, message: string): void {
    this.rec("runtime.limited", { runtime, until, message });
    // A run moves at most twice: past that it waits for a window instead of bouncing between agents.
    const moves = this.store.forRun(run).filter((e) => e.kind === "run.routed" && e.body.reason.includes(" is out until ")).length;
    const other =
      this.options.failover && moves < 2
        ? [...this.runtimes.keys()].find((r) => r !== runtime && r !== "mock" && this.limitedUntil(r) < Date.now())
        : undefined;
    if (other) {
      const created = this.store.forRun(run).find((e) => e.kind === "run.created");
      const launched = created?.kind === "run.created" ? created.body.model : undefined;
      this.rec(
        "run.routed",
        { runtime: other, model: this.modelFor(run, other, launched), reason: `${runtime} is out until ${new Date(until).toLocaleTimeString()}` },
        { run },
      );
      this.setStatus(run, "queued", `moved to ${other}`);
      this.pump();
      return;
    }
    this.setStatus(run, "paused", `${runtime} usage window — resumes ${new Date(until).toLocaleTimeString()}`);
    this.scheduleResume(runtime, until);
  }

  private scheduleResume(runtime: string, until: number): void {
    clearTimeout(this.resumeTimers.get(runtime));
    const timer = setTimeout(() => this.restore(runtime), Math.max(0, until - Date.now()));
    timer.unref?.();
    this.resumeTimers.set(runtime, timer);
  }

  /** The window reset: paused runs go back in the queue. */
  restore(runtime: string): void {
    this.rec("runtime.restored", { runtime });
    for (const run of this.projectRuns()) {
      if (run.status === "paused" && run.runtime === runtime) this.setStatus(run.id, "queued", "usage window reset");
    }
    this.pump();
  }

  /** When a runtime's usage window lifts; 0 when it is available. The latest limit stands
   * unless a restore came after it. */
  limitedUntil(runtime: string): number {
    let limit: { seq: number; until: number } | undefined;
    for (const e of this.store.ofKinds("runtime.limited")) {
      if (e.kind === "runtime.limited" && e.body.runtime === runtime) limit = { seq: e.seq, until: e.body.until };
    }
    if (!limit) return 0;
    const restored = this.store
      .ofKinds("runtime.restored", limit.seq)
      .some((e) => e.kind === "runtime.restored" && e.body.runtime === runtime);
    return restored ? 0 : limit.until;
  }

  // ── approvals ───────────────────────────────────────────────────────────────────────

  private policyFor(run: string, workspace: string): { ctx: PolicyContext; layers: () => Layer[] } {
    const ctx = defaultContext(workspace, {
      roots: this.options.roots ?? ["~/Developer"],
      protected: this.options.protectedFolders ?? [],
    });
    return {
      ctx,
      layers: () => [
        { name: "global", rules: [...defaultRules(), ...this.standingRules()] },
        { name: "run", rules: this.approveAll.has(run) ? [allowAll()] : [] },
      ],
    };
  }

  private standingRules() {
    const rules = [];
    for (const e of this.store.ofKinds("approval.decided")) {
      if (e.kind !== "approval.decided" || !e.body.always || !e.body.allow) continue;
      const asked = this.store.ofKinds("approval.requested").find((r) => r.kind === "approval.requested" && r.body.id === e.body.id);
      if (asked && asked.kind === "approval.requested") rules.push(standingRule(asked.body.tool, asked.body.input));
    }
    return rules;
  }

  private async gate(
    run: string,
    policy: { ctx: PolicyContext; layers: () => Layer[] },
    tool: string,
    input: unknown,
    subagent?: string,
  ): Promise<ApprovalAnswer> {
    const decision = decide(normalise(tool, input), policy.ctx, policy.layers());
    this.rec("policy.decided", { tool, verdict: decision.verdict, rule: decision.rule, layer: decision.layer, reason: decision.reason }, { run });
    if (decision.verdict === "allow") return { allow: true, reason: decision.reason };
    if (decision.verdict === "deny") return { allow: false, reason: `${decision.reason} (${decision.rule})` };

    const id = `a_${randomUUID().slice(0, 8)}`;
    this.rec(
      "approval.requested",
      { id, tool, input, risk: decision.risk, reason: subagent ? `${decision.reason} · subagent ${subagent}` : decision.reason, rule: decision.rule },
      { run },
    );
    this.setStatus(run, "awaiting_approval");
    return new Promise<ApprovalAnswer>((resolve) => {
      const timeout = setTimeout(() => this.decideApproval(id, false, "timeout"), this.options.approvalTimeoutMs ?? 30 * 60_000);
      timeout.unref?.();
      this.waiting.set(id, {
        run,
        tool,
        input,
        resolve: (answer) => {
          clearTimeout(timeout);
          if (this.status(run) === "awaiting_approval" && ![...this.waiting.values()].some((w) => w.run === run)) {
            this.setStatus(run, "running");
          }
          resolve(answer);
        },
      });
    });
  }

  /** A person (or a timeout) answers an approval. Returns false when nothing was waiting. */
  decideApproval(id: string, allow: boolean, by = "you", always = false, comment?: string): boolean {
    const wait = this.waiting.get(id);
    const known = wait ?? this.pendingFromLog(id);
    if (!known) return false;
    this.rec("approval.decided", { id, allow, by, always: always && allow, comment }, { run: known.run });
    if (wait) {
      this.waiting.delete(id);
      wait.resolve({ allow, reason: allow ? `${by} allowed it` : comment ? `${by} said no: ${comment}` : `${by} said no` });
    }
    return true;
  }

  private pendingFromLog(id: string): { run: string } | undefined {
    const asked = this.store.ofKinds("approval.requested").find((e) => e.kind === "approval.requested" && e.body.id === id);
    const decided = this.store.ofKinds("approval.decided").some((e) => e.kind === "approval.decided" && e.body.id === id);
    return asked && !decided && asked.run ? { run: asked.run } : undefined;
  }

  // ── follow-ups ──────────────────────────────────────────────────────────────────────

  /** Send another message to a run: a new turn in the same runtime conversation. */
  followUp(run: string, text: string, by = "you"): void {
    if (!this.status(run)) throw new Error(`no run ${run}`);
    if (this.active.has(run)) throw new Error("the run is still working — wait for this turn to finish");
    this.rec("run.followup", { text, by }, { run });
    this.setStatus(run, "queued", "follow-up");
    this.pump();
  }

  /** What this turn is asked: the newest follow-up not yet answered, else the original ask. */
  private currentAsk(run: string, original: string): string {
    let ask = original;
    let answered = true;
    for (const e of this.store.forRun(run)) {
      if (e.kind === "run.followup") {
        ask = e.body.text;
        answered = false;
      }
      if (e.kind === "turn.started" && !answered && e.body.text === ask) answered = true;
    }
    return ask;
  }

  // ── reading the log ─────────────────────────────────────────────────────────────────

  private setStatus(run: string, status: RunStatus, reason?: string): void {
    if (this.halted) return;
    if (this.status(run) === status && !reason) return;
    this.rec("run.status", { status, reason }, { run });
  }

  status(run: string): RunStatus | undefined {
    let status: RunStatus | undefined;
    for (const e of this.store.forRun(run)) {
      if (e.kind === "run.created" && !status) status = "queued";
      if (e.kind === "run.status") status = e.body.status;
    }
    return status;
  }

  private turns(run: string): number {
    return this.store.forRun(run).filter((e) => e.kind === "turn.started").length;
  }

  private changedFiles(run: string): number {
    return this.store.forRun(run).filter((e) => e.kind === "file.changed").length;
  }

  private projectRuns(): Array<{ id: string; status: RunStatus; runtime: string; priority: number; seq: number }> {
    const runs = new Map<string, { id: string; status: RunStatus; runtime: string; priority: number; seq: number }>();
    const visit = (e: AnyEvent) => {
      if (!e.run) return;
      if (e.kind === "run.created" && !runs.has(e.run)) runs.set(e.run, { id: e.run, status: "queued", runtime: e.body.runtime, priority: 0, seq: e.seq });
      const r = runs.get(e.run);
      if (!r) return;
      if (e.kind === "run.status") r.status = e.body.status;
      if (e.kind === "run.priority") r.priority = e.body.priority;
      if (e.kind === "run.routed" && this.runtimes.has(e.body.runtime)) r.runtime = e.body.runtime;
    };
    for (const kind of ["run.created", "run.status", "run.priority", "run.routed"] as const) {
      for (const e of this.store.ofKinds(kind)) visit(e);
    }
    return [...runs.values()];
  }

  private defaultRuntime(): string {
    return this.runtimes.has("claude") ? "claude" : [...this.runtimes.keys()][0] ?? "mock";
  }

  /** After a restart: runs that were mid-flight are re-queued and resume their conversation. */
  recover(): string[] {
    const resumed: string[] = [];
    for (const run of this.projectRuns()) {
      if (["running", "planning", "awaiting_approval"].includes(run.status)) {
        this.setStatus(run.id, "queued", "gateway restarted — resuming from the last checkpoint");
        resumed.push(run.id);
      }
      if (run.status === "paused") {
        const until = this.limitedUntil(run.runtime);
        if (until > Date.now()) this.scheduleResume(run.runtime, until);
        else this.setStatus(run.id, "queued", "usage window reset while the gateway was down");
      }
    }
    this.pump();
    return resumed;
  }

  pendingApprovals(): string[] {
    return [...this.waiting.keys()];
  }
}

function isFinished(status: RunStatus): boolean {
  return ["merged", "done", "failed", "cancelled"].includes(status);
}

function titleFrom(ask: string): string {
  const line = ask.trim().split("\n")[0] ?? "";
  return line.length <= 70 ? line : `${line.slice(0, 67).trimEnd()}…`;
}
