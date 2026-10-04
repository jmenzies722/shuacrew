import { expect, it, vi } from "vitest";
import { requestMacTask } from "./mac-task-bridge";

it("correlates replies and rejects native errors", async () => {
  const events = new EventTarget();
  const sent: Record<string, unknown>[] = [];
  const pending = requestMacTask({ operation: "observe" }, message => sent.push(message), events);
  events.dispatchEvent(Object.assign(new Event("shuacrew:macTask"), { detail: { id: sent[0]!.id, ok: false, message: "Permission missing" } }));
  await expect(pending).rejects.toThrow("Permission missing");
});
it("cancels waiting and ignores late replies", async () => {
  const events = new EventTarget(), abort = new AbortController();
  const pending = requestMacTask({}, () => {}, events, abort.signal);
  abort.abort();
  await expect(pending).rejects.toThrow("Stopped");
});
