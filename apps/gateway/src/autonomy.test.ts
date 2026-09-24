import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { Heartbeats, Scheduler, TaskRunner, Webhooks, parseTask } from "./autonomy.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

function world(options: { file?: string; pace?: number } = {}) {
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(options.file ?? ":memory:");
  const workspace = mkdtempSync(path.join(os.tmpdir(), "shua-ws-"));
  const runtimes = new Map<string, Runtime>([["mock", new MockRuntime({ pace: options.pace ?? 0 })]]);
  const supervisor = new Supervisor(store, runtimes, { workspace, roots: [] });
  const tasks = new TaskRunner(store, supervisor);
  cleanups.push(() => (supervisor.shutdown(), store.close()));
  return { store, supervisor, tasks, workspace };
}

function repo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-task-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "README.md"), "x\n");
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  return { dir, git };
}

async function until(check: () => boolean, ms = 15000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
}

const status = (store: EventStore, id: string) => fold(store.read(0)).runs[id]?.status;
const steps = (store: EventStore, id: string) =>
  store.forRun(id).flatMap((e) => (e.kind === "task.step" ? [`${e.body.index}:${e.body.status}`] : []));

describe("TASK.md", () => {
  it("reads title, goal, steps and the validate command", () => {
    const spec = parseTask("# Speed up CI\nCI takes 20 minutes.\n\n## Steps\n1. Profile it\n2. Cache deps\n- [ ] Split tests\n\n## Validate\n`pnpm test`\n");
    expect(spec).toEqual({ title: "Speed up CI", goal: "CI takes 20 minutes.", steps: ["Profile it", "Cache deps", "Split tests"], validate: "pnpm test" });
  });

  it("runs each step, retries a failing check with its output, commits each step, then goes to review", async () => {
    const { store, tasks } = world();
    const { dir, git } = repo();
    // Fails the first time it's run, passes after: a step that needs one retry.
    const id = tasks.start({ markdown: "# Clock\nInject the clock.\n\n## Steps\n1. Add the clock\n2. Use it\n\n## Validate\n`test -f .fixed || (touch .fixed; exit 1)`", repo: dir, runtime: "mock" });
    await until(() => status(store, id) === "reviewing");
    expect(steps(store, id)).toEqual(["0:started", "0:retrying", "0:passed", "1:started", "1:passed"]);
    const retried = store.forRun(id).find((e) => e.kind === "task.step" && e.body.status === "retrying");
    expect(retried).toBeDefined();
    const branch = store.forRun(id).find((e) => e.kind === "run.worktree");
    expect(git("log", "--oneline", branch?.kind === "run.worktree" ? branch.body.branch : "main")).toMatch(/task step 2[\s\S]*task step 1/);
  });

  it("stops rather than pressing on when the check keeps failing", async () => {
    const { store, tasks } = world();
    const { dir } = repo();
    const id = tasks.start({ markdown: "# Broken\n\n## Steps\n1. Try\n2. Never reached\n\n## Validate\n`echo boom; exit 1`", repo: dir, runtime: "mock" });
    await until(() => status(store, id) === "failed");
    expect(steps(store, id).at(-1)).toBe("0:failed");
    expect(steps(store, id)).not.toContain("1:started");
    const reason = [...store.forRun(id)].reverse().find((e) => e.kind === "run.status");
    expect(reason?.kind === "run.status" && reason.body.reason).toMatch(/same failure three times|still fails/);
    expect(steps(store, id).filter((s) => s === "0:retrying")).toHaveLength(2); // retried, with the output fed back, then stopped
  });

  it("plans the steps itself when the file doesn't list them", async () => {
    const { store, tasks } = world();
    const id = tasks.start({ markdown: "# Fix the flaky retry\nThe upload retry test flakes on CI.", runtime: "mock" });
    await until(() => status(store, id) === "reviewing");
    const plan = store.forRun(id).find((e) => e.kind === "task.planned");
    expect(plan?.kind === "task.planned" && plan.body.steps).toHaveLength(3);
    expect(steps(store, id).filter((s) => s.endsWith("passed"))).toHaveLength(3);
  });

  it("resumes at the next unfinished step after the gateway is killed mid-task", async () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "shua-db-")), "log.db");
    const first = world({ file, pace: 120 });
    const id = first.tasks.start({ markdown: "# Two steps\n\n## Steps\n1. One\n2. Two", runtime: "mock" });
    await until(() => steps(first.store, id).includes("0:passed") && steps(first.store, id).includes("1:started"));
    first.supervisor.shutdown(); // killed mid-step-2
    first.store.close();

    const second = world({ file });
    second.supervisor.recover();
    second.tasks.recover();
    await until(() => status(second.store, id) === "reviewing");
    expect(steps(second.store, id).filter((s) => s === "0:passed")).toHaveLength(1); // step 1 not redone
    expect(steps(second.store, id)).toContain("1:passed");
    expect(second.store.verify().ok).toBe(true);
  });
});

