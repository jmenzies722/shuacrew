import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockRuntime, type Runtime } from "@shuacrew/runtimes";
import { afterEach, expect, it } from "vitest";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function gateway() {
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-teach-"));
  const store = new EventStore(path.join(home, "shuacrew.db"));
  const runtimes = new Map<string, Runtime>([["mock", new MockRuntime({ pace: 0 })]]);
  const supervisor = new Supervisor(store, runtimes, { workspace: home, roots: [], approvalTimeoutMs: 60_000 });
  const { app } = await createServer({ store, supervisor, runtimes });
  cleanups.push(() => app.close(), () => store.close());
  const created = (await app.inject({ method: "POST", url: "/api/teaching/new", headers: { "x-shuacrew": "1" }, payload: {} })).json();
  return { app, lesson: created.active as string, revision: created.lessons?.[0]?.revision ?? 0 };
}
const ask = (app: Awaited<ReturnType<typeof gateway>>["app"], lesson: string, extra: Record<string, unknown>) =>
  app.inject({ method: "POST", url: `/api/teaching/${lesson}/explain`, headers: { "x-shuacrew": "1" }, payload: { baseRevision: 0, question: "How does DNS work?", sources: [], ...extra } });

it("teaches with Claude unless you choose otherwise", async () => {
  const { app, lesson } = await gateway();
  const r = await ask(app, lesson, {});
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toMatch(/Claude is not connected/);
});

it("uses Codex only when you choose it, and never falls back silently", async () => {
  const { app, lesson } = await gateway();
  const r = await ask(app, lesson, { runtime: "codex" });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toMatch(/Codex is not connected/);
  expect(r.json().error).not.toMatch(/Claude/);
});

it("refuses an engine it doesn't know", async () => {
  const { app, lesson } = await gateway();
  expect((await ask(app, lesson, { runtime: "gemini" })).statusCode).toBe(400);
});
