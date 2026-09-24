/**
 * Claude, through the Claude Agent SDK — on the person's own Claude subscription.
 *
 * The SDK drives the official Claude Code binary, which resolves its own credentials. With no
 * ANTHROPIC_API_KEY in its environment (the gateway strips it in subscription mode) that is the
 * claude.ai login from `claude` → `/login`; ShuaCrew never reads or stores the token. The SDK's
 * `env` option *replaces* the child's environment, so the stripped environment is exactly what
 * the agent sees.
 *
 * Every tool call Claude would ask about goes through `canUseTool` → `ctx.approve` → the gateway's
 * single policy engine.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AuthMode, Runtime, RunContext, RunSpec, RuntimeEvent, RuntimeStatus } from "./runtime.js";
import { isCheck, limitFrom, overridingKeys, textOf } from "./shared.js";

const exec = promisify(execFile);
const WRITERS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

type Json = Record<string, any>; // SDK message shapes are wide unions; the translator reads them defensively.

/**
 * Claude's stream, as ShuaCrew events. Pure apart from its own bookkeeping (pending tool calls,
 * streamed text), so it is tested against recorded message shapes without spending usage.
 */
export class ClaudeTranslator {
  private calls = new Map<string, { tool: string; input: Json; subagent?: string }>();
  private streamed = false; // text arrived as deltas: don't repeat it from the assembled message
  /** What the newest main-agent call was sent: the conversation's real size right now. */
  private lastContext?: number;
  sessionId?: string;
  model?: string;

  translate(message: Json): RuntimeEvent[] {
    const out: RuntimeEvent[] = [];
    switch (message.type) {
      case "system":
        if (message.subtype === "init") {
          this.sessionId = message.session_id;
          this.model = message.model;
          out.push({ type: "session", id: message.session_id });
        }
        if (message.subtype === "compact_boundary") out.push({ type: "thinking", text: "Compacted the conversation to free context." });
        break;
      case "stream_event": {
        const event = message.event ?? {};
        if (message.parent_tool_use_id) break; // subagent chatter stays inside the subagent
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
          this.streamed = true;
          out.push({ type: "text", text: event.delta.text });
        }
        break;
      }
      case "assistant": {
        const content: Json[] = message.message?.content ?? [];
        const subagent = message.parent_tool_use_id ?? undefined;
        const call = message.message?.usage;
        if (!subagent && call) this.lastContext = (call.input_tokens ?? 0) + (call.cache_read_input_tokens ?? 0) + (call.cache_creation_input_tokens ?? 0) || this.lastContext;
        if (message.error === "rate_limit") {
          out.push({ type: "limited", until: Date.now() + 30 * 60_000, message: "Claude usage limit reached", model: this.model });
          break;
        }
        for (const block of content) {
          if (block.type === "tool_use") {
            this.calls.set(block.id, { tool: block.name, input: block.input ?? {}, subagent });
            out.push({ type: "tool-call", id: block.id, tool: block.name, input: block.input ?? {}, subagent });
          } else if (block.type === "text" && !subagent && !this.streamed && block.text?.trim()) {
            out.push({ type: "text", text: `${block.text}\n` });
          }
        }
        this.streamed = false;
        break;
      }
      case "user": {
        const content = message.message?.content;
        if (!Array.isArray(content)) break;
        for (const block of content as Json[]) {
          if (block.type !== "tool_result") continue;
          const call = this.calls.get(block.tool_use_id);
          this.calls.delete(block.tool_use_id);
          const ok = !block.is_error;
          const output = textOf(block.content);
          out.push({ type: "tool-result", id: block.tool_use_id, ok, output: output.slice(0, 20_000) });
          if (!call) continue;
          if (ok && WRITERS.has(call.tool)) {
            const file = call.input.file_path ?? call.input.notebook_path;
            if (typeof file === "string") out.push({ type: "file", path: file, change: call.tool === "Write" ? "added" : "modified" });
          }
          if (call.tool === "Bash" && typeof call.input.command === "string" && isCheck(call.input.command)) {
            out.push({ type: "check", command: call.input.command, exitCode: ok ? 0 : 1, output: output.slice(0, 2000) });
          }
        }
        break;
      }
      case "rate_limit_event": {
        const info = message.rate_limit_info ?? {};
        if (info.status === "rejected") {
          const until = typeof info.resetsAt === "number" ? (info.resetsAt < 1e12 ? info.resetsAt * 1000 : info.resetsAt) : Date.now() + 30 * 60_000;
          // "credits_required": this model isn't in the plan without paid usage credits — not a window.
          const credits = info.errorCode === "credits_required";
          out.push({
            type: "limited",
            until,
            message: credits ? `${this.model ?? "This model"} needs usage credits on your plan` : `Claude ${String(info.rateLimitType ?? "usage").replace(/_/g, " ")} limit reached`,
            model: this.model,
            credits,
          });
        }
        break;
      }
      case "result": {
        const usage = message.usage ?? {};
        const models: Json = message.modelUsage ?? {};
        const window = Object.values(models).find((m: Json) => m?.contextWindow)?.contextWindow as number | undefined;
        // The result's usage is summed over every call in the turn — cache reads repeat on each one —
        // so it says what the turn cost, not how full the context is. That's the newest call's input.
        out.push({
          type: "usage",
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheTokens: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
          costUsd: message.total_cost_usd,
          contextUsed: this.lastContext,
          contextLimit: window,
        });
        if (message.is_error) {
          const errors = [...(message.errors ?? []), message.result ?? ""].join(" ");
          const limited = message.api_error_status === 429 || /rate.?limit|usage limit|limit reached|usage credits/i.test(errors);
          if (limited) out.push({ type: "limited", ...(limitFrom(errors) ?? { until: Date.now() + 30 * 60_000 }), message: errors.trim() || "Claude usage limit", model: this.model, credits: /usage credits/i.test(errors) });
          else out.push({ type: "error", message: errors.trim() || String(message.subtype) });
        } else {
          out.push({ type: "checkpoint", note: "turn complete" });
          out.push({ type: "done", text: String(message.result ?? ""), durationMs: message.duration_ms });
        }
        break;
      }
      default:
        break;
    }
    return out;
  }
}

