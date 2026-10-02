/**
 * Live: talk to Shua like a phone call. OpenAI's realtime voice (Codex app-server, v3 "frameless" over WebRTC, on the
 * ChatGPT sign-in, no API key) is the ears and mouth; a Codex thread is the hands. Audio flows straight between the
 * page and OpenAI; this side only negotiates the call, relays what happened, and asks you before anything risky.
 *
 * What P0 measured (docs/research/live-voice.md): honest results need the backend's messages tagged [STATUS] vs
 * [COMPLETE] with codexResponseHandoffMode "bemTags" (untagged progress made the voice guess an answer), and the
 * voice only speaks while input audio flows, so the page never sends digital silence.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentEnv } from "@shuacrew/core";
import { RpcPeer, findBinary } from "@shuacrew/runtimes";
import { TOOL_SERVER } from "./toolserver.js";

interface Socket {
  send(data: string): void;
  close(): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "close", listener: () => void): void;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/** The voices realtime v3 accepts (thread/realtime/listVoices "v1" list). */
export const LIVE_VOICES = ["cove", "juniper", "maple", "spruce", "ember", "vale", "breeze", "arbor", "sol"] as const;
export const LIVE_CHANNELS = { analysis: ["[ANALYSIS]"], commentary: ["[STATUS]", "[COMMENTARY]"], final: ["[COMPLETE]"] };
const RECENT_MAX = 12;

/** The voice: who it is, and the truth rules that keep it from guessing results. */
export function livePrompt(name: string, first?: string): string {
  return [
    `You are ${name}, the voice of ${first ? `${first}'s` : "the user's"} Mac, talking with them live like a phone call. You talk; a backend agent with access to the Mac does the work. Present everything as done by you and never mention a backend.`,
    "Truth rules, above everything else:",
    "- Facts about their files, apps, calendar, mail, screen, or the web come ONLY from backend messages. Never guess them.",
    "- Never say something is done or found before the backend says so. While it works, say at most a few words about what you're doing (\"Checking your calendar.\"), then wait quietly.",
    "- When the result arrives, say it in one or two natural sentences. If it failed or found nothing, say that plainly.",
    "Delegate every action, lookup, or question about their Mac, files, apps, schedule, messages, or anything current on the internet; pass their own words. Answer directly only for small talk and general knowledge you are sure of. Corrections and additions to running work: delegate them too, they steer it.",
    "Style: warm, quick, natural; short spoken sentences. No lists or markdown, never read code or long paths aloud. No filler like \"Sure!\" or \"Great question\". If they interrupt, stop and listen.",
  ].join("\n");
}

/** The hands: tagged messages (so only the result is spoken), short spoken results, and the folders it never touches. */
export function liveBackendInstructions(protectedPaths: string[], vocab = ""): string {
  return [
    "Realtime voice is active: your messages are relayed to a voice talking with the user right now.",
    "Every message must begin at byte zero with [STATUS] and one space for meaningful progress, or [COMPLETE] and one space for the final result, a question, or a blocker. [ANALYSIS] is silent context. Never put the tag anywhere else.",
    "Keep [COMPLETE] short and speakable: one or two plain sentences, no markdown, no code, no long paths. Put detail the user should see (a command, a link) after the first sentence; it is shown, not read.",
    "You are on the user's Mac. Use the shell (open, osascript, shortcuts, mdfind, curl) and web search to get things done. Ask before anything destructive or that sends something on their behalf.",
    "Your working directory is a private scratch folder, not theirs: \"my folder\" or \"this folder\" means the frontmost Finder window (osascript -e 'tell application \"Finder\" to get POSIX path of (target of front window as alias)'), and their files live under their home folder (find them with mdfind).",
    vocab ? `For their calendar, reminders, notes, mail, music, timers, volume and other Mac controls, use the spark_do tool FIRST: it reads every account on this Mac (iCloud, Google, Exchange) natively and needs no approval. Other connectors and the shell only if spark_do can't. Its actions are the JSON objects shown inside these do blocks; pass them as \`actions\`:\n${vocab}` : "",
    protectedPaths.length ? `Never read, list, search, or touch these folders or anything inside them: ${protectedPaths.join(", ")}. If asked, say they're off limits.` : "",
  ].filter(Boolean).join("\n");
}

