import { logSense } from "../lib/spark-log";
import { asksAboutEarlier, recall } from "../lib/screen-memory";
import { logAction } from "../lib/spark-log";
import { eveningRecap, localDay, morningBrief, shouldBrief, shouldRecap } from "../lib/morning";
import { accentOf, sparkVars } from "../lib/spark-color";
import { getRadio, loadRadio, radioCommand } from "../lib/radio";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, AudioLines, StickyNote, Check, ChevronRight, Compass, Eye, EyeOff, Hand, LayoutGrid, Maximize2, MessageCircle, MousePointer2, RotateCcw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { api, followUp, launchRun } from "../lib/api";
import { useLive } from "../lib/live";
import { isTopLevelWork } from "../lib/crew";
import { upload, withAttachments } from "../lib/attachments";
import { actFollowUp, buddyPrompt, shuacrewNow, completedBlocks, elementsText, describeAct, describeAction, guideFollowUp, parseAct, type Act, type ScreenContext, type SparkChanges, isDesign, nextSentences, parseActions, parseDraw, parseGuide, parsePoint, screenText, speakable, splitDiagrams, type Action, type GuideStep, type ScreenLine } from "../lib/buddy";
import { Diagram } from "../components/Diagram";
import { saveBuddyVoice, SpeechQueue, useBuddyVoice } from "../lib/buddy-voice";
import { remainingFocusMs, setFocus, startFocus, useFocusTimer } from "../lib/focus-timer";
import { saveNote, useNote } from "../lib/widgets";
import { parseCompanion, saveCompanion, useCompanion } from "../lib/companion";
import { HandsFree, type Phase } from "../lib/handsfree";
import { SparkCharacter } from "../components/SparkCharacter";
import { Markdown } from "../components/Markdown";
import { SparkWidgets, type WidgetCtx } from "../components/TopBarWidgets";
import { useNowPlaying } from "../components/NowPlaying";
import { crewNowBlock, producerMove, studioAnswer, todaysSet } from "../lib/studio";
import { playScape, stopScape } from "../lib/soundscape";
import { useLook } from "../lib/look";
import "../components/companion.css";
import "./buddy.css";

type Native = { postMessage(m: unknown): void };
const native = (): Native | undefined => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
const post = (m: Record<string, unknown>) => native()?.postMessage(m);
const KEY = "shuacrew.buddy";
const SEE = "shuacrew.buddy.see";
const readSee = () => { try { return localStorage.getItem(SEE) !== "0"; } catch { return true; } };
/** Which Spark surface (desktop panel or app side panel) asked last: only it speaks, points and acts on the answer. */
const OWNER = "shuacrew.buddy.owner";
const ME = Math.random().toString(36).slice(2);
const claim = () => { try { localStorage.setItem(OWNER, ME); } catch { /* ignore */ } };
const mine = () => { try { const o = localStorage.getItem(OWNER); return !o || o === ME; } catch { return true; } };
const ctx: WidgetCtx = { go: (path) => post({ type: "buddyOpen", path }) };

/** Ask the Mac for one screenshot of the display you're on (never stored beyond this question's session). */
function capture(): Promise<{ file: File; width: number; height: number; text: ScreenLine[]; context?: ScreenContext }> {
  return new Promise((resolve, reject) => {
    if (!native()) { reject(new Error("Screen questions work in the ShuaCrew Mac app.")); return; }
    const t = setTimeout(() => { window.removeEventListener("shuacrew:capture", on as EventListener); reject(new Error("Screenshot timed out.")); }, 15_000);
    const on = (e: CustomEvent<{ data?: string; width?: number; height?: number; text?: ScreenLine[]; context?: ScreenContext; error?: string }>) => {
      clearTimeout(t); window.removeEventListener("shuacrew:capture", on as EventListener);
      const d = e.detail; if (!d.data) { reject(new Error(d.error ?? "Couldn't capture the screen.")); return; }
      logSense("saw", "Looked at your screen", d.context?.app ? `${d.context.app}${d.context.window ? ` · ${d.context.window}` : ""}` : "");
      const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
      resolve({ file: new File([bytes], "screen.jpg", { type: "image/jpeg" }), width: d.width ?? 0, height: d.height ?? 0, text: d.text ?? [], context: d.context });
    };
    window.addEventListener("shuacrew:capture", on as EventListener);
    post({ type: "buddyCapture" });
  });
}

