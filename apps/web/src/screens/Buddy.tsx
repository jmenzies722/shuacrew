import { Teaching } from "./Teaching";
import "../components/chat-composer.css";
import { useTeaching, pausePractice } from "../lib/teaching";
import { CompanionModelPicker, modelPreference } from "../components/CompanionModelPicker";
import { setSparkFull, takeSparkSuggestion, watchSparkSuggestion } from "../lib/spark-panel";
import { logSense } from "../lib/spark-log";
import { asksAboutEarlier, recall } from "../lib/screen-memory";
import { earlierToday, rememberAsk } from "../lib/spark-day";
import { eveningRecap, localDay, morningBrief, shouldBrief, shouldRecap } from "../lib/morning";
import { accentOf, sparkVars } from "../lib/spark-color";
import { getRadio, loadRadio, radioCommand, radioNow, type RadioNow } from "../lib/radio";
import { NotchCaption, Rolling } from "../components/NotchCaption";
import { Recommendations } from "../components/Recommendations";
import { locate } from "../lib/snap";
import { STUCK_START, muteStuck, stuckSignal, type StuckOffer } from "../lib/stuck";
import { selectIntelligence, turnDisposition, type IntelligenceChoice, type IntelligenceRequest } from "../lib/intelligence";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, Trash2, Bell, CalendarClock, Sparkles, AlarmClock, Timer, BookOpen, AudioLines, Globe, SlidersHorizontal, Check, ChevronRight, Compass, Eye, EyeOff, Hand, LayoutGrid, Maximize2, MessageCircle, Mic, MicOff, Minimize2, MousePointer2, RotateCcw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { api, cancelRun, followUp } from "../lib/api";
import { useLive } from "../lib/live";
import { isTopLevelWork } from "../lib/crew";
import { conversation } from "../lib/conversation";
import { addMission, missionTask, nextMove, readMissions, summary as gist, writeMissions, type Mission } from "../lib/missions";
import { upload, withAttachments } from "../lib/attachments";
import { aboutScreen, deleteQuestion, isDestructive, actFollowUp, liveLookup, progressLine, buddyPrompt, claimsWithoutAction, engineLine, parseNext, looksForAnswer, turnTier, localAsk, localSystem, shuacrewNow, completedBlocks, elementsText, describeAct, describeAction, guideFollowUp, parseAct, type Act, type ScreenContext, isDesign, nextSentences, parseActions, parseDraw, parseGuide, parsePoint, screenText, speakable, splitDiagrams, type GuideStep, type ScreenLine } from "../lib/buddy";
import { Diagram } from "../components/Diagram";
import { getBuddyVoice, saveBuddyVoice, SpeechQueue, useBuddyVoice, type CaptionLine } from "../lib/buddy-voice";
import { remainingFocusMs, useFocusTimer } from "../lib/focus-timer";
import { getCompanion, parseCompanion, saveCompanion, useCompanion } from "../lib/companion";
import { echoOf, HandsFree, wakeOnly, yesOrNo, type Phase } from "../lib/handsfree";
import { SparkCharacter } from "../components/SparkCharacter";
import { Markdown } from "../components/Markdown";
import { SparkWidgets } from "../components/TopBarWidgets";
import { useNowPlaying } from "../components/NowPlaying";
import { crewNowBlock, producerMove, studioAnswer, todaysSet } from "../lib/studio";
import { useLook } from "../lib/look";
import "../components/companion.css";
import "./buddy.css";

/** Mac actions whose result Spark says out loud when it lands (you'd otherwise have to go and check). */
const CONFIRM_OPS = new Set(["add_reminder", "calendar_add", "complete_reminder", "delete_reminder", "delete_reminders", "complete_reminders", "delete_event", "delete_note", "notes_new", "new_folder"]);
import "../alive.css"; // the desktop Spark loads without the app shell: same accent gradient and logo tokens
import { ctx, capture, claim, fitShape, KEY, macContext, mine, playingContext, SEE, native, post, readSee, screenFacts, screenSize, webAct } from "./spark/bridge";
import { ISLAND_FLARE, perform, sparkHooks, type Done } from "./spark/actions";
import { chime, TimeLeft, MicBars, MiniCard, setMicLevel, ThinkWave, useMicLevelVar, VoiceBars } from "./spark/parts";
import { isInstant, runInstant } from "./spark/commands";
import { LiveActivities } from "./spark/LiveActivities";
import { VisualCard } from "./spark/Visual";
import { due, getTimers, remaining, ringLine, setTimers, useTimers } from "../lib/timers";
import { parseVisual, type Visual } from "../lib/visual";
import { announcements, inMeeting, welcomeBack, type Agenda } from "../lib/proactive";

/**
 * Spark. On the desktop it's the floating panel; inside the app (`embedded`) it's the side panel — the same
 * conversation in both places, kept in sync.
 */