describe("schedules", () => {
  it("previews the next runs from plain words", () => {
    const { store, supervisor, workspace } = world();
    const scheduler = new Scheduler(store, supervisor, workspace);
    cleanups.push(() => scheduler.stop());
    const s = scheduler.set({ when: "every 15m", ask: "check CI" });
    expect(s.next).toHaveLength(5);
    expect(s.next[1]! - s.next[0]!).toBe(15 * 60_000);
    expect(() => scheduler.set({ when: "whenever", ask: "x" })).toThrow(/can't read/);
  });

  it("runs a script-only job without any model call, and escalates only when it says so", async () => {
    const { store, supervisor, workspace } = world();
    const scheduler = new Scheduler(store, supervisor, workspace);
    cleanups.push(() => scheduler.stop());
    const quiet = scheduler.set({ when: "hourly", script: "echo all fine", ask: "investigate" });
    expect(await scheduler.fire(quiet.id)).toBeUndefined();
    const loud = scheduler.set({ when: "hourly", script: "echo 'ESCALATE: 3 deps out of date'; exit 2", ask: "Update the stale dependencies", runtime: "mock" });
    const run = await scheduler.fire(loud.id);
    expect(run).toBeDefined();
    const created = store.forRun(run!).find((e) => e.kind === "run.created");
    expect(created?.kind === "run.created" && created.body.ask).toContain("3 deps out of date");
    expect(Object.keys(fold(store.read(0)).runs)).toHaveLength(1);
  });
});

describe("webhooks", () => {
  it("starts a run for a correctly signed delivery and refuses forged or stale ones", async () => {
    const { store, supervisor, workspace } = world();
    const webhooks = new Webhooks(store, supervisor, path.join(workspace, "secrets.json"));
    const { app } = await createServer({
      store,
      supervisor,
      runtimes: new Map([["mock", new MockRuntime({ pace: 0 })]]),
      autonomy: { scheduler: new Scheduler(store, supervisor, workspace), webhooks, heartbeats: new Heartbeats(store, supervisor, workspace), tasks: new TaskRunner(store, supervisor) },
    });
    cleanups.push(() => app.close());
    const { id, secret } = webhooks.create({ name: "CI failed", ask: "Look at why CI failed", runtime: "mock" });
    const body = JSON.stringify({ pipeline: 42, status: "failed" });
    const now = String(Math.floor(Date.now() / 1000));
    const send = (signature: string, timestamp = now) =>
      app.inject({ method: "POST", url: `/hooks/${id}`, headers: { "content-type": "application/json", "x-shuacrew-signature": signature, "x-shuacrew-timestamp": timestamp }, payload: body });

    expect((await send("sha256=forged")).statusCode).toBe(401);
    expect((await send(Webhooks.sign(secret, String(Number(now) - 900), body), String(Number(now) - 900))).statusCode).toBe(401);
    const ok = await send(Webhooks.sign(secret, now, body));
    expect(ok.statusCode).toBe(202);
    const created = store.forRun(ok.json().run).find((e) => e.kind === "run.created");
    expect(created?.kind === "run.created" && created.body.ask).toContain('"pipeline": 42');
    expect(JSON.stringify([...store.read(0)])).not.toContain(secret); // the secret never enters the log
  });
});

describe("heartbeats", () => {
  it("wakes an agent once after the threshold, then stays quiet until it recovers", async () => {
    const { store, supervisor, workspace } = world();
    const beats = new Heartbeats(store, supervisor, workspace);
    cleanups.push(() => beats.stop());
    const flag = path.join(workspace, "down");
    writeFileSync(flag, "");
    const id = beats.set({ name: "API up", command: `test ! -f ${flag}`, everyMinutes: 5, threshold: 2, ask: "Find out why the API is down" });
    expect(await beats.check(id)).toEqual({ ok: false });
    const second = await beats.check(id);
    expect(second.run).toBeDefined();
    expect((await beats.check(id)).run).toBeUndefined(); // no second agent for the same outage
    execFileSync("rm", [flag]);
    expect(await beats.check(id)).toEqual({ ok: true });
    expect(beats.list()[0]).toMatchObject({ ok: true, streak: 0 });
  });
});
