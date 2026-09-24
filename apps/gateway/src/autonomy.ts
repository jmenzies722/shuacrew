/**
 * Work that runs while you don't: schedules, webhooks, heartbeats and TASK.md runs.
 *
 * Everything here is driven by the log. A schedule is `schedule.set` facts; a task's progress is
 * `task.step` facts; a heartbeat's health is `heartbeat.checked` facts. So a gateway restart loses
 * nothing: each piece re-reads its state and carries on — a task resumes at its next unfinished step.
 *
 * Script-only jobs and heartbeats make no model call at all: they wake an agent only when a script
 * says something needs one (exit code 2, or a line starting with ESCALATE:).
 */
import { execFile } from "node:child_process";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { parseCadence, type AnyEvent } from "@shuacrew/core";
import { Cron } from "croner";
import type { Supervisor } from "./runs.js";
import type { EventStore } from "./store.js";

const exec = promisify(execFile);

async function shell(command: string, cwd: string, timeoutMs = 10 * 60_000): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await exec("/bin/sh", ["-c", command], { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
    return { code: 0, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const e = error as { code?: number | string; stdout?: string; stderr?: string; message: string };
    return { code: typeof e.code === "number" ? e.code : 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() || e.message };
  }
}

// ── schedules ──────────────────────────────────────────────────────────────────────────────

export interface ScheduleView {
  id: string;
  name: string;
  cron: string;
  timezone?: string;
  ask?: string;
  script?: string;
  project?: string;
  runtime?: string;
  paused: boolean;
  lastFired?: number;
  lastOk?: boolean;
  lastRun?: string;
  next: number[];
}

export class Scheduler {
  private jobs = new Map<string, Cron>();

  constructor(
    private store: EventStore,
    private supervisor: Supervisor,
    private workspace: string,
  ) {}

  /** Add or change a schedule from words or cron. Throws with an example on anything unreadable. */
  set(input: { id?: string; name?: string; when: string; ask?: string; script?: string; project?: string; runtime?: string; paused?: boolean }): ScheduleView {
    const cadence = parseCadence(input.when);
    new Cron(cadence.cron, { timezone: cadence.timezone, paused: true }).stop(); // validates, including the timezone
    if (!input.ask?.trim() && !input.script?.trim()) throw new Error("a schedule needs an ask for an agent, or a script");
    const id = input.id ?? `s_${randomUUID().slice(0, 8)}`;
    this.store.append("schedule.set", {
      id,
      name: input.name ?? (input.ask ?? input.script ?? "").split("\n")[0]!.slice(0, 60),
      cron: cadence.cron,
      timezone: cadence.timezone,
      ask: input.ask,
      script: input.script,
      project: input.project,
      runtime: input.runtime,
      paused: input.paused ?? false,
    });
    this.sync();
    return this.list().find((s) => s.id === id)!;
  }

  remove(id: string): void {
    this.store.append("schedule.removed", { id });
    this.sync();
  }

  list(): ScheduleView[] {
    const views = new Map<string, ScheduleView>();
    for (const e of this.store.read(0)) {
      if (e.kind === "schedule.set") {
        const prior = views.get(e.body.id);
        const merged = { ...prior, ...Object.fromEntries(Object.entries(e.body).filter(([, v]) => v !== undefined)) } as ScheduleView;
        merged.paused = e.body.paused ?? prior?.paused ?? false;
        views.set(e.body.id, merged);
      } else if (e.kind === "schedule.removed") views.delete(e.body.id);
      else if (e.kind === "schedule.fired") {
        const view = views.get(e.body.id);
        if (view) Object.assign(view, { lastFired: e.at, lastOk: e.body.ok, lastRun: e.body.run });
      }
    }
    return [...views.values()].map((view) => ({ ...view, next: this.preview(view.cron, view.timezone, 5) }));
  }

  preview(cron: string, timezone?: string, count = 5): number[] {
    try {
      return new Cron(cron, { timezone, paused: true }).nextRuns(count).map((d) => d.getTime());
    } catch {
      return [];
    }
  }

  /** Make the running cron jobs match the log. */
  sync(): void {
    const wanted = new Map(this.list().filter((s) => !s.paused).map((s) => [s.id, s]));
    for (const [id, job] of this.jobs) {
      if (!wanted.has(id)) {
        job.stop();
        this.jobs.delete(id);
      }
    }
    for (const schedule of wanted.values()) {
      this.jobs.get(schedule.id)?.stop();
      this.jobs.set(schedule.id, new Cron(schedule.cron, { timezone: schedule.timezone, protect: true }, () => void this.fire(schedule.id)));
    }
  }

  async fire(id: string): Promise<string | undefined> {
    const schedule = this.list().find((s) => s.id === id);
    if (!schedule) return undefined;
    if (schedule.script) {
      const result = await shell(schedule.script, this.workspace);
      const escalate = result.code === 2 || /^ESCALATE:/m.test(result.output);
      if (!escalate || !schedule.ask) {
        this.store.append("schedule.fired", { id, ok: result.code === 0 || result.code === 2 });
        return undefined; // no model call: nothing needed an agent
      }
      const run = this.supervisor.launch({
        ask: `${schedule.ask}\n\nThe scheduled check "${schedule.name}" reported:\n${result.output.slice(0, 4000)}`,
        runtime: schedule.runtime,
        repo: schedule.project,
        labels: ["schedule", schedule.id],
      });
      this.store.append("schedule.fired", { id, run, ok: true });
      return run;
    }
    const run = this.supervisor.launch({ ask: schedule.ask!, runtime: schedule.runtime, repo: schedule.project, labels: ["schedule", schedule.id] });
    this.store.append("schedule.fired", { id, run, ok: true });
    return run;
  }

  stop(): void {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }
}

// ── webhooks ───────────────────────────────────────────────────────────────────────────────

/**
 * Authenticated webhooks: HMAC-SHA256 over `${timestamp}.${body}` with a per-hook secret, and a
 * ±300s window against replays. Secrets live in a 0600 file — never in the log, never in the UI
 * after creation.
 */
export class Webhooks {
  constructor(
    private store: EventStore,
    private supervisor: Supervisor,
    private secretsFile: string,
  ) {}

  private secrets(): Record<string, string> {
    try {
      return JSON.parse(readFileSync(this.secretsFile, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  /** Create a hook. The secret is returned once, here, and never again. */
  create(input: { name: string; ask: string; project?: string; runtime?: string }): { id: string; secret: string } {
    const id = `h_${randomUUID().slice(0, 8)}`;
    const secret = randomBytes(24).toString("base64url");
    writeFileSync(this.secretsFile, JSON.stringify({ ...this.secrets(), [id]: secret }, null, 2), { mode: 0o600 });
    this.store.append("webhook.set", { id, name: input.name, ask: input.ask, project: input.project, runtime: input.runtime, paused: false });
    return { id, secret };
  }

  remove(id: string): void {
    const secrets = this.secrets();
    delete secrets[id];
    writeFileSync(this.secretsFile, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    this.store.append("webhook.removed", { id });
  }

  list(): Array<{ id: string; name: string; ask: string; project?: string; runtime?: string; received: number; lastAt?: number }> {
    const hooks = new Map<string, { id: string; name: string; ask: string; project?: string; runtime?: string; received: number; lastAt?: number }>();
    for (const e of this.store.read(0)) {
      if (e.kind === "webhook.set") hooks.set(e.body.id, { ...e.body, received: hooks.get(e.body.id)?.received ?? 0 });
      if (e.kind === "webhook.removed") hooks.delete(e.body.id);
      if (e.kind === "trigger.received") {
        const hook = hooks.get(e.body.trigger);
        if (hook) Object.assign(hook, { received: hook.received + 1, lastAt: e.at });
      }
    }
    return [...hooks.values()];
  }

  static sign(secret: string, timestamp: string, body: string): string {
    return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  }

  /** Verify and act on a delivery. Returns the run it started, or throws with why it was refused. */
  receive(id: string, headers: { signature?: string; timestamp?: string }, rawBody: string): string {
    const hook = this.list().find((h) => h.id === id);
    const secret = this.secrets()[id];
    if (!hook || !secret) throw Object.assign(new Error("no such webhook"), { status: 404 });
    const timestamp = headers.timestamp ?? "";
    if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      throw Object.assign(new Error("timestamp missing or outside the 5-minute window"), { status: 401 });
    }
    const expected = Buffer.from(Webhooks.sign(secret, timestamp, rawBody));
    const given = Buffer.from(headers.signature ?? "");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw Object.assign(new Error("bad signature"), { status: 401 });
    }
    let payload: unknown = rawBody;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      /* plain text is fine */
    }
    this.store.append("trigger.received", { trigger: id, source: "webhook", payload: clip(payload) });
    return this.supervisor.launch({
      ask: `${hook.ask}\n\nWebhook "${hook.name}" delivered:\n${JSON.stringify(payload, null, 2).slice(0, 6000)}`,
      runtime: hook.runtime,
      repo: hook.project,
      labels: ["webhook", id],
    });
  }
}

function clip(value: unknown): unknown {
  const text = JSON.stringify(value);
  return text.length > 8000 ? { truncated: text.slice(0, 8000) } : value;
}

// ── heartbeats ─────────────────────────────────────────────────────────────────────────────

/** A command checked on an interval — no model call. After `threshold` failures in a row it wakes
 * an agent once (if it has an ask), then stays quiet until the check recovers. */
export class Heartbeats {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private store: EventStore,
    private supervisor: Supervisor,
    private workspace: string,
  ) {}

  set(input: { id?: string; name: string; command: string; everyMinutes: number; threshold?: number; ask?: string; paused?: boolean }): string {
    const id = input.id ?? `b_${randomUUID().slice(0, 8)}`;
    this.store.append("heartbeat.set", { id, name: input.name, command: input.command, everyMinutes: input.everyMinutes, threshold: input.threshold ?? 2, ask: input.ask, paused: input.paused ?? false });
    this.sync();
    return id;
  }

  remove(id: string): void {
    this.store.append("heartbeat.removed", { id });
    this.sync();
  }

  list() {
    const beats = new Map<string, { id: string; name: string; command: string; everyMinutes: number; threshold: number; ask?: string; paused: boolean; ok?: boolean; streak: number; detail?: string; checkedAt?: number }>();
    for (const e of this.store.read(0)) {
      if (e.kind === "heartbeat.set") beats.set(e.body.id, { ...e.body, streak: beats.get(e.body.id)?.streak ?? 0 });
      if (e.kind === "heartbeat.removed") beats.delete(e.body.id);
      if (e.kind === "heartbeat.checked") {
        const beat = beats.get(e.body.id);
        if (beat) Object.assign(beat, { ok: e.body.ok, streak: e.body.streak, detail: e.body.detail, checkedAt: e.at });
      }
    }
    return [...beats.values()];
  }

  sync(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    for (const beat of this.list().filter((b) => !b.paused)) {
      const timer = setInterval(() => void this.check(beat.id), beat.everyMinutes * 60_000);
      timer.unref?.();
      this.timers.set(beat.id, timer);
    }
  }

  async check(id: string): Promise<{ ok: boolean; run?: string }> {
    const beat = this.list().find((b) => b.id === id);
    if (!beat) return { ok: false };
    const result = await shell(beat.command, this.workspace, 60_000);
    const ok = result.code === 0;
    const streak = ok ? 0 : beat.streak + 1;
    this.store.append("heartbeat.checked", { id, ok, detail: result.output.slice(0, 500), streak });
    if (!ok && streak === beat.threshold && beat.ask) {
      const run = this.supervisor.launch({ ask: `${beat.ask}\n\nHeartbeat "${beat.name}" has failed ${streak} times in a row:\n${result.output.slice(0, 4000)}`, labels: ["heartbeat", id] });
      return { ok, run };
    }
    return { ok };
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }
}

// ── TASK.md ────────────────────────────────────────────────────────────────────────────────

export interface TaskSpec {
  title: string;
  goal: string;
  steps: string[];
  validate?: string;
}

/** Read a TASK.md: `# Title`, free text (the goal), `## Steps` (a list), `## Validate` (a command). */
export function parseTask(markdown: string): TaskSpec {
  const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? "Task";
  const sections = new Map<string, string>();
  let current = "goal";
  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) current = heading[1]!.trim().toLowerCase();
    else if (!/^#\s/.test(line)) sections.set(current, `${sections.get(current) ?? ""}${line}\n`);
  }
  const steps = (sections.get("steps") ?? sections.get("plan") ?? "")
    .split("\n")
    .map((l) => /^\s*(?:\d+[.)]|[-*])\s+(?:\[[ x]\]\s+)?(.+)$/.exec(l)?.[1]?.trim())
    .filter((s): s is string => Boolean(s));
  const validateBlock = sections.get("validate") ?? sections.get("checks") ?? "";
  const validate = /`([^`]+)`/.exec(validateBlock)?.[1] ?? validateBlock.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("```"));
  return { title, goal: (sections.get("goal") ?? "").trim(), steps, validate: validate?.trim() || undefined };
}

