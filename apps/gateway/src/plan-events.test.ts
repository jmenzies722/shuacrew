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

it("a new session prepared while you type matches its first turn, under the id it reserved", async () => {
  const { warmKey } = await import("@shuacrew/runtimes");
  const store = new EventStore(":memory:");
  const prepared: Array<Parameters<NonNullable<Runtime["prepare"]>>[0]> = [];
  const started: Array<Parameters<Runtime["start"]>[0]> = [];
  const fake: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "codex",
    prepare: (run: (typeof prepared)[number]) => void prepared.push(run),
    async *start(run: (typeof started)[number]) {
      started.push(run);
      yield { type: "session", id: "thread-9" } as const;
      yield { type: "done", text: "ok" } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["codex", fake]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-new-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const id = supervisor.prepareNew({ ask: "Write the pricing page copy", runtime: "codex" });
  expect(id).toMatch(/^r_/);
  expect(supervisor.launch({ ask: "Write the pricing page copy for the audit", runtime: "codex" }, id)).toBe(id);
  const end = Date.now() + 5000;
  while (!started.length && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  expect(started[0]!.id).toBe(id);
  expect(warmKey(prepared[0]!)).toBe(warmKey(started[0]!));
  expect(prepared[0]!.system).toContain("keep a plan with the update_plan tool");
  expect(supervisor.prepareNew({ ask: "Fix it", runtime: "codex", repo: "/some/repo" })).toBeUndefined(); // its worktree doesn't exist yet
});

it("when Shua answers, its next reply's agent is readied straight away", async () => {
  const store = new EventStore(":memory:");
  const prepared: Array<Parameters<NonNullable<Runtime["prepare"]>>[0]> = [];
  const fake: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "mock",
    prepare: (run: (typeof prepared)[number]) => void prepared.push(run),
    async *start() {
      yield { type: "session", id: "shua-thread" } as const;
      yield { type: "text", text: "Hi.", final: true } as const;
      yield { type: "done", text: "Hi." } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["mock", fake]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-lean-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const id = supervisor.launch({ ask: "Hey Shua", runtime: "mock", labels: ["buddy"] });
  const end = Date.now() + 5000;
  while (!prepared.length && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  expect(prepared).toHaveLength(1);
  expect(prepared[0]).toMatchObject({ id, lean: true, resume: "shua-thread" });
});

it("re-sending the same model choice keeps the conversation; choosing another model starts fresh", async () => {
  const store = new EventStore(":memory:");
  const started: Array<Parameters<Runtime["start"]>[0]> = [];
  let thread = 0;
  const fake: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "codex",
    models: [{ id: "m-fast", label: "fast", tier: "fast" }, { id: "m-big", label: "big", tier: "frontier" }],
    async *start(run: (typeof started)[number]) {
      started.push(run);
      yield { type: "session", id: run.resume ?? `thread-${++thread}` } as const;
      yield { type: "text", text: "ok", final: true } as const;
      yield { type: "done", text: "ok" } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["codex", fake]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-resume-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const id = supervisor.launch({ ask: "First", runtime: "codex", model: "m-fast" });
  const wait = async (n: number) => { const end = Date.now() + 5000; while ((started.length < n || ["running", "queued"].includes(fold(store.read(0)).runs[id]?.status ?? "")) && Date.now() < end) await new Promise((r) => setTimeout(r, 15)); };
  await wait(1);
  supervisor.followUp(id, "Second", "you", undefined, { runtime: "codex", model: "m-fast", effort: "low" }); // same model, another effort
  await wait(2);
  expect(started[1]!.resume).toBe("thread-1");
  supervisor.followUp(id, "Third", "you", undefined, { runtime: "codex", model: "m-big" }); // a different model
  await wait(3);
  expect(started[2]!.resume).toBeUndefined();
});
