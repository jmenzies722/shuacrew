import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { VERIFY_BY } from "@shuacrew/core/verification";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, expect, it } from "vitest";
import { Supervisor } from "./runs.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });

type Step = { type: "file"; path: string } | { type: "check"; command: string; exitCode: number };

function repo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-verify-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "README.md"), "hello\n");
  git("add", "README.md");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  return dir;
}

/** A supervisor whose agent does exactly what each turn's script says, and records what it was asked. */
function world(turns: Step[][]) {
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(":memory:");
  const asks: string[] = [];
  const agent: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "mock",
    async *start(run: RunSpec) {
      asks.push(run.ask);
      for (const step of turns[asks.length - 1] ?? []) yield step;
      yield { type: "done", text: "Finished." } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["mock", agent]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const view = (run: string) => fold(store.read(0)).runs[run];
  const settled = async (run: string, turnsExpected: number) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const done = store.forRun(run).filter((e) => e.kind === "turn.completed").length;
      if (done >= turnsExpected && ["reviewing", "done"].includes(view(run)?.status ?? "")) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(`timed out: ${view(run)?.status}, ${asks.length} turns`);
  };
  const quiet = () => new Promise((r) => setTimeout(r, 250)); // long enough for an unwanted extra turn to start
  return { store, supervisor, asks, view, settled, quiet };
}
const edit = (p = "src/clock.ts"): Step => ({ type: "file", path: p });
const check = (exitCode = 0): Step => ({ type: "check", command: "pnpm test", exitCode });
const turnsBy = (store: EventStore, run: string) => store.forRun(run).flatMap((e) => (e.kind === "turn.started" ? [e.body.by] : []));

it("a session that checked its last edit is verified at once, with no extra turn", async () => {
  const { store, supervisor, asks, view, settled, quiet } = world([[edit(), check()]]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await settled(run, 1);
  await quiet();
  expect(asks).toHaveLength(1);
  expect(view(run)?.status).toBe("reviewing");
  expect(view(run)?.verification).toEqual({ state: "verified", turn: 1, files: 1, command: "pnpm test", nudged: false });
  expect(turnsBy(store, run)).toEqual(["you"]);
});

it("a session that changed code and checked nothing is asked once to prove it, and is verified when it does", async () => {
  const { store, supervisor, asks, view, settled } = world([[edit()], [check()]]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await settled(run, 2);
  expect(asks).toHaveLength(2);
  expect(asks[1]).toMatch(/ran no check afterwards/);
  expect(turnsBy(store, run)).toEqual(["you", VERIFY_BY]);
  // The first verdict is on the record; the one that stands is the one after the proof turn.
  expect(store.forRun(run).flatMap((e) => (e.kind === "verify.decided" ? [`${e.body.state}/${e.body.nudged}`] : []))).toEqual(["unverified/false", "verified/true"]);
  expect(view(run)?.verification).toMatchObject({ state: "verified", turn: 2, nudged: true });
  expect(view(run)?.status).toBe("reviewing");
});

it("asks only once: a session that still proves nothing ends unverified instead of looping", async () => {
  const { supervisor, asks, view, settled, quiet } = world([[edit()], [], [check()]]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await settled(run, 2);
  await quiet();
  expect(asks).toHaveLength(2); // never a third turn
  expect(view(run)?.verification).toMatchObject({ state: "unverified", nudged: true });
  expect(view(run)?.status).toBe("reviewing"); // still yours to review, and labelled honestly
});

it("a failing check is sent back once, and the verdict says failing if it still fails", async () => {
  const { supervisor, asks, view, settled, quiet } = world([[edit(), check(1)], [check(1)]]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await settled(run, 2);
  await quiet();
  expect(asks).toHaveLength(2);
  expect(asks[1]).toMatch(/your last check failed \(pnpm test\)/);
  expect(view(run)?.verification).toMatchObject({ state: "failing", nudged: true, command: "pnpm test" });
});

it("your next ask gets its own verdict, and its own single request for proof", async () => {
  const { store, supervisor, asks, view, settled } = world([[edit(), check()], [edit("src/b.ts")], [check()]]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await settled(run, 1);
  supervisor.followUp(run, "Now make it injectable");
  await settled(run, 3);
  expect(asks).toHaveLength(3);
  expect(turnsBy(store, run)).toEqual(["you", "you", VERIFY_BY]);
  expect(view(run)?.verification).toMatchObject({ state: "verified", turn: 3, nudged: true });
});

it("leaves alone what isn't a code session: answers, docs, and work outside a repo", async () => {
  // An answer: nothing changed.
  const a = world([[]]);
  const answered = a.supervisor.launch({ ask: "Explain the clock", runtime: "mock", repo: repo() });
  await a.settled(answered, 1); await a.quiet();
  expect(a.asks).toHaveLength(1);
  expect(a.view(answered)?.verification).toBeUndefined();
  expect(a.store.forRun(answered).some((e) => e.kind === "verify.decided")).toBe(false);

  // Docs only: a test suite proves nothing about prose.
  const d = world([[edit("docs/plan.md")]]);
  const docs = d.supervisor.launch({ ask: "Write the plan", runtime: "mock", repo: repo() });
  await d.settled(docs, 1); await d.quiet();
  expect(d.asks).toHaveLength(1);
  expect(d.view(docs)?.verification).toBeUndefined();

  // No repo: not a session with a branch to review.
  const w = world([[edit()]]);
  const loose = w.supervisor.launch({ ask: "Scratch something", runtime: "mock" });
  await w.settled(loose, 1); await w.quiet();
  expect(w.asks).toHaveLength(1);
  expect(w.view(loose)?.verification).toBeUndefined();
});
