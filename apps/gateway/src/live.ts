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
import { agentEnv, decide, defaultContext, defaultRules, normalise } from "@shuacrew/core";
import { RpcPeer, findBinary } from "@shuacrew/runtimes";
import { assistantMustAsk } from "./assistant-policy.js";
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
    "- Screen access can change during a call. For every screen question, including 'can you see my screen?', delegate a fresh check. Never infer that the eye is off, request a permission change, or reuse an earlier permission failure without a current backend result.",
    "- Never say something is done or found before the backend says so. While it works, say at most a few words about what you're doing (\"Checking your calendar.\"), then wait quietly.",
    "- When the result arrives, say it in one or two natural sentences. If it failed or found nothing, say that plainly.",
    "Delegate every action, lookup, or question about their Mac, files, apps, schedule, messages, or anything current on the internet; pass their own words. Answer directly only for small talk and general knowledge you are sure of. Corrections and additions to running work: delegate them too, they steer it.",
    "For questions about ShuaCrew, its Learning courses, current lesson, Visual workspace, or crew activity, delegate a fresh app-context check. Never infer an empty workspace from an earlier turn.",
    "For architecture, system design, diagrams, visual teaching, and follow-ups about an active lesson, always delegate even when you know the subject. Ask the backend to use spark_screen so the existing teaching engine can build the actual notch visual. Do not substitute a spoken essay or promise a diagram before it exists.",
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
    "Research (news, prices, releases, docs, how-tos, comparisons — anything current or not on this Mac): use your web_search tool, live, never curl or memory. Search once or twice with sharp queries, then [COMPLETE] with the answer in one or two spoken sentences naming the source (\"per the Node.js blog\"), and the links after the first sentence so they're shown. Say plainly when sources disagree or nothing solid turned up.",
    "Your working directory is a private scratch folder, not theirs: \"my folder\" or \"this folder\" means the frontmost Finder window (osascript -e 'tell application \"Finder\" to get POSIX path of (target of front window as alias)'), and their files live under their home folder (find them with mdfind).",
    "For screen interaction (look, point, draw, click, type, scroll, guide) or teaching with an architecture diagram, call spark_screen with the user's own words. Its result determines availability: never claim screen access or a completed action before the tool confirms it. Respect screen-off, denied, failed, cancelled and unavailable results; do not bypass them with shell or other tools. Describe only the reported outcomes, and distinguish a dispatched overlay from independently verified placement.",
    "For ShuaCrew app questions, learning courses, selected lesson, visual workspace or navigation, call spark_screen with the request even when no screenshot is needed. It supplies fresh structured app data and can navigate via native app actions. Never substitute an old conversation summary for this check.",
    "Websites: open them directly with spark_do [{\"type\":\"open_url\",\"url\":\"https://…\",\"app\":\"Google Chrome\"}] (app only when they name a browser) — one step, no screen. Apps: spark_do [{\"type\":\"open_app\",\"name\":\"…\"}]. Use spark_screen only for what is inside an app or page: reading it, clicking, typing, scrolling.",
    "A cancelled result ends that task: do not continue, retry, or perform its remaining actions. Wait for a fresh user request. For architecture teaching, use spark_screen even with screen access off: a text-only lesson does not need a screenshot.",
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
  const compactSource = src.replace(/[^a-z0-9]/g, "");
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
    return !src.includes(lc) && !compactSource.includes(lc.replace(/[^a-z0-9]/g, ""));
  });
}

/**
 * Is this mismatch worth interrupting the call with "Correction: …"? A false alarm costs a few awkward seconds of
 * speech; a miss lets an invented fact stand.
 */
export function worthCorrecting(bad: string[], spoken: string): boolean {
  // Any unsupported specific (a time, a name, an amount) is worth it: an invented fact costs more than a few seconds.
  void spoken;
  return bad.length > 0;
}

