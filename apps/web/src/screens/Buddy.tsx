import { logAction } from "../lib/spark-log";
import { morningBrief, shouldBrief } from "../lib/morning";
import { accentOf, sparkVars } from "../lib/spark-color";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, AudioLines, StickyNote, Check, ChevronRight, Compass, Eye, EyeOff, Hand, LayoutGrid, Maximize2, MessageCircle, MousePointer2, RotateCcw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { api, followUp, launchRun } from "../lib/api";
import { useLive } from "../lib/live";
import { isTopLevelWork } from "../lib/crew";
import { upload, withAttachments } from "../lib/attachments";
import { actFollowUp, buddyPrompt, describeAct, describeAction, guideFollowUp, parseAct, type Act, type SparkChanges, isDesign, nextSentences, parseActions, parseDraw, parseGuide, parsePoint, screenText, speakable, splitDiagrams, type Action, type GuideStep, type ScreenLine } from "../lib/buddy";
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
function capture(): Promise<{ file: File; width: number; height: number; text: ScreenLine[] }> {
  return new Promise((resolve, reject) => {
    if (!native()) { reject(new Error("Screen questions work in the ShuaCrew Mac app.")); return; }
    const t = setTimeout(() => { window.removeEventListener("shuacrew:capture", on as EventListener); reject(new Error("Screenshot timed out.")); }, 15_000);
    const on = (e: CustomEvent<{ data?: string; width?: number; height?: number; text?: ScreenLine[]; error?: string }>) => {
      clearTimeout(t); window.removeEventListener("shuacrew:capture", on as EventListener);
      const d = e.detail; if (!d.data) { reject(new Error(d.error ?? "Couldn't capture the screen.")); return; }
      const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
      resolve({ file: new File([bytes], "screen.jpg", { type: "image/jpeg" }), width: d.width ?? 0, height: d.height ?? 0, text: d.text ?? [] });
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
  const [openState, setOpen] = useState(false), open = embedded || openState, [tab, setTab] = useState<"chat" | "widgets">("chat"), [draft, setDraft] = useState(""), [see, setSee] = useState(readSee);
  const [brief, setBrief] = useState<{ q: string; a: string } | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [speaking, setSpeaking] = useState(false);
  const [done, setDone] = useState<Record<number, Done[]>>({});
  const [bubble, setBubble] = useState<{ text: string; path: string } | null>(null);
  // Once a day: "your day in 20 seconds", spoken on tap.
  const [morning, setMorning] = useState(false);
  // Guide mode: the step Spark is spotlighting right now, waiting for you to do it.
  const [guide, setGuide] = useState<GuideStep | null>(null), [cheer, setCheer] = useState(false);
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
  // Inside the app, the mic is only live while the app window is in front (the desktop panel covers the rest).
  const [focused, setFocused] = useState(() => typeof document !== "undefined" && document.hasFocus());
  // A live mic never starts just because the app opened: inside the app it waits until you engage the panel this session.
  const [armed, setArmed] = useState(!embedded);
  useEffect(() => { const f = () => setFocused(true), b = () => setFocused(false); window.addEventListener("focus", f); window.addEventListener("blur", b); return () => { window.removeEventListener("focus", f); window.removeEventListener("blur", b); }; }, []);
  const mic = useRef<HandsFree>(null as unknown as HandsFree); mic.current ??= new HandsFree();
  const [convo, setConvo] = useState<{ run: string; first: string } | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } });
  const input = useRef<HTMLTextAreaElement>(null), thread = useRef<HTMLDivElement>(null);
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
  useEffect(() => { if (!embedded) post({ type: "buddyExpand", open, wide: open && wide, peek: !open && (!!bubble || !!guide || morning), size: prefs.size }); if (open) setTimeout(() => input.current?.focus(), 60); }, [open, bubble, guide, prefs.size, wide, embedded, morning]);
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
      if (e.kind === "run.followup") { out.push({ who: "you", text: (e.body as { text: string }).text.split("\n\n[screen]")[0]!.split("\n\n[attachments]")[0]! }); streaming = ""; }
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
  }, [live, convo, messages.length]);

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
    const p = parsePoint(last.text); if (p) post({ type: "buddyPoint", ...p, color: accentOf(prefs.color) });
    const shapes = parseDraw(last.text); if (shapes.length) post({ type: "buddyDraw", shapes, color: accentOf(prefs.color) });
    const g = parseGuide(last.text);
    if (g?.done) { setGuide(null); post({ type: "buddyGuideStop" }); setCheer(true); setTimeout(() => setCheer(false), 2400); }
    else if (g) { setGuide(g); post({ type: "buddyGuide", ...g, color: accentOf(prefs.color), wait: prefs.guide === "click" }); }
    const act = parseAct(last.text);
    if (act?.type === "done") { stopTask(); setCheer(true); setTimeout(() => setCheer(false), 2400); }
    else if (act && prefs.control !== "off") {
      const step = (taskRef.current?.step ?? 0) + 1;
      if (step > MAX_STEPS) stopTask("Stopped after 25 steps. Ask me to keep going if you want.");
      else { setTask({ step }); if (prefs.control === "auto" || autoTask) void runActRef.current(act, step); else setPending(act); }
    }
    const actions = parseActions(last.text), id = last.id;
    if (actions.length) void (async () => {
      const results: Done[] = [];
      for (const a of actions) { const r = await perform(a); results.push({ label: describeAction(a), ...r }); setDone((d) => ({ ...d, [id]: [...results] })); }
    })();
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
      const who = r.member ? crew.members[r.member]?.name : null;
      if (r.status === "done") { setBubble({ text: `${who ?? "The crew"} finished “${r.title}”`, path: `/sessions/${r.id}` }); speech.current.say(`${who ?? "The crew"} finished ${r.title}.`); }
      else if (r.status === "failed") setBubble({ text: `“${r.title}” hit a problem`, path: `/sessions/${r.id}` });
      else if (r.status === "awaiting_approval") setBubble({ text: `“${r.title}” needs your OK`, path: `/sessions/${r.id}` });
    }
  }, [crew.runs, crew.members]);
  useEffect(() => { if (!bubble) return; const t = setTimeout(() => setBubble(null), 9000); return () => clearTimeout(t); }, [bubble]);
  useEffect(() => {
    if (embedded) return;
    const check = () => { let last: string | null = null; try { last = localStorage.getItem("shuacrew.morning"); } catch { /* ignore */ } if (shouldBrief(last, new Date())) setMorning(true); };
    check(); const t = setInterval(check, 10 * 60_000); return () => clearInterval(t);
  }, [embedded]);
  const playMorning = async () => {
    setMorning(false); try { localStorage.setItem("shuacrew.morning", new Date().toISOString().slice(0, 10)); } catch { /* ignore */ }
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
      setDone((d) => { const k = handled.current ?? 0; return { ...d, [k]: [...(d[k] ?? []), { label: describeAct(a), ...r }] }; });
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
      if (move.kind === "stop-radio") { stopScape(); const a = "Radio off."; setBrief({ q, a }); speech.current.say(a); setDraft(""); return; }
      if (move.kind === "focus") { setFocus(startFocus(move.minutes)); const a = `${move.minutes}-minute focus. I'll chime when it's done.`; setBrief({ q, a }); speech.current.say(a); setDraft(""); return; }
    }
    setBusy(see ? "Reading your screen…" : isDesign(q) ? "Designing…" : "Thinking…");
    try {
      let atts: Awaited<ReturnType<typeof upload>>[] = [], screen: { width: number; height: number; text: ScreenLine[] } | null = null;
      if (see) { const shot = await capture(); atts = [await upload(shot.file)]; screen = { width: shot.width, height: shot.height, text: shot.text }; }
      const now = crewNowBlock(track, todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, Date.now()), Object.keys(crew.approvals).length);
      if (convo && status && !["failed", "cancelled"].includes(status)) {
        await followUp(convo.run, withAttachments(screen ? `${q}\n\n[screen] A fresh screenshot is attached (${screen.width}×${screen.height}). Point, guide or draw if it helps.${screen.text.length ? `\n\n${screenText(screen.text, 6000)}` : ""}` : isDesign(q) ? `${q}\n\n(This is a system-design question: use the SYSTEM DESIGN format from before — spoken summary, ---, the written design and a mermaid diagram.)` : q, atts));
      } else {
        setBrief(null);
        const r = await api<{ id: string }>("/api/runs", { body: { ask: withAttachments(buddyPrompt(q, screen, { name: prefs.nickname || "Spark", tone: prefs.tone, length: prefs.length, control: prefs.control, shortcuts: hands.shortcuts, voices, voice: prefs.conversation, memory: memory.facts, goal: memory.goal }, now), atts), title: `${prefs.nickname || "Spark"} · ${q.slice(0, 60)}`, runtime: "claude", model: screen || isDesign(q) ? "claude-sonnet-5" : "claude-haiku-4-5", effort: isDesign(q) ? "medium" : "low", labels: ["buddy"] } });
        const next = { run: r.id, first: q }; handled.current = 0; setConvo(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
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
    m.onTurn = (t) => void askRef.current(t);
    m.onBargeIn = () => { if (prefsRef.current.interrupt) speech.current.stop(); };
    if (prefs.conversation && open && armed && (!embedded || focused)) { speech.current.unlock(); void m.start(); } else m.stop();
  }, [prefs.conversation, open, embedded, focused, armed]);
  useEffect(() => () => mic.current.stop(), []);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const toggleTalk = () => { setArmed(true); speech.current.unlock(); const cur = parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")); saveCompanion({ ...cur, conversation: !prefs.conversation }); };
  const reset = () => { stopTask(); stopGuide(); setConvo(null); setBrief(null); setDone({}); try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
  const lastQuestion = [...messages].reverse().find((m) => m.who === "you")?.text;
  const focusPct = timer ? 1 - remainingFocusMs(timer, now) / timer.durationMs : 0;

  const status$ = speaking ? "speaking" : phase === "hearing" ? "hearing you" : phase === "transcribing" ? "got it" : working || busy ? "thinking" : prefs.conversation && phase === "listening" ? "listening" : embedded ? "here with you" : "on your Mac";
  const close = () => { speech.current.stop(); if (embedded) onClose?.(); else setOpen(false); };
  const mood = cheer ? "happy" : speaking ? "speaking" : working || busy ? "thinking" : "idle";
  const card = <section className={`buddy-card spk ${embedded ? "is-embedded" : ""}`} aria-label={`Ask ${prefs.nickname || "Spark"}`} onPointerDown={() => setArmed(true)}>
      <header className="spk-head">
        <span className="spk-avatar"><SparkCharacter preferences={prefs} mood={mood} size={30} /></span>
        <div className="spk-who"><strong>{prefs.nickname || "Spark"}</strong><span className={`spk-status is-${status$.split(" ")[0]}`}><VoiceBars level={speaking ? 0.6 : level} active={speaking || phase === "hearing" || (prefs.conversation && phase === "listening")} />{status$}</span></div>
        <button type="button" aria-label={voice.on ? "Mute" : "Let it talk"} title={voice.on ? "Talks out loud · click to mute" : "Muted · click to hear answers"} className={voice.on ? "is-on" : ""} onClick={() => { speech.current.unlock(); if (voice.on) speech.current.stop(); saveBuddyVoice({ on: !voice.on }); }}>{voice.on ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
        {convo && !embedded && <button type="button" aria-label="Open in ShuaCrew" title="Open this conversation in ShuaCrew" onClick={() => post({ type: "buddyOpen", run: convo.run })}><Maximize2 size={14} /></button>}
        {convo && <button type="button" aria-label="New conversation" title="New conversation" onClick={reset}><RotateCcw size={14} /></button>}
        <button type="button" aria-label="Close" onClick={close}><X size={15} /></button>
      </header>
      <nav className="buddy-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}><MessageCircle size={12} /> Chat</button>
        <button type="button" role="tab" aria-selected={tab === "widgets"} onClick={() => setTab("widgets")}><LayoutGrid size={12} /> Widgets{approvals > 0 && <em>{approvals}</em>}</button>
      </nav>
      {tab === "widgets" ? <div className="buddy-thread buddy-widgets"><SparkWidgets ctx={embedded ? { go: (path) => { window.shuacrew?.navigate(path); } } : ctx} /></div> : <>
        <div className="buddy-thread spk-thread" ref={thread}>
          {!messages.length && !brief && <motion.div className="spk-hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <div className="spk-hello-avatar"><SparkCharacter preferences={prefs} mood="happy" size={56} /></div>
            <h2>Hey, I'm {prefs.nickname || "Spark"}.</h2>
            <p>Your assistant for everything: I can see your screen and use your Mac, teach you anything, turn ideas into ventures, and hand real work to your crew.</p>
            <div className="buddy-starters">{["What's going on today?", "Teach me Kubernetes", "Help me make money with an idea", "Show me how to do this", "Design a URL shortener", "Put on rain"].map((s, k) => <motion.button key={s} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + k * 0.04 }} onClick={() => void ask(s)}>{s}</motion.button>)}</div>
            <p className="buddy-tip"><AudioLines size={12} /> Tap the waveform and just talk{embedded ? "" : <>. <kbd>⌃⌥Space</kbd> from any app</>}.</p>
          </motion.div>}
          {brief && !messages.length && <>
            <div className="buddy-msg is-you">{brief.q}</div>
            <div className="spk-row"><span className="spk-mini"><SparkCharacter preferences={prefs} size={22} /></span><div className="buddy-msg is-spark"><Markdown text={brief.a} /></div></div>
          </>}
          <AnimatePresence initial={false}>
          {messages.map((m, i) => { const p = m.who === "spark" && !m.live ? parsePoint(m.text) : null, did = m.id ? done[m.id] : undefined;
            const body = m.who === "spark" ? <>{splitDiagrams(speakable(m.text)).map((part, k) => part.kind === "diagram"
              ? (m.live ? <p key={k} className="buddy-typing">Drawing the diagram…</p> : <Diagram key={k} code={part.value} color={accentOf(prefs.color)} expanded={wide} onExpand={(v) => setWide(v)} onSave={(name, svg) => post({ type: "saveFile", name, text: svg })} />)
              : <Markdown key={k} text={part.value.replace(/^\s*-{3,}\s*$/m, "")} streaming={m.live} />)}
              {did && <div className="buddy-did">{did.map((d, j) => <motion.button type="button" key={j} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={d.ok ? "is-ok" : "is-bad"} title={d.message} onClick={() => d.run && post({ type: "buddyOpen", run: d.run })}>{d.ok ? <Check size={11} /> : <X size={11} />} {d.ok ? d.message : `${d.label}: ${d.message}`}</motion.button>)}</div>}
              {p && <button type="button" className="buddy-point" onClick={() => post({ type: "buddyPoint", ...p, color: accentOf(prefs.color) })}><MousePointer2 size={11} /> Show me {p.label ? `“${p.label}”` : ""} again</button>}</> : m.text;
            return <motion.div key={`${i}-${m.who}`} layout="position" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={m.who === "spark" ? "spk-row" : "spk-row is-you"}>
              {m.who === "spark" && <span className="spk-mini"><SparkCharacter preferences={prefs} mood={m.live ? "speaking" : "idle"} size={22} /></span>}
              <div className={`buddy-msg is-${m.who} ${m.live ? "is-live" : ""}`}>{body}</div>
            </motion.div>; })}
          </AnimatePresence>
          {(busy || (working && messages.at(-1)?.who === "you")) && <motion.div className="spk-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><span className="spk-mini"><SparkCharacter preferences={prefs} mood="thinking" size={22} /></span><p className="buddy-typing spk-typing"><span /><span /><span /> {busy || "thinking"}</p></motion.div>}
          {convo && !working && !busy && lastQuestion && <button type="button" className="buddy-handoff" onClick={() => void perform({ type: "crew", ask: lastQuestion }).then((r) => r.run && (embedded ? window.shuacrew?.navigate(`/sessions/${r.run}`) : post({ type: "buddyOpen", run: r.run })))}><Send size={11} /> Hand this to the crew as a full session</button>}
        </div>
        {error && <p className="buddy-error">{error}</p>}
      </>}
      {task && <div className="buddy-task"><Hand size={14} /><span><b>Working on your Mac</b> step {task.step} · <kbd>Esc</kbd> stops</span>
        {pending && <><em>{describeAct(pending)}?</em><button type="button" onClick={() => void runAct(pending, task.step)}>Do it</button><button type="button" title="Don't ask again for this task" onClick={() => { setAutoTask(true); void runAct(pending, task.step); }}>All</button></>}
        <button type="button" className="buddy-task-stop" aria-label="Stop" onClick={() => stopTask("Stopped.")}><Square size={11} /></button></div>}
      {guide && <div className="buddy-guide"><Compass size={14} /><span><b>Step {guide.step}</b> {guide.label}</span>
        <button type="button" title={prefs.guide === "click" ? "Or just click the highlighted spot" : "Tell me when you've done it"} onClick={() => void advance()}>Done <ChevronRight size={12} /></button><button type="button" aria-label="Stop guiding" onClick={stopGuide}><X size={12} /></button></div>}
      <form className="buddy-input spk-input" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <button type="button" className={`buddy-see ${see ? "is-on" : ""}`} aria-pressed={see} title={see ? "I'll look at your screen when you ask (one screenshot, only then)" : "Screen off: I won't look"} onClick={() => setSee((v) => { const next = !v; try { localStorage.setItem(SEE, next ? "1" : "0"); } catch { /* ignore */ } return next; })}>{see ? <Eye size={15} /> : <EyeOff size={15} />}</button>
        <textarea ref={input} rows={1} value={draft} placeholder={prefs.conversation && phase === "listening" ? "Listening… or type" : see ? "Ask, or tell me to do something…" : "Ask me anything…"} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } if (e.key === "Escape") close(); }} aria-label="Message" />
        <button type="button" className={`buddy-talk ${prefs.conversation ? "is-on" : ""} is-${phase}`} aria-pressed={prefs.conversation} title={prefs.conversation ? "Conversation on: just talk. Click to stop listening." : "Talk hands-free: just speak, no buttons"} onClick={toggleTalk} style={{ "--lvl": level } as CSSProperties}><AudioLines size={15} /></button>
        <motion.button className="buddy-send" disabled={!!busy || !draft.trim()} aria-label="Send" whileTap={{ scale: 0.88 }}><ArrowUp size={16} /></motion.button>
      </form>
      {note && tab === "chat" && <p className="buddy-note" title={note}><StickyNote size={11} /> {note.split("\n")[0]}</p>}
    </section>;
  if (embedded) return <div className="buddy is-open is-embedded" style={sparkVars(prefs.color)}>{card}</div>;
  return <div className={`buddy ${open ? "is-open" : ""}`} style={sparkVars(prefs.color)}>
    <AnimatePresence>{open && <motion.div key="card" className="spk-pop" initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}>{card}</motion.div>}</AnimatePresence>
    {!open && guide && <div className="buddy-bubble is-guide"><span><Compass size={12} /> Step {guide.step}: {guide.label}</span>
      <div><button type="button" onClick={() => void advance()}>Done <ChevronRight size={11} /></button><button type="button" onClick={stopGuide}>Stop</button></div></div>}
    {!open && !guide && !bubble && morning && <button type="button" className="buddy-bubble is-morning" onClick={() => void playMorning()}>Your day in 20 seconds<small>Tap to hear it</small></button>}
    {!open && !guide && bubble && <button type="button" className="buddy-bubble" onClick={() => { post({ type: "buddyOpen", path: bubble.path }); setBubble(null); }}>{bubble.text}<small>Open in ShuaCrew</small></button>}
    {!open && !guide && !bubble && !morning && track.id && <button type="button" className="buddy-bubble" onClick={() => post({ type: "buddyOpen", path: `/sessions/${track.id}` })}>{track.title}<small>{track.who ? `${track.who} · ${track.label}` : track.label}</small></button>}
    <div className={`buddy-spark size-${prefs.size} ${working || busy ? "is-thinking" : ""} ${speaking ? "is-speaking" : ""}`} aria-hidden="true">
      {timer && <svg className="buddy-focus" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="46" className="fill" style={{ strokeDashoffset: `${289 * (1 - focusPct)}` }} /></svg>}
      <SparkCharacter preferences={prefs} mood={mood} /><i className="buddy-shadow" />
      {approvals > 0 && <em className="buddy-badge">{approvals}</em>}
    </div>
  </div>;
}
