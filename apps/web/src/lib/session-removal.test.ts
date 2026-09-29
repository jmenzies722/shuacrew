import { expect, it, vi } from "vitest";
import { removeSession, canRemoveSession } from "./session-removal";
it("rejects active and usage-paused sessions before sending a request", async () => {
  const send = vi.fn();
  for (const status of ["queued", "planning", "running", "awaiting_approval", "paused"]) {
    expect(canRemoveSession(status)).toBe(false);
    await expect(removeSession("r_1", status, send)).rejects.toThrow(/Stop/);
  }
  expect(send).not.toHaveBeenCalled();
});
it("uses the real archive endpoint and propagates errors without hiding the chat", async () => {
  const send = vi.fn().mockResolvedValue({ ok: true });
  await removeSession("r_1", "done", send);
  expect(send).toHaveBeenCalledWith("/api/runs/r_1/archive", { body: {} });
  send.mockRejectedValue(new Error("offline"));
  await expect(removeSession("r_1", "done", send)).rejects.toThrow("offline");
});
