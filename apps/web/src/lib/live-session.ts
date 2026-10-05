import { useSyncExternalStore } from "react";
import { LiveCall, type LiveEvent, type LiveState } from "./live-voice";
import { yesOrNo } from "./handsfree";
import { copyForPaste, pasteTarget } from "./paste-hint";
import { describeAction, doVocabulary, parseActions } from "./buddy";
import { perform, sparkHooks } from "../screens/spark/actions";
import { liveDownUntil } from "./live-down";
import { LiveTaskQueue, type LiveTaskExecutor, type LiveTaskRequest, type LiveTaskResult } from "./live-task";

/**
 * Live, in the notch: one shared call that the island and the card both show. Spark's own mic, fn push-to-talk and
 * the wake word stand aside while a call is on (Buddy reads `live.active`).
 */
type Line = { role: "user" | "assistant"; text: string; final: boolean };
/** The call as it happened, in order: what you said, what Shua said, each step it took, and each result. */
type Item = ({ kind: "line" } & Line) | { kind: "step"; text: string } | { kind: "result"; text: string; corrected?: string };
export type LiveView = {
  mode?: "hold" | "talk" | "silent"; capturing?: boolean; muted?: boolean;
  spokenText?: string;
  active: boolean; state: LiveState | "off"; detail?: string; feed: Item[]; usage?: number; callId?: string; tasks?: number; startedAt?: number; workStartedAt?: number;
  approval?: { id: string; kind: "command" | "files" | "action"; text: string; why?: string }; mic: number; voice: number;
};
const OFF: LiveView = { active: false, state: "off", feed: [], mic: 0, voice: 0 };
function retainFeed(feed: Item[]): Item[] {
  return feed.filter((item, index) => item.kind !== "step" || feed.length - index <= 14);
}
const push = (item: Item) => emit({ feed: retainFeed([...view.feed, item]) });
let view: LiveView = OFF, call: LiveCall | null = null;
let pendingTexts: string[] = [];
let pendingNarration: string | null = null;
let pendingStart: {mode: "hold" | "talk" | "silent"} | null = null;
const subs = new Set<() => void>();
const emit = (next: Partial<LiveView>) => { view = { ...view, ...next }; subs.forEach((f) => f()); if (isLiveOwner()) native()?.postMessage({ type: "liveSnapshot", revision: ++revision, snapshot: { ...view, state: view.state === "ready" ? "listening" : view.state } }); };
export const useLive = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => view);
export const liveActive = () => view.active;
export const getLiveSnapshot = () => view;
let levels = { mic: 0, voice: 0 }, lastLevelPublish = 0;
export const getLiveLevels = () => levels;
const levelSubscribers = new Set<() => void>();
export const useLiveLevels = () => useSyncExternalStore(listener => { levelSubscribers.add(listener); return () => { levelSubscribers.delete(listener); }; }, () => levels);
const updateLevels = (mic: number, voice: number) => { levels = { mic, voice }; levelSubscribers.forEach(listener => listener()); };
let revision = 0, queue: LiveTaskQueue | null = null;
let executor: LiveTaskExecutor | null = null;
export function registerExecutor(next: LiveTaskExecutor) { executor = next; return () => { if (executor === next) { executor = null; endLive(); } }; }
export const isLiveOwner = () => !native() || location.pathname === "/buddy";
const forward = (action: string, text?: string) => { native()?.postMessage({ type: "liveCommand", commandId: crypto.randomUUID(), action, text }); };
export function queueLiveText(text: string) {
  if (!text.trim() || text.length > 4000) return false;
  if (!isLiveOwner()) { forward("text", text); return true; }
  if (!call) startLive("silent");
  if (view.state === "connecting") {
    if (pendingTexts.length >= 4) return false;
    pendingTexts.push(text); return true;
  }
  return sendLiveText(text);
}
/** Speak already-grounded image analysis without another task or microphone capture. */
export function narrateLiveResult(text: string): boolean {
  text = text.trim().slice(0, 4000);
  if (!text) return false;
  if (!isLiveOwner()) { forward("narrate", text); return true; }
  if (!call) startLive("silent");
  if (view.state === "connecting") { pendingNarration = text; return true; }
  if (!call) return false;
  push({kind:"result",text}); call.recordResult(text); announce(text, call);
  return true;
}
export function sendLiveText(text: string) {
  if (!view.active || view.state === "connecting" || !text.trim()) return false;
  if (!isLiveOwner()) { forward("text", text); return true; }
  const current = call, tasks = queue;
  if (!current || !tasks || !executor) return false;
  touch(); push({ kind: "line", role: "user", text, final: true }); current.recordText(text);
  void tasks.run(crypto.randomUUID(), text, runSparkTask).then(result => {
    if (call !== current) return;
    push({ kind: "result", text: result.summary }); current.recordResult(result.summary);
    if (result.status !== "cancelled") announce(result.summary.slice(0, 300), current);
  });
  return true;
}
let announcementTimer: ReturnType<typeof setTimeout> | undefined, lastMicActivity = 0;
function announce(text: string, current: LiveCall) {
  clearTimeout(announcementTimer);
  const speak = () => {
    if (call !== current) return;
    if (Date.now() - lastMicActivity < 900 || view.state === "speaking" || view.approval) { announcementTimer = setTimeout(speak, 150); return; }
    announcementTimer = undefined; current.speak(text);
  };
  speak();
}
export function stopLiveWork() { if (!isLiveOwner()) { forward("cancel"); return; } queue?.cancelAll(); denyLocal(); }
export function stopLiveSpeech() {
  pendingNarration = null;
  if (!isLiveOwner()) { forward("cancel", "voice"); return; }
  clearTimeout(announcementTimer); announcementTimer = undefined;
  call?.stopSpeaking();
}
let fnDown = false, fnAccepted = false, fnGeneration = 0;
export function liveFn(signal: "down" | "hold" | "release" | "cancel" | "tap") {
  if (!isLiveOwner()) return;
  if (view.mode === "talk" && view.active) { fnDown = false; fnAccepted = false; fnGeneration++; return; }
  if (signal === "down") { fnDown = true; return; }
  if (signal === "hold") {
    if (!fnDown || fnAccepted) return;
    fnAccepted = true;
    const generation = ++fnGeneration;
    const begin = () => {
      if (!fnDown || !fnAccepted || generation !== fnGeneration || view.mode === "talk" && view.active) return;
      if (!call) startLive("hold"); else call.press();
      call?.acceptHold();
    };
    if (liveUsable()) begin();
    else void checkLiveReady().then(ok => {
      if (!fnDown || generation !== fnGeneration) return;
      if (ok) begin();
      else emit({ ...OFF, mode: "silent", capturing: false, active: false, state: "error", detail: limitDetail(), feed: view.feed });
    });
    return;
  }
  const accepted = fnAccepted;
  fnDown = false; fnAccepted = false; fnGeneration++;
  if (accepted) call?.release(signal !== "release");
}

