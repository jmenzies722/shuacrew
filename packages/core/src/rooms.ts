import { z } from "zod";
import type { AnyEvent } from "./events.js";
import { applyQueueEvent, roomQueueBodies, type RoomQueueEntry } from "./room-queue.js";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/);
const request = z.string().uuid();
export const RoomInputSchema = z.object({
  title: z.string().trim().min(1).max(160), coordinator: id,
  members: z.array(id).min(1).max(16), repo: z.string().min(1).max(4096).optional(),
  concurrency: z.number().int().min(1).max(3).default(3),
}).refine(v => new Set(v.members).size === v.members.length && v.members.includes(v.coordinator), "Choose unique members including the coordinator");
export type RoomInput = z.input<typeof RoomInputSchema>;
export const AssignmentInputSchema = z.object({ requestId: request, memberId: id, task: z.string().trim().min(1).max(8000) });
export type AssignmentInput = z.infer<typeof AssignmentInputSchema>;
const assignment = z.object({ room: id, id, rootRequest: request, requestId: request, sourceRun: id, memberId: id, runId: id, task: z.string().trim().min(1).max(8000), depth: z.literal(1), retryOf: id.optional() });
const message = z.object({ room: id, id, author: id, text: z.string().min(1).max(16000), sourceRun: id.optional(), assignmentId: id.optional(), requestId: request.optional(), recipient: id.optional(), replyTo: id.optional() });
const turn = z.object({ room: id, requestId: request, runId: id, memberId: id });
export const roomBodies = {
  ...roomQueueBodies,
  "room.created": RoomInputSchema.extend({ id, base: z.string().regex(/^[a-f0-9]{40}$/).optional() }),
  "room.turn": turn,
  "room.message": message,
  "room.paused": z.object({ room: id, paused: z.boolean() }),
  "room.stopped": z.object({ room: id }),
  "room.assignment.requested": assignment,
  "room.assignment.started": z.object({ room: id, id }),
  "room.assignment.completed": z.object({ room: id, id, output: z.string().max(16000), artifacts: z.array(id).max(100) }),
  "room.assignment.failed": z.object({ room: id, id, reason: z.string().max(2000) }),
  "room.summary-requested": z.object({ room: id, requestId: request, runId: id }),
} as const;
export interface RoomAssignment extends z.infer<typeof assignment> {
  status: "queued" | "running" | "done" | "failed"; createdAt: number; updatedAt: number;
  output?: string; reason?: string; artifacts?: string[];
}
export interface RoomView extends z.infer<typeof RoomInputSchema> {
  base?: string;
  id: string; paused: boolean; stopped: boolean; createdAt: number; updatedAt: number;
  turns: Array<z.infer<typeof turn> & { summaryRequested?: boolean }>;
  messages: Array<z.infer<typeof message> & { seq: number; at: number }>;
  assignments: Record<string, RoomAssignment>;
  queue?: Record<string, RoomQueueEntry>;
}
export function applyRoomEvent(rooms: Record<string, RoomView>, e: AnyEvent): void {
  if (e.kind === "room.created") {
    if (!rooms[e.body.id]) rooms[e.body.id] = { ...e.body, paused: false, stopped: false, createdAt: e.at, updatedAt: e.at, turns: [], messages: [], assignments: {} };
    return;
  }
  if (!("room" in e.body) || typeof e.body.room !== "string") return;
  const room = rooms[e.body.room]; if (!room) return;
  room.updatedAt = e.at;
  switch (e.kind) {
    case "room.queue.accepted": case "room.queue.dispatched": case "room.queue.cancelled": case "room.queue.expired": case "room.queue.rejected":
      applyQueueEvent(room.queue ??= {}, e); break;
    case "room.turn":
      if (!room.turns.some(t => t.requestId === e.body.requestId)) { room.turns.push({ ...e.body }); room.stopped = false; }
      break;
    case "room.message":
      if (!room.messages.some(m => m.id === e.body.id || (m.author === "you" && e.body.author === "you" && m.requestId && m.requestId === e.body.requestId))) room.messages.push({ ...e.body, seq: e.seq, at: e.at });
      break;
    case "room.paused": room.paused = e.body.paused; break;
    case "room.stopped": room.stopped = true; room.paused = true; break;
    case "room.summary-requested": {
      const t = room.turns.find(t => t.requestId === e.body.requestId && t.runId === e.body.runId); if (t) t.summaryRequested = true; break;
    }
    case "room.assignment.requested":
      if (!Object.values(room.assignments).some(a => a.id === e.body.id || (a.sourceRun === e.body.sourceRun && a.requestId === e.body.requestId))) room.assignments[e.body.id] = { ...e.body, status: "queued", createdAt: e.at, updatedAt: e.at };
      break;
    case "room.assignment.started": {
      const a = room.assignments[e.body.id]; if (a?.status === "queued") { a.status = "running"; a.updatedAt = e.at; } break;
    }
    case "room.assignment.completed": {
      const a = room.assignments[e.body.id]; if (a && ["queued", "running"].includes(a.status)) Object.assign(a, { status: "done", output: e.body.output, artifacts: e.body.artifacts, updatedAt: e.at }); break;
    }
    case "room.assignment.failed": {
      const a = room.assignments[e.body.id]; if (a && ["queued", "running"].includes(a.status)) Object.assign(a, { status: "failed", reason: e.body.reason, updatedAt: e.at }); break;
    }
  }
}
export function foldRooms(events: AnyEvent[]): { rooms: Record<string, RoomView>; head: number } {
  const state = { rooms: {} as Record<string, RoomView>, head: 0 };
  for (const e of events) { if (e.seq <= state.head) continue; applyRoomEvent(state.rooms, e); state.head = e.seq; }
  return state;
}