/**
 * Runs a TASK.md: plan (unless the file lists steps), then each step as a child run in the task's
 * own worktree; after each, the validate command. A failing check is retried with its output fed
 * back, at most `maxRetries` times, and the task stops rather than pressing on ("stop if tests
 * fail"). Every passed step is a commit. The same failure three times in a row is a loop: stop.
 */
export class TaskRunner {
  constructor(
    private store: EventStore,
    private supervisor: Supervisor,
  ) {
    store.subscribe((event) => void this.onEvent(event));
  }

  start(input: { markdown: string; repo?: string; runtime?: string; model?: string }): string {
    const spec = parseTask(input.markdown);
    const id = this.supervisor.launch({
      ask: spec.goal || spec.title,
      title: spec.title,
      repo: input.repo,
      runtime: input.runtime,
      model: input.model,
      labels: ["task"],
      hold: true, // the task itself isn't executed; its steps are
    });
    void this.prepare(id, spec, input);
    return id;
  }

  private async prepare(id: string, spec: TaskSpec, input: { repo?: string; runtime?: string; model?: string }): Promise<void> {
    try {
      if (input.repo) {
        const tree = await this.supervisor.worktrees.create(input.repo, id);
        this.store.append("run.worktree", tree, { run: id });
      }
      if (spec.steps.length) {
        this.store.append("task.planned", { steps: spec.steps, validate: spec.validate, maxRetries: 2 }, { run: id });
        this.advance(id);
        return;
      }
      // No steps in the file: a planning run turns the goal into steps.
      this.store.append("run.status", { status: "planning" }, { run: id });
      this.supervisor.launch({
        ask: `Break this task into 2–7 small, sequential, independently checkable steps. Reply with ONLY a numbered list.\n\n# ${spec.title}\n${spec.goal}`,
        parent: id,
        runtime: input.runtime,
        model: input.model,
        labels: ["task-plan"],
      });
      this.pendingValidate.set(id, spec.validate);
    } catch (error) {
      this.store.append("run.status", { status: "failed", reason: (error as Error).message }, { run: id });
    }
  }

