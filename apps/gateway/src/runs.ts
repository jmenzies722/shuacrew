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
import { mkdirSync, realpathSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  agentEnv,
  allowAll,
  decide,
  defaultContext,
  defaultRules,
  normalise,
  standingRule,
  within,
  type AnyEvent,
  type Layer,
  type PolicyContext,
  type RunStatus,
  type IntelligenceRequest,
} from "@shuacrew/core";
import type { ApprovalAnswer, Runtime, RunSpec, RuntimeStatus } from "@shuacrew/runtimes";
import type { EventStore } from "./store.js";
import { Worktrees } from "./worktrees.js";
import { failoverCandidates, inQuietHours, matchRoute, standingInstructions, type GatewaySettingsValue } from "./settings.js";
import { expandAsk } from "./chat-commands.js";
import { queuedMessages } from "@shuacrew/core/queue";
import { selectIntelligence } from "./intelligence.js";
import { inputDigest } from "./mobile/digest.js";

export interface LaunchSpec {
  baseCommit?: string;
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
  risk: "low" | "medium" | "high" | "critical";
}

export interface SupervisorOptions {
  /** Gateway-enforced settings (~/.shuacrew/settings.json). */
  settings?: () => GatewaySettingsValue;
  canStart?: (run: string) => boolean;
  runHint?: (run: string) => string | undefined;
  workspace: string; // where runs with no repo work
  roots?: string[];
  protectedFolders?: string[];
  concurrency?: Record<string, number>;
  failover?: boolean;
  approvalTimeoutMs?: number;
  /** The crew: members' defaults and personas. */
  crew?: { get(id: string): { runtime?: string; model?: string } | undefined; persona(id: string): string | undefined; agentsFor?(runtime: string, exclude?: string): RunSpec["agents"] };
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
  private runtimeSnapshots = new Map<string, { status: RuntimeStatus; models?: string[] }>();
  updateRuntimeStatus(id: string, status: RuntimeStatus, models?: string[]) { this.runtimeSnapshots.set(id, { status, models }); }
  intelligence(request: IntelligenceRequest) {
    return selectIntelligence(request, [...this.runtimes.values()].map(runtime => {
      const snapshot = this.runtimeSnapshots.get(runtime.id);
      return { ...runtime, models: snapshot?.models ? runtime.models.filter(m => snapshot.models!.includes(m.id)) : runtime.models,
        status: snapshot?.status ?? { installed: true, signedIn: null, detail: "Not checked", overridingKeys: [] }, limits: this.activeLimits(runtime.id) };
    }), this.options.settings?.() ?? { router: [], failoverOrder: [] });
  }

