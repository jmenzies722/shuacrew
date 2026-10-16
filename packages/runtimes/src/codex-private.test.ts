import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodexRuntime, CodexTranslator, resumeThread } from "./codex.js";
import { quotaFrom, type RuntimeEvent } from "./runtime.js";

/** A stand-in app-server that logs every method it's asked, and can be told to be archived, held, or silent. */
function fakeCodex(mode: { archived?: boolean; held?: number; silent?: boolean } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "codex-private-"));
  const log = path.join(dir, "methods.log"), bin = path.join(dir, "codex");
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require("node:fs");
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
let archived = ${!!mode.archived}, held = ${mode.held ?? 0};
require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  fs.appendFileSync(${JSON.stringify(log)}, m.method + " " + (m.params?.threadId ?? "") + "\\n");
  if (m.method === "thread/resume") {
    if (archived) return send({ id: m.id, error: { message: "session " + m.params.threadId + " is archived. Run \`codex unarchive\` to unarchive it first." } });
    if (held-- > 0) return send({ id: m.id, error: { message: "thread " + m.params.threadId + " already has an active writer" } });
    return send({ id: m.id, result: { thread: { id: m.params.threadId } } });
  }
  if (m.method === "thread/unarchive") { archived = false; return send({ id: m.id, result: {} }); }
  if (m.method === "thread/start") return send({ id: m.id, result: { thread: { id: "t-new" } } });
  if (m.method !== "turn/start") return send({ id: m.id, result: {} });
  send({ id: m.id, result: { turn: { id: "u1" } } });
  ${mode.silent ? "return;" : ""}
  send({ method: "turn/started", params: { turn: { id: "u1" } } });
  send({ method: "account/rateLimits/updated", params: { rateLimits: { primary: { usedPercent: 91.5, resetsAt: 1791664250 } } } });
  send({ method: "item/completed", params: { item: { id: "m1", type: "agentMessage", text: "hello" } } });
  send({ method: "turn/completed", params: { turn: { id: "u1", status: "completed" } } });
});
`);
  chmodSync(bin, 0o755);
  return { bin, dir, methods: () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
}

async function collect(rt: CodexRuntime, over: Record<string, unknown>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const e of rt.start({ id: "r", ask: "hi", cwd: os.tmpdir(), ...over } as never, { signal: new AbortController().signal, env: process.env as Record<string, string>, approve: async () => ({ allow: true, reason: "" }) })) events.push(e);
  return events;
}

describe("Codex conversations stay in ShuaCrew", () => {
  it("archives the thread after its turn, so it's out of the Codex app's list", async () => {
    const fake = fakeCodex();
    const events = await collect(new CodexRuntime({ binary: fake.bin }), { resume: "thread-1" });
    expect(events.find((e) => e.type === "done")).toMatchObject({ text: "hello" });
    expect(fake.methods().at(-1)).toBe("thread/archive thread-1");
  });

  it("brings an archived thread back before resuming it", async () => {
    const fake = fakeCodex({ archived: true });
    const events = await collect(new CodexRuntime({ binary: fake.bin }), { resume: "thread-1" });
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(fake.methods().filter((m) => m.startsWith("thread/"))).toEqual(["thread/resume thread-1", "thread/unarchive thread-1", "thread/resume thread-1", "thread/archive thread-1"]);
  });

  it("waits out another app-server letting go of the thread instead of failing the turn", async () => {
    const fake = fakeCodex({ held: 2 });
    const events = await collect(new CodexRuntime({ binary: fake.bin }), { resume: "thread-1" });
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(fake.methods().filter((m) => m === "thread/resume thread-1")).toHaveLength(3);
  });

  it("archives a new conversation's thread too", async () => {
    const fake = fakeCodex();
    await collect(new CodexRuntime({ binary: fake.bin }), {});
    expect(fake.methods()).toContain("thread/archive t-new");
  });
});

describe("the stall guard", () => {
  it("ends a turn Codex has gone silent on, so Shua can move to its other brain", async () => {
    const fake = fakeCodex({ silent: true });
    const started = Date.now();
    const events = await collect(new CodexRuntime({ binary: fake.bin, stallMs: 400 }), { lean: true });
    expect(events.at(-1)).toMatchObject({ type: "error", message: expect.stringMatching(/stopped responding/) });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("usage readings", () => {
  it("passes Codex's own usage on as a quota event during the turn", async () => {
    const fake = fakeCodex();
    const events = await collect(new CodexRuntime({ binary: fake.bin }), {});
    expect(events.find((e) => e.type === "quota")).toEqual({ type: "quota", usedPercent: 91.5, resetsAt: 1791664250_000 });
  });
  it("takes the busier window, and ignores a snapshot with none", () => {
    expect(quotaFrom({ primary: { usedPercent: 12 }, secondary: { usedPercent: 97, resetsAt: 1_791_664_250 } })).toEqual({ usedPercent: 97, resetsAt: 1791664250_000 });
    expect(quotaFrom({ primary: null, secondary: null })).toBeUndefined();
    expect(new CodexTranslator().translate("account/rateLimits/updated", { rateLimits: {} })).toEqual([]);
  });
  it("resumeThread gives up on errors it can't fix", async () => {
    const peer = { request: async () => { throw new Error("no rollout found"); } };
    await expect(resumeThread(peer as never, "t", {}, async () => undefined)).rejects.toThrow(/no rollout/);
  });
});

describe("the plan's own models", async () => {
  const { codexCatalog, codexTier } = await import("./codex.js");
  it("reads what the plan offers and its default, never trusting Codex's config default", () => {
    const listed = { data: [
      { id: "gpt-6-astra", displayName: "gpt-6-astra", isDefault: true },
      { id: "gpt-5.6-terra", displayName: "gpt-5.6-terra" },
      { id: "gpt-5.6-luna", displayName: "gpt-5.6-luna" },
      { id: "secret-preview", hidden: true },
    ] };
    expect(codexCatalog(listed)).toEqual({ defaultModel: "gpt-6-astra", models: [
      { id: "gpt-6-astra", label: "GPT-6-Astra", tier: "frontier" },
      { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", tier: "balanced" },
      { id: "gpt-5.6-luna", label: "GPT-5.6-Luna", tier: "fast" },
    ] });
    expect(codexCatalog({}).models).toEqual([]);
    expect(codexTier("gpt-5.6-sol")).toBe("frontier");
  });
});
