import { afterEach, expect, it, vi } from "vitest";
import { submitRoomMessage, type RoomEnvelope } from "./room-submit";
afterEach(() => vi.unstubAllGlobals());
it("rejects oversized drafts without locking or sending them", async () => {
  const pending: Record<string, RoomEnvelope> = {}, fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(submitRoomMessage(pending, "room", "a".repeat(8001))).rejects.toThrow(/8000/);
  expect(pending.room).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
});
it.each([400, 409])("unlocks the retained draft after definitive HTTP %s rejection", async status => {
  const pending: Record<string, RoomEnvelope> = {};
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Recipient unavailable" }), { status })));
  await expect(submitRoomMessage(pending, "room", "Review", "eli")).rejects.toThrow(/Recipient/);
  expect(pending.room).toBeUndefined();
});
it("recovers uncertain requests with the exact original envelope", async () => {
  const pending: Record<string, RoomEnvelope> = {};
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Lost response")).mockResolvedValueOnce(new Response("{}")); vi.stubGlobal("fetch", fetch);
  await expect(submitRoomMessage(pending, "room", "Review", "eli")).rejects.toThrow();
  expect(pending.room).toMatchObject({ text: "Review", recipient: "eli" });
  await submitRoomMessage(pending, "room", "Changed", "shua");
  expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
  expect(pending.room).toBeUndefined();
});
