import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold, parseBody, type AnyEvent } from "@shuacrew/core";
import { MockRuntime, type Runtime } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { coalesce } from "./hub.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function setup(options: { file?: string; concurrency?: Record<string, number>; runtimes?: Map<string, Runtime> } = {}) {
  const store = new EventStore(options.file ?? ":memory:");
  const runtimes = options.runtimes ?? new Map<string, Runtime>([["mock", new MockRuntime({ pace: 0 })]]);
  const workspace = mkdtempSync(path.join(os.tmpdir(), "shua-ws-"));
  const supervisor = new Supervisor(store, runtimes, { workspace, roots: [], concurrency: options.concurrency, approvalTimeoutMs: 60_000 });
  cleanups.push(() => store.close());
  return { store, supervisor, workspace };
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const state = (store: EventStore) => fold(store.read(0));

describe("runs", () => {
  it("runs a task to completion and records what happened", async () => {
    const { store, supervisor } = setup();
    const id = supervisor.launch({ ask: "fix the flaky upload test", runtime: "mock" });
    await until(() => state(store).runs[id]?.status === "done");
    const run = state(store).runs[id]!;
    expect(run.checks.map((c) => c.passed)).toEqual([false, true]);
    expect(run.files).toContain("src/upload.ts");
    expect(run.usage.inputTokens).toBeGreaterThan(0);
    expect(store.forRun(id).some((e) => e.kind === "agent.delta")).toBe(true);
  });

  it("holds an outward action for a person, then carries on once allowed", async () => {
    const { store, supervisor } = setup();
    const id = supervisor.launch({ ask: "fix it and push", runtime: "mock" });
    await until(() => Object.keys(state(store).approvals).length === 1);
    expect(state(store).runs[id]!.status).toBe("awaiting_approval");
    const [approval] = Object.values(state(store).approvals);
    expect(approval).toMatchObject({ tool: "Bash", rule: "ask.outward", risk: "high" });
    expect(supervisor.decideApproval(approval!.id, true)).toBe(true);
    await until(() => state(store).runs[id]!.status === "done");
    const pushed = store.forRun(id).filter((e) => e.kind === "tool.returned").at(-1);
    expect(pushed?.kind === "tool.returned" && pushed.body.output).toBe("pushed");
  });

  it("keeps a deny absolute even for a run started with approve-all", async () => {
    const denying: Runtime = {
      ...new MockRuntime({ pace: 0 }),
      id: "mock",
      label: "m",
      authMode: "subscription",
      capabilities: { subagents: false, checkpoints: false, cost: false, images: false, resume: false },
      models: [],
      status: async () => ({ installed: true, signedIn: true, detail: "", overridingKeys: [] }),
      async *start(_run, ctx) {
        const answer = await ctx.approve("Bash", { command: "rm -rf /" });
        yield { type: "done", text: answer.allow ? "ran it" : `refused: ${answer.reason}` };
      },
    };
    const { store, supervisor } = setup({ runtimes: new Map([["mock", denying]]) });
    const id = supervisor.launch({ ask: "clean up", runtime: "mock", approveAll: true });
    await until(() => state(store).runs[id]?.status === "done");
    expect(state(store).runs[id]!.ticker).toContain("refused");
    const decided = store.ofKinds("policy.decided").at(-1);
    expect(decided?.kind === "policy.decided" && decided.body).toMatchObject({ verdict: "deny", rule: "deny.rm-root" });
  });

  it("pauses on a usage limit instead of failing, and resumes when the window resets", async () => {
    const { store, supervisor } = setup();
    const id = supervisor.launch({ ask: "this will hit the limit", runtime: "mock" });
    await until(() => state(store).runs[id]?.status === "paused");
    expect(state(store).limited.mock).toBeDefined();
    const other = supervisor.launch({ ask: "another task", runtime: "mock" });
    await new Promise((r) => setTimeout(r, 50));
    expect(state(store).runs[other]!.status).toBe("queued"); // held while the window is exhausted
    supervisor.restore("mock");
    await until(() => state(store).runs[other]!.status === "done" && state(store).runs[id]!.status === "done");
    expect(state(store).limited.mock).toBeUndefined();
    expect(state(store).runs[id]!.turns).toBe(2); // the paused run picked up where it stopped
  });

  it("answers a follow-up in the same run, resuming the runtime's conversation", async () => {
    const { store, supervisor } = setup();
    const id = supervisor.launch({ ask: "fix the test", runtime: "mock" });
    await until(() => state(store).runs[id]?.status === "done");
    supervisor.followUp(id, "now also update the docs");
    await until(() => state(store).runs[id]!.turns === 2 && state(store).runs[id]!.status === "done");
    const turns = store.forRun(id).filter((e) => e.kind === "turn.started");
    expect(turns.map((e) => e.kind === "turn.started" && e.body.text)).toEqual(["fix the test", "now also update the docs"]);
  });

  it("caps how many runs one runtime works on at once", async () => {
    const slow = new MockRuntime({ pace: 30 });
    const { store, supervisor } = setup({ concurrency: { mock: 2 }, runtimes: new Map([["mock", slow]]) });
    const ids = [1, 2, 3, 4].map((n) => supervisor.launch({ ask: `task ${n}`, runtime: "mock" }));
    await until(() => ids.filter((id) => state(store).runs[id]?.status === "running").length === 2);
    expect(ids.filter((id) => state(store).runs[id]?.status === "queued")).toHaveLength(2);
    await until(() => ids.every((id) => state(store).runs[id]?.status === "done"), 15000);
  });

  it("resumes runs that were in flight when the gateway stopped", async () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "shua-db-")), "log.db");
    const first = setup({ file, runtimes: new Map([["mock", new MockRuntime({ pace: 200 })]]) });
    const id = first.supervisor.launch({ ask: "long task", runtime: "mock" });
    await until(() => state(first.store).runs[id]?.status === "running");
    first.supervisor.shutdown(); // the gateway dies mid-run
    first.store.close();

    const second = setup({ file });
    expect(second.supervisor.recover()).toEqual([id]);
    await until(() => state(second.store).runs[id]?.status === "done");
    expect(second.store.verify().ok).toBe(true);
  });
});