  constructor(
    private store: EventStore,
    private runtimes: Map<string, Runtime>,
    private options: SupervisorOptions,
  ) {
    // Quiet hours end on the clock, not on an event: look at the queue once a minute.
    if (options.settings) setInterval(() => this.pump(), 60_000).unref();
    if (options.settings) this.worktrees.config = () => options.settings!().git;
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

  roomBase(repo: string): { repo: string; base: string } {
    if (!path.isAbsolute(repo)) throw new Error("Choose an absolute repository path");
    const ctx = this.policyFor("", this.options.workspace).ctx;
    const forbidden = [...ctx.protected, ...ctx.sensitive];
    if (forbidden.some(root => within(repo, root))) throw new Error("Repository is in a protected folder");
    const canonical = realpathSync(repo);
    if (forbidden.some(root => within(canonical, root))) throw new Error("Repository resolves into a protected folder");
    const allowed = [ctx.workspace, ...ctx.roots].map(root => { const expanded = root.replace(/^~(?=\/|$)/, os.homedir()); try { return realpathSync(expanded); } catch { return path.resolve(expanded); } });
    if (!allowed.some(root => within(canonical, root))) throw new Error("Repository is outside the configured project roots");
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: canonical, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error("Repository needs an existing commit");
    return { repo: canonical, base };
  }

  launch(spec: LaunchSpec, reservedId?: string): string {
    this.expand(spec.ask);
    const id = reservedId ?? `r_${randomUUID().slice(0, 8)}`;
    if (!/^r_[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid reserved run ID");
    if (this.store.forRun(id).some(e => e.kind === "run.created")) throw new Error("Run already exists");
    const member = spec.member ? this.options.crew?.get(spec.member) : undefined;
    if (member) spec = { ...spec, runtime: spec.runtime ?? (member.runtime && this.runtimes.has(member.runtime) ? member.runtime : undefined), model: spec.model ?? member.model };
    // Auto and Spark use one routing policy. Explicit choices and crew-member defaults stay explicit.
    if (!member && !spec.runtime && !spec.model) {
      const rule = this.options.settings ? matchRoute(this.options.settings().router, spec.ask) : undefined;
      const choice = this.intelligence({ ask: spec.ask, mode: "auto", purpose: spec.labels?.includes("buddy") ? "conversation" : "work", images: false, tier: "balanced" });
      if (choice.runtime) spec = { ...spec, runtime: choice.runtime, model: choice.model };
      else if ([...this.runtimes.keys()].some(id => id !== "mock")) throw new Error(choice.reason);
      else if (rule) spec = { ...spec, model: rule.model || undefined }; // scripted demo fixtures have no real model catalogue
      if (rule) spec = { ...spec, effort: spec.effort || rule.effort || undefined, labels: [...(spec.labels ?? []), `rule:${rule.name}`] };
    }
    const runtime = spec.runtime ?? this.defaultRuntime();
    this.rec(
      "run.created",
      {
        title: spec.title ?? titleFrom(spec.ask),
        ask: spec.ask,
        project: spec.project,
        repo: spec.repo,
        baseCommit: spec.baseCommit,
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

  editFollowup(run: string, id: string, text: string, expectedText: string): void {
    const pending = this.unanswered(run, true).find((f) => f.id === id);
    if (!pending) throw new Error("That message has already started or was withdrawn. Your edit has not been sent.");
    if (pending.text !== expectedText) throw new Error("That queued message changed. Cancel this edit and reopen it to see the latest text.");
    if (!text.trim()) throw new Error("empty message");
    this.expand(text);
    this.rec("run.followup.edited", { id, text: text.trim() }, { run });
  }

  reorderFollowups(run: string, ids: string[]): void {
    const pending = this.unanswered(run, true);
    if (!pending.length || ids.length !== pending.length || new Set(ids).size !== ids.length || pending.some((f) => !f.id || !ids.includes(f.id))) {
      throw new Error("The queue changed. Try again with the current messages.");
    }
    this.rec("run.followups.reordered", { ids }, { run });
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
      if (this.active.has(run.id)) continue;
      if (this.options.canStart && !this.options.canStart(run.id)) continue;
      // Quiet hours: automation waits in the queue and starts when they end (nothing is dropped).
      const quiet = this.options.settings?.().quietHours;
      if (quiet && run.labels.some((l) => l === "schedule" || l === "webhook" || l === "heartbeat") && inQuietHours(quiet)) continue;
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
    // Session cap (minutes): stops only this stretch of work, and only if it's still this one.
    const maxMinutes = this.options.settings?.().caps.maxMinutes;
    if (maxMinutes) {
      const timer = setTimeout(() => { if (this.active.get(runId) === controller && !controller.signal.aborted) this.cancel(runId, `Stopped at your ${maxMinutes}-minute session cap (Settings → Agents). Send a follow-up to continue.`); }, maxMinutes * 60_000);
      timer.unref?.();
      controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    }
    const ready = () => {
      if (controller.signal.aborted || this.halted) { this.active.delete(runId); return false; }
      if (this.options.canStart && !this.options.canStart(runId)) { this.active.delete(runId); return false; }
      return true;
    };
    if (!runtime) {
      this.setStatus(runId, "failed", `no runtime called ${runtimeId}`);
      this.active.delete(runId);
      return;
    }

    let cwd = this.options.workspace;
    try {
      if (spec.labels.includes("crew-room")) {
        const status = await runtime.status();
        if (!status.installed || status.signedIn === false || status.overridingKeys.length) throw new Error("Room provider unavailable; connect its subscription without API-key overrides");
        if (!ready()) return;
      }
      // A task's steps share the task's worktree, so each step builds on the last.
      const parentTree = spec.parent && !spec.labels.includes("crew-room") ? this.store.forRun(spec.parent).find((e) => e.kind === "run.worktree") : undefined;
      if (parentTree?.kind === "run.worktree") {
        cwd = parentTree.body.path;
      } else if (spec.repo && spec.labels.includes("in-place")) {
        cwd = spec.repo;
      } else if (spec.repo) {
        const existing = this.store.forRun(runId).find((e) => e.kind === "run.worktree");
        if (existing && existing.kind === "run.worktree") {
          cwd = existing.body.path;
        } else {
          const tree = await this.worktrees.create(spec.repo, runId, spec.baseCommit ?? spec.forkOf?.commit);
          cwd = tree.path;
          this.rec("run.worktree", tree, { run: runId });
        }
      } else if (spec.labels.includes("crew-room")) {
        cwd = path.join(this.options.workspace, "rooms", runId);
        mkdirSync(cwd, { recursive: true });
      }
    } catch (error) {
      if (controller.signal.aborted || this.halted) { this.active.delete(runId); return; }
      this.setStatus(runId, "failed", `could not prepare run: ${(error as Error).message}`);
      this.active.delete(runId);
      return;
    }

    if (!ready()) return;
    this.setStatus(runId, "running");
    const turn = this.turns(runId) + 1;
    const spoken = this.currentAsk(runId, spec.ask);
    const ask = this.expand(spoken);
    this.rec("turn.started", { turn, text: spoken, by: "you" }, { run: runId });
    const started = Date.now();
    const attemptSeq = this.store.head;
    const policy = this.policyFor(runId, cwd);
    // A conversation id only means something to the runtime that owns it. A run that moved to
    // another agent starts a fresh conversation there, with a recap of the work so far.
    const resume = this.backendSession(runId, runtime.id);
    const moved = !resume && turn > 1;
    const model = this.pickModel(runtime.id, this.modelFor(runId, runtime.id, spec.model));
    // Spark's turns are conversation, not engineering: lean, so it starts talking fast.
    const lean = spec.labels.includes("buddy");
    const run: RunSpec = {
      lean,
      id: runId,
      // A fork's first turn carries the conversation it branched from; a moved run gets a recap.
      ask: moved ? `${this.recap(runId)}\n\n---\n\n${ask}` : spec.forkOf && turn === 1 ? `${spec.ask}\n\n---\n\n${ask}` : ask,
      cwd,
      model,
      effort: spec.effort,
      resume,
      agents: lean || spec.labels.includes("crew-room") ? undefined : this.options.crew?.agentsFor?.(runtime.id, spec.member),
      disableNativeAgents: lean || spec.labels.includes("crew-room"),
      // A resumed conversation already has its lessons; only a fresh one is told.
      system: resume || lean ? undefined : [this.options.settings ? standingInstructions(this.options.settings(), spec.repo) : undefined, spec.member ? this.options.crew?.persona(spec.member) : undefined, spec.venture ? this.options.ventureBrief?.(spec.venture) : undefined, this.options.memory?.systemFor(runId, ask, { skills: !this.options.plugins?.(runtime.id)?.length }), this.options.toolHint, this.options.runHint?.(runId)].filter(Boolean).join("\n\n") || undefined,
      mcpServers: lean ? undefined : this.options.mcpServers?.(runtime.id, runId),
      plugins: lean ? undefined : this.options.plugins?.(runtime.id),
    };
    this.rememberPrompt(runId, { at: Date.now(), turn, runtime: runtime.id, model, effort: spec.effort, resumed: Boolean(resume), system: run.system ?? "", ask: run.ask, tools: Object.keys((run.mcpServers ?? {}) as object) });

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
                accounting: event.accounting,
                contextUsed: event.contextUsed,
                contextLimit: event.contextLimit,
              },
              { run: runId },
            );
            {
              const maxTokens = this.options.settings?.().caps.maxTokens;
              if (maxTokens && this.active.get(runId) === controller) {
                const used = this.store.forRun(runId).reduce((n, e) => n + (e.kind === "usage.recorded" ? e.body.inputTokens + e.body.outputTokens : 0), 0);
                if (used > maxTokens) this.cancel(runId, `Stopped at your ${maxTokens.toLocaleString()}-token session cap (Settings → Agents). Send a follow-up to continue.`);
              }
            }
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
            this.confirmRecovery(runtime.id, model, attemptSeq);
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
    // Some providers return a reset already in the past. Never turn that into a tight retry loop.
    until = Number.isFinite(until) && until > Date.now() ? Math.max(until, Date.now() + 1000) : Date.now() + 30_000;
    this.rec("runtime.limited", { runtime, model, until, message, credits });
    this.scheduleResume(runtime, until, model);
    // Moves are capped, so a run never bounces between limits forever; past that it waits.
    const moves = this.store.forRun(run).filter((e) => e.kind === "run.routed" && / is out until | needs usage credits /.test(e.body.reason)).length;
    const created = this.store.forRun(run).find((e) => e.kind === "run.created");
    const launched = created?.kind === "run.created" ? created.body.model : undefined;
    if (created?.kind === "run.created" && created.body.labels.includes("crew-room")) {
      this.setStatus(run, "paused", `${runtime} usage window — resumes ${when(until)}; room provider stays unchanged`);
      this.scheduleResume(runtime, until, model);
      return;
    }
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
        ? failoverCandidates(this.options.settings?.().failoverOrder ?? [], [...this.runtimes.keys()].filter((r) => r !== "mock" && r !== "local") /* the local model has no tools: never hand it crew work */, runtime).find((r) => this.limitedUntil(r) < Date.now() && !this.allModelsLimited(r))
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
    const generation = this.unresolvedLimits(runtime).find(l => l.model === model)?.seq;
    clearTimeout(this.resumeTimers.get(key));
    const timer = setTimeout(() => {
      this.resumeTimers.delete(key);
      const latest = this.unresolvedLimits(runtime).find(l => l.model === model);
      if (!latest) return;
      if (latest.seq !== generation || latest.until > Date.now()) { this.scheduleResume(runtime, latest.until, model); return; }
      this.restore(runtime, model, generation);
    }, Math.min(Math.max(0, until - Date.now()), 86_400_000));
    timer.unref?.(); this.resumeTimers.set(key, timer);
  }

  /** A reset or manual retry makes a restriction eligible to try; only a completed response confirms recovery. */
  restore(runtime: string, model?: string, limitSeq?: number): void {
    const limits = this.unresolvedLimits(runtime).filter(l => limitSeq !== undefined ? l.seq === limitSeq : model === undefined || l.model === model);
    for (const l of limits) {
      if (!this.isRetrying(l.seq)) this.rec("runtime.retrying", { runtime, model: l.model, limitSeq: l.seq });
      const key = l.model ? `${runtime}:${l.model}` : runtime;
      clearTimeout(this.resumeTimers.get(key)); this.resumeTimers.delete(key);
    }
    for (const run of this.projectRuns()) {
      if (run.status !== "paused" || this.currentRuntime(run.id, run.runtime) !== runtime) continue;
      const wanted = this.modelFor(run.id, runtime, run.model);
      if (model && wanted !== model) continue;
      if (this.limitedUntil(runtime, wanted) > Date.now()) continue;
      this.setStatus(run.id, "queued", "retrying provider — availability unconfirmed");
    }
    this.pump();
  }

  private isRetrying(seq: number): boolean {
    return this.store.ofKinds("runtime.retrying", seq).some(e => e.kind === "runtime.retrying" && e.body.limitSeq === seq);
  }

  private unresolvedLimits(runtime: string): Array<{ seq: number; model?: string; until: number }> {
    const limits = new Map<string, { seq: number; model?: string; until: number }>();
    for (const e of this.store.ofKinds("runtime.limited")) {
      if (e.kind === "runtime.limited" && e.body.runtime === runtime) limits.set(e.body.model ?? "*", { seq: e.seq, model: e.body.model, until: e.body.until });
    }
    return [...limits.values()].filter(l => !this.store.ofKinds("runtime.restored", l.seq).some(e => e.kind === "runtime.restored" && e.body.runtime === runtime &&
      (e.body.limitSeq !== undefined ? e.body.limitSeq === l.seq : !e.body.model || e.body.model === l.model)));
  }

  private activeLimits(runtime: string): Array<{ model?: string; until: number }> {
    return this.unresolvedLimits(runtime).filter(l => l.until > Date.now() && !this.isRetrying(l.seq));
  }

  private confirmRecovery(runtime: string, model: string | undefined, attemptSeq: number): void {
    for (const l of this.unresolvedLimits(runtime)) {
      if (l.seq <= attemptSeq && (!l.model || l.model === model)) this.rec("runtime.restored", { runtime, model: l.model, limitSeq: l.seq });
    }
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
    const settings = this.options.settings?.();
    // Your protected folders are added to the built-in ones; they can never remove them.
    const ctx = defaultContext(workspace, {
      roots: this.options.roots ?? ["~/Developer"],
      protected: [...(this.options.protectedFolders ?? []), ...(settings?.protectedPaths ?? [])],
      ...(settings ? { protectedBranches: [...new Set(["main", "master", ...settings.git.protectedBranches])] } : {}),
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
    const created = this.store.forRun(run).find(e => e.kind === "run.created");
    if (created?.kind === "run.created" && created.body.labels.includes("crew-room") && /^(Agent|Task|spawn_agent|collabAgentToolCall)$/i.test(tool)) {
      this.rec("policy.decided", { tool, verdict: "deny", rule: "room-delegation-only", layer: "room", reason: "Use tracked crew delegation; native child agents are disabled" }, { run });
      return { allow: false, reason: "Use tracked crew delegation; native child agents are disabled" };
    }
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
        input: structuredClone(input),
        risk: decision.risk,
        resolve: (answer) => {
          clearTimeout(timeout);
          try {
            if (this.status(run) === "awaiting_approval" && ![...this.waiting.values()].some((w) => w.run === run)) this.setStatus(run, "running");
          } finally {
            // approval.decided is already durable. A secondary status error must not strand
            // the provider after its waiter and timeout have been consumed.
            resolve(answer);
          }
        },
      });
    });
  }

  /** Cycle this session: ask stops for approval, auto lets those through. A deny still wins. */
  setPermission(run: string, mode: "ask" | "auto"): void {
    if (mode === "auto" && this.store.forRun(run).some(e => e.kind === "run.created" && e.body.labels.includes("crew-room"))) throw new Error("Crew rooms must remain supervised");
    if (!this.status(run) && !this.store.forRun(run).some((e) => e.kind === "run.created")) throw new Error(`no run ${run}`);
    this.rec("run.permission", { mode }, { run });
    if (mode === "auto") {
      this.approveAll.add(run);
      for (const [id, wait] of this.waiting) if (wait.run === run) this.decideApproval(id, true, "you (autopilot)");
    } else this.approveAll.delete(run);
  }

  /** A person (or a timeout) answers an approval. Returns false when nothing was waiting. */
  decideApproval(id: string, allow: boolean, by = "you", always = false, comment?: string): boolean {
    if (this.halted) return false;
    const wait = this.waiting.get(id);
    const known = wait ?? this.pendingFromLog(id);
    if (!known) return false;
    if (wait) this.waiting.delete(id);
    try {
      this.store.append("approval.decided", { id, allow, by, always: always && allow, comment }, { run: known.run });
    } catch (error) {
      if (wait) this.waiting.set(id, wait);
      throw error;
    }
    if (wait) {
      wait.resolve({ allow, reason: allow ? `${by} allowed it` : comment ? `${by} said no: ${comment}` : `${by} said no` });
    }
    return true;
  }

  /** A detached copy from the live waiter, never historical audit state. */
  liveApproval(id: string): { run: string; tool: string; input: unknown; risk: Waiting["risk"] } | undefined {
    if (this.halted) return undefined;
    const wait = this.waiting.get(id);
    return wait ? { run: wait.run, tool: wait.tool, input: structuredClone(wait.input), risk: wait.risk } : undefined;
  }

  /** Synchronous compare-and-consume for remotely signed, single-use decisions. */
  decideLiveApproval(id: string, expectedRun: string, expectedDigest: string, allow: boolean, by: string, commandId: string): boolean {
    if (this.halted) return false;
    const wait = this.waiting.get(id);
    if (!wait || wait.run !== expectedRun || inputDigest(wait.input) !== expectedDigest) return false;
    // Reserve before append: synchronous event listeners must not consume this waiter twice.
    this.waiting.delete(id);
    try {
      this.store.append("approval.decided", { id, allow, by, always: false, mobileCommandId: commandId }, { run: wait.run });
    } catch (error) {
      this.waiting.set(id, wait);
      throw error;
    }
    wait.resolve({ allow, reason: `${by} ${allow ? "allowed" : "denied"} this request` });
    return true;
  }

  private pendingFromLog(id: string): { run: string } | undefined {
    const asked = this.store.ofKinds("approval.requested").find((e) => e.kind === "approval.requested" && e.body.id === id);
    const decided = this.store.ofKinds("approval.decided").some((e) => e.kind === "approval.decided" && e.body.id === id);
    return asked && !decided && asked.run ? { run: asked.run } : undefined;
  }

  // ── follow-ups ──────────────────────────────────────────────────────────────────────

  /** Send another message to a run: a new turn in the same runtime conversation. */
  isActive(run: string): boolean { return this.active.has(run); }

  followUp(run: string, text: string, by = "you", requestId?: string): string {
    const created = this.store.forRun(run).find(e => e.kind === "run.created");
    if (created?.kind === "run.created" && created.body.labels.includes("crew-room")) throw new Error("Continue this conversation in its crew room, not the source session.");
    return this.enqueueFollowUp(run, text, by, requestId);
  }

  /** Only a durably authorized coordinator summary can resume a room conversation. */
  roomSummary(run: string, text: string, requestId: string): string {
    const authorized = this.store.ofKinds("room.summary-requested").findLast(e => e.kind === "room.summary-requested" && e.body.runId === run && `room-summary:${e.body.requestId}` === requestId);
    if (!authorized || authorized.kind !== "room.summary-requested") throw new Error("Room summary is not authorized");
    const latest = this.store.ofKinds("room.turn").findLast(e => e.kind === "room.turn" && e.body.room === authorized.body.room);
    if (latest?.kind !== "room.turn" || latest.body.runId !== run) throw new Error("Stale room summary");
    return this.enqueueFollowUp(run, text, "crew results", requestId);
  }

  private enqueueFollowUp(run: string, text: string, by: string, requestId?: string): string {
    if (!this.status(run)) throw new Error(`no run ${run}`);
    this.expand(text);
    const id = requestId ?? `f_${randomUUID().slice(0, 8)}`;
    const previous = this.store.forRun(run).find(e => e.kind === "run.followup" && e.body.id === id);
    if (previous?.kind === "run.followup") {
      if (previous.body.text !== text || previous.body.by !== by) throw new Error("Follow-up request conflict");
      // Recover only a message no turn has consumed, never an interrupted turn.
      if (!this.active.has(run) && ["done", "reviewing", "merged"].includes(this.status(run)!) && this.unanswered(run, true).some(f => f.id === id)) {
        this.setStatus(run, "queued", "persisted follow-up awaiting its first turn"); this.pump();
      }
      return id;
    }
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
    const pending = queuedMessages(this.store.forRun(run));
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
    if (status === "done" || status === "failed") this.runHook(run, status);
  }

  /** The last 50 prompts exactly as sent — in memory only, gone on restart (Developer → Prompt inspector). */
  private prompts = new Map<string, Array<{ at: number; turn: number; runtime: string; model?: string; effort?: string; resumed: boolean; system: string; ask: string; tools: string[] }>>();
  private rememberPrompt(run: string, p: { at: number; turn: number; runtime: string; model?: string; effort?: string; resumed: boolean; system: string; ask: string; tools: string[] }) {
    const list = this.prompts.get(run) ?? [];
    list.push(p); this.prompts.delete(run); this.prompts.set(run, list.slice(-10));
    while (this.prompts.size > 50) this.prompts.delete(this.prompts.keys().next().value!);
  }
  promptsFor(run: string) { return this.prompts.get(run) ?? []; }
  promptRuns() { return [...this.prompts.keys()].reverse(); }

  /** Settings → Automation hooks: your command, for sessions you started (not delegated steps). */
  private runHook(run: string, status: "done" | "failed"): void {
    const hooks = this.options.settings?.().hooks, command = status === "done" ? hooks?.onDone : hooks?.onFailed;
    if (!command?.trim()) return;
    const created = this.store.forRun(run).find((e) => e.kind === "run.created");
    if (!created || created.kind !== "run.created" || created.body.parent || created.body.labels.includes("held")) return;
    execFile("/bin/sh", ["-c", command], { cwd: this.options.workspace, timeout: 60_000, env: { ...process.env, SHUA_RUN_ID: run, SHUA_STATUS: status, SHUA_TITLE: created.body.title, SHUA_REPO: created.body.repo ?? "" } },
      (error) => { if (error) console.error(`hook (${status}) for ${run} failed: ${error.message.split("\n")[0]}`); });
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
  private projectRuns(): Array<{ id: string; status: RunStatus; runtime: string; model?: string; priority: number; seq: number; labels: string[] }> {
    const runs = new Map<string, { id: string; status: RunStatus; runtime: string; model?: string; priority: number; seq: number; labels: string[] }>();
    const held = new Set<string>();
    const visit = (e: AnyEvent) => {
      if (!e.run || held.has(e.run)) return;
      if (e.kind === "run.created" && e.body.labels.includes("held")) {
        held.add(e.run);
        return;
      }
      if (e.kind === "run.created" && !runs.has(e.run)) runs.set(e.run, { id: e.run, status: "queued", runtime: e.body.runtime, model: e.body.model, priority: 0, seq: e.seq, labels: e.body.labels });
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
      const created = this.store.forRun(run.id).find(e => e.kind === "run.created");
      if (created?.kind === "run.created" && created.body.labels.includes("crew-room") && ["running", "planning", "awaiting_approval", "paused"].includes(run.status)) {
        this.cancel(run.id, "Gateway restarted; room work interrupted. Inspect side effects before retrying.");
        this.setStatus(run.id, "failed", "Gateway restarted; room work interrupted. Explicit retry required.");
        continue;
      }
      if (["running", "planning", "awaiting_approval"].includes(run.status)) {
        this.setStatus(run.id, "queued", "gateway restarted — resuming from the last checkpoint");
        resumed.push(run.id);
      }
      if (run.status === "paused") {
        const agent = this.currentRuntime(run.id, run.runtime);
        const limits = this.unresolvedLimits(agent);
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
