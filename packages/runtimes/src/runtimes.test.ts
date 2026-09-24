import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentEnv } from "@shuacrew/core";
import { describe, expect, it } from "vitest";
import { AcpRuntime } from "./acp.js";
import { ClaudeTranslator } from "./claude.js";
import { CodexRuntime, CodexTranslator } from "./codex.js";
import { limitFrom, type RunContext, type RuntimeEvent } from "./runtime.js";

const allowAll: RunContext["approve"] = async () => ({ allow: true, reason: "test" });

function context(approve: RunContext["approve"] = allowAll, env: Record<string, string> = {}): RunContext {
  return { signal: new AbortController().signal, env: { ...agentEnv(process.env, "subscription"), ...env }, approve };
}

async function collect(stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const out: RuntimeEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

describe("a model that needs usage credits", () => {
  it("is reported as unavailable on this plan, not as a usage window", () => {
    const t = new ClaudeTranslator();
    t.translate({ type: "system", subtype: "init", session_id: "s", model: "claude-fable-5-1" });
    const [event] = t.translate({
      type: "rate_limit_event",
      rate_limit_info: { status: "rejected", resetsAt: 1790812800, overageDisabledReason: "out_of_credits", errorCode: "credits_required" },
    });
    expect(event).toMatchObject({ type: "limited", model: "claude-fable-5-1", credits: true, message: "claude-fable-5-1 needs usage credits on your plan" });
  });
});

describe("Claude's stream", () => {
  it("becomes session, text, tools, files, checks, usage and done", () => {
    const t = new ClaudeTranslator();
    const events = [
      { type: "system", subtype: "init", session_id: "s-1", model: "claude-opus-5-5", apiKeySource: "none" },
      { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", delta: { type: "text_delta", text: "Looking " } } },
      { type: "assistant", parent_tool_use_id: null, message: { usage: { input_tokens: 10, cache_read_input_tokens: 900 }, content: [{ type: "text", text: "Looking " }, { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/r/a.ts" } }, { type: "tool_use", id: "t2", name: "Bash", input: { command: "pnpm test" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }, { type: "tool_result", tool_use_id: "t2", is_error: true, content: [{ type: "text", text: "1 failed" }] }] } },
      { type: "result", subtype: "success", is_error: false, result: "Fixed.", duration_ms: 1200, total_cost_usd: 0.12, usage: { input_tokens: 30, output_tokens: 5, cache_read_input_tokens: 2700 }, modelUsage: { "claude-opus-5-5": { contextWindow: 1_000_000 } } },
    ].flatMap((m) => t.translate(m));
    expect(events.map((e) => e.type)).toEqual(["session", "text", "tool-call", "tool-call", "tool-result", "file", "tool-result", "check", "usage", "checkpoint", "done"]);
    expect(events.find((e) => e.type === "check")).toMatchObject({ command: "pnpm test", exitCode: 1 });
    // Context is the newest call's input (910), not the turn's summed usage (2,730).
    expect(events.find((e) => e.type === "usage")).toMatchObject({ contextUsed: 910, contextLimit: 1_000_000, inputTokens: 30 });
  });

  it("turns a rejected rate-limit window into a pause with its reset time", () => {
    const t = new ClaudeTranslator();
    const [event] = t.translate({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1_790_000_000, rateLimitType: "five_hour" } });
    expect(event).toMatchObject({ type: "limited", until: 1_790_000_000_000 });
  });
});

describe("usage-window messages", () => {
  it("reads when the window lifts, in the forms the CLIs use", () => {
    expect(limitFrom("You've hit your usage limit. Try again at Sep 24th, 2026 3:50 PM.")?.until).toBe(Date.parse("Sep 24 2026 3:50 PM"));
    expect(limitFrom("Claude AI usage limit reached|1790000000")?.until).toBe(1_790_000_000_000);
    expect(limitFrom("everything is fine")).toBeNull();
  });
});

describe("Codex's stream", () => {
  it("maps items and marks a failed usage window as limited", () => {
    const t = new CodexTranslator();
    const events = [
      t.translate("item/started", { item: { id: "c1", type: "commandExecution", command: ["bash", "-lc", "cargo test"] } }),
      t.translate("item/completed", { item: { id: "c1", type: "commandExecution", status: "completed", exitCode: 101, aggregatedOutput: "1 failed" } }),
      t.translate("item/started", { item: { id: "f1", type: "fileChange", changes: [{ path: "src/lib.rs" }] } }),
      t.translate("item/completed", { item: { id: "f1", type: "fileChange", status: "completed", changes: [{ path: "src/lib.rs", kind: { type: "update" } }] } }),
      t.translate("turn/completed", { turn: { status: "failed", error: { codexErrorInfo: "usageLimitExceeded", message: "limit" } } }),
    ].flat();
    expect(events.find((e) => e.type === "tool-call")).toMatchObject({ input: { command: "cargo test" } });
    expect(events.find((e) => e.type === "check")).toMatchObject({ exitCode: 101 });
    expect(events.find((e) => e.type === "file")).toMatchObject({ path: "src/lib.rs" });
    expect(events.at(-1)).toMatchObject({ type: "limited" });
  });

  it("drives a real app-server protocol exchange, routes approvals through ShuaCrew, and never leaks an API key", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "codex-fake-"));
    const fake = path.join(dir, "codex");
    writeFileSync(
      fake,
      `#!${process.execPath}
const rl = require("node:readline").createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
const leaked = ["OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => process.env[k]);
rl.on("line", (line) => {
  const m = JSON.parse(line);
  if (m.method === "initialize") send({ id: m.id, result: { userAgent: "fake" } });
  if (m.method === "thread/start") send({ id: m.id, result: { thread: { id: "th-1" } } });
  if (m.method === "turn/start") {
    send({ id: m.id, result: { turn: { id: "tu-1" } } });
    send({ method: "turn/started", params: { turn: { id: "tu-1" } } });
    send({ method: "item/started", params: { item: { id: "c1", type: "commandExecution", command: "git push origin main" } } });
    send({ id: 900, method: "item/commandExecution/requestApproval", params: { itemId: "c1", command: "git push origin main" } });
  }
  if (m.id === 900) {
    const accepted = m.result.decision === "accept";
    send({ method: "item/completed", params: { item: { id: "c1", type: "commandExecution", status: accepted ? "completed" : "declined", exitCode: accepted ? 0 : 1, aggregatedOutput: accepted ? "pushed" : "declined" } } });
    send({ method: "item/agentMessage/delta", params: { itemId: "m1", delta: "leaked:" + leaked.join(",") } });
    send({ method: "item/completed", params: { item: { id: "m1", type: "agentMessage", text: "leaked:" + leaked.join(",") } } });
    send({ method: "thread/tokenUsage/updated", params: { tokenUsage: { last: { inputTokens: 50, outputTokens: 7 }, total: { totalTokens: 57 }, modelContextWindow: 400000 } } });
    send({ method: "turn/completed", params: { turn: { id: "tu-1", status: "completed" } } });
  }
});
`,
    );
    chmodSync(fake, 0o755);
    const asked: string[] = [];
    const runtime = new CodexRuntime({ binary: fake });
    const env = { ...process.env, OPENAI_API_KEY: "sk-should-never-arrive" };
    const events = await collect(
      runtime.start(
        { id: "r1", ask: "push it", cwd: dir },
        { signal: new AbortController().signal, env: agentEnv(env, "subscription"), approve: async (tool, input) => (asked.push(`${tool}:${(input as { command: string }).command}`), { allow: false, reason: "policy" }) },
      ),
    );
    expect(asked).toEqual(["commandExecution:git push origin main"]);
    expect(events.find((e) => e.type === "tool-result")).toMatchObject({ ok: false });
    expect(events.find((e) => e.type === "done")).toMatchObject({ text: "leaked:" });
    expect(events.find((e) => e.type === "usage")).toMatchObject({ contextLimit: 400000 });
  });
});

describe("ACP agents", () => {
  it("drives an ACP agent and answers its permission requests from ShuaCrew", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "acp-fake-"));
    const agent = path.join(dir, "agent.mjs");
    const sdk = import.meta.resolve("@agentclientprotocol/sdk");
    writeFileSync(
      agent,
      `import * as acp from ${JSON.stringify(sdk)};
import { Readable, Writable } from "node:stream";
const stream = acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));
new acp.AgentSideConnection((conn) => ({
  async initialize() { return { protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: { loadSession: false } }; },
  async newSession() { return { sessionId: "acp-1" }; },
  async authenticate() { return {}; },
  async cancel() {},
  async prompt({ sessionId }) {
    const send = (update) => conn.sessionUpdate({ sessionId, update });
    await send({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Running the suite. " } });
    await send({ sessionUpdate: "tool_call", toolCallId: "k1", title: "pnpm test", kind: "execute", status: "pending", rawInput: { command: "pnpm test" } });
    const answer = await conn.requestPermission({ sessionId, toolCall: { toolCallId: "k1", title: "pnpm test", kind: "execute", rawInput: { command: "pnpm test" } },
      options: [{ optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }] });
    const allowed = answer.outcome.outcome === "selected" && answer.outcome.optionId === "yes";
    await send({ sessionUpdate: "tool_call_update", toolCallId: "k1", status: allowed ? "completed" : "failed", content: [{ type: "content", content: { type: "text", text: "42 passed" } }] });
    await send({ sessionUpdate: "usage_update", used: 1200, size: 200000 });
    await send({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: allowed ? "All green." : "Not allowed." } });
    return { stopReason: "end_turn" };
  },
}), stream);
`,
    );
    const runtime = new AcpRuntime({ id: "acp:fake", label: "Fake", command: process.execPath, args: [agent] });
    const asked: string[] = [];
    const events = await collect(runtime.start({ id: "r1", ask: "test it", cwd: dir }, context(async (tool) => (asked.push(tool), { allow: true, reason: "ok" }))));
    expect(asked).toEqual(["Bash"]);
    expect(events.map((e) => e.type)).toEqual(["session", "text", "tool-call", "tool-result", "check", "usage", "text", "done"]);
    expect(events.find((e) => e.type === "check")).toMatchObject({ command: "pnpm test", exitCode: 0 });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });
});
