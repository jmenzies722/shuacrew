import { query } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { findBinary } from "./claude.js";
import { RpcPeer } from "./codex.js";
/** A tool-free structured turn on the existing Claude Code login. No separate API credentials. */
export async function teachingCompletion(input: {
  prompt: string;
  system: string;
  schema: Record<string, unknown>;
  model: string;
  cwd: string;
  env: Record<string, string>;
  signal: AbortSignal;
  images: Array<{ mime: "image/png" | "image/jpeg" | "image/webp"; data: string }>;
}): Promise<unknown> {
  input.signal.throwIfAborted();
  const abort = new AbortController(),
    cancel = () => abort.abort();
  input.signal.addEventListener("abort", cancel, { once: true });
  async function* messages() {
    yield {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: [
          { type: "text" as const, text: input.prompt },
          ...input.images.map((image) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: image.mime, data: image.data },
          })),
        ],
      },
      parent_tool_use_id: null,
      session_id: "",
    };
  }
  let diagnostics = "";
  const stream = query({
    prompt: messages(),
    options: {
      stderr: (chunk) => {
        diagnostics = (diagnostics + chunk).slice(-3000);
      },
      cwd: input.cwd,
      model: input.model,
      env: input.env,
      systemPrompt: input.system,
      tools: [],
      mcpServers: {},
      settingSources: [],
      persistSession: false,
      maxTurns: 6,
      abortController: abort,
      pathToClaudeCodeExecutable: findBinary("claude"),
      outputFormat: { type: "json_schema", schema: input.schema },
      canUseTool: async () => ({ behavior: "deny", message: "Teaching has no execution tools." }),
    },
  });
  try {
    for await (const message of stream) {
      input.signal.throwIfAborted();
      if (message.type === "result") {
        if (message.subtype !== "success")
          throw new Error(
            `Teaching model: ${message.subtype}${"errors" in message ? ` · ${message.errors.join("; ")}` : ""}`,
          );
        if (message.structured_output !== undefined) return message.structured_output;
        throw new Error("The SDK returned no structured teaching result");
      }
    }
    throw new Error("The model ended without a teaching result");
  } catch (error) {
    throw new Error(`${(error as Error).message}${diagnostics ? ` · ${diagnostics}` : ""}`);
  } finally {
    input.signal.removeEventListener("abort", cancel);
    stream.close();
  }
}

/**
 * The same tool-free structured turn on Codex (`codex app-server`, the person's ChatGPT plan). Read-only sandbox,
 * no network, and every approval Codex might ask for is declined: it can only answer. Images go in as data URLs;
 * the turn's outputSchema constrains the final message to the lesson JSON.
 */
export async function codexTeachingCompletion(input: {
  prompt: string;
  system: string;
  schema: Record<string, unknown>;
  model: string;
  cwd: string;
  env: Record<string, string>;
  signal: AbortSignal;
  images: Array<{ mime: "image/png" | "image/jpeg" | "image/webp"; data: string }>;
}): Promise<unknown> {
  input.signal.throwIfAborted();
  const binary = findBinary("codex");
  if (!binary) throw new Error("Codex isn't installed — npm i -g @openai/codex, then codex login");
  const child = spawn(binary, ["app-server"], { cwd: input.cwd, env: input.env, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => (stderr = (stderr + String(chunk)).slice(-3000)));
  let final = "";
  let settle!: { resolve: () => void; reject: (e: Error) => void };
  const finished = new Promise<void>((resolve, reject) => (settle = { resolve, reject }));
  child.on("exit", (code) => settle.reject(new Error(`codex app-server exited (${code ?? "signal"})${stderr.trim() ? ` · ${stderr.trim().split("\n").pop()}` : ""}`)));
  const peer = new RpcPeer(
    child,
    (method, params) => {
      if (method === "item/completed" && params.item?.type === "agentMessage") final = String(params.item.text ?? "");
      if (method === "turn/completed") {
        const turn = params.turn ?? {};
        if (turn.status === "completed") settle.resolve();
        else {
          const said = String(turn.error?.message ?? turn.error?.codexErrorInfo ?? "");
          settle.reject(new Error(/usage limit|rate limit|usageLimitExceeded/i.test(said)
            ? `Codex is at its usage limit (${said.replace(/^.*?(try again|resets?)/i, "$1").trim() || "try later"}). Choose another available Codex model or retry after the limit resets.`
            : `Codex teaching turn ${turn.status ?? "failed"}: ${said}`.trim()));
        }
      }
    },
    async () => ({ decision: "decline" }), // no commands, no file changes, no permissions: teaching only answers
  );
  const cancel = () => settle.reject(Object.assign(new Error("Teaching cancelled"), { name: "AbortError" }));
  input.signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => settle.reject(new Error("Codex took too long to answer")), 180_000);
  try {
    await peer.request("initialize", { clientInfo: { name: "shuacrew", title: "ShuaCrew", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    peer.notify("initialized");
    const thread = await peer.request("thread/start", {
      cwd: input.cwd,
      model: input.model,
      approvalPolicy: "untrusted",
      sandbox: "read-only",
      developerInstructions: `${input.system}\n\nAnswer only. Do not run commands, read files or edit anything; reply with the JSON the schema asks for.`,
    });
    await peer.request("turn/start", {
      threadId: String(thread.thread?.id),
      input: [
        { type: "text", text: input.prompt, text_elements: [] },
        ...input.images.map((image) => ({ type: "image", url: `data:${image.mime};base64,${image.data}` })),
      ],
      outputSchema: input.schema,
      approvalPolicy: "untrusted",
      sandboxPolicy: { type: "readOnly", networkAccess: false },
    });
    await finished;
    const text = final.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    if (!text) throw new Error("Codex returned no teaching result");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Codex's teaching result wasn't valid JSON");
    }
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", cancel);
    child.kill("SIGTERM");
  }
}
