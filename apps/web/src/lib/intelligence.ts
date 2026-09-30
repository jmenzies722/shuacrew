import type { IntelligenceChoice, IntelligenceRequest } from "@shuacrew/core";
import { api } from "./api";
export type { IntelligenceChoice, IntelligenceRequest };
export const selectIntelligence = (request: IntelligenceRequest) => api<IntelligenceChoice>("/api/intelligence/select", { body: request });
/** Model and provider identity belong to a conversation. Switch only between turns. */
/** Past this, Spark starts a fresh session (with a recap): a conversation once grew to 506K tokens (limit 200K) and every turn died. */
export const CONTEXT_REFRESH = 110_000;
export function turnDisposition(current: { runtime?: string; model?: string; status?: string; contextUsed?: number; rules?: string } | null, next: { runtime: string; model: string; rules?: string }): "resume" | "new" | "wait" {
  if (current?.status && ["queued", "running", "planning", "awaiting_approval"].includes(current.status)) return "wait";
  if ((current?.contextUsed ?? 0) > CONTEXT_REFRESH) return "new";
  // Spark's instructions changed since this conversation began (a new ability, a fixed rule): a conversation keeps the
  // instructions it started with, so it would never learn it — "connect my AirPods" was answered from this morning's.
  if (next.rules && current?.rules !== next.rules) return "new";
  // Stopped mid-answer (you talked over it) is still the same conversation — resuming keeps what was said.
  return (current?.status === "done" || current?.status === "cancelled") && current.runtime === next.runtime && current.model === next.model ? "resume" : "new";
}
