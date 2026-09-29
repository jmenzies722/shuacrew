import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/);
export const RoomQueueInputSchema = z.object({ requestId: z.string().uuid(), text: z.string().min(1).refine(value => value.trim().length > 0 && new TextEncoder().encode(value).length <= 8000, "Use 1–8,000 UTF-8 bytes"), recipient: id.optional(), replyTo: id.optional(), issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() }).strict();
export type RoomQueueInput = z.infer<typeof RoomQueueInputSchema>;
export type RoomQueueEntry = RoomQueueInput & { state: "pending" | "started" | "cancelled" | "expired" | "rejected"; runId?: string; reason?: string };
export function validateQueueInput(input: unknown, now: number): RoomQueueInput {
  const value = RoomQueueInputSchema.parse(input);
  if (value.issuedAt > now || value.expiresAt <= now || value.expiresAt <= value.issuedAt || value.expiresAt - value.issuedAt > 86400000) throw new Error("Queue request is expired or has an invalid lifetime.");
  return value;
}
const reference = z.object({ room: id, requestId: z.string().uuid() });
export const roomQueueBodies = {
  "room.queue.accepted": RoomQueueInputSchema.extend({ room: id }),
  "room.queue.dispatched": reference.extend({ runId: id }),
  "room.queue.cancelled": reference,
  "room.queue.expired": reference,
  "room.queue.rejected": reference.extend({ reason: z.string().max(2000) }),
} as const;
type QueueEvent = { [K in keyof typeof roomQueueBodies]: { kind: K; body: z.infer<typeof roomQueueBodies[K]> } }[keyof typeof roomQueueBodies];
export function applyQueueEvent(entries: Record<string, RoomQueueEntry>, event: QueueEvent): void {
  if (event.kind === "room.queue.accepted") {
    const { room: _room, ...input } = event.body;
    entries[input.requestId] ??= { ...input, state: "pending" }; return;
  }
  const entry = entries[event.body.requestId]; if (!entry || entry.state !== "pending") return;
  switch (event.kind) {
    case "room.queue.dispatched": entry.state = "started"; entry.runId = event.body.runId; break;
    case "room.queue.cancelled": entry.state = "cancelled"; break;
    case "room.queue.expired": entry.state = "expired"; break;
    case "room.queue.rejected": entry.state = "rejected"; entry.reason = event.body.reason; break;
  }
}
