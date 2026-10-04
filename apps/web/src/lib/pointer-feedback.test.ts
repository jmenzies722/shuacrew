import { afterEach, expect, it, vi } from "vitest";
import { requestPointer } from "./pointer-feedback";

afterEach(() => vi.useRealTimers());

const fixture = () => {
  const events = new EventTarget();
  const sent: Record<string, unknown>[] = [];
  const reply = (detail: unknown) => events.dispatchEvent(Object.assign(new Event("shuacrew:pointer"), { detail }));
  return { events, sent, reply, send: (message: Record<string, unknown>) => { sent.push(message); } };
};

it("waits for a matching native acknowledgment, not just dispatch", async () => {
  const host = fixture();
  const result = requestPointer({ type: "buddyPoint", label: "Save" }, host.send, host.events);
  host.reply({ id: "unrelated", ok: true });
  host.reply({ id: host.sent[0]!.id, ok: true });
  await expect(result).resolves.toMatchObject({ ok: true });
});

it("reports native rejection without claiming success", async () => {
  const host = fixture();
  const result = requestPointer({ type: "buddyPoint" }, host.send, host.events);
  host.reply({ id: host.sent[0]!.id, ok: false, message: "Display unavailable" });
  await expect(result).resolves.toEqual({ ok: false, message: "Display unavailable" });
});

it("times out rather than assuming the overlay appeared", async () => {
  vi.useFakeTimers();
  const host = fixture();
  const result = requestPointer({ type: "buddyPoint" }, host.send, host.events);
  await vi.advanceTimersByTimeAsync(3000);
  await expect(result).resolves.toMatchObject({ ok: false });
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores late success after cancellation and cleans up", async () => {
  vi.useFakeTimers();
  const host = fixture(), controller = new AbortController();
  const result = requestPointer({ type: "buddyPoint" }, host.send, host.events, controller.signal);
  controller.abort();
  host.reply({ id: host.sent[0]!.id, ok: true });
  await expect(result).resolves.toMatchObject({ ok: false, cancelled: true });
  expect(vi.getTimerCount()).toBe(0);
});

it("does not dispatch already-cancelled work", async () => {
  const host = fixture(), controller = new AbortController();
  controller.abort();
  await expect(requestPointer({ type: "buddyPoint" }, host.send, host.events, controller.signal)).resolves.toMatchObject({ cancelled: true });
  expect(host.sent).toHaveLength(0);
});

it("keeps concurrent request receipts separate", async () => {
  const host = fixture();
  const first = requestPointer({ type: "buddyPoint" }, host.send, host.events);
  const second = requestPointer({ type: "buddyPoint" }, host.send, host.events);
  host.reply({ id: host.sent[1]!.id, ok: true });
  host.reply({ id: host.sent[0]!.id, ok: false, message: "Missing target" });
  await expect(first).resolves.toMatchObject({ ok: false });
  await expect(second).resolves.toMatchObject({ ok: true });
});
