import { query } from "@anthropic-ai/claude-agent-sdk";
import { findBinary } from "./claude.js";
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
