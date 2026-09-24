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

describe("attachments", () => {
  it("stores what you attach under its own id, private, and serves it back by id only", async () => {
    const store = new EventStore(":memory:");
    const supervisor = new Supervisor(store, new Map(), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
    const { Uploads } = await import("./uploads.js");
    const root = mkdtempSync(path.join(os.tmpdir(), "shua-up-"));
    const { app } = await createServer({ store, supervisor, runtimes: new Map(), uploads: new Uploads(root) });
    cleanups.push(async () => (await app.close(), supervisor.shutdown(), store.close()));
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const up = await app.inject({ method: "POST", url: `/api/uploads?name=${encodeURIComponent("../../evil shot.png")}`, headers: { "x-shuacrew": "1", "content-type": "application/octet-stream" }, payload: png });
    expect(up.statusCode).toBe(200);
    const file = up.json() as { id: string; name: string; path: string; type: string; size: number };
    expect(file).toMatchObject({ name: "evil shot.png", type: "image/png", size: 8 });
    expect(file.path.startsWith(root)).toBe(true); // the name never escapes the folder
    const { statSync } = await import("node:fs");
    expect(statSync(file.path).mode & 0o777).toBe(0o600);
    const back = await app.inject({ url: `/api/uploads/${file.id}` });
    expect(back.headers["content-type"]).toBe("image/png");
    expect(back.rawPayload.equals(png)).toBe(true);
    expect((await app.inject({ url: "/api/uploads/..%2F..%2Fetc" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/uploads?name=x", headers: { "content-type": "application/octet-stream" }, payload: png })).statusCode).toBe(403); // CSRF header required
  });
});

describe("stopping a session", () => {
  it("answers its pending approvals so they leave the queue", async () => {
    const { store, supervisor } = await world();
    const run = supervisor.launch({ ask: "Fix it and ship it", runtime: "mock" });
    await until(() => Object.keys(fold(store.read(0)).approvals).length === 1);
    supervisor.cancel(run);
    expect(fold(store.read(0)).approvals).toEqual({});
    expect(status(store, run)).toBe("cancelled");
  });
});