/**
 * Live is the notch's voice, so it has to know when not to be: a call that failed to connect keeps voice on classic
 * for a while (instead of failing every fn press), and so does a nearly used-up Codex plan.
 */
const DOWN_KEY = "shuacrew.live.down", USAGE_KEY = "shuacrew.live.usage";
const USAGE_LIMIT = 97;
const stored = (key: string) => { try { return Number(localStorage.getItem(key) ?? 0) || 0; } catch { return 0; } };
const store = (key: string, value: number) => { try { localStorage.setItem(key, String(value)); } catch { /* private mode */ } };
export const liveUsable = () => Date.now() >= stored(DOWN_KEY) && (Date.now() - stored(`${USAGE_KEY}.at`) >= 300_000 || stored(USAGE_KEY) < USAGE_LIMIT);

/** Asks Codex (via the gateway, ~0.6 s, cached 30 s) whether it can take a call, and keeps the down marker in step. */
let readyCheck: Promise<boolean> | undefined;
export function checkLiveReady(): Promise<boolean> {
  readyCheck ??= fetch("/api/live/ready").then(r => r.json() as Promise<{ usable?: boolean; resetsAt?: number }>).then(r => {
    if (r.usable === false) store(DOWN_KEY, r.resetsAt && r.resetsAt > Date.now() ? r.resetsAt : liveDownUntil(undefined));
    else { store(DOWN_KEY, 0); store(USAGE_KEY, 0); }
    return r.usable !== false;
  }).catch(() => liveUsable()).finally(() => { readyCheck = undefined; });
  return readyCheck;
}
/** While Live is down, look again on launch, on focus and every 2 minutes: it comes back the moment Codex does. */
export function watchLiveReady() {
  const look = () => { if (!liveUsable()) void checkLiveReady(); };
  look();
  const timer = setInterval(look, 120_000);
  window.addEventListener("focus", look);
  return () => { clearInterval(timer); window.removeEventListener("focus", look); };
}
const limitDetail = () => `Codex voice is at its usage limit until ${new Date(stored(DOWN_KEY)).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`;

