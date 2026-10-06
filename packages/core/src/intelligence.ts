import { z } from "zod";
/** One wire contract for Spark and the gateway; no credentials or account identifiers. */
export const IntelligenceRequestSchema = z.object({
  ask: z.string().trim().min(1).max(100_000), mode: z.enum(["auto", "local"]),
  purpose: z.enum(["work", "conversation"]), images: z.boolean(),
  preferredRuntime: z.string().max(60).optional(), preferredModel: z.string().max(100).optional(),
  tier: z.enum(["fast", "balanced", "frontier"]), localModel: z.string().max(100).optional(),
  /** "fastest": skip the assistant's brain order and take whichever connected model starts talking soonest (measured). */
  speed: z.enum(["fastest"]).optional(),
});
export type IntelligenceRequest = z.infer<typeof IntelligenceRequestSchema>;
export type IntelligenceChoice =
  | { runtime: string; model: string; reason: string; acceptsImages: boolean; checkedAt: number; verification: "unverified" }
  | { runtime: null; reason: string; retryAt: number | null; checkedAt: number };
