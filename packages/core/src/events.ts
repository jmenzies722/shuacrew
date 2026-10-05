/**
 * The event log is ShuaCrew's only source of truth.
 *
 * Every fact — a run was queued, a tool ran, a file changed, a person approved something, a lesson
 * was learned — is one immutable, typed event. Runs, sessions, the board, memory and the audit
 * trail are all projections over this one ordered sequence, so they cannot disagree with each other
 * and replay/time-travel cost nothing extra.
 */
import { z } from "zod";
import { MemberVoice } from "./voice.js";
import { roomBodies } from "./rooms.js";
import { mobileBodies } from "./mobile.js";

export const RunStatus = z.enum([
  "queued",
  "planning",
  "running",
  "awaiting_approval",
  "paused", // usage window exhausted; resumes on its own when the window resets
  "reviewing",
  "merged",
  "done",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const PhaseDef = z.object({
  id: z.string(),
  name: z.string(),
  member: z.string().optional(), // a crew member id; its persona, model and lessons come along
  prompt: z.string(), // {{input}} placeholders are filled from the play's inputs
  gate: z.enum(["auto", "approve"]).default("approve"),
  deliverable: z.string().optional(), // the artifact title this phase should save
});
export type PhaseDef = z.infer<typeof PhaseDef>;
export const PlaybookDef = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  emoji: z.string().default(""),
  inputs: z.array(z.object({ key: z.string(), label: z.string(), placeholder: z.string().optional(), long: z.boolean().optional(), optional: z.boolean().optional() })).default([]),
  phases: z.array(PhaseDef).min(1),
});
export type PlaybookDef = z.infer<typeof PlaybookDef>;

export const RuntimeId = z.string().min(1); // "claude" | "codex" | "acp:<name>" | "mock" | …
export const Risk = z.enum(["low", "medium", "high", "critical"]);

const route = z.object({ runtime: RuntimeId, model: z.string().optional(), effort: z.string().optional() });