  private pendingValidate = new Map<string, string | undefined>();

  private state(id: string) {
    const events = this.store.forRun(id);
    const plan = events.find((e) => e.kind === "task.planned");
    const steps = plan?.kind === "task.planned" ? plan.body : undefined;
    const progress = new Map<number, { status: string; run?: string; retries: number; failures: string[] }>();
    for (const e of events) {
      if (e.kind !== "task.step") continue;
      const p = progress.get(e.body.index) ?? { status: "", retries: 0, failures: [] };
      p.status = e.body.status;
      if (e.body.run) p.run = e.body.run;
      if (e.body.status === "retrying") {
        p.retries += 1;
        p.failures.push(e.body.detail);
      }
      progress.set(e.body.index, p);
    }
    const tree = events.find((e) => e.kind === "run.worktree");
    const status = [...events].reverse().find((e) => e.kind === "run.status");
    return { plan: steps, progress, worktree: tree?.kind === "run.worktree" ? tree.body : undefined, status: status?.kind === "run.status" ? status.body.status : "queued" };
  }

  /** Launch the next unfinished step, or finish the task. */
  private advance(id: string): void {
    const { plan, progress, status } = this.state(id);
    if (!plan || ["done", "failed", "cancelled", "merged", "reviewing"].includes(status)) return;
    const next = plan.steps.findIndex((_, i) => !["passed", "skipped"].includes(progress.get(i)?.status ?? ""));
    if (next === -1) {
      this.store.append("run.status", { status: "reviewing", reason: `all ${plan.steps.length} steps passed` }, { run: id });
      return;
    }
    const created = this.store.forRun(id).find((e) => e.kind === "run.created");
    if (created?.kind !== "run.created") return;
    if (status !== "running") this.store.append("run.status", { status: "running", reason: `step ${next + 1} of ${plan.steps.length}` }, { run: id });
    const run = this.supervisor.launch({
      ask: `You are doing step ${next + 1} of ${plan.steps.length} of the task "${created.body.title}".\n\nGoal: ${created.body.ask}\n\nThis step: ${plan.steps[next]}\n\nDo only this step.${plan.validate ? ` It must leave \`${plan.validate}\` passing.` : ""}`,
      title: `Step ${next + 1} · ${plan.steps[next]}`,
      parent: id,
      repo: created.body.repo,
      runtime: created.body.runtime,
      model: created.body.model,
      labels: ["task-step"],
    });
    this.store.append("task.step", { index: next, status: "started", run }, { run: id });
  }

  private async onEvent(event: AnyEvent): Promise<void> {
    if (event.kind !== "run.status" || !event.run) return;
    const created = this.store.forRun(event.run).find((e) => e.kind === "run.created");
    if (created?.kind !== "run.created" || !created.body.parent) return;
    const task = created.body.parent;
    const finished = ["done", "reviewing", "failed", "cancelled"].includes(event.body.status);
    if (!finished) return;

    if (created.body.labels.includes("task-plan")) {
      const answer = [...this.store.forRun(event.run)].reverse().find((e) => e.kind === "agent.message" && e.body.final);
      const text = answer?.kind === "agent.message" ? answer.body.text : "";
      const steps = parseTask(`## Steps\n${text}`).steps;
      if (!steps.length) {
        this.store.append("run.status", { status: "failed", reason: "the planner didn't return a numbered list of steps" }, { run: task });
        return;
      }
      this.store.append("task.planned", { steps, validate: this.pendingValidate.get(task), maxRetries: 2 }, { run: task });
      this.advance(task);
      return;
    }
    if (!created.body.labels.includes("task-step")) return;
    const { plan, progress, worktree } = this.state(task);
    const index = [...progress.entries()].find(([, p]) => p.run === event.run)?.[0];
    if (!plan || index === undefined) return;
    if (event.body.status === "failed" || event.body.status === "cancelled") {
      this.stop(task, index, `step ${index + 1} ${event.body.status}: ${event.body.reason ?? ""}`);
      return;
    }
    if (!plan.validate) return this.pass(task, index, worktree?.path);
    const result = await shell(plan.validate, worktree?.path ?? process.cwd());
    this.store.append("check.ran", { command: plan.validate, exitCode: result.code, output: result.output.slice(0, 4000) }, { run: task });
    if (result.code === 0) return this.pass(task, index, worktree?.path);

    const p = progress.get(index)!;
    const signature = result.output.slice(-400);
    if (p.failures.filter((f) => f === signature).length >= 2) return this.stop(task, index, "the same failure three times in a row — stopping instead of looping");
    if (p.retries >= plan.maxRetries) return this.stop(task, index, `\`${plan.validate}\` still fails after ${p.retries} retries — stopping (tests must pass before the next step)`);
    this.store.append("task.step", { index, status: "retrying", run: event.run, detail: signature }, { run: task });
    this.supervisor.followUp(event.run, `\`${plan.validate}\` failed after your change:\n\n${result.output.slice(-3000)}\n\nFix it — only this step.`, "task runner");
  }

