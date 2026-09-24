/**
 * The event log is ShuaCrew's only source of truth.
 *
 * Every fact — a run was queued, a tool ran, a file changed, a person approved something, a lesson
 * was learned — is one immutable, typed event. Runs, sessions, the board, memory and the audit
 * trail are all projections over this one ordered sequence, so they cannot disagree with each other
 * and replay/time-travel cost nothing extra.
 */
import { z } from "zod";

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

export const RuntimeId = z.string().min(1); // "claude" | "codex" | "acp:<name>" | "mock" | …
export const Risk = z.enum(["low", "medium", "high", "critical"]);

const route = z.object({ runtime: RuntimeId, model: z.string().optional(), effort: z.string().optional() });

/** Bodies, by kind. Adding a kind means deciding what it proves, not where to put a field. */
export const bodies = {
  // work
  "run.created": z.object({
    title: z.string(),
    ask: z.string(),
    project: z.string().optional(),
    repo: z.string().optional(),
    runtime: RuntimeId,
    model: z.string().optional(),
    effort: z.string().optional(),
    parent: z.string().optional(), // subagent runs point at their parent
    spec: z.string().optional(),
    labels: z.array(z.string()).default([]),
    incognito: z.boolean().default(false),
    // A fork: the session and turn it branched from, and the commit its worktree starts at.
    forkOf: z.object({ run: z.string(), turn: z.number().int(), commit: z.string().optional() }).optional(),
  }),
  "run.status": z.object({ status: RunStatus, reason: z.string().optional() }),
  "run.worktree": z.object({ path: z.string(), branch: z.string(), base: z.string() }),
  "run.routed": route.extend({ reason: z.string() }),
  "run.priority": z.object({ priority: z.number() }),
  // Put away: gone from every list, still in the audit chain.
  "run.archived": z.object({ reason: z.string().default("") }),
  "run.followup": z.object({ id: z.string().optional(), text: z.string(), by: z.string().default("you") }), // another turn, same run
  "run.followup.withdrawn": z.object({ id: z.string() }), // taken back before its turn started
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
  }),
  "approval.decided": z.object({
    id: z.string(),
    allow: z.boolean(),
    by: z.string(), // "you", "you (slack)", "policy", "timeout"
    always: z.boolean().default(false),
    comment: z.string().optional(),
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
    contextUsed: z.number().optional(),
    contextLimit: z.number().optional(),
  }),
  "runtime.limited": z.object({ runtime: RuntimeId, until: z.number(), message: z.string() }),
  "runtime.restored": z.object({ runtime: RuntimeId }),

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