const stripTag = (text: string) => text.replace(/^\s*\[(STATUS|COMMENTARY|COMPLETE|ANALYSIS|FINAL)\]\s*/, "");
export const touchesProtected = (text: string, protectedPaths: string[]) => {
  const home = os.homedir(), t = text.replaceAll("~/", `${home}/`).replaceAll("$HOME/", `${home}/`);
  return protectedPaths.some((p) => { const abs = p.startsWith("~/") ? path.join(home, p.slice(2)) : p; return t.includes(abs) || t.includes(path.basename(abs)); });
};

/** The one tool Live's hands get from ShuaCrew: Spark's native Mac actions, run by the notch page. */
export const LIVE_TOOLS = [{
  name: "spark_do",
  description: "Do things on the user's Mac natively through ShuaCrew (calendar, reminders, notes, mail drafts, music, timers, volume and system controls, apps, settings pages, the user's crew, and a brief action for a live readout of everything going on in ShuaCrew — call it before answering any what's-going-on question). Pass `actions`: an array of action objects, exactly the shapes in your instructions. Returns what happened and anything it read.",
  inputSchema: { type: "object", properties: { actions: { type: "array", items: { type: "object" }, description: "Up to 5 action objects" } }, required: ["actions"], additionalProperties: false },
}, {
  name: "spark_screen",
  description: "Anything on the user's screen, done by Spark (ShuaCrew's on-screen assistant, which sees the screen and moves the pointer): look at what's on screen, point at or show where something is (\"show me the Wi-Fi icon\"), draw, circle or highlight on the screen, click, type or press keys for them, guide them step by step through an app, or teach with a diagram. Pass `request`: the user's own words. Returns what Spark saw and did.",
  inputSchema: { type: "object", properties: { request: { type: "string", description: "What the user asked, in their words" } }, required: ["request"], additionalProperties: false },
}];

export interface LiveOptions {
  /** Keeps a finished call: its transcript goes to the Library, where Spark and the crew can search it. */
  saveTranscript?: (title: string, markdown: string, summary: string) => void;
  /** ShuaCrew's MCP server for this call (the spark_do tool), in Codex's mcp_servers shape. */
  mcpFor?: (run: string) => Record<string, unknown>;
  home: string; // ~/.shuacrew
  protectedPaths: () => string[];
  binary?: string;
  /** The user's first name for the voice, if known. */
  firstName?: () => string | undefined;
}

/** One live call per socket; a new call replaces the old one. */
export function pendingLiveRelay(pending: Map<string, (text: string) => void>, id: string, send: (message: { type: string; id: string }) => void, timeout: number): Promise<string> {
  return new Promise(resolve => {
    const finish = (text: string) => { clearTimeout(timer); pending.delete(id); resolve(text); };
    const timer = setTimeout(() => { send({ type: "cancel", id }); finish("Task cancelled after timeout. Earlier actions may have taken effect; no final completion was verified."); }, timeout);
    timer.unref(); pending.set(id, finish);
  });
}

/** Where a Codex app-server's messages go; a standby's are rerouted to whichever call adopts it. */
interface CodexRoute { notified?: (method: string, params: Json) => void; asked?: (method: string, params: Json) => Promise<Json>; exited?: () => void }
/** Codex up and initialized, with a call's thread started: everything a call needs before your audio. */
interface CodexSession { child: ChildProcess; peer: RpcPeer; threadId: string; run: string; route: CodexRoute; key: string; at: number }
const newRun = () => `live:${Math.random().toString(36).slice(2, 10)}`;
const sessionKey = (vocab: string, protectedPaths: string[]) => `${protectedPaths.join("\n")}\u0000${vocab}`;