describe("worktrees", () => {
  it("gives a repo run its own branch and worktree, and shows its diff", async () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), "shua-repo-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" }).toString();
    git("init", "-q", "-b", "main");
    writeFileSync(path.join(repo, "README.md"), "hello\n");
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");

    process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
    const { store, supervisor } = setup();
    const id = supervisor.launch({ ask: "fix it", runtime: "mock", repo });
    await until(() => ["reviewing", "done"].includes(state(store).runs[id]?.status ?? ""));
    const run = state(store).runs[id]!;
    expect(run.worktree).toMatchObject({ branch: `shua/${id}`, base: "main" });
    expect(git("branch", "--list", `shua/${id}`)).toContain(`shua/${id}`);
    expect(run.checkpoints.length).toBeGreaterThan(0);
    expect(run.checkpoints[0]!.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("the hub", () => {
  let seq = 0;
  const ev = (kind: string, body: object, run = "r1"): AnyEvent =>
    ({ seq: ++seq, at: 0, kind, run, session: null, body: parseBody(kind as never, body), prev: "", hash: "" }) as AnyEvent;

  it("merges text deltas for a slow client but never drops a state change", () => {
    const merged = coalesce([
      ev("agent.delta", { turn: 1, text: "Hel" }),
      ev("agent.delta", { turn: 1, text: "lo " }),
      ev("agent.delta", { turn: 1, text: "there" }, "r2"),
      ev("run.status", { status: "done" }),
      ev("agent.delta", { turn: 1, text: "!" }),
    ]);
    expect(merged.map((e) => e.kind)).toEqual(["agent.delta", "agent.delta", "run.status", "agent.delta"]);
    expect(merged[0]!.kind === "agent.delta" && merged[0]!.body.text).toBe("Hello ");
  });
});

describe("the server", () => {
  it("refuses state changes without the CSRF header, and serves a snapshot", async () => {
    const { store, supervisor } = setup();
    const { app } = await createServer({ store, supervisor, runtimes: new Map([["mock", new MockRuntime({ pace: 0 })]]) });
    cleanups.push(() => app.close());
    const refused = await app.inject({ method: "POST", url: "/api/runs", payload: { ask: "x" } });
    expect(refused.statusCode).toBe(403);
    const created = await app.inject({ method: "POST", url: "/api/runs", headers: { "x-shuacrew": "1" }, payload: { ask: "hello", runtime: "mock" } });
    expect(created.statusCode).toBe(200);
    const id = created.json().id as string;
    await until(() => state(store).runs[id]?.status === "done");
    const snapshot = (await app.inject({ method: "GET", url: "/api/snapshot" })).json();
    expect(snapshot.runs[id].status).toBe("done");
    expect((await app.inject({ method: "GET", url: "/api/audit/verify" })).json()).toMatchObject({ ok: true });
  });

  it("will not listen beyond loopback without a token", async () => {
    const { store, supervisor } = setup();
    await expect(createServer({ store, supervisor, runtimes: new Map(), host: "0.0.0.0" })).rejects.toThrow(/token/);
  });

  it("notices a tampered log", () => {
    const { store } = setup();
    store.append("gateway.started", { pid: 1, version: "t" });
    store.append("gateway.started", { pid: 2, version: "t" });
    store.unsafeExec(`UPDATE events SET body = '{"pid":99,"version":"t"}' WHERE seq = 1`);
    expect(store.verify()).toMatchObject({ ok: false, brokenAt: 1 });
  });
});
