/**
 * Projections: the state everyone sees, folded from events.
 *
 * Pure, incremental and dependency-free, so the gateway and the browser run the *same* code:
 * the dashboard applies each streamed event to its local state, and time travel is folding the
 * events up to a chosen sequence number. Nothing here stores anything of its own.
 */
import type { AnyEvent, RunStatus } from "./events.js";

export interface RunView {
  id: string;
  title: string;
  ask: string;
  project?: string;
  repo?: string;
  runtime: string;
  model?: string;
  effort?: string;
  parent?: string;
  labels: string[];
  incognito: boolean;
  status: RunStatus;
  statusReason?: string;
  /** ask stops for approval; auto lets those through. Deny rules still win. */
  permission: "ask" | "auto";
  createdAt: number;
  updatedAt: number;
  priority: number;
  turns: number;
  /** The newest line the agent wrote — the card's ticker. */
  ticker: string;
  /** The raw end of the text stream, kept so chunks join correctly; the ticker is derived from it. */
  tail: string;
  /** The tool running right now, if any — the card's chip. */
  currentTool?: string;
  toolCalls: number;
  failedTools: number;
  files: string[];
  checks: Array<{ command: string; passed: boolean; seq: number }>;
  pendingApprovals: string[];
  /** Lesson ids this run was given. The text lives in memory. */
  lessons: string[];
  subagents: Array<{ id: string; name: string; task: string; done: boolean; ok?: boolean }>;
  checkpoints: Array<{ seq: number; turn: number; commit?: string }>;
  worktree?: { path: string; branch: string; base: string };
  review?: { comments: number; decided?: boolean; approved?: boolean; queued?: number; landed?: string; failed?: string; pr?: string };
  usage: { inputTokens: number; outputTokens: number; costUsd: number; contextUsed?: number; contextLimit?: number };
  lastSeq: number;
}

export interface ApprovalView {
  id: string;
  run: string | null;
  tool: string;
  input: unknown;
  risk: string;
  reason: string;
  rule: string;
  layer?: string;
  at: number;
  seq: number;
}

export interface CrewState {
  head: number;
  runs: Record<string, RunView>;
  approvals: Record<string, ApprovalView>;
  limited: Record<string, { until: number; message: string; credits?: boolean }>;
  today: { day: string; tokens: number; costUsd: number; runs: number };
}