/** "Talk faster", "be the fox", "call yourself Nova": Spark changes itself, and Settings shows it at once. */
function applyChanges(c: SparkChanges) {
  let current; try { current = parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")); } catch { current = parseCompanion(null); }
  saveCompanion({ ...current, ...(c.name ? { nickname: c.name } : {}), ...(c.character ? { character: c.character } : {}), ...(c.color ? { color: c.color } : {}), ...(c.size ? { size: c.size } : {}),
    ...(c.tone ? { tone: c.tone } : {}), ...(c.length ? { length: c.length } : {}), ...(c.control ? { control: c.control } : {}), ...(c.guide ? { guide: c.guide } : {}),
    ...(c.hotkey ? { hotkey: c.hotkey } : {}), ...(c.conversation !== undefined ? { conversation: c.conversation } : {}), ...(c.interrupt !== undefined ? { interrupt: c.interrupt } : {}) });
  if (c.talks !== undefined || c.voice || c.speed) saveBuddyVoice({ ...(c.talks !== undefined ? { on: c.talks } : {}), ...(c.voice ? { id: c.voice } : {}), ...(c.speed ? { speed: c.speed } : {}) });
  if (c.hotkey) post({ type: "buddyHotkey", combo: c.hotkey });
}

/** Asking you before a command runs: the panel installs this; without it, nothing risky runs. */
let confirmRun: ((command: string, why: string) => Promise<boolean>) | null = null;
/** A command's output, for Spark to read back to you. */
let onRanOutput: ((command: string, ok: boolean, output: string) => void) | null = null;

/** Every action, logged with whether it worked. */
function perform(a: Action | (Act & { color?: string })): Promise<{ ok: boolean; message: string; run?: string }> {
  const isAct = ["press", "click", "type", "key", "scroll", "done"].includes(a.type); // mouse & keyboard steps; everything else is an action
  return performNow(a).then((r) => { logAction({ label: isAct ? describeAct(a as Act) : describeAction(a as Action), ok: r.ok, message: r.message }); return r; });
}
/** Mac actions go to the app (which checks them again); the rest happen right here. */
function performNow(a: Action | (Act & { color?: string })): Promise<{ ok: boolean; message: string; run?: string }> {
  if (a.type === "settings") { applyChanges(a.changes); return Promise.resolve({ ok: true, message: describeAction(a) }); }
  if (a.type === "learn") return (a.drill ? api("/api/learning/drill", { body: {} }) : api("/api/learning/courses", { body: { topic: a.topic } }))
    .then(() => { post({ type: "buddyOpen", path: "/learn" }); return { ok: true, message: a.drill ? "Quiz ready in Learning" : `Course on ${a.topic} is being planned` }; }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "venture") return api<{ id: string }>("/api/ventures", { body: { name: a.name, pitch: a.pitch ?? "" } }).then(async (v) => {
    if (a.validate) await api("/api/plays", { body: { playbook: "validate-idea", inputs: { idea: a.pitch || a.name }, venture: v.id } });
    post({ type: "buddyOpen", path: `/ventures/${v.id}` });
    return { ok: true, message: a.validate ? `${a.name}: validating now` : `${a.name} created` };
  }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "playbook") return api<{ id: string }>("/api/plays", { body: { playbook: a.playbook, inputs: a.idea ? { idea: a.idea } : {}, ...(a.venture ? { venture: a.venture } : {}) } })
    .then((p) => { post({ type: "buddyOpen", path: `/plays/${p.id}` }); return { ok: true, message: `${a.playbook.replace(/-/g, " ")} started` }; }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "run") return (async () => {
    // Your ShuaCrew policy decides first: denied never runs; "ask" (or Ask-each-step mode) waits for your yes.
    const verdict = await api<{ verdict: "allow" | "deny" | "ask"; reason: string; rule: string }>("/api/policy/explain", { body: { tool: "Bash", input: { command: a.command } } }).catch(() => ({ verdict: "ask" as const, reason: "couldn't check the policy", rule: "" }));
    if (verdict.verdict === "deny") return { ok: false, message: `Blocked by your policy: ${verdict.reason}` };
    let mode = "ask"; try { mode = JSON.parse(localStorage.getItem("shuacrew.companion") ?? "{}").control ?? "ask"; } catch { /* ignore */ }
    if (verdict.verdict === "ask" || mode !== "auto") {
      const yes = confirmRun ? await confirmRun(a.command, verdict.verdict === "ask" ? verdict.reason : "") : false;
      if (!yes) return { ok: false, message: "Not run" };
    }
    const r = await new Promise<{ ok: boolean; message: string; output?: string }>((resolve) => {
      if (!native()) { resolve({ ok: false, message: "Only in the Mac app" }); return; }
      const id = crypto.randomUUID();
      const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve({ ok: false, message: "No answer from the Mac" }); }, 70_000);
      const on = (e: CustomEvent<{ id: string; ok: boolean; message: string; output?: string }>) => { if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener); resolve(e.detail); };
      window.addEventListener("shuacrew:did", on as EventListener);
      post({ type: "buddyDo", id, action: a });
    });
    onRanOutput?.(a.command, r.ok, r.output ?? "");
    return { ok: r.ok, message: r.message };
  })();
  if (a.type === "card") return api("/api/learning/cards", { body: { front: a.front, back: a.back } }).then(() => ({ ok: true, message: "Added to your Learning quiz" }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "go") { post({ type: "buddyOpen", path: a.path }); return Promise.resolve({ ok: true, message: describeAction(a) }); }
  if (a.type === "radio") return radioCommand({ cmd: a.cmd, station: a.station }).then((r) => (r.ok ? { ok: true, message: describeAction(a) } : { ok: false, message: r.error }));
  if (a.type === "remember") return api("/api/memory/lessons", { body: { text: a.text } }).then(() => { window.dispatchEvent(new Event("shuacrew:memory")); return { ok: true, message: "Remembered — every agent will know" }; }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "focus") { setFocus(startFocus(a.minutes)); return Promise.resolve({ ok: true, message: `${a.minutes}-minute focus started` }); }
  if (a.type === "note") { const n = localStorage.getItem("shuacrew.widgets.note") ?? ""; saveNote(n ? `${n}\n${a.text}` : a.text); return Promise.resolve({ ok: true, message: "Added to your note" }); }
  if (a.type === "crew") return launchRun({ ask: a.ask }).then((r) => ({ ok: true, message: "The crew is on it", run: r.id }), (e: Error) => ({ ok: false, message: e.message }));
  return new Promise((resolve) => {
    if (!native()) { resolve({ ok: false, message: "Only in the Mac app" }); return; }
    const id = crypto.randomUUID();
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve({ ok: false, message: "No answer from the Mac" }); }, 8000);
    const on = (e: CustomEvent<{ id: string; ok: boolean; message: string }>) => { if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener); resolve(e.detail); };
    window.addEventListener("shuacrew:did", on as EventListener);
    post({ type: "buddyDo", id, action: a });
  });
}

type Done = { label: string; ok: boolean; message: string; run?: string };

/** A small live meter: bars that follow your voice while listening, and Spark's while it speaks. */
function VoiceBars({ level, active }: { level: number; active: boolean }) {
  return <span className={`spk-bars ${active ? "is-on" : ""}`} aria-hidden="true">{[0.55, 1, 0.75, 0.9, 0.5].map((k, i) => <i key={i} style={{ transform: `scaleY(${active ? Math.max(0.18, Math.min(1, level * 1.6 * k + 0.12 * (i % 2))) : 0.18})` }} />)}</span>;
}

/**
 * Spark. On the desktop it's the floating panel; inside the app (`embedded`) it's the side panel — the same
 * conversation in both places, kept in sync.
 */
