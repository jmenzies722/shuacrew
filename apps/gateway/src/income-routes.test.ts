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
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-income-"));
  const store = new EventStore(path.join(home, "shuacrew.db"));
  const runtimes = new Map<string, Runtime>([["mock", new MockRuntime({ pace: 0 })]]);
  const supervisor = new Supervisor(store, runtimes, { workspace: home, roots: [], approvalTimeoutMs: 60_000 });
  const { app, state } = await createServer({ store, supervisor, runtimes });
  cleanups.push(() => app.close(), () => store.close());
  return { app, state };
}
const post = (app: Awaited<ReturnType<typeof gateway>>["app"], url: string, payload: object) => app.inject({ method: "POST", url, headers: { "x-shuacrew": "1" }, payload });

it("logs income into the crew's state, and removes it", async () => {
  const { app, state } = await gateway();
  const r = await post(app, "/api/income", { amount: 1500, kind: "consulting", note: "Shua Labs: audit for Acme" });
  expect(r.statusCode).toBe(200);
  const id = r.json().id as string;
  expect(state().income[id]).toMatchObject({ amount: 1500, currency: "usd", kind: "consulting", note: "Shua Labs: audit for Acme" });
  await post(app, `/api/income/${id}/remove`, {});
  expect(state().income[id]).toBeUndefined();
});

it("refuses nonsense amounts and unknown kinds", async () => {
  const { app } = await gateway();
  expect((await post(app, "/api/income", { amount: -5, kind: "content" })).statusCode).toBe(400);
  expect((await post(app, "/api/income", { amount: "abc", kind: "content" })).statusCode).toBe(400);
  expect((await post(app, "/api/income", { amount: 10, kind: "lottery" })).statusCode).toBe(400);
});