  private async pass(task: string, index: number, worktree?: string): Promise<void> {
    const commit = worktree ? await this.supervisor.worktrees.checkpoint(worktree, `task step ${index + 1}`).catch(() => undefined) : undefined;
    this.store.append("task.step", { index, status: "passed", detail: commit ?? "" }, { run: task });
    this.store.append("checkpoint.created", { turn: index + 1, commit, note: `step ${index + 1} passed` }, { run: task });
    this.advance(task);
  }

  private stop(task: string, index: number, reason: string): void {
    this.store.append("task.step", { index, status: "failed", detail: reason }, { run: task });
    this.store.append("run.status", { status: "failed", reason }, { run: task });
  }

  /** After a restart: tasks whose current step isn't running get moved along. */
  recover(): void {
    for (const e of this.store.ofKinds("run.created")) {
      if (e.kind !== "run.created" || !e.run || !e.body.labels.includes("task")) continue;
      const { plan, progress, status } = this.state(e.run);
      if (!plan || !["running", "planning"].includes(status)) continue;
      const inFlight = [...progress.values()].some((p) => p.status === "started" || p.status === "retrying");
      if (!inFlight) this.advance(e.run);
    }
  }
}

export function secretsPath(home: string): string {
  return path.join(home, "secrets.json");
}
