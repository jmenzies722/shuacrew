import type { IntelligenceChoice, IntelligenceRequest } from "@shuacrew/core";
import { api } from "./api";
export type { IntelligenceChoice, IntelligenceRequest };
export const selectIntelligence = (request: IntelligenceRequest) => api<IntelligenceChoice>("/api/intelligence/select", { body: request });
/** Model and provider identity belong to a conversation. Switch only between turns. */
export function turnDisposition(current: { runtime?: string; model?: string; status?: string } | null, next: { runtime: string; model: string }): "resume" | "new" | "wait" {
  if (current?.status && ["queued", "running", "planning", "awaiting_approval"].includes(current.status)) return "wait";
  return current?.status === "done" && current.runtime === next.runtime && current.model === next.model ? "resume" : "new";
}
