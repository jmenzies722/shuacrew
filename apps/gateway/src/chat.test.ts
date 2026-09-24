import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function until(check: () => boolean, ms = 15000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
}

function repo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-chat-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "README.md"), "hello\n");
  writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
  git("add", "README.md");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  return { dir, git };
}

async function world(pace = 0) {
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(":memory:");
  const seen: RunSpec[] = [];
  const mock = new MockRuntime({ pace });
  const spy: Runtime = Object.assign(Object.create(mock), { start: (run: RunSpec, ctx: Parameters<Runtime["start"]>[1]) => (seen.push(run), mock.start(run, ctx)) });
  const supervisor = new Supervisor(store, new Map([["mock", spy]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
  const { app } = await createServer({ store, supervisor, runtimes: new Map() });
  cleanups.push(async () => (await app.close(), supervisor.shutdown(), store.close()));
  return { store, supervisor, app, seen };
}
const status = (store: EventStore, run: string) => fold(store.read(0)).runs[run]?.status ?? "";

describe("fork", () => {
  it("carries the conversation up to the turn, branches from its checkpoint, and waits for you", async () => {
    const { store, supervisor, seen } = await world();
    const { dir, git } = repo();
    const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: dir });
    await until(() => ["reviewing", "done"].includes(status(store, run)));
    const checkpoint = store.forRun(run).find((e) => e.kind === "checkpoint.created");
    const fork = supervisor.fork(run, 1);
    expect(status(store, fork)).toBe("done"); // no turn spent until you speak
    supervisor.followUp(fork, "Now make it injectable");
    await until(() => seen.some((s) => s.id === fork) && ["reviewing", "done"].includes(status(store, fork)) && store.forRun(fork).some((e) => e.kind === "turn.completed"));
    const first = seen.find((s) => s.id === fork)!;
    expect(first.ask).toContain("Add a clock module"); // the conversation it branched from
    expect(first.ask).toContain("Now make it injectable");
    const tree = store.forRun(fork).find((e) => e.kind === "run.worktree");
    const branch = tree?.kind === "run.worktree" ? tree.body.branch : "";
    const commit = checkpoint?.kind === "checkpoint.created" ? checkpoint.body.commit! : "";
    expect(git("merge-base", "--is-ancestor", commit, branch) === "" ).toBe(true); // starts from the checkpoint
  });
});

describe("queued messages", () => {
  it("a withdrawn message is never sent; the others are", async () => {
    const { store, supervisor } = await world(60);
    const run = supervisor.launch({ ask: "Audit the sync path", runtime: "mock" });
    await until(() => store.forRun(run).some((e) => e.kind === "turn.started"));
    const a = supervisor.followUp(run, "Also check retries");
    supervisor.followUp(run, "Keep it short");
    supervisor.withdraw(run, a);
    const turns = () => store.forRun(run).flatMap((e) => (e.kind === "turn.started" ? [e.body.text] : []));
    await until(() => turns().length === 2 && ["done", "reviewing"].includes(status(store, run)));
    expect(turns()[1]).toBe("Keep it short");
    expect(() => supervisor.withdraw(run, a)).toThrow(/already/);
  });
});

describe("file preview", () => {
  it("shows project files, never secrets or anything outside the project", async () => {
    const { store, supervisor, app } = await world();
    const { dir } = repo();
    const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: dir });
    await until(() => ["reviewing", "done"].includes(status(store, run)));
    const get = (p: string) => app.inject({ url: `/api/runs/${run}/file?path=${encodeURIComponent(p)}` });
    const ok = await get("README.md");
    expect(ok.statusCode).toBe(200);
    expect(ok.json().content).toBe("hello\n");
    expect((await get(path.join(dir, "README.md"))).statusCode).toBe(200); // named by the repo path
    expect((await get(".env")).statusCode).toBe(403);
    expect((await get("/etc/hosts")).statusCode).toBe(404);
    expect((await get("../../../etc/hosts")).statusCode).toBe(404);
  });
});
