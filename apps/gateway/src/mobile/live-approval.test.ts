import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { MockRuntime, type RunContext, type RunSpec, type RuntimeEvent } from "@shuacrew/runtimes";
import { EventStore } from "../store.js";
import { Supervisor } from "../runs.js";
import { inputDigest } from "./digest.js";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(f => f()));
async function pending() {
  const store = new EventStore(":memory:");
  const runtime = Object.assign(new MockRuntime(), { id: "codex", async *start(_spec: RunSpec, ctx: RunContext): AsyncIterable<RuntimeEvent> {
    const answer = await ctx.approve("UnknownFixtureTool", { nested: { b: 2, a: 1 }, token: "public-fixture" });
    yield { type: "done", text: answer.allow ? "allowed" : "denied" };
  } });
  const supervisor = new Supervisor(store, new Map([["codex", runtime]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-approval-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const run = supervisor.launch({ runtime: "codex", ask: "Public approval fixture" });
  await vi.waitFor(() => expect(supervisor.pendingApprovals()).toHaveLength(1));
  return { store, supervisor, run, id: supervisor.pendingApprovals()[0]! };
}
it("binds live approval to its run and canonical input, records one decision, and never grants always", async () => {
  const w = await pending(), live = w.supervisor.liveApproval(w.id)!;
  expect(live.input).toEqual({ nested: { b: 2, a: 1 }, token: "public-fixture" });
  const digest = inputDigest(live.input);
  expect(digest).toBe(inputDigest({ token: "public-fixture", nested: { a: 1, b: 2 } }));
  expect(w.supervisor.decideLiveApproval(w.id, "wrong", digest, true, "phone", "cmd_1")).toBe(false);
  expect(w.supervisor.decideLiveApproval(w.id, w.run, "0".repeat(64), true, "phone", "cmd_1")).toBe(false);
  expect(w.store.ofKinds("approval.decided")).toHaveLength(0);
  expect(w.supervisor.decideLiveApproval(w.id, w.run, digest, true, "phone", "cmd_1")).toBe(true);
  expect(w.supervisor.decideLiveApproval(w.id, w.run, digest, true, "phone", "cmd_1")).toBe(false);
  expect(w.store.ofKinds("approval.decided")).toHaveLength(1);
  expect(w.store.ofKinds("approval.decided")[0]!.body).toMatchObject({ always: false, mobileCommandId: "cmd_1" });
});
it("does not revive log-only approvals after shutdown or accept decisions after local denial", async () => {
  const w = await pending(), digest = inputDigest(w.supervisor.liveApproval(w.id)!.input);
  w.supervisor.shutdown();
  const next = new Supervisor(w.store, new Map(), { workspace: os.tmpdir() });
  cleanups.push(() => next.shutdown());
  expect(next.liveApproval(w.id)).toBeUndefined();
  expect(next.decideLiveApproval(w.id, w.run, digest, true, "phone", "cmd_1")).toBe(false);
  expect(w.store.ofKinds("approval.decided")).toHaveLength(0);
  const local = await pending(), live = local.supervisor.liveApproval(local.id)!;
  local.supervisor.decideApproval(local.id, false);
  expect(local.supervisor.decideLiveApproval(local.id, local.run, inputDigest(live.input), true, "phone", "cmd_2")).toBe(false);
});
it("keeps live input isolated and refuses to consume approval if durable storage fails", async () => {
  const w = await pending(), live = w.supervisor.liveApproval(w.id)!;
  try { (live.input as { token: string }).token = "changed"; } catch { /* frozen copies may reject mutation */ }
  expect(w.supervisor.liveApproval(w.id)!.input).toMatchObject({ token: "public-fixture" });
  const digest = inputDigest(w.supervisor.liveApproval(w.id)!.input);
  const original = w.store.append.bind(w.store);
  const spy = vi.spyOn(w.store, "append").mockImplementation((kind, body, where) => {
    if (kind === "approval.decided") throw new Error("disk unavailable");
    return original(kind, body, where);
  });
  expect(() => w.supervisor.decideLiveApproval(w.id, w.run, digest, true, "phone", "cmd_1")).toThrow("disk unavailable");
  expect(w.supervisor.liveApproval(w.id)).toBeDefined();
  spy.mockRestore();
});
it("rejects non-JSON inputs rather than silently changing approval meaning", () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const value of [cycle, { x: NaN }, { x: undefined }, { x: Infinity }, new Date(), [undefined]]) expect(() => inputDigest(value)).toThrow();
});
it("keeps a local denial authoritative when a mobile decision reenters during persistence", async () => {
  const w = await pending(), digest = inputDigest(w.supervisor.liveApproval(w.id)!.input);
  let mobileWon: boolean | undefined;
  w.store.subscribe(event => {
    if (event.kind === "approval.decided" && event.body.by === "local") mobileWon = w.supervisor.decideLiveApproval(w.id, w.run, digest, true, "phone", "cmd_race");
  });
  expect(w.supervisor.decideApproval(w.id, false, "local")).toBe(true);
  expect(mobileWon).toBe(false);
  expect(w.store.ofKinds("approval.decided").map(e => e.kind === "approval.decided" && e.body.allow)).toEqual([false]);
});
it("settles the provider after a durable decision even when secondary status persistence fails", async () => {
  const w = await pending(), digest = inputDigest(w.supervisor.liveApproval(w.id)!.input);
  const original = w.store.append.bind(w.store);
  const spy = vi.spyOn(w.store, "append").mockImplementation((kind, body, where) => {
    if (kind === "run.status" && (body as { status?: string }).status === "running") throw new Error("status disk failure");
    return original(kind, body, where);
  });
  expect(() => w.supervisor.decideLiveApproval(w.id, w.run, digest, false, "phone", "cmd_status")).toThrow("status disk failure");
  await vi.waitFor(() => expect(w.store.ofKinds("turn.completed")).toHaveLength(1), { timeout: 300 });
  expect(w.store.ofKinds("approval.decided")).toHaveLength(1);
  expect(w.supervisor.liveApproval(w.id)).toBeUndefined();
  spy.mockRestore();
});
