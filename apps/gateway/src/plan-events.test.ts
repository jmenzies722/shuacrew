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

it("a follow-up prepared while you type matches the turn that runs, so the warm agent is actually used", async () => {
  const { warmKey } = await import("@shuacrew/runtimes");
  const store = new EventStore(":memory:");
  const prepared: Array<Parameters<NonNullable<Runtime["prepare"]>>[0]> = [];
  const started: Array<Parameters<Runtime["start"]>[0]> = [];
  const fake: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "codex",
    prepare: (run: (typeof prepared)[number]) => void prepared.push(run),
    async *start(run: (typeof started)[number]) {
      started.push(run);
      yield { type: "session", id: "thread-1" } as const;
      yield { type: "text", text: "ok", final: true } as const;
      yield { type: "done", text: "ok" } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["codex", fake]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-prep-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const id = supervisor.launch({ ask: "First", runtime: "codex" });
  const settle = async (n: number) => { const end = Date.now() + 5000; while ((started.length < n || ["running", "queued"].includes(fold(store.read(0)).runs[id]?.status ?? "")) && Date.now() < end) await new Promise((r) => setTimeout(r, 15)); };
  await settle(1);
  expect(supervisor.prepare(id)).toBe(true);
  supervisor.followUp(id, "Second");
  await settle(2);
  expect(started[1]!.resume).toBe("thread-1");
  expect(warmKey(prepared[0]!)).toBe(warmKey(started[1]!));
  expect(supervisor.prepare("no-such-run")).toBe(false);
});