export interface ClaudeOptions {
  authMode?: AuthMode;
  /** The Claude Code binary; defaults to the person's own `claude` so both share one login. */
  executable?: string;
}

export class ClaudeRuntime implements Runtime {
  readonly id = "claude";
  readonly label = "Claude (Agent SDK)";
  readonly authMode: AuthMode;
  readonly capabilities = { subagents: true, checkpoints: true, cost: true, images: true, resume: true };
  readonly models = [
    { id: "claude-fable-5-1", label: "Fable 5.1", tier: "frontier" as const },
    { id: "claude-opus-5-5", label: "Opus 5.5", tier: "frontier" as const },
    { id: "claude-sonnet-5", label: "Sonnet 5", tier: "balanced" as const },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", tier: "fast" as const },
  ];
  private executable?: string;

  constructor(options: ClaudeOptions = {}) {
    this.authMode = options.authMode ?? "subscription";
    this.executable = options.executable ?? findBinary("claude");
  }

  async status(): Promise<RuntimeStatus> {
    const overriding = overridingKeys(process.env, this.authMode, ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]);
    if (!this.executable) return { installed: false, signedIn: null, detail: "Claude Code isn't installed — see claude.com/code", overridingKeys: overriding };
    try {
      const [{ stdout: version }, { stdout: auth }] = await Promise.all([
        exec(this.executable, ["--version"], { timeout: 10_000 }),
        exec(this.executable, ["auth", "status"], { timeout: 10_000 }),
      ]);
      const info = JSON.parse(auth) as { loggedIn?: boolean; authMethod?: string; email?: string };
      return {
        installed: true,
        signedIn: Boolean(info.loggedIn),
        account: info.email,
        version: version.trim().split(" ")[0],
        detail: info.loggedIn ? `signed in via ${info.authMethod ?? "claude.ai"}` : "not signed in — run `claude` and /login",
        overridingKeys: overriding,
      };
    } catch (error) {
      return { installed: true, signedIn: null, detail: `couldn't read status: ${(error as Error).message.split("\n")[0]}`, overridingKeys: overriding };
    }
  }

  async *start(run: RunSpec, ctx: RunContext): AsyncIterable<RuntimeEvent> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const abort = new AbortController();
    ctx.signal.addEventListener("abort", () => abort.abort(), { once: true });
    const translator = new ClaudeTranslator();
    const subagents = new Map<string, string>();
    const pending: RuntimeEvent[] = []; // events raised by hooks, yielded with the next message

    // Streaming input, not a plain string: with a string the SDK closes its control channel the
    // moment the main agent answers, and a background subagent still working (and asking
    // permission) is cut off mid-task. The input stays open until every subagent has settled.
    let closeInput!: () => void;
    const inputClosed = new Promise<void>((resolve) => (closeInput = resolve));
    abort.signal.addEventListener("abort", () => closeInput(), { once: true });
    async function* input() {
      yield { type: "user" as const, message: { role: "user" as const, content: run.ask }, parent_tool_use_id: null, session_id: "" };
      await inputClosed;
    }
    const running = new Set<string>(); // subagents that started and haven't stopped
    let held: RuntimeEvent | undefined; // the turn's "done", held while subagents still work
    let grace: NodeJS.Timeout | undefined;
    // After the last subagent stops, the main agent usually answers again with its result; if it
    // doesn't within a short grace, the turn is over.
    const settle = () => {
      clearTimeout(grace);
      if (held && running.size === 0) grace = setTimeout(() => closeInput(), 15_000);
    };

    const conversation = query({
      prompt: input() as never,
      options: {
        cwd: run.cwd,
        model: run.model,
        effort: run.effort as never,
        resume: run.resume,
        env: { ...ctx.env, CLAUDE_AGENT_SDK_CLIENT_APP: "shuacrew/0.1.0" },
        abortController: abort,
        permissionMode: "default",
        includePartialMessages: true,
        enableFileCheckpointing: true,
        pathToClaudeCodeExecutable: this.executable,
        // Claude Code's own system prompt, with ShuaCrew's lessons and context appended.
        systemPrompt: { type: "preset", preset: "claude_code", ...(run.system ? { append: run.system } : {}) },
        agents: run.agents,
        mcpServers: run.mcpServers,
        ...(run.plugins?.length ? { plugins: run.plugins } : {}),
        canUseTool: async (tool: string, input: Record<string, unknown>, options: { agentID?: string }) => {
          const answer = await ctx.approve(tool, input, { subagent: options?.agentID });
          return answer.allow
            ? { behavior: "allow" as const, updatedInput: (answer.input as Record<string, unknown>) ?? input }
            : { behavior: "deny" as const, message: `ShuaCrew policy refused this: ${answer.reason}. Don't retry it another way — explain what you needed.` };
        },
        hooks: {
          SubagentStart: [
            {
              hooks: [
                async (input: Json) => {
                  subagents.set(input.agent_id, input.agent_type);
                  running.add(input.agent_id);
                  clearTimeout(grace);
                  pending.push({ type: "subagent-start", id: input.agent_id, name: input.agent_type ?? "subagent", task: input.agent_type ?? "" });
                  return {};
                },
              ],
            },
          ],
          SubagentStop: [
            {
              hooks: [
                async (input: Json) => {
                  pending.push({ type: "subagent-end", id: input.agent_id, ok: true, summary: String(input.last_assistant_message ?? "").slice(0, 400) });
                  running.delete(input.agent_id);
                  settle();
                  return {};
                },
              ],
            },
          ],
        },
      } as never,
    });

    try {
      for await (const message of conversation as AsyncIterable<Json>) {
        while (pending.length) yield pending.shift()!;
        for (const event of translator.translate(message)) {
          if (event.type === "done") {
            // The latest answer wins; it's the turn's end only once no subagent is still working.
            held = event;
            if (running.size === 0) closeInput();
            else settle();
            continue;
          }
          if (event.type === "error" || event.type === "limited") closeInput();
          yield event;
        }
      }
      while (pending.length) yield pending.shift()!;
      if (held) yield held;
    } finally {
      clearTimeout(grace);
      closeInput();
      abort.abort();
    }
  }
}

export function findBinary(name: string): string | undefined {
  const candidates = [
    path.join(os.homedir(), ".local/bin", name),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    ...(process.env.PATH ?? "").split(":").map((dir) => path.join(dir, name)),
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}
