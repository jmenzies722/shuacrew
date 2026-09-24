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
import { expandAsk } from "./chat-commands.js";

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
  /** Record the run but never execute it (a task's parent: its steps do the work). */
  hold?: boolean;
  /** Work in the repo itself — spec drafts, not a branch. */
  inPlace?: boolean;
  forkOf?: { run: string; turn: number; commit?: string };
  /** A crew member to do this: its persona, model and lessons come along. */
  member?: string;
  /** The venture this work is for: its brief comes along. */
  venture?: string;
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
  /** The crew: members' defaults and personas. */
  crew?: { get(id: string): { runtime?: string; model?: string } | undefined; persona(id: string): string | undefined };
  /** Lessons and skills for a conversation that is starting. */
  memory?: { systemFor(run: string, ask: string, options?: { skills?: boolean }): string | undefined; skills?: () => Array<{ name: string; body: string; status?: string }> };
  /** Installed MCP servers, already shaped for that runtime. */
  mcpServers?: (runtime: string, run: string) => Record<string, unknown> | unknown[];
  /** Told to every fresh conversation (what ShuaCrew's own tools are for). */
  toolHint?: string;
  /** Claude Code plugins for a runtime (ShuaCrew's installed skills). */
  plugins?: (runtime: string) => RunSpec["plugins"];
  /** A venture's brief, for sessions working on it. */
  ventureBrief?: (venture: string) => string | undefined;
  mcpList?: () => Array<{ name: string }>;
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
  ) {
    for (const event of this.store.ofKinds("run.permission")) {
      if (event.kind === "run.permission" && event.run) {
        if (event.body.mode === "auto") this.approveAll.add(event.run);
        else this.approveAll.delete(event.run);
      }
    }
  }

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
    this.expand(spec.ask);
    const id = `r_${randomUUID().slice(0, 8)}`;
    const member = spec.member ? this.options.crew?.get(spec.member) : undefined;
    if (member) spec = { ...spec, runtime: spec.runtime ?? (member.runtime && this.runtimes.has(member.runtime) ? member.runtime : undefined), model: spec.model ?? member.model };
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
        // "held" is part of the fact, so a restart knows never to execute this run itself.
        labels: [...(spec.labels ?? []), ...(spec.hold ? ["held"] : []), ...(spec.inPlace ? ["in-place"] : [])],
        incognito: spec.incognito ?? false,
        forkOf: spec.forkOf,
        member: member ? spec.member : undefined,
        venture: spec.venture,
      },
      { run: id },
    );
    if (spec.approveAll) {
      this.approveAll.add(id);
      this.rec("run.permission", { mode: "auto" }, { run: id });
    }
    if (spec.hold) this.rec("run.status", { status: "planning" }, { run: id });
    else if (spec.forkOf) this.rec("run.status", { status: "done", reason: "forked — waiting for your first message" }, { run: id });
    else queueMicrotask(() => this.pump());
    return id;
  }

  /**
   * A new session that carries this one's conversation up to `turn`, and — in a repo — its own
   * branch starting at that turn's checkpoint. It waits for your first message.
   */
  fork(run: string, turn: number): string {
    const created = this.store.forRun(run).find((e) => e.kind === "run.created");
    if (created?.kind !== "run.created") throw new Error(`no run ${run}`);
    const checkpoint = [...this.store.forRun(run)].reverse().find((e) => e.kind === "checkpoint.created" && e.body.turn <= turn);
    const commit = checkpoint?.kind === "checkpoint.created" ? checkpoint.body.commit : undefined;
    return this.launch({
      ask: this.recap(run, turn, "You are continuing a ShuaCrew session from an earlier point. Here is the conversation up to there:"),
      title: `↳ ${created.body.title}`,
      repo: created.body.repo,
      project: created.body.project,
      runtime: created.body.runtime,
      model: created.body.model,
      effort: created.body.effort,
      labels: ["fork"],
      forkOf: { run, turn, commit },
    });
  }

  /** Take back a queued message before its turn starts. */
  withdraw(run: string, id: string): void {
    if (!this.unanswered(run, true).some((f) => f.id === id)) throw new Error("that message has already been answered");
    this.rec("run.followup.withdrawn", { id }, { run });
  }

  cancel(run: string, reason = "cancelled by you"): void {
    this.active.get(run)?.abort();
    // Anything it was waiting on you for is answered "no" — on the record, so it leaves the bell.
    const asked = this.store.forRun(run).flatMap((e) => (e.kind === "approval.requested" ? [e.body.id] : []));
    for (const id of asked) if (this.waiting.has(id) || this.pendingFromLog(id)) this.decideApproval(id, false, "stop", false, reason);
    if (this.status(run) && !isFinished(this.status(run)!)) this.setStatus(run, "cancelled", reason);
  }

  /** Start whatever is queued, within each runtime's concurrency cap. */
  pump(): void {
    if (this.halted) return;
    const runs = this.projectRuns();
    const queued = runs.filter((r) => r.status === "queued").sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    for (const run of queued) {
      const agent = this.currentRuntime(run.id, run.runtime);
      if (this.limitedUntil(agent) > Date.now() || this.allModelsLimited(agent)) continue;
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
      // A task's steps share the task's worktree, so each step builds on the last.
      const parentTree = spec.parent ? this.store.forRun(spec.parent).find((e) => e.kind === "run.worktree") : undefined;
      if (parentTree?.kind === "run.worktree") {
        cwd = parentTree.body.path;
      } else if (spec.repo && spec.labels.includes("in-place")) {
        cwd = spec.repo;
      } else if (spec.repo) {
        const existing = this.store.forRun(runId).find((e) => e.kind === "run.worktree");
        if (existing && existing.kind === "run.worktree") {
          cwd = existing.body.path;
        } else {
          const tree = await this.worktrees.create(spec.repo, runId, spec.forkOf?.commit);
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
    const spoken = this.currentAsk(runId, spec.ask);
    const ask = this.expand(spoken);
    this.rec("turn.started", { turn, text: spoken, by: "you" }, { run: runId });
    const started = Date.now();
    const policy = this.policyFor(runId, cwd);
    // A conversation id only means something to the runtime that owns it. A run that moved to
    // another agent starts a fresh conversation there, with a recap of the work so far.
    const resume = this.backendSession(runId, runtime.id);
    const moved = !resume && turn > 1;
    const model = this.pickModel(runtime.id, this.modelFor(runId, runtime.id, spec.model));
    const run: RunSpec = {
      id: runId,
      // A fork's first turn carries the conversation it branched from; a moved run gets a recap.
      ask: moved ? `${this.recap(runId)}\n\n---\n\n${ask}` : spec.forkOf && turn === 1 ? `${spec.ask}\n\n---\n\n${ask}` : ask,
      cwd,
      model,
      effort: spec.effort,
      resume,
      // A resumed conversation already has its lessons; only a fresh one is told.
      system: resume ? undefined : [spec.member ? this.options.crew?.persona(spec.member) : undefined, spec.venture ? this.options.ventureBrief?.(spec.venture) : undefined, this.options.memory?.systemFor(runId, ask, { skills: !this.options.plugins?.(runtime.id)?.length }), this.options.toolHint].filter(Boolean).join("\n\n") || undefined,
      mcpServers: this.options.mcpServers?.(runtime.id, runId),
      plugins: this.options.plugins?.(runtime.id),
    };

    let ended = false;
    let buffered = "";
    const flush = () => {
      if (buffered) this.rec("agent.delta", { turn, text: buffered }, { run: runId });
      buffered = "";
    };
    const flusher = setInterval(flush, 25); // coalesce token deltas: one fact per 25ms, not per token (the page smooths the rest)
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
            const commit = spec.repo || cwd !== this.options.workspace ? await this.worktrees.checkpoint(cwd, `turn ${turn}: ${event.note ?? ""}`).catch(() => undefined) : undefined;
            this.rec("checkpoint.created", { turn, commit, note: event.note ?? "" }, { run: runId });
            break;
          }
          case "limited":
            this.limited(runId, runtime.id, event.until, event.message, event.model ?? model, event.credits);
            ended = true;
            return;
          case "done":
            this.rec("agent.message", { turn, text: event.text, final: true }, { run: runId });
            this.rec(
              "turn.completed",
              { turn, route: { runtime: runtime.id, model, effort: spec.effort }, durationMs: Date.now() - started, backendSession: this.backendSession(runId, runtime.id) },
              { run: runId },
            );
            // A top-level run with changes goes to review; a task's step is just done (the task is reviewed).
            this.setStatus(runId, spec.repo && !spec.parent && this.changedFiles(runId) ? "reviewing" : "done");
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
        // Messages sent while it worked are next — unless you stopped it.
        const now = this.status(runId);
        if (now !== "cancelled" && now !== "paused" && this.unanswered(runId).length) this.setStatus(runId, "queued", "follow-up");
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
  private recap(run: string, uptoTurn = Number.POSITIVE_INFINITY, opening = "You are continuing a ShuaCrew run that another agent started. Here is where it stands:"): string {
    const lines = [opening];
    const files = new Set<string>();
    for (const e of this.store.forRun(run)) {
      if (e.kind === "turn.started" && e.body.turn > uptoTurn) break;
      if (e.kind === "turn.started") lines.push(`\n> ${e.body.text.split("\n")[0]}`);
      if (e.kind === "agent.message" && e.body.final) lines.push(e.body.text.slice(0, 600));
      if (e.kind === "file.changed") files.add(e.body.path);
      if (e.kind === "check.ran") lines.push(`(check ${e.body.exitCode === 0 ? "passed" : "failed"}: ${e.body.command})`);
    }
    if (files.size) lines.push(`\nFiles changed so far: ${[...files].slice(0, 20).join(", ")}`);
    return lines.join("\n");
  }

  // ── the usage window ────────────────────────────────────────────────────────────────

  private limited(run: string, runtime: string, until: number, message: string, model?: string, credits?: boolean): void {
    this.rec("runtime.limited", { runtime, model, until, message, credits });
    // Moves are capped, so a run never bounces between limits forever; past that it waits.
    const moves = this.store.forRun(run).filter((e) => e.kind === "run.routed" && / is out until | needs usage credits /.test(e.body.reason)).length;
    const created = this.store.forRun(run).find((e) => e.kind === "run.created");
    const launched = created?.kind === "run.created" ? created.body.model : undefined;
    const what = model ?? runtime;
    const why = credits ? `${what} needs usage credits on your plan` : `${what} is out until ${when(until)}`;
    // First choice: another model on the same agent (a weekly cap on one model isn't the account's).
    const sibling = this.options.failover !== false && moves < 3 && model ? this.pickModel(runtime, model, [model]) : undefined;
    if (sibling) {
      this.rec("run.routed", { runtime, model: sibling, reason: `${why} — using ${sibling}` }, { run });
      this.setStatus(run, "queued", `moved to ${sibling}`);
      this.pump();
      return;
    }
    const other =
      this.options.failover && moves < 3
        ? [...this.runtimes.keys()].find((r) => r !== runtime && r !== "mock" && this.limitedUntil(r) < Date.now() && !this.allModelsLimited(r))
        : undefined;
    if (other) {
      this.rec("run.routed", { runtime: other, model: this.pickModel(other, this.modelFor(run, other, launched)), reason: `${why} — moved to ${other}` }, { run });
      this.setStatus(run, "queued", `moved to ${other}`);
      this.pump();
      return;
    }
    this.setStatus(run, "paused", `${what} usage window — resumes ${when(until)}`);
    this.scheduleResume(runtime, until, model);
  }

  private scheduleResume(runtime: string, until: number, model?: string): void {
    const key = model ? `${runtime}:${model}` : runtime;
    clearTimeout(this.resumeTimers.get(key));
    // setTimeout can't wait longer than ~24.8 days; re-check daily for longer windows.
    const timer = setTimeout(() => (until - Date.now() > 1000 ? this.scheduleResume(runtime, until, model) : this.restore(runtime, model)), Math.min(Math.max(0, until - Date.now()), 86_400_000));
    timer.unref?.();
    this.resumeTimers.set(key, timer);
  }

  /** A window reset (or you said "try now"): paused runs go back in the queue. */
  restore(runtime: string, model?: string): void {
    this.rec("runtime.restored", { runtime, model });
    for (const run of this.projectRuns()) {
      if (run.status === "paused" && this.currentRuntime(run.id, run.runtime) === runtime) this.setStatus(run.id, "queued", "usage window reset");
    }
    this.pump();
  }

  /** The limits in force on an agent, each for a model or (no model) the whole agent. */
  private activeLimits(runtime: string): Array<{ model?: string; until: number }> {
    const limits = new Map<string, { seq: number; model?: string; until: number }>();
    for (const e of this.store.ofKinds("runtime.limited")) {
      if (e.kind === "runtime.limited" && e.body.runtime === runtime) limits.set(e.body.model ?? "*", { seq: e.seq, model: e.body.model, until: e.body.until });
    }
    const now = Date.now();
    return [...limits.values()].filter((l) => {
      if (l.until <= now) return false;
      return !this.store
        .ofKinds("runtime.restored", l.seq)
        .some((e) => e.kind === "runtime.restored" && e.body.runtime === runtime && (!e.body.model || e.body.model === l.model));
    });
  }

  /** Models this agent can't use right now, and why — for the model picker. */
  unavailableModels(runtime: string): Record<string, string> {
    const out: Record<string, string> = {};
    const credits = new Map<string, boolean>();
    for (const e of this.store.ofKinds("runtime.limited")) if (e.kind === "runtime.limited" && e.body.runtime === runtime && e.body.model) credits.set(e.body.model, Boolean(e.body.credits));
    for (const l of this.activeLimits(runtime)) if (l.model) out[l.model] = credits.get(l.model) ? "needs credits" : `out until ${when(l.until)}`;
    return out;
  }

  /** When the agent (or one of its models) is available again; 0 when it is available now. */
  limitedUntil(runtime: string, model?: string): number {
    const hit = this.activeLimits(runtime).filter((l) => !l.model || l.model === model);
    return hit.length ? Math.max(...hit.map((l) => l.until)) : 0;
  }

  private allModelsLimited(runtime: string): boolean {
    const models = this.runtimes.get(runtime)?.models ?? [];
    return models.length > 0 && models.every((m) => this.limitedUntil(runtime, m.id) > Date.now());
  }

  /**
   * The model to use on an agent: the one wanted if it's free; for "auto", the agent's default
   * unless a model limit is in force, then the best free model; never one that's capped.
   */
  private pickModel(runtime: string, wanted?: string, avoid: string[] = []): string | undefined {
    const models = this.runtimes.get(runtime)?.models ?? [];
    const free = (id: string) => !avoid.includes(id) && this.limitedUntil(runtime, id) <= Date.now();
    if (wanted && free(wanted)) return wanted;
    if (!wanted && !this.activeLimits(runtime).some((l) => l.model)) return undefined;
    const order = ["frontier", "balanced", "fast"];
    const tier = models.find((m) => m.id === wanted)?.tier;
    const ranked = [...models].sort((a, b) => Math.abs(order.indexOf(a.tier) - order.indexOf(tier ?? "frontier")) - Math.abs(order.indexOf(b.tier) - order.indexOf(tier ?? "frontier")) || order.indexOf(a.tier) - order.indexOf(b.tier));
    return ranked.find((m) => free(m.id))?.id;
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
      { id, tool, input, risk: decision.risk, reason: subagent ? `${decision.reason} · subagent ${subagent}` : decision.reason, rule: decision.rule, layer: decision.layer },
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

  /** Cycle this session: ask stops for approval, auto lets those through. A deny still wins. */
  setPermission(run: string, mode: "ask" | "auto"): void {
    if (!this.status(run) && !this.store.forRun(run).some((e) => e.kind === "run.created")) throw new Error(`no run ${run}`);
    this.rec("run.permission", { mode }, { run });
    if (mode === "auto") {
      this.approveAll.add(run);
      for (const [id, wait] of this.waiting) if (wait.run === run) this.decideApproval(id, true, "you (autopilot)");
    } else this.approveAll.delete(run);
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
  followUp(run: string, text: string, by = "you"): string {
    if (!this.status(run)) throw new Error(`no run ${run}`);
    this.expand(text);
    const id = `f_${randomUUID().slice(0, 8)}`;
    this.rec("run.followup", { id, text, by }, { run });
    // Mid-turn, a message waits its turn: the one after this answers everything queued.
    if (this.active.has(run)) return id;
    this.setStatus(run, "queued", "follow-up");
    this.pump();
    return id;
  }

  /** Follow-ups no turn has started on yet (and not taken back), oldest first. */
  private unanswered(run: string): string[];
  private unanswered(run: string, detailed: true): Array<{ id?: string; text: string }>;
  private unanswered(run: string, detailed?: boolean): Array<string | { id?: string; text: string }> {
    let pending: Array<{ id?: string; text: string }> = [];
    for (const e of this.store.forRun(run)) {
      if (e.kind === "run.followup") pending.push({ id: e.body.id, text: e.body.text });
      if (e.kind === "run.followup.withdrawn") pending = pending.filter((f) => f.id !== e.body.id);
      if (e.kind === "turn.started") pending = [];
    }
    return detailed ? pending : pending.map((f) => f.text);
  }

  /**
   * What this turn is asked: every follow-up queued since the last turn, together; else the last
   * turn's ask again (a turn cut off by a restart is redone); else the original ask.
   */
  private currentAsk(run: string, original: string): string {
    const pending = this.unanswered(run);
    if (pending.length) return pending.join("\n\n");
    const last = [...this.store.forRun(run)].reverse().find((e) => e.kind === "turn.started");
    return last?.kind === "turn.started" ? last.body.text : original;
  }

  /** `/skill` and `/mcp` stay as typed in the thread; the runtime gets the body or the named server. */
  private expand(ask: string): string {
    return expandAsk(ask, this.options.memory?.skills?.() ?? [], this.options.mcpList?.() ?? []);
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

  /** Runs the supervisor may execute — never a held run (a task's parent; its steps do the work). */
  private projectRuns(): Array<{ id: string; status: RunStatus; runtime: string; priority: number; seq: number }> {
    const runs = new Map<string, { id: string; status: RunStatus; runtime: string; priority: number; seq: number }>();
    const held = new Set<string>();
    const visit = (e: AnyEvent) => {
      if (!e.run || held.has(e.run)) return;
      if (e.kind === "run.created" && e.body.labels.includes("held")) {
        held.add(e.run);
        return;
      }
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
        const agent = this.currentRuntime(run.id, run.runtime);
        const limits = this.activeLimits(agent);
        if (limits.length) for (const l of limits) this.scheduleResume(agent, l.until, l.model);
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

/** "3:50 PM" today, "Wed 8:00 PM" within a week, "Sep 30, 8:00 PM" beyond. */
function when(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  if (ms - Date.now() < 6 * 86_400_000) return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}
