/**
 * The local runtime: a model running on this Mac through Ollama. No usage window, no account, works offline, nothing
 * leaves the machine. Spark falls back to it when Claude and Codex are out of usage, so you can always talk to it.
 *
 * It answers conversationally, and Spark's own action blocks still run on the Mac. It can also look things up: the
 * model gets web_search and web_fetch tools, run here (Ollama's own search with OLLAMA_API_KEY, otherwise a keyless
 * DuckDuckGo search) — so when Claude is out, "what's the score" or "latest on X" still gets a real, sourced answer.
 * Conversations keep their history in memory so follow-ups make sense; a gateway restart starts them fresh.
 */
import { randomUUID } from "node:crypto";
import type { Runtime, RunContext, RunSpec, RuntimeEvent, RuntimeStatus } from "./runtime.js";

export interface LocalOptions { host?: string; fetch?: typeof fetch }
type Message = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: ToolCall[]; tool_name?: string };
type ToolCall = { function: { name: string; arguments: Record<string, unknown> | string } };
const TOOLS = [
  { type: "function", function: { name: "web_search", description: "Search the web for current or specific facts (news, scores, prices, weather, anything recent or that you're unsure of). Returns titles, links and snippets.", parameters: { type: "object", properties: { query: { type: "string", description: "What to search for" } }, required: ["query"] } } },
  { type: "function", function: { name: "web_fetch", description: "Read one web page (from a search result) to get the specifics.", parameters: { type: "object", properties: { url: { type: "string", description: "The page's full URL" } }, required: ["url"] } } },
];
const MAX_TOOL_ROUNDS = 3;
/** Plain text of an HTML page: scripts, styles and tags gone, entities decoded, whitespace collapsed. */
export function pageText(html: string): string {
  return html.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}
/** DuckDuckGo's HTML results as [title, url, snippet] (their redirect links unwrapped). */
export function duckResults(html: string): Array<{ title: string; url: string; snippet: string }> {
  const out: Array<{ title: string; url: string; snippet: string }> = [];
  for (const m of html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)) {
    let url = m[1]!.replace(/&amp;/g, "&");
    const wrapped = /[?&]uddg=([^&]+)/.exec(url); if (wrapped) url = decodeURIComponent(wrapped[1]!);
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue; // ads
    out.push({ title: pageText(m[2]!), url, snippet: pageText(m[3]!) });
    if (out.length >= 6) break;
  }
  return out;
}
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

  /** Run one of the model's tool calls here and return what it gets back (always text, never throws). */
  private async tool(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string> {
    const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" };
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
    try {
      if (name === "web_search") {
        const query = String(args.query ?? "").slice(0, 300); if (!query) return "No query.";
        const key = process.env.OLLAMA_API_KEY;
        if (key) {
          const r = await this.http("https://ollama.com/api/web_search", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, max_results: 5 }), signal: timeout });
          if (r.ok) { const { results = [] } = await r.json() as { results?: Array<{ title: string; url: string; content: string }> }; return results.map((x, i) => `${i + 1}. ${x.title} — ${x.url}\n${x.content.slice(0, 600)}`).join("\n\n") || "No results."; }
        }
        const r = await this.http(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: UA, signal: timeout });
        const results = duckResults(await r.text());
        return results.map((x, i) => `${i + 1}. ${x.title} — ${x.url}\n${x.snippet}`).join("\n\n") || "No results.";
      }
      if (name === "web_fetch") {
        const url = String(args.url ?? ""); if (!/^https?:\/\//.test(url)) return "Not a web address.";
        const r = await this.http(url, { headers: UA, signal: timeout, redirect: "follow" });
        const text = pageText(await r.text());
        return text ? text.slice(0, 6000) : `The page returned nothing readable (${r.status}).`;
      }
      return `Unknown tool ${name}.`;
    } catch (e) { return `That didn't work: ${(e as Error).message}`; }
  }

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
      let inTokens = 0, outTokens = 0;
      // The model may look things up first (a few rounds at most), then answer; only the answer streams out as text.
      for (let round = 0; ; round++) {
        const body: Record<string, unknown> = { model, messages: history, stream: true, keep_alive: "30m", options: { num_ctx: CONTEXT }, ...(round < MAX_TOOL_ROUNDS ? { tools: TOOLS } : {}) };
        if (model.startsWith("gpt-oss")) body.think = "low"; // reasoning models: think briefly, answer fast
        const r = await this.http(`${this.host}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctx.signal });
        if (!r.ok || !r.body) { yield { type: "error", message: `The local model didn't answer (${r.status}).` }; return; }
        const reader = r.body.getReader(), decoder = new TextDecoder();
        let buffer = "", said = "";
        const calls: ToolCall[] = [];
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const d = JSON.parse(line) as { message?: { content?: string; tool_calls?: ToolCall[] }; done?: boolean; prompt_eval_count?: number; eval_count?: number; error?: string };
            if (d.error) { yield { type: "error", message: d.error }; return; }
            if (d.message?.tool_calls?.length) calls.push(...d.message.tool_calls);
            const chunk = d.message?.content ?? "";
            if (chunk) { said += chunk; text += chunk; yield { type: "text", text: chunk }; }
            if (d.done) { inTokens += d.prompt_eval_count ?? 0; outTokens += d.eval_count ?? 0; }
          }
        }
        if (!calls.length) break;
        history.push({ role: "assistant", content: said, tool_calls: calls });
        for (const [i, call] of calls.slice(0, 3).entries()) {
          const name = call.function.name, args = typeof call.function.arguments === "string" ? (() => { try { return JSON.parse(call.function.arguments as string) as Record<string, unknown>; } catch { return {}; } })() : call.function.arguments;
          const id = `local-tool-${round}-${i}`, t0 = Date.now();
          // Named like Claude's tools so the notch shows "Searching: …" / "Reading …" the same way.
          yield { type: "tool-call", id, tool: name === "web_search" ? "WebSearch" : name === "web_fetch" ? "WebFetch" : name, input: args };
          const output = await this.tool(name, args, ctx.signal);
          yield { type: "tool-result", id, ok: !output.startsWith("That didn't work"), output: output.slice(0, 2000), durationMs: Date.now() - t0 };
          history.push({ role: "tool", content: output, tool_name: name });
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