/** A call nobody is using ends by itself: 45 s with nothing said, done or waiting on you. fn or "Hey Spark" rejoins. */
const QUIET_MS = 45_000;
let lastActivity = 0, quietTimer: ReturnType<typeof setInterval> | undefined;
const touch = () => { lastActivity = Date.now(); };
function watchQuiet(on: boolean) {
  clearInterval(quietTimer); quietTimer = undefined;
  if (!on) return;
  touch();
  quietTimer = setInterval(() => {
    if ((view.state === "listening" || view.state === "ready") && !view.capturing && !view.approval && !queue?.size && Date.now() - lastActivity >= QUIET_MS) endLive();
  }, 5_000);
}

export const LIVE_VOICES = ["cove", "juniper", "maple", "spruce", "ember", "vale", "breeze", "arbor", "sol"];
const VOICE_KEY = "shuacrew.live.voice";
export const liveVoice = () => { try { const value = localStorage.getItem(VOICE_KEY); return value && LIVE_VOICES.includes(value) ? value : "cove"; } catch { return "cove"; } };
export const setLiveVoice = (v: string) => { if (!LIVE_VOICES.includes(v)) return; try { localStorage.setItem(VOICE_KEY, v); } catch { /* private mode */ } };

function onEvent(e: LiveEvent) {
  if (e.type === "capture") return emit({ capturing: e.on, mode: e.mode });
  if (e.type === "muted") return emit({ muted: e.on, spokenText: "" });
  if (e.type === "playback") return emit({ spokenText: e.text });
  if (e.type === "levels") {
    if (e.mic > 0.06) lastMicActivity = Date.now();
    if (e.voice > 0.02 || e.mic > 0.06) touch();
    if (Date.now() - lastLevelPublish >= 100 && (Math.abs(e.mic - levels.mic) > 0.0005 || Math.abs(e.voice - levels.voice) > 0.0005)) {
      lastLevelPublish = Date.now(); updateLevels(e.mic, e.voice); native()?.postMessage({ type: "liveLevels", callId: view.callId, ...levels });
    }
    return;
  }
  touch();
  if (e.type === "state") {
    if (e.state === "ended" || e.state === "error") {
      if (e.state === "error") store(DOWN_KEY, liveDownUntil(e.detail));
      updateLevels(0, 0);
      clearTimeout(announcementTimer); announcementTimer = undefined;
      pendingNarration = null;
      const unsent = pendingTexts.splice(0).map(text => ({ kind: "line" as const, role: "user" as const, text, final: true }));
      call = null; queue?.end(); queue = null; denyLocal(); watchQuiet(false); emit({ ...OFF, mode: "silent", capturing: false, muted: false, callId: undefined, tasks: 0, state: e.state, detail: unsent.length ? `${e.detail ?? "Call ended."} Pending messages were not sent.` : e.detail, feed: [...view.feed, ...unsent] }); window.dispatchEvent(new CustomEvent("shuacrew:livecall", { detail: { on: false } })); return;
    }
    if (e.state === "listening") store(DOWN_KEY, 0); // it connected: Live is fine again
    if (e.state === "listening" || e.state === "ready") {
      const current = call, waiting = pendingTexts.splice(0), narration = pendingNarration;
      pendingNarration = null;
      queueMicrotask(() => { if (call !== current) return; for (const text of waiting) sendLiveText(text); if (narration) narrateLiveResult(narration); });
    }
    return emit({ state: e.state, workStartedAt: e.state === "working" && view.state !== "working" ? Date.now() : view.workStartedAt });
  }
  if (e.type === "caption") {
    // One growing line per speaker turn: a partial updates the open line in place, a final closes it.
    const feed = [...view.feed];
    const open = feed.findLastIndex((it) => it.kind === "line" && it.role === e.role && !it.final);
    if (open >= 0) feed[open] = { kind: "line", role: e.role, text: e.text, final: e.final };
    else feed.push({ kind: "line", role: e.role, text: e.text, final: e.final });
    // "Yes" / "no" to a pending approval, said out loud.
    if (e.final && e.role === "user" && view.approval) { const said = yesOrNo(e.text); if (said !== null) answer(said); }
    return emit({ feed: retainFeed(feed) });
  }
  if (e.type === "step") return push({ kind: "step", text: e.text });
  if (e.type === "result") {
    if (!e.final) return;
    const paste = pasteTarget(e.text); if (paste) copyForPaste(paste, native() ? (m) => native()!.postMessage(m) : undefined);
    return push({ kind: "result", text: e.text });
  }
  if (e.type === "usage" && Number.isFinite(e.percent)) { store(USAGE_KEY, e.percent); store(`${USAGE_KEY}.at`, Date.now()); return emit({ usage: e.percent }); }
  if (e.type === "correction") {
    // The truth guard caught the voice saying something the result doesn't support: mark the result it misstated.
    const feed = [...view.feed], at = feed.findLastIndex((it) => it.kind === "result");
    if (at >= 0) feed[at] = { kind: "result", text: e.result, corrected: e.said }; else feed.push({ kind: "result", text: e.result, corrected: e.said });
    return emit({ feed });
  }
  if (e.type === "approval") return emit({ approval: { id: e.id, kind: e.kind, text: e.text, why: e.why } });
  if (e.type === "cancel") { queue?.cancelTask(e.id); denyLocal(); }
  if (e.type === "do" || e.type === "task") {
    const current = call, tasks = queue;
    if (!current || !tasks) return;
    void tasks.run(e.id, e.type === "task" ? e.request : "Mac action", request => e.type === "task" ? runSparkTask(request) : runSparkActions(e.actions, request)).then(result => {
      if (call === current) current.done(e.id, JSON.stringify(result));
    });
  }
}