async function openCodexSession(options: LiveOptions, dir: string, vocab: string, protectedPaths: string[], route: CodexRoute = {}): Promise<CodexSession> {
  const binary = options.binary ?? findBinary("codex");
  if (!binary) throw new Error("Live needs Codex installed and signed in to ChatGPT.");
  const child = spawn(binary, ["app-server", ...permissionArgs(dir, protectedPaths)], { cwd: dir, env: agentEnv(process.env, "subscription"), stdio: ["pipe", "pipe", "pipe"] });
  if (process.env.SHUACREW_LIVE_DEBUG) child.stderr?.on("data", (d) => appendFileSync(path.join(dir, "debug.log"), `stderr ${String(d).slice(0, 800)}`)); else child.stderr?.resume();
  child.on("exit", () => route.exited?.());
  // Nothing is approved before a call adopts the session.
  const peer = new RpcPeer(child, (method, params) => route.notified?.(method, params), (method, params) => route.asked ? route.asked(method, params) : Promise.resolve({ decision: "decline" }));
  try {
    await peer.request("initialize", { clientInfo: { name: "shuacrew-live", title: "ShuaCrew Live", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    peer.notify("initialized");
    const run = newRun();
    // Sandboxed by the OS (Seatbelt): reads anywhere except protected folders, writes only in ~/.shuacrew/live.
    // Anything more (opening apps, AppleScript) is an escalation you approve in the notch.
    const mcp = vocab && options.mcpFor ? options.mcpFor(run) : undefined;
    // Low reasoning effort: a call is a conversation, and the voice is waiting on every turn. A fresh thread per call:
    // a resumed one had grown to 115k input tokens and took 28 s to answer "what's on my calendar". Continuity comes
    // from the recent lines given to the voice instead.
    const thread = { cwd: dir, approvalPolicy: "on-request", developerInstructions: liveBackendInstructions(protectedPaths, vocab), config: { model_reasoning_effort: "low", web_search: "live", ...(mcp ? { mcp_servers: mcp } : {}) } };
    const threadId = String((await peer.request("thread/start", thread)).thread?.id);
    return { child, peer, threadId, run, route, key: sessionKey(vocab, protectedPaths), at: Date.now() };
  } catch (error) { child.kill("SIGTERM"); throw error; }
}

/**
 * One Codex session kept ready for the next call, opened with the vocabulary the last call used: a press skips
 * spawning Codex and starting its thread (measured 0.4–0.5 s of every call). Replaced every 20 minutes.
 */
const STANDBY_MAX_AGE = 20 * 60_000;
export class Standby {
  private ready?: CodexSession;
  private pending?: Promise<void>;
  private vocab: string;
  private timer: ReturnType<typeof setInterval>;
  private stopped = false;
  constructor(private options: LiveOptions, private dir: string) {
    mkdirSync(dir, { recursive: true });
    try { this.vocab = readFileSync(path.join(dir, "vocab.txt"), "utf8"); } catch { this.vocab = ""; }
    this.timer = setInterval(() => { if (this.ready && Date.now() - this.ready.at > STANDBY_MAX_AGE) { this.drop(); this.fill(); } }, 60_000);
    this.timer.unref();
  }
  /** The ready session if it fits this call (same vocabulary and protected folders, still running); else none. */
  take(key: string): CodexSession | undefined {
    const s = this.ready; this.ready = undefined;
    if (!s) return undefined;
    if (s.key !== key || s.child.exitCode !== null || s.child.signalCode !== null || Date.now() - s.at > STANDBY_MAX_AGE) { s.child.kill("SIGTERM"); return undefined; }
    return s;
  }
  /** Open the next session (after a call, and once at boot). */
  fill(vocab = this.vocab) {
    if (this.stopped) return;
    if (vocab !== this.vocab) { this.vocab = vocab; try { writeFileSync(path.join(this.dir, "vocab.txt"), vocab, { mode: 0o600 }); } catch { /* next boot opens without it */ } }
    if (this.ready && this.ready.key !== sessionKey(vocab, this.options.protectedPaths())) this.drop();
    if (this.ready || this.pending) return;
    const route: CodexRoute = {};
    this.pending = openCodexSession(this.options, this.dir, vocab, this.options.protectedPaths(), route).then((session) => {
      if (this.stopped) { session.child.kill("SIGTERM"); return; }
      route.exited = () => { if (this.ready === session) this.ready = undefined; };
      this.ready = session;
    }, () => undefined).finally(() => { this.pending = undefined; });
  }
  whenReady() { return this.pending ?? Promise.resolve(); }
  private drop() { this.ready?.child.kill("SIGTERM"); this.ready = undefined; }
  stop() { this.stopped = true; clearInterval(this.timer); this.drop(); }
}

export interface LiveReadiness { usable: boolean; usedPercent?: number; resetsAt?: number }

/** Whether the ChatGPT plan can take a call right now, from Codex's `account/rateLimits/read`. Unreadable = usable. */
export function liveReadyFrom(result: Json): LiveReadiness {
  const limits = result?.rateLimits ?? {};
  const usedPercent = typeof limits.primary?.usedPercent === "number" ? limits.primary.usedPercent : undefined;
  const resets = [limits.primary?.resetsAt, limits.secondary?.resetsAt].filter((v): v is number => typeof v === "number");
  const resetsAt = resets.length ? Math.min(...resets) * (Math.min(...resets) < 1e12 ? 1000 : 1) : undefined;
  const credits = limits.credits?.hasCredits === true || limits.credits?.unlimited === true;
  const blocked = limits.spendControlReached === true || (!credits && (result?.ordinaryUsageAllowed === false || !!limits.rateLimitReachedType));
  return { usable: !blocked, ...(usedPercent !== undefined ? { usedPercent } : {}), ...(resetsAt !== undefined ? { resetsAt } : {}) };
}

export class LiveVoice {
  private current?: LiveCall;
  private ready?: { at: number; value: Promise<LiveReadiness> };
  private standby: Standby;
  constructor(private options: LiveOptions, warmAfterMs = -1) {
    this.standby = new Standby(options, path.join(options.home, "live"));
    if (warmAfterMs >= 0) setTimeout(() => this.standby.fill(), warmAfterMs).unref(); // after boot settles
  }
  /** Stops the standby Codex process (gateway shutdown, tests). */
  stop() { this.standby.stop(); }
  /** For tests: the standby is ready to be taken. */
  warmed() { return this.standby.whenReady(); }
  /** Can Live take a call? Asked of Codex (~0.6 s), remembered for 30 s so a page checking often costs nothing. */
  /**
   * Whether Codex has usage left. Reading it spawns an app-server (~1 s), and every Shua ask used to wait for that
   * whenever the last read was over 30 s old. Now a read under 10 minutes old answers at once and is refreshed behind
   * it (a reset plan is noticed within a pick or two); only a cold start waits.
   */
  readiness(): Promise<LiveReadiness> {
    const age = this.ready ? Date.now() - this.ready.at : Infinity;
    if (age < 30_000) return this.ready!.value;
    const value = this.readRateLimits().then(liveReadyFrom, () => ({ usable: true }));
    if (age < 10 * 60_000) {
      if (!this.refreshing) { this.refreshing = true; void value.finally(() => { this.ready = { at: Date.now(), value }; this.refreshing = false; }); }
      return this.ready!.value;
    }
    this.ready = { at: Date.now(), value };
    return value;
  }
  private refreshing = false;
  private async readRateLimits(): Promise<Json> {
    const binary = this.options.binary ?? findBinary("codex");
    if (!binary) throw new Error("no codex");
    const child = spawn(binary, ["app-server"], { env: agentEnv(process.env, "subscription"), stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => child.kill("SIGTERM"), 10_000);
    try {
      const peer = new RpcPeer(child, () => undefined, async () => ({}));
      await peer.request("initialize", { clientInfo: { name: "shuacrew-live-ready", version: "0.1.0" }, capabilities: { experimentalApi: true } });
      peer.notify("initialized");
      return await peer.request("account/rateLimits/read");
    } finally { clearTimeout(timer); child.kill("SIGTERM"); }
  }
  /** spark_do from the hands → the page holding the call → back. Only the current call's token reaches this. */
  async tool(run: string, name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.current || run !== this.current.run) throw new Error("No live call is running.");
    if (name === "spark_screen") return this.current.task(String(args.request ?? "").slice(0, 2000));
    if (name !== "spark_do") throw new Error(`Unknown tool ${name}.`);
    return this.current.relay(Array.isArray(args.actions) ? args.actions : []);
  }
  attach(socket: Socket) {
    this.current?.end("replaced by a new call");
    const call = new LiveCall(socket, this.options, this.standby);
    this.current = call;
    socket.on("close", () => { call.end("closed"); if (this.current === call) this.current = undefined; this.standby.fill(call.vocab); });
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
  run = newRun();
  /** The vocabulary this call started with: the next standby is opened with the same. */
  vocab = "";
  /** The last result from the hands and what the user asked: what the voice may state as fact for the next 25 s. */
  private truth?: { text: string; at: number };
  private heard = "";
  private said: Array<{ role: "user" | "assistant"; text: string; at: number }> = [];
  private results: string[] = [];
  private relays = new Map<string, (text: string) => void>();

  constructor(private socket: Socket, private options: LiveOptions, private standby?: Standby) {
    this.dir = path.join(options.home, "live");
    mkdirSync(this.dir, { recursive: true });
    this.recent = readJson(path.join(this.dir, "recent.json"), []);
    socket.on("message", (raw) => {
      let m: Json;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (m?.type === "start" && typeof m.sdp === "string") void this.start(m.sdp, m.voice, typeof m.vocab === "string" ? m.vocab.slice(0, 20_000) : "").catch((e: Error) => this.fail(e.message));
      // The page asks the voice to say something (a yes-or-no Spark needs mid-task).
      else if (m?.type === "say" && typeof m.text === "string") void this.peer?.request("thread/realtime/appendSpeech", { threadId: this.threadId, text: m.text.slice(0, 300) }).catch(() => undefined);
      else if (m?.type === "done" && typeof m.id === "string") { this.relays.get(m.id)?.(String(m.text ?? "")); this.relays.delete(m.id); }
      else if (m?.type === "approve" && typeof m.id === "string") { this.approvals.get(m.id)?.(m.allow === true); this.approvals.delete(m.id); }
      else if (m?.type === "text" && typeof m.text === "string" && this.threadId) void this.peer?.request("thread/realtime/appendText", { threadId: this.threadId, role: "user", text: m.text.slice(0, 4000) }).catch(() => undefined);
      else if (m?.type === "typed" && typeof m.text === "string") { this.heard = m.text.slice(0, 4000); this.said.push({ role: "user", text: this.heard, at: Date.now() }); }
      else if (m?.type === "typedResult" && typeof m.text === "string") { this.truth = { text: m.text.slice(0, 8000), at: Date.now() }; this.results.push(this.truth.text); }
      else if (m?.type === "stop") this.end("stopped");
    });
  }

  private send(m: Json) { if (!this.ended) { try { this.socket.send(JSON.stringify(m)); } catch { /* gone */ } } }
  private fail(message: string) { this.send({ type: "error", message }); this.end(message); }

  /** Spark's actions run in the page (its executor and checks); the result comes back as the tool's answer. */
  /** spark_screen: Spark does it on screen (silently; this voice does the talking) and says what it saw and did. */
  task(request: string): Promise<string> {
    const id = Math.random().toString(36).slice(2, 10);
    const result = pendingLiveRelay(this.relays, id, message => this.send(message), 120_000);
    this.send({ type: "task", id, request });
    return result;
  }

  relay(actions: unknown[]): Promise<string> {
    const id = Math.random().toString(36).slice(2, 10);
    const result = pendingLiveRelay(this.relays, id, message => this.send(message), 90_000);
    this.send({ type: "do", id, actions: actions.slice(0, 5) });
    return result;
  }

  private async start(sdp: string, voice?: string, vocab = "") {
    const t0 = Date.now();
    const protectedPaths = this.options.protectedPaths();
    this.vocab = vocab;
    const route: CodexRoute = { notified: (method, params) => this.notified(method, params), asked: (method, params) => this.asked(method, params), exited: () => { if (!this.ended) this.fail("The live connection closed."); } };
    // A standby already has Codex up and this call's thread started (~0.4 s); otherwise open one now.
    const warm = this.standby?.take(sessionKey(vocab, protectedPaths));
    if (warm) Object.assign(warm.route, route);
    const session = warm ?? await openCodexSession(this.options, this.dir, vocab, protectedPaths, route);
    this.child = session.child; this.peer = session.peer; this.threadId = session.threadId; this.run = session.run;
    if (this.ended) { session.child.kill("SIGTERM"); return; }
    const tReady = Date.now();
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
    const sdpAnswer = await answer, tAnswer = Date.now();
    console.log(`${new Date().toISOString()} live setup ${warm ? "warm" : "cold"} ready=${tReady - t0} answer=${tAnswer - tReady} total=${tAnswer - t0}ms`);
    this.send({ type: "answer", sdp: sdpAnswer, threadId: this.threadId, setupMs: tAnswer - t0, warm: !!warm });
  }
  private onSdp?: (sdp: string) => void;

  private notified(method: string, p: Json) {
    if (process.env.SHUACREW_LIVE_DEBUG && !method.endsWith("/delta")) appendFileSync(path.join(this.dir, "debug.log"), `${new Date().toISOString()} ${method} ${JSON.stringify(p).slice(0, 600)}\n`);
    if (method === "thread/realtime/sdp") return this.onSdp?.(p.sdp);
    if (method === "thread/realtime/transcript/done" && p.text?.trim()) {
      const role: "assistant" | "user" = p.role === "assistant" ? "assistant" : "user", text = String(p.text).trim();
      this.said.push({ role, text, at: Date.now() });
      if (role === "user") this.heard = `${this.heard} ${text}`.slice(-1000);
      else this.checkTruth(text);
      this.recent = [...this.recent, { role, text }].slice(-RECENT_MAX * 2);
      writeFileSync(path.join(this.dir, "recent.json"), JSON.stringify(this.recent));
      return this.send({ type: "transcript", role, text });
    }
    if (method === "thread/realtime/transcript/delta" && p.delta) return this.send({ type: "delta", role: p.role === "assistant" ? "assistant" : "user", text: String(p.delta) });
    // Live runs on the Codex plan: say so before it runs out, not after.
    if (method === "account/rateLimits/updated" && typeof p.rateLimits?.primary?.usedPercent === "number") return this.send({ type: "usage", percent: p.rateLimits.primary.usedPercent, resetsAt: p.rateLimits.primary.resetsAt ?? null });
    if (method === "thread/realtime/error") return this.send({ type: "error", message: String(p.message ?? "Live voice error").slice(0, 300) });
    if (method === "thread/realtime/closed") { this.send({ type: "closed", reason: p.reason ?? null }); return this.end("closed"); }
    if (method === "turn/started") return this.send({ type: "working", on: true });
    if (method === "turn/completed") return this.send({ type: "working", on: false });
    if (method === "item/started" && p.item?.type === "commandExecution") return this.send({ type: "step", text: String(p.item.command ?? "").replace(/^\/bin\/zsh -lc /, "").slice(0, 200) });
    if (method === "item/completed" && p.item?.type === "agentMessage" && p.item.text?.trim()) {
      const final = /^\s*\[COMPLETE\]/.test(p.item.text) || p.item.phase === "final_answer";
      if (final) { this.truth = { text: stripTag(p.item.text), at: Date.now() }; this.results.push(this.truth.text); }
      return this.send({ type: "result", final, text: stripTag(p.item.text).slice(0, 8000) });
    }
  }

  /** The voice said something specific the result doesn't support: correct it out loud, and show it. */
  private checkTruth(spoken: string) {
    const t = this.truth;
    if (!t || Date.now() - t.at > 25_000 || !this.threadId) return;
    const bad = unsupportedClaims(spoken, `${t.text} ${this.heard}`);
    if (!worthCorrecting(bad, spoken)) return;
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
      // Asked out loud too, so a yes or no by voice is enough (the page hears it in the captions).
      const what = kind === "command" ? `run ${text.slice(0, 80)}` : kind === "files" ? "change some files" : text.slice(0, 120);
      void this.peer?.request("thread/realtime/appendSpeech", { threadId: this.threadId, text: `Quick check before I go ahead: OK to ${what}? Just say yes or no.` }).catch(() => undefined);
      setTimeout(() => { if (this.approvals.delete(id)) resolve(false); }, 60_000).unref();
    });
  }

  /**
   * Codex asks before it escalates: protected folders are a no, denied commands are a no, and of the rest only what
   * the assistant must ask about (assistantMustAsk) waits for your yes; everything else just happens. ShuaCrew's own
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
    const shown = (command || "Change files").replace(/^\/bin\/zsh -lc /, "");
    if (command) {
      // Same rules as the rest of ShuaCrew: denied never runs, and only what the assistant must ask about waits for you.
      const verdict = decide(normalise("Bash", { command: shown }), defaultContext(this.dir), [{ name: "global", rules: defaultRules() }]);
      if (verdict.verdict === "deny") return { decision: "decline" };
      if (!assistantMustAsk(verdict)) return { decision: "accept" };
    }
    const allow = await this.askUser(command ? "command" : "files", shown, String(p.reason ?? ""));
    return { decision: allow ? "accept" : "decline" };
  }

  private keep() {
    if (!this.options.saveTranscript || this.said.filter((l) => l.role === "user").length < 1) return;
    const when = new Date(this.said[0]!.at), first = this.said.find((l) => l.role === "user")!.text;
    const title = `Live call · ${when.toLocaleDateString([], { month: "short", day: "numeric" })} ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${first.slice(0, 48)}`;
    try { this.options.saveTranscript(title, transcriptMarkdown(this.said, this.results), `A live voice call: ${first.slice(0, 120)}`); } catch { /* the call still ends cleanly */ }
  }

  end(reason: string) {
    if (this.ended) return;
    this.ended = true;
    for (const resolve of this.approvals.values()) resolve(false);
    for (const resolve of this.relays.values()) resolve("The call ended before it finished.");
    this.relays.clear();
    this.approvals.clear();
    if (this.threadId) void this.peer?.request("thread/realtime/stop", { threadId: this.threadId }).catch(() => undefined);
    this.keep();
    const child = this.child;
    setTimeout(() => child?.kill("SIGTERM"), 800).unref();
    try { this.socket.close(); } catch { /* already closed */ }
    void reason;
  }
}

/** The call as a readable note: who said what, and the results the hands brought back. */
export function transcriptMarkdown(said: Array<{ role: "user" | "assistant"; text: string; at: number }>, results: string[]): string {
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return [
    ...said.map((l) => `**${l.role === "user" ? "You" : "Shua"}** (${time(l.at)}): ${l.text}`),
    ...(results.length ? ["", "## Results", ...results.map((r) => `- ${r}`)] : []),
  ].join("\n\n");
}

function readJson<T>(file: string, fallback: T): T {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as T : fallback; } catch { return fallback; }
}

/** Calls stay out of Library unless the user explicitly enables archiving. */
export const shouldArchiveLiveCall = (flags: Record<string, boolean>) => flags["save-live-transcripts"] === true;
