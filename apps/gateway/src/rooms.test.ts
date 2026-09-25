import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { fold, decide, defaultContext, defaultRules, normalise } from "@shuacrew/core";
import { MockRuntime, type RunSpec, type RunContext, type RuntimeEvent } from "@shuacrew/runtimes";
import { EventStore } from "./store.js";
import { Crew } from "./crew.js";
import { Supervisor } from "./runs.js";
import { RoomCoordinator } from "./rooms.js";
import { createServer } from "./server.js";
import { ToolServer } from "./toolserver.js";
import { Library } from "./library.js";
import { Worktrees } from "./worktrees.js";
import { VoiceSessions } from "./voice-sessions.js";

const cleanup: (() => void)[] = [];
it("permits validated internal room tools but not arbitrary tools with a crew prefix", () => {
  const verdict = (tool: string) => decide(normalise(tool, {}), defaultContext("/tmp/test-room"), [{ name: "global", rules: defaultRules() }]).verdict;
  for (const tool of ["crew_delegate", "crew_message", "crew_status"]) expect(verdict(`mcp__shuacrew__${tool}`)).toBe("allow");
  expect(verdict("mcp__shuacrew__crew_delete_all")).not.toBe("allow");
});
it("uses genuinely separate git worktrees for coordinator and specialist without changing the source checkout", async () => {
  const w = world(); const dir = mkdtempSync(path.join(os.tmpdir(), "shua-room-repo-"));
  // Clone existing committed fixture history; this test creates no commits or remote writes.
  const repo = path.join(dir, "repo"); execFileSync("git", ["clone", "--shared", "--no-hardlinks", "--quiet", process.cwd(), repo]);
  Object.assign(w.supervisor, { worktrees: new Worktrees(path.join(dir, "trees")) });
  const room = w.rooms.create({ title: "Isolated", coordinator: "shua", members: ["shua", "eli"], repo });
  expect(room.base).toMatch(/^[a-f0-9]{40}$/);
  const root = w.rooms.send(room.id, randomUUID(), "Public fixture");
  await vi.waitFor(() => expect(w.captured.has(root.runId)).toBe(true));
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Public fixture" });
  await vi.waitFor(() => expect(w.captured.has(child.runId)).toBe(true));
  const parentPath = w.captured.get(root.runId)!.spec.cwd, childPath = w.captured.get(child.runId)!.spec.cwd;
  expect(parentPath).not.toBe(childPath); expect(parentPath).not.toBe(repo); expect(childPath).not.toBe(repo);
  writeFileSync(path.join(parentPath, "room-isolation.txt"), "parent"); writeFileSync(path.join(childPath, "room-isolation.txt"), "child");
  expect(readFileSync(path.join(parentPath, "room-isolation.txt"), "utf8")).toBe("parent");
  expect(execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()).toBe("");
});
afterEach(() => cleanup.splice(0).forEach(f => f()));
function world() {
  const store = new EventStore(":memory:"), crew = new Crew(store);
  const captured = new Map<string, { spec: RunSpec; ctx: RunContext; finish: (ok?: boolean) => void }>();
  function runtime(id: string) {
    return Object.assign(new MockRuntime(), { id, async *start(spec: RunSpec, ctx: RunContext): AsyncIterable<RuntimeEvent> {
      const result = await new Promise<boolean>(resolve => { captured.set(spec.id, { spec, ctx, finish: (ok = true) => resolve(ok) }); ctx.signal.addEventListener("abort", () => resolve(false), { once: true }); });
      if (ctx.signal.aborted) return;
      if (result) yield { type: "done", text: `Result from ${id}` }; else yield { type: "error", message: "Controlled failure" };
    } });
  }
  const runtimes = new Map([["claude", runtime("claude")], ["codex", runtime("codex")]]);
  for (const [id, provider] of [["shua", "claude"], ["eli", "codex"], ["rhea", "claude"]] as const) crew.set({ id, name: id, role: "Test", persona: "Public test", runtime: provider, delegatable: true, color: "#ffffff", emoji: "", triggers: [] });
  let rooms: RoomCoordinator;
  const supervisor = new Supervisor(store, runtimes, { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-room-")), roots: [os.tmpdir()], crew, concurrency: { claude: 10, codex: 10 }, canStart: id => rooms?.canStart(id) ?? false, runHint: id => rooms?.hint(id) });
  rooms = new RoomCoordinator(store, supervisor, crew, runtimes);
  cleanup.push(() => { rooms.close(); supervisor.shutdown(); crew.stop(); store.close(); });
  const room = rooms.create({ title: "Public review", coordinator: "shua", members: ["shua", "eli", "rhea"] });
  return { store, crew, runtimes, supervisor, rooms, room, captured };
}
async function tick() { await new Promise(resolve => setTimeout(resolve, 20)); }
it("durably queues behind active work, rejects conflicts and cancels pending entries", async () => {
  const w = world(); w.rooms.send(w.room.id, randomUUID(), "first");
  const now = Date.now(), input = { requestId: randomUUID(), text: "second", issuedAt: now, expiresAt: now + 60000 };
  const queued = w.rooms.enqueue(w.room.id, input);
  expect(queued.state).toBe("pending");
  expect(w.rooms.enqueue(w.room.id, input)).toEqual(queued);
  expect(() => w.rooms.enqueue(w.room.id, { ...input, text: "different" })).toThrow(/conflict/i);
  await tick(); expect(w.room.turns).toHaveLength(1);
  expect(w.rooms.cancelPending(w.room.id, input.requestId)).toBe("cancelled");
  expect(w.rooms.cancelPending(w.room.id, input.requestId)).toBe("cancelled");
});
it("dispatches follow-ups FIFO only after prior work settles", async () => {
  const w = world(), first = w.rooms.send(w.room.id, randomUUID(), "first");
  const now = Date.now(), second = { requestId: randomUUID(), text: "second", issuedAt: now, expiresAt: now + 60000 };
  w.rooms.enqueue(w.room.id, second);
  await tick(); expect(w.room.turns).toHaveLength(1);
  w.captured.get(first.runId)!.finish(); await tick(); await tick();
  const entry = w.rooms.get(w.room.id)!.queue![second.requestId]!;
  expect(entry.state).toBe("started"); expect(entry.runId).toBe(`r_queue-${second.requestId}`);
  expect(w.rooms.cancelPending(w.room.id, second.requestId)).toBe("already-started");
  w.rooms.recover(); await tick();
  expect([...w.store.read(0)].filter(e => e.kind === "run.created" && e.run === entry.runId)).toHaveLength(1);
});
it("holds queued work after failure until explicit resume", async () => {
  const w = world(), first = w.rooms.send(w.room.id, randomUUID(), "first");
  const now = Date.now(), input = { requestId: randomUUID(), text: "second", issuedAt: now, expiresAt: now + 60000 };
  w.rooms.enqueue(w.room.id, input); await tick(); w.captured.get(first.runId)!.finish(false); await tick(); await tick();
  expect(w.rooms.get(w.room.id)!.queue![input.requestId]!.state).toBe("pending");
  expect(w.rooms.get(w.room.id)!.paused).toBe(true);
  w.rooms.pause(w.room.id, false); await tick();
  expect(w.rooms.get(w.room.id)!.queue![input.requestId]!.state).toBe("started");
});
it("recovers a queue reservation once after a launch failure without crashing the owner", async () => {
  const w = world(), now = Date.now();
  const input = { requestId: randomUUID(), text: "Recover safely", issuedAt: now, expiresAt: now + 60000 };
  const launch = vi.spyOn(w.supervisor, "launch").mockImplementationOnce(() => { throw new Error("Temporary launch failure"); });
  w.rooms.enqueue(w.room.id, input);
  expect(() => w.rooms.recover()).not.toThrow();
  expect(w.room.paused).toBe(true);
  expect(w.room.queue![input.requestId]!.state).toBe("pending");
  w.rooms.pause(w.room.id, false); w.rooms.recover(); await tick();
  expect(w.room.queue![input.requestId]!.state).toBe("started");
  expect(w.store.forRun(`r_queue-${input.requestId}`).filter(e => e.kind === "run.created")).toHaveLength(1);
  launch.mockRestore();
});
it("prevents legacy send from bypassing a queued request identity", () => {
  const w = world(), now = Date.now(), requestId = randomUUID();
  w.rooms.pause(w.room.id, true);
  w.rooms.enqueue(w.room.id, { requestId, text: "queued", issuedAt: now, expiresAt: now + 60000 });
  expect(() => w.rooms.send(w.room.id, requestId, "other")).toThrow(/conflict/i);
});
it("bounds the queue, expires held entries, and rejects foreign reply references", () => {
  const w = world(), now = Date.now(); w.rooms.pause(w.room.id, true);
  const input = { requestId: randomUUID(), text: "held", issuedAt: now, expiresAt: now + 1000 };
  expect(() => w.rooms.enqueue(w.room.id, { ...input, replyTo: "unknown" })).toThrow(/this room/);
  for (let i = 0; i < 20; i++) w.rooms.enqueue(w.room.id, { ...input, requestId: randomUUID() });
  expect(() => w.rooms.enqueue(w.room.id, input)).toThrow(/full/);
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 1001);
  try { w.rooms.recover(); expect(Object.values(w.room.queue!).every(entry => entry.state === "expired")).toBe(true); }
  finally { clock.mockRestore(); }
  expect(w.room.turns).toHaveLength(0);
});
it("rechecks member authority before starting held work", async () => {
  const w = world(), now = Date.now(); w.rooms.pause(w.room.id, true);
  const input = { requestId: randomUUID(), text: "held", recipient: "eli", issuedAt: now, expiresAt: now + 60000 };
  w.rooms.enqueue(w.room.id, input);
  w.crew.set({ ...w.crew.get("eli")!, delegatable: false });
  w.rooms.pause(w.room.id, false); await tick();
  expect(w.room.queue![input.requestId]!.state).toBe("rejected");
  expect(w.room.turns).toHaveLength(0);
});
it("preserves archived room history during recovery without relaunching or blocking new work", async () => {
  const w = world(), root = w.rooms.send(w.room.id, randomUUID(), "Archive completed work");
  await tick(); w.captured.get(root.runId)!.finish(); await tick();
  w.store.append("run.archived", {}, { run: root.runId });
  expect(fold(w.store.read(0)).runs[root.runId]).toBeUndefined();
  expect(() => w.rooms.recover()).not.toThrow();
  w.rooms.close();
  const restored = new RoomCoordinator(w.store, w.supervisor, w.crew, w.runtimes);
  cleanup.push(() => restored.close());
  expect(() => restored.recover()).not.toThrow();
  expect(w.store.forRun(root.runId).filter(e => e.kind === "run.created")).toHaveLength(1);
  expect(() => restored.send(w.room.id, randomUUID(), "Next request")).not.toThrow();
});
it("rejects ordinary and voice followups to room runs before recording work", async () => {
  const w = world(), root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" }); await tick();
  w.captured.get(child.runId)!.finish(); w.captured.get(root.runId)!.finish(); await tick(); await tick();
  w.captured.get(root.runId)!.finish(); await tick();
  const latest = w.rooms.send(w.room.id, randomUUID(), "Next request"); await tick();
  const { app } = await createServer(w);
  const voice = new VoiceSessions(w.store, w.supervisor, w.crew, w.runtimes);
  try {
    for (const [runId, memberId, runtime] of [[root.runId, "shua", "claude"], [child.runId, "eli", "codex"]]) {
      const head = w.store.head;
      expect(() => w.supervisor.followUp(runId!, "Unexpected")).toThrow(/room/i);
      expect(() => voice.submit({ requestId: randomUUID(), runId, memberId: memberId!, runtime: runtime!, text: "Unexpected" })).toThrow(/room/i);
      const response = await app.inject({ method: "POST", url: `/api/runs/${runId}/followup`, headers: { "x-shuacrew": "1" }, payload: { text: "Unexpected" } });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(w.store.head).toBe(head);
      expect(w.supervisor.isActive(runId!)).toBe(false);
    }
    expect(w.supervisor.isActive(latest.runId)).toBe(true);
  } finally { await app.close(); }
});
it("does not repeat earlier prose when the summary turn fails", async () => {
  const w = world(), root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" }); await tick();
  w.captured.get(root.runId)!.finish(); w.captured.get(child.runId)!.finish(); await tick(); await tick();
  w.captured.get(root.runId)!.finish(false); await tick();
  const results = w.rooms.get(w.room.id)!.messages.filter(m => m.sourceRun === root.runId);
  expect(results).toHaveLength(1);
  expect(results[0]!.id).toBe(`result_${root.runId}_1`);
});
it("recovers a persisted but never-enqueued summary exactly once", async () => {
  const w = world(), requestId = randomUUID(), root = w.rooms.send(w.room.id, requestId, "Review"); await tick();
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" }); await tick();
  w.rooms.pause(w.room.id, true);
  w.captured.get(root.runId)!.finish(); w.captured.get(child.runId)!.finish(); await tick();
  w.rooms.close();
  w.store.append("room.summary-requested", { room: w.room.id, requestId, runId: root.runId });
  w.store.append("run.followup", { id: `room-summary:${requestId}`, text: "Persisted summary request", by: "crew results" }, { run: root.runId });
  w.store.append("room.paused", { room: w.room.id, paused: false });
  let rooms!: RoomCoordinator;
  const next = new Supervisor(w.store, w.runtimes, { workspace: os.tmpdir(), crew: w.crew, canStart: id => rooms.canStart(id) });
  rooms = new RoomCoordinator(w.store, next, w.crew, w.runtimes);
  cleanup.push(() => { rooms.close(); next.shutdown(); });
  next.recover(); rooms.recover(); await tick();
  expect(w.store.forRun(root.runId).filter(e => e.kind === "turn.started")).toHaveLength(2);
  expect(w.store.forRun(root.runId).filter(e => e.kind === "run.followup")).toHaveLength(1);
  w.captured.get(root.runId)!.finish(); await tick(); rooms.recover(); await tick();
  expect(w.store.forRun(root.runId).filter(e => e.kind === "turn.started")).toHaveLength(2);
  rooms.close(); next.shutdown();
});
it.each(["stop", "pause"])("does not start after %s during worktree preparation", async mode => {
  const w = world(); let release!: (value: object) => void;
  Object.assign(w.supervisor, { worktrees: { create: () => new Promise(resolve => { release = resolve; }) } });
  const root = w.rooms.send(w.room.id, randomUUID(), "Review");
  // Inject a repository on a second isolated fixture before launching its reserved run.
  w.rooms.stop(w.room.id); await tick();
  const requestId = randomUUID(), runId = `r_${randomUUID()}`;
  w.rooms.pause(w.room.id, false);
  w.store.append("room.turn", { room: w.room.id, requestId, runId, memberId: "shua" });
  w.supervisor.launch({ ask: "Review", repo: "/tmp/controlled-room-repo", runtime: "claude", member: "shua", labels: ["crew-room", `room:${w.room.id}`] }, runId);
  await tick(); expect(release).toBeTypeOf("function");
  if (mode === "stop") w.rooms.stop(w.room.id); else w.rooms.pause(w.room.id, true);
  release({ path: os.tmpdir(), branch: "controlled", base: "a".repeat(40) }); await tick();
  expect(w.captured.has(runId)).toBe(false);
  expect(w.store.forRun(runId).filter(e => e.kind === "turn.started")).toHaveLength(0);
  expect(fold(w.store.read(0)).runs[runId]!.status).toBe(mode === "stop" ? "cancelled" : "queued");
  if (mode === "pause") { w.rooms.pause(w.room.id, false); await tick(); expect(w.captured.has(runId)).toBe(true); }
});
it("fails unavailable providers before starting work", async () => {
  const w = world(); w.runtimes.get("claude")!.status = async () => ({ installed: true, signedIn: false, detail: "sign in", overridingKeys: [] });
  const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  expect(w.captured.has(root.runId)).toBe(false);
  expect(fold(w.store.read(0)).runs[root.runId]).toMatchObject({ status: "failed" });
});
it("does not start twice while provider readiness is pending", async () => {
  const w = world(); const releases: Array<() => void> = [];
  const status = w.runtimes.get("claude")!.status.bind(w.runtimes.get("claude"));
  w.runtimes.get("claude")!.status = async () => { await new Promise<void>(resolve => { releases.push(resolve); }); return status(); };
  const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  w.supervisor.pump(); releases.forEach(release => release()); await tick();
  expect(w.store.forRun(root.runId).filter(e => e.kind === "turn.started")).toHaveLength(1);
  expect(w.captured.has(root.runId)).toBe(true);
});
it("pause during provider readiness holds the request until explicit resume", async () => {
  const w = world(); let release!: () => void;
  const status = w.runtimes.get("claude")!.status.bind(w.runtimes.get("claude"));
  w.runtimes.get("claude")!.status = async () => { await new Promise<void>(resolve => { release = resolve; }); return status(); };
  const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  w.rooms.pause(w.room.id, true); release(); await tick();
  expect(w.captured.has(root.runId)).toBe(false);
  w.runtimes.get("claude")!.status = status;
  w.rooms.pause(w.room.id, false); await tick();
  expect(w.captured.has(root.runId)).toBe(true);
});
it("retry creates one new supervised request without reviving the failed assignment", async () => {
  const w = world(), root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" }); await tick();
  w.captured.get(root.runId)!.finish(); w.captured.get(child.runId)!.finish(false); await tick(); await tick();
  w.captured.get(root.runId)!.finish(); await tick();
  const requestId = randomUUID(), retry = w.rooms.retry(w.room.id, child.assignmentId, requestId);
  expect(w.rooms.retry(w.room.id, child.assignmentId, requestId)).toEqual(retry); await tick();
  expect(retry.runId).not.toBe(child.runId);
  expect(w.rooms.get(w.room.id)!.assignments[child.assignmentId]!.status).toBe("failed");
  expect(fold(w.store.read(0)).runs[retry.runId]).toMatchObject({ member: "eli", runtime: "codex", permission: "ask" });
});
it("a crash before root launch leaves a visible failure and allows a new request", async () => {
  const w = world(); const original = w.supervisor.launch.bind(w.supervisor);
  const spy = vi.spyOn(w.supervisor, "launch").mockImplementationOnce(() => { throw new Error("injected crash"); });
  expect(() => w.rooms.send(w.room.id, randomUUID(), "Review")).toThrow(/injected/);
  spy.mockImplementation(original); w.rooms.recover(); await tick();
  const root = w.rooms.get(w.room.id)!.turns[0]!;
  expect(fold(w.store.read(0)).runs[root.runId]).toMatchObject({ status: "failed" });
  expect(w.captured.has(root.runId)).toBe(false);
  expect(() => w.rooms.send(w.room.id, randomUUID(), "Try a new request")).not.toThrow();
});
it("revocation cancels queued children without executing them", async () => {
  const w = world(); const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" });
  w.crew.set({ ...w.crew.get("eli")!, delegatable: false }); await tick();
  expect(w.captured.has(child.runId)).toBe(false);
  expect(w.rooms.get(w.room.id)!.assignments[child.assignmentId]!.status).toBe("failed");
});
it("revocation while provider readiness is pending prevents a late start", async () => {
  const w = world(); const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  let release!: () => void; const status = w.runtimes.get("codex")!.status.bind(w.runtimes.get("codex"));
  w.runtimes.get("codex")!.status = async () => { await new Promise<void>(resolve => { release = resolve; }); return status(); };
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" }); await tick();
  w.crew.remove("eli"); await tick(); release(); await tick();
  expect(w.captured.has(child.runId)).toBe(false);
  expect(w.rooms.get(w.room.id)!.assignments[child.assignmentId]!.status).toBe("failed");
});
it("failure after child creation does not leave an untracked running child", async () => {
  const w = world(); const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  const original = w.supervisor.launch.bind(w.supervisor);
  vi.spyOn(w.supervisor, "launch").mockImplementationOnce((spec, id) => { original(spec, id); throw new Error("injected after launch"); });
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" }); await tick();
  expect(w.captured.has(child.runId)).toBe(false);
  expect(fold(w.store.read(0)).runs[child.runId]).toMatchObject({ status: "cancelled" });
});
it("keeps provider-limited children paused without a false result or automatic provider switch", async () => {
  const w = world();
  w.runtimes.get("codex")!.start = async function* () { yield { type: "limited", until: Date.now() + 120000, message: "Test usage limit", model: "mock-fast" }; };
  const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" }); await tick();
  w.captured.get(root.runId)!.finish(); await tick();
  expect(fold(w.store.read(0)).runs[child.runId]).toMatchObject({ status: "paused", runtime: "codex" });
  expect(w.store.forRun(child.runId).some(e => e.kind === "run.routed")).toBe(false);
  expect(w.store.forRun(root.runId).filter(e => e.kind === "run.followup")).toHaveLength(0);
  w.rooms.stop(w.room.id);
});
it("protects room routes and binds delegation to the real MCP bearer", async () => {
  const w = world(); const library = new Library(w.store, mkdtempSync(path.join(os.tmpdir(), "shua-room-lib-")));
  const tools = new ToolServer(library, () => fold(w.store.read(0)), w.rooms);
  const { app } = await createServer({ ...w, tools, library });
  try {
    expect((await app.inject({ method: "POST", url: "/api/rooms", payload: {} })).statusCode).toBe(403);
    expect((await app.inject("/api/rooms")).json()).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: `/api/rooms/${w.room.id}/messages`, headers: { "x-shuacrew": "1" }, payload: { requestId: "bad", text: "Hello" } })).statusCode).toBe(400);
    const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
    const rpc = (run: string, args: object) => app.inject({ method: "POST", url: "/mcp", headers: { authorization: `Bearer ${tools.tokenFor(run)}`, accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "crew_delegate", arguments: args } } });
    const args = { requestId: randomUUID(), memberId: "eli", task: "Review" };
    const head = w.store.head;
    expect((await rpc("outsider", { ...args, sourceRun: root.runId })).json().result.isError).toBe(true);
    expect(w.store.head).toBe(head);
    const response = (await rpc(root.runId, args)).json(); expect(response.result.isError).not.toBe(true);
    expect(Object.keys(w.rooms.get(w.room.id)!.assignments)).toHaveLength(1);
    w.rooms.stop(w.room.id);
    expect((await rpc(root.runId, { ...args, requestId: randomUUID() })).json().result.isError).toBe(true);
  } finally { await app.close(); library.stop(); }
});
it("delegates across providers exactly once with isolated supervised work and one summary", async () => {
  const w = world(); const requestId = randomUUID();
  const root = w.rooms.send(w.room.id, requestId, "Review a public draft"); await tick();
  expect(w.rooms.send(w.room.id, requestId, "Review a public draft")).toEqual(root);
  expect(() => w.rooms.send(w.room.id, requestId, "Different")).toThrow(/conflict/i);
  const input = { requestId: randomUUID(), memberId: "eli", task: "Review clarity" };
  const child = w.rooms.delegate(root.runId, input); expect(w.rooms.delegate(root.runId, input)).toEqual(child); await tick();
  expect(fold(w.store.read(0)).runs[child.runId]).toMatchObject({ runtime: "codex", permission: "ask", parent: root.runId });
  expect(w.captured.get(child.runId)!.spec.cwd).not.toBe(w.captured.get(root.runId)!.spec.cwd);
  expect(w.captured.get(child.runId)!.spec.agents).toBeUndefined();
  expect(w.captured.get(child.runId)!.spec.disableNativeAgents).toBe(true);
  expect(() => w.supervisor.setPermission(child.runId, "auto")).toThrow(/supervised/i);
  expect(await w.captured.get(child.runId)!.ctx.approve("Agent", { prompt: "escape" })).toMatchObject({ allow: false });
  expect(() => w.rooms.delegate(child.runId, { ...input, requestId: randomUUID() })).toThrow();
  w.captured.get(root.runId)!.finish(); w.captured.get(child.runId)!.finish(); await tick(); await tick();
  expect(w.rooms.get(w.room.id)!.assignments[child.assignmentId]).toMatchObject({ status: "done", output: "Result from codex" });
  expect(w.store.forRun(root.runId).filter(e => e.kind === "run.followup")).toHaveLength(1);
  w.captured.get(root.runId)!.finish(); await tick();
  expect(w.rooms.get(w.room.id)!.messages.some(m => m.author === "eli" && m.sourceRun === child.runId)).toBe(true);
  expect(w.store.forRun(root.runId).filter(e => e.kind === "run.followup")).toHaveLength(1);
});
it("enforces active ownership, opt-in, pause, stop and three-child concurrency", async () => {
  const w = world(); const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  const input = () => ({ requestId: randomUUID(), memberId: "eli", task: "Review" });
  w.rooms.pause(w.room.id, true); expect(() => w.rooms.delegate(root.runId, input())).toThrow(/paused/i);
  w.rooms.pause(w.room.id, false);
  w.crew.set({ ...w.crew.get("eli")!, delegatable: false }); expect(() => w.rooms.delegate(root.runId, input())).toThrow(/opt/i);
  w.crew.set({ ...w.crew.get("eli")!, delegatable: true });
  const children = Array.from({ length: 8 }, () => w.rooms.delegate(root.runId, input())); await tick();
  expect(() => w.rooms.delegate(root.runId, input())).toThrow(/eight|8/i);
  expect(children.filter(c => w.captured.has(c.runId)).length).toBe(3);
  w.rooms.stop(w.room.id); expect(() => w.rooms.delegate(root.runId, input())).toThrow(); await tick();
  expect(Object.values(w.rooms.get(w.room.id)!.assignments).every(a => a.status === "failed")).toBe(true);
});
it("recovery never replays interrupted room turns and reconciles reserved work once", async () => {
  const w = world(); const root = w.rooms.send(w.room.id, randomUUID(), "Review"); await tick();
  const child = w.rooms.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Review" }); await tick();
  w.rooms.close(); w.supervisor.shutdown();
  const next = new Supervisor(w.store, w.runtimes, { workspace: os.tmpdir(), crew: w.crew, concurrency: { claude: 0, codex: 0 } });
  const recovered = new RoomCoordinator(w.store, next, w.crew, w.runtimes); cleanup.push(() => { recovered.close(); next.shutdown(); });
  next.recover(); recovered.recover(); await tick();
  expect(fold(w.store.read(0)).runs[root.runId]!.status).toBe("failed");
  expect(recovered.get(w.room.id)!.assignments[child.assignmentId]!.status).toBe("failed");
  expect(() => recovered.delegate(root.runId, { requestId: randomUUID(), memberId: "eli", task: "Again" })).toThrow();
  expect(w.store.forRun(root.runId).filter(e => e.kind === "run.followup")).toHaveLength(0);
});