/** Bodies, by kind. Adding a kind means deciding what it proves, not where to put a field. */
export const bodies = {
  ...roomBodies,
  ...mobileBodies,
  // work
  "run.created": z.object({
    title: z.string(),
    titleSource: z.enum(["explicit", "suggested", "derived"]).optional(),
    ask: z.string(),
    project: z.string().optional(),
    repo: z.string().optional(),
    baseCommit: z.string().regex(/^[a-f0-9]{40}$/).optional(),
    runtime: RuntimeId,
    model: z.string().optional(),
    effort: z.string().optional(),
    parent: z.string().optional(), // subagent runs point at their parent
    spec: z.string().optional(),
    labels: z.array(z.string()).default([]),
    incognito: z.boolean().default(false),
    // A fork: the session and turn it branched from, and the commit its worktree starts at.
    forkOf: z.object({ run: z.string(), turn: z.number().int(), commit: z.string().optional() }).optional(),
    member: z.string().optional(), // the crew member doing this work
    venture: z.string().optional(), // the startup this work is for
  }),
  "run.status": z.object({ status: RunStatus, reason: z.string().optional() }),
  /** ask stops for approval; auto lets those through. A deny still wins. */
  "run.permission": z.object({ mode: z.enum(["ask", "auto"]) }),
  "run.worktree": z.object({ path: z.string(), branch: z.string(), base: z.string() }),
  "run.routed": route.extend({ reason: z.string() }),
  "run.priority": z.object({ priority: z.number() }),
  // Put away: gone from every list, still in the audit chain.
  "run.archived": z.object({ reason: z.string().default("") }),
  "run.followup": z.object({ id: z.string().optional(), text: z.string(), by: z.string().default("you") }), // another turn, same run
  "run.followup.withdrawn": z.object({ id: z.string() }), // taken back before its turn started
  "run.followup.edited": z.object({ id: z.string(), text: z.string() }),
  "run.followups.reordered": z.object({ ids: z.array(z.string()) }),
  "run.session": z.object({ runtime: RuntimeId, id: z.string() }), // the runtime's own conversation, for resume

  // conversation
  "turn.started": z.object({ turn: z.number().int(), text: z.string(), by: z.string().default("you") }),
  "agent.delta": z.object({ turn: z.number().int(), text: z.string() }), // coalesced token stream
  "agent.message": z.object({ turn: z.number().int(), text: z.string(), final: z.boolean().default(false) }),
  "agent.thinking": z.object({ turn: z.number().int(), text: z.string() }),
  "turn.completed": z.object({
    turn: z.number().int(),
    route,
    durationMs: z.number().optional(),
    backendSession: z.string().optional(),
  }),

  // actions
  "tool.called": z.object({ id: z.string(), tool: z.string(), input: z.unknown(), subagent: z.string().optional() }),
  "tool.returned": z.object({ id: z.string(), ok: z.boolean(), output: z.string().default(""), durationMs: z.number().optional() }),
  "file.changed": z.object({ path: z.string(), change: z.enum(["added", "modified", "deleted"]).default("modified") }),
  "check.ran": z.object({ command: z.string(), exitCode: z.number(), output: z.string().default("") }),
  "subagent.started": z.object({ id: z.string(), name: z.string(), task: z.string() }),
  "subagent.finished": z.object({ id: z.string(), ok: z.boolean(), summary: z.string().default("") }),
  "checkpoint.created": z.object({ turn: z.number().int(), commit: z.string().optional(), note: z.string().default("") }),

  // governance
  "approval.requested": z.object({
    id: z.string(),
    tool: z.string(),
    input: z.unknown(),
    risk: Risk,
    reason: z.string(),
    rule: z.string(),
    layer: z.string().optional(),
  }),
  "approval.decided": z.object({
    id: z.string(),
    allow: z.boolean(),
    by: z.string(), // "you", "you (slack)", "policy", "timeout"
    always: z.boolean().default(false),
    comment: z.string().optional(),
    mobileCommandId: z.string().optional(),
  }),
  "policy.decided": z.object({
    tool: z.string(),
    verdict: z.enum(["allow", "deny", "ask"]),
    rule: z.string(),
    layer: z.string(),
    reason: z.string(),
  }),

  // usage
  "usage.recorded": z.object({
    runtime: RuntimeId,
    inputTokens: z.number().default(0),
    outputTokens: z.number().default(0),
    cacheTokens: z.number().default(0),
    costUsd: z.number().optional(), // only for api-key/bedrock runtimes
    accounting: z.enum(["codex-delta-v1", "codex-last-v1"]).optional(),
    contextUsed: z.number().optional(),
    contextLimit: z.number().optional(),
  }),
  // With a model, the limit is that model's own (e.g. a weekly cap on one model); without, the whole agent's.
  // `credits`: not a usage window at all — the model needs paid usage credits on this plan.
  // The crew: named members with a role, a persona, a default model and the phrases that route work to them.
  "crew.member.set": z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    persona: z.string(),
    voice: MemberVoice.optional(),
    delegatable: z.boolean().optional(),
    runtime: z.string().optional(),
    model: z.string().optional(),
    color: z.string().default("#ffb020"),
    emoji: z.string().default(""),
    triggers: z.array(z.string()).default([]),
  }),
  "crew.member.removed": z.object({ id: z.string() }),
  "runtime.limited": z.object({ runtime: RuntimeId, model: z.string().optional(), until: z.number(), message: z.string(), credits: z.boolean().optional() }),
  "runtime.retrying": z.object({ runtime: RuntimeId, model: z.string().optional(), limitSeq: z.number().int().positive() }),
  "runtime.restored": z.object({ runtime: RuntimeId, model: z.string().optional(), limitSeq: z.number().int().positive().optional() }),

  // review
  "review.comment": z.object({ file: z.string(), line: z.number().int(), text: z.string() }),
  "review.decided": z.object({ approve: z.boolean(), lesson: z.string().optional() }),
  "merge.queued": z.object({ position: z.number().int() }),
  "merge.landed": z.object({ commit: z.string(), branch: z.string() }),
  "merge.failed": z.object({ reason: z.string() }),
  "pr.opened": z.object({ url: z.string(), branch: z.string(), base: z.string() }),

  // memory
  "lesson.learned": z.object({
    id: z.string(),
    text: z.string(),
    scope: z.enum(["global", "project"]),
    project: z.string().optional(),
    origin: z.enum(["correction", "recovery", "review", "stated"]),
    confidence: z.number().min(0).max(1).default(0.6),
    expires: z.number().optional(),
    evidence: z.array(z.number()).default([]), // seqs that justify it
  }),
  "lesson.applied": z.object({ id: z.string() }),
  "lesson.retired": z.object({ id: z.string(), reason: z.string().default("") }),
  "skill.proposed": z.object({ id: z.string(), name: z.string(), body: z.string(), from: z.array(z.string()).default([]) }),
  "skill.decided": z.object({ id: z.string(), accept: z.boolean() }),

  // MCP servers ShuaCrew adds. Tokens never go in the log — only that a server exists and how it auths.
  "mcp.set": z.object({
    id: z.string(),
    name: z.string(),
    command: z.string().optional(),
    args: z.array(z.string()).default([]),
    url: z.string().optional(),
    auth: z.enum(["none", "oauth"]).default("none"),
  }),
  "mcp.removed": z.object({ id: z.string() }),
  // Whether Spark (the desktop buddy's quick voice turns) may use this server's tools, without asking.
  "mcp.spark": z.object({ id: z.string(), on: z.boolean() }),

  // library: what the crew made (artifacts, versioned) and what you gave it to know (knowledge).
  // Only metadata is logged; the bytes live under the data home and the text in the search index.
  "artifact.saved": z.object({
    id: z.string(),
    version: z.number().int().min(1),
    title: z.string(),
    kind: z.enum(["doc", "page", "code", "data", "image", "file"]),
    file: z.string(),
    mime: z.string(),
    size: z.number().int(),
    summary: z.string().optional(),
    member: z.string().optional(),
    by: z.enum(["agent", "you"]).default("agent"),
  }),
  "artifact.removed": z.object({ id: z.string() }),
  "knowledge.added": z.object({
    id: z.string(),
    title: z.string(),
    source: z.enum(["file", "folder", "note"]),
    origin: z.string().optional(),
    files: z.number().int(),
    chunks: z.number().int(),
    size: z.number().int(),
  }),
  "knowledge.removed": z.object({ id: z.string() }),

  // playbooks: reusable multi-phase work, each phase done by a crew member, with gates you approve.
  // ventures: a startup, from idea to revenue. Keys never go in the log — only whether one is connected.
  "venture.set": z.object({
    id: z.string(),
    name: z.string(),
    emoji: z.string().default(""),
    color: z.string().default("#ffb020"),
    pitch: z.string().default(""),
    customer: z.string().optional(),
    goal: z.string().optional(), // "$1k MRR by March"
    goalMrr: z.number().optional(), // in the currency's major unit
    repo: z.string().optional(),
    website: z.string().optional(),
    autopilot: z.boolean().default(false), // start each stage's playbook by itself; weekly growth review
  }),
  "venture.automation": z.object({id:z.string(),playbook:z.string(),state:z.enum(["starting","started","failed"]),attemptId:z.string(),error:z.string().optional()}),
  "venture.stage": z.object({ id: z.string(), stage: z.enum(["idea", "validating", "building", "launching", "earning", "paused", "stopped"]), note: z.string().optional() }),
  "venture.removed": z.object({ id: z.string() }),
  "venture.stripe": z.object({ id: z.string(), connected: z.boolean(), account: z.string().optional(), mode: z.enum(["live", "test"]).optional() }),
  "venture.metrics": z.object({
    id: z.string(),
    source: z.enum(["stripe", "manual"]),
    mode: z.enum(["live", "test"]).optional(),
    currency: z.string().default("usd"),
    mrr: z.number().optional(), // major units (dollars), normalised to a month
    revenue30d: z.number().optional(),
    customers: z.number().int().optional(),
    subscriptions: z.number().int().optional(),
    error: z.string().optional(),
  }),
  // Sites: an artifact published to the web (Vercel), with a waitlist. Only the count is logged.
  "site.published": z.object({ id: z.string(), artifact: z.string(), venture: z.string().optional(), url: z.string(), project: z.string(), version: z.number().int() }),
  "site.signups": z.object({ id: z.string(), count: z.number().int(), error: z.string().optional() }),
  "site.removed": z.object({ id: z.string() }),
  // Encrypted backups of the data home. The passphrase lives in the Keychain, never here.
  "backup.made": z.object({ file: z.string(), bytes: z.number().int(), error: z.string().optional() }),
  // The morning briefing: a digest built from the log (no model), one per day.
  "briefing.created": z.object({
    id: z.string(),
    day: z.string(), // YYYY-MM-DD, local
    since: z.number(),
    headline: z.string(),
    sections: z.array(
      z.object({
        title: z.string(),
        items: z.array(z.object({ text: z.string(), href: z.string().optional(), tone: z.enum(["ok", "bad", "wait", "live", "idle"]).optional() })),
      }),
    ),
  }),
  "playbook.set": PlaybookDef,
  "playbook.removed": z.object({ id: z.string() }),
  "play.started": z.object({
    id: z.string(),
    playbook: z.string(),
    name: z.string(),
    emoji: z.string().default(""),
    title: z.string(),
    inputs: z.record(z.string(), z.string()).default({}),
    repo: z.string().optional(),
    venture: z.string().optional(),
    phases: z.array(PhaseDef),
  }),
  "play.phase": z.object({
    play: z.string(),
    index: z.number().int().min(0),
    status: z.enum(["pending", "running", "review", "done", "failed", "skipped"]),
    run: z.string().optional(),
    output: z.string().optional(),
    artifacts: z.array(z.string()).optional(),
    note: z.string().optional(),
  }),
  "play.status": z.object({ play: z.string(), status: z.enum(["running", "waiting", "done", "failed", "cancelled"]), reason: z.string().optional() }),

  // unattended
  "schedule.set": z.object({
    id: z.string(),
    name: z.string().optional(),
    cron: z.string().optional(),
    timezone: z.string().optional(),
    ask: z.string().optional(),
    script: z.string().optional(), // deterministic job: no model call
    project: z.string().optional(),
    runtime: RuntimeId.optional(),
    paused: z.boolean().optional(),
  }),
  "schedule.removed": z.object({ id: z.string() }),
  "webhook.set": z.object({ id: z.string(), name: z.string(), ask: z.string(), project: z.string().optional(), runtime: RuntimeId.optional(), paused: z.boolean().default(false) }),
  "webhook.removed": z.object({ id: z.string() }),
  "heartbeat.set": z.object({
    id: z.string(),
    name: z.string(),
    command: z.string(), // exit 0 = healthy; anything else = unhealthy (no model call)
    everyMinutes: z.number().int().min(1),
    threshold: z.number().int().min(1).default(2), // consecutive failures before it acts
    ask: z.string().optional(), // what an agent should do once it's unhealthy
    paused: z.boolean().default(false),
  }),
  "heartbeat.removed": z.object({ id: z.string() }),
  "heartbeat.checked": z.object({ id: z.string(), ok: z.boolean(), detail: z.string().default(""), streak: z.number().int() }),
  "task.planned": z.object({ steps: z.array(z.string()), validate: z.string().optional(), maxRetries: z.number().int().default(2) }),
  "task.step": z.object({
    index: z.number().int(),
    status: z.enum(["started", "passed", "failed", "retrying", "skipped"]),
    run: z.string().optional(),
    detail: z.string().default(""),
  }),
  "schedule.fired": z.object({ id: z.string(), run: z.string().optional(), ok: z.boolean().optional() }),
  "trigger.received": z.object({ trigger: z.string(), source: z.string(), payload: z.unknown() }),

  // specs — the phase is the fact; the markdown in .shuacrew/specs/ is what you review
  "spec.opened": z.object({ id: z.string(), title: z.string(), ask: z.string(), repo: z.string() }),
  "spec.advanced": z.object({ id: z.string(), phase: z.enum(["requirements", "design", "tasks"]) }),
  "spec.approved": z.object({ id: z.string(), phase: z.enum(["requirements", "design", "tasks"]) }),
  "spec.comment": z.object({ id: z.string(), phase: z.enum(["requirements", "design", "tasks"]), line: z.number().int(), text: z.string() }),
  "spec.fanned": z.object({ id: z.string(), runs: z.array(z.string()) }),
  /** A session is rewriting the current phase file in the repo, not in a worktree. */
  "spec.planned": z.object({ id: z.string(), phase: z.enum(["requirements", "design", "tasks"]), run: z.string() }),

  // system
  "gateway.started": z.object({ pid: z.number(), version: z.string() }),
  "config.changed": z.object({ key: z.string(), value: z.unknown() }),
  "error.raised": z.object({ message: z.string(), fatal: z.boolean().default(false) }),
} as const;

export type Kind = keyof typeof bodies;
export const KINDS = Object.keys(bodies) as Kind[];
export type Body<K extends Kind> = z.infer<(typeof bodies)[K]>;

/** One fact, as stored. `hash` chains it to every fact before it. */
export interface StoredEvent<K extends Kind = Kind> {
  seq: number;
  at: number;
  kind: K;
  run: string | null;
  session: string | null;
  body: Body<K>;
  prev: string;
  hash: string;
}

export type AnyEvent = { [K in Kind]: StoredEvent<K> }[Kind];

/** Validate and normalise a body for its kind; throws with the kind in the message. */
export function parseBody<K extends Kind>(kind: K, body: unknown): Body<K> {
  const schema = bodies[kind];
  if (!schema) throw new Error(`unknown event kind: ${String(kind)}`);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new Error(`invalid ${kind}: ${parsed.error.message}`);
  return parsed.data as Body<K>;
}

export function isKind<K extends Kind>(event: AnyEvent, kind: K): event is StoredEvent<K> & AnyEvent {
  return event.kind === kind;
}
