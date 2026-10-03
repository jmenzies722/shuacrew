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
    expect(run.usage.inputTokens).toBe(0); // demo observations never become real consumption
    expect(store.forRun(id).some(e => e.kind === "usage.recorded" && e.body.inputTokens > 0)).toBe(true);
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

  it("fails over to another subscription once, with a recap, and never bounces back", async () => {
    const asks: string[] = [];
    const base = { authMode: "subscription" as const, capabilities: { subagents: false, checkpoints: false, cost: false, images: false, resume: true }, models: [], status: async () => ({ installed: true, signedIn: true, detail: "", overridingKeys: [] }) };
    const limited: Runtime = { ...base, id: "codexish", label: "limited", async *start(run) { asks.push(`codexish:${run.ask}`); yield { type: "session", id: "c-1" }; yield { type: "limited", until: Date.now() + 3_600_000, message: "usage limit" }; } };
    const other: Runtime = { ...base, id: "claudeish", label: "fine", async *start(run) { asks.push(`claudeish:${run.resume ?? "fresh"}:${run.ask}`); yield { type: "session", id: "k-1" }; yield { type: "done", text: "done it" }; } };
    const store = new EventStore();
    cleanups.push(() => store.close());
    const supervisor = new Supervisor(store, new Map([["codexish", limited], ["claudeish", other]]), { workspace: os.tmpdir(), failover: true });
    const id = supervisor.launch({ ask: "fix the build", runtime: "codexish" });
    await until(() => state(store).runs[id]?.status === "done");
    expect(asks).toHaveLength(2);
    expect(asks[0]).toBe("codexish:fix the build");
    expect(asks[1]).toMatch(/^claudeish:fresh:You are continuing a ShuaCrew run/); // no foreign resume id; a recap instead
    expect(asks[1]).toContain("fix the build");
    expect(state(store).runs[id]!.runtime).toBe("claudeish");
  });

  it("a capped Spark conversation goes to the other provider, never through every sibling into a pause", async () => {
    const asks: string[] = [];
    const base = { authMode: "subscription" as const, capabilities: { subagents: false, checkpoints: false, cost: false, images: false, resume: true }, status: async () => ({ installed: true, signedIn: true, detail: "", overridingKeys: [] }) };
    // Every model on this account is capped for the week (Sonnet, Fable, Opus, Haiku on 2 Oct).
    const capped: Runtime = { ...base, id: "claudeish", label: "capped", models: ["s", "f", "o", "h"].map((id) => ({ id, label: id, tier: "balanced" as const })),
      async *start(run) { asks.push(`claudeish:${run.model}`); yield { type: "limited", model: run.model, until: Date.now() + 3_600_000, message: "weekly limit" }; } };
    const free: Runtime = { ...base, id: "codexish", label: "free", models: [{ id: "t", label: "t", tier: "balanced" as const }], async *start() { asks.push("codexish"); yield { type: "done", text: "4" }; } };
    const store = new EventStore();
    cleanups.push(() => store.close());
    const supervisor = new Supervisor(store, new Map([["claudeish", capped], ["codexish", free]]), { workspace: os.tmpdir(), failover: true });
    const id = supervisor.launch({ ask: "what is 2 plus 2", runtime: "claudeish", model: "s", labels: ["buddy"] });
    await until(() => state(store).runs[id]?.status === "done");
    expect(asks).toEqual(["claudeish:s", "codexish"]); // straight across: no Fable → Opus → Haiku → paused until Sunday
  });

  it("crew work tries a sibling model first, and still reaches the other provider after it", async () => {
    const asks: string[] = [];
    const base = { authMode: "subscription" as const, capabilities: { subagents: false, checkpoints: false, cost: false, images: false, resume: true }, status: async () => ({ installed: true, signedIn: true, detail: "", overridingKeys: [] }) };
    const capped: Runtime = { ...base, id: "claudeish", label: "capped", models: ["s", "f", "o"].map((id) => ({ id, label: id, tier: "balanced" as const })),
      async *start(run) { asks.push(`claudeish:${run.model}`); yield { type: "limited", model: run.model, until: Date.now() + 3_600_000, message: "weekly limit" }; } };
    const free: Runtime = { ...base, id: "codexish", label: "free", models: [{ id: "t", label: "t", tier: "balanced" as const }], async *start() { asks.push("codexish"); yield { type: "done", text: "done" }; } };
    const store = new EventStore();
    cleanups.push(() => store.close());
    const supervisor = new Supervisor(store, new Map([["claudeish", capped], ["codexish", free]]), { workspace: os.tmpdir(), failover: true });
    const id = supervisor.launch({ ask: "fix the build", runtime: "claudeish", model: "s" });
    await until(() => state(store).runs[id]?.status === "done");
    expect(asks).toEqual(["claudeish:s", "claudeish:f", "claudeish:o", "codexish"]); // two siblings, then across — not paused
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

describe("review and the merge queue", () => {
  function repoWithCheck(check?: string) {
    const repo = mkdtempSync(path.join(os.tmpdir(), "shua-merge-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" }).toString().trim();
    git("init", "-q", "-b", "main");
    writeFileSync(path.join(repo, "README.md"), "hello\n");
    if (check) {
      execFileSync("mkdir", ["-p", path.join(repo, ".shuacrew")]);
      writeFileSync(path.join(repo, ".shuacrew", "merge-check"), check);
    }
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    return { repo, git };
  }

  it("lands two parallel runs on one repo, one at a time, both cleanly", async () => {
    process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
    const { repo, git } = repoWithCheck("test -f README.md");
    const { store, supervisor } = setup();
    const { app, merges } = await createServer({ store, supervisor, runtimes: new Map([["mock", new MockRuntime({ pace: 0 })]]) });
    cleanups.push(() => app.close());
    const a = supervisor.launch({ ask: "add the retry clock", runtime: "mock", repo });
    const b = supervisor.launch({ ask: "add the sync clock", runtime: "mock", repo });
    await until(() => [a, b].every((id) => state(store).runs[id]?.status === "reviewing"), 15000);

    const diff = (await app.inject({ method: "GET", url: `/api/runs/${a}/diff` })).json();
    expect(diff.files.map((f: { path: string }) => f.path)).toEqual(["src/add-the-retry-clock.ts"]);
    expect(diff.files[0].before).toBe("");
    expect(diff.files[0].after).toContain("export function retry");

    for (const id of [a, b]) {
      const reviewed = await app.inject({ method: "POST", url: `/api/runs/${id}/review`, headers: { "x-shuacrew": "1" }, payload: { approve: true } });
      expect(reviewed.statusCode).toBe(200);
    }
    await merges.idle();
    expect([a, b].map((id) => state(store).runs[id]!.status)).toEqual(["merged", "merged"]);
    expect(git("ls-files", "src")).toBe("src/add-the-retry-clock.ts\nsrc/add-the-sync-clock.ts");
    expect(git("branch", "--list", "shua/*")).toBe(""); // worktrees and branches cleaned up
  });

  it("sends a run back to review when the merge check fails after the rebase", async () => {
    process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
    const { repo } = repoWithCheck("exit 3");
    const { store, supervisor } = setup();
    const { app, merges } = await createServer({ store, supervisor, runtimes: new Map([["mock", new MockRuntime({ pace: 0 })]]) });
    cleanups.push(() => app.close());
    const id = supervisor.launch({ ask: "add a clock", runtime: "mock", repo });
    await until(() => state(store).runs[id]?.status === "reviewing", 10000);
    await app.inject({ method: "POST", url: `/api/runs/${id}/review`, headers: { "x-shuacrew": "1" }, payload: { approve: true } });
    await merges.idle();
    const run = state(store).runs[id]!;
    expect(run.status).toBe("reviewing");
    expect(run.review?.failed).toMatch(/checks failed/);
  });

  it("turns review comments into one follow-up turn, and a rejection into a lesson", async () => {
    const { store, supervisor } = setup();
    const { app } = await createServer({ store, supervisor, runtimes: new Map([["mock", new MockRuntime({ pace: 0 })]]) });
    cleanups.push(() => app.close());
    const id = supervisor.launch({ ask: "fix it", runtime: "mock" });
    await until(() => state(store).runs[id]?.status === "done");
    await app.inject({ method: "POST", url: `/api/runs/${id}/comments`, headers: { "x-shuacrew": "1" }, payload: { comments: [{ file: "src/a.ts", line: 4, text: "use the injected clock here too" }] } });
    await until(() => state(store).runs[id]!.turns === 2 && state(store).runs[id]!.status === "done");
    const second = store.forRun(id).filter((e) => e.kind === "turn.started")[1];
    expect(second?.kind === "turn.started" && second.body.text).toContain("src/a.ts:4 — use the injected clock");
    await app.inject({ method: "POST", url: `/api/runs/${id}/review`, headers: { "x-shuacrew": "1" }, payload: { approve: false, lesson: "Always run the frontend checks before calling it done" } });
    const lesson = store.ofKinds("lesson.learned").at(-1);
    expect(lesson?.kind === "lesson.learned" && lesson.body).toMatchObject({ origin: "review", text: "Always run the frontend checks before calling it done" });
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

describe("web shell", () => {
  it("serves assets from a rebuild made while running, and never answers a missing asset with HTML", async () => {
    const store = new EventStore(":memory:");
    const supervisor = new Supervisor(store, new Map(), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
    const web = mkdtempSync(path.join(os.tmpdir(), "shua-web-"));
    writeFileSync(path.join(web, "index.html"), "<!doctype html>shell");
    const { app } = await createServer({ store, supervisor, runtimes: new Map(), webRoot: web });
    try {
      execFileSync("mkdir", [path.join(web, "assets")]);
      writeFileSync(path.join(web, "assets", "index-new.js"), "export {}");
      const fresh = await app.inject({ url: "/assets/index-new.js" });
      expect(fresh.statusCode).toBe(200);
      expect(fresh.headers["content-type"]).toMatch(/javascript/);
      expect((await app.inject({ url: "/assets/gone.css" })).statusCode).toBe(404);
      expect((await app.inject({ url: "/assets/..%2F..%2Fetc%2Fpasswd.txt" })).statusCode).toBe(404);
      expect((await app.inject({ url: "/runs/r_1" })).body).toContain("shell");
    } finally {
      await app.close();
      supervisor.shutdown();
      store.close();
    }
  });
});

describe("web shell caching", () => {
  it("revalidates the shell every time and caches hashed assets for good", async () => {
    const store = new EventStore(":memory:");
    const supervisor = new Supervisor(store, new Map(), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
    const web = mkdtempSync(path.join(os.tmpdir(), "shua-web-"));
    writeFileSync(path.join(web, "index.html"), "<!doctype html>shell");
    execFileSync("mkdir", [path.join(web, "assets")]);
    writeFileSync(path.join(web, "assets", "app-abc.js"), "export {}");
    const { app } = await createServer({ store, supervisor, runtimes: new Map(), webRoot: web });
    try {
      expect((await app.inject({ url: "/" })).headers["cache-control"]).toBe("no-cache");
      expect((await app.inject({ url: "/sessions/r_1" })).headers["cache-control"]).toBe("no-cache");
      expect((await app.inject({ url: "/assets/app-abc.js" })).headers["cache-control"]).toContain("immutable");
      expect((await app.inject({ url: "/api/health" })).json().build).toMatch(/^\d+$/);
    } finally {
      await app.close();
      supervisor.shutdown();
      store.close();
    }
  });
});

describe("archiving a session", () => {
  it("puts an idle session away, keeps the audit chain whole, and refuses while it works", async () => {
    const store = new EventStore(":memory:");
    const supervisor = new Supervisor(store, new Map([["mock", new MockRuntime({ pace: 40 })]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
    const { app } = await createServer({ store, supervisor, runtimes: new Map() });
    try {
      const run = supervisor.launch({ ask: "Audit the sync path", runtime: "mock" });
      const post = () => app.inject({ method: "POST", url: `/api/runs/${run}/archive`, headers: { "x-shuacrew": "1", "content-type": "application/json" }, payload: "{}" });
      expect((await post()).statusCode).toBe(409);
      while (!["done", "reviewing"].includes(fold(store.read(0)).runs[run]?.status ?? "")) await new Promise((r) => setTimeout(r, 20));
      expect((await post()).statusCode).toBe(200);
      expect(fold(store.read(0)).runs[run]).toBeUndefined();
      expect((await app.inject({ url: "/api/snapshot" })).json().runs[run]).toBeUndefined();
      expect(store.verify().ok).toBe(true);
    } finally {
      await app.close();
      supervisor.shutdown();
      store.close();
    }
  });
});

it("validates and persists companion receipts through the authenticated action routes", async () => {
 const {store,supervisor}=setup(); const {app}=await createServer({store,supervisor,runtimes:new Map(),briefingAt:false});cleanups.push(()=>app.close());
 const headers={"x-shuacrew":"1"};const payload={id:"voice-test:0",owner:"12345678-1234-1234-1234-123456789abc",fingerprint:"a".repeat(64)};
 expect((await app.inject({method:"POST",url:"/api/companion/actions/claim",headers,payload})).json().claimed).toBe(true);
 expect((await app.inject({method:"POST",url:"/api/companion/actions/claim",headers,payload})).json().claimed).toBe(false);
 expect((await app.inject({method:"POST",url:"/api/companion/actions/finish",headers,payload:{id:payload.id,owner:payload.owner,result:{ok:true,message:"Verified"}}})).json().saved).toBe(true);
 expect((await app.inject({method:"POST",url:"/api/companion/actions/claim",headers,payload})).json().result.message).toBe("Verified");
 expect((await app.inject({method:"POST",url:"/api/companion/actions/claim",headers,payload:{}})).statusCode).toBe(400);
});
