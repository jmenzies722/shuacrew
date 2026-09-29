import { z } from "zod";
const bytes = (s: string) => new TextEncoder().encode(s).length;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const bounded = (max: number) => z.string().min(1).refine(s => !/[\uD800-\uDFFF]/u.test(s) && bytes(s) <= max, "Invalid Unicode or text exceeds byte limit");
const base = { version: z.literal(1), installationId: id, deviceId: id, issuedAt: time, expiresAt: time };
export const ApprovalOfferSchema = z.object({ ...base, offerId: id, runId: id, approvalId: id, tool: bounded(128), inputDigest: digest, summary: bounded(2048), nonce: id, requiresPhone: z.boolean() }).strict().refine(v => v.expiresAt > v.issuedAt && v.expiresAt - v.issuedAt <= 300000, "Invalid offer lifetime");
export type ApprovalOffer = z.infer<typeof ApprovalOfferSchema>;
export const MobileCommandSchema = z.object({ ...base, commandId: id, action: z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approval"), offer: ApprovalOfferSchema, allow: z.boolean() }).strict(),
  z.object({ kind: z.literal("room-message"), roomId: id, text: bounded(8000) }).strict(),
  z.object({ kind: z.literal("room-pause"), roomId: id, paused: z.boolean() }).strict(),
  z.object({ kind: z.literal("run-stop"), runId: id }).strict(),
  z.object({ kind: z.literal("refresh") }).strict(),
]) }).strict().refine(v => v.expiresAt > v.issuedAt && v.expiresAt - v.issuedAt <= 86400000, "Invalid command lifetime").refine(v => v.action.kind !== "approval" || (v.action.offer.installationId === v.installationId && v.action.offer.deviceId === v.deviceId && v.expiresAt <= v.action.offer.expiresAt && v.issuedAt >= v.action.offer.issuedAt), "Offer identity or lifetime mismatch");
export type MobileCommand = z.infer<typeof MobileCommandSchema>;
export const SignedEnvelopeSchema = z.object({ payload: bounded(16384), signature: z.string().regex(/^[A-Za-z0-9_-]{85}[AQgw]$/) }).strict();
export type SignedEnvelope = z.infer<typeof SignedEnvelopeSchema>;
export const MobileAckSchema = z.object({ version: z.literal(1), installationId: id, deviceId: id, commandId: id, payloadDigest: digest, state: z.enum(["applied", "rejected", "expired", "uncertain"]), reason: id, at: time }).strict();
export type MobileAck = z.infer<typeof MobileAckSchema>;
const message = z.object({ id, author: bounded(128), text: bounded(8000), at: time }).strict();
const room = z.object({ id, title: bounded(256), paused: z.boolean(), messages: z.array(message).max(50), truncated: z.boolean() }).strict();
const run = z.object({ id, roomId: id, title: bounded(256), status: z.enum(["queued", "planning", "running", "awaiting_approval", "paused", "done", "failed", "cancelled", "reviewing", "merged"]), summary: z.string().refine(s => !/[\uD800-\uDFFF]/u.test(s) && bytes(s) <= 2048) }).strict();
export const MobileSnapshotSchema = z.object({
  version: z.literal(1), installationId: id, deviceId: id, sequence: time, observedAt: time,
  rooms: z.array(room).max(50), runs: z.array(run).max(100), offers: z.array(ApprovalOfferSchema).max(50),
  usage: z.object({ inputTokens: time, outputTokens: time, cacheTokens: time, records: time, costUsd: z.number().finite().nonnegative().nullable() }).strict(),
  truncated: z.boolean(),
}).strict().refine(v => bytes(JSON.stringify(v)) <= 524288, "Snapshot too large")
  .refine(v => v.offers.every(o => o.installationId === v.installationId && o.deviceId === v.deviceId), "Offer audience mismatch");
