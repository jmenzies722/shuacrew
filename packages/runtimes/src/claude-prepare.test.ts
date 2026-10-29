import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeRuntime } from "./claude.js";
import { ClaudeAccounts, type ReadStatus } from "./claude-accounts.js";
import type { RunContext } from "./runtime.js";

// Shua's head start on Claude (prepare): the warm session opens while you type, so the first reply skips Claude Code's
// cold start. Codex had this; Claude didn't, so every new conversation on Claude started cold. The SDK isn't run here:
// the session opener is replaced, and each test checks how many sessions open and which one a turn uses.
function runtime(openMs = 0) {
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-prep-"));
  const readStatus: ReadStatus = async () => ({ loggedIn: true, email: "you@example.com" });
  const accounts = new ClaudeAccounts({ home, root: path.join(home, "accounts"), readStatus, ttlMs: 60_000 });
  const r = new ClaudeRuntime({ accounts, executable: "/does-not-exist" });
  const opened: { id: string; closed: boolean; pushed: string[] }[] = [];
  (r as unknown as { openWarm: unknown }).openWarm = vi.fn(async (run: { id: string; model?: string }, _ctx: unknown, _env: unknown, account: string) => {
    await new Promise((resolve) => setTimeout(resolve, openMs));
    const record = { id: run.id, closed: false, pushed: [] as string[] };
    opened.push(record);
    const replies: { done: boolean; value?: unknown }[] = [];
    const session = {
      model: run.model, account, dead: false, ready: Promise.resolve(), ctx: undefined as unknown,
      translator: { translate: (m: { type: string }) => (m.type === "done" ? [{ type: "done" }] : [{ type: "text", text: "Four." }]) },
      iterator: { next: async () => replies.shift() ?? { done: true } },
      push: (text: string) => { record.pushed.push(text); replies.push({ done: false, value: { type: "text" } }, { done: false, value: { type: "done" } }); },
      close: () => { record.closed = true; session.dead = true; },
      interrupt: async () => {},
    };
    return session;
  });
  return { r, opened };
}
const ctx = (): RunContext => ({ signal: new AbortController().signal, env: {}, approve: async () => ({ allow: false, reason: "test" }) as never });
// As the gateway shapes a Shua turn: its tools, the same tools under another id (for a spare), and the hand-over hook.
const adoptions: { from: string; to: string }[] = [];
const shua = (id: string, extra: object = {}) => ({ id, ask: "what is 2 + 2?", cwd: "/tmp", lean: true, mcpServers: { shuacrew: { url: `x?run=${id}` } }, mcpFor: (sid: string) => ({ shuacrew: { url: `x?run=${sid}` } }), adopted: (from: string) => adoptions.push({ from, to: id }), ...extra });
const turn = async (r: ClaudeRuntime, id: string, lean = true) => { const out: string[] = []; for await (const e of r.start(lean ? shua(id) : { id, ask: "what is 2 + 2?", cwd: "/tmp" }, ctx())) out.push(e.type); return out; };
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("Shua's head start on Claude", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("opens one warm session ahead, and the first turn runs on it", async () => {
    const { r, opened } = runtime();
    r.prepare(shua("r_head", { ask: "" }), {});
    await settle();
    const own = () => opened.filter((o) => !o.id.startsWith("r_spare-")); // (a spare for the next conversation opens too)
    expect(own().map((o) => o.id)).toEqual(["r_head"]);
    expect(await turn(r, "r_head")).toContain("text");
    expect(own()).toHaveLength(1);                          // no second session for the turn
    expect(own()[0]!.pushed).toEqual(["what is 2 + 2?"]);
    r.dispose();
  });

  it("a turn that arrives while the head start is still opening waits for it instead of opening another", async () => {
    const { r, opened } = runtime(150);
    r.prepare(shua("r_race", { ask: "" }), {});
    expect(await turn(r, "r_race")).toContain("text");     // sent before the session finished opening
    expect(opened.filter((o) => o.id === "r_race")).toHaveLength(1);
    r.dispose();
  });

  it("only Shua's lean conversations get one", async () => {
    const { r, opened } = runtime();
    r.prepare({ id: "r_work", ask: "", cwd: "/tmp" }, {});
    await settle();
    expect(opened).toHaveLength(0);
  });

  it("after a reply, a spare opens; the next new conversation starts on it without launching anything", async () => {
    const { r, opened } = runtime();
    await turn(r, "r_one");                                 // a cold first conversation: its own session…
    await settle();
    const spareOf = () => opened.filter((o) => o.id.startsWith("r_spare-"));
    expect(opened[0]!.id).toBe("r_one");
    expect(spareOf()).toHaveLength(1);                      // …and a spare for the next one, under its own id
    adoptions.length = 0;
    await turn(r, "r_two");                                 // no prepare, sent at once
    expect(spareOf()[0]!.pushed).toEqual(["what is 2 + 2?"]); // r_two ran on the spare
    // Its ShuaCrew tool access is handed to r_two, from the spare's own id (never r_one's: that's r_one's still).
    expect(adoptions).toEqual([{ from: spareOf()[0]!.id, to: "r_two" }]);
    await settle();
    expect(spareOf()).toHaveLength(2);                      // and the next spare is on its way
    r.dispose();
    expect(opened.every((o) => o.closed)).toBe(true);       // nothing outlives the gateway
  });

  it("a conversation shaped differently (another model) doesn't take the spare", async () => {
    const { r, opened } = runtime();
    await turn(r, "r_one");
    await settle();
    const out: string[] = [];
    for await (const e of r.start(shua("r_opus", { model: "claude-opus-5-5" }), ctx())) out.push(e.type);
    expect(opened.find((o) => o.id === "r_opus")).toBeDefined(); // opened its own
    expect(opened.filter((o) => o.id.startsWith("r_spare-"))[0]!.pushed).toEqual([]);
    r.dispose();
  });

  it("opens no spare without its own tool access (it would act as the conversation it came from)", async () => {
    const { r, opened } = runtime();
    for await (const _ of r.start({ id: "r_bare", ask: "hi", cwd: "/tmp", lean: true, mcpServers: { shuacrew: { url: "x?run=r_bare" } } }, ctx())) { /* drain */ }
    await settle();
    expect(opened.map((o) => o.id)).toEqual(["r_bare"]);
    r.dispose();
  });

  it("closes a head start nobody used after 90 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { r, opened } = runtime();
    r.prepare(shua("r_unused", { ask: "" }), {});
    await vi.advanceTimersByTimeAsync(50);
    expect(opened[0]?.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(opened[0]?.closed).toBe(true);
  });
});
