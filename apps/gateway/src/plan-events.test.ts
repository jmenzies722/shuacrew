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

it("streamed reasoning is batched into a few thoughts, in order, before the reply", async () => {
  const store = new EventStore(":memory:");
  const words = Array.from({ length: 60 }, (_, i) => `w${i} `);
  const fake: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "mock",
    async *start() {
      for (const w of words) yield { type: "thinking", text: w, delta: true } as const;
      yield { type: "text", text: "Answer." } as const;
      yield { type: "done", text: "Answer." } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["mock", fake]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-think-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const id = supervisor.launch({ ask: "Think first", runtime: "mock" });
  const deadline = Date.now() + 10_000;
  while (fold(store.read(0)).runs[id]?.status !== "done" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  const events = store.forRun(id);
  const thoughts = events.filter((e) => e.kind === "agent.thinking");
  expect(thoughts.length).toBeLessThan(words.length / 4);
  expect(thoughts.map((e) => (e.kind === "agent.thinking" ? e.body.text : "")).join("")).toBe(words.join(""));
  const lastThought = events.findLastIndex((e) => e.kind === "agent.thinking");
  const firstText = events.findIndex((e) => e.kind === "agent.delta" || e.kind === "agent.message");
  expect(lastThought).toBeLessThan(firstText);
});

it("work sessions are told to keep a plan and prove it before done", async () => {
  const store = new EventStore(":memory:");
  const seen: Array<{ system?: string; lean?: boolean }> = [];
  const mock = new MockRuntime({ pace: 0 });
  const spy: Runtime = Object.assign(Object.create(mock), { id: "codex", start: (run: { system?: string; lean?: boolean }, ctx: never) => (seen.push(run), mock.start(run as never, ctx)) });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["codex", spy]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-habits-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  supervisor.launch({ ask: "Fix the flaky upload retry test", runtime: "codex" });
  const deadline = Date.now() + 5000;
  while (!seen.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
  expect(seen[0]!.system).toContain("keep a plan with the update_plan tool");
  expect(seen[0]!.system).toContain("Before you call anything done, prove it");
});
