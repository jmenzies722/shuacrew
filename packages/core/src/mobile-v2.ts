import { z } from "zod";
import { ApprovalOfferSchema } from "./mobile.js";
const bytes = (value: string) => new TextEncoder().encode(value).length;
const text = (max: number) => z.string().min(1).refine(value => !/[\uD800-\uDFFF]/u.test(value) && bytes(value) <= max);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const status = z.enum(["queued", "planning", "running", "awaiting_approval", "paused", "done", "failed", "cancelled", "reviewing", "merged"]);
const audience = { version: z.literal(2), installationId: id, deviceId: id };
export const MobileV2CommandSchema = z.object({ ...audience, commandId: id, issuedAt: time, expiresAt: time,
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("approval"), offer: ApprovalOfferSchema, allow: z.boolean() }).strict(),
    z.object({ kind: z.literal("room-message"), roomId: id, text: text(8000), recipient: id.nullable(), replyTo: id.nullable() }).strict(),
    z.object({ kind: z.literal("queue-cancel"), roomId: id, requestId: z.string().uuid() }).strict(),
    z.object({ kind: z.literal("room-pause"), roomId: id, paused: z.boolean() }).strict(),
    z.object({ kind: z.literal("run-stop"), runId: id }).strict(),
    z.object({ kind: z.literal("refresh") }).strict(),
  ])
}).strict().refine(value => value.expiresAt > value.issuedAt && value.expiresAt - value.issuedAt <= 86400000)
  .refine(value => value.action.kind !== "approval" || (value.action.offer.installationId === value.installationId && value.action.offer.deviceId === value.deviceId && value.issuedAt >= value.action.offer.issuedAt && value.expiresAt <= value.action.offer.expiresAt));
const member = z.object({ id, name: text(128), role: text(256), color: z.string().regex(/^#[a-fA-F0-9]{6}$/), glyph: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
const message = z.object({ id, author: id, text: text(8000), at: time, recipient: id.nullable(), replyTo: id.nullable(), runId: id.nullable() }).strict();
const queue = z.object({ requestId: z.string().uuid(), text: text(8000), recipient: id.nullable(), replyTo: id.nullable(), issuedAt: time, expiresAt: time, state: z.enum(["pending", "started", "cancelled", "expired", "rejected"]), runId: id.nullable() }).strict();
const room = z.object({ id, title: text(256), coordinatorId: id, paused: z.boolean(), members: z.array(member).max(16), messages: z.array(message).max(50), queue: z.array(queue).max(20), truncated: z.boolean() }).strict();
const work = z.object({ id, roomId: id, requestId: z.string().uuid(), memberId: id, sourceRunId: id.nullable(), dependencyIds: z.array(id).max(8), title: text(256), status, updatedAt: time }).strict();
const result = z.object({ id, roomId: id, runId: id, requestId: z.string().uuid(), memberId: id, summary: text(2048), state: z.enum(["completed", "partial", "unavailable"]), verification: z.enum(["recorded", "not-recorded", "unavailable"]), artifacts: z.array(z.object({ id, title: text(256), available: z.boolean() }).strict()).max(20) }).strict();
export const MobileV2SnapshotSchema = z.object({ ...audience, sequence: time, observedAt: time,
  rooms: z.array(room).max(50), work: z.array(work).max(100), results: z.array(result).max(100), offers: z.array(ApprovalOfferSchema).max(50),
  usage: z.object({ inputTokens: time, outputTokens: time, cacheTokens: time, records: time, costUsd: z.number().finite().nonnegative().nullable() }).strict(), truncated: z.boolean(),
}).strict().refine(value => bytes(JSON.stringify(value)) <= 524288)
  .refine(value => value.offers.every(offer => offer.installationId === value.installationId && offer.deviceId === value.deviceId))
  .refine(value => new Set(value.rooms.map(room => room.id)).size === value.rooms.length && [...value.work, ...value.results].every(item => value.rooms.some(room => room.id === item.roomId)), "Foreign room reference");
export type MobileV2Command = z.infer<typeof MobileV2CommandSchema>;
export type MobileV2Snapshot = z.infer<typeof MobileV2SnapshotSchema>;
export function signingBytesV2(payload: string): Uint8Array { return new TextEncoder().encode(`ShuaCrew/mobile/v2\n${payload}`); }
