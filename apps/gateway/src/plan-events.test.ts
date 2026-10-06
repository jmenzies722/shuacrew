import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime } from "@shuacrew/runtimes";
import { afterEach, expect, it } from "vitest";
import { Supervisor } from "./runs.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });

it("an agent's checklist is stored with its turn, whole, every time it moves", async () => {
  const store = new EventStore(":memory:");
  const mock = Object.assign(new MockRuntime({ pace: 0 }), { id: "mock" });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["mock", mock]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-plan-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const id = supervisor.launch({ ask: "Fix the flaky upload retry test", runtime: "mock" });
  const deadline = Date.now() + 10_000;
  while (fold(store.read(0)).runs[id]?.status !== "done" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  const plans = store.forRun(id).filter((e) => e.kind === "plan.updated");
  expect(plans.length).toBe(4);
  const last = plans.at(-1)!;
  expect(last.kind === "plan.updated" && last.body.turn).toBe(1);
  expect(last.kind === "plan.updated" && last.body.steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
  const first = plans[0]!;
  expect(first.kind === "plan.updated" && first.body.steps[0]).toEqual({ text: "Reproduce the failure", status: "active" });
});
