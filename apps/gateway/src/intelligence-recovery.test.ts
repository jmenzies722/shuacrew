import { afterEach, expect, it, vi } from "vitest";
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime, type RuntimeEvent } from "@shuacrew/runtimes";
import { EventStore } from "./store.js";
import { Supervisor } from "./runs.js";
import os from "node:os";
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(f => f()); vi.useRealTimers(); });
const tick = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function world(start: Runtime["start"]) {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }); vi.setSystemTime(100_000);
  const store = new EventStore(":memory:");
  const runtime: Runtime = { ...new MockRuntime({ pace: 0 }), id: "claude", status: async () => ({ installed: true, signedIn: true, detail: "ready", overridingKeys: [] }), models: [{ id: "a", label: "A", tier: "fast" }, { id: "b", label: "B", tier: "balanced" }], start };
  const supervisor = new Supervisor(store, new Map([["claude", runtime]]), { workspace: os.tmpdir(), failover: false });
  cleanups.push(() => store.close(), () => supervisor.shutdown());
  return { store, supervisor, state: () => fold(store.read(0)) };
}
it("a reset is only a retry; session creation is not proof of recovery", async () => {
  let attempt = 0; let finish!: () => void;
  const pending = new Promise<void>(r => { finish = r; });
  const w = world(async function* () {
    if (++attempt === 1) { yield { type: "limited", model: "a", until: Date.now() + 1000, message: "wait" }; return; }
    yield { type: "session", id: "s2" }; await pending; yield { type: "done", text: "real answer" };
  });
  w.supervisor.launch({ ask: "hello", runtime: "claude", model: "a" }); await tick();
  await vi.advanceTimersByTimeAsync(1001);
  expect(attempt).toBe(2);
  expect(w.store.ofKinds("runtime.restored")).toHaveLength(0);
  expect(w.state().limited["claude · a"]).toMatchObject({ retrying: true });
  finish(); await tick();
  expect(w.state().limited["claude · a"]).toBeUndefined();
  expect(w.store.ofKinds("runtime.restored")).toHaveLength(1);
});
it("a stale timer cannot lift a newer limit for the same model", async () => {
  const w = world(async function* () { yield { type: "limited", model: "a", until: Date.now() + 1000, message: "first" }; });
  w.supervisor.launch({ ask: "hello", runtime: "claude", model: "a" }); await tick();
  w.store.append("runtime.limited", { runtime: "claude", model: "a", until: Date.now() + 60_000, message: "newer" });
  await vi.advanceTimersByTimeAsync(1001);
  expect(w.supervisor.limitedUntil("claude", "a")).toBe(160_000);
  expect(w.store.ofKinds("runtime.restored")).toHaveLength(0);
});
it("retrying one model neither queues another limited model nor clears an account limit", async () => {
  const w = world(async function* (run) { yield { type: "limited", model: run.model, until: Date.now() + 50_000, message: "wait" }; });
  const a = w.supervisor.launch({ ask: "A", runtime: "claude", model: "a" }); await tick();
  const b = w.supervisor.launch({ ask: "B", runtime: "claude", model: "b" }); await tick();
  w.store.append("runtime.limited", { runtime: "claude", until: Date.now() + 90_000, message: "account" });
  w.supervisor.restore("claude", "a"); await tick();
  expect(w.state().runs[a]?.status).toBe("paused"); expect(w.state().runs[b]?.status).toBe("paused");
  expect(w.supervisor.limitedUntil("claude")).toBe(190_000);
});
it("a provider returning a past reset time backs off instead of spinning", async () => {
  let attempts = 0;
  const w = world(async function* () { attempts++; yield { type: "limited", until: Date.now() - 1, message: "still out", model: "a" }; });
  w.supervisor.launch({ ask: "hello", runtime: "claude", model: "a" }); await tick();
  expect(attempts).toBe(1); expect(w.supervisor.limitedUntil("claude", "a")).toBeGreaterThan(Date.now());
});
it("a success from before a newer limit cannot clear that newer restriction", async () => {
  let finish!: () => void; const pending = new Promise<void>(r => { finish = r; });
  const w = world(async function* () { await pending; yield { type: "done", text: "earlier request" }; });
  w.supervisor.launch({ ask: "hello", runtime: "claude", model: "a" }); await tick();
  w.store.append("runtime.limited", { runtime: "claude", model: "a", until: Date.now() + 60_000, message: "newer" });
  finish(); await tick();
  expect(w.state().limited["claude · a"]).toBeDefined();
});
it("restart after a reset resumes once and retains unrelated model restrictions", async () => {
  let attempts = 0;
  const w = world(async function* () { attempts++; yield { type: "done", text: "back" }; });
  const id = w.supervisor.launch({ ask: "hello", runtime: "claude", model: "a" });
  w.store.append("run.status", { status: "paused", reason: "usage" }, { run: id });
  w.store.append("runtime.limited", { runtime: "claude", model: "a", until: Date.now() - 1000, message: "expired" });
  w.store.append("runtime.limited", { runtime: "claude", model: "b", until: Date.now() + 90_000, message: "still waiting" });
  w.supervisor.recover(); await vi.advanceTimersByTimeAsync(1); await tick();
  w.supervisor.recover(); await tick();
  expect(attempts).toBe(1); expect(w.state().runs[id]?.status).toBe("done");
  expect(w.state().limited["claude · a"]).toBeUndefined(); expect(w.state().limited["claude · b"]).toBeDefined();
});
it("an account reset timer cannot release a later model-specific restriction", async () => {
  const w = world(async function* () { yield { type: "done", text: "answer" }; });
  const id = w.supervisor.launch({ ask: "hello", runtime: "claude", model: "b" });
  w.store.append("run.status", { status: "paused", reason: "usage" }, { run: id });
  w.store.append("runtime.limited", { runtime: "claude", until: Date.now() + 1000, message: "account" });
  w.store.append("runtime.limited", { runtime: "claude", model: "b", until: Date.now() + 90_000, message: "model" });
  w.supervisor.recover(); await vi.advanceTimersByTimeAsync(1001); await tick();
  expect(w.supervisor.limitedUntil("claude", "b")).toBe(190_000);
  expect(w.state().runs[id]?.status).toBe("paused");
});
