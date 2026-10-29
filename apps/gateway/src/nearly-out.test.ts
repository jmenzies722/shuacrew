import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { Supervisor } from "./runs.js";
import { EventStore } from "./store.js";
import { shuaThreadsToArchive } from "./codex-privacy.js";
import { sessionNow, shuacrewNow } from "./awareness.js";

const cleanups: Array<() => unknown> = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });
async function until(check: () => boolean, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!check()) { if (Date.now() > deadline) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 15)); }
}
function world(codexStart?: Runtime["start"]) {
  const store = new EventStore(":memory:");
  const codex = Object.assign(new MockRuntime({ pace: 0 }), { id: "codex" }, codexStart ? { start: codexStart } : {});
  const claude = Object.assign(new MockRuntime({ pace: 0 }), { id: "claude" });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["codex", codex], ["claude", claude]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-nearly-")), roots: [], failover: true });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  return { store, supervisor };
}
const created = (store: EventStore, id: string) => store.forRun(id).find((e) => e.kind === "run.created")?.body as { runtime?: string } | undefined;
const routes = (store: EventStore, id: string) => store.forRun(id).flatMap((e) => (e.kind === "run.routed" ? [e.body] : []));

describe("Claude covers before Codex runs out", () => {
  it("starts a new conversation with Shua on Claude once Codex is at 90%+, and back on Codex once it has room", () => {
    const { store, supervisor } = world();
    supervisor.usageReading("codex", { usedPercent: 95 });
    expect(created(store, supervisor.launch({ ask: "Hello", labels: ["buddy"], hold: true }))).toMatchObject({ runtime: "claude" });
    supervisor.usageReading("codex", { usedPercent: 40 });
    expect(created(store, supervisor.launch({ ask: "Hello again", labels: ["buddy"], hold: true }))).toMatchObject({ runtime: "codex" });
  });

  it("moves a conversation already on Codex to Claude at its next turn, and says why", async () => {
    const { store, supervisor } = world();
    const id = supervisor.launch({ ask: "Hi", labels: ["buddy"] });
    await until(() => fold(store.read(0)).runs[id]?.status === "done");
    supervisor.usageReading("codex", { usedPercent: 93 });
    supervisor.followUp(id, "And now?");
    await until(() => fold(store.read(0)).runs[id]?.turns === 2 && fold(store.read(0)).runs[id]?.status === "done");
    expect(routes(store, id).at(-1)).toMatchObject({ runtime: "claude", reason: "codex is at 93% of its usage window — claude is covering" });
  });

  it("moves a queued work session off Codex before it starts, when failover is on", async () => {
    const { store, supervisor } = world();
    supervisor.usageReading("codex", { usedPercent: 97 });
    const id = supervisor.launch({ ask: "Refactor the parser", runtime: "codex" });
    await until(() => fold(store.read(0)).runs[id]?.status === "done");
    expect(routes(store, id)[0]).toMatchObject({ runtime: "claude" });
  });

  it("stays on Codex when Claude has no room either (an answer beats none)", async () => {
    const { store, supervisor } = world();
    store.append("runtime.limited", { runtime: "claude", until: Date.now() + 60_000, message: "limited" });
    supervisor.usageReading("codex", { usedPercent: 97 });
    expect(created(store, supervisor.launch({ ask: "Hello", labels: ["buddy"], hold: true }))).toMatchObject({ runtime: "codex" });
    const id = supervisor.launch({ ask: "Refactor", runtime: "codex" });
    await until(() => fold(store.read(0)).runs[id]?.status === "done");
    expect(routes(store, id)).toHaveLength(0);
  });

  it("ignores a reading whose window has since reset", () => {
    const { supervisor } = world();
    supervisor.usageReading("codex", { usedPercent: 99, resetsAt: Date.now() - 1000 });
    expect(supervisor.nearlyOut("codex")).toBe(false);
    supervisor.usageReading("codex", { usedPercent: 99, resetsAt: Date.now() + 60_000 });
    expect(supervisor.nearlyOut("codex")).toBe(true);
  });

  it("learns Codex's usage from the turn itself", async () => {
    const { store, supervisor } = world(async function* () { yield { type: "quota", usedPercent: 91 }; yield { type: "done", text: "ok" }; });
    const id = supervisor.launch({ ask: "Hi", runtime: "codex" });
    await until(() => fold(store.read(0)).runs[id]?.status === "done");
    expect(supervisor.usage("codex")?.usedPercent).toBe(91);
    expect(supervisor.nearlyOut("codex")).toBe(true);
  });
});

describe("tidying ShuaCrew's threads out of the Codex app", () => {
  const now = Date.UTC(2026, 9, 16, 21);
  const hourAgo = now / 1000 - 3600;
  it("takes only ShuaCrew's own threads, and only idle ones", () => {
    expect(shuaThreadsToArchive([
      { id: "a", originator: "shuacrew", updatedAt: hourAgo },
      { id: "b", originator: "shuacrew-live", updatedAt: hourAgo },
      { id: "c", originator: "Codex Desktop", updatedAt: hourAgo },
      { id: "d", originator: "shuacrew", updatedAt: now / 1000 - 60 }, // in use a minute ago
      { id: "e", originator: "shuacrewish", updatedAt: hourAgo },
    ], now)).toEqual(["a", "b"]);
  });
});

describe("whats_happening", () => {
  it("says what's running, what waits on you, and how much usage each brain has", async () => {
    const { store, supervisor } = world();
    const id = supervisor.launch({ ask: "Write the launch post", runtime: "claude", title: "Launch post", hold: true });
    const state = fold(store.read(0));
    const text = shuacrewNow(state, [{ id: "codex", usedPercent: 92, limitedUntil: 0, nearlyOut: true }, { id: "claude", limitedUntil: 0, nearlyOut: false }]);
    expect(text).toContain(`[${id}]`);
    expect(text).toContain("Launch post");
    expect(text).toMatch(/codex: 92% of its usage window used · about to run out/);
    expect(text).toMatch(/claude: usage not reported yet/);
    expect(sessionNow(state, id)).toContain("Asked: Write the launch post");
    expect(sessionNow(state, "r_nope")).toMatch(/No session/);
  });
});