/** A question only this page can answer (a delete Spark's hands want to make): same card, same "yes"/"no", asked aloud. */
const local = new Map<string, (allow: boolean) => void>();
const denyLocal = () => { for (const resolve of local.values()) resolve(false); local.clear(); };
const askHere = (text: string) => new Promise<boolean>((resolve) => {
  if (!call) { resolve(false); return; }
  const id = `local:${Math.random().toString(36).slice(2, 8)}`;
  const finish = (allow: boolean) => { clearTimeout(timer); local.delete(id); if (view.approval?.id === id) emit({ approval: undefined }); resolve(allow); };
  const timer = setTimeout(() => finish(false), 60_000);
  local.set(id, finish);
  emit({ approval: { id, kind: "action", text, why: "Shua wants to do this on your Mac" } });
  call?.speak(`Quick check before I go ahead: ${text.replace(/[.?!\s]+$/, "")}? Just say yes or no.`);
});

/**
 * The hands asked for Spark's native actions: run them exactly as Spark would (its executor, its checks, deletes
 * confirmed here), and hand back what happened plus anything read (calendar, mail, files).
 */
async function runSparkActions(raw: unknown[], request: LiveTaskRequest): Promise<LiveTaskResult> {
  const actions = parseActions("```do " + JSON.stringify(raw) + "```").filter((a) => a.type !== "run");
  if (!actions.length) return { status: "failed", summary: "Nothing ran: no valid actions. Use the exact shapes from the list.", outcomes: [] };
  const outcomes: LiveTaskResult["outcomes"] = [];
  const results: string[] = [], outputs: string[] = [];
  const saved = { ...sparkHooks };
  request.signal.addEventListener("abort", denyLocal, { once: true });
  sparkHooks.onMacOutput = (what, out) => outputs.push(`${what}:\n${out}`);
  sparkHooks.onMailOutput = (what, out) => outputs.push(`${what}:\n${out}`);
  sparkHooks.confirmDelete = (what) => askHere(what);
  try {
    for (const a of actions) {
      if (request.signal.aborted) break;
      push({ kind: "step", text: describeAction(a) });
      const r = await perform(a, { active: () => !request.signal.aborted, requestId: `${request.callId}:${request.taskId}:${outcomes.length}` });
      outcomes.push({ description: describeAction(a), ok: r.ok, message: r.message });
      results.push(`${describeAction(a)}: ${r.ok ? "done" : "failed"} — ${r.message}`);
    }
  } finally { request.signal.removeEventListener("abort", denyLocal); Object.assign(sparkHooks, saved); }
  return { status: request.signal.aborted ? "cancelled" : outcomes.every(outcome => outcome.ok) ? "completed" : "failed", summary: [...results, ...outputs].join("\n\n").slice(0, 12_000) || "Stopped before any action completed.", outcomes };
}
/**
 * The screen half of a call: Buddy (the Spark on this page) registers how to run one request as a full Spark turn —
 * it looks, points, draws, clicks and guides exactly as when you ask it yourself — and resolves with what it said.
 */
