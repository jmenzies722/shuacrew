/**
 * The Runtime interface: how ShuaCrew drives any agent.
 *
 * A runtime turns a run into a stream of normalised events and asks the gateway before any tool
 * call it would otherwise have prompted for. It never decides policy itself — `ctx.approve` goes to
 * the one gateway policy engine, so a rule means the same thing for Claude, Codex or Kiro.
 */

export type AuthMode = "subscription" | "api-key" | "bedrock";

export interface RunSpec {
  id: string;
  ask: string;
  cwd: string;
  model?: string;
  effort?: string;
  /** The runtime's own conversation to resume, if this run has one. */
  resume?: string;
  /** Lessons and context for a conversation that is starting. */
  system?: string;
  /** Subagents the runtime may delegate to. */
  agents?: Record<string, { description: string; prompt: string; model?: string }>;
}

export interface ApprovalAnswer {
  allow: boolean;
  reason: string;
  /** The input to run instead (a person may edit a command before allowing it). */
  input?: unknown;
}

export interface RunContext {
  signal: AbortSignal;
  env: Record<string, string>;
  /** Ask the gateway whether a tool call may run. Resolves once policy — or a person — decides. */
  approve(tool: string, input: unknown, meta?: { subagent?: string }): Promise<ApprovalAnswer>;
}

/** What every runtime's output is mapped onto. */
export type RuntimeEvent =
  | { type: "session"; id: string } // the runtime's own conversation id, for resume
  | { type: "text"; text: string; final?: boolean } // a delta, or a whole message when final
  | { type: "thinking"; text: string }
  | { type: "tool-call"; id: string; tool: string; input: unknown; subagent?: string }
  | { type: "tool-result"; id: string; ok: boolean; output: string; durationMs?: number }
  | { type: "file"; path: string; change?: "added" | "modified" | "deleted" }
  | { type: "check"; command: string; exitCode: number; output?: string }
  | { type: "subagent-start"; id: string; name: string; task: string }
  | { type: "subagent-end"; id: string; ok: boolean; summary?: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cacheTokens?: number; costUsd?: number; contextUsed?: number; contextLimit?: number }
  | { type: "checkpoint"; note?: string }
  /** The subscription's usage window is exhausted; `until` is when it lifts (ms since epoch). */
  | { type: "limited"; until: number; message: string }
  | { type: "done"; text: string; durationMs?: number }
  | { type: "error"; message: string };

export interface RuntimeStatus {
  installed: boolean;
  signedIn: boolean | null; // null: the CLI can't say without spending usage
  account?: string;
  version?: string;
  detail: string;
  /** API-key variables present in the gateway's environment that would override a subscription. */
  overridingKeys: string[];
}

export interface Runtime {
  id: string;
  label: string;
  authMode: AuthMode;
  capabilities: { subagents: boolean; checkpoints: boolean; cost: boolean; images: boolean; resume: boolean };
  models: Array<{ id: string; label: string; tier: "fast" | "balanced" | "frontier" }>;
  start(run: RunSpec, ctx: RunContext): AsyncIterable<RuntimeEvent>;
  status(): Promise<RuntimeStatus>;
}

/** Recognise a usage-window / rate-limit message and, when it says, when the window lifts. */
export function limitFrom(message: string, now = Date.now()): { until: number } | null {
  if (!/usage limit|rate limit|limit reached|out of credits|quota|overloaded|try again at|resets? at/i.test(message)) {
    return null;
  }
  const at = /(?:try again at|resets? at|until)\s+([A-Z][a-z]{2,8}\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4},? \d{1,2}:\d{2}\s*[AP]M)/i.exec(message);
  if (at?.[1]) {
    const parsed = Date.parse(at[1].replace(/(\d)(st|nd|rd|th)/, "$1").replace(/,/g, ""));
    if (!Number.isNaN(parsed)) return { until: parsed };
  }
  const epoch = /\|(\d{10})\b/.exec(message); // Claude reports "…limit reached|<epoch seconds>"
  if (epoch?.[1]) return { until: Number(epoch[1]) * 1000 };
  const time = /\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/i.exec(message);
  if (time?.[1]) {
    const date = new Date(now);
    let hour = Number(time[1]) % 12;
    if (time[3]?.toLowerCase() === "pm") hour += 12;
    date.setHours(hour, Number(time[2] ?? 0), 0, 0);
    if (date.getTime() <= now) date.setDate(date.getDate() + 1);
    return { until: date.getTime() };
  }
  return { until: now + 30 * 60_000 }; // said nothing about when: hold for half an hour
}
