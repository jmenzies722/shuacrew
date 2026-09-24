/**
 * Any agent that speaks the Agent Client Protocol — Kiro CLI (`kiro-cli acp`), Gemini CLI, and
 * whatever comes next — over stdio.
 *
 * The agent uses its own sign-in (for Kiro: `kiro-cli login`, and that seat's credits). ShuaCrew
 * only launches the command, relays the session, and answers `session/request_permission` from the
 * gateway's single policy engine, so a Kiro run is governed exactly like a Claude or Codex run.
 */
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import type { AuthMode, Runtime, RunContext, RunSpec, RuntimeEvent, RuntimeStatus } from "./runtime.js";
import { isCheck, limitFrom, textOf } from "./shared.js";

type Json = Record<string, any>;

export interface AcpOptions {
  id: string; // "acp:kiro"
  label: string;
  command: string;
  args: string[];
  authMode?: AuthMode;
  models?: Runtime["models"];
}

/** ACP session updates, as ShuaCrew events. */
export class AcpTranslator {
  private calls = new Map<string, Json>();

  translate(update: Json): RuntimeEvent[] {
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        return update.content?.type === "text" && update.content.text ? [{ type: "text", text: update.content.text }] : [];
      case "agent_thought_chunk":
        return update.content?.text ? [{ type: "thinking", text: update.content.text }] : [];
      case "tool_call": {
        this.calls.set(update.toolCallId, update);
        return [{ type: "tool-call", id: update.toolCallId, tool: toolName(update), input: update.rawInput ?? { title: update.title } }];
      }
      case "tool_call_update": {
        const call = { ...(this.calls.get(update.toolCallId) ?? {}), ...update };
        this.calls.set(update.toolCallId, call);
        if (update.status !== "completed" && update.status !== "failed") return [];
        const ok = update.status === "completed";
        const output = textOf((update.content ?? []).map((c: Json) => c.content ?? c)) || textOf(update.rawOutput ?? "");
        const out: RuntimeEvent[] = [{ type: "tool-result", id: update.toolCallId, ok, output: output.slice(0, 20_000) }];
        if (ok && call.kind === "edit") {
          for (const location of call.locations ?? []) if (location.path) out.push({ type: "file", path: String(location.path) });
        }
        const command = String(call.rawInput?.command ?? "");
        if (call.kind === "execute" && command && isCheck(command)) out.push({ type: "check", command, exitCode: ok ? 0 : 1, output: output.slice(0, 2000) });
        return out;
      }
      case "usage_update":
        return [{ type: "usage", inputTokens: 0, outputTokens: 0, contextUsed: update.used, contextLimit: update.size, costUsd: update.cost?.amount }];
      default:
        return [];
    }
  }
}

function toolName(update: Json): string {
  const kinds: Record<string, string> = { read: "Read", edit: "Edit", delete: "Delete", move: "Move", search: "Grep", execute: "Bash", fetch: "WebFetch", think: "Think" };
  return kinds[String(update.kind)] ?? String(update.title ?? "tool");
}

export class AcpRuntime implements Runtime {
  readonly id: string;
  readonly label: string;
  readonly authMode: AuthMode;
  readonly capabilities = { subagents: false, checkpoints: false, cost: false, images: false, resume: true };
  readonly models: Runtime["models"];

  constructor(private options: AcpOptions) {
    this.id = options.id;
    this.label = options.label;
    this.authMode = options.authMode ?? "subscription";
    this.models = options.models ?? [];
  }

  async status(): Promise<RuntimeStatus> {
    return { installed: true, signedIn: null, detail: `runs \`${[this.options.command, ...this.options.args].join(" ")}\` with its own sign-in`, overridingKeys: [] };
  }

  async *start(run: RunSpec, ctx: RunContext): AsyncIterable<RuntimeEvent> {
    const acp = await import("@agentclientprotocol/sdk");
    const child = spawn(this.options.command, this.options.args, { cwd: run.cwd, env: ctx.env, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => (stderr = (stderr + String(chunk)).slice(-4000)));
    const translator = new AcpTranslator();
    const queue: RuntimeEvent[] = [];
    let wake: (() => void) | null = null;
    const push = (events: RuntimeEvent[]) => {
      queue.push(...events);
      wake?.();
    };

    const stream = acp.ndJsonStream(Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>);
    const connection = new acp.ClientSideConnection(
      () => ({
        async sessionUpdate(notification: Json) {
          push(translator.translate(notification.update ?? {}));
        },
        async requestPermission(request: Json) {
          const call = request.toolCall ?? {};
          const answer = await ctx.approve(toolName(call), call.rawInput ?? { title: call.title });
          const options: Json[] = request.options ?? [];
          const pick = options.find((o) => (answer.allow ? o.kind === "allow_once" : o.kind === "reject_once")) ?? options.find((o) => String(o.kind).startsWith(answer.allow ? "allow" : "reject"));
          return pick ? { outcome: { outcome: "selected", optionId: pick.optionId } } : { outcome: { outcome: "cancelled" } };
        },
      }) as never,
      stream,
    );

    let sessionId: string | undefined;
    const abort = () => {
      if (sessionId) void connection.cancel({ sessionId }).catch(() => undefined);
      setTimeout(() => child.kill("SIGTERM"), 1500).unref();
    };
    ctx.signal.addEventListener("abort", abort, { once: true });

    try {
      const init: Json = await connection.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } } } as never);
      if (run.resume && init.agentCapabilities?.loadSession) {
        await connection.loadSession({ sessionId: run.resume, cwd: run.cwd, mcpServers: (run.mcpServers as never) ?? [] } as never);
        sessionId = run.resume;
        queue.length = 0; // loading replays history as updates; this turn starts clean
      } else {
        const created: Json = await connection.newSession({ cwd: run.cwd, mcpServers: (run.mcpServers as never) ?? [] } as never);
        sessionId = String(created.sessionId);
      }
      yield { type: "session", id: sessionId };
      const prompt = (run.system ? `${run.system}\n\n---\n\n` : "") + run.ask;
      let result: Json | undefined;
      let failure: Error | undefined;
      const done = connection
        .prompt({ sessionId, prompt: [{ type: "text", text: prompt }] } as never)
        .then((r: Json) => (result = r))
        .catch((e: Error) => (failure = e))
        .finally(() => wake?.());

      let text = "";
      for (;;) {
        while (queue.length) {
          const event = queue.shift()!;
          if (event.type === "text") text += event.text;
          yield event;
        }
        if (result || failure) break;
        await new Promise<void>((resolve) => (wake = resolve));
        wake = null;
      }
      await done;
      while (queue.length) yield queue.shift()!;
      if (failure) {
        const message = `${failure.message} ${stderr}`;
        const limit = /limit|quota|credits/i.test(message) ? limitFrom(message) : null;
        yield limit ? { type: "limited", until: limit.until, message: failure.message } : { type: "error", message: failure.message };
        return;
      }
      if (result?.usage) {
        yield { type: "usage", inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 };
      }
      if (result?.stopReason === "refusal") yield { type: "error", message: "the agent refused" };
      else yield { type: "done", text: text.trim().split("\n").slice(-3).join("\n") };
    } finally {
      ctx.signal.removeEventListener("abort", abort);
      child.kill("SIGTERM");
    }
  }
}
