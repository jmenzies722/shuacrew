import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { Memory } from "./memory.js";
import { Supervisor } from "./runs.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function until(check: () => boolean, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
}

function world() {
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(":memory:");
  const seen: RunSpec[] = [];
  const mock = new MockRuntime({ pace: 0 });
  const spy: Runtime = Object.assign(Object.create(mock), { start: (run: RunSpec, ctx: Parameters<Runtime["start"]>[1]) => (seen.push(run), mock.start(run, ctx)) });
  const memory = new Memory(store);
  const supervisor = new Supervisor(store, new Map([["mock", spy]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [], memory });
  cleanups.push(() => (memory.stop(), supervisor.shutdown(), store.close()));
  return { store, memory, supervisor, seen };
}

const status = (store: EventStore, run: string) => [...store.forRun(run)].reverse().find((e) => e.kind === "run.status");

describe("memory in the loop", () => {
  it("learns a correction, tells the next run in that project, and lets the review move its confidence", async () => {
    const { store, memory, supervisor, seen } = world();
    const first = supervisor.launch({ ask: "Add zod to the web app", runtime: "mock", project: "/r/web" });
    await until(() => status(store, first)?.kind === "run.status" && ["reviewing", "done"].includes((status(store, first) as { body: { status: string } }).body.status));
    supervisor.followUp(first, "No, never use npm here — use pnpm for installing packages.");
    await until(() => Object.keys(memory.view.lessons).length === 1);
    const lesson = Object.values(memory.view.lessons)[0]!;
    expect(lesson).toMatchObject({ origin: "correction", project: "/r/web", text: "Never use npm here — use pnpm for installing packages." });

    const second = supervisor.launch({ ask: "Install the date-fns package", runtime: "mock", project: "/r/web" });
    await until(() => seen.some((s) => s.id === second));
    expect(seen.find((s) => s.id === second)?.system).toContain("use pnpm");
    const elsewhere = supervisor.launch({ ask: "Install the date-fns package", runtime: "mock", project: "/r/other" });
    await until(() => seen.some((s) => s.id === elsewhere));
    expect(seen.find((s) => s.id === elsewhere)?.system).toBeUndefined(); // a project lesson stays in its project

    store.append("review.decided", { approve: true }, { run: second });
    expect(memory.view.lessons[lesson.id]).toMatchObject({ applied: 1, wins: 1, confidence: 0.68 });
  });

  it("evolve retires lessons the reviews argued down, and proposes a skill for a recurring ask", () => {
    const { store, memory } = world();
    const id = memory.teach("Always add retries to flaky tests");
    for (const run of ["r1", "r2", "r3", "r4"]) {
      store.append("lesson.applied", { id }, { run });
      store.append("review.decided", { approve: false }, { run });
    }
    for (const run of ["a", "b", "c"]) store.append("run.created", { title: "", ask: "Bump the stale dependencies and fix the build", runtime: "mock" }, { run });
    const report = memory.evolve();
    expect(report.retired).toEqual([{ id, reason: expect.stringMatching(/confidence fell/) }]);
    expect(report.proposed).toHaveLength(1);
    expect(memory.evolve().proposed).toHaveLength(0); // proposed once, not every week
  });

  it("incognito runs get no lessons and leave none behind", async () => {
    const { store, memory, supervisor, seen } = world();
    memory.teach("Use the injected clock in tests");
    const run = supervisor.launch({ ask: "Fix the clock in tests", runtime: "mock", incognito: true });
    await until(() => seen.some((s) => s.id === run));
    expect(seen[0]?.system).toBeUndefined();
    expect(store.ofKinds("lesson.applied")).toHaveLength(0);
  });
});

describe("follow-ups mid-turn", () => {
  it("queues messages sent while the agent works and answers them together next", async () => {
    process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
    const store = new EventStore(":memory:");
    const supervisor = new Supervisor(store, new Map([["mock", new MockRuntime({ pace: 60 })]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
    cleanups.push(() => (supervisor.shutdown(), store.close()));
    const run = supervisor.launch({ ask: "Audit the sync path", runtime: "mock" });
    await until(() => store.forRun(run).some((e) => e.kind === "turn.started"));
    supervisor.followUp(run, "Also check the retry path");
    supervisor.followUp(run, "And keep it under 50 lines");
    const turns = () => store.forRun(run).flatMap((e) => (e.kind === "turn.started" ? [e.body.text] : []));
    await until(() => turns().length === 2 && ["done", "reviewing"].includes(String((status(store, run) as { body: { status: string } } | undefined)?.body.status)));
    expect(turns()[1]).toBe("Also check the retry path\n\nAnd keep it under 50 lines");
  });
});

describe("installing a skill from a file", () => {
  it("takes Markdown, and refuses secrets or anything else", async () => {
    const { memory } = world();
    const dir = mkdtempSync(path.join(os.tmpdir(), "shua-skill-"));
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(dir, "SKILL.md"), "---\nname: release-notes\n---\nWrite release notes.");
    writeFileSync(path.join(dir, ".env"), "SECRET=1");
    expect(memory.installSkill(path.join(dir, "SKILL.md"))).toMatch(/^sk_/);
    expect(() => memory.installSkill(path.join(dir, ".env"))).toThrow(/Markdown/);
    expect(() => memory.installSkill(path.join(os.homedir(), ".ssh", "notes.md"))).toThrow(/can't use that file/);
  });
});