export function Buddy({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void } = {}) {
  const prefs = useCompanion(), voice = useBuddyVoice(), note = useNote(), track = useNowPlaying(), { sounds } = useLook();
  // Load Spark's voice as soon as it's on screen, so the first spoken reply starts in a blink instead of after a
  // ~10s cold model load. Re-warms when you switch voices; the gateway keeps it loaded for a while after.
  useEffect(() => {
    if (!voice.on) return;
    const abort = new AbortController();
    void fetch("/api/speech/warm", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: voice.id, warmMinutes: 10 }), signal: abort.signal }).catch(() => {});
    return () => abort.abort();
  }, [voice.on, voice.id]);
  const [openState, setOpen] = useState(false), open = embedded || openState, [tab, setTab] = useState<"chat" | "widgets">("chat"), [draft, setDraft] = useState(""), [see, setSee] = useState(readSee);
  const [brief, setBrief] = useState<{ q: string; a: string } | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [speaking, setSpeaking] = useState(false);
  const [done, setDone] = useState<Record<string, Done[]>>({});
  const [bubble, setBubble] = useState<{ text: string; path: string } | null>(null);
  // Once a day: "your day in 20 seconds", spoken on tap.
  const [morning, setMorning] = useState(false), [evening, setEvening] = useState(false);
  // Guide mode: the step Spark is spotlighting right now, waiting for you to do it.
  const [guide, setGuide] = useState<GuideStep | null>(null), [cheer, setCheer] = useState(false);
  // Spark's face follows what's really happening: a finish, a failure, or a long quiet stretch.
  const [eventMood, setEventMood] = useState<"happy" | "concerned" | null>(null), [sleepy, setSleepy] = useState(false);
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined), lastStir = useRef(Date.now());
  const feel = (m: "happy" | "concerned") => { clearTimeout(moodTimer.current); setEventMood(m); setSleepy(false); lastStir.current = Date.now(); moodTimer.current = setTimeout(() => setEventMood(null), m === "happy" ? 2600 : 6000); };
  // A diagram on the big canvas: the panel grows so a system design has room.
  const [wide, setWide] = useState(false);
  // Hands: what macOS lets Spark do, the task it's working through, and a step waiting for your OK.
  const [hands, setHands] = useState<{ trusted: boolean; shortcuts: string[] }>({ trusted: false, shortcuts: [] });
  const [task, setTask] = useState<{ step: number } | null>(null), [pending, setPending] = useState<Act | null>(null), [autoTask, setAutoTask] = useState(false);
  const [voices, setVoices] = useState<string[]>([]);
  // What Spark knows about you: your lasting lessons and your career goal, read at the start of every conversation.
  const [memory, setMemory] = useState<{ facts: string[]; goal: string }>({ facts: [], goal: "" });
  const loadMemory = () => Promise.all([
    api<{ lessons?: Array<{ text: string; retired?: string | null }> }>("/api/memory").then((m) => (m.lessons ?? []).filter((l) => !l.retired).map((l) => l.text)).catch(() => [] as string[]),
    api<{ profile?: { goal?: string } }>("/api/learning").then((l) => l.profile?.goal?.trim() ?? "").catch(() => ""),
  ]).then(([facts, goal]) => setMemory({ facts, goal }));
  useEffect(() => { void loadMemory(); const on = () => void loadMemory(); window.addEventListener("shuacrew:memory", on); return () => window.removeEventListener("shuacrew:memory", on); }, []);
  // Open-mic conversation.
  const [phase, setPhase] = useState<Phase>("off"), [level, setLevel] = useState(0);
  // A command waiting for your yes.
  const [asking, setAsking] = useState<{ command: string; why: string; answer: (yes: boolean) => void } | null>(null);
  useEffect(() => {
    confirmRun = (command, why) => new Promise<boolean>((resolve) => setAsking({ command, why, answer: (yes) => { setAsking(null); resolve(yes); } }));
    onRanOutput = (command, ok, output) => {
      const run = convoRef.current?.run; if (!run || !output.trim()) return;
      void followUp(run, `[ran] \`${command}\` ${ok ? "succeeded" : "failed"}. Output:\n\`\`\`\n${output.slice(-3000)}\n\`\`\`\nTell me in a sentence or two what this means (no need to repeat it all).`).catch(() => {});
    };
    return () => { confirmRun = null; onRanOutput = null; };
  }, []);
  // Live: Spark watches your screen as a real stream (one frame a second, in memory only) while this is on.
  const [liveOn, setLiveOn] = useState(false), [liveBusy, setLiveBusy] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ on: boolean; error?: string }>).detail; if (!d.error) logSense("saw", d.on ? "Started watching your screen live" : "Stopped watching your screen"); setLiveOn(d.on); setLiveBusy(false); if (d.error) setError(d.error); };
    window.addEventListener("shuacrew:live", on); return () => window.removeEventListener("shuacrew:live", on);
  }, []);
  const toggleLive = () => { setLiveBusy(true); setError(""); post({ type: "buddyLive", on: !liveOn }); if (!native()) { setLiveBusy(false); setError("Live watching works in the ShuaCrew Mac app."); } };
  // What you're saying, live, while you're still saying it.
  const [heard, setHeard] = useState("");
  // Inside the app, the mic is only live while the app window is in front (the desktop panel covers the rest).
  const [focused, setFocused] = useState(() => typeof document !== "undefined" && document.hasFocus());
  // A live mic never starts just because the app opened: inside the app it waits until you engage the panel this session.
  const [armed, setArmed] = useState(!embedded);
  useEffect(() => { const f = () => setFocused(true), b = () => setFocused(false); window.addEventListener("focus", f); window.addEventListener("blur", b); return () => { window.removeEventListener("focus", f); window.removeEventListener("blur", b); }; }, []);
  const mic = useRef<HandsFree>(null as unknown as HandsFree); mic.current ??= new HandsFree();
  const wakeTurn = useRef(false); // "Hey Spark" opened the mic for one request
  const [convo, setConvo] = useState<{ run: string; first: string } | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } });
  const input = useRef<HTMLTextAreaElement>(null), thread = useRef<HTMLDivElement>(null);
  const convoRef = useRef(convo); convoRef.current = convo;
  const speech = useRef<SpeechQueue>(null as unknown as SpeechQueue); speech.current ??= new SpeechQueue();
  // Answers already on screen when the panel loaded were handled before; only new ones point, act and speak.
  const handled = useRef<number | null>(null), spokenUpto = useRef(0), streamId = useRef("");
  const crew = useLive((s) => s.crew), loadRun = useLive((s) => s.loadRun);
  const events = useLive((s) => (convo ? s.runEvents[convo.run] : undefined)), status = convo ? crew.runs[convo.run]?.status : undefined;
  const timer = useFocusTimer(), [now, setNow] = useState(Date.now());
  useEffect(() => { if (!timer) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [timer]);
  useEffect(() => { speech.current.onSpeaking = (on) => { setSpeaking(on); mic.current.speaking = on; }; }, []);
  useEffect(() => {
    const on = (e: Event) => setHands((e as CustomEvent<{ trusted: boolean; shortcuts: string[] }>).detail);
    window.addEventListener("shuacrew:hands", on); post({ type: "buddyHands" });
    void api<{ voices?: Array<{ id: string }> }>("/api/speech/status").then((s) => setVoices((s.voices ?? []).map((v) => v.id))).catch(() => {});
    return () => window.removeEventListener("shuacrew:hands", on);
  }, []);
  useEffect(() => { if (convo) void loadRun(convo.run); }, [convo, loadRun]);
  // The native panel sizes itself to what's showing, so the clear rest never blocks your clicks.
  useEffect(() => { if (!embedded) post({ type: "buddyExpand", open, wide: open && wide, peek: !open && (!!bubble || !!guide || morning || evening), size: prefs.size }); if (open) setTimeout(() => input.current?.focus(), 60); }, [open, bubble, guide, prefs.size, wide, embedded, morning]);
  // One conversation in two places: the desktop panel and the app's side panel follow each other.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key !== KEY) return; try { const next = JSON.parse(e.newValue ?? "null"); handled.current = null; setConvo(next); } catch { /* ignore */ } };
    window.addEventListener("storage", on); return () => window.removeEventListener("storage", on);
  }, []);
  useEffect(() => {
    if (embedded) return;
    (window as unknown as { buddy: unknown }).buddy = { perform, toggle: () => { speech.current.unlock(); setOpen((o) => !o); }, focus: () => { speech.current.unlock(); setOpen(true); setTab("chat"); setTimeout(() => input.current?.focus(), 80); } };
  }, []);

  const messages = useMemo(() => {
    const out: Array<{ who: "you" | "spark"; text: string; live?: boolean; id?: number }> = convo ? [{ who: "you", text: convo.first }] : [];
    let streaming = "";
    for (const e of (events ?? []) as AnyEvent[]) {
      if (e.kind === "run.followup") { out.push({ who: "you", text: (e.body as { text: string }).text.split("\n\n[screen]")[0]!.split("\n\n[attachments]")[0]!.split("\n\n[app]")[0]! }); streaming = ""; }
      else if (e.kind === "agent.delta") streaming += e.body.text;
      else if (e.kind === "agent.message") { out.push({ who: "spark", text: e.body.text, id: e.seq }); streaming = ""; }
    }
    if (streaming) out.push({ who: "spark", text: streaming, live: true });
    return out;
  }, [events, convo]);

  // Speak in real time: each whole sentence as it streams in.
  const live = messages.at(-1)?.live ? messages.at(-1)!.text : "";
  useEffect(() => {
    if (!live || handled.current === null || !mine()) return;
    const key = `${convo?.run}:${messages.length}`;
    if (streamId.current !== key) { streamId.current = key; spokenUpto.current = 0; }
    const next = nextSentences(live, spokenUpto.current);
    spokenUpto.current = next.upto; next.chunks.forEach((c) => speech.current.say(c));
    runBlocksRef.current(live, key, false); // act the moment each instruction is complete, not after the whole reply
  }, [live, convo, messages.length]);

  // Every instruction block runs once, as soon as it has finished streaming. Mouse & keyboard steps wait for the
  // end of the reply (each one hands back a fresh screenshot to continue from).
  const ran = useRef<Map<string, Set<string>>>(new Map());
  const runBlocks = (text: string, key: string, final: boolean) => {
    const seen = ran.current.get(key) ?? new Set<string>(); ran.current.set(key, seen);
    if (ran.current.size > 40) ran.current.delete(ran.current.keys().next().value!);
    for (const b of completedBlocks(text)) {
      if (seen.has(b.key) || (b.kind === "act" && !final)) continue;
      seen.add(b.key);
      if (b.kind === "point") { const p = parsePoint(b.raw); if (p) post({ type: "buddyPoint", ...p, color: accentOf(prefs.color) }); }
      else if (b.kind === "draw") { const shapes = parseDraw(b.raw); if (shapes.length) post({ type: "buddyDraw", shapes, color: accentOf(prefs.color) }); }
      else if (b.kind === "guide") {
        const g = parseGuide(b.raw);
        if (g?.done) { setGuide(null); post({ type: "buddyGuideStop" }); setCheer(true); setTimeout(() => setCheer(false), 2400); }
        else if (g) { setGuide(g); post({ type: "buddyGuide", ...g, color: accentOf(prefs.color), wait: prefs.guide === "click" }); }
      } else if (b.kind === "act") {
        const act = parseAct(b.raw);
        if (act?.type === "done") { stopTask(); setCheer(true); setTimeout(() => setCheer(false), 2400); }
        else if (act && prefs.control !== "off") {
          const step = (taskRef.current?.step ?? 0) + 1;
          if (step > MAX_STEPS) stopTask("Stopped after 25 steps. Ask me to keep going if you want.");
          else { setTask({ step }); actKey.current = key; if (prefs.control === "auto" || autoTask) void runActRef.current(act, step); else setPending(act); }
        }
      } else if (b.kind === "do") {
        const actions = parseActions(b.raw);
        void (async () => { for (const a of actions) { const r = await perform(a); setDone((d) => ({ ...d, [key]: [...(d[key] ?? []), { label: describeAction(a), ...r }] })); } })();
      }
    }
  };
  const runBlocksRef = useRef(runBlocks); runBlocksRef.current = runBlocks;
  /** Which message the current mouse & keyboard step came from, for its receipt. */
  const actKey = useRef("");

  // A finished answer: speak what's left, point, and do what it asked.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.who === "spark" && !m.live);
    if (events === undefined) return;
    if (handled.current === null) { handled.current = last?.id ?? 0; return; }
    if (!last?.id || last.id <= handled.current) return;
    handled.current = last.id;
    if (!mine()) return; // the other Spark surface asked; it speaks and acts
    const key = `${convo?.run}:${messages.length}`;
    const rest = nextSentences(last.text, streamId.current === key ? spokenUpto.current : 0, true);
    rest.chunks.forEach((c) => speech.current.say(c)); streamId.current = ""; spokenUpto.current = 0;
    runBlocksRef.current(last.text, key, true);
  }, [messages, events, convo]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); }, [messages.length, messages.at(-1)?.text.length, tab]);

  // Connected to the app: when your crew finishes, fails or needs you, Spark says so beside itself.
  const seen = useRef<Record<string, string> | null>(null);
  const approvals = Object.keys(crew.approvals).length;
  useEffect(() => {
    const work = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs));
    const prev = seen.current; seen.current = Object.fromEntries(work.map((r) => [r.id, r.status]));
    if (!prev || embedded) return; // crew news is the desktop Spark's to announce, once
    for (const r of work) {
      if (prev[r.id] === r.status || !prev[r.id]) continue;
      if (r.status === "done" || r.status === "merged") feel("happy"); else if (r.status === "failed") feel("concerned");
      const who = r.member ? crew.members[r.member]?.name : null;
      if (r.status === "done") { setBubble({ text: `${who ?? "The crew"} finished “${r.title}”`, path: `/sessions/${r.id}` }); speech.current.say(`${who ?? "The crew"} finished ${r.title}.`); }
      else if (r.status === "failed") setBubble({ text: `“${r.title}” hit a problem`, path: `/sessions/${r.id}` });
      else if (r.status === "awaiting_approval") setBubble({ text: `“${r.title}” needs your OK`, path: `/sessions/${r.id}` });
    }
  }, [crew.runs, crew.members]);
  useEffect(() => { if (!bubble) return; const t = setTimeout(() => setBubble(null), 9000); return () => clearTimeout(t); }, [bubble]);
  useEffect(() => {
    if (embedded) return;
    const check = () => {
      let last: string | null = null, lastEve: string | null = null;
      try { last = localStorage.getItem("shuacrew.morning"); lastEve = localStorage.getItem("shuacrew.evening"); } catch { /* ignore */ }
      if (shouldBrief(last, new Date()) && new Date().getHours() < 12) setMorning(true);
      if (shouldRecap(lastEve, new Date())) setEvening(true);
    };
    check(); const t = setInterval(check, 10 * 60_000); return () => clearInterval(t);
  }, [embedded]);
  // 6pm: the day, wrapped — what shipped, what you learned, what's lined up. Only real things.
  const playEvening = async () => {
    setEvening(false); try { localStorage.setItem("shuacrew.evening", localDay(new Date())); } catch { /* ignore */ }
    speech.current.unlock(); setOpen(true); setTab("chat");
    const learn = await api<{ days?: Array<{ day: string; reviews: number }> }>("/api/learning").catch(() => ({ days: [] as Array<{ day: string; reviews: number }> }));
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const work = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && !r.labels?.includes("buddy"));
    const today = work.filter((r) => r.updatedAt >= midnight.getTime());
    const text = eveningRecap({
      finished: today.filter((r) => r.status === "done" || r.status === "merged").sort((a, b) => b.updatedAt - a.updatedAt).map((r) => r.title),
      failed: today.filter((r) => r.status === "failed").length,
      reviewed: learn.days?.find((d) => d.day === localDay(new Date()) || d.day === new Date().toISOString().slice(0, 10))?.reviews ?? 0,
      tomorrow: work.filter((r) => r.status === "queued").map((r) => r.title),
      waiting: Object.keys(crew.approvals).length,
    });
    setBrief({ q: "Your day, wrapped", a: text }); speech.current.say(text);
    // Journal from your day: the recap, kept in your Library.
    const date = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    void api("/api/library/artifacts", { body: { title: `Journal — ${date}`, filename: `journal-${localDay(new Date())}.md`, content: `# ${date}\n\n${text}\n` } }).catch(() => {});
  };
  const playMorning = async () => {
    setMorning(false); try { localStorage.setItem("shuacrew.morning", localDay(new Date())); } catch { /* ignore */ }
    speech.current.unlock(); setOpen(true); setTab("chat");
    const [brief$, learn] = await Promise.all([
      api<{ sections?: Array<{ title: string; items: Array<{ text: string }> }> }>("/api/briefing").catch(() => ({ sections: [] as Array<{ title: string; items: Array<{ text: string }> }> })),
      api<{ due?: number; profile?: { goal?: string } }>("/api/learning").catch(() => ({ due: 0, profile: {} as { goal?: string } })),
    ]);
    const finished = (brief$.sections ?? []).find((x) => /finish/i.test(x.title))?.items.map((x) => x.text) ?? [];
    const runsNow = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs));
    const text = morningBrief({ now: new Date(), goal: learn.profile?.goal?.trim(), finished, waiting: Object.keys(crew.approvals).length, due: learn.due ?? 0,
      ventures: Object.values(crew.ventures).map((v) => ({ name: v.name, stage: v.stage })), running: runsNow.filter((r) => ["running", "planning"].includes(r.status)).length });
    setBrief({ q: "Morning briefing", a: text }); speech.current.say(text);
  };

  const working = status === "running" || status === "planning" || status === "queued";
  /** You did the step: look again and ask Spark for the next one, from what's really on screen now. */
  const advance = async () => {
    const step = guide; if (!step || !convo) return;
    setGuide(null); post({ type: "buddyGuideStop" }); setBusy("Looking at what changed…"); setError("");
    try {
      await new Promise((r) => setTimeout(r, 700)); // let the app you clicked finish drawing
      const shot = await capture(), att = await upload(shot.file);
      await followUp(convo.run, withAttachments(guideFollowUp(step.label, shot), [att]));
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const advanceRef = useRef(advance); advanceRef.current = advance;
  useEffect(() => { const on = () => void advanceRef.current(); window.addEventListener("shuacrew:guideClick", on); return () => window.removeEventListener("shuacrew:guideClick", on); }, []);
  const MAX_STEPS = 25;
  const stopTask = (why = "") => {
    setTask(null); setPending(null); setAutoTask(false); post({ type: "buddyStopWatch" }); speech.current.stop();
    if (why) setError(why);
  };
  /** Do one step with the mouse or keyboard, then look again and ask for the next one. */
  const runAct = async (a: Act, step: number) => {
    if (!convo) return;
    setPending(null); setBusy(describeAct(a) + "…");
    try {
      const r = await perform({ ...a, color: accentOf(prefs.color) });
      setDone((d) => { const k = actKey.current; return { ...d, [k]: [...(d[k] ?? []), { label: describeAct(a), ...r }] }; });
      await new Promise((ok) => setTimeout(ok, 800)); // let the app react before looking
      if (!taskRef.current) return;
      const shot = await capture(), att = await upload(shot.file);
      await followUp(convo.run, withAttachments(actFollowUp(describeAct(a) + (r.ok ? "" : ` — ${r.message}`), r.ok, shot, step, MAX_STEPS), [att]));
    } catch (e) { stopTask((e as Error).message); } finally { setBusy(""); }
  };
  const taskRef = useRef(task); taskRef.current = task;
  const runActRef = useRef(runAct); runActRef.current = runAct;
  useEffect(() => { const on = () => stopTask("Stopped. Nothing else will be clicked."); window.addEventListener("shuacrew:actStop", on); return () => window.removeEventListener("shuacrew:actStop", on); }, []);
  const stopGuide = () => { setGuide(null); post({ type: "buddyGuideStop" }); speech.current.stop(); };
  const ask = async (text = draft) => {
    const q = text.trim(); if (!q) return;
    claim();
    speech.current.unlock(); speech.current.stop();
    setError(""); setTab("chat");
    const move = producerMove(q);
    if (move && !(convo && status && !["failed", "cancelled"].includes(status))) {
      const set = todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, Date.now());
      if (move.kind === "brief") {
        const a = studioAnswer({ track, set, waiting: Object.keys(crew.approvals).length, tokens: crew.today.tokens, costUsd: crew.today.costUsd });
        setBrief({ q, a }); speech.current.say(a); setDraft(""); return;
      }
      if (move.kind === "scape") { playScape(move.scape, sounds.volume); const a = `Putting on ${move.scape}.`; setBrief({ q, a }); speech.current.say(a); setDraft(""); return; }
      if (move.kind === "stop-radio") { stopScape(); void radioCommand({ cmd: "stop" }); const a = "Radio off."; setBrief({ q, a }); speech.current.say(a); setDraft(""); return; }
      if (move.kind === "explain") {
        const sel = await new Promise<{ text: string; app: string }>((resolve) => {
          const on = (e: Event) => { window.removeEventListener("shuacrew:selection", on); resolve((e as CustomEvent<{ text: string; app: string }>).detail); };
          window.addEventListener("shuacrew:selection", on); post({ type: "buddySelection" });
          setTimeout(() => { window.removeEventListener("shuacrew:selection", on); resolve({ text: "", app: "" }); }, 1500);
        });
        if (sel.text) logSense("saw", "Read your selection", `${sel.app}: ${sel.text}`);
        if (!sel.text) { const a = native() ? "Select the text or code you want explained first, then ask me again." : "Explain-this reads your selection in the ShuaCrew Mac app."; setBrief({ q, a }); speech.current.say(a); setDraft(""); return; }
        setDraft("");
        void askRef.current(`Explain this${sel.app ? ` from ${sel.app}` : ""}\n\n[screen] The user selected this and wants it explained at their level: what it is, what it does, why it matters, and one gotcha. Keep it short and concrete. Then add ONE quiz card about the key idea with a card block.\n\n<selection>\n${sel.text}\n</selection>`);
        return;
      }
      if (move.kind === "idea") {
        const r = await api<{ venture: { name: string }; scoring: boolean }>("/api/ideas", { body: { text: move.text } }).catch((e: Error) => ({ error: e.message }));
        const a = "error" in r ? r.error.replace(/^\d+\s*/, "") : `Saved “${r.venture.name}” to your idea inbox.${r.scoring ? " The crew will score it tonight: demand, competitors and effort, in your Library by morning." : ""}`;
        setBrief({ q, a }); speech.current.say(a); setDraft(""); return;
      }
      if (move.kind === "radio") {
        const r = await radioCommand({ cmd: move.cmd, station: move.station });
        const a = r.ok ? (move.cmd === "play" ? (move.station ? `Putting on lofi ${move.station}.` : "Putting the radio on.") : move.cmd === "next" ? "Next one." : move.cmd === "previous" ? "Going back." : move.cmd === "pause" ? "Paused." : "Back on.") : r.error;
        setBrief({ q, a }); speech.current.say(a); setDraft(""); return;
      }
      if (move.kind === "focus") { setFocus(startFocus(move.minutes)); const a = `${move.minutes}-minute focus. I'll chime when it's done.`; setBrief({ q, a }); speech.current.say(a); setDraft(""); return; }
    }
    setBusy(see ? "Reading your screen…" : isDesign(q) ? "Designing…" : "Thinking…");
    try {
      let atts: Awaited<ReturnType<typeof upload>>[] = [], screen: { width: number; height: number; text: ScreenLine[]; context?: ScreenContext } | null = null;
      if (see || liveOn) { const shot = await capture(); atts = [await upload(shot.file)]; screen = { width: shot.width, height: shot.height, text: shot.text, context: shot.context }; }
      const now = crewNowBlock(track, todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, Date.now()), Object.keys(crew.approvals).length);
      const rs = getRadio(); if (!rs.loaded) void loadRadio();
      const remembered = asksAboutEarlier(q) ? await recall(q) : "";
      if (remembered) logSense("saw", "Checked your screen memory", q);
      const appNowBase = shuacrewNow({
        members: Object.values(crew.members).map((m) => ({ name: m.name, role: (m as { role?: string }).role })),
        ventures: Object.values(crew.ventures ?? {}).map((v) => (v as { name: string }).name),
        radio: { on: rs.playing ? rs.live?.name ?? rs.track?.title ?? null : null, stations: [...rs.stations.filter((x) => x.tracks.length).map((x) => x.name), ...rs.youtube.map((x) => x.name)] },
      });
      const appNow = remembered ? `${appNowBase}\n\n${remembered}` : appNowBase;
      if (convo && status && !["failed", "cancelled"].includes(status)) {
        const mapped = (() => { try { return (JSON.parse(localStorage.getItem("shuacrew.buddy.mapped") ?? "[]") as string[]).includes(convo.run); } catch { return false; } })();
        const withMap = (text: string) => { const t = remembered && !text.includes("\n\n[screen]") ? `${text}\n\n[screen]\n${remembered}` : remembered ? `${text}\n\n${remembered}` : text; return mapped ? t : `${t}\n\n[app]\n${appNow}`; };
        if (!mapped) { try { const m = JSON.parse(localStorage.getItem("shuacrew.buddy.mapped") ?? "[]") as string[]; localStorage.setItem("shuacrew.buddy.mapped", JSON.stringify([...m.slice(-50), convo.run])); } catch { /* ignore */ } }
        await followUp(convo.run, withAttachments(withMap(screen ? `${q}\n\n[screen] A fresh screenshot is attached (${screen.width}×${screen.height}). Point, guide, draw or act if it helps.${screen.text.length ? `\n\n${screenText(screen.text, 6000)}` : ""}${screen.context ? `\n\n${elementsText(screen.context)}` : ""}` : isDesign(q) ? `${q}\n\n(This is a system-design question: use the SYSTEM DESIGN format from before — spoken summary, ---, the written design and a mermaid diagram.)` : q), atts));
      } else {
        setBrief(null);
        const r = await api<{ id: string }>("/api/runs", { body: { ask: withAttachments(buddyPrompt(q, screen, { name: prefs.nickname || "Spark", tone: prefs.tone, length: prefs.length, control: prefs.control, shortcuts: hands.shortcuts, voices, voice: prefs.conversation, memory: memory.facts, goal: memory.goal }, now, appNow), atts), title: `${prefs.nickname || "Spark"} · ${q.slice(0, 60)}`, runtime: "claude", model: screen || isDesign(q) ? "claude-sonnet-5" : "claude-haiku-4-5", effort: isDesign(q) ? "medium" : "low", labels: ["buddy"] } });
        const next = { run: r.id, first: q.split("\n\n[screen]")[0]! }; handled.current = 0; setConvo(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      setDraft("");
    } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); }
  };
  // Open mic: every turn you speak is a message; talking over Spark stops it.
  const askRef = useRef(ask); askRef.current = ask;
  useEffect(() => {
    const m = mic.current;
    m.onPhase = (p, detail) => { setPhase(p); if (p === "error" && detail) setError(detail); };
    m.onLevel = setLevel;
    m.onPartial = setHeard;
    // Interrupting: Spark drops to a murmur the moment you start, and only stops once your words are real —
    // a cough, a door or its own voice through the speakers no longer cuts it off mid-sentence.
    m.onTurn = (t) => {
      if (wakeTurn.current) { wakeTurn.current = false; m.mode = prefsRef.current.listen; if (!prefsRef.current.conversation && prefsRef.current.listen !== "hold") m.stop(); }
      logSense("heard", "Heard you", t); if (prefsRef.current.interrupt) speech.current.stop(); void askRef.current(t); };
    m.onBargeIn = () => { if (prefsRef.current.interrupt) speech.current.duck(true); };
    m.onDropped = () => speech.current.duck(false);
    m.mode = wakeTurn.current ? "auto" : prefs.listen;
    const wanted = prefs.listen === "hold" || prefs.conversation || wakeTurn.current;
    if (wanted && open && armed && (!embedded || focused)) { speech.current.unlock(); void m.start(); } else m.stop();
  }, [prefs.conversation, prefs.listen, open, embedded, focused, armed]);
  // Push-to-talk with the keyboard: hold Space while Spark's box is empty (or nothing is focused).
  useEffect(() => {
    if (prefs.listen !== "hold" || !open) return;
    const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; if (!el) return false; if (el === input.current) return !!input.current?.value; return !!el.closest?.("input,textarea,select,[contenteditable=true],.xterm"); };
    const down = (e: KeyboardEvent) => { if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return; e.preventDefault(); setArmed(true); speech.current.unlock(); mic.current.hold(); };
    const up = (e: KeyboardEvent) => { if (e.code !== "Space") return; mic.current.release(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); mic.current.release(); };
  }, [prefs.listen, open]);
  useEffect(() => () => mic.current.stop(), []);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  // The desktop Spark: pinned on top only if you chose it; always comes forward when it starts talking.
  useEffect(() => { if (!embedded) post({ type: "buddyOnTop", on: prefs.onTop }); }, [prefs.onTop, embedded]);
  useEffect(() => { if (!embedded) post({ type: "buddyScreenMemory" }); }, [embedded]); // wakes the recorder if you turned it on
  // "Hey Spark": the Mac app heard it — open, answer, and listen for one request (even with open mic off).
  useEffect(() => { if (!embedded) post({ type: "buddyWake", names: prefs.nickname ? [prefs.nickname] : [] }); }, [embedded, prefs.nickname]);
  useEffect(() => {
    if (embedded) return;
    const on = () => {
      setOpen(true); setTab("chat"); setArmed(true); speech.current.unlock(); speech.current.stop();
      speech.current.say("Yes?");
      wakeTurn.current = true;
      const m = mic.current; m.mode = "auto"; void m.start();
    };
    window.addEventListener("shuacrew:wake", on); return () => window.removeEventListener("shuacrew:wake", on);
  }, [embedded]);
  useEffect(() => { if (!embedded && speaking) post({ type: "buddyRaise" }); }, [speaking, embedded]);
  // Music steps aside while you and Spark talk (the radio and Music/Spotify), and comes back once it's quiet again.
  // "Talking" covers the whole exchange: you speaking, Spark thinking, and Spark answering — no gap in between.
  const talking = speaking || phase === "hearing" || phase === "transcribing" || !!busy || working;
  useEffect(() => {
    if (!mine()) return;
    if (talking) { post({ type: "buddyDuck", on: true }); void radioCommand({ cmd: "duck" }); return; }
    const t = setTimeout(() => { post({ type: "buddyDuck", on: false }); void radioCommand({ cmd: "unduck" }); }, 2000);
    return () => clearTimeout(t);
  }, [talking]);
  const setListen = (listen: "auto" | "hold") => { setArmed(true); const cur = parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")); saveCompanion({ ...cur, listen }); };
  const toggleTalk = () => { setArmed(true); speech.current.unlock(); const cur = parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")); saveCompanion({ ...cur, conversation: !prefs.conversation }); };
  const reset = () => { stopTask(); stopGuide(); setConvo(null); setBrief(null); setDone({}); try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
  const lastQuestion = [...messages].reverse().find((m) => m.who === "you")?.text;
  const focusPct = timer ? 1 - remainingFocusMs(timer, now) / timer.durationMs : 0;

  const status$ = speaking ? "speaking" : phase === "hearing" ? "hearing you" : phase === "transcribing" ? "got it" : working || busy ? "thinking" : prefs.conversation && phase === "listening" ? "listening" : embedded ? "here with you" : "on your Mac";
  const close = () => { speech.current.stop(); if (embedded) onClose?.(); else setOpen(false); };
  // Doze after 15 quiet minutes with nothing running; anything happening wakes it.
  useEffect(() => { lastStir.current = Date.now(); setSleepy(false); }, [messages.length, speaking, busy, phase, open]);
  useEffect(() => {
    const t = setInterval(() => { const anyRunning = Object.values(useLive.getState().crew.runs).some((r) => r.status === "running" || r.status === "planning"); if (anyRunning) lastStir.current = Date.now(); setSleepy(Date.now() - lastStir.current > 15 * 60_000); }, 30_000);
    return () => clearInterval(t);
  }, []);
  const mood = cheer || eventMood === "happy" ? "happy" : speaking ? "speaking" : working || busy ? "thinking" : eventMood === "concerned" ? "concerned" : sleepy ? "sleepy" : "idle";
  const card = <section className={`buddy-card spk ${embedded ? "is-embedded" : ""}`} style={sparkVars(prefs.color)} aria-label={`Ask ${prefs.nickname || "Spark"}`} onPointerDown={() => setArmed(true)}>
      <header className="spk-head">
        <span className={`spk-avatar is-${speaking ? "speaking" : phase === "hearing" ? "hearing" : working || busy ? "thinking" : "idle"}`}><SparkCharacter preferences={prefs} mood={mood} size={38} crop="portrait" /></span>
        <div className="spk-who"><strong>{prefs.nickname || "Spark"}</strong><span className={`spk-status is-${status$.split(" ")[0]}`}><VoiceBars level={speaking ? 0.6 : level} active={speaking || phase === "hearing" || (prefs.conversation && phase === "listening")} />{status$}</span></div>
        <button type="button" className={`spk-live ${liveOn ? "is-on" : ""}`} aria-pressed={liveOn} disabled={liveBusy} onClick={toggleLive} title={liveOn ? "Watching your screen live · click to stop" : "Watch my screen live (in memory only, nothing saved)"}><i />{liveOn ? "Live" : "Watch"}</button>
        <button type="button" aria-label={voice.on ? "Mute" : "Let it talk"} title={voice.on ? "Talks out loud · click to mute" : "Muted · click to hear answers"} className={voice.on ? "is-on" : ""} onClick={() => { speech.current.unlock(); if (voice.on) speech.current.stop(); saveBuddyVoice({ on: !voice.on }); }}>{voice.on ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
        {convo && !embedded && <button type="button" aria-label="Open in ShuaCrew" title="Open this conversation in ShuaCrew" onClick={() => post({ type: "buddyOpen", run: convo.run })}><Maximize2 size={14} /></button>}
        {convo && <button type="button" aria-label="New conversation" title="New conversation" onClick={reset}><RotateCcw size={14} /></button>}
        <button type="button" aria-label="Close" onClick={close}><X size={15} /></button>
      </header>
      <nav className="buddy-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}><MessageCircle size={12} /> Chat</button>
        <button type="button" role="tab" aria-selected={tab === "widgets"} onClick={() => setTab("widgets")}><LayoutGrid size={12} /> Widgets{approvals > 0 && <em>{approvals}</em>}</button>
      </nav>
      {tab === "chat" && <div className="spk-voicebar">
        <span className="spk-voicebar-label"><AudioLines size={12} /> {phase === "hearing" ? "Hearing you…" : phase === "transcribing" ? "Got it…" : phase === "starting" ? "Opening the mic…" : phase === "error" ? "Mic unavailable" : wakeTurn.current && phase === "listening" ? "Listening — go ahead" : prefs.listen === "hold" ? (phase === "listening" ? "Hold the mic or Space to talk" : "Click here, then hold to talk") : prefs.conversation && phase === "listening" ? "Listening — just talk" : prefs.conversation ? "Mic paused — click Spark to listen" : "Tap the mic to talk"}</span>
        <div className="spk-listen" role="radiogroup" aria-label="How to talk">
          <button type="button" role="radio" aria-checked={prefs.listen === "auto"} className={prefs.listen === "auto" ? "is-on" : ""} onClick={() => setListen("auto")} title="Open mic: just talk">Auto</button>
          <button type="button" role="radio" aria-checked={prefs.listen === "hold"} className={prefs.listen === "hold" ? "is-on" : ""} onClick={() => setListen("hold")} title="Push-to-talk: hold the talk button or Space">Hold</button>
        </div>
      </div>}
      {tab === "widgets" ? <div className="buddy-thread buddy-widgets"><SparkWidgets ctx={embedded ? { go: (path) => { window.shuacrew?.navigate(path); } } : ctx} /></div> : <>
        <div className="buddy-thread spk-thread" ref={thread}>
          {!messages.length && !brief && <motion.div className="spk-hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <div className="spk-hello-avatar"><SparkCharacter preferences={prefs} mood="happy" size={76} crop="portrait" /></div>
            <h2>Hey, I'm {prefs.nickname || "Spark"}.</h2>
            <p>Your assistant for everything: I can see your screen and use your Mac, teach you anything, turn ideas into ventures, and hand real work to your crew.</p>
            <div className="buddy-starters">{["What's going on today?", "Teach me Kubernetes", "Help me make money with an idea", "Show me how to do this", "Design a URL shortener", "Put on rain"].map((s, k) => <motion.button key={s} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + k * 0.04 }} onClick={() => void ask(s)}>{s}</motion.button>)}</div>
            <p className="buddy-tip"><AudioLines size={12} /> Tap the waveform and just talk{embedded ? "" : <>. <kbd>⌃⌥Space</kbd> from any app</>}.</p>
          </motion.div>}
          {brief && !messages.length && <>
            <div className="buddy-msg is-you">{brief.q}</div>
            <div className="spk-row"><span className="spk-mini"><SparkCharacter preferences={prefs} size={26} crop="portrait" /></span><div className="buddy-msg is-spark"><Markdown text={brief.a} /></div></div>
          </>}
          <AnimatePresence initial={false}>
          {messages.map((m, i) => { const p = m.who === "spark" && !m.live ? parsePoint(m.text) : null, did = done[`${convo?.run}:${i + 1}`];
            const body = m.who === "spark" ? <>{splitDiagrams(speakable(m.text)).map((part, k) => part.kind === "diagram"
              ? (m.live ? <p key={k} className="buddy-typing">Drawing the diagram…</p> : <Diagram key={k} code={part.value} color={accentOf(prefs.color)} expanded={wide} onExpand={(v) => setWide(v)} onSave={(name, svg) => post({ type: "saveFile", name, text: svg })} />)
              : <Markdown key={k} text={part.value.replace(/^\s*-{3,}\s*$/m, "")} streaming={m.live} />)}
              {did && <div className="buddy-did">{did.map((d, j) => <motion.button type="button" key={j} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={d.ok ? "is-ok" : "is-bad"} title={d.message} onClick={() => d.run && post({ type: "buddyOpen", run: d.run })}>{d.ok ? <Check size={11} /> : <X size={11} />} {d.ok ? d.message : `${d.label}: ${d.message}`}</motion.button>)}</div>}
              {p && <button type="button" className="buddy-point" onClick={() => post({ type: "buddyPoint", ...p, color: accentOf(prefs.color) })}><MousePointer2 size={11} /> Show me {p.label ? `“${p.label}”` : ""} again</button>}</> : m.text;
            return <motion.div key={`${i}-${m.who}`} layout="position" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={m.who === "spark" ? "spk-row" : "spk-row is-you"}>
              {m.who === "spark" && <span className="spk-mini"><SparkCharacter preferences={prefs} mood={m.live ? "speaking" : "idle"} size={26} crop="portrait" /></span>}
              <div className={`buddy-msg is-${m.who} ${m.live ? "is-live" : ""}`}>{body}</div>
            </motion.div>; })}
          </AnimatePresence>
          {(phase === "hearing" || phase === "transcribing") && <motion.div className="spk-row is-you" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="buddy-msg is-you is-hearing">{heard || (phase === "hearing" ? "Listening…" : "…")}<i className="spk-live-caret" /></div>
          </motion.div>}
          {(busy || (working && messages.at(-1)?.who === "you")) && <motion.div className="spk-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><span className="spk-mini"><SparkCharacter preferences={prefs} mood="thinking" size={26} crop="portrait" /></span><p className="buddy-typing spk-typing"><span /><span /><span /> {busy || "thinking"}</p></motion.div>}
          {convo && !working && !busy && lastQuestion && <button type="button" className="buddy-handoff" onClick={() => void perform({ type: "crew", ask: lastQuestion }).then((r) => r.run && (embedded ? window.shuacrew?.navigate(`/sessions/${r.run}`) : post({ type: "buddyOpen", run: r.run })))}><Send size={11} /> Hand this to the crew as a full session</button>}
        </div>
        {error && <p className="buddy-error">{error}</p>}
      </>}
      {asking && <div className="buddy-task is-run"><Hand size={14} /><span><b>Run this?</b> <code>{asking.command}</code>{asking.why && <small> · {asking.why}</small>}</span>
        <button type="button" onClick={() => asking.answer(true)}>Run</button><button type="button" onClick={() => asking.answer(false)}>Cancel</button></div>}
      {task && <div className="buddy-task"><Hand size={14} /><span><b>Working on your Mac</b> step {task.step} · <kbd>Esc</kbd> stops</span>
        {pending && <><em>{describeAct(pending)}?</em><button type="button" onClick={() => void runAct(pending, task.step)}>Do it</button><button type="button" title="Don't ask again for this task" onClick={() => { setAutoTask(true); void runAct(pending, task.step); }}>All</button></>}
        <button type="button" className="buddy-task-stop" aria-label="Stop" onClick={() => stopTask("Stopped.")}><Square size={11} /></button></div>}
      {guide && <div className="buddy-guide"><Compass size={14} /><span><b>Step {guide.step}</b> {guide.label}</span>
        <button type="button" title={prefs.guide === "click" ? "Or just click the highlighted spot" : "Tell me when you've done it"} onClick={() => void advance()}>Done <ChevronRight size={12} /></button><button type="button" aria-label="Stop guiding" onClick={stopGuide}><X size={12} /></button></div>}
      <form className="buddy-input spk-input" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <button type="button" className={`buddy-see ${see ? "is-on" : ""}`} aria-pressed={see} title={see ? "I'll look at your screen when you ask (one screenshot, only then)" : "Screen off: I won't look"} onClick={() => setSee((v) => { const next = !v; try { localStorage.setItem(SEE, next ? "1" : "0"); } catch { /* ignore */ } return next; })}>{see ? <Eye size={15} /> : <EyeOff size={15} />}</button>
        <textarea ref={input} rows={1} value={draft} placeholder={prefs.conversation && phase === "listening" ? "Listening… or type" : see ? "Ask or tell me to do it…" : "Ask me anything…"} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } if (e.key === "Escape") close(); }} aria-label="Message" />
        {prefs.listen === "hold"
          ? <button type="button" className={`buddy-talk is-hold is-${phase}`} title="Hold to talk (or hold Space) — let go to send" aria-label="Hold to talk" style={{ "--lvl": level } as CSSProperties}
              onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setArmed(true); speech.current.unlock(); mic.current.hold(); }}
              onPointerUp={() => mic.current.release()} onPointerCancel={() => mic.current.release()}><AudioLines size={15} /></button>
          : <button type="button" className={`buddy-talk ${prefs.conversation ? "is-on" : ""} is-${phase}`} aria-pressed={prefs.conversation} title={prefs.conversation ? "Conversation on: just talk. Click to stop listening." : "Talk hands-free: just speak, no buttons"} onClick={toggleTalk} style={{ "--lvl": level } as CSSProperties}><AudioLines size={15} /></button>}
        <motion.button className="buddy-send" disabled={!!busy || !draft.trim()} aria-label="Send" whileTap={{ scale: 0.88 }}><ArrowUp size={16} /></motion.button>
      </form>
    </section>;
  if (embedded) return <div className="buddy is-open is-embedded" style={sparkVars(prefs.color)}>{card}</div>;
  return <div className={`buddy ${open ? "is-open" : ""}`} style={sparkVars(prefs.color)}>
    <AnimatePresence>{open && <motion.div key="card" className="spk-pop" initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}>{card}</motion.div>}</AnimatePresence>
    {!open && guide && <div className="buddy-bubble is-guide"><span><Compass size={12} /> Step {guide.step}: {guide.label}</span>
      <div><button type="button" onClick={() => void advance()}>Done <ChevronRight size={11} /></button><button type="button" onClick={stopGuide}>Stop</button></div></div>}
    {!open && !guide && !bubble && morning && <button type="button" className="buddy-bubble is-morning" onClick={() => void playMorning()}>Your day in 20 seconds<small>Tap to hear it</small></button>}
    {!open && !guide && bubble && <button type="button" className="buddy-bubble" onClick={() => { post({ type: "buddyOpen", path: bubble.path }); setBubble(null); }}>{bubble.text}<small>Open in ShuaCrew</small></button>}
    {!open && !guide && !bubble && !morning && evening && <button type="button" className="buddy-bubble is-morning" onClick={() => void playEvening()}>Your day, wrapped<small>Tap to hear it</small></button>}
    {!open && !guide && !bubble && !morning && !evening && track.id && <button type="button" className="buddy-bubble" onClick={() => post({ type: "buddyOpen", path: `/sessions/${track.id}` })}>{track.title}<small>{track.who ? `${track.who} · ${track.label}` : track.label}</small></button>}
    <div className={`buddy-spark size-${prefs.size} ${working || busy ? "is-thinking" : ""} ${speaking ? "is-speaking" : ""}`} aria-hidden="true">
      {timer && <svg className="buddy-focus" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="46" className="fill" style={{ strokeDashoffset: `${289 * (1 - focusPct)}` }} /></svg>}
      <SparkCharacter preferences={prefs} mood={mood} /><i className="buddy-shadow" />
      {approvals > 0 && <em className="buddy-badge">{approvals}</em>}
    </div>
  </div>;
}
