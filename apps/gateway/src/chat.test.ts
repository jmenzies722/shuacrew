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
  it("recovers the edited order from disk after the gateway restarts", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "shua-queue-"));
    const file = path.join(dir, "events.db");
    const store = new EventStore(file);
    const paused = new Supervisor(store, new Map([["mock", new MockRuntime()]]), { workspace: dir, concurrency: { mock: 0 } });
    const run = paused.launch({ ask: "initial", runtime: "mock" });
    const a = paused.followUp(run, "first");
    const b = paused.followUp(run, "second");
    paused.editFollowup(run, a, "revised", "first");
    paused.reorderFollowups(run, [b, a]);
    paused.shutdown();
    store.close();
    const reopened = new EventStore(file);
    const resumed = new Supervisor(reopened, new Map([["mock", new MockRuntime()]]), { workspace: dir });
    cleanups.push(() => { resumed.shutdown(); reopened.close(); });
    resumed.recover();
    await until(() => reopened.forRun(run).some((e) => e.kind === "turn.started"));
    const turn = reopened.forRun(run).find((e) => e.kind === "turn.started");
    expect(turn?.kind === "turn.started" && turn.body.text).toBe("second\n\nrevised");
  });
  it("edits and reorders pending messages without withdrawing them, then sends the saved order", async () => {
    const { store, supervisor, app, seen } = await world(60);
    const run = supervisor.launch({ ask: "Audit the sync path", runtime: "mock" });
    await until(() => store.forRun(run).some((e) => e.kind === "turn.started"));
    const a = supervisor.followUp(run, "Check retries");
    const b = supervisor.followUp(run, "Keep it short");
    const post = (suffix: string, payload: object) => app.inject({ method: "POST", url: `/api/runs/${run}/followups/${suffix}`, headers: { "x-shuacrew": "1" }, payload });
    expect((await post(`${a}/edit`, { text: "Check timeouts", expectedText: "Check retries" })).statusCode).toBe(200);
    expect((await post("reorder", { ids: [b, a] })).statusCode).toBe(200);
    // A stale editor cannot overwrite newer text; an incomplete order cannot lose a message.
    expect((await post(`${a}/edit`, { text: "Lost edit", expectedText: "Check retries" })).statusCode).toBe(409);
    expect((await post("reorder", { ids: [b, b] })).statusCode).toBe(409);
    expect((await post(`${a}/edit`, { text: "  ", expectedText: "Check timeouts" })).statusCode).toBe(400);
    await until(() => seen.length === 2 && ["done", "reviewing"].includes(status(store, run)));
    expect(seen[1]?.ask).toBe("Keep it short\n\nCheck timeouts");
    expect((await post(`${a}/edit`, { text: "Too late", expectedText: "Check timeouts" })).statusCode).toBe(409);
    expect((await post("reorder", { ids: [b, a] })).statusCode).toBe(409);
  });

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

describe("push & open a PR", () => {
  it("pushes the session branch (no force) and records the PR the GitHub CLI opened", async () => {
    const { store, supervisor, app } = await world();
    const { dir, git } = repo();
    const bare = mkdtempSync(path.join(os.tmpdir(), "shua-origin-"));
    execFileSync("git", ["init", "-q", "--bare", bare]);
    git("remote", "add", "origin", bare);
    // A stand-in `gh`: says no PR exists yet, then "creates" one and prints its URL with the args it got.
    const bin = mkdtempSync(path.join(os.tmpdir(), "shua-bin-"));
    writeFileSync(path.join(bin, "gh"), '#!/bin/sh\nif [ "$2" = "view" ]; then exit 1; fi\necho "https://github.com/me/app/pull/7"\necho "$@" > "$(dirname "$0")/args"\n', { mode: 0o755 });
    const PATH = process.env.PATH;
    process.env.PATH = `${bin}:${PATH}`;
    cleanups.push(() => (process.env.PATH = PATH));

    const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: dir });
    await until(() => ["reviewing", "done"].includes(status(store, run)));
    const res = await app.inject({ method: "POST", url: `/api/runs/${run}/pr`, headers: { "x-shuacrew": "1", "content-type": "application/json" }, payload: "{}" });
    expect(res.json()).toEqual({ url: "https://github.com/me/app/pull/7" });
    const branch = `shua/${run}`;
    expect(execFileSync("git", ["--git-dir", bare, "branch", "--list", branch]).toString()).toContain(branch); // pushed
    const { readFileSync } = await import("node:fs");
    const args = readFileSync(path.join(bin, "args"), "utf8");
    expect(args).toContain(`--head ${branch} --base main`);
    expect(args).toContain("What was asked");
    expect(fold(store.read(0)).runs[run]?.review?.pr).toBe("https://github.com/me/app/pull/7");
  });
});

describe("usage limits are per model", () => {
  it("a capped model moves the run to a sibling model on the same agent, and never blocks the agent", async () => {
    const { store, supervisor, seen } = await world();
    const run = supervisor.launch({ ask: "Hit the limit on the big model", runtime: "mock", model: "mock-frontier" });
    await until(() => ["reviewing", "done"].includes(status(store, run)));
    const routed = store.forRun(run).find((e) => e.kind === "run.routed");
    expect(routed?.kind === "run.routed" && routed.body).toMatchObject({ runtime: "mock", model: "mock-fast" });
    expect(supervisor.limitedUntil("mock")).toBe(0); // the agent itself is fine
    expect(supervisor.limitedUntil("mock", "mock-frontier")).toBeGreaterThan(Date.now());

    // "Auto" now steers around the capped model instead of queueing behind it.
    const auto = supervisor.launch({ ask: "Just say hi", runtime: "mock" });
    await until(() => ["reviewing", "done"].includes(status(store, auto)));
    expect(seen.find((s) => s.id === auto)?.model).toBe("mock-fast");

    // "Try now" lifts it.
    supervisor.restore("mock", "mock-frontier");
    expect(supervisor.limitedUntil("mock", "mock-frontier")).toBe(0);
  });
});
