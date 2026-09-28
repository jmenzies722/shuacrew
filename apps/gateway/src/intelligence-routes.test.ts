import { afterEach, expect, it } from "vitest";
import { MockRuntime, type Runtime } from "@shuacrew/runtimes";
import { fold } from "@shuacrew/core";
import { EventStore } from "./store.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import os from "node:os";
const cleanup: Array<() => unknown> = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f(); });
const headers = { "x-shuacrew": "1" };
const ask = { ask: "hello", mode: "auto", purpose: "conversation", images: false, tier: "fast" };
async function world() {
  const runtimes = new Map<string, Runtime>();
  for (const id of ["claude", "codex", "local"]) runtimes.set(id, { ...new MockRuntime({ pace: 0 }), id, label: id,
    models: [{ id: `${id}-model`, label: id, tier: "fast" }],
    async status() { return { installed: true, signedIn: true, detail: "ready", overridingKeys: [] }; },
    async *start() { yield { type: "done", text: "answer" }; } });
  const store = new EventStore(":memory:"); const supervisor = new Supervisor(store, runtimes, { workspace: os.tmpdir() });
  const { app } = await createServer({ store, supervisor, runtimes });
  cleanup.push(() => store.close(), () => supervisor.shutdown(), () => app.close());
  return { app, store, supervisor, runtimes };
}
it("selects without creating work and rejects malformed selection requests", async () => {
  const { app, store } = await world();
  const r = await app.inject({ method: "POST", url: "/api/intelligence/select", headers, payload: ask });
  expect(r.statusCode).toBe(200); expect(r.json()).toMatchObject({ runtime: "claude", model: "claude-model" });
  expect(Object.keys(fold(store.read(0)).runs)).toHaveLength(0);
  expect((await app.inject({ method: "POST", url: "/api/intelligence/select", headers, payload: { ...ask, images: "yes" } })).statusCode).toBe(400);
});
it("skips failed provider status and respects local-only without probing cloud accounts", async () => {
  const { app, runtimes } = await world(); let cloudChecks = 0;
  for (const id of ["claude", "codex"]) runtimes.get(id)!.status = async () => { cloudChecks++; throw new Error("offline"); };
  const r = await app.inject({ method: "POST", url: "/api/intelligence/select", headers, payload: { ...ask, mode: "local" } });
  expect(r.json().runtime).toBe("local"); expect(cloudChecks).toBe(0);
  expect((await app.inject({ method: "POST", url: "/api/intelligence/select", headers, payload: ask })).json().runtime).toBe("local");
});
it("rejects a stale prepared Spark route instead of silently sending it to another provider", async () => {
  const { app, store } = await world();
  store.append("runtime.limited", { runtime: "claude", until: Date.now() + 60_000, message: "limited" });
  const r = await app.inject({ method: "POST", url: "/api/runs", headers, payload: { ask: "prepared prompt", runtime: "claude", model: "claude-model", labels: ["buddy"], intelligence: ask } });
  expect(r.statusCode).toBe(409); expect(Object.keys(fold(store.read(0)).runs)).toHaveLength(0);
});
it("normal Auto launches share the available provider order; explicit choices remain explicit", async () => {
  const { app, store } = await world();
  store.append("runtime.limited", { runtime: "claude", until: Date.now() + 60_000, message: "limited" });
  const a = await app.inject({ method: "POST", url: "/api/runs", headers, payload: { ask: "help build" } });
  expect(fold(store.read(0)).runs[a.json().id]?.runtime).toBe("codex");
  const b = await app.inject({ method: "POST", url: "/api/runs", headers, payload: { ask: "wait for Claude", runtime: "claude" } });
  expect(fold(store.read(0)).runs[b.json().id]?.runtime).toBe("claude");
});
it("a matching rule can fall back when its provider is limited", async () => {
  const { store, runtimes } = await world();
  const { GatewaySettingsSchema } = await import("./settings.js");
  const settings = GatewaySettingsSchema.parse({ router: [{ name: "coding", match: "build", runtime: "claude", model: "claude-model" }] });
  const supervisor = new Supervisor(store, runtimes, { workspace: os.tmpdir(), settings: () => settings }); cleanup.push(() => supervisor.shutdown());
  store.append("runtime.limited", { runtime: "claude", until: Date.now() + 60_000, message: "limited" });
  const id = supervisor.launch({ ask: "build something" });
  expect(fold(store.read(0)).runs[id]?.runtime).toBe("codex");
});
it("revalidates prepared follow-ups and keeps stale text out of the old conversation", async () => {
  const { app, store, supervisor } = await world();
  const id = supervisor.launch({ ask: "first", runtime: "claude", model: "claude-model", hold: true });
  store.append("runtime.limited", { runtime: "claude", until: Date.now() + 60_000, message: "limited" });
  const r = await app.inject({ method: "POST", url: `/api/runs/${id}/followup`, headers,
    payload: { text: "prepared next turn", runtime: "claude", model: "claude-model", intelligence: ask } });
  expect(r.statusCode).toBe(409); expect(store.forRun(id).filter(e => e.kind === "run.followup")).toHaveLength(0);
});
it("does not bypass no-choice by launching crew work on local or a signed-out provider", async () => {
  const { supervisor, runtimes, store } = await world();
  for (const id of ["claude", "codex"]) supervisor.updateRuntimeStatus(id, { installed: true, signedIn: false, detail: "sign in", overridingKeys: [] });
  expect(() => supervisor.launch({ ask: "coding work", hold: true })).toThrow(/No eligible/);
  expect(Object.keys(fold(store.read(0)).runs)).toHaveLength(0);
});
