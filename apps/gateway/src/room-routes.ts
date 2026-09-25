import type { FastifyInstance } from "fastify";
import { RoomInputSchema } from "@shuacrew/core/rooms";
import { RoomQueueInputSchema, type RoomQueueInput } from "@shuacrew/core/room-queue";
import { z } from "zod";
import type { RoomCoordinator } from "./rooms.js";

export function roomRoutes(app: FastifyInstance, rooms?: RoomCoordinator) {
  if (!rooms) return;
  app.get("/api/rooms", async () => rooms.list());
  app.post("/api/rooms", async (req, reply) => {
    const input = RoomInputSchema.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ error: input.error.message });
    try { return rooms.create(input.data); } catch (error) { return reply.code(409).send({ error: (error as Error).message }); }
  });
  const message = z.object({ requestId: z.string().uuid(), text: z.string().trim().min(1).max(8000), recipient: z.string().optional() }).strict();
  const actions = {
    queue: { schema: RoomQueueInputSchema, call: (id: string, b: RoomQueueInput) => rooms.enqueue(id, b) },
    "queue-cancel": { schema: z.object({ requestId: z.string().uuid() }).strict(), call: (id: string, b: { requestId: string }) => ({ outcome: rooms.cancelPending(id, b.requestId) }) },
    messages: { schema: message, call: (id: string, b: z.infer<typeof message>) => rooms.send(id, b.requestId, b.text, b.recipient) },
    pause: { schema: z.object({ paused: z.boolean() }).strict(), call: (id: string, b: { paused: boolean }) => { rooms.pause(id, b.paused); return { ok: true }; } },
    stop: { schema: z.object({}).strict(), call: (id: string) => { rooms.stop(id); return { ok: true }; } },
    retry: { schema: z.object({ assignmentId: z.string(), requestId: z.string().uuid() }).strict(), call: (id: string, b: { assignmentId: string; requestId: string }) => rooms.retry(id, b.assignmentId, b.requestId) },
  };
  for (const [action, handler] of Object.entries(actions)) app.post<{ Params: { id: string } }>(`/api/rooms/:id/${action}`, async (req, reply) => {
    if (!rooms.get(req.params.id)) return reply.code(404).send({ error: "Room not found" });
    const input = handler.schema.safeParse(req.body ?? {});
    if (!input.success) return reply.code(400).send({ error: input.error.message });
    try { return handler.call(req.params.id, input.data as never); } catch (error) { return reply.code(409).send({ error: (error as Error).message }); }
  });
}
