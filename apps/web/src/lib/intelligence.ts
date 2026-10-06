import type { IntelligenceChoice, IntelligenceRequest } from "@shuacrew/core";
import { api } from "./api";
export type { IntelligenceChoice, IntelligenceRequest };
const pick = (request: IntelligenceRequest) => api<IntelligenceChoice>("/api/intelligence/select", { body: request });
/**
 * Auto prefers one provider (Codex), but a preference must not leave Shua with no brain: when that provider is at its
 * usage limit (Oct 5: Codex for six days while Claude sat idle), Auto falls back to any connected one and says why.
 * A model you picked by name stays strict.
 */
export async function selectIntelligence(request: IntelligenceRequest): Promise<IntelligenceChoice> {
  const first = await pick(request);
  if (first.runtime || !request.preferredRuntime || request.preferredModel || request.mode === "local") return first;
  const fallback = await pick({ ...request, preferredRuntime: undefined });
  if (!fallback.runtime) return first;
  const until = "retryAt" in first && first.retryAt ? ` until ${new Date(first.retryAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "";
  return { ...fallback, reason: `${request.preferredRuntime === "codex" ? "Codex" : request.preferredRuntime} is at its usage limit${until} · ${fallback.reason}` };
}
/** Model and provider identity belong to a conversation. Switch only between turns. */
/** Past this, Spark starts a fresh session (with a recap): a conversation once grew to 506K tokens (limit 200K) and every turn died. */
export const CONTEXT_REFRESH = 110_000;
export function turnDisposition(current: { runtime?: string; model?: string; status?: string; contextUsed?: number; rules?: string } | null, next: { runtime: string; model: string; rules?: string }): "resume" | "new" | "wait" {
  if (current?.status && ["queued", "running", "planning", "awaiting_approval"].includes(current.status)) return "wait";
  if ((current?.contextUsed ?? 0) > CONTEXT_REFRESH) return "new";
  // Updated instructions are supplied on the next turn without discarding this conversation.
  // Stopped mid-answer (you talked over it) is still the same conversation — resuming keeps what was said.
  return (current?.status === "done" || current?.status === "cancelled") && current.runtime === next.runtime && current.model === next.model ? "resume" : "new";
}