export type MobileSnapshot = z.infer<typeof MobileSnapshotSchema>;
export const MobileDeviceSchema = z.object({ id, name: bounded(80), kind: z.enum(["phone", "watch"]), publicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/) }).strict();
export type MobileDevice = z.infer<typeof MobileDeviceSchema>;
export const MobileConfigSchema = z.object({ enabled: z.boolean(), roomIds: z.array(id).max(50) }).strict();
export const mobileBodies = {
  // Unscoped legacy events remain readable but cannot confer authority on a new installation.
  "mobile.configured": MobileConfigSchema.extend({ installationId: id.optional() }),
  "mobile.paired": MobileDeviceSchema.extend({ installationId: id.optional() }),
  "mobile.revoked": z.object({ deviceId: id, installationId: id.optional() }).strict(),
  "mobile.offer": ApprovalOfferSchema,
  "mobile.received": z.object({ installationId: id, deviceId: id, commandId: id, payloadDigest: digest, kind: z.enum(["approval", "room-message", "room-pause", "run-stop", "refresh"]), target: id.optional(), requestId: id.optional(), paused: z.boolean().optional(), marker: id }).strict(),
  "mobile.ack": MobileAckSchema,
} as const;
export function signingBytes(payload: string): Uint8Array { return new TextEncoder().encode(`ShuaCrew/mobile/v1\n${payload}`); }
export function decodeEnvelope(raw: unknown): SignedEnvelope {
  const value = typeof raw === "string" ? parseStrictJSON(raw, 32768) : raw;
  if (bytes(JSON.stringify(value) ?? "") > 32768) throw new Error("Envelope too large");
  return SignedEnvelopeSchema.parse(value);
}
/** Snapshots have a separate decoder; command ingress retains its 16 KiB payload cap. */
export function decodeSnapshotEnvelope(raw: unknown): SignedEnvelope {
  const limit = 2 * 524288 + 1024;
  const value = typeof raw === "string" ? parseStrictJSON(raw, limit) : raw;
  if (bytes(JSON.stringify(value) ?? "") > limit) throw new Error("Snapshot envelope too large");
  return SignedEnvelopeSchema.extend({ payload: bounded(524288) }).parse(value);
}
/** Reject ambiguous JSON before either runtime can interpret signed commands differently. */
export function parseStrictJSON(text: string, limit = 16384): unknown {
  if (bytes(text) > limit) throw new Error("JSON too large");
  let i = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[i] ?? "x")) i++; };
  const string = (): string => {
    const start = i++; while (i < text.length) {
      const c = text[i++]; if (c === "\\") { i++; continue; }
      if (c === '"') {
        const result = JSON.parse(text.slice(start, i)) as string;
        if (/[\uD800-\uDFFF]/u.test(result)) throw new Error("Unpaired Unicode surrogate");
        return result;
      }
    } throw new Error("Unterminated string");
  };
  const value = (depth: number): void => {
    if (depth > 32) throw new Error("JSON too deep"); ws();
    if (text[i] === '"') { string(); return; }
    if (text[i] === "{" || text[i] === "[") {
      const object = text[i++] === "{", end = object ? "}" : "]", seen = new Set<string>(); ws();
      if (text[i] === end) { i++; return; }
      for (;;) {
        ws(); if (object) {
          if (text[i] !== '"') throw new Error("Invalid object key");
          const key = string(); if (seen.has(key)) throw new Error("Duplicate JSON key"); seen.add(key);
          ws(); if (text[i++] !== ":") throw new Error("Invalid object");
        }
        value(depth + 1); ws(); const next = text[i++]; if (next === end) return;
        if (next !== ",") throw new Error("Invalid JSON separator");
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!token) throw new Error("Invalid JSON value");
    if (/^[\d-]/.test(token[0]) && !Number.isFinite(Number(token[0]))) throw new Error("Nonfinite JSON number");
    i += token[0].length;
  };
  value(0); ws(); if (i !== text.length) throw new Error("Trailing JSON");
  return JSON.parse(text);
}