export function Buddy({ embedded = false, full = false, onClose }: { embedded?: boolean; full?: boolean; onClose?: () => void } = {}) {
  const lesson = useTeaching().document, practicing = !!lesson?.practice.active;
  const prefs = useCompanion(), voice = useBuddyVoice(), track = useNowPlaying(), { sounds } = useLook();
  // Load Spark's voice as soon as it's on screen, so the first spoken reply starts in a blink instead of after a
  // ~10s cold model load. Re-warms when you switch voices; the gateway keeps it loaded for a while after.
  useEffect(() => {
    if (!voice.on) return;
    const abort = new AbortController();
    void fetch("/api/speech/warm", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: voice.id, warmMinutes: 10 }), signal: abort.signal }).catch(() => {});
    return () => abort.abort();
  }, [voice.on, voice.id]);
  const [openState, setOpen] = useState(false), open = embedded || openState, [tab, setTab] = useState<"chat" | "widgets" | "teach">("chat"), [draft, setDraft] = useState(""), [see, setSee] = useState(readSee);
  const [brief, setBrief] = useState<{ q: string; a: string } | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [speaking, setSpeaking] = useState(false);
  const [done, setDone] = useState<Record<string, Done[]>>({});
  const corrected = useRef(new Set<string>()); // replies whose failed action Spark already owned up to
  // What's actually installed, told to Spark once per conversation (cached with its rules), so it never offers an app you don't have.
  const installed = useRef("");
  useEffect(() => { void api<{ apps: string[] }>("/api/system/apps").then((r) => { installed.current = r.apps.join(", "); }).catch(() => {}); }, []);
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
  const optionsPanel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (optionsPanel.current && !optionsPanel.current.contains(event.target as Node)) optionsPanel.current.open = false; };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
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
  useEffect(() => {
    if (!embedded) return;
    const receive = () => {
      const suggestion = takeSparkSuggestion();
      if (!suggestion) return;
      setDraft((current) => current.trim() ? `${current}\n\n${suggestion}` : suggestion);
      setTab("chat");
      input.current?.focus();
    };
    receive();
    return watchSparkSuggestion(receive);
  }, [embedded]);
  // Open-mic conversation.
  const [phase, setPhase] = useState<Phase>("off"), talkBtn = useRef<HTMLButtonElement>(null);
  // fn held (push-to-talk): the notch shows it is ready the instant the key goes down; `fnSent` keeps the working
  // state on screen from letting go until Spark's first word.
  const [fnHeld, setFnHeld] = useState(false), [fnSent, setFnSent] = useState(false);
  useMicLevelVar(talkBtn); // the talk button pulses with your voice without re-rendering Spark
  // A command waiting for your yes.
  /** Your last spoken turn: stays in the notch, shimmering, until Spark starts answering — so you can see it heard you. */
  const [lastHeard, setLastHeard] = useState("");
  const [asking, setAsking] = useState<{ kind: "run" | "delete"; command: string; why: string; yes?: string; answer: (yes: boolean) => void } | null>(null);
  const askingRef = useRef(asking); askingRef.current = asking;
  useEffect(() => {
    sparkHooks.confirmRun = (command, why) => new Promise<boolean>((resolve) => setAsking({ kind: "run", command, why, answer: (yes) => { setAsking(null); resolve(yes); } }));
    // A delete asks in the chat, drops down from the notch, and says it out loud — answer by tap or by voice.
    sparkHooks.confirmDelete = (what) => new Promise<boolean>((resolve) => {
      // The button says what happens: Delete, Send, Call, Empty.
      const verb = what.split(" ")[0] ?? "Delete", why = verb === "Send" ? "it goes right away" : verb === "Call" ? "starts the call" : "can't be undone";
      setAsking({ kind: "delete", command: what, why, yes: verb, answer: (yes) => { setAsking(null); resolve(yes); } });
      speech.current.say(`${what}? Say yes or no.`);
    });
    sparkHooks.onRanOutput = (command, ok, output) => {
      const run = convoRef.current?.run; if (!run || !output.trim()) return;
      void followUp(run, `[ran] \`${command}\` ${ok ? "succeeded" : "failed"}. Output:\n\`\`\`\n${output.slice(-3000)}\n\`\`\`\nTell me in a sentence or two what this means (no need to repeat it all).`).catch(() => {});
    };
    // Mail results go back to Spark to sum up; the raw list stays out of the chat.
    sparkHooks.onMailOutput = (what, output) => {
      const run = convoRef.current?.run; if (!run) return;
      void followUp(run, `[mail] ${what}:\n\n[screen]\n${output.slice(0, 6000)}\n\nSay the gist in one or two spoken sentences (who and what matters), not the whole list. Offer a next step if there's an obvious one.`).catch(() => {});
    };
    // What Spark looked up on your Mac goes back to it to answer from, with the specifics; raw lists stay out of the chat.
    sparkHooks.onMacOutput = (what, output) => {
      const run = convoRef.current?.run; if (!run) return;
      void followUp(run, `[mac] ${what}:\n\n[screen]\n${output.slice(0, 9000)}\n\nAnswer their question from this with the specifics (names, dates, times, where the file is), in a few spoken sentences. If a file looks like the one they meant, offer to open or read it. Don't list everything.`).catch(() => {});
    };
    return () => { sparkHooks.confirmRun = null; sparkHooks.onRanOutput = null; sparkHooks.onMailOutput = null; sparkHooks.onMacOutput = null; };
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
  // fn (Globe) key: a small card beside your pointer instead of the full chat — tap to show/hide, hold to talk.
  const [mini, setMini] = useState(false);
  // Notch mode: hover the pill and it opens into the nook (quick ask, now playing, crew, missions); it tucks away when you leave.
  const [nook, setNook] = useState(false), [nookDraft, setNookDraft] = useState(""), nookTimer = useRef<ReturnType<typeof setTimeout>>(undefined), nookFocus = useRef(false);
  // The notch island's geometry (from the Mac app: the camera housing's real size) and the open body's measured height.
  const [notchGeo, setNotchGeo] = useState<{ w: number; h: number; real: boolean }>({ w: 200, h: 32, real: false });
  const [islandDrop, setIslandDrop] = useState(250), islandBody = useRef<HTMLDivElement>(null);
  // What's really playing: the player lives in the main app window, so ask it (via the gateway) rather than this page's copy.
  const [radio, setRadio] = useState<RadioNow>({ playing: false, title: null, station: null });
  useEffect(() => { const tick = () => void radioNow().then((r) => setRadio((cur) => (JSON.stringify(cur) === JSON.stringify(r) ? cur : r))); tick(); const t = setInterval(tick, 5000); return () => clearInterval(t); }, []);
  // Inside the app, the mic is only live while the app window is in front (the desktop panel covers the rest).
  const [focused, setFocused] = useState(() => typeof document !== "undefined" && document.hasFocus());
  // A live mic never starts just because the app opened: inside the app it waits until you engage the panel this session.
  const [armed, setArmed] = useState(!embedded);
  useEffect(() => { const f = () => setFocused(true), b = () => setFocused(false); window.addEventListener("focus", f); window.addEventListener("blur", b); return () => { window.removeEventListener("focus", f); window.removeEventListener("blur", b); }; }, []);
  const mic = useRef<HandsFree>(null as unknown as HandsFree); mic.current ??= new HandsFree();
  const wakeTurn = useRef(false); // "Hey Spark" opened the mic for one request
  const limited = useLive((s) => s.crew.limited);
  const [choice, setChoice] = useState<IntelligenceChoice | null>(null);
  const [choiceError, setChoiceError] = useState("");
  const [convo, setConvo] = useState<{ run: string; first: string; runtime?: string; model?: string } | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } });
  const localPersona = { name: prefs.nickname || "Spark", tone: prefs.tone, length: prefs.length, memory: memory.facts, goal: memory.goal };
  const localSys = localSystem(localPersona);
  const input = useRef<HTMLTextAreaElement>(null), thread = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  // Scrolled up while new words arrive: a "Latest" button brings you back.
  const [behind, setBehind] = useState(false);
  const convoRef = useRef(convo); convoRef.current = convo;
  const speech = useRef<SpeechQueue>(null as unknown as SpeechQueue); speech.current ??= new SpeechQueue();
  // Answers already on screen when the panel loaded were handled before; only new ones point, act and speak.
  const handled = useRef<number | null>(null), spokenUpto = useRef(0), streamId = useRef("");
  const crew = useLive((s) => s.crew), loadRun = useLive((s) => s.loadRun);
  const events = useLive((s) => (convo ? s.runEvents[convo.run] : undefined)), status = convo ? crew.runs[convo.run]?.status : undefined;
  // How full this conversation is (the newest turn's report): past the limit, the next turn starts fresh with a recap.
  const contextUsed = useMemo(() => { for (let i = (events?.length ?? 0) - 1; i >= 0; i--) { const e = events![i]!; if (e.kind === "usage.recorded") return Number((e.body as { contextUsed?: number }).contextUsed) || 0; } return 0; }, [events]);
  const recorded = convo ? crew.runs[convo.run] : undefined;
  const actualRuntime = recorded?.runtime ?? convo?.runtime;
  const actualModel = recorded?.model ?? convo?.model;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const refresh = () => void selectIntelligence({ ask: "Spark availability", mode: prefs.brain, ...modelPreference(prefs.modelChoice), localModel: prefs.localModel, purpose: "conversation", images: false, tier: "fast" })
      .then(next => { if (alive) { setChoice(next); setChoiceError(""); } }).catch((e: Error) => { if (alive) setChoiceError(e.message); });
    refresh(); const timer = setInterval(refresh, 30_000); window.addEventListener("focus", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [open, prefs.brain, prefs.modelChoice, prefs.localModel, limited]);
  const timer = useFocusTimer(), [now, setNow] = useState(Date.now());
  // Focus shows minutes, so a 10 s tick is plenty (a 1 s tick re-rendered all of Spark every second).
  useEffect(() => { if (!timer) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(t); }, [timer]);
  const [caption, setCaption] = useState<CaptionLine | null>(null);
  // Voice mode, straight from the notch: a live spoken conversation with the chat closed. Never remembered across launches.
  const [voiceLive, setVoiceLive] = useState(false);
  // Noticing you're stuck (see lib/stuck): glances while live watching is on; one gentle offer, then quiet.
  const [stuck, setStuck] = useState<StuckOffer | null>(null), stuckState = useRef(STUCK_START), quiet = useRef(false);
  // What Music or Spotify is playing, for the notch (asked of the Mac app; faster while the island is open).
  const [media, setMedia] = useState<{ app: string; playing: boolean; title: string; artist: string; position: number; duration: number; art: string } | null>(null);
  /**
   * Teach-with-drawing: each drawing in a reply waits for Spark's next spoken sentence, then joins what's already on
   * screen, so the picture builds up as it explains. With the voice off (or a slow voice) they appear straight away.
   */
  const drawing = useRef<{ key: string; shapes: ReturnType<typeof parseDraw>; queue: ReturnType<typeof parseDraw>[]; timer?: ReturnType<typeof setTimeout> }>({ key: "", shapes: [], queue: [] });
  const releaseDraw = () => {
    const d = drawing.current, next = d.queue.shift(); if (!next) return;
    d.shapes = [...d.shapes, ...next].slice(-12);
    post({ type: "buddyDraw", shapes: d.shapes, color: accentOf(prefsRef.current.color) });
    clearTimeout(d.timer); if (d.queue.length) d.timer = setTimeout(releaseDraw, 4000);
  };
  const queueDraw = (key: string, shapes: ReturnType<typeof parseDraw>) => {
    const d = drawing.current;
    if (d.key !== key) { clearTimeout(d.timer); drawing.current = { key, shapes: [], queue: [] }; }
    drawing.current.queue.push(shapes);
    if (!getBuddyVoice().on) { releaseDraw(); return; }
    clearTimeout(drawing.current.timer); drawing.current.timer = setTimeout(releaseDraw, 4000); // never stuck waiting
  };
  useEffect(() => { speech.current.onSpeaking = (on) => { setSpeaking(on); mic.current.speaking = on; post({ type: "buddySpeaking", on }); /* what it points at stays while it explains */ if (!on) while (drawing.current.queue.length) releaseDraw(); }; speech.current.onCaption = (c) => { setCaption(c); if (c) releaseDraw(); }; }, []);
  useEffect(() => {
    const on = (e: Event) => setHands((e as CustomEvent<{ trusted: boolean; shortcuts: string[] }>).detail);
    window.addEventListener("shuacrew:hands", on); post({ type: "buddyHands" });
    void api<{ voices?: Array<{ id: string }> }>("/api/speech/status").then((s) => setVoices((s.voices ?? []).map((v) => v.id))).catch(() => {});
    return () => window.removeEventListener("shuacrew:hands", on);
  }, []);
  useEffect(() => { if (convo) void loadRun(convo.run); }, [convo, loadRun]);
  // The native panel sizes itself to what's showing, so the clear rest never blocks your clicks.
  useEffect(() => { if (!embedded) post({ type: "buddyExpand", open, mini: mini && !open, nook: nook && !open && prefs.desktopPlacement === "notch", wide: open && wide, peek: !open && (practicing || !!bubble || !!guide || morning || evening || !!track.id), size: prefs.size, desktopPlacement: prefs.desktopPlacement }); if (open) setTimeout(() => input.current?.focus(), 60); }, [open, mini, nook, bubble, guide, prefs.size, prefs.desktopPlacement, wide, embedded, morning, evening, track.id, practicing]);
  // The quick card tucks itself away after a quiet stretch (never mid-talk or mid-guide); opening the chat replaces it.
  useEffect(() => { if (open) setMini(false); }, [open]);
  // One conversation in two places: the desktop panel and the app's side panel follow each other.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key !== KEY) return; try { const next = JSON.parse(e.newValue ?? "null"); handled.current = null; setConvo(next); } catch { /* ignore */ } };
    window.addEventListener("storage", on); return () => window.removeEventListener("storage", on);
  }, []);
  useEffect(() => {
    if (embedded) return;
    (window as unknown as { buddy: unknown }).buddy = { perform, toggle: () => { speech.current.unlock(); setOpen((o) => !o); }, focus: () => { speech.current.unlock(); setOpen(true); setTimeout(() => input.current?.focus(), 80); },
      ask: (text: string) => { speech.current.unlock(); setOpen(true); setTab("chat"); setArmed(true); if (text.trim()) void askRef.current(text.trim().slice(0, 4000)); },
      nook: (inside: boolean) => nookHover.current(inside),
      // Speak without opening anything, sentence by sentence (captions, voice checks, the Settings preview).
      say: (text: string) => { speech.current.unlock(); for (const s of text.split(/(?<=[.!?])\s+/)) speech.current.say(s); },
      notch: (g: { w: number; h: number; real: boolean }) => setNotchGeo((cur) => (cur.w === g.w && cur.h === g.h && cur.real === g.real ? cur : g)),
      // From the Mac app's fn key: "tap" shows or hides the quick card; "hold" talks until "release". "down" comes the
      // instant fn is pressed (the mic opens then, so your first words are kept); "cancel" = fn was a modifier after all.
      fn: (kind: "down" | "cancel" | "tap" | "hold" | "release") => {
        if (kind === "down") { const m = mic.current; if (!m.active || m.mode === "hold") { m.mode = "hold"; void m.warm(); } return; }
        if (kind === "cancel") { mic.current.cool(); return; }
        if (kind === "tap") { mic.current.cool(); setMini((m) => !m); return; }
        if (kind === "hold") { setFnHeld(true); setFnSent(false); setMini(true); setArmed(true); speech.current.unlock(); speech.current.stop(); const m = mic.current; m.mode = "hold"; void m.press(); return; }
        setFnHeld(false); setFnSent(true); mic.current.release();
      } };
    post({ type: "buddyReady" });
  }, []);

  const messages = useMemo(() => {
    const out: Array<{ who: "you" | "spark"; text: string; live?: boolean; id?: number }> = convo ? [{ who: "you", text: convo.first }] : [];
    let streaming = "";
    for (const e of (events ?? []) as AnyEvent[]) {
      // Spark's own step reports ([guide]/[act]) are bookkeeping, not something you said: keep them out of the chat.
      if (e.kind === "run.followup" && /^\[(guide|act|mail)\]/.test((e.body as { text: string }).text.replace(/^<spark-system>\n[\s\S]*?\n<\/spark-system>\n?/, ""))) { streaming = ""; continue; }
      if (e.kind === "run.followup") { out.push({ who: "you", text: (e.body as { text: string }).text.replace(/^<spark-system>\n[\s\S]*?\n<\/spark-system>\n?/, "").split("\n\n[screen]")[0]!.split("\n\n[attachments]")[0]!.split("\n\n[app]")[0]! }); streaming = ""; }
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
  const confirmed = useRef(new Set<string>());
  // A visual card: the notch drops open with it (animated) while Spark talks it through, then tucks away on its own.
  const [visual, setVisual] = useState<Visual | null>(null), visualTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showVisual = (v: Visual) => {
    setVisual(v); clearTimeout(visualTimer.current);
    if (!open && prefs.desktopPlacement === "notch") setNook(true);
    visualTimer.current = setTimeout(() => { setVisual(null); if (!nookFocus.current) setNook(false); }, 25_000);
  };
  const looked = useRef(new Set<string>()), recheck = useRef(new Set<string>());
  const runBlocks = (text: string, key: string, final: boolean) => {
    const seen = ran.current.get(key) ?? new Set<string>(); ran.current.set(key, seen);
    if (ran.current.size > 40) ran.current.delete(ran.current.keys().next().value!);
    for (const b of completedBlocks(text, screenSize())) {
      if (seen.has(b.key) || (b.kind === "act" && !final)) continue;
      seen.add(b.key);
      if (b.kind === "point") { const p = parsePoint(b.raw); if (p) { const r = locate({ x: p.x, y: p.y, w: 0.03, h: 0.03, label: p.label, target: p.target }, screenFacts()); post({ type: "buddyPoint", ...p, x: r.x, y: r.y, color: accentOf(prefs.color) }); } }
      else if (b.kind === "visual") { const v = parseVisual(b.raw); if (v) showVisual(v); }
      else if (b.kind === "draw") { const shapes = parseDraw(b.raw).map(fitShape); if (shapes.length) queueDraw(key, shapes); }
      else if (b.kind === "guide") {
        const g = parseGuide(b.raw);
        if (g?.done) { setGuide(null); post({ type: "buddyGuideStop" }); setCheer(true); setTimeout(() => setCheer(false), 2400); }
        else if (g) void (async () => {
          // In Chrome the page reports the element's exact box; elsewhere, snap to the real control.
          const w = g.label ? await webAct("locate", g.label) : null;
          const r = w?.rect ? { ...w.rect, shape: (/^(button|a|link|tab|summary)$/.test(w.role ?? "") ? "pill" : "rounded") as "pill" | "rounded", exact: true } : locate(g, screenFacts());
          const exact = { ...g, x: r.x, y: r.y, w: r.w, h: r.h, shape: r.shape, exact: r.exact }; setGuide(exact); post({ type: "buddyGuide", ...exact, color: accentOf(prefs.color), wait: prefs.guide === "click" });
        })();
      } else if (b.kind === "act") {
        const act = parseAct(b.raw);
        if (act?.type === "done") { stopTask(); setCheer(true); setTimeout(() => setCheer(false), 2400); }
        else if (act && prefs.control !== "off") {
          const step = (taskRef.current?.step ?? 0) + 1, same = describeAct(act);
          // As long as it takes — but the same move three times in a row means it's stuck: stop and ask, don't loop.
          recentActs.current = [...recentActs.current.slice(-2), same];
          if (recentActs.current.length === 3 && recentActs.current.every((x) => x === same)) { recentActs.current = []; stopTask(`I tried “${same}” three times and it isn't working. Tell me what to try, or take over.`); }
          else { setTask({ step }); actKey.current = key; if (prefs.control === "auto" || autoTask) void runActRef.current(act, step); else setPending(act); }
        }
      } else if (b.kind === "do") {
        const actions = parseActions(b.raw);
        void (async () => {
          let opened = "";
          const failed: string[] = [];
          const results: Array<{ ok: boolean; message: string }> = [];
          // Every delete in this reply: ONE question ("Delete 30 reminders …?"), then they all go — never one prompt each.
          const deletes = actions.filter(isDestructive);
          const approved = deletes.length > 1 && sparkHooks.confirmDelete ? await sparkHooks.confirmDelete(deleteQuestion(deletes)) : null;
          for (const a of actions) {
            if (approved === false && isDestructive(a)) { results.push({ ok: true, message: "Kept it" }); continue; }
            const r = await perform(a, { confirmed: approved === true }); results.push(r); setDone((d) => ({ ...d, [key]: [...(d[key] ?? []), { label: describeAction(a), ...r }] })); if (!r.ok) failed.push(r.message); if (r.ok && (a.type === "open_url" || a.type === "open_app")) opened = a.type === "open_url" ? a.url : a.name; }
          // It already said "Opening X": if that didn't happen (no such app, a blocked step), say so out loud right away,
          // so a failure never passes as done. Once per reply.
          // Done is said, not just shown: the real result, in a few words ("Added “Launch” on Thu 1 Oct, 11:10 AM"),
          // for the things you'd otherwise have to go and check. Voice conversations only; once per reply.
          const confirm = actions.map((a, i) => ({ a, r: results[i] })).filter(({ a, r }) => r?.ok && ((a.type === "mac" && CONFIRM_OPS.has(a.op)) || (a.type === "media" && (a.command === "play_query" || a.command === "play_similar" || a.command === "playlist")))).map(({ r }) => r!.message.replace(/[.\s]+$/, ""));
          if (confirm.length && !failed.length && (voiceLive || (prefs.conversation && prefs.listen !== "hold")) && !confirmed.current.has(key)) {
            confirmed.current.add(key);
            sayOwn(`Done. ${confirm.slice(0, 2).join(". ")}.`);
          }
          if (failed.length && !corrected.current.has(key)) {
            corrected.current.add(key);
            speech.current.say(`Actually, that didn't work: ${failed[0]!.replace(/[.\s]+$/, "")}.`);
          }
          // Opened something to answer a question (weather, a score, a price)? Look at what opened and give the specifics.
          const q = [...messages].reverse().find((m) => m.who === "you")?.text.split("\n\n[screen]")[0] ?? "";
          if (final && opened && looksForAnswer(q) && !looked.current.has(key)) {
            looked.current.add(key);
            setTimeout(() => void askRef.current(`What does it say?\n\n[screen] You just opened ${opened} to answer: “${q.slice(0, 300)}”. A fresh screenshot is attached. Read it and answer with the specifics (numbers, names, times, conditions) in two or three spoken sentences. Don't open anything else unless they ask.`, { look: true }), 3200);
          }
        })();
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
    // "Switched it" with nothing done: don't let the claim stand. Stop saying it and send Spark straight back to do it
    // (or say plainly it can't) — once per turn.
    if (convo && claimsWithoutAction(last.text) && !recheck.current.has(convo.run + ":" + last.id)) {
      recheck.current.add(convo.run + ":" + last.id);
      speech.current.stop(); streamId.current = ""; spokenUpto.current = 0;
      void followUp(convo.run, "[check] Your last reply said you did or are doing something, but it had no block, so NOTHING happened. Do it now with the right block (do / act / settings / guide) in this reply, or say plainly that you can't and what you can do instead. Don't apologise at length.").catch(() => {});
      return;
    }
    const rest = nextSentences(last.text, streamId.current === key ? spokenUpto.current : 0, true);
    rest.chunks.forEach((c) => speech.current.say(c)); streamId.current = ""; spokenUpto.current = 0;
    runBlocksRef.current(last.text, key, true);
  }, [messages, events, convo]);
  useEffect(() => {
    if (!open || tab !== "chat") return;
    followBottom.current = true;
    const el = thread.current;
    if (!el) return;
    // With no messages yet, the welcome reads from the top; once there's a conversation, stay on the newest.
    const follow = () => { if (followBottom.current && el.querySelector(".spk-row")) el.scrollTop = el.scrollHeight; };
    const frame = requestAnimationFrame(follow);
    const resize = new ResizeObserver(follow);
    resize.observe(el);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); };
  }, [open, tab]);
  useEffect(() => {
    if (!messages.length) return; // the welcome reads from the top
    if (followBottom.current && thread.current) thread.current.scrollTop = thread.current.scrollHeight;
    else if (thread.current) setBehind(true);
  }, [messages.length, messages.at(-1)?.text.length]);

  // Connected to the app: when your crew finishes, fails or needs you, Spark says so beside itself.
  const seen = useRef<Record<string, string> | null>(null);
  const approvals = Object.keys(crew.approvals).length;
  // Speaking first (Jarvis): every minute Spark asks the Mac what's coming up — a heads-up before a meeting, a reminder
  // the moment it's due — and when you come back after a while, a short catch-up. In a meeting it only shows, never
  // talks. One Spark surface says it, once (said keys are shared across surfaces and reloads).
  const [heads, setHeads] = useState<{ text: string; kind: "event" | "reminder" | "welcome" | "timer" } | null>(null);
  const agenda = useRef<Agenda | null>(null);
  const announce = (text: string, kind: "event" | "reminder" | "welcome" | "timer") => {
    setHeads({ text, kind }); setTimeout(() => setHeads((h) => (h?.text === text ? null : h)), 15_000);
    if (prefs.desktopPlacement !== "notch") setBubble({ text, path: kind === "welcome" ? "/" : "/today" });
    feel("happy");
    if (!inMeeting(agenda.current, Date.now()) && !timer) { lastSound.current = Date.now(); speech.current.say(text); }
  };
  const announceRef = useRef(announce); announceRef.current = announce;
  // Timers and alarms ring here (the desktop Spark, once): a chime, the line out loud, a Mac notification, the notch.
  const timers = useTimers();
  useEffect(() => {
    if (embedded) return;
    const tick = setInterval(() => {
      const { rang, left } = due(getTimers(), Date.now()); if (!rang.length || !mine()) return;
      setTimers(left);
      chime(rang.some((t) => t.kind === "alarm") ? 4 : 2);
      const text = rang.map(ringLine).join(" ");
      setHeads({ text, kind: "timer" }); setTimeout(() => setHeads((h) => (h?.text === text ? null : h)), 30_000);
      post({ type: "notify", title: rang.length === 1 ? (rang[0]!.kind === "alarm" ? "Alarm" : "Timer done") : `${rang.length} timers done`, body: text });
      setTimeout(() => { lastSound.current = Date.now(); speech.current.say(text); }, 900); // after the chime
    }, 500);
    return () => clearInterval(tick);
  }, [embedded]);
  const nextTimer = useMemo(() => [...timers].filter((t) => t.paused === undefined).sort((a, b) => a.endsAt - b.endsAt)[0], [timers]);
  useEffect(() => {
    if (embedded || !prefs.proactive || !native()) return;
    const SAID = "shuacrew.spark.said";
    const onAgenda = (e: Event) => {
      const a = (e as CustomEvent).detail as Agenda | undefined; if (!a?.events) return;
      agenda.current = a;
      let said: string[] = []; try { said = JSON.parse(localStorage.getItem(SAID) ?? "[]"); } catch { /* fresh */ }
      const due = announcements(a, Date.now(), new Set(said), prefs.headsUpMinutes);
      if (!due.length || !mine()) return;
      try { localStorage.setItem(SAID, JSON.stringify([...said, ...due.map((d) => d.key)].slice(-200))); } catch { /* ignore */ }
      announceRef.current(due.map((d) => d.text).join(" "), due[0]!.kind);
    };
    const onWelcome = (e: Event) => {
      const awayMs = Number((e as CustomEvent).detail?.awayMs) || 0, now = Date.now(), live = useLive.getState().crew;
      const finished = Object.values(live.runs).filter((r) => (r.status === "done" || r.status === "merged") && r.updatedAt > now - awayMs && !r.labels?.includes("buddy"))
        .map((r) => `${(r.member && live.members[r.member]?.name) || "The crew"} finished ${r.title}`);
      post({ type: "buddyAgenda" }); // fresh "next up"
      setTimeout(() => { const text = welcomeBack({ awayMs, now, finished, approvals: Object.keys(live.approvals).length, agenda: agenda.current }); if (text && mine()) announceRef.current(text, "welcome"); }, 1200);
    };
    window.addEventListener("shuacrew:agenda", onAgenda); window.addEventListener("shuacrew:welcome", onWelcome);
    post({ type: "buddyAgenda" });
    const every = setInterval(() => post({ type: "buddyAgenda" }), 60_000);
    return () => { clearInterval(every); window.removeEventListener("shuacrew:agenda", onAgenda); window.removeEventListener("shuacrew:welcome", onWelcome); };
  }, [embedded, prefs.proactive, prefs.headsUpMinutes]);
  useEffect(() => {
    const work = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && !r.labels?.includes("mission"));
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

  // Missions: Spark stays with work it handed off. When the crew stops early (a question it could answer
  // itself, or a failure) Spark tells it to keep going, a few rounds at most; a finish or a needed OK is
  // said out loud. Only the desktop Spark acts, so nothing is sent twice.
  const [missions, setMissions] = useState<Mission[]>(readMissions);
  useEffect(() => { const on = () => setMissions(readMissions()); window.addEventListener("shuacrew:missions", on); window.addEventListener("storage", on); return () => { window.removeEventListener("shuacrew:missions", on); window.removeEventListener("storage", on); }; }, []);
  const minding = useRef(new Set<string>());
  useEffect(() => {
    if (embedded) return;
    // Missions started elsewhere (Spark for Chrome) are Spark's to mind as well.
    const known = new Set(readMissions().map((m) => m.run));
    for (const r of Object.values(crew.runs)) if (r.labels?.includes("mission") && !known.has(r.id) && !["done", "merged", "failed", "cancelled"].includes(r.status)) addMission(r.id, r.title);
    for (const m of readMissions()) {
      const run = crew.runs[m.run];
      if (m.done || !run || run.status === m.status || minding.current.has(m.run)) continue;
      minding.current.add(m.run);
      void (async () => {
        try {
          let lastText = "";
          if (["done", "merged", "failed"].includes(run.status)) {
            await useLive.getState().loadRun(m.run).catch(() => undefined);
            const items = conversation((useLive.getState().runEvents[m.run] ?? []) as AnyEvent[]);
            const last = [...items].reverse().find((i) => i.kind === "prose");
            lastText = last?.kind === "prose" ? last.text : "";
          }
          const title = run.title || m.task.slice(0, 60);
          const move = nextMove({ status: run.status, lastText, rounds: m.rounds, title });
          const update = (patch: Partial<Mission>) => writeMissions(readMissions().map((x) => (x.run === m.run ? { ...x, status: run.status, ...patch } : x)));
          if (move.kind === "wait") return update({});
          if (move.kind === "continue" && getCompanion().persist) {
            await followUp(m.run, move.message);
            update({ rounds: m.rounds + 1, status: "running" });
            setBubble({ text: move.say, path: `/sessions/${m.run}` }); speech.current.say(move.say);
            return;
          }
          if (move.kind === "needs-you") { feel("concerned"); update({}); setBubble({ text: move.say, path: `/sessions/${m.run}` }); speech.current.say(move.say); post({ type: "buddyRaise" }); return; }
          const say = move.kind === "report" ? move.say : `“${title}” stopped with a question. It needs you.`;
          const ok = move.kind === "report" && move.ok;
          feel(ok ? "happy" : "concerned");
          update({ done: true });
          setBubble({ text: say, path: `/sessions/${m.run}` }); speech.current.say(say); post({ type: "buddyRaise" });
        } catch { /* the next status change tries again */ } finally { minding.current.delete(m.run); }
      })();
    }
  }, [crew.runs, embedded]);
  const activeMissions = missions.filter((m) => !m.done && crew.runs[m.run]);
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
  const checkingGuide = useRef(false);
  const advance = async () => {
    const step = guide; if (!step || !convo || checkingGuide.current || working) return;
    checkingGuide.current = true;
    post({ type: "buddyGuideStop" }); setBusy("Looking at what changed…"); setError("");
    try {
      await new Promise((r) => setTimeout(r, 700)); // let the app you clicked finish drawing
      const shot = await capture(), att = await upload(shot.file);
      await followUp(convo.run, withAttachments(guideFollowUp(step.label, shot), [att]));
    } catch (e) { setError((e as Error).message); } finally { checkingGuide.current = false; setBusy(""); }
  };
  const advanceRef = useRef(advance); advanceRef.current = advance;
  // The step's spot was clicked, or you did anything else (clicked elsewhere, pressed Return, typed and paused): look again.
  useEffect(() => {
    const on = () => void advanceRef.current();
    window.addEventListener("shuacrew:guideClick", on); window.addEventListener("shuacrew:guideActivity", on);
    return () => { window.removeEventListener("shuacrew:guideClick", on); window.removeEventListener("shuacrew:guideActivity", on); };
  }, []);
  const MAX_STEPS = Infinity; // no step limit: it keeps going until done, or you press Stop / Esc
  const recentActs = useRef<string[]>([]);
  const stopTask = (why = "") => {
    setTask(null); setPending(null); setAutoTask(false); recentActs.current = []; post({ type: "buddyStopWatch" }); speech.current.stop();
    if (why) setError(why);
  };
  /** Do one step with the mouse or keyboard, then look again and ask for the next one. */
  const runAct = async (a: Act, step: number) => {
    if (!convo) return;
    setPending(null); setBusy(describeAct(a) + "…");
    try {
      // In Chrome, a named click happens on the page element itself (exact, even if the page scrolled); else the Mac clicks.
      const onPage = a.type === "click" && a.label && !("button" in a && a.button === "right") ? await webAct("click", a.label) : null;
      const r = onPage ? { ok: true, message: `Clicked “${onPage.name}” on the page` } : await perform({ ...a, color: accentOf(prefs.color) });
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
  /**
   * Stop whatever Spark is doing right now: its voice, a turn still getting ready (the generation counter makes any
   * pending screenshot/upload/model pick give up), and a turn the model is working on. Like ChatGPT's stop button.
   */
  const askGen = useRef(0);
  const interrupt = async () => {
    askGen.current++; speech.current.stop(); setBusy(""); if (taskRef.current) stopTask();
    if (convo && (status === "running" || status === "planning" || status === "queued")) await cancelRun(convo.run).catch(() => {});
  };
  const interruptRef = useRef(interrupt); interruptRef.current = interrupt;
  const ask = async (text = draft, opt: { look?: boolean } = {}) => {
    const q = text.trim(); if (!q) return;
    if (status === "awaiting_approval") { setError("Approve or decline the waiting step first."); return; }
    // Asking while Spark is still thinking or talking: stop that and take the new question (talk or type over it).
    if (busy || working) await interrupt();
    const gen = ++askGen.current, stale = () => gen !== askGen.current;
    setDraft(q);
    followBottom.current = true;
    claim();
    speech.current.unlock(); speech.current.stop();
    setError(""); setTab("chat");
    // "agent: …" (Clicky's "clicky agent"): hand it to the crew as a mission and stay with it.
    const mission = missionTask(q, prefs.nickname);
    if (mission) {
      const r = await perform({ type: "crew", ask: mission });
      const what = mission.length > 70 ? `${mission.slice(0, 67).replace(/\s+\S*$/, "")}…` : mission;
      const a = r.ok ? `The crew's taking “${what}”.${prefs.persist ? " I'll stay with it until it's done." : ""}` : `I couldn't start that: ${r.message}`;
      setBrief({ q, a }); speech.current.say(a); setDraft(""); return;
    }
    const move = producerMove(q);
    // Player commands are unambiguous: they run instantly, every time, mid-conversation or not — no model involved.
    if (move?.kind === "hush") { await interrupt(); stopTask(); if (guide) stopGuide(); setDraft(""); return; } // stop talking, the turn, any task or walkthrough
    // Voice mode by asking: from the notch it's the live voice session; elsewhere it's the open-mic conversation.
    if (move?.kind === "voice") {
      const notchVoice = prefs.desktopPlacement === "notch" && !embedded;
      const now = notchVoice ? voiceLive : prefs.conversation, next = move.on === "toggle" ? !now : move.on;
      setArmed(true); speech.current.unlock();
      if (notchVoice) setVoiceLive(next); else saveCompanion({ ...parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")), conversation: next });
      const a = next ? (now ? "Voice mode is already on. Just talk." : "Voice mode on. Just talk, I'm listening.") : (now ? "Voice mode off." : "Voice mode is already off.");
      setBrief({ q, a }); speech.current.say(a); setDraft(""); return;
    }
    // Instant commands (music, settings pages, folders, focus…) never wait for a model: see spark/commands.
    if (move && isInstant(move)) { await runInstant(move, (a) => { setBrief({ q, a }); speech.current.say(a); setDraft(""); }, { setRadio, soundsVolume: sounds.volume }); return; }
    if (move && !(convo && status && !["failed", "cancelled"].includes(status))) {
      const set = todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, Date.now());
      if (move.kind === "brief") {
        const a = studioAnswer({ track, set, waiting: Object.keys(crew.approvals).length, tokens: crew.today.tokens, costUsd: crew.today.costUsd });
        setBrief({ q, a }); speech.current.say(a); setDraft(""); return;
      }
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
    }
    const look = see || liveOn || !!opt.look;
    setBusy(see || opt.look ? "Reading your screen…" : isDesign(q) ? "Designing…" : "Thinking…");
    try {
      let atts: Awaited<ReturnType<typeof upload>>[] = [], screen: { width: number; height: number; text: ScreenLine[]; context?: ScreenContext } | null = null;
      const intelligence: IntelligenceRequest = { ask: q, mode: prefs.brain, ...modelPreference(prefs.modelChoice), localModel: prefs.localModel, purpose: "conversation", images: look, tier: turnTier(q, { screen: look, design: isDesign(q) }) };
      const [selected, mac, playing] = await Promise.all([selectIntelligence(intelligence), macContext(), playingContext(radioNow)]); const personal = [mac, playing].filter(Boolean).join("\n"); if (stale()) return; setChoice(selected); setChoiceError("");
      if (!selected.runtime) throw new Error(selected.reason);
      const brain = selected.runtime, wantLocal = brain === "local";
      const followSelected = (run: string, text: string) => api(`/api/runs/${run}/followup`, { body: { text, runtime: selected.runtime, model: selected.model, intelligence } });
      const disposition = turnDisposition(convo ? { runtime: actualRuntime, model: actualModel, status, contextUsed } : null, selected);
      if (disposition === "wait") throw new Error("This turn is still running. Wait or stop it before switching models.");
      // Only capable providers receive images. Local can use explicitly labeled screen text.
      const localNow = !selected.acceptsImages;
      if (look && (!localNow || aboutScreen(q) || opt.look)) { const shot = await capture(); if (stale()) return; if (!localNow) atts = [await upload(shot.file)]; if (stale()) return; screen = { width: shot.width, height: shot.height, text: shot.text, context: shot.context }; }
      const now = crewNowBlock(track, todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, Date.now()), Object.keys(crew.approvals).length);
      const rs = getRadio(); if (!rs.loaded) void loadRadio();
      const playingNow = await radioNow(); setRadio(playingNow);
      const remembered = asksAboutEarlier(q) ? await recall(q) : "";
      if (remembered) logSense("saw", "Checked your screen memory", q);
      const appNowBase = shuacrewNow({
        members: Object.values(crew.members).map((m) => ({ name: m.name, role: (m as { role?: string }).role })),
        ventures: Object.values(crew.ventures ?? {}).map((v) => (v as { name: string }).name),
        radio: { on: playingNow.playing ? playingNow.title ?? playingNow.station ?? "a station" : null, stations: [...rs.stations.filter((x) => x.tracks.length).map((x) => x.name), ...rs.youtube.map((x) => x.name)] },
      });
      const earlier = earlierToday(); rememberAsk(q);
      const language = prefs.language === "auto" ? "LANGUAGE: answer in the same language the user wrote or spoke (your voice can speak it)." : "";
      const rightNow = personal ? `\nRIGHT NOW ON THEIR MAC (use it when it helps: mention a meeting that's coming up, the file they just worked on, a heads-up; asked what's playing or about the song, answer straight from this — it's live; never recite it unprompted):\n${personal}` : "";
      const identity = `CURRENT COMPANION IDENTITY: Your name is ${prefs.nickname || "Spark"}. Tone: ${prefs.tone}. Answer length: ${prefs.length}.${prefs.personality ? ` User preferences for your personality: ${prefs.personality}` : ""}\n${engineLine(brain, selected.model, wantLocal && prefs.brain !== "local")}${rightNow}`;
      const appNow = [appNowBase, identity, remembered, earlier, language].filter(Boolean).join("\n\n");
      const recap = convo && disposition === "new"
        ? messages.slice(-6).map((m) => `${m.who === "you" ? "User" : "You"}: ${m.text.slice(0, 400)}`).join("\n") : "";
      const screenLines = screen?.text.length ? screenText(screen.text, 2500) : "";
      // Keep the live part tiny (it's what the local model must read fresh): earlier-today only when you refer back.
      const runningNow = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && (r.status === "running" || r.status === "planning")).length;
      const liveStatus = `radio ${playingNow.playing ? `playing ${playingNow.title ?? playingNow.station ?? "a station"}` : "off"} · ${runningNow} crew session${runningNow === 1 ? "" : "s"} working · ${Object.keys(crew.approvals).length} decision${Object.keys(crew.approvals).length === 1 ? "" : "s"} waiting`;
      const liveLocal = localAsk(q, { now: new Date(), status: liveStatus, screen: screenLines, extra: [identity, remembered, asksAboutEarlier(q) ? earlier : "", recap ? `Earlier in this conversation (carry on naturally):\n${recap}` : ""] });
      // A replaced paused Spark turn must not wake later and repeat the same actions.
      if (convo && status === "paused" && disposition === "new") await cancelRun(convo.run);
      if (wantLocal && disposition === "new") {
        setBrief(null);
        const r = await api<{ id: string }>("/api/runs", { body: { ask: `<spark-system>\n${localSys}\n\n${appNowBase}\n</spark-system>\n${liveLocal}`, title: `${prefs.nickname || "Spark"} · ${q.slice(0, 60)}`, runtime: "local", model: selected.model, intelligence, labels: ["buddy"] } });
        const next = { run: r.id, first: q.split("\n\n[screen]")[0]!, runtime: "local", model: selected.model }; handled.current = 0; setConvo(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
        setDraft(""); return;
      }
      if (wantLocal) { await followSelected(convo!.run, `<spark-system>\n${localSys}\n\n${appNowBase}\n</spark-system>\n${liveLocal}`); setDraft(""); return; }
      if (convo && disposition === "resume") {
        const mapped = (() => { try { return (JSON.parse(localStorage.getItem("shuacrew.buddy.mapped") ?? "[]") as string[]).includes(convo.run); } catch { return false; } })();
        const withMap = (text: string) => { const t = remembered && !text.includes("\n\n[screen]") ? `${text}\n\n[screen]\n${remembered}` : remembered ? `${text}\n\n${remembered}` : text; return mapped ? `${t}\n\n[app]\n${identity}` : `${t}\n\n[app]\n${appNow}`; };
        if (!mapped) { try { const m = JSON.parse(localStorage.getItem("shuacrew.buddy.mapped") ?? "[]") as string[]; localStorage.setItem("shuacrew.buddy.mapped", JSON.stringify([...m.slice(-50), convo.run])); } catch { /* ignore */ } }
        await followSelected(convo.run, withAttachments(withMap(screen ? `${q}\n\n[screen] A fresh screenshot is attached (${screen.width}×${screen.height}). Point, guide, draw or act if it helps.${screen.text.length ? `\n\n${screenText(screen.text, 6000)}` : ""}${screen.context ? `\n\n${elementsText(screen.context)}` : ""}` : isDesign(q) ? `${q}\n\n(This is a system-design question: use the SYSTEM DESIGN format from before — spoken summary, ---, the written design and a mermaid diagram.)` : q), atts));
      } else {
        setBrief(null);
        const r = await api<{ id: string }>("/api/runs", { body: { ask: withAttachments(buddyPrompt(q, screen, { name: prefs.nickname || "Spark", tone: prefs.tone, length: prefs.length, control: prefs.control, shortcuts: hands.shortcuts, voices, voice: prefs.conversation, memory: memory.facts, goal: memory.goal }, now, [appNow, installed.current && `INSTALLED APPS (open_app only these; asked for one that isn't here, say it isn't installed and offer its website or the App Store): ${installed.current}`, recap && `EARLIER IN THIS CONVERSATION (carry on naturally):\n${recap}`].filter(Boolean).join("\n\n")), atts), title: `${prefs.nickname || "Spark"} · ${q.slice(0, 60)}`, runtime: brain, model: selected.model, intelligence, effort: isDesign(q) ? "medium" : "low", labels: ["buddy"] } });
        const next = { run: r.id, first: q.split("\n\n[screen]")[0]!, runtime: brain, model: selected.model }; handled.current = 0; setConvo(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      setDraft("");
    } catch (e) { if (!stale()) setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { if (!stale()) setBusy(""); }
  };
  // Open mic: every turn you speak is a message; talking over Spark stops it.
  const askRef = useRef(ask); askRef.current = ask;
  // You clicked one of Spark's labels or cards on the screen: it looks again and takes it from there.
  useEffect(() => {
    const on = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text?.trim(); if (!text) return;
      setArmed(true); speech.current.unlock();
      void askRef.current(`[mark] I clicked “${text.slice(0, 200)}” on your drawing. If it's a step or an action, do it now (act if you can use my mouse and keyboard, otherwise guide me to it exactly); if it's information, tell me more about it in a sentence or two, and mark what you mean on the screen.`, { look: true });
    };
    window.addEventListener("shuacrew:mark", on);
    return () => window.removeEventListener("shuacrew:mark", on);
  }, []);
  useEffect(() => {
    const m = mic.current;
    m.onPhase = (p, detail) => { setPhase(p); if (p === "error" && detail) setError(detail); };
    m.onLevel = setMicLevel;
    m.onPartial = setHeard;
    // Interrupting: Spark drops to a murmur the moment you start, and only stops once your words are real —
    // a cough, a door or its own voice through the speakers no longer cuts it off mid-sentence.
    m.onTurn = (t) => {
      if (wakeTurn.current) { wakeTurn.current = false; m.mode = prefsRef.current.listen; if (!prefsRef.current.conversation && prefsRef.current.listen !== "hold") m.stop(); }
      // "Okay, Spark." with a pause after it: that's you getting its attention, not the question. Sent on its own it
      // cancelled the work in progress and the rest of what you said arrived as fragments. Keep listening instead.
      if (wakeOnly(t)) { logSense("heard", "Heard its name", t); return; }
      // Its own voice, transcribed back through the speakers ("Checking your calendar."): not you.
      if (echoOf(t, speech.current.recent(10_000))) { logSense("heard", "Ignored its own voice", t); return; }
      logSense("heard", "Heard you", t); setLastHeard(t); if (prefsRef.current.interrupt) speech.current.stop();
      const waiting = askingRef.current;
      if (waiting) { const said = yesOrNo(t); if (said !== null) { waiting.answer(said); return; } waiting.answer(false); } // anything else: keep it, and carry on with what you said
      newTurn();
      void askRef.current(t); };
    m.onBargeIn = () => { if (prefsRef.current.interrupt) speech.current.duck(true); };
    // You kept talking over Spark: it stops now, like a person would, instead of waiting for the transcript.
    m.onYield = () => { if (prefsRef.current.interrupt) { logSense("heard", "Interrupted", ""); speech.current.stop(); } };
    m.onDropped = () => speech.current.duck(false);
    m.outputLevel = () => speech.current.level();
    m.mode = wakeTurn.current ? "auto" : prefs.listen; m.lang = prefs.language;
    if (voiceLive) m.mode = "auto";
    const wanted = (prefs.listen !== "hold" && prefs.conversation) || wakeTurn.current || voiceLive;
    // Voice mode from the notch listens with the chat closed; otherwise the open mic lives with the open card.
    if (wanted && tab !== "teach" && (open || voiceLive) && armed && (!embedded || focused)) { speech.current.unlock(); void m.start(); } else m.stop();
  }, [prefs.conversation, prefs.listen, prefs.language, open, embedded, focused, armed, tab, voiceLive]);
  // Typing while the mic is open: key clicks never start a voice turn (Whisper made "and" of them), and the notch drops
  // the last thing you said aloud — you're writing now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.metaKey || e.ctrlKey || (e.key.length > 1 && e.key !== "Backspace" && e.key !== "Enter")) return; mic.current.muteFor(800); setLastHeard(""); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  // Push-to-talk with the keyboard: hold Space while Spark's box is empty (or nothing is focused).
  useEffect(() => {
    if (prefs.listen !== "hold" || !open || tab === "teach") return;
    const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; if (!el) return false; if (el === input.current) return !!input.current?.value; return !!el.closest?.("input,textarea,select,[contenteditable=true],.xterm"); };
    const down = (e: KeyboardEvent) => { if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return; e.preventDefault(); setArmed(true); speech.current.unlock(); void mic.current.press(); };
    const up = (e: KeyboardEvent) => { if (e.code !== "Space") return; mic.current.release(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); mic.current.release(); };
  }, [prefs.listen, open, tab]);
  useEffect(() => () => mic.current.stop(), []);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  // Guidance stays visible over the app being practiced without taking keyboard
  // focus. Pausing restores the user's normal pin preference.
  useEffect(() => { if (!embedded) post({ type: "buddyOnTop", on: prefs.onTop || practicing }); }, [prefs.onTop, practicing, embedded]);
  // Clicky-style: the collapsed companion rides beside your pointer (native; clicks pass through it while it follows).
  useEffect(() => { if (!embedded) post({ type: "buddyFollow", on: prefs.follow }); }, [prefs.follow, embedded]);
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
  // Watching the screen shares the GPU with the voice: keep a little more speech buffered so it never cuts out.
  useEffect(() => { speech.current.cushion = liveOn ? 0.4 : 0.18; }, [liveOn]);
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
  // The composer grows with what you type (one line when empty, up to about six).
  useEffect(() => { const el = input.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 150)}px`; }, [draft, open, tab]);
  const focusPct = timer ? 1 - remainingFocusMs(timer, now) / timer.durationMs : 0;

  const status$ = speaking ? "speaking" : phase === "hearing" ? "hearing you" : phase === "transcribing" ? "got it" : working || busy ? "thinking" : prefs.conversation && phase === "listening" ? "listening" : embedded ? "here with you" : "on your Mac";
  // The header says plainly what Spark is doing right now, and what it's minding when it's idle.
  const statusLabel = speaking ? "Speaking" : phase === "hearing" ? "Listening" : phase === "transcribing" ? "Got it" : working || busy ? "Thinking" : prefs.conversation && phase === "listening" ? "Listening" : activeMissions.length ? `Minding ${activeMissions.length} mission${activeMissions.length === 1 ? "" : "s"}` : "Ready";
  const statusLive = speaking || phase === "hearing" || (prefs.conversation && phase === "listening");
  // A live welcome: the time of day, what's actually going on, and suggestions that fit this moment.
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late?" : hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
  const workingNow = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && (r.status === "running" || r.status === "planning")).length;
  const now$ = [
    approvals ? { key: "ok", tone: "wait", text: `${approvals} waiting for your OK`, ask: "What needs my OK right now?" } : null,
    activeMissions.length ? { key: "missions", tone: "live", text: `${activeMissions.length} mission${activeMissions.length === 1 ? "" : "s"} in progress`, ask: "How are my missions going?" } : null,
    workingNow ? { key: "crew", tone: "live", text: `${workingNow} crew session${workingNow === 1 ? "" : "s"} working`, ask: "What is the crew working on?" } : null,
  ].filter(Boolean) as Array<{ key: string; tone: string; text: string; ask: string }>;
  const starters = [
    approvals ? "What needs my OK?" : null,
    hour < 11 ? "Start my day" : hour >= 17 ? "Wrap up my day" : "What should I focus on next?",
    "Anything important in my unread email?",
    see ? "Help me with this screen" : "Explain something to me",
  ].filter(Boolean).slice(0, 4) as string[];
  const lastSpark = messages.at(-1)?.who === "spark" && !messages.at(-1)?.live;
  const lastSparkText = [...messages].reverse().find((m) => m.who === "spark" && !m.live)?.text ?? "";
  // The reply as it streams in (spoken words only, no machine blocks): the notch shows it live instead of "Thinking…".
  const streamText = messages.at(-1)?.who === "spark" && messages.at(-1)?.live ? speakable(messages.at(-1)!.text).replace(/```[\s\S]*$/, "").trim() : "";
  quiet.current = !!busy || working || speaking || phase === "hearing" || phase === "transcribing" || !!guide || practicing;
  useEffect(() => {
    if (!liveOn || !prefs.notice || embedded || !native()) return;
    const got = (e: Event) => {
      const d = (e as CustomEvent<{ app: string; text: string }>).detail;
      if (quiet.current || !d?.text) return;
      const r = stuckSignal(stuckState.current, { at: Date.now(), app: d.app, text: d.text }); stuckState.current = r.state;
      if (!r.offer) return;
      setStuck(r.offer);
      speech.current.say(r.offer.kind === "error" ? `Looks like ${r.offer.app} keeps showing an error. Want me to walk you through it?` : "Still hunting for an answer? I can look at it with you.");
    };
    window.addEventListener("shuacrew:glance", got);
    // Never while Spark talks or thinks: reading the screen competes with the voice engine for the GPU.
    const t = setInterval(() => { if (!quiet.current) post({ type: "buddyGlance" }); }, 15_000);
    return () => { clearInterval(t); window.removeEventListener("shuacrew:glance", got); };
  }, [liveOn, prefs.notice, embedded]);
  useEffect(() => { if (!stuck) return; const t = setTimeout(() => setStuck(null), 120_000); return () => clearTimeout(t); }, [stuck]);
  const stuckHelp = () => { const o = stuck; if (!o) return; setStuck(null); void ask(`${o.kind === "error" ? `I'm stuck on this in ${o.app}: “${o.detail.slice(0, 200)}”` : "I keep searching and can't find the answer"}. Look at my screen and walk me through it, one step at a time.`, { look: true }); };
  const stuckLater = () => { if (stuck) stuckState.current = muteStuck(stuckState.current, stuck.key, Date.now()); setStuck(null); };
  const islandOpen = nook && !open && prefs.desktopPlacement === "notch";
  const showMedia = prefs.desktopPlacement === "notch" && prefs.notchMedia && !embedded;
  useEffect(() => {
    if (!showMedia || !native()) { setMedia(null); return; }
    // Only re-render when something you'd see changed: the song, playing/paused, artwork, or the bar moving 3 s+.
    const got = (e: Event) => { const d = (e as CustomEvent).detail as NonNullable<typeof media>; const next = d?.title ? d : null;
      setMedia((cur) => (!cur || !next ? next : cur.title === next.title && cur.playing === next.playing && cur.art === next.art && Math.abs(cur.position - next.position) < 3 ? cur : next)); };
    window.addEventListener("shuacrew:media", got);
    const ask = () => post({ type: "buddyNowPlaying" }); ask();
    const t = setInterval(ask, islandOpen || open ? 1500 : 5000);
    return () => { clearInterval(t); window.removeEventListener("shuacrew:media", got); };
  }, [showMedia, islandOpen, open, embedded]);
  const mediaCmd = (command: "toggle" | "next" | "previous") => void perform({ type: "media", command, ...(media ? { app: media.app } : {}) }).then(() => setTimeout(() => post({ type: "buddyNowPlaying" }), 350));
  const mediaSeek = (seconds: number) => void perform({ type: "media", command: "seek", seconds: Math.round(seconds), ...(media ? { app: media.app } : {}) }).then(() => setTimeout(() => post({ type: "buddyNowPlaying" }), 400));
  const workingRuns = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && (r.status === "running" || r.status === "planning"));
  const notched = prefs.desktopPlacement === "notch" && !embedded;
  // Speaking while tucked in: the island widens just enough to caption what Spark is saying, live.
  const hearingNow = (phase === "hearing" || phase === "transcribing") && !!heard;
  // Working on what you said: after you stop talking and before Spark's first word. It used to look frozen (the bars sat
  // at their floor and your words vanished), easy to take for "it didn't hear me".
  const processing = (voiceLive || (prefs.conversation && prefs.listen !== "hold") || fnSent) && (phase === "transcribing" || ((!!busy || working) && !speaking && !streamText));
  const processingText = processing ? (heard || lastHeard) : "";
  useEffect(() => { if (speaking || streamText) setLastHeard(""); }, [speaking, streamText]);
  // Ready for you: fn is down and nothing's been heard yet. Once words come in, the live captions take over.
  const fnReady = notched && fnHeld && !heard;
  useEffect(() => { if (speaking || streamText) setFnSent(false); }, [speaking, streamText]);
  useEffect(() => { if (phase === "error") { setFnHeld(false); setFnSent(false); } }, [phase]); // never stuck "listening"
  const streamingNow = !!streamText && !speaking && !hearingNow;
  // Searching the web or reading a page right now: shown live, so you can watch Spark look it up.
  const lookup = useMemo(() => (busy || working ? liveLookup(events as never) : null), [events, busy, working]);
  const live$ = useRef({ speaking: false, streaming: false, active: false }); live$.current = { speaking, streaming: !!streamText, active: !!busy || working };
  const lastSound = useRef(0), narrated = useRef(0);
  /**
   * Spark's own lines (progress, "done") go through here: each at most once per turn. Two separate cues both said
   * "Looking that up." on one search — now nothing it says on its own can repeat.
   */
  const ownLines = useRef(new Set<string>());
  const sayOwn = (text: string) => {
    const k = text.toLowerCase().replace(/[^a-z ]/g, "").trim();
    if (ownLines.current.has(k)) return false;
    ownLines.current.add(k); lastSound.current = Date.now(); speech.current.say(text); return true;
  };
  // No canned "On it" when you finish talking (it sounded robotic): the model's own first sentence is specific and
  // arrives in ~1.2 s, and the notch animation covers the gap. The quiet clock restarts so progress waits its 4 s.
  const newTurn = () => { ownLines.current.clear(); lastSound.current = Date.now(); };
  useEffect(() => { if (speaking) lastSound.current = Date.now(); }, [speaking]);
  // A long turn never leaves you hanging — but with real news, not filler: after ~4 s of quiet, what it's actually doing
  // ("Pulling up space.com."), twice at most. Nothing specific to say: it stays quiet and the notch shows it working.
  const eventsRef = useRef(events); eventsRef.current = events;
  useEffect(() => {
    if (!busy && !working) { narrated.current = 0; return; }
    if (!(voiceLive || (prefs.conversation && prefs.listen !== "hold"))) return;
    const tick = setInterval(() => {
      if (live$.current.speaking || live$.current.streaming || narrated.current >= 2 || Date.now() - lastSound.current < 4000) return;
      const line = progressLine(eventsRef.current as never, narrated.current); if (!line) return;
      if (sayOwn(line)) narrated.current++;
    }, 1000);
    return () => clearInterval(tick);
  }, [busy, working, voiceLive, prefs.conversation, prefs.listen]);
  const islandLive = !islandOpen && !open && prefs.desktopPlacement === "notch" && (prefs.notchCaptions && (speaking && !!caption || hearingNow || streamingNow) || !!lookup || !!stuck || !!task || !!guide || asking?.kind === "delete" || !!processingText || !!heads || fnReady);
  // Measure the open body so the island drops exactly as far as its content (nothing cut off), and tell the Mac app
  // how big it is so the hover area matches what you see.
  useEffect(() => {
    const el = islandBody.current; if (!el || !islandOpen) return;
    const measure = () => { const d = Math.min(380, Math.ceil(el.scrollHeight) + 2); setIslandDrop(d); post({ type: "buddyIsland", flare: ISLAND_FLARE, drop: d }); };
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, [islandOpen]);
  // Hover in/out of the notch (from the page, or the Mac app watching the pointer): open now, tuck away shortly after
  // you leave — unless you're typing in it or Spark is mid-answer.
  const nookHover = useRef((_: boolean) => {});
  // Tuck in once you've moved away. If you're mid-typing or Spark is mid-reply, keep checking (not just once) and
  // tuck in the moment that's over, so it never stays stuck open. An empty, focused ask box doesn't hold it open.
  const pointerInside = useRef(false), holdOpen = useRef<() => boolean>(() => false), scrubbing = useRef(false);
  const scrubHold = useCallback((on: boolean) => { scrubbing.current = on; }, []);
  holdOpen.current = () => !!nookDraft.trim() || !!busy || working || !!pending || scrubbing.current;
  nookHover.current = (inside: boolean) => {
    clearTimeout(nookTimer.current); pointerInside.current = inside;
    if (inside) { if (!open && prefs.desktopPlacement === "notch") setNook(true); return; }
    const tryClose = () => {
      if (pointerInside.current) return;
      if (holdOpen.current()) { nookTimer.current = setTimeout(tryClose, 400); return; }
      nookFocus.current = false; (document.activeElement as HTMLElement | null)?.blur?.(); setNook(false);
    };
    nookTimer.current = setTimeout(tryClose, 450);
  };
  const nextMoves = lastSpark && !working && !busy ? parseNext(messages.at(-1)!.text) : [];
  const quick = nextMoves.length ? nextMoves : lastSpark && !working && !busy ? ["Tell me more", "Make it shorter", ...(see ? ["Show me on screen"] : []), ...(prefs.control !== "off" && see ? ["Do it for me"] : [])] : [];
  const close = () => { speech.current.stop(); if (embedded) onClose?.(); else setOpen(false); };
  // Doze after 15 quiet minutes with nothing running; anything happening wakes it.
  useEffect(() => { lastStir.current = Date.now(); setSleepy(false); }, [messages.length, speaking, busy, phase, open]);
  useEffect(() => {
    const t = setInterval(() => { const anyRunning = Object.values(useLive.getState().crew.runs).some((r) => r.status === "running" || r.status === "planning"); if (anyRunning) lastStir.current = Date.now(); setSleepy(Date.now() - lastStir.current > 15 * 60_000); }, 30_000);
    return () => clearInterval(t);
  }, []);
  const displayRuntime = working ? actualRuntime : choice?.runtime ?? actualRuntime;
  const displayProvider = displayRuntime === "local" ? "This Mac" : displayRuntime === "claude" ? "Claude" : displayRuntime === "codex" ? "Codex" : displayRuntime ?? "Connecting";
  const mood = (prefs.celebration !== "off" && (cheer || eventMood === "happy")) ? "happy" : speaking ? "speaking" : working || busy ? "thinking" : eventMood === "concerned" ? "concerned" : sleepy ? "sleepy" : "idle";
  const card = <section className={`buddy-card spk ${embedded ? "is-embedded" : ""} ${full ? "is-full" : ""}`} style={sparkVars(prefs.color)} data-chat-style={prefs.chatStyle} data-chat-tone={prefs.chatTone} data-chat-corners={prefs.chatCorners} data-chat-text={prefs.chatText} data-chat-header={prefs.chatHeader} aria-label={`Ask ${prefs.nickname || "Spark"}`} onPointerDown={() => setArmed(true)}>
      <header className="spk-head">
        <span className={`spk-avatar is-${speaking ? "speaking" : phase === "hearing" ? "hearing" : working || busy ? "thinking" : "idle"}`}><SparkCharacter preferences={prefs} mood={mood} size={38} crop="portrait" /></span>
        <div className="spk-who"><strong>{prefs.nickname || "Spark"}</strong><span className={`spk-status spk-pill is-${status$.split(" ")[0]}`}>{statusLive ? (speaking ? <VoiceBars level={0.6} active /> : <MicBars />) : <i className={`spk-dot ${working || busy ? "is-busy" : ""}`} />}{statusLabel}<span className="spk-provider">· {displayProvider}</span></span></div>
        <button type="button" aria-label="Visual teaching" title="Visual teaching" aria-pressed={tab === "teach"} onClick={() => setTab(tab === "teach" ? "chat" : "teach")}><BookOpen size={15} /></button>
        <button type="button" aria-label={tab === "chat" ? "Open widgets" : "Back to chat"} title={tab === "chat" ? "Widgets & approvals" : "Back to chat"} aria-pressed={tab === "widgets"} onClick={() => setTab(tab === "chat" ? "widgets" : "chat")} className="spk-widget-toggle">{tab === "chat" ? <LayoutGrid size={15} /> : <MessageCircle size={15} />}{approvals > 0 && <i />}</button>
        <details className="spk-options" ref={optionsPanel} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary aria-label="Conversation options" title="Conversation options"><SlidersHorizontal size={15} /></summary>
          <div className="spk-options-panel">
            <span className="spk-options-label">CONVERSATION</span>
            <CompanionModelPicker />
            <p className="spk-routing">{choiceError ? "Provider check unavailable — retry when connected" : choice?.runtime ? `${choice.runtime === "local" ? "This Mac" : choice.runtime} · ${choice.model}${actualRuntime && actualRuntime !== choice.runtime ? " · ready to try next turn" : ""}` : choice?.reason ?? "Checking connected providers…"}</p>
            <button type="button" onClick={() => { speech.current.unlock(); if (voice.on) speech.current.stop(); saveBuddyVoice({ on: !voice.on }); }}>{voice.on ? <Volume2 size={15} /> : <VolumeX size={15} />}<span>Spoken replies</span><b>{voice.on ? "On" : "Off"}</b></button>
            <div className="spk-option-row"><span>Microphone mode</span><div className="spk-listen" role="radiogroup" aria-label="How to talk">
              <button type="button" role="radio" aria-checked={prefs.listen === "auto"} onClick={() => setListen("auto")} className={prefs.listen === "auto" ? "is-on" : ""}>Hands-free</button>
              <button type="button" role="radio" aria-checked={prefs.listen === "hold"} onClick={() => setListen("hold")} className={prefs.listen === "hold" ? "is-on" : ""}>Hold</button>
            </div></div>
            <button type="button" aria-pressed={liveOn} disabled={liveBusy} onClick={toggleLive}><Eye size={15} /><span>Watch screen live</span><b>{liveOn ? "On" : "Off"}</b></button>
            {!embedded && <button type="button" onClick={() => { setWide(v => !v); if (optionsPanel.current) optionsPanel.current.open = false; }}><Maximize2 size={15} /><span>{wide ? "Compact conversation" : "Roomier canvas"}</span></button>}
            {convo && !embedded && <button type="button" onClick={() => post({ type: "buddyOpen", run: convo.run })}><MessageCircle size={15} /><span>Open in ShuaCrew</span></button>}
            <button type="button" onClick={() => { if (embedded) window.shuacrew?.navigate("/settings"); else post({ type: "buddyOpen", path: "/settings" }); }}><SlidersHorizontal size={15} /><span>Personalize in Settings</span></button>
            {convo && <button type="button" disabled={working || !!busy || !!task} onClick={() => { reset(); if (optionsPanel.current) optionsPanel.current.open = false; }}><RotateCcw size={15} /><span>New conversation</span></button>}
          </div>
        </details>
        {embedded && <button type="button" className="spk-full-toggle" aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen (Esc)" : "Full screen (⌘⇧J)"} aria-pressed={full} onClick={() => setSparkFull(!full)}>{full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}
        <button type="button" aria-label="Close" onClick={close}><X size={15} /></button>
      </header>
      {practicing && tab !== "teach" && <div className="buddy-practice-status" role="status"><button onClick={() => setTab("teach")}>{lesson?.practice.status === "checking" ? "Checking your latest attempt…" : "Your guided lesson is still here"}</button><button onClick={() => void pausePractice().catch(e => setError(String(e)))}>Pause</button></div>}
      {liveOn && <button type="button" className="spk-watch-banner" onClick={toggleLive} disabled={liveBusy}><i />Watching your screen live<span>Stop watching</span></button>}
      {(choiceError || choice?.runtime === null) && <p className="spk-connection-notice" role="status">{choiceError ? "Connection unavailable. Your message stays here." : choice?.reason}</p>}
      {choice?.runtime === "local" && prefs.brain !== "local" && <p className="spk-connection-notice is-fallback" role="status">Claude and Codex are unavailable, so {prefs.nickname || "Spark"} is on this Mac ({choice.model}): chat and quick actions only. Real work waits for them.</p>}
      {tab === "chat" && (phase === "hearing" || phase === "transcribing" || phase === "error") && <p className="spk-mic-status" role="status">{phase === "hearing" ? "Listening…" : phase === "transcribing" ? "Turning your voice into text…" : "Microphone unavailable. You can keep typing."}</p>}
      {tab === "teach" ? <Teaching compact /> : tab === "widgets" ? <div className="buddy-thread buddy-widgets"><SparkWidgets ctx={embedded ? { go: (path) => { window.shuacrew?.navigate(path); } } : ctx} /></div> : <>
        <div className="buddy-thread spk-thread" ref={thread} onScroll={(e) => { const el = e.currentTarget; followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (followBottom.current) setBehind(false); }}>
          {!messages.length && !brief && <motion.div className="spk-hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <div className="spk-hello-avatar"><SparkCharacter preferences={prefs} mood="happy" size={64} crop="portrait" /></div>
            <h2>{greeting} I'm {prefs.nickname || "Spark"}.</h2>
            <div className="spk-now" aria-label="Right now">{now$.length
              ? now$.map((n, k) => <motion.button key={n.key} type="button" className={`is-${n.tone}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 + k * 0.05 }} onClick={() => void ask(n.ask)}><i />{n.text}</motion.button>)
              : <span className="is-quiet"><i />All quiet. Nothing needs you.</span>}</div>
            <div className="spk-starters">{starters.map((s, k) => <motion.button key={s} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + k * 0.05 }} onClick={() => void ask(s)}>{s}<ArrowUp size={12} /></motion.button>)}
              <motion.button type="button" className="is-agent" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + starters.length * 0.05 }} onClick={() => { setDraft("agent: "); input.current?.focus(); }}><b>agent:</b> give me a task to finish for you</motion.button></div>
            <p className="buddy-tip">Type, talk, tap fn, or ask for a diagram.</p>
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
          {lastSpark && !working && !busy && <Recommendations ask={[...messages].reverse().find((m) => m.who === "you")?.text.split("\n\n[screen]")[0] ?? ""} />}
          {quick.length > 0 && <motion.div className="spk-quick" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>{quick.map((q) => <button key={q} type="button" onClick={() => void ask(q)}>{q}</button>)}</motion.div>}
          {convo && !working && !busy && lastQuestion && <button type="button" className="buddy-handoff" onClick={() => void perform({ type: "crew", ask: lastQuestion }).then((r) => r.run && (embedded ? window.shuacrew?.navigate(`/sessions/${r.run}`) : post({ type: "buddyOpen", run: r.run })))}><Send size={11} /> Hand this to the crew as a full session</button>}
        </div>
        <AnimatePresence>{behind && <motion.button type="button" className="spk-latest" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} onClick={() => { followBottom.current = true; setBehind(false); thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); }}><ArrowUp size={12} style={{ transform: "rotate(180deg)" }} /> Latest</motion.button>}</AnimatePresence>
        {error && <p className="buddy-error">{error}</p>}
      </>}
      {activeMissions.length > 0 && <div className="spk-missions" aria-label="Missions I'm staying with">
        {activeMissions.slice(-3).map((m) => { const r = crew.runs[m.run]!; return <button key={m.run} type="button" className={`spk-mission is-${r.status}`} title={m.task}
          onClick={() => (embedded ? window.shuacrew?.navigate(`/sessions/${m.run}`) : post({ type: "buddyOpen", path: `/sessions/${m.run}` }))}>
          <i /><span>{r.title || m.task}</span><small>{r.status === "awaiting_approval" ? "needs you" : r.status.replace("_", " ")}{m.rounds ? ` · pushed ${m.rounds}×` : ""}</small></button>; })}
      </div>}
      {visual && open && <VisualCard v={visual} onClose={() => setVisual(null)} />}
      {asking && (asking.kind === "delete"
        ? <div className="buddy-task is-run is-delete"><Trash2 size={14} /><span><b>{asking.command}?</b><small> · {asking.why} · say yes or no</small></span>
            <button type="button" onClick={() => asking.answer(true)}>{asking.yes ?? "Delete"}</button><button type="button" onClick={() => asking.answer(false)}>{asking.yes === "Delete" || !asking.yes ? "Keep" : "Cancel"}</button></div>
        : <div className="buddy-task is-run"><Hand size={14} /><span><b>Run this?</b> <code>{asking.command}</code>{asking.why && <small> · {asking.why}</small>}</span>
            <button type="button" onClick={() => asking.answer(true)}>Run</button><button type="button" onClick={() => asking.answer(false)}>Cancel</button></div>)}
      {task && <div className="buddy-task"><Hand size={14} /><span><b>Working on your Mac</b> step {task.step} · <kbd>Esc</kbd> stops</span>
        {pending && <><em>{describeAct(pending)}?</em><button type="button" onClick={() => void runAct(pending, task.step)}>Do it</button><button type="button" title="Don't ask again for this task" onClick={() => { setAutoTask(true); void runAct(pending, task.step); }}>All</button></>}
        <button type="button" className="buddy-task-stop" aria-label="Stop" onClick={() => stopTask("Stopped.")}><Square size={11} /></button></div>}
      {guide && <div className="buddy-guide"><Compass size={14} /><span><b>Step {guide.step}</b> {guide.label}</span>
        <button type="button" title={prefs.guide === "click" ? "Or just click the highlighted spot" : "Tell me when you've done it"} disabled={!!busy || working} onClick={() => void advance()}>Check result <ChevronRight size={12} /></button><button type="button" aria-label="Stop guiding" onClick={stopGuide}><X size={12} /></button></div>}
      {tab !== "teach" && <form className="buddy-input spk-input chat-composer" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <button type="button" className={`buddy-see ${see ? "is-on" : ""}`} aria-pressed={see} title={see ? "I'll look at your screen when you ask (one screenshot, only then)" : "Screen off: I won't look"} onClick={() => setSee((v) => { const next = !v; try { localStorage.setItem(SEE, next ? "1" : "0"); } catch { /* ignore */ } return next; })}>{see ? <Eye size={15} /> : <EyeOff size={15} />}</button>
        <textarea ref={input} rows={1} value={draft} placeholder={prefs.conversation && phase === "listening" ? "Listening… or type" : see ? "Ask or tell me to do it…" : "Ask me anything…"} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } if (e.key === "Escape") { e.preventDefault(); if (busy || working || speaking) void interrupt(); else if (full) setSparkFull(false); else close(); } }} aria-label="Message" />
        {prefs.listen === "hold"
          ? <button type="button" className={`buddy-talk is-hold is-${phase}`} title="Hold to talk (or hold Space) — let go to send" aria-label="Hold to talk" ref={talkBtn}
              onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setArmed(true); speech.current.unlock(); mic.current.mode = "hold"; void mic.current.press(); }}
              onPointerUp={() => mic.current.release()} onPointerCancel={() => mic.current.release()}><AudioLines size={15} /></button>
          : <button type="button" className={`buddy-talk ${prefs.conversation ? "is-on" : ""} is-${phase}`} aria-pressed={prefs.conversation} title={prefs.conversation ? "Conversation on: just talk. Click to stop listening." : "Talk hands-free: just speak, no buttons"} onClick={toggleTalk} ref={talkBtn}><AudioLines size={15} /></button>}
        {(busy || working || speaking) && !draft.trim()
          ? <motion.button type="button" className="buddy-send is-stop" aria-label="Stop" title="Stop (Esc)" onClick={() => void interrupt()} whileTap={{ scale: 0.88 }}><Square size={13} fill="currentColor" /></motion.button>
          : <motion.button className="buddy-send" disabled={!draft.trim()} aria-label="Send" whileTap={{ scale: 0.88 }}><ArrowUp size={16} /></motion.button>}
      </form>}
    </section>;
  if (embedded) return <div className="buddy is-open is-embedded" style={sparkVars(prefs.color)}>{card}</div>;
  return <div className={`buddy ${open ? "is-open" : ""} ${prefs.desktopPlacement === "notch" ? "is-docked" : ""}`} data-size={prefs.size} data-notch-glow={prefs.notchGlow} data-notch-size={prefs.notchSize} data-presence={prefs.presence} data-celebration={prefs.celebration} style={sparkVars(prefs.color)}>
    <AnimatePresence>{open && <motion.div key="card" className={`spk-pop ${notched ? "is-notched" : ""}`} style={notched ? { "--hw": `${notchGeo.w}px`, "--hh": `${notchGeo.h}px` } as CSSProperties : undefined}
      initial={notched ? { opacity: 0, scaleY: 0.4, scaleX: 0.7 } : { opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1, scaleX: 1, scaleY: 1 }} exit={notched ? { opacity: 0, scaleY: 0.4, scaleX: 0.7 } : { opacity: 0, y: 10, scale: 0.97 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
      {notched && <div className="shua-chat-cap">
        <span className="is-face"><i className={`shua-island-face ${working || busy ? "is-busy" : ""} ${speaking ? "is-speaking" : ""}`}><SparkCharacter preferences={prefs} mood={mood} size={20} crop="portrait" /></i><strong>{prefs.nickname || "Spark"}</strong></span>
        <span className="shua-island-cam" aria-hidden />
        <span className="is-live">
          {prefs.notchControls && <><button type="button" className={prefs.conversation ? "is-on" : ""} aria-pressed={prefs.conversation} onClick={toggleTalk} aria-label="Microphone">{prefs.conversation ? <Mic size={13} /> : <MicOff size={13} />}</button>
          <button type="button" className={liveOn ? "is-on" : ""} aria-pressed={liveOn} disabled={liveBusy} onClick={toggleLive} aria-label="Watch my screen">{liveOn ? <Eye size={13} /> : <EyeOff size={13} />}</button></>}
          <button type="button" onClick={() => setOpen(false)} aria-label="Tuck into the notch" title="Tuck into the notch"><Minimize2 size={13} /></button>
        </span>
      </div>}
      {notched && speaking && prefs.notchCaptions && caption && <div className="shua-chat-caption"><NotchCaption line={caption} lines={4} /></div>}
      {card}</motion.div>}</AnimatePresence>
    {!open && mini && <MiniCard name={prefs.nickname || "Spark"} prefs={prefs} mood={mood}
      state={phase === "hearing" ? "listening" : phase === "transcribing" || busy || working ? "thinking" : speaking ? "speaking" : "ready"}
      heard={heard} guide={guide} reply={gist([...messages].reverse().find((m) => m.who === "spark")?.text ?? "")}
      onCheck={() => void advance()} onStopGuide={stopGuide} onOpen={() => { setMini(false); setOpen(true); }} onClose={() => setMini(false)} />}
    {!open && !mini && practicing && <div className="buddy-bubble is-practice"><span>{lesson?.practice.feedback || "Your guided lesson is still here"}</span><div><button onClick={() => { setOpen(true); setTab("teach"); }}>Open lesson</button><button onClick={() => void pausePractice().catch(e => setError(String(e)))}>Pause</button></div></div>}
    {!open && !mini && !practicing && guide && <div className="buddy-bubble is-guide"><span><Compass size={12} /> Step {guide.step}: {guide.label}</span>
      <div><button type="button" disabled={!!busy || working} onClick={() => void advance()}>Check result <ChevronRight size={11} /></button><button type="button" onClick={stopGuide}>Stop</button></div></div>}
    {!open && !mini && !practicing && !guide && stuck && <div className="buddy-bubble is-guide"><span><Compass size={12} /> {stuck.kind === "error" ? `Stuck in ${stuck.app}?` : "Still searching?"}</span><small>{stuck.detail.slice(0, 120)}</small>
      <div><button type="button" onClick={stuckHelp}>Show me <ChevronRight size={11} /></button><button type="button" onClick={stuckLater}>Not now</button></div></div>}
    {!open && !mini && !practicing && !guide && !stuck && !bubble && morning && <button type="button" className="buddy-bubble is-morning" onClick={() => void playMorning()}>Your day in 20 seconds<small>Tap to hear it</small></button>}
    {!open && !mini && !practicing && !guide && !stuck && bubble && <button type="button" className="buddy-bubble" onClick={() => { post({ type: "buddyOpen", path: bubble.path }); setBubble(null); }}>{bubble.text}<small>Open in ShuaCrew</small></button>}
    {!open && !mini && !practicing && !guide && !stuck && !bubble && !morning && evening && <button type="button" className="buddy-bubble is-morning" onClick={() => void playEvening()}>Your day, wrapped<small>Tap to hear it</small></button>}
    {!open && !mini && !practicing && !guide && !stuck && !bubble && !morning && !evening && track.id && <button type="button" className="buddy-bubble" onClick={() => post({ type: "buddyOpen", path: `/sessions/${track.id}` })}>{track.title}<small>{track.who ? `${track.who} · ${track.label}` : track.label}</small></button>}
    {prefs.desktopPlacement === "notch" ? <div className={`shua-island ${islandOpen ? "is-open" : islandLive ? "is-live" : "is-rest"}${processing ? " is-processing" : ""}${fnHeld ? " is-ready" : ""}`} style={{ "--hw": `${notchGeo.w}px`, "--hh": `${notchGeo.h}px`, "--flare": `${islandOpen ? ISLAND_FLARE : islandLive ? 110 : media?.playing ? 58 : 46}px`, "--drop": `${islandOpen ? islandDrop : islandLive ? (hearingNow || streamingNow || (speaking && caption) ? 78 : 64) : 0}px` } as CSSProperties}
      onMouseEnter={() => nookHover.current(true)} onMouseLeave={() => nookHover.current(false)}>
      <div className="shua-island-shape">
        <div className="shua-island-ears">
          <button type="button" className="shua-island-ear is-face" aria-label={`Open ${prefs.nickname || "Spark"}`} onClick={() => { speech.current.unlock(); setNook(false); setOpen(true); }}>
            <i className={`shua-island-face ${working || busy ? "is-busy" : ""} ${speaking ? "is-speaking" : ""}`}><SparkCharacter preferences={prefs} mood={mood} size={20} crop="portrait" /></i>
            {!islandOpen && media?.playing && media.art && <img className="shua-island-art" src={media.art} alt="" />}
            {islandOpen && <strong>{prefs.nickname || "Spark"}</strong>}
          </button>
          <span className="shua-island-cam" aria-hidden />
          <span className="shua-island-ear is-live">
            {voiceLive || fnHeld || fnSent ? <span className="shua-island-voice">{processing ? <ThinkWave /> : <MicBars floor={speaking ? 0.5 : 0.15} />}</span> : approvals > 0 ? <em className="is-wait">{approvals}</em> : workingNow > 0 ? <em className="is-live">{workingNow}</em> : nextTimer ? <em className="is-timer" title={nextTimer.label || "Timer"}><TimeLeft t={nextTimer} /></em> : timer ? <em className="is-focus">{Math.ceil(remainingFocusMs(timer, now) / 60000)}m</em> : radio.playing || media?.playing ? <VoiceBars level={0.5} active /> : <i className={`shua-island-dot ${working || busy ? "is-busy" : ""}`} />}
            {islandOpen && <small>{statusLabel}</small>}
            {islandOpen && <button type="button" className="shua-island-expand" onClick={() => { setNook(false); setOpen(true); }} aria-label="Open chat" title="Open chat"><Maximize2 size={12} /></button>}
          </span>
        </div>
        <div className="shua-island-live" aria-hidden={!islandLive}>{fnReady ? <p className="notch-ready" aria-live="polite"><MicBars floor={0.2} /><span>Listening…</span></p> : processingText && !lookup ? <p className="notch-heard is-processing" aria-live="polite">“{processingText}”</p> : hearingNow && prefs.notchCaptions ? <Rolling className="notch-heard">{heard}</Rolling> : streamingNow && prefs.notchCaptions ? <Rolling className="notch-heard is-stream">{streamText}<i className="notch-caret" /></Rolling> : speaking && prefs.notchCaptions ? <NotchCaption line={caption} /> : lookup ? <p className="shua-island-hint is-lookup"><Globe size={12} /> <span>{lookup}</span></p> : task ? <p className="shua-island-hint">{pending ? `Can I ${describeAct(pending).toLowerCase()}? Hover to answer` : `Step ${task.step} · working on it`}</p>
          : heads ? <p className={`shua-island-hint is-heads is-${heads.kind}`}>{heads.kind === "reminder" ? <Bell size={12} /> : heads.kind === "event" ? <CalendarClock size={12} /> : <Sparkles size={12} />} {heads.text}</p>
          : asking?.kind === "delete" ? <p className="shua-island-hint is-delete"><Trash2 size={12} /> {asking.command}? Say yes or no</p>
          : guide ? <p className="shua-island-hint">Step {guide.step} · {guide.label}</p>
          : stuck ? <p className="shua-island-hint"><Compass size={12} /> {stuck.kind === "error" ? `Stuck in ${stuck.app}? Hover for help` : "Still searching? Hover for help"}</p> : null}</div>
        <div className="shua-island-body" ref={islandBody} aria-hidden={!islandOpen}>
          {visual && <VisualCard v={visual} onClose={() => { setVisual(null); setNook(false); }} />}
          {timers.length > 0 && <ul className="spark-nook-timers" aria-label="Timers">{[...timers].sort((a, b) => remaining(a, now) - remaining(b, now)).map((t) => <li key={t.id} className={t.paused !== undefined ? "is-paused" : ""}>
            <span>{t.kind === "alarm" ? <AlarmClock size={13} /> : <Timer size={13} />}{t.label || (t.kind === "alarm" ? "Alarm" : "Timer")}</span>
            <b>{t.kind === "alarm" ? new Date(t.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : <TimeLeft t={t} />}</b>
            <button type="button" tabIndex={islandOpen ? 0 : -1} aria-label={`Cancel ${t.label || t.kind}`} onClick={() => setTimers(getTimers().filter((x) => x.id !== t.id))}>×</button></li>)}</ul>}
          {asking?.kind === "delete" && <div className="spark-nook-stuck is-delete"><div><b>{asking.command}?</b><small>{asking.why[0]!.toUpperCase() + asking.why.slice(1)}.</small></div>
            <button type="button" tabIndex={islandOpen ? 0 : -1} onClick={() => asking.answer(true)}>{asking.yes ?? "Delete"}</button><button type="button" tabIndex={islandOpen ? 0 : -1} onClick={() => asking.answer(false)}>{asking.yes === "Delete" || !asking.yes ? "Keep" : "Cancel"}</button></div>}
          {stuck && <div className="spark-nook-stuck"><div><b>{stuck.kind === "error" ? `Stuck in ${stuck.app}?` : "Still searching?"}</b><small>{stuck.detail}</small></div>
            <button type="button" tabIndex={islandOpen ? 0 : -1} className="is-go" onClick={stuckHelp}>Show me</button><button type="button" tabIndex={islandOpen ? 0 : -1} onClick={stuckLater}>Not now</button></div>}
          <div className="spark-nook-row">
            <form className="spark-nook-ask" onSubmit={(e) => { e.preventDefault(); const t = nookDraft.trim(); if (!t) return; setNookDraft(""); void ask(t); }}>
              <input value={nookDraft} tabIndex={islandOpen ? 0 : -1} onChange={(e) => setNookDraft(e.target.value)} onFocus={() => { nookFocus.current = true; post({ type: "buddyNookFocus" }); }} onBlur={() => { nookFocus.current = false; }} placeholder={`Ask ${prefs.nickname || "Spark"} anything…`} aria-label={`Ask ${prefs.nickname || "Spark"}`} />
              {(busy || working || speaking) && !nookDraft.trim()
                ? <button type="button" className="is-stop" tabIndex={islandOpen ? 0 : -1} aria-label="Stop" onClick={() => void interrupt()}><Square size={11} fill="currentColor" /></button>
                : <button type="submit" tabIndex={islandOpen ? 0 : -1} disabled={!nookDraft.trim()} aria-label="Send"><ArrowUp size={14} /></button>}
            </form>
            {prefs.notchControls && <>
              <button type="button" tabIndex={islandOpen ? 0 : -1} className={`spark-nook-voice ${voiceLive ? "is-on" : ""}`} aria-pressed={voiceLive} onClick={() => { setArmed(true); speech.current.unlock(); setVoiceLive((v) => !v); }} title={voiceLive ? "Voice mode on: just talk. Tap to end." : "Voice mode: talk with Spark in real time"} aria-label="Voice mode">{voiceLive ? <><MicBars floor={speaking ? 0.5 : 0.15} /><span>End</span></> : <><Mic size={14} /><span>Talk</span></>}</button>
              <button type="button" tabIndex={islandOpen ? 0 : -1} className={`spark-nook-toggle ${liveOn ? "is-on" : ""}`} aria-pressed={liveOn} disabled={liveBusy} onClick={toggleLive} title={liveOn ? "Watching your screen: tap to stop" : "Let Spark watch your screen"} aria-label="Watch my screen">{liveOn ? <Eye size={14} /> : <EyeOff size={14} />}</button>
            </>}
          </div>
          {speaking && prefs.notchCaptions && caption ? <NotchCaption line={caption} lines={6} />
            : hearingNow || phase === "hearing" ? <Rolling className="notch-heard is-open" lines={6}>{heard || "Listening…"}</Rolling>
            : streamText ? <Rolling className="notch-heard is-open is-stream" lines={6}>{streamText}<i className="notch-caret" /></Rolling>
            : (busy || working || lastSparkText) && <p className={`spark-nook-say ${busy || working ? "is-busy" : ""}`}>{busy || working ? (lookup ? <><Globe size={12} /> {lookup}<span className="notch-dots"><i /><i /><i /></span></> : <>Thinking<span className="notch-dots"><i /><i /><i /></span></>) : gist(lastSparkText)}</p>}
          {nextMoves.length > 0 && !hearingNow && !speaking && <div className="spark-nook-next">{nextMoves.map((n) => <button key={n} type="button" tabIndex={islandOpen ? 0 : -1} onClick={() => void ask(n)}>{n}</button>)}</div>}
          <LiveActivities tab={islandOpen ? 0 : -1} showMedia={showMedia} media={media} mediaCmd={mediaCmd} mediaSeek={mediaSeek} scrubHold={scrubHold} activeMissions={activeMissions} runs={crew.runs}
            task={task} pending={pending} guide={guide} busy={!!busy} working={working} runAct={(a, step) => void runAct(a, step)} doAll={() => { setAutoTask(true); if (pending && task) void runAct(pending, task.step); }}
            stopTask={stopTask} advance={() => void advance()} stopGuide={stopGuide} radio={radio} setRadio={setRadio} timer={timer} now={now} focusPct={focusPct} workingRuns={workingRuns} approvals={approvals} />        </div>
      </div>
    </div> : <div className={`buddy-spark size-${prefs.size} ${working || busy ? "is-thinking" : ""} ${speaking ? "is-speaking" : ""}`} aria-hidden="true">
      {timer && <svg className="buddy-focus" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="46" className="fill" style={{ strokeDashoffset: `${289 * (1 - focusPct)}` }} /></svg>}
      <SparkCharacter preferences={prefs} mood={mood} /><i className="buddy-shadow" />
      {approvals > 0 && <em className="buddy-badge">{approvals}</em>}
    </div>}
  </div>;
}