async function runSparkTask(request: LiveTaskRequest): Promise<LiveTaskResult> {
  if (!executor) return { status: "unavailable", summary: "The notch executor is unavailable. No screen action ran.", outcomes: [] };
  push({ kind: "step", text: request.text.slice(0, 80) });
  const saved = { ...sparkHooks };
  request.signal.addEventListener("abort", denyLocal, { once: true });
  // Spark's own yes-or-no questions come through the call, out loud.
  sparkHooks.confirmDelete = (what) => askHere(what);
  sparkHooks.confirmRun = (command) => askHere(`Run ${command.slice(0, 80)}`);
  try { return await executor(request); }
  catch (e) { return { status: "failed", summary: `Couldn't do that: ${(e as Error).message}`, outcomes: [] }; }
  finally { request.signal.removeEventListener("abort", denyLocal); Object.assign(sparkHooks, saved); }
}
const native = () => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: { postMessage(m: unknown): void } } } }).webkit?.messageHandlers?.shuacrew;

export function startLive(mode: "hold" | "talk" | "silent" = "talk") {
  if (!isLiveOwner()) { forward("start", mode); return; }
  if (call) { if (mode === "talk" && view.mode !== "talk") { emit({ mode }); call.talk(); } return; }
  if (pendingStart) { if (mode === "talk") { pendingStart.mode = mode; emit({mode}); } return; }
  // Down lately: ask Codex first (cached, well under a second) instead of a call that fails 2 s later.
  if (!liveUsable()) {
    const request = pendingStart = {mode};
    emit({active:true, state:"connecting", mode, capturing:false, muted:false, detail:undefined});
    void checkLiveReady().then(ok => {
      if (pendingStart !== request || call) return;
      pendingStart = null;
      if (ok) startLive(request.mode);
      else { pendingNarration = null; pendingTexts = []; emit({ ...OFF, mode: "silent", capturing: false, muted: false, callId: undefined, tasks: 0, active: false, state: "error", detail: limitDetail(), feed: view.feed }); }
    });
    return;
  }
  const callId = crypto.randomUUID();
  native()?.postMessage({ type: "livePrepare" });
  emit({ ...OFF, mode, capturing: false, muted: false, detail: undefined, approval: undefined, workStartedAt: undefined, callId, tasks: 0, startedAt: Date.now(), active: true, state: "connecting" });
  window.dispatchEvent(new CustomEvent("shuacrew:livecall", { detail: { on: true } }));
  const current = new LiveCall({ mode, voice: liveVoice(), onEvent: event => { if (call === current) onEvent(event); }, vocab: doVocabulary() });
  call = current;
  queue = new LiveTaskQueue(callId, () => { const tasks = queue?.size ?? 0; emit({ tasks, workStartedAt: tasks && !view.tasks ? Date.now() : view.workStartedAt }); });
  watchQuiet(true);
  void call.start();
}
export function endLive() {
  if (!isLiveOwner()) { forward("end"); return; }
  const waiting = !!pendingStart;
  pendingStart = null; pendingNarration = null;
  if (call) call.end();
  else if (waiting) { pendingTexts = []; emit({...OFF, state:"ended", mode:"silent", capturing:false, feed:view.feed}); }
}
export function announceLiveCommand(text: string): boolean {
  if (!isLiveOwner() || !call || !view.active || view.approval || Date.now() - lastMicActivity < 900) return false;
  return call.announce(text);
}
export function answer(allow: boolean) {
  if (!isLiveOwner()) { forward(allow ? "approve" : "deny", view.approval?.id); return; }
  const a = view.approval; if (!a) return;
  const mine = local.get(a.id);
  if (mine) { local.delete(a.id); mine(allow); } else call?.approve(a.id, allow);
  emit({ approval: undefined });
}

