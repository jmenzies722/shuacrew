/**
 * Projections: the state everyone sees, folded from events.
 *
 * Pure, incremental and dependency-free, so the gateway and the browser run the *same* code:
 * the dashboard applies each streamed event to its local state, and time travel is folding the
 * events up to a chosen sequence number. Nothing here stores anything of its own.
 */
import type { PhaseDef, PlaybookDef, AnyEvent, RunStatus } from "./events.js";
import type { MemberVoice } from "./voice.js";
import { applyRoomEvent, type RoomView } from "./rooms.js";

export interface RunView {
  id: string;
  /** The crew member doing this work, if any. */
  member?: string;
  /** The venture (startup) this work is for, if any. */
  venture?: string;
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
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null; records?: number; contextUsed?: number; contextLimit?: number };
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

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  persona: string;
  voice?: MemberVoice;
  /** Make this member available as a native Claude subagent. Opt-in. */
  delegatable?: boolean;
  runtime?: string;
  model?: string;
  color: string;
  emoji: string;
  triggers: string[];
  /** Its standing thread: the session you talk to it in. */
  thread?: string;
  sessions: number;
}

export interface ArtifactView {
  id: string;
  title: string;
  kind: "doc" | "page" | "code" | "data" | "image" | "file";
  file: string;
  mime: string;
  size: number;
  summary?: string;
  member?: string;
  run?: string;
  by: "agent" | "you";
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeView {
  id: string;
  title: string;
  source: "file" | "folder" | "note";
  origin?: string;
  files: number;
  chunks: number;
  size: number;
  addedAt: number;
}

export interface PhaseView extends PhaseDef {
  status: "pending" | "running" | "review" | "done" | "failed" | "skipped";
  run?: string;
  runs: string[]; // every run this phase has had (redos keep their history)
  output?: string;
  artifacts: string[];
  note?: string;
}

export type VentureStage = "idea" | "validating" | "building" | "launching" | "earning" | "paused" | "stopped";

export type IncomeKind = "consulting" | "content" | "product" | "sponsorship" | "other";
/** One payment you logged: everything that isn't recurring revenue a venture's Stripe already reports. */
export interface IncomeEntry { id: string; amount: number; currency: string; kind: IncomeKind; venture?: string; note?: string; on: number; at: number }

export interface VentureMetrics {
  at: number;
  source: "stripe" | "manual";
  mode?: "live" | "test";
  currency: string;
  mrr?: number;
  revenue30d?: number;
  customers?: number;
  subscriptions?: number;
}

export interface VentureView {
  automation?: {playbook:string;state:"starting"|"started"|"failed";attemptId:string;error?:string;at:number};
  id: string;
  name: string;
  emoji: string;
  color: string;
  pitch: string;
  customer?: string;
  goal?: string;
  goalMrr?: number;
  repo?: string;
  website?: string;
  autopilot: boolean;
  stage: VentureStage;
  stages: Array<{ stage: VentureStage; at: number; note?: string }>;
  stripe?: { connected: boolean; account?: string; mode?: "live" | "test" };
  metrics?: VentureMetrics; // the latest good reading
  history: VentureMetrics[]; // the last 180 readings, oldest first
  syncError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlayView {
  id: string;
  venture?: string;
  playbook: string;
  name: string;
  emoji: string;
  title: string;
  inputs: Record<string, string>;
  repo?: string;
  status: "running" | "waiting" | "done" | "failed" | "cancelled";
  reason?: string;
  phases: PhaseView[];
  startedAt: number;
  updatedAt: number;
}

export interface SiteView {
  id: string;
  artifact: string;
  venture?: string;
  url: string;
  project: string;
  version: number; // the artifact version that's live
  publishedAt: number;
  signups?: { count: number; at: number; weekAgo?: number };
  signupsError?: string;
}

export interface BriefingView {
  id: string;
  day: string;
  since: number;
  headline: string;
  sections: Array<{ title: string; items: Array<{ text: string; href?: string; tone?: "ok" | "bad" | "wait" | "live" | "idle" }> }>;
  at: number;
}

export interface CrewState {
  rooms: Record<string, RoomView>;
  head: number;
  members: Record<string, CrewMember>;
  artifacts: Record<string, ArtifactView>;
  knowledge: Record<string, KnowledgeView>;
  playbooks: Record<string, PlaybookDef>; // yours; the built-in library is added by the gateway
  plays: Record<string, PlayView>;
  ventures: Record<string, VentureView>;
  income: Record<string, IncomeEntry>;
  briefing?: BriefingView;
  sites: Record<string, SiteView>;
  backup?: { file: string; bytes: number; at: number; error?: string };
  runs: Record<string, RunView>;
  approvals: Record<string, ApprovalView>;
  limited: Record<string, { until: number; message: string; credits?: boolean; seq?: number; retrying?: boolean }>;
  today: { day: string; tokens: number; costUsd: number | null; records?: number; runs: number };
}

export function emptyState(): CrewState {
  return { rooms: {}, head: 0, members: {}, artifacts: {}, knowledge: {}, playbooks: {}, plays: {}, ventures: {}, income: {}, sites: {}, runs: {}, approvals: {}, limited: {}, today: { day: dayOf(Date.now()), tokens: 0, costUsd: null, records: 0, runs: 0 } };
}

/** Titles read as text: pictographic emoji (from older data) are dropped, symbols like ✓ kept. */
export function plainTitle(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * A session's title as shown. Many launchers shorten the ask with a plain slice ("…architecture, UX, performa"); when
 * the title is just the start of the ask cut short, end it at a whole word with an ellipsis. Real titles are untouched.
 */
export function sessionTitle(title: string, ask: string): string {
  // "Shua · what's on my screen…": a launcher's name, then the ask (which can sit after instructions in the prompt).
  const named = /^([^·]{1,40} · )(.+)$/.exec(plainTitle(title)), flat = ask.replace(/\s+/g, " ");
  if (named && flat.includes(named[2]!)) return named[1]! + sessionTitle(named[2]!, flat.slice(flat.lastIndexOf(named[2]!)));
  const t = plainTitle(title), full = plainTitle(ask.replace(/\s+/g, " "));
  if (!t || t.endsWith("…") || full.length <= t.length || !full.startsWith(t)) return t;
  const cutMidWord = /\S/.test(full[t.length] ?? "") && /\S$/.test(t);
  const whole = (cutMidWord ? t.replace(/\s*\S+$/, "") : t).replace(/[\s,;:–—-]+$/, "");
  return `${whole || t}…`;
}

/** The calendar day on this Mac (YYYY-MM-DD): "today" starts at your midnight, the same day Usage and the budget count. */
export function localDay(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const dayOf = localDay;

const ACTIVE: RunStatus[] = ["planning", "running", "awaiting_approval"];

/** Apply one event. Returns the same object mutated — cheap enough to run per streamed event. */
export function apply(state: CrewState, event: AnyEvent): CrewState {
  if (event.seq <= state.head) return state; // replays and reconnect overlaps are idempotent
  state.head = event.seq;
  const currentDay = dayOf(Date.now());
  if (state.today.day !== currentDay) state.today = { day: currentDay, tokens: 0, costUsd: null, records: 0, runs: 0 };
  applyRoomEvent(state.rooms ??= {}, event);
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
        title: b.titleSource ? b.title : sessionTitle(b.title, b.ask),
        ask: b.ask,
        project: b.project,
        repo: b.repo,
        runtime: b.runtime,
        model: b.model,
        effort: b.effort,
        parent: b.parent,
        member: b.member,
        venture: b.venture ?? (b.parent ? state.runs[b.parent]?.venture : undefined),
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
        usage: { inputTokens: 0, outputTokens: 0, costUsd: null, records: 0 },
        lastSeq: event.seq,
      };
      if (dayOf(event.at) === state.today.day) state.today.runs += 1;
      // A member's session: count it, and the one labelled "standing" is the member's thread.
      if (b.member && state.members[b.member]) {
        const m = state.members[b.member]!;
        m.sessions += 1;
        if (b.labels.includes("standing")) m.thread = event.run ?? undefined;
      }
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
    case "crew.member.set": {
      const prev = state.members[event.body.id];
      state.members[event.body.id] = { ...event.body, thread: prev?.thread, sessions: prev?.sessions ?? 0 };
      break;
    }
    case "crew.member.removed":
      delete state.members[event.body.id];
      break;
    case "artifact.saved": {
      const b = event.body;
      const was = state.artifacts[b.id];
      state.artifacts[b.id] = {
        id: b.id, title: b.title, kind: b.kind, file: b.file, mime: b.mime, size: b.size, summary: b.summary,
        member: b.member ?? was?.member, run: event.run ?? was?.run, by: b.by, version: b.version,
        createdAt: was?.createdAt ?? event.at, updatedAt: event.at,
      };
      break;
    }
    case "artifact.removed":
      delete state.artifacts[event.body.id];
      break;
    case "knowledge.added": {
      const b = event.body;
      state.knowledge[b.id] = { id: b.id, title: b.title, source: b.source, origin: b.origin, files: b.files, chunks: b.chunks, size: b.size, addedAt: event.at };
      break;
    }
    case "knowledge.removed":
      delete state.knowledge[event.body.id];
      break;
    case "venture.set": {
      const b = event.body;
      const was = state.ventures[b.id];
      state.ventures[b.id] = {
        ...b,
        stage: was?.stage ?? "idea",
        stages: was?.stages ?? [{ stage: "idea", at: event.at }],
        stripe: was?.stripe,
        metrics: was?.metrics,
        history: was?.history ?? [],
        syncError: was?.syncError,
        automation: was?.automation,
        createdAt: was?.createdAt ?? event.at,
        updatedAt: event.at,
      };
      break;
    }
    case "venture.automation": {
      const v=state.ventures[event.body.id];if(v){const {id:_id,...automation}=event.body;v.automation={...automation,at:event.at};v.updatedAt=event.at;}break;
    }
    case "venture.stage": {
      const v = state.ventures[event.body.id];
      if (!v) break;
      v.stage = event.body.stage;
      v.stages = [...v.stages, { stage: event.body.stage, at: event.at, note: event.body.note }];
      v.updatedAt = event.at;
      break;
    }
    case "venture.removed":
      delete state.ventures[event.body.id];
      break;
    case "income.logged": {
      const { on, ...entry } = event.body;
      state.income[entry.id] = { ...entry, on: on ?? event.at, at: event.at };
      break;
    }
    case "income.removed":
      delete state.income[event.body.id];
      break;
    case "venture.stripe": {
      const v = state.ventures[event.body.id];
      if (!v) break;
      v.stripe = event.body.connected ? { connected: true, account: event.body.account, mode: event.body.mode } : undefined;
      if (!event.body.connected) v.syncError = undefined;
      v.updatedAt = event.at;
      break;
    }
    case "venture.metrics": {
      const v = state.ventures[event.body.id];
      if (!v) break;
      const { id: _id, error, ...reading } = event.body;
      if (error) v.syncError = error;
      else {
        const m = { ...reading, at: event.at };
        v.metrics = m;
        v.history = [...v.history, m].slice(-180);
        v.syncError = undefined;
      }
      v.updatedAt = event.at;
      break;
    }
    case "site.published": {
      const b = event.body;
      const was = state.sites[b.id];
      state.sites[b.id] = { ...was, id: b.id, artifact: b.artifact, venture: b.venture, url: b.url, project: b.project, version: b.version, publishedAt: event.at };
      break;
    }
    case "site.signups": {
      const site = state.sites[event.body.id];
      if (!site) break;
      if (event.body.error) site.signupsError = event.body.error;
      else {
        // Keep the reading from about a week ago, for "+12 this week".
        const prev = site.signups;
        const weekAgo = prev && event.at - prev.at > 6.5 * 86_400_000 ? prev.count : prev?.weekAgo;
        site.signups = { count: event.body.count, at: event.at, weekAgo: weekAgo ?? prev?.count ?? event.body.count };
        site.signupsError = undefined;
      }
      state.sites = { ...state.sites, [site.id]: { ...site } };
      break;
    }
    case "site.removed":
      delete state.sites[event.body.id];
      break;
    case "backup.made":
      state.backup = { ...event.body, at: event.at };
      break;
    case "briefing.created":
      state.briefing = { ...event.body, at: event.at };
      break;
    case "playbook.set":
      state.playbooks[event.body.id] = event.body;
      break;
    case "playbook.removed":
      delete state.playbooks[event.body.id];
      break;
    case "play.started": {
      const b = event.body;
      state.plays[b.id] = {
        id: b.id, playbook: b.playbook, name: b.name, emoji: b.emoji, title: plainTitle(b.title), inputs: b.inputs, repo: b.repo, venture: b.venture,
        status: "running", phases: b.phases.map((p) => ({ ...p, status: "pending", runs: [], artifacts: [] })), startedAt: event.at, updatedAt: event.at,
      };
      break;
    }
    case "play.phase": {
      const play = state.plays[event.body.play];
      const phase = play?.phases[event.body.index];
      if (!play || !phase) break;
      const b = event.body;
      phase.status = b.status;
      if (b.run && b.run !== phase.run) {
        phase.run = b.run;
        phase.runs = [...phase.runs, b.run];
      }
      if (b.status === "pending") {
        phase.output = undefined;
        phase.artifacts = [];
        phase.note = b.note; // a retry says why (and a reset clears it)
      }
      if (b.output !== undefined) phase.output = b.output;
      if (b.artifacts) phase.artifacts = b.artifacts;
      if (b.note !== undefined) phase.note = b.note;
      play.phases = [...play.phases];
      play.updatedAt = event.at;
      break;
    }
    case "play.status": {
      const play = state.plays[event.body.play];
      if (!play) break;
      play.status = event.body.status;
      play.reason = event.body.reason;
      play.updatedAt = event.at;
      break;
    }
    case "run.archived":
      if (event.run) delete state.runs[event.run];
      break;
    case "run.deleted":
      // Gone everywhere: the session and anything still waiting on it.
      if (event.run) {
        delete state.runs[event.run];
        for (const [id, a] of Object.entries(state.approvals)) if ((a as { run?: string }).run === event.run) delete state.approvals[id];
      }
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
      if (b.runtime === "mock") break;
      if (run) {
        run.usage.inputTokens += b.inputTokens;
        run.usage.outputTokens += b.outputTokens;
        if (b.contextUsed !== undefined) run.usage.contextUsed = b.contextUsed;
        if (b.contextLimit !== undefined) run.usage.contextLimit = b.contextLimit;
      }
      const contextOnly = b.inputTokens === 0 && b.outputTokens === 0 && b.cacheTokens === 0 && b.costUsd === undefined && (b.contextUsed !== undefined || b.contextLimit !== undefined);
      if (contextOnly) break;
      if (run) {
        run.usage.costUsd = b.costUsd === undefined || (run.usage.records && run.usage.costUsd === null) ? null : (run.usage.costUsd ?? 0) + b.costUsd;
        run.usage.records = (run.usage.records ?? 0) + 1;
      }
      const day = dayOf(event.at);
      if (day !== currentDay) break;
      state.today.tokens += b.inputTokens + b.outputTokens;
      state.today.costUsd = b.costUsd === undefined || (state.today.records && state.today.costUsd === null) ? null : (state.today.costUsd ?? 0) + b.costUsd;
      state.today.records = (state.today.records ?? 0) + 1;
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
      state.limited[event.body.model ? `${event.body.runtime} · ${event.body.model}` : event.body.runtime] = { until: event.body.until, message: event.body.message, credits: event.body.credits, seq: event.seq };
      break;
    case "runtime.retrying": {
      const key = event.body.model ? `${event.body.runtime} · ${event.body.model}` : event.body.runtime;
      if (state.limited[key]?.seq === event.body.limitSeq) state.limited[key]!.retrying = true;
      break;
    }
    case "runtime.restored":
      if (event.body.limitSeq !== undefined) {
        const key = event.body.model ? `${event.body.runtime} · ${event.body.model}` : event.body.runtime;
        if (state.limited[key]?.seq === event.body.limitSeq) delete state.limited[key];
        break;
      }
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