/** Codex permission profile for Live: the protected folders can't even be read, enforced by the sandbox, not the prompt. */
export function permissionArgs(workspace: string, protectedPaths: string[]): string[] {
  const home = os.homedir(), abs = (p: string) => (p.startsWith("~/") ? path.join(home, p.slice(2)) : p);
  const q = (s: string) => JSON.stringify(s); // TOML basic strings share JSON's escaping for paths
  const entries = [`":root" = "read"`, `":workspace_roots" = "write"`, `":tmpdir" = "write"`, `${q(workspace)} = "write"`, ...protectedPaths.map((p) => `${q(abs(p))} = "deny"`)];
  return ["-c", 'default_permissions="shua_live"', "-c", `permissions.shua_live.filesystem={ ${entries.join(", ")} }`];
}

/**
 * Specifics the voice said that neither the result nor the user said: times, numbers, and names. Measured: after
 * "[COMPLETE] … no events today" the voice said "You've got Lunch at noon." Paraphrase is fine; new facts are not.
 */
const STOP = new Set("i i'm i've i'll you you're you've your it it's that's there there's here here's okay ok yes no sure sorry so and but the a an all done got one".split(" "));
export function unsupportedClaims(spoken: string, sources: string): string[] {
  const src = sources.toLowerCase().replace(/[’']/g, "'");
  const words = ["noon", "midnight", "tomorrow", "yesterday", "tonight"];
  const claims = [
    ...(spoken.match(/\b\d{1,2}(:\d{2})?\s?(a\.?m\.?|p\.?m\.?)?/gi) ?? []).map((t) => t.replace(/\s+/g, " ").trim()),
    ...words.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(spoken)),
    // Capitalised words that don't start a sentence: names, places, titles.
    ...[...spoken.matchAll(/(?<![.!?]\s|^)\b([A-Z][a-z][\w'’-]*)/g)].map((m) => m[1]!).filter((w) => !STOP.has(w.toLowerCase().replace(/[’]/g, "'"))),
  ];
  const digits = (t: string) => t.replace(/\D/g, "");
  return [...new Set(claims)].filter((c) => {
    const lc = c.toLowerCase();
    if (/\d/.test(c)) return !src.includes(digits(c)) && !src.includes(lc);
    return !src.includes(lc);
  });
}

const stripTag = (text: string) => text.replace(/^\s*\[(STATUS|COMMENTARY|COMPLETE|ANALYSIS|FINAL)\]\s*/, "");
export const touchesProtected = (text: string, protectedPaths: string[]) => {
  const home = os.homedir(), t = text.replaceAll("~/", `${home}/`).replaceAll("$HOME/", `${home}/`);
  return protectedPaths.some((p) => { const abs = p.startsWith("~/") ? path.join(home, p.slice(2)) : p; return t.includes(abs) || t.includes(path.basename(abs)); });
};

/** The one tool Live's hands get from ShuaCrew: Spark's native Mac actions, run by the notch page. */
export const LIVE_TOOLS = [{
  name: "spark_do",
  description: "Do things on the user's Mac natively through ShuaCrew (calendar, reminders, notes, mail drafts, music, timers, volume and system controls, apps, settings pages, the user's crew). Pass `actions`: an array of action objects, exactly the shapes in your instructions. Returns what happened and anything it read.",
  inputSchema: { type: "object", properties: { actions: { type: "array", items: { type: "object" }, description: "Up to 5 action objects" } }, required: ["actions"], additionalProperties: false },
}];

export interface LiveOptions {
  /** ShuaCrew's MCP server for this call (the spark_do tool), in Codex's mcp_servers shape. */
  mcpFor?: (run: string) => Record<string, unknown>;
  home: string; // ~/.shuacrew
  protectedPaths: () => string[];
  binary?: string;
  /** The user's first name for the voice, if known. */
  firstName?: () => string | undefined;
}

/** One live call per socket; a new call replaces the old one. */
export class LiveVoice {
  private current?: LiveCall;
  constructor(private options: LiveOptions) {}
  /** spark_do from the hands → the page holding the call → back. Only the current call's token reaches this. */
  async tool(run: string, name: string, args: Record<string, unknown>): Promise<string> {
    if (name !== "spark_do" || !this.current || run !== this.current.run) throw new Error("No live call is running.");
    return this.current.relay(Array.isArray(args.actions) ? args.actions : []);
  }
  attach(socket: Socket) {
    this.current?.end("replaced by a new call");
    const call = new LiveCall(socket, this.options);
    this.current = call;
    socket.on("close", () => { call.end("closed"); if (this.current === call) this.current = undefined; });
  }
}

class LiveCall {
  private child?: ChildProcess;
  private peer?: RpcPeer;
  private threadId?: string;
  private ended = false;
  private approvals = new Map<string, (allow: boolean) => void>();
  private recent: Array<{ role: "user" | "assistant"; text: string }>;
  private dir: string;
  readonly run = `live:${Math.random().toString(36).slice(2, 10)}`;
  /** The last result from the hands and what the user asked: what the voice may state as fact for the next 25 s. */
  private truth?: { text: string; at: number };
  private heard = "";
  private relays = new Map<string, (text: string) => void>();

  constructor(private socket: Socket, private options: LiveOptions) {
    this.dir = path.join(options.home, "live");
    mkdirSync(this.dir, { recursive: true });
    this.recent = readJson(path.join(this.dir, "recent.json"), []);
    socket.on("message", (raw) => {
      let m: Json;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (m?.type === "start" && typeof m.sdp === "string") void this.start(m.sdp, m.voice, typeof m.vocab === "string" ? m.vocab.slice(0, 20_000) : "").catch((e: Error) => this.fail(e.message));
      else if (m?.type === "done" && typeof m.id === "string") { this.relays.get(m.id)?.(String(m.text ?? "")); this.relays.delete(m.id); }
      else if (m?.type === "approve" && typeof m.id === "string") { this.approvals.get(m.id)?.(m.allow === true); this.approvals.delete(m.id); }
      else if (m?.type === "text" && typeof m.text === "string" && this.threadId) void this.peer?.request("thread/realtime/appendText", { threadId: this.threadId, role: "user", text: m.text.slice(0, 4000) }).catch(() => undefined);
      else if (m?.type === "stop") this.end("stopped");
    });
  }

  private send(m: Json) { if (!this.ended) { try { this.socket.send(JSON.stringify(m)); } catch { /* gone */ } } }
  private fail(message: string) { this.send({ type: "error", message }); this.end(message); }

  /** Spark's actions run in the page (its executor and checks); the result comes back as the tool's answer. */
  relay(actions: unknown[]): Promise<string> {
    const id = Math.random().toString(36).slice(2, 10);
    return new Promise((resolve) => {
      this.relays.set(id, resolve);
      this.send({ type: "do", id, actions: actions.slice(0, 5) });
      setTimeout(() => { if (this.relays.delete(id)) resolve("The Mac didn't answer in time."); }, 90_000).unref();
    });
  }

  private async start(sdp: string, voice?: string, vocab = "") {
    const binary = this.options.binary ?? findBinary("codex");
    if (!binary) throw new Error("Live needs Codex installed and signed in to ChatGPT.");
    const t0 = Date.now();
    const protectedPaths = this.options.protectedPaths();
    this.child = spawn(binary, ["app-server", ...permissionArgs(this.dir, protectedPaths)], { cwd: this.dir, env: agentEnv(process.env, "subscription"), stdio: ["pipe", "pipe", "pipe"] });
    if (process.env.SHUACREW_LIVE_DEBUG) this.child.stderr?.on("data", (d) => appendFileSync(path.join(this.dir, "debug.log"), `stderr ${String(d).slice(0, 800)}`)); else this.child.stderr?.resume();
    this.child.on("exit", () => { if (!this.ended) this.fail("The live connection closed."); });
    this.peer = new RpcPeer(this.child, (method, params) => this.notified(method, params), (method, params) => this.asked(method, params));
    await this.peer.request("initialize", { clientInfo: { name: "shuacrew-live", title: "ShuaCrew Live", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    this.peer.notify("initialized");
    // Sandboxed by the OS (Seatbelt): reads anywhere except protected folders, writes only in ~/.shuacrew/live.
    // Anything more (opening apps, AppleScript) is an escalation you approve in the notch.
    const mcp = vocab && this.options.mcpFor ? this.options.mcpFor(this.run) : undefined;
    // Low reasoning effort: a call is a conversation, and the voice is waiting on every turn.
    const thread = { cwd: this.dir, approvalPolicy: "on-request", developerInstructions: liveBackendInstructions(protectedPaths, vocab), config: { model_reasoning_effort: "low", ...(mcp ? { mcp_servers: mcp } : {}) } };
    // A fresh thread per call: a resumed one had grown to 115k input tokens and took 28 s to answer "what's on my
    // calendar". Continuity comes from the recent lines given to the voice instead.
    this.threadId = String((await this.peer.request("thread/start", thread)).thread?.id);
    const answer = new Promise<string>((resolve, reject) => {
      this.onSdp = resolve;
      setTimeout(() => reject(new Error("The live voice didn't answer. Try again in a moment.")), 20_000).unref();
    });
    await this.peer.request("thread/realtime/start", {
      threadId: this.threadId, version: "v3", outputModality: "audio", transport: { type: "webrtc", sdp },
      voice: LIVE_VOICES.includes(voice as never) ? voice : undefined,
      prompt: livePrompt("Shua", this.options.firstName?.()),
      includeStartupContext: false,
      // The last few lines of the previous call, so "what was that again?" works across calls.
      initialItems: this.recent.slice(-RECENT_MAX).map((r) => ({ role: r.role, text: r.text.slice(0, 400) })),
      realtimeStartInstructions: liveBackendInstructions(protectedPaths),
      codexResponseHandoffMode: "bemTags",
      codexResponseHandoffChannelPrefixes: LIVE_CHANNELS,
    });
    this.send({ type: "answer", sdp: await answer, threadId: this.threadId, setupMs: Date.now() - t0 });
  }
  private onSdp?: (sdp: string) => void;

  private notified(method: string, p: Json) {
    if (process.env.SHUACREW_LIVE_DEBUG && !method.endsWith("/delta")) appendFileSync(path.join(this.dir, "debug.log"), `${new Date().toISOString()} ${method} ${JSON.stringify(p).slice(0, 600)}\n`);
    if (method === "thread/realtime/sdp") return this.onSdp?.(p.sdp);
    if (method === "thread/realtime/transcript/done" && p.text?.trim()) {
      const role = p.role === "assistant" ? "assistant" : "user", text = String(p.text).trim();
      if (role === "user") this.heard = `${this.heard} ${text}`.slice(-1000);
      else this.checkTruth(text);
      this.recent = [...this.recent, { role, text }].slice(-RECENT_MAX * 2);
      writeFileSync(path.join(this.dir, "recent.json"), JSON.stringify(this.recent));
      return this.send({ type: "transcript", role, text });
    }
    if (method === "thread/realtime/transcript/delta" && p.delta) return this.send({ type: "delta", role: p.role === "assistant" ? "assistant" : "user", text: String(p.delta) });
    if (method === "thread/realtime/error") return this.send({ type: "error", message: String(p.message ?? "Live voice error").slice(0, 300) });
    if (method === "thread/realtime/closed") { this.send({ type: "closed", reason: p.reason ?? null }); return this.end("closed"); }
    if (method === "turn/started") return this.send({ type: "working", on: true });
    if (method === "turn/completed") return this.send({ type: "working", on: false });
    if (method === "item/started" && p.item?.type === "commandExecution") return this.send({ type: "step", text: String(p.item.command ?? "").replace(/^\/bin\/zsh -lc /, "").slice(0, 200) });
    if (method === "item/completed" && p.item?.type === "agentMessage" && p.item.text?.trim()) {
      const final = /^\s*\[COMPLETE\]/.test(p.item.text) || p.item.phase === "final_answer";
      if (final) this.truth = { text: stripTag(p.item.text), at: Date.now() };
      return this.send({ type: "result", final, text: stripTag(p.item.text).slice(0, 8000) });
    }
  }

  /** The voice said something specific the result doesn't support: correct it out loud, and show it. */
  private checkTruth(spoken: string) {
    const t = this.truth;
    if (!t || Date.now() - t.at > 25_000 || !this.threadId) return;
    const bad = unsupportedClaims(spoken, `${t.text} ${this.heard}`);
    if (!bad.length) return;
    this.truth = undefined; // one correction per result
    this.send({ type: "correction", said: spoken, result: t.text });
    void this.peer?.request("thread/realtime/appendSpeech", { threadId: this.threadId, text: `Correction: I misspoke. The actual result is: ${t.text}` }).catch(() => undefined);
  }

  /** Ask the person in the notch (Allow/Deny or a spoken yes/no); no answer in 60 s is a no. */
  private askUser(kind: "command" | "files" | "action", text: string, why = ""): Promise<boolean> {
    const id = Math.random().toString(36).slice(2, 10);
    return new Promise<boolean>((resolve) => {
      this.approvals.set(id, resolve);
      this.send({ type: "approval", id, kind, text: text.slice(0, 400), why: why.slice(0, 200) });
      setTimeout(() => { if (this.approvals.delete(id)) resolve(false); }, 60_000).unref();
    });
  }

  /**
   * Codex asks before it escalates: protected folders are a no, everything else is your call. ShuaCrew's own
   * spark_do needs no second ask: Spark's executor confirms deletes in the notch itself.
   */
  private async asked(method: string, p: Json): Promise<Json> {
    if (process.env.SHUACREW_LIVE_DEBUG) appendFileSync(path.join(this.dir, "debug.log"), `${new Date().toISOString()} ASK ${method} ${JSON.stringify(p).slice(0, 600)}\n`);
    if (method === "mcpServer/elicitation/request") {
      if (p.serverName === TOOL_SERVER) return { action: "accept", content: {} };
      const ok = await this.askUser("action", String(p.message ?? `${p.serverName} wants to do something`), `${p.serverName} connector`);
      return { action: ok ? "accept" : "decline", ...(ok ? { content: {} } : {}) };
    }
    const command = method === "item/commandExecution/requestApproval" ? String(p.command ?? (Array.isArray(p.parsedCmd) ? p.parsedCmd.join(" ") : "")) : "";
    const files = method === "item/fileChange/requestApproval" ? JSON.stringify(p).slice(0, 2000) : "";
    if (!command && !files) return { decision: "decline" };
    if (touchesProtected(command || files, this.options.protectedPaths())) return { decision: "decline" };
    const allow = await this.askUser(command ? "command" : "files", (command || "Change files").replace(/^\/bin\/zsh -lc /, ""), String(p.reason ?? ""));
    return { decision: allow ? "accept" : "decline" };
  }

  end(reason: string) {
    if (this.ended) return;
    this.ended = true;
    for (const resolve of this.approvals.values()) resolve(false);
    for (const resolve of this.relays.values()) resolve("The call ended before it finished.");
    this.relays.clear();
    this.approvals.clear();
    if (this.threadId) void this.peer?.request("thread/realtime/stop", { threadId: this.threadId }).catch(() => undefined);
    const child = this.child;
    setTimeout(() => child?.kill("SIGTERM"), 800).unref();
    try { this.socket.close(); } catch { /* already closed */ }
    void reason;
  }
}

function readJson<T>(file: string, fallback: T): T {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as T : fallback; } catch { return fallback; }
}