export function connectLiveBridge() {
  if (!native()) return () => {};
  let receivedRevision = -1;
  const commands = new Set<string>();
  const onCommand = (event: Event) => {
    if (!isLiveOwner()) return;
    const detail = (event as CustomEvent).detail;
    if (!detail || typeof detail.commandId !== "string" || commands.has(detail.commandId)) return;
    commands.add(detail.commandId); if (commands.size > 100) commands.delete(commands.values().next().value!);
    if (detail.action === "start") startLive(detail.text === "hold" || detail.text === "silent" ? detail.text : "talk");
    else if (detail.action === "end") endLive();
    else if (detail.action === "cancel") { if (detail.text === "voice") stopLiveSpeech(); else stopLiveWork(); }
    else if (detail.action === "narrate" && typeof detail.text === "string") narrateLiveResult(detail.text);
    else if (detail.action === "text" && typeof detail.text === "string") { if (!queueLiveText(detail.text)) emit({ detail: "The call is not ready for text yet." }); }
    else if ((detail.action === "approve" || detail.action === "deny") && detail.text === view.approval?.id) answer(detail.action === "approve");
  };
  const onSnapshot = (event: Event) => {
    if (isLiveOwner()) return;
    const detail = (event as CustomEvent).detail;
    if (!detail || !Number.isSafeInteger(detail.revision) || detail.revision <= receivedRevision) return;
    const next = detail.snapshot;
    if (!next || typeof next.active !== "boolean" || !Array.isArray(next.feed) || !["off", "connecting", "listening", "speaking", "working", "ended", "error"].includes(next.state)) return;
    receivedRevision = detail.revision;
    const wasActive = view.active;
    emit({ ...next, state: next.state === "listening" && next.capturing === false ? "ready" : next.state });
    if (wasActive !== view.active) window.dispatchEvent(new CustomEvent("shuacrew:livecall", { detail: { on: view.active } }));
  };
  const request = () => { if (isLiveOwner()) emit({}); };
  const onLevels = (event: Event) => { const detail = (event as CustomEvent).detail; if (!isLiveOwner() && view.active && detail?.callId === view.callId && Number.isFinite(detail.mic) && Number.isFinite(detail.voice)) updateLevels(detail.mic, detail.voice); };
  window.addEventListener("shuacrew:liveCommand", onCommand);
  window.addEventListener("shuacrew:liveSnapshot", onSnapshot);
  window.addEventListener("shuacrew:liveSnapshotRequest", request);
  window.addEventListener("shuacrew:liveLevels", onLevels);
  native()?.postMessage({ type: "liveSubscribe" });
  if (isLiveOwner()) emit({});
  return () => {
    window.removeEventListener("shuacrew:liveCommand", onCommand);
    window.removeEventListener("shuacrew:liveSnapshot", onSnapshot);
    window.removeEventListener("shuacrew:liveSnapshotRequest", request);
    window.removeEventListener("shuacrew:liveLevels", onLevels);
    if (isLiveOwner()) endLive();
  };
}
