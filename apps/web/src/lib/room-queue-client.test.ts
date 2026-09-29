import { afterEach, expect, it, vi } from "vitest";
import type { RoomQueueInput } from "@shuacrew/core/room-queue";
import { enqueueRoomMessage } from "./room-queue-client";
afterEach(() => vi.unstubAllGlobals());
it("retries the exact queue envelope after a lost acknowledgment", async () => {
  const pending: Record<string, RoomQueueInput> = {};
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Lost response")).mockResolvedValueOnce(new Response('{"state":"pending"}'));
  vi.stubGlobal("fetch", fetch);
  await expect(enqueueRoomMessage(pending, "room", "Original", "eli", "message")).rejects.toThrow();
  const original = { ...pending.room };
  await enqueueRoomMessage(pending, "room", "New edit", "shua");
  expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
  expect(original).toMatchObject({ text: "Original", recipient: "eli", replyTo: "message" });
  expect(pending.room).toBeUndefined();
});
it("rejects over-limit UTF-8 before retaining or sending", async () => {
  const pending: Record<string, RoomQueueInput> = {}, fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(enqueueRoomMessage(pending, "room", "🙂".repeat(2001))).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled(); expect(pending.room).toBeUndefined();
});
it("retains conflicting identities for explicit recovery instead of minting a duplicate", async () => {
  const pending: Record<string, RoomQueueInput> = {};
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"Queue request conflict"}', { status: 409 })));
  await expect(enqueueRoomMessage(pending, "room", "Original")).rejects.toThrow(/conflict/);
  expect(pending.room?.text).toBe("Original");
});
