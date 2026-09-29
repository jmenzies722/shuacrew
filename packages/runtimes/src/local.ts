/**
 * The local runtime: a model running on this Mac through Ollama. No usage window, no account, works offline, nothing
 * leaves the machine. Spark falls back to it when Claude and Codex are out of usage, so you can always talk to it.
 *
 * It's a conversational runtime (no tools of its own): it answers, and Spark's own action blocks still run on the Mac.
 * Conversations keep their history in memory so follow-ups make sense; a gateway restart starts them fresh.
 */
import { randomUUID } from "node:crypto";
import type { Runtime, RunContext, RunSpec, RuntimeEvent, RuntimeStatus } from "./runtime.js";

export interface LocalOptions { host?: string; fetch?: typeof fetch }
type Message = { role: "system" | "user" | "assistant"; content: string };
/** Spark sends its local instructions in this block at the start of a conversation; they become the system prompt. */
const SYSTEM_BLOCK = /^<spark-system>\n([\s\S]*?)\n<\/spark-system>\n?/;
export function splitSystem(ask: string): { system?: string; ask: string } {
  const m = SYSTEM_BLOCK.exec(ask);
  return m ? { system: m[1], ask: ask.slice(m[0].length) } : { ask };
}
const CONTEXT = 16384; // must match between warm-up and real turns, or the prompt cache can't be reused

/** Local models Spark knows how to use, best first. Only installed ones are offered. */
export const LOCAL_MODELS = [
  { id: "gpt-oss:20b", label: "gpt-oss 20B (smart)", tier: "balanced" as const },
  { id: "llama3.2:3b", label: "Llama 3.2 3B (fast)", tier: "fast" as const },
  { id: "mistral:latest", label: "Mistral 7B", tier: "fast" as const },
];

export class LocalRuntime implements Runtime {
  readonly id = "local";
  readonly label = "On this Mac (Ollama)";
  readonly authMode = "subscription" as const;
  readonly capabilities = { subagents: false, checkpoints: false, cost: false, images: false, resume: true };
  readonly models = LOCAL_MODELS;
  private host: string;
  private http: typeof fetch;
  private conversations = new Map<string, Message[]>();

  constructor(options: LocalOptions = {}) {
    this.host = options.host ?? process.env.OLLAMA_HOST?.replace(/\/$/, "") ?? "http://127.0.0.1:11434";
    this.http = options.fetch ?? fetch;
  }

  /** Which of Spark's local models are installed. */
  async installed(): Promise<string[]> {
    try {
      const r = await this.http(`${this.host}/api/tags`, { signal: AbortSignal.timeout(2000) });
      const { models = [] } = await r.json() as { models?: Array<{ name: string }> };
      const names = new Set(models.map((m) => m.name));
      return LOCAL_MODELS.map((m) => m.id).filter((id) => names.has(id));
    } catch { return []; }
  }

  async status(): Promise<RuntimeStatus> {
    const have = await this.installed();
    return have.length
      ? { installed: true, signedIn: true, account: "this Mac", version: "ollama", detail: `ready: ${have.join(", ")}`, overridingKeys: [] }
      : { installed: false, signedIn: false, detail: "Ollama isn't running, or no local model is installed (ollama pull llama3.2:3b).", overridingKeys: [] };
  }

  /** Load a model into memory ahead of time, so the first answer isn't a cold start. */
  /**
   * Load a model ahead of time; with `system`, also read Spark's instructions once so they're cached — the first real
   * question then only costs its own few tokens.
   */
  async warm(model: string, minutes = 30, system?: string): Promise<boolean> {
    try {
      const body = system
        ? { model, messages: [{ role: "system", content: system }, { role: "user", content: "hi" }], stream: false, keep_alive: `${minutes}m`, options: { num_ctx: CONTEXT, num_predict: 1 }, ...(model.startsWith("gpt-oss") ? { think: "low" } : {}) }
        : { model, prompt: "", keep_alive: `${minutes}m` };
      const r = await this.http(`${this.host}${system ? "/api/chat" : "/api/generate"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
      return r.ok;
    } catch { return false; }
  }

  async *start(run: RunSpec, ctx: RunContext): AsyncIterable<RuntimeEvent> {
    const installed = await this.installed();
    const model = run.model && installed.includes(run.model) ? run.model : installed[0];
    if (!model) { yield { type: "error", message: "No local model is available — start Ollama and pull one (ollama pull llama3.2:3b)." }; return; }
    const session = run.resume && this.conversations.has(run.resume) ? run.resume : `local-${randomUUID()}`;
    // Spark sends its instruction block every turn: ignored while we remember the conversation, and used to rebuild
    // it if we don't (after a gateway restart) — so the model is never left without its instructions.
    const parts = splitSystem(run.ask), system = parts.system ?? run.system;
    const history = this.conversations.get(session) ?? (system ? [{ role: "system" as const, content: system }] : []);
    history.push({ role: "user", content: parts.ask });
    this.conversations.set(session, history);
    yield { type: "session", id: session };

    const started = Date.now();
    let text = "";
    try {
      const body: Record<string, unknown> = { model, messages: history, stream: true, keep_alive: "30m", options: { num_ctx: CONTEXT } };
      if (model.startsWith("gpt-oss")) body.think = "low"; // reasoning models: think briefly, answer fast
      const r = await this.http(`${this.host}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctx.signal });
      if (!r.ok || !r.body) { yield { type: "error", message: `The local model didn't answer (${r.status}).` }; return; }
      const reader = r.body.getReader(), decoder = new TextDecoder();
      let buffer = "", inTokens = 0, outTokens = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const d = JSON.parse(line) as { message?: { content?: string }; done?: boolean; prompt_eval_count?: number; eval_count?: number; error?: string };
          if (d.error) { yield { type: "error", message: d.error }; return; }
          const chunk = d.message?.content ?? "";
          if (chunk) { text += chunk; yield { type: "text", text: chunk }; }
          if (d.done) { inTokens = d.prompt_eval_count ?? 0; outTokens = d.eval_count ?? 0; }
        }
      }
      history.push({ role: "assistant", content: text });
      // Keep it short: the instructions plus the last 8 exchanges. Every turn re-reads the whole conversation on this
      // Mac, so a long tail made simple questions take most of a minute.
      if (history.length > 17) this.conversations.set(session, [history[0]!, ...history.slice(-16)]);
      yield { type: "usage", inputTokens: inTokens, outputTokens: outTokens, costUsd: 0 };
      yield { type: "done", text, durationMs: Date.now() - started };
    } catch (e) {
      if (ctx.signal.aborted) return;
      yield { type: "error", message: `Couldn't reach the local model: ${(e as Error).message}` };
    }
  }
}