export function emptyState(): CrewState {
  return { head: 0, runs: {}, approvals: {}, limited: {}, today: { day: dayOf(Date.now()), tokens: 0, costUsd: 0, runs: 0 } };
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const ACTIVE: RunStatus[] = ["planning", "running", "awaiting_approval"];

/** Apply one event. Returns the same object mutated — cheap enough to run per streamed event. */
export function apply(state: CrewState, event: AnyEvent): CrewState {
  if (event.seq <= state.head) return state; // replays and reconnect overlaps are idempotent
  state.head = event.seq;
  const run = event.run ? state.runs[event.run] : undefined;
  if (run) {
    run.updatedAt = event.at;
    run.lastSeq = event.seq;
  }

  switch (event.kind) {
    case "run.created": {
      const b = event.body;
      state.runs[event.run ?? ""] = {
        id: event.run ?? "",
        title: b.title,
        ask: b.ask,
        project: b.project,
        repo: b.repo,
        runtime: b.runtime,
        model: b.model,
        effort: b.effort,
        parent: b.parent,
        labels: b.labels,
        incognito: b.incognito,
        status: "queued",
        permission: "ask",
        createdAt: event.at,
        updatedAt: event.at,
        priority: 0,
        turns: 0,
        ticker: "",
        tail: "",
        toolCalls: 0,
        failedTools: 0,
        files: [],
        checks: [],
        pendingApprovals: [],
        lessons: [],
        subagents: [],
        checkpoints: [],
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        lastSeq: event.seq,
      };
      if (dayOf(event.at) === state.today.day) state.today.runs += 1;
      break;
    }
    case "run.status":
      if (run) {
        run.status = event.body.status;
        run.statusReason = event.body.reason;
        if (!ACTIVE.includes(run.status)) run.currentTool = undefined;
      }
      break;
    case "run.permission":
      if (run) run.permission = event.body.mode;
      break;
    case "run.worktree":
      if (run) run.worktree = event.body;
      break;
    case "run.routed":
      if (run) {
        run.runtime = event.body.runtime;
        run.model = event.body.model; // a new runtime means that runtime's model, not the old one's
        run.effort = event.body.effort ?? run.effort;
      }
      break;
    case "run.archived":
      if (event.run) delete state.runs[event.run];
      break;
    case "run.priority":
      if (run) run.priority = event.body.priority;
      break;
    case "turn.started":
      if (run) {
        run.turns = Math.max(run.turns, event.body.turn);
        run.ticker = "";
        run.tail = "";
      }
      break;
    case "agent.delta":
      // Chunks end mid-sentence (keep the space) or on a newline (keep the line before it).
      if (run) {
        run.tail = (run.tail + event.body.text).slice(-600);
        run.ticker = lastLine(run.tail);
      }
      break;
    case "agent.message":
      if (run) {
        run.tail = "";
        run.ticker = lastLine(event.body.text);
      }
      break;
    case "tool.called":
      if (run) {
        run.toolCalls += 1;
        run.currentTool = event.body.tool;
      }
      break;
    case "tool.returned":
      if (run) {
        run.currentTool = undefined;
        if (!event.body.ok) run.failedTools += 1;
      }
      break;
    case "file.changed":
      if (run && !run.files.includes(event.body.path)) run.files.push(event.body.path);
      break;
    case "check.ran":
      if (run) run.checks.push({ command: event.body.command, passed: event.body.exitCode === 0, seq: event.seq });
      break;
    case "subagent.started":
      if (run) run.subagents.push({ id: event.body.id, name: event.body.name, task: event.body.task, done: false });
      break;
    case "subagent.finished":
      if (run) {
        const sub = run.subagents.find((s) => s.id === event.body.id);
        if (sub) {
          sub.done = true;
          sub.ok = event.body.ok;
        }
      }
      break;
    case "checkpoint.created":
      if (run) run.checkpoints.push({ seq: event.seq, turn: event.body.turn, commit: event.body.commit });
      break;
    case "approval.requested":
      state.approvals[event.body.id] = {
        id: event.body.id,
        run: event.run,
        tool: event.body.tool,
        input: event.body.input,
        risk: event.body.risk,
        reason: event.body.reason,
        rule: event.body.rule,
        layer: event.body.layer,
        at: event.at,
        seq: event.seq,
      };
      if (run && !run.pendingApprovals.includes(event.body.id)) run.pendingApprovals.push(event.body.id);
      break;
    case "approval.decided":
      delete state.approvals[event.body.id];
      for (const r of Object.values(state.runs)) {
        r.pendingApprovals = r.pendingApprovals.filter((id) => id !== event.body.id);
      }
      break;
    case "usage.recorded": {
      const b = event.body;
      if (run) {
        run.usage.inputTokens += b.inputTokens;
        run.usage.outputTokens += b.outputTokens;
        run.usage.costUsd += b.costUsd ?? 0;
        if (b.contextUsed !== undefined) run.usage.contextUsed = b.contextUsed;
        if (b.contextLimit !== undefined) run.usage.contextLimit = b.contextLimit;
      }
      const day = dayOf(event.at);
      if (day !== state.today.day) state.today = { day, tokens: 0, costUsd: 0, runs: 0 };
      state.today.tokens += b.inputTokens + b.outputTokens;
      state.today.costUsd += b.costUsd ?? 0;
      break;
    }
    case "review.comment":
      if (run) run.review = { ...(run.review ?? { comments: 0 }), comments: (run.review?.comments ?? 0) + 1 };
      break;
    case "review.decided":
      if (run) run.review = { ...(run.review ?? { comments: 0 }), decided: true, approved: event.body.approve };
      break;
    case "merge.queued":
      if (run) run.review = { ...(run.review ?? { comments: 0 }), queued: event.body.position, failed: undefined };
      break;
    case "merge.landed":
      if (run) run.review = { ...(run.review ?? { comments: 0 }), queued: undefined, landed: event.body.commit };
      break;
    case "pr.opened":
      if (run) run.review = { ...(run.review ?? { comments: 0 }), pr: event.body.url };
      break;
    case "merge.failed":
      if (run) run.review = { ...(run.review ?? { comments: 0 }), queued: undefined, failed: event.body.reason };
      break;
    case "lesson.applied":
      if (run && !run.lessons.includes(event.body.id)) run.lessons.push(event.body.id);
      break;
    case "runtime.limited":
      state.limited[event.body.model ? `${event.body.runtime} · ${event.body.model}` : event.body.runtime] = { until: event.body.until, message: event.body.message, credits: event.body.credits };
      break;
    case "runtime.restored":
      // A restore without a model lifts everything on that agent; with one, just that model.
      for (const key of Object.keys(state.limited)) {
        if (event.body.model ? key === `${event.body.runtime} · ${event.body.model}` : key === event.body.runtime || key.startsWith(`${event.body.runtime} · `)) delete state.limited[key];
      }
      break;
    default:
      break;
  }
  return state;
}

export function fold(events: Iterable<AnyEvent>, until = Number.POSITIVE_INFINITY): CrewState {
  const state = emptyState();
  for (const event of events) {
    if (event.seq > until) break;
    apply(state, event);
  }
  return state;
}

/** The last line with something on it — a trailing newline doesn't blank the ticker. */
function lastLine(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim());
  return (lines[lines.length - 1] ?? "").slice(-240);
}

/** Board columns, as the person thinks about work. */
export const COLUMNS: Array<{ id: string; title: string; statuses: RunStatus[] }> = [
  { id: "queued", title: "Queued", statuses: ["queued", "paused"] },
  { id: "running", title: "Running", statuses: ["planning", "running"] },
  { id: "awaiting", title: "Awaiting me", statuses: ["awaiting_approval"] },
  { id: "reviewing", title: "Reviewing", statuses: ["reviewing"] },
  { id: "done", title: "Done", statuses: ["merged", "done", "failed", "cancelled"] },
];

export function isLive(run: RunView): boolean {
  return ACTIVE.includes(run.status);
}
