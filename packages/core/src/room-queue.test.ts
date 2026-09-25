import { expect, it } from "vitest";
import { validateQueueInput, applyQueueEvent } from "./room-queue.js";
const input = { requestId: "00000000-0000-4000-a000-000000000001", text: "next", issuedAt: 1000, expiresAt: 2000 };
it("validates exact request identities, UTF-8 size and bounded lifetime", () => {
  expect(validateQueueInput(input, 1000)).toEqual(input);
  expect(() => validateQueueInput(input, 2000)).toThrow();
  expect(() => validateQueueInput({ ...input, text: "🙂".repeat(2001) }, 1000)).toThrow();
  expect(() => validateQueueInput({ ...input, expiresAt: 86402000 }, 1000)).toThrow();
  expect(() => validateQueueInput({ ...input, issuedAt: 1001 }, 1000)).toThrow();
});
it("does not resurrect terminal entries or accept a dispatch before durable acceptance", () => {
  const entries = {};
  applyQueueEvent(entries, { kind: "room.queue.dispatched", body: { room: "r", requestId: input.requestId, runId: "run" } });
  expect(entries).toEqual({});
  applyQueueEvent(entries, { kind: "room.queue.accepted", body: { room: "r", ...input } });
  applyQueueEvent(entries, { kind: "room.queue.cancelled", body: { room: "r", requestId: input.requestId } });
  applyQueueEvent(entries, { kind: "room.queue.accepted", body: { room: "r", ...input } });
  applyQueueEvent(entries, { kind: "room.queue.dispatched", body: { room: "r", requestId: input.requestId, runId: "run" } });
  expect(entries).toEqual({ [input.requestId]: { ...input, state: "cancelled" } });
});
