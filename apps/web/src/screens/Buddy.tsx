import { companionName } from "../lib/companion";
import { actionSequence } from "../lib/action-sequence";
import { NotchTeachingBar } from "../components/NotchTeachingBar";
import { NotchEqualizer } from "../components/NotchEqualizer";
import { liveNotchText } from "../lib/live-transcript";
import { demonstrationIntent, replayIntent } from "../lib/demonstration-intent";
import { WorkflowLibrary } from "../components/WorkflowLibrary";
import { useWorkflows, workflowBusy, workflowCommand, workflowContext, workflowReplayIssue } from "../lib/workflow-memory";
import { AssistantMission } from "../components/AssistantMission";
import { prepareFreshAction } from "../lib/fresh-action";
import { AssistantDeck } from "../components/AssistantDeck";
import { AssistantAccess } from "../components/AssistantAccess";
import { beginAssistant, reduceAssistant, type AssistantPhase } from "../lib/assistant-state";
import { interactionLatency } from "../lib/interaction-latency";
import type { ScreenEvidence } from "../lib/screen-evidence";
import { autopilotRequest, autopilotTarget, autopilotResult, readAutopilotWatch, writeAutopilotWatch } from "../lib/voice-autopilot";
import { approvalSummary } from "../lib/approval-summary";
import { commandAnnouncement } from "../lib/command-narration";
import { scheduleNotchClose } from "../lib/notch-hover";
import { CompanionApproval } from "../components/CompanionApproval";
import { notchActivity } from "../lib/notch-activity";
import { notchPreviewWanted, notchReplyText } from "../lib/notch-presentation";
import { requestPointer } from "../lib/pointer-feedback";
import { SelectedAreaPreview } from "../components/SelectedAreaPreview";
import { notchContentHeight, companionVoiceState } from "../lib/notch-layout";
import { priorConversations, firstUserAsk, conversationMessages, type CompanionConversation } from "../lib/companion-history";
import { benchmarkSummary, scoreTranscript } from "../lib/voice-benchmark";
import { crewRef } from "../lib/crew-voice";
import { companionControl, completionClaim, focusContext, loadFocus, saveFocus, recordActionTiming, type ConversationFocus } from "../lib/companion-reliability";
import { Teaching } from "./Teaching";
import "../components/chat-composer.css";
import { useTeaching, pausePractice } from "../lib/teaching";
import { CompanionModelPicker, modelPreference } from "../components/CompanionModelPicker";
import { setSparkFull, takeSparkSuggestion, watchSparkSuggestion } from "../lib/spark-panel";
import { logSense } from "../lib/spark-log";
import { asksAboutEarlier, recall } from "../lib/screen-memory";
import { earlierToday, rememberAsk } from "../lib/spark-day";
import { eveningRecap, localDay, morningBrief, shouldBrief, shouldRecap } from "../lib/morning";
import { accentOf, sparkVars, cursorGradient } from "../lib/spark-color";
import { getRadio, loadRadio, radioCommand, radioNow, type RadioNow } from "../lib/radio";
import { NotchCaption, Rolling, SpokenReply } from "../components/NotchCaption";
import { Recommendations } from "../components/Recommendations";
import { locate, reacquire, type ScreenFacts } from "../lib/snap";
import { STUCK_START, muteStuck, stuckSignal, type StuckOffer } from "../lib/stuck";
import { selectIntelligence, turnDisposition, type IntelligenceChoice, type IntelligenceRequest, resolveIntelligence } from "../lib/intelligence";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ComposerActions } from "../components/ComposerActions";
import { acceptCompanionDraft, clearCompanionDraft, getCompanionDraft, getCompanionDraftRevision, restoreCompanionDraft, setCompanionDraft, useCompanionDraft } from "../lib/companion-draft";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight, Ellipsis, Keyboard, Trash2, Bell, CalendarClock, Sparkles, AlarmClock, Timer, BookOpen, AudioLines, SlidersHorizontal, Check, ChevronRight, Compass, Eye, EyeOff, Hand, LayoutGrid, Maximize2, MessageCircle, Mic, MicOff, Minimize2, MousePointer2, RotateCcw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { api, cancelRun, followUp } from "../lib/api";
import { useLive } from "../lib/live";
import { workspaceContext } from "../lib/workspace-context";
import { optionalContext } from "../lib/optional-context";
import { isTopLevelWork } from "../lib/crew";
import { conversation } from "../lib/conversation";
import { addMission, missionTask, nextMove, readMissions, summary as gist, writeMissions, type Mission } from "../lib/missions";
import { upload, withAttachments } from "../lib/attachments";
import { earcon, soundStyle, warmSounds, type Earcon } from "../lib/earcons";
import { useLinger } from "../lib/linger";
import { setMicRoute } from "../lib/mic-route";
import { crewAsks, crewDetail, crewFinished, lastAskedApproval, noteAsked, statuses } from "../lib/crew-voice";
import { asksWeather, weatherForSpark } from "../lib/weather";
import { aboutScreen, chainOf, blockScreen, deleteQuestion, followThroughAsk, needsFollowThrough, needsScreen, pointingText, SPARK_RULES, isDestructive, actFollowUp, progressLine, buddyPrompt, claimsWithoutAction, engineLine, parseNext, turnTier, localAsk, localSystem, shuacrewNow, completedBlocks, elementsText, describeAct, describeAction, guideFollowUp, parseActs, parseZoom, type Act, type ScreenContext, isDesign, nextSentences, parseActions, parseDraw, parseGuide, parsePoint, screenText, speakable, splitDiagrams, type GuideStep, type ScreenLine } from "../lib/buddy";
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
import "./spark-design.css";

/** Mac actions whose result Spark says out loud when it lands (you'd otherwise have to go and check). */
const CONFIRM_OPS = new Set(["add_reminder", "calendar_add", "complete_reminder", "delete_reminder", "delete_reminders", "complete_reminders", "delete_event", "delete_note", "notes_new", "new_folder"]);
import "../alive.css"; // the desktop Spark loads without the app shell: same accent gradient and logo tokens
import "./notch.css"; // last: the notch's motion and light
import { nativeLiveSpeech } from "../lib/live-speech";
import { ctx, capture, selectRegion, type Shot, shotFiles, claim, fitShape, KEY, macContext, mine, playingContext, SEE, native, post, readSee, screenFacts, screenSize, seesHiRes, setHiRes, zoomShot } from "./spark/bridge";
import { ISLAND_FLARE, perform, sparkHooks, type Done } from "./spark/actions";
import { chime, TimeLeft, MiniCard, setMicLevel, getMicLevel, useMicLevelVar, VoiceBars } from "./spark/parts";
import { isInstant, runInstant } from "./spark/commands";
import { LiveActivities } from "./spark/LiveActivities";
import { VisualCard } from "./spark/Visual";
import { ArchitectureCard } from "../components/ArchitectureCard";
import { architectureContext, architectureKey, emptyArchitectureSession, reduceArchitectureSession } from "../lib/architecture-session";
import { narrationSegments, type NarrationIdentity } from "../lib/lesson-narration";
import { NotchAura } from "../components/NotchAura";
import { due, getTimers, remaining, ringLine, setTimers, useTimers } from "../lib/timers";
import { parseVisual, type Visual } from "../lib/visual";
import { announcements, inMeeting, welcomeBack, type Agenda } from "../lib/proactive";
import { QuietAnnouncements } from "../lib/quiet-announcements";
import { copyForPaste, pasteTarget } from "../lib/paste-hint";
import { PasteChip } from "../components/PasteChip";
import { ConversationTranscript, LiveTranscript, LiveIsland, LivePanel, VoiceWaveform, endLive, liveActive, startLive, useLive as useLiveCall } from "../components/LiveMode";
import { getLiveSnapshot, narrateLiveResult, announceLiveCommand, connectLiveBridge, watchLiveReady, getLiveLevels, isLiveOwner, registerExecutor, sendLiveText, queueLiveText, liveFn, startLive as startNativeLive, stopLiveSpeech, useLiveUsable } from "../lib/live-session";
import { executeLiveTurn, type LiveTurnState } from "../lib/live-turn";
import { saveSee, screenAllowed, useScreenAccess } from "../lib/screen-access";
import type { LiveTaskRequest, LiveTaskResult } from "../lib/live-task";
import { classicCaptureWanted } from "../lib/live-preferences";
import { voiceTrace } from "../lib/voice-trace";
import { prose } from "../lib/plain";
import { notchFocus, pausedLine, useLearningFocus } from "../lib/notch-focus";
import { NotchActivity } from "../components/NotchActivity";

/** The idle island's small label: what kind of thing the line is, readable at a glance. */
const FOCUS_KICKER: Record<string, string> = { needs: "Needs you", live: "Working", done: "Just finished", learn: "Get better", hold: "On hold" };

/**
 * Spark. On the desktop it's the floating panel; inside the app (`embedded`) it's the side panel — the same
 * conversation in both places, kept in sync.
 */
type Did = Array<{ label: string; ok: boolean; message: string; run?: string }>;
type Msg = { who: "you" | "spark"; text: string; key: string; live?: boolean; id?: number };
/**
 * One message, re-rendered only when that message changes. Every keystroke and streamed chunk used to re-render
 * the whole thread (each row's Markdown plus a layout measurement per row): ~11 ms a key on a busy CPU with 25
 * messages. Now streaming touches only the live row. Entrance is opacity/transform only, no layout projection.
 */
const SparkRow = memo(function SparkRow({ m, did, color, wide, setWide, reduceMotion, showAgain }: { m: Msg; did?: Did; color: string; wide: boolean; setWide: (v: boolean) => void; reduceMotion: boolean; showAgain: (label: string) => void }) {
  const p = m.who === "spark" && !m.live ? parsePoint(m.text) : null;
  const body = m.who === "spark" ? <>{splitDiagrams(speakable(m.text)).map((part, k) => part.kind === "diagram"
    ? (m.live ? <p key={k} className="buddy-typing">Drawing the diagram…</p> : <Diagram key={k} code={part.value} color={color} expanded={wide} onExpand={(v) => setWide(v)} onSave={(name, svg) => post({ type: "saveFile", name, text: svg })} />)
    : <Markdown key={k} text={part.value.replace(/^\s*-{3,}\s*$/m, "")} streaming={m.live} />)}
    {did && <div className="buddy-did">{did.map((d, j) => <motion.button type="button" key={j} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={d.ok ? "is-ok" : "is-bad"} title={d.message} onClick={() => d.run && post({ type: "buddyOpen", run: d.run })}>{d.ok ? <Check size={11} /> : <X size={11} />} {d.ok ? d.message : `${d.label}: ${d.message}`}</motion.button>)}</div>}
    {p && <button type="button" className="buddy-point" onClick={() => showAgain(p.label ?? "")}><MousePointer2 size={11} /> Show me {p.label ? `“${p.label}”` : ""} again</button>}</> : m.text;
  return <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}
    className={m.who === "spark" ? "spk-row" : "spk-row is-you"}>
    <div className={`buddy-msg is-${m.who} ${m.live ? "is-live" : ""}`}>{body}</div>
  </motion.div>;
}, (a, b) => a.m.text === b.m.text && a.m.who === b.m.who && a.m.live === b.m.live && a.did === b.did && a.color === b.color && a.wide === b.wide && a.reduceMotion === b.reduceMotion && a.showAgain === b.showAgain);

/** The conversation's text box: the only part of the notch that re-renders as you type (grows with your text up to 150 px). */
function DraftArea({ inputRef, placeholder, onKeyDown }: { inputRef: React.RefObject<HTMLTextAreaElement | null>; placeholder: string; onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void }) {
  const [value, set] = useCompanionDraft();
  useEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 150)}px`; }, [value, inputRef]);
  return <textarea ref={inputRef} rows={1} value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} onKeyDown={onKeyDown} aria-label="Message" />;
}
/** The hover nook's Ask box: the same draft, subscribed here rather than in the whole notch. */
function DraftInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [value, set] = useCompanionDraft();
  return <input {...props} value={value} onChange={(e) => set(e.target.value)} />;
}

export function Buddy({ embedded = false, full = false, onClose }: { embedded?: boolean; full?: boolean; onClose?: () => void } = {}) {
  const lesson = useTeaching().document, practicing = !!lesson?.practice.active;
  const reduceMotion = useReducedMotion();
  // The draft is read when it's sent, never subscribed to here: typing re-renders only the text box and send button.
  const setDraft = setCompanionDraft;
  const prefs = useCompanion(), voice = useBuddyVoice(), track = useNowPlaying(), { sounds } = useLook();
  // Live is Shua's voice only while Codex can take a call; when it can't (usage limit), everything runs classic:
  // asks go to Claude, fn uses Mac speech, the wake word listens again. It switches back by itself when Live returns.
  const liveOk = useLiveUsable();
  const liveVoice = prefs.voiceEngine === "live" && liveOk;
  const liveVoiceRef = useRef(liveVoice); liveVoiceRef.current = liveVoice;
  // Load Spark's voice as soon as it's on screen, so the first spoken reply starts in a blink instead of after a
  // ~10s cold model load. Re-warms when you switch voices; the gateway keeps it loaded for a while after.
  useEffect(() => {
    if (!voice.on || liveVoice) return;
    const abort = new AbortController();
    void fetch("/api/speech/warm", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: voice.id, warmMinutes: 10 }), signal: abort.signal }).catch(() => {});
    return () => abort.abort();
  }, [voice.on, voice.id, liveVoice]);
  const [openState, setOpen] = useState(false), open = embedded || openState, [tab, setTab] = useState<"chat" | "widgets" | "teach">("chat"), see = useScreenAccess();
  const [brief, setBriefState] = useState<{ q: string; a: string } | null>(null);
  const setBrief = (value: { q: string; a: string } | null) => {
    if (value && liveTurn.current && value.q.trim() === liveTurn.current.request.text.trim()) { liveTurn.current.summary = value.a; queueMicrotask(notifyLiveTurn); }
    setBriefState(value);
  };
  const [busy, setBusy] = useState(""), [error, setErrorState] = useState(""), [speaking, setSpeaking] = useState(false);
  // UI errors (including delayed microphone/guide errors) cannot settle an execution.
  const setError = setErrorState;
  const [done, setDone] = useState<Record<string, Done[]>>({});
  const corrected = useRef(new Set<string>()); // replies whose failed action Shua already owned up to
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
  const workflows = useWorkflows();
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  useEffect(() => { if (native()) void workflowCommand("list").catch(() => {}); }, []);
  const [fnPreparing, setFnPreparing] = useState(false), [accessOpen, setAccessOpen] = useState(false), [missionOpen, setMissionOpen] = useState(false);
  const fnInteraction = useRef("");
  const [observationEvidence, setObservationEvidence] = useState<ScreenEvidence>();
  const presentation = useRef(beginAssistant("initial", 0));
  useEffect(() => {
    const observed = (event: Event) => setObservationEvidence((event as CustomEvent<ScreenEvidence>).detail);
    window.addEventListener("shuacrew:observed", observed);
    return () => window.removeEventListener("shuacrew:observed", observed);
  }, []);
  useEffect(() => {
    if (!fnPreparing || !fnInteraction.current) return;
    const id = fnInteraction.current;
    const frame = requestAnimationFrame(() => { interactionLatency.mark(id, "web-frame", performance.now()); });
    return () => cancelAnimationFrame(frame);
  }, [fnPreparing]);
  const [fnHeld, setFnHeld] = useState(false), [fnSent, setFnSent] = useState(false);
  const fnCapturing = useRef(false);
  useMicLevelVar(talkBtn); // the talk button pulses with your voice without re-rendering Shua
  // A command waiting for your yes.
  /** Your last spoken turn: stays in the notch, shimmering, until Spark starts answering — so you can see it heard you. */
  const [asking, setAsking] = useState<{ kind: "run" | "delete"; command: string; why: string; yes?: string; answer: (yes: boolean) => void } | null>(null);
  const askingRef = useRef(asking); askingRef.current = asking;
  useEffect(() => {
    sparkHooks.confirmRun = (command, why) => new Promise<boolean>((resolve) => {
      setAsking({ kind: "run", command, why, answer: (yes) => { setAsking(null); resolve(yes); } });
      speech.current.say(`I'd like to ${approvalSummary("Bash", { command })}. Approve it? Say yes or no.`);
    });
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
  const liveScreen = useRef(liveOn); liveScreen.current = liveOn;
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
  const [nook, setNook] = useState(false), cancelNookClose = useRef<(() => void) | undefined>(undefined), nookFocus = useRef(false);
  useEffect(() => { if (!nook) cancelNookClose.current?.(); return () => cancelNookClose.current?.(); }, [nook]);
  const [notchTucked, setNotchTucked] = useState(false);
  // The open island: typing swaps the dock for a one-line field; More reveals missions, workflows and access.
  const [islandTyping, setIslandTyping] = useState(false), [islandMore, setIslandMore] = useState(false);
  // The notch island's geometry (from the Mac app: the camera housing's real size) and the open body's measured height.
  const [notchGeo, setNotchGeo] = useState<{ w: number; h: number; real: boolean }>({ w: 200, h: 32, real: false });
  const [islandDrop, setIslandDrop] = useState(250), islandBody = useRef<HTMLDivElement>(null);
  const [liveDrop, setLiveDrop] = useState(78), liveBody = useRef<HTMLDivElement>(null);
  // What's really playing: the player lives in the main app window, so ask it (via the gateway) rather than this page's copy.
  const [radio, setRadio] = useState<RadioNow>({ playing: false, title: null, station: null });
  useEffect(() => { const tick = () => void radioNow().then((r) => setRadio((cur) => (JSON.stringify(cur) === JSON.stringify(r) ? cur : r))); tick(); const t = setInterval(tick, 5000); return () => clearInterval(t); }, []);
  // Inside the app, the mic is only live while the app window is in front (the desktop panel covers the rest).
  const [focused, setFocused] = useState(() => typeof document !== "undefined" && document.hasFocus());
  // A live mic never starts just because the app opened: inside the app it waits until you engage the panel this session.
  const [armed, setArmed] = useState(!embedded);
  useEffect(() => { const f = () => setFocused(true), b = () => setFocused(false); window.addEventListener("focus", f); window.addEventListener("blur", b); return () => { window.removeEventListener("focus", f); window.removeEventListener("blur", b); }; }, []);
  const mic = useRef<HandsFree>(null as unknown as HandsFree); mic.current ??= new HandsFree();
  // A live call owns the mic and the voice: Spark's open mic, fn push-to-talk and the wake word stand aside meanwhile.
  const call = useLiveCall();
  const previousVoiceEngine = useRef(liveVoice);
  const modeSwitchCaptureBlock = useRef(false);
  useEffect(() => { if (previousVoiceEngine.current !== liveVoice) { previousVoiceEngine.current = liveVoice; modeSwitchCaptureBlock.current = true; setVoiceLive(false); if (liveActive()) endLive(); mic.current.stop(); } }, [liveVoice]);
  useEffect(() => connectLiveBridge(), []);
  useEffect(() => watchLiveReady(), []);
  const liveTurnListeners = useRef(new Set<() => void>());
  const notifyLiveTurn = () => { for (const listener of liveTurnListeners.current) listener(); };
  useEffect(() => { notifyLiveTurn(); });
  const liveTurn = useRef<{ request: LiveTaskRequest; summary: string; outcomes: LiveTaskResult["outcomes"]; pending: number; error?: string; visualId?: string } | null>(null);
  const wakeTurn = useRef(false); // "Hey Spark" opened the mic for one request
  const limited = useLive((s) => s.crew.limited);
  const [choice, setChoice] = useState<IntelligenceChoice | null>(null);
  const [choiceError, setChoiceError] = useState("");
  const [convo, setConvo] = useState<CompanionConversation | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } });
  const localPersona = { name: companionName(prefs), tone: prefs.tone, length: prefs.length, memory: memory.facts, goal: memory.goal };
  const localSys = localSystem(localPersona);
  const input = useRef<HTMLTextAreaElement>(null), thread = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  // Scrolled up while new words arrive: a "Latest" button brings you back.
  const [behind, setBehind] = useState(false);
  const convoRef = useRef(convo); convoRef.current = convo;
  const speech = useRef<SpeechQueue>(null as unknown as SpeechQueue); speech.current ??= new SpeechQueue();
  speech.current.hush = call.active || liveVoice;
  useEffect(() => {
    const changed = (event: Event) => { speech.current.hush = (event as CustomEvent).detail.on === true || liveVoiceRef.current; if (speech.current.hush) { speech.current.stop(); mic.current.stop(); } };
    window.addEventListener("shuacrew:livecall", changed);
    return () => window.removeEventListener("shuacrew:livecall", changed);
  }, []);
  // Answers already on screen when the panel loaded were handled before; only new ones point, act and speak.
  const askGen = useRef(0), allowWork = useRef(true), quietTurn = useRef(false);
  const actionRequest = useRef({ id: crypto.randomUUID(), started: performance.now() });
  const focus = useRef<ConversationFocus>(loadFocus());
  const [autopilotWatch, setAutopilotWatch] = useState(readAutopilotWatch);
  const autopilotBusy = useRef(false);
  const completionSeen = useRef(new Set<string>((() => { try { const reports = JSON.parse(localStorage.getItem("shuacrew.completion-reports") ?? "[]"); return Array.isArray(reports) ? reports.flatMap(report => typeof report?.id === "string" ? [report.id] : []) : []; } catch { return []; } })()));
  const [notchUpdate, setNotchUpdate] = useState<{ title: string; text: string; path: string; tone: "done" | "wait"; run: string; turn: number } | null>(null);
  const cropOnly = useRef(false);
  const cropNarration = useRef(false);
  const toggleTalkRef = useRef<() => void>(() => {});
  const [selectedArea, setSelectedArea] = useState<Shot | null>(null);
  const [selectingArea, setSelectingArea] = useState(false);
  const areaSelecting = useRef(false);
  const chooseAreaRef = useRef<(analyze?: boolean) => Promise<void>>(async () => {});
  const [completionReports, setCompletionReports] = useState<Array<{id:string;text:string}>>(() => {
    try { const value:unknown = JSON.parse(localStorage.getItem("shuacrew.completion-reports") ?? "[]"); return Array.isArray(value) ? value.filter(r => r && typeof r.id === "string" && typeof r.text === "string" && !(r.text.includes("crew standup was not completed or saved") && r.text.includes("invalid null duration"))).slice(-20) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("shuacrew.completion-reports",JSON.stringify(completionReports)); } catch { /* optional local history */ } }, [completionReports]);
  const autopilotNotified = useRef(new Set<string>());
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === "shuacrew.voice-autopilot") setAutopilotWatch(readAutopilotWatch());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const askArrival = useRef(0);
  const lastPoint = useRef<{ label: string; screen?: number } | null>(null);
  const pointerRequest = useRef<AbortController | null>(null);
  const [pointerFeedback, setPointerFeedback] = useState<{ label: string; phase: "locating" | "highlighting" | "displayed" | "blocked"; message: string } | null>(null);
  useEffect(() => () => pointerRequest.current?.abort(), []);
  useEffect(() => {
    if (pointerFeedback?.phase !== "displayed") return;
    const timer = setTimeout(() => setPointerFeedback(null), 6500);
    return () => clearTimeout(timer);
  }, [pointerFeedback]);
  const handled = useRef<number | null>(null), spokenUpto = useRef(0), streamId = useRef("");
  const crew = useLive((s) => s.crew), loadRun = useLive((s) => s.loadRun);
  // Live on-device transcription in the Mac app (Apple's recognizer), expecting your crew's and ventures' names.
  const knownNames = useRef<string[]>([]);
  // They circled/underlined something with the cursor while talking: the next ask looks at the screen.
  knownNames.current = [...Object.values(crew.members).map((m) => m.name), ...Object.values(crew.ventures ?? {}).map((v) => (v as { name: string }).name)];
  if (mic.current.live === null && !embedded) mic.current.live = nativeLiveSpeech(() => knownNames.current);
  const events = useLive((s) => (convo ? s.runEvents[convo.run] : undefined)), status = convo ? crew.runs[convo.run]?.status : undefined;
  // How full this conversation is (the newest turn's report): past the limit, the next turn starts fresh with a recap.
  const contextUsed = useMemo(() => { for (let i = (events?.length ?? 0) - 1; i >= 0; i--) { const e = events![i]!; if (e.kind === "usage.recorded") return Number((e.body as { contextUsed?: number }).contextUsed) || 0; } return 0; }, [events]);
  const recorded = convo ? crew.runs[convo.run] : undefined;
  const actualRuntime = recorded?.runtime ?? convo?.runtime;
  const actualModel = recorded?.model ?? convo?.model;
  useEffect(() => {
    if (!open && !islandMore) return; // the chat, or the notch's More panel, both say which brain answers
    let alive = true;
    const refresh = () => void selectIntelligence({ ask: "Shua availability", mode: prefs.brain, ...modelPreference(prefs.modelChoice), localModel: prefs.localModel, purpose: "conversation", images: false, tier: "fast" })
      .then(next => { if (alive) { setChoice(next); setChoiceError(""); } }).catch((e: Error) => { if (alive) setChoiceError(e.message); });
    refresh(); const timer = setInterval(refresh, 30_000); window.addEventListener("focus", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [open, islandMore, prefs.brain, prefs.modelChoice, prefs.localModel, limited]);
  const timer = useFocusTimer(), [now, setNow] = useState(Date.now());
  // Focus shows minutes, so a 10 s tick is plenty (a 1 s tick re-rendered all of Spark every second).
  useEffect(() => { if (!timer) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(t); }, [timer]);
  const [caption, setCaption] = useState<CaptionLine | null>(null);
  // Voice mode, straight from the notch: a live spoken conversation with the chat closed. Never remembered across launches.
  const [voiceLive, setVoiceLive] = useState(false);
  /** A sound for a moment in the conversation, in your chosen style (spatial by default). */
  const sound = (k: Earcon) => earcon(k, prefsRef.current.sounds);
  useEffect(() => soundStyle(prefs.sounds, prefs.soundPack), [prefs.sounds, prefs.soundPack]); // the Mac app plays the fn sounds itself: it needs the style
  // Bounce every sound once, and wake the audio engine, as soon as you touch anything (browsers won't start audio before).
  useEffect(() => {
    const warm = () => warmSounds(prefsRef.current.sounds);
    window.addEventListener("pointerdown", warm, { once: true }); window.addEventListener("keydown", warm, { once: true });
    const t = setTimeout(warm, 1500); // the Mac app lets it start without a gesture
    return () => { clearTimeout(t); window.removeEventListener("pointerdown", warm); window.removeEventListener("keydown", warm); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Voice mode on: you're live (the same sound as holding fn). Off: a closing note. Not on first load.
  const voiceWas = useRef(voiceLive);
  useEffect(() => { if (voiceWas.current !== voiceLive) { sound(voiceLive ? "listen" : "off"); if (voiceLive) macContext.prefetch(); } voiceWas.current = voiceLive; }, [voiceLive]); // eslint-disable-line react-hooks/exhaustive-deps
  // Noticing you're stuck (see lib/stuck): glances while live watching is on; one gentle offer, then quiet.
  const [stuck, setStuck] = useState<StuckOffer | null>(null), stuckState = useRef(STUCK_START), quiet = useRef(false);
  // What Music or Spotify is playing, for the notch (asked of the Mac app; faster while the island is open).
  const [media, setMedia] = useState<{ app: string; playing: boolean; title: string; artist: string; position: number; duration: number; art: string } | null>(null);
  /**
   * Teach-with-drawing: each drawing in a reply waits for Spark's next spoken sentence, then joins what's already on
   * screen, so the picture builds up as it explains. With the voice off (or a slow voice) they appear straight away.
   */
  const drawing = useRef<{ key: string; screen?: number; shapes: ReturnType<typeof parseDraw>; queue: ReturnType<typeof parseDraw>[]; timer?: ReturnType<typeof setTimeout> }>({ key: "", shapes: [], queue: [] });
  const releaseDraw = () => {
    const d = drawing.current, next = d.queue.shift(); if (!next) return;
    d.shapes = [...d.shapes, ...next].slice(-12);
    post({ type: "buddyDraw", shapes: d.shapes, color: accentOf("theme"), ...(d.screen ? { screen: d.screen } : {}) });
    clearTimeout(d.timer); if (d.queue.length) d.timer = setTimeout(releaseDraw, 4000);
  };
  const queueDraw = (key: string, shapes: ReturnType<typeof parseDraw>, screen?: number) => {
    const d = drawing.current;
    // A new reply, or the drawing moves to another display: start a fresh picture there.
    if (d.key !== key || d.screen !== screen) { clearTimeout(d.timer); drawing.current = { key, screen, shapes: [], queue: [] }; }
    drawing.current.queue.push(shapes);
    if (!getBuddyVoice().on || liveActive()) { releaseDraw(); if (liveTurn.current) liveTurn.current.outcomes.push({ description: "Drawing", ok: true, message: "Sent the drawing overlay to the Mac; visual placement is not independently verified." }); return; }
    clearTimeout(drawing.current.timer); drawing.current.timer = setTimeout(releaseDraw, 4000); // never stuck waiting
  };
  useEffect(() => { speech.current.onSpeaking = (on) => { setSpeaking(on); mic.current.speaking = on; post({ type: "buddySpeaking", on }); /* what it points at stays while it explains */ if (!on) { while (drawing.current.queue.length) releaseDraw(); releaseQuiz(); } }; speech.current.onCaption = (c) => { setCaption(c); if (c) releaseDraw(); post({ type: "buddyCaption", text: c?.text ?? "" }); }; }, []);
  useEffect(() => {
    const on = (e: Event) => setHands((e as CustomEvent<{ trusted: boolean; shortcuts: string[] }>).detail);
    window.addEventListener("shuacrew:hands", on); post({ type: "buddyHands" });
    void api<{ voices?: Array<{ id: string }> }>("/api/speech/status").then((s) => setVoices((s.voices ?? []).map((v) => v.id))).catch(() => {});
    return () => window.removeEventListener("shuacrew:hands", on);
  }, []);
  useEffect(() => { if (convo) for (const c of priorConversations(convo)) void loadRun(c.run); }, [convo, loadRun]);
  // The native panel sizes itself to what's showing, so the clear rest never blocks your clicks.
  useEffect(() => { if (!embedded) post({ type: "buddyExpand", open, mini: mini && !open, nook: nook && !open && prefs.desktopPlacement === "notch", wide: open && wide, peek: !open && (practicing || !!bubble || !!guide || morning || evening || !!track.id), size: prefs.size, desktopPlacement: prefs.desktopPlacement }); }, [open, mini, nook, bubble, guide, prefs.size, prefs.desktopPlacement, wide, embedded, morning, evening, track.id, practicing]);
  // Focus only when the user opens a writing surface, never on background status updates.
  useEffect(() => {
    if (!open || tab !== "chat") return;
    const timer = setTimeout(() => input.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open, tab]);
  const openChat = useCallback(() => {
    setNook(false); setMini(false); setTab("chat"); setOpen(true);
    input.current?.focus();
  }, []);
  // The quick card tucks itself away after a quiet stretch (never mid-talk or mid-guide); opening the chat replaces it.
  useEffect(() => { if (open) setMini(false); }, [open]);
  // One conversation in two places: the desktop panel and the app's side panel follow each other.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key !== KEY) return; try { const next = JSON.parse(e.newValue ?? "null"); handled.current = null; setConvo(next); } catch { /* ignore */ } };
    window.addEventListener("storage", on); return () => window.removeEventListener("storage", on);
  }, []);
  useEffect(() => {
    if (embedded) return;
    (window as unknown as { buddy: unknown }).buddy = { audioRoute: setMicRoute, perform, toggle: () => { speech.current.unlock(); setTab("chat"); setNook(false); setOpen((o) => !o); }, focus: () => { speech.current.unlock(); openChat(); },
      prepareCall: () => { setNotchTucked(false); setOpen(false); setMini(prefsRef.current.desktopPlacement !== "notch"); setNook(false); setArmed(true); },
      ask: (text: string) => { speech.current.unlock(); setOpen(true); setTab("chat"); setArmed(true); if (text.trim()) void askRef.current(text.trim().slice(0, 4000)); },
      // Self-test: ask the way a voice turn does — the chat stays closed, so the notch shows the reply.
      notchAsk: (text: string) => { speech.current.unlock(); setArmed(true); if (text.trim()) void askRef.current(text.trim().slice(0, 4000)); },
      nook: (inside: boolean) => nookHover.current(inside),
      // The Mac app calls this when the pointer has left the opened notch for a moment: back to rest, unless you're typing.
      leave: () => leaveOpen.current(),
      // Speak without opening anything, sentence by sentence (captions, voice checks, the Settings preview).
      say: (text: string) => { speech.current.unlock(); for (const s of text.split(/(?<=[.!?])\s+/)) speech.current.say(s); },
      // Self-test (Mac app, SHUACREW_SPARK_SELFTEST=gesture:prompt): a real look, and exactly what Spark would be told
      // about their pointer and what they circled.
      selfTestLook: async () => {
        try { const shot = await capture(); post({ type: "buddySelfTest", ok: true, message: `look ${shot.width}x${shot.height}`, output: pointingText(shot.context, shot.text, shot) || "(nothing about the pointer or a gesture)" }); }
        catch (e) { post({ type: "buddySelfTest", ok: false, message: (e as Error).message }); }
      },
      // Self-test (Mac app, SHUACREW_SPARK_SELFTEST=voiceturn:…): recordings through the real voice turn path, one by one.
      selfTestVoice: async (clips: Array<{ pcm: string; rate: number; name: string; expected?: string }>) => {
        const results: Array<{expected:string;actual:string;ms:number}> = [];
        for (const c of clips) {
          const bytes = Uint8Array.from(atob(c.pcm), (ch) => ch.charCodeAt(0)), samples = new Float32Array(bytes.buffer);
          const t0 = performance.now(), r = await mic.current.replay(samples, c.rate);
          const ms = performance.now() - t0;
          if (c.expected !== undefined) results.push({expected:c.expected,actual:r.text,ms});
          post({ type: "buddySelfTest", ok: c.expected === undefined ? !!r.text : scoreTranscript(c.expected,r.text).exact, message: `voiceturn ${c.name}: source=${r.source} text="${r.text}" turnMs=${Math.round(ms)}` });
        }
        const report = benchmarkSummary(results); post({type:"buddySelfTest",ok:report.controlMismatches === 0 && report.falseActivations === 0,message:"voice benchmark",output:JSON.stringify(report)}); return report;
      },
      notch: (g: { w: number; h: number; real: boolean }) => setNotchGeo((cur) => (cur.w === g.w && cur.h === g.h && cur.real === g.real ? cur : g)),
      // Fn selects a crop; voice capture is owned exclusively by the mic control.
      selectArea: () => { void chooseAreaRef.current(true); },
      toggleVoice: () => toggleTalkRef.current(),
    };
    post({ type: "buddyReady" });
  }, []);

  const historyEvents = useLive(s => s.runEvents);
  const messages = useMemo(() => conversationMessages(convo, historyEvents), [historyEvents, convo]);

  // Speak in real time: each whole sentence as it streams in.
  const live = messages.at(-1)?.live ? messages.at(-1)!.text : "";
  const architectureSession = useRef(emptyArchitectureSession());
  const architectureMessage = useRef("");
  const lessonNarrationOwner = useRef("");
  useEffect(() => {
    if (!live || handled.current === null || !mine() || !allowWork.current) return;
    const key = messages.at(-1)!.key;
    if (streamId.current !== key) { streamId.current = key; spokenUpto.current = 0; }
    const next = nextSentences(live, spokenUpto.current);
    runBlocksRef.current(live, key, false); // act the moment each instruction is complete, not after the whole reply
    spokenUpto.current = next.upto; if (!cropNarration.current && !quietTurn.current && architectureMessage.current !== key) next.chunks.filter(c => !completionClaim(c)).forEach((c) => speech.current.say(c));
  }, [live, convo, messages.length]);

  // Every instruction block runs once, as soon as it has finished streaming. Mouse & keyboard steps wait for the
  // end of the reply (each one hands back a fresh screenshot to continue from).
  const ran = useRef<Map<string, Set<string>>>(new Map());
  const confirmed = useRef(new Set<string>());
  // A visual card: the notch drops open with it (animated) while Spark talks it through, then tucks away on its own.
  const [visual, setVisual] = useState<Visual | null>(null), visualTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A quiz after a lesson waits until Spark has finished explaining (it used to replace the worked steps at once).
  const shownVisual = useRef<Visual | null>(null), laterQuiz = useRef<{ v: Visual; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => { clearTimeout(visualTimer.current); if (laterQuiz.current) clearTimeout(laterQuiz.current.timer); }, []);
  const showVisual = (v: Visual, now = false) => {
    if (v.type === "architecture") {
      const previous = architectureSession.current;
      architectureSession.current = reduceArchitectureSession(previous, { type: "receive", lesson: v });
      if (architectureSession.current === previous) return;
    }
    if (v.type === "quiz" && shownVisual.current?.type === "architecture") return;
    if (v.type === "architecture" && laterQuiz.current) { clearTimeout(laterQuiz.current.timer); laterQuiz.current = null; }
    if (!now && v.type === "quiz" && shownVisual.current && shownVisual.current.type !== "quiz") {
      if (laterQuiz.current) clearTimeout(laterQuiz.current.timer);
      laterQuiz.current = { v, timer: setTimeout(() => releaseQuiz(), 12_000) };
      return;
    }
    shownVisual.current = v; setVisual(v); clearTimeout(visualTimer.current);
    if (v.type === "architecture") return;
    if (!open && prefs.desktopPlacement === "notch") setNook(true);
    // Teaching cards stay long enough to read the working; the rest tuck away sooner.
    const teach = ["math", "code", "table", "quiz", "flow", "sequence", "concept", "cycle", "layers"].includes(v.type);
    visualTimer.current = setTimeout(() => { shownVisual.current = null; setVisual(null); if (!nookFocus.current) setNook(false); }, teach ? 45_000 : 25_000);
  };
  const releaseQuiz = () => { const q = laterQuiz.current; if (!q) return; clearTimeout(q.timer); laterQuiz.current = null; showVisual(q.v, true); };
  const dismissLesson = () => {
    if (visual?.type === "architecture" && lessonNarrationOwner.current === architectureKey(visual)) { speech.current.stop(); lessonNarrationOwner.current = ""; }
    architectureSession.current = reduceArchitectureSession(architectureSession.current, { type: "dismiss" });
    clearTimeout(visualTimer.current);
    if (laterQuiz.current) clearTimeout(laterQuiz.current.timer);
    laterQuiz.current = null;
    shownVisual.current = null;
    setVisual(null);
  };
  const replayLesson = (text: string, narration?: NarrationIdentity) => {
    if (phase === "hearing" || phase === "transcribing" || fnHeld || working || busy) { setError("Finish the current turn before replaying the lesson."); return; }
    if (!getBuddyVoice().on || speech.current.silenced) { setError("Turn voice on to replay this explanation."); return; }
    lessonNarrationOwner.current = narration ? `${narration.lessonId}:${narration.revision}` : "";
    speech.current.unlock(); speech.current.stop(); speech.current.beginTurn(); for (const segment of narrationSegments(text)) speech.current.say(segment, { narration });
  };
  const previousLesson = () => {
    architectureSession.current = reduceArchitectureSession(architectureSession.current, { type: "previous" });
    const previous = architectureSession.current.current;
    if (previous) { shownVisual.current = previous; setVisual(previous); }
  };
  const pinLesson = () => {
    if (visual?.type !== "architecture") return;
    try {
      localStorage.setItem("shuacrew.pinned-lesson", JSON.stringify(visual));
      window.dispatchEvent(new Event("shuacrew:pinned-lesson"));
      post({ type: "buddyOpen", path: "/teach" });
    } catch { setError("Could not save this lesson. Keep it open and try again."); }
  };
  const actionChain = useRef<Promise<void>>(Promise.resolve());
  const looked = useRef(new Set<string>()), recheck = useRef(new Set<string>());
  // "Open X and then Y": the do block runs mid-stream, so the look-again waits here until the reply has finished.
  const finished = useRef(new Set<string>()), carryOn = useRef(new Map<string, () => void>());
  const pointFresh = async (p: { x: number; y: number; label: string; target?: string }, on?: number, guideStep?: { step: number; w: number; h: number }) => {
    pointerRequest.current?.abort();
    post({ type: "buddyGuideStop" });
    const controller = new AbortController();
    pointerRequest.current = controller;
    const label = p.label || "that control";
    setPointerFeedback({ label, phase: "locating", message: `Locating ${label}…` });
    const turn = liveTurn.current;
    if (turn && !readSee() && !liveOn) { turn.error = "Screen access is off. No pointer action ran."; setPointerFeedback({ label, phase: "blocked", message: turn.error }); return; }
    if (turn) turn.pending++;
    const generation = askGen.current, before = screenFacts();
    try {
      const shot = await capture();
      if (generation !== askGen.current || !allowWork.current || controller.signal.aborted || !mine()) return;
      const display = on ? before?.others?.find(s => s.n === on)?.display : before?.display;
      const side = display && display !== shot.display ? shot.others.find(s => s.display === display) : undefined;
      if ((on && !display) || (display && display !== shot.display && !side)) throw new Error("That display is no longer available. Find the target again.");
      const current = side ? { text: side.text, aspect: side.width / side.height } : { context: shot.context, text: shot.text, aspect: shot.width / shot.height };
      const original: ScreenFacts | null = on ? {text: before?.others?.find(s => s.n === on)?.text} : before;
      const r = reacquire({ ...p, w: guideStep?.w ?? .03, h: guideStep?.h ?? .03 }, side ? {...original, context: original?.context ? {...original.context,app:undefined,window:undefined} : undefined} : original, current);
      const where = side ? { screen: side.n } : {};
      if (!r) throw new Error(`I can't uniquely locate “${label}” on the current screen. Show it or name the control again.`);
      lastPoint.current = { label: p.label }; focus.current.target = p.label; saveFocus(focus.current);
      setPointerFeedback({ label, phase: "highlighting", message: `Highlighting ${label}…` });
      if (!native()) throw new Error("Highlighting requires the ShuaCrew Mac app.");
      const exact = guideStep ? { ...guideStep, ...r, label: p.label, done: false as const } : null;
      const receipt = await requestPointer({ type: guideStep ? "buddyGuide" : "buddyPoint", ...r, ...exact, label: p.label, presentation: p.target?.startsWith("T") ? "underline" : "highlight", color: accentOf("theme"), wait: prefs.guide === "click", ...where }, post, window, controller.signal);
      if (controller.signal.aborted || generation !== askGen.current || !allowWork.current || !mine()) return;
      if (!receipt.ok) throw new Error(receipt.message);
      if (exact) setGuide(exact);
      setPointerFeedback({ label, phase: "displayed", message: `Highlight displayed · ${label}` });
      turn?.outcomes.push({ description: guideStep ? "Guide overlay" : "Point overlay", ...receipt });
    } catch (e) {
      if (!controller.signal.aborted && generation === askGen.current) {
        const message = (e as Error).message;
        setError(message); setPointerFeedback({ label, phase: "blocked", message });
        if (turn) turn.error = message;
      }
    }
    finally { if (turn) turn.pending--; notifyLiveTurn(); }
  };
  const runBlocks = (text: string, key: string, final: boolean) => {
    if (!allowWork.current) return;
    const generation = askGen.current, active = () => generation === askGen.current && allowWork.current && mine();
    const seen = ran.current.get(key) ?? new Set<string>(); ran.current.set(key, seen);
    if (final && !finished.current.has(key)) { const paste = pasteTarget(text); if (paste) copyForPaste(paste, native() ? post : undefined); } // "paste this…": it's already on the clipboard
    if (final) { finished.current.add(key); const go = carryOn.current.get(key); if (go) { carryOn.current.delete(key); go(); } }
    if (ran.current.size > 40) ran.current.delete(ran.current.keys().next().value!);
    for (const b of completedBlocks(text, screenSize())) {
      if (liveTurn.current && !readSee() && !liveOn && ["point", "draw", "guide", "act", "zoom"].includes(b.kind)) { liveTurn.current.error = "Screen access is off. No screen interaction ran."; continue; }
      if (cropOnly.current && b.kind !== "visual") continue;
      if (seen.has(b.key) || ((b.kind === "act" || b.kind === "zoom") && !final)) continue;
      seen.add(b.key);
      // On another display: its own coordinates, no snapping to the main display's text and controls.
      const on = blockScreen(b.raw), where = on ? { screen: on } : {};
      if (b.kind === "point") { const p = parsePoint(b.raw); if (p) void pointFresh(p, on); }
      else if (b.kind === "visual") { const v = parseVisual(b.raw); if (v) { if (v.type === "architecture") { architectureMessage.current = key; if (liveTurn.current) liveTurn.current.visualId = v.id; } showVisual(v); } else { const message = "The diagram could not be validated. Your written answer is still available. Ask Shua to regenerate the diagram."; setError(message); if (liveTurn.current) liveTurn.current.error = message; } }
      else if (b.kind === "zoom") {
        // Spark asked to look closer: that region at full resolution goes straight back, and it carries on from there.
        const r = parseZoom(b.raw), size = screenSize();
        if (r && convo) void (async () => {
          try {
            setBusy("Looking closer…");
            const z = await zoomShot(r), att = await upload(z.file);
            const px = size ? `pixels x ${Math.round(r.x * size.width)}–${Math.round((r.x + r.w) * size.width)}, y ${Math.round(r.y * size.height)}–${Math.round((r.y + r.h) * size.height)} of the screenshot` : "the region you asked for";
            if (!active()) return;
            await followUp(convo.run, withAttachments(`[zoom] Here is ${px}, at full resolution (attached). Give every position in the ORIGINAL screenshot's pixels, not this image's. Now carry on with the task.`, [att]));
          } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
        })();
      }
      else if (b.kind === "draw") { const shapes = on ? parseDraw(b.raw) : parseDraw(b.raw).map(fitShape); if (shapes.length) queueDraw(key, shapes, on); }
      else if (b.kind === "guide") {
        const g = parseGuide(b.raw);
        if (g?.done) { setGuide(null); post({ type: "buddyGuideStop" }); setCheer(true); setTimeout(() => setCheer(false), 2400); }
        else if (g) void pointFresh(g, on, g);
      } else if (b.kind === "act") {
        const acts = parseActs(b.raw).map((a) => (on ? { ...a, ...where } as typeof a : a)), act = acts[0] ?? null;
        // Named steps (press, type, keys) run back to back: each is found fresh as it runs. A click or scroll by position
        // goes alone (it needs a fresh look). Asking first, it's one step at a time. What doesn't run is reported back.
        const { run: chain, later } = chainOf(acts);
        const batch: Act[] | null = chain.length > 1 && (prefs.control === "auto" || autoTask) ? chain : null;
        if (act?.type === "done") { stopTask(); }
        else if (act && prefs.control !== "off") {
          const step = (taskRef.current?.step ?? 0) + 1, same = describeAct(act);
          // As long as it takes — but the same move three times in a row means it's stuck: stop and ask, don't loop.
          recentActs.current = [...recentActs.current.slice(-2), same];
          if (recentActs.current.length === 3 && recentActs.current.every((x) => x === same)) { recentActs.current = []; stopTask(`I tried “${same}” three times and it isn't working. Tell me what to try, or take over.`); }
          else { setTask({ step }); actKey.current = key; actReceiptKey.current = `${key}:${b.key}`; if (batch) void runActRef.current(batch, step, later); else if (prefs.control === "auto" || autoTask) void runActRef.current(act, step, acts.filter((a) => a.type !== "done").slice(1)); else setPending(act); }
        }
      } else if (b.kind === "do") {
        const actions = parseActions(b.raw);
        const turn = liveTurn.current;
        if (turn) turn.pending++;
        actionChain.current = actionChain.current.then(async () => {
          if (!active() || corrected.current.has(key)) return;
          let opened = "";
          const failed: string[] = [];
          const results: Array<{ ok: boolean; message: string }> = [];
          // Every delete in this reply: ONE question ("Delete 30 reminders …?"), then they all go — never one prompt each.
          const deletes = actions.filter(isDestructive);
          const approved = deletes.length > 1 && sparkHooks.confirmDelete ? await sparkHooks.confirmDelete(deleteQuestion(deletes)) : null;
          for await (const {action:a,result:r} of actionSequence(actions, async (a,index) => {
            if (approved === false && isDestructive(a)) return {ok:false,message:"Declined. Remaining commands were not run."};
            const measured = actionRequest.current; recordActionTiming({request: measured.id, route:"model", started:measured.started, dispatched:performance.now()});
            return perform(a, {confirmed:approved === true,requestId:`${key}:${b.key}:${index}`,active});
          },active)) {
            const measured=actionRequest.current; results.push(r); turn?.outcomes.push({ description: describeAction(a), ok: r.ok, message: r.message }); recordActionTiming({request:measured.id, route:"model",started:measured.started,completed:performance.now(),ok:r.ok});
            if (r.ok && "ref" in a && a.type !== "crew_decide") { focus.current.run = crewRef(a.ref, "S"); saveFocus(focus.current); } setDone((d) => ({ ...d, [key]: [...(d[key] ?? []), { label: describeAction(a), ...r }] })); if (!r.ok) failed.push(r.message); if (r.ok && (a.type === "open_url" || a.type === "open_app" || a.type === "open_path" || a.type === "open_settings")) opened = a.type === "open_url" ? a.url : a.type === "open_app" ? a.name : a.type === "open_path" ? a.path : `System Settings (${a.pane})`; }
          // It already said "Opening X": if that didn't happen (no such app, a blocked step), say so out loud right away,
          // so a failure never passes as done. Once per reply.
          // Done is said, not just shown: the real result, in a few words ("Added “Launch” on Thu 1 Oct, 11:10 AM"),
          // for the things you'd otherwise have to go and check. Voice conversations only; once per reply.
          const confirm = actions.map((a, i) => ({ a, r: results[i] })).filter(({ a, r }) => r?.ok && (["open_app", "open_url", "open_path", "open_settings", "go", "crew_message", "crew_stop", "crew_review", "crew_pr", "crew_delete", "crew_decide", "crew_open", "quit_app"].includes(a.type) || a.type === "system" || (a.type === "mac" && CONFIRM_OPS.has(a.op)) || (a.type === "media" && (a.command === "play_query" || a.command === "play_similar" || a.command === "playlist")))).map(({ r }) => r!.message.replace(/[.\s]+$/, ""));
          if (!active()) return;
          if (confirm.length && !failed.length && (voiceLive || (prefs.conversation && prefs.listen !== "hold")) && !confirmed.current.has(key)) {
            confirmed.current.add(key);
            sound("done"); sayOwn(`${confirm.slice(0, 2).join(". ")}.`);
          }
          if (failed.length && !corrected.current.has(key)) {
            sound("error");
            corrected.current.add(key);
            const reason = `${failed[0]}. Remaining commands were stopped; the requested task is incomplete.`;
            setError(reason); if(turn) turn.error=reason;
            if (!quietTurn.current) speech.current.say(`Actually, that didn't work: ${failed[0]!.replace(/[.\s]+$/, "")}.`);
          }
          // Opened something as step one ("open an article and underline…", "what's the weather")? Once the reply has
          // finished and the thing has loaded, look at it and do the rest — never stop at "I'll do it once it loads".
          const q = [...messages].reverse().find((m) => m.who === "you")?.text.split("\n\n[screen]")[0] ?? "";
          if (!failed.length && opened && needsFollowThrough(q, text) && !looked.current.has(key)) {
            looked.current.add(key);
            // Give the page time to load, and let Spark finish its sentence first: a new turn stops the voice.
            const go = () => { if (turn) turn.pending++; setTimeout(() => { if (turn) turn.pending--; if (active()) speech.current.whenQuiet(() => { if (active()) void askRef.current(followThroughAsk(opened, q), { look: true, ...(turn ? { origin: "live", signal: turn.request.signal } : {}) }); }); }, 3200); };
            if (finished.current.has(key)) go(); else carryOn.current.set(key, go);
          }
        }).catch(e => { if (active()) setError((e as Error).message); if (turn) turn.error = (e as Error).message; }).finally(() => { if (turn) turn.pending--; notifyLiveTurn(); });
      }
    }
  };
  const runBlocksRef = useRef(runBlocks); runBlocksRef.current = runBlocks;
  /** Which message the current mouse & keyboard step came from, for its receipt. */
  const actKey = useRef(""), actReceiptKey = useRef("");

  // A finished answer: speak what's left, point, and do what it asked.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.who === "spark" && !m.live && m.key.startsWith(`${convo?.run}:`));
    if (events === undefined) return;
    if (handled.current === null) { handled.current = last?.id ?? 0; return; }
    if (!last?.id || last.id <= handled.current) return;
    handled.current = last.id;
    if (!mine() || !allowWork.current) return; // the other Shua surface asked; it speaks and acts
    const key = last.key;
    // "Switched it" with nothing done: don't let the claim stand. Stop saying it and send Spark straight back to do it
    // (or say plainly it can't) — once per turn.
    if (convo && claimsWithoutAction(last.text) && !recheck.current.has(convo.run + ":" + last.id)) {
      recheck.current.add(convo.run + ":" + last.id);
      speech.current.stop(); streamId.current = ""; spokenUpto.current = 0;
      void followUp(convo.run, "[check] Your last reply said you did or are doing something, but it had no block, so NOTHING happened. Do it now with the right block (do / act / settings / guide) in this reply, or say plainly that you can't and what you can do instead. Don't apologise at length.").catch(() => {});
      return;
    }
    if (cropNarration.current) {
      cropNarration.current = false;
      const spoken = speakable(last.text).trim();
      if (spoken && !narrateLiveResult(spoken)) setError("The selection is ready, but live voice could not start. Try Talk to hear it.");
      quietTurn.current = true;
    }
    const rest = nextSentences(last.text, streamId.current === key ? spokenUpto.current : 0, true);
    runBlocksRef.current(last.text, key, true);
    if (liveTurn.current) { liveTurn.current.summary = speakable(last.text).trim() || (liveTurn.current.visualId ? "The architecture lesson is ready in the notch." : ""); queueMicrotask(notifyLiveTurn); }
    if (!cropNarration.current && !quietTurn.current && architectureMessage.current !== key) rest.chunks.filter(c => !completionClaim(c)).forEach((c) => speech.current.say(c)); streamId.current = ""; spokenUpto.current = 0;
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
  const newsBlocked = useRef(true);
  const [news] = useState(() => new QuietAnnouncements(() => newsBlocked.current || (!liveActive() && speech.current.busy), text => {
    if (liveVoiceRef.current && !liveActive()) { startNativeLive("silent"); return false; }
    if (liveActive()) return announceLiveCommand(text);
    speech.current.beginTurn(); speech.current.say(text); return true;
  }));
  const commandBlocked = useRef(true);
  const [commandNews] = useState(() => new QuietAnnouncements(() => commandBlocked.current || (!liveActive() && speech.current.busy), text => {
    if (liveVoiceRef.current && !liveActive()) { startNativeLive("silent"); return false; }
    if (liveActive()) return announceLiveCommand(text);
    speech.current.beginTurn(); speech.current.say(text); return true;
  }));
  useEffect(() => () => commandNews.stop(), [commandNews]);
  const commandActivity = useLive(state => state.activity), commandConnection = useLive(state => state.connection);
  const commandSequence = useRef<number | null>(null);
  useEffect(() => {
    if (commandConnection !== "live") return;
    const head = useLive.getState().crew.head, previous = commandSequence.current;
    commandSequence.current = head;
    if (previous === null || !prefsRef.current.commandNarration || !getBuddyVoice().on || (!mine() && !(liveActive() && isLiveOwner()))) return;
    const current = useLive.getState().crew;
    const names = Object.fromEntries(Object.entries(current.members).map(([id, member]) => [id, member.name]));
    for (const event of commandActivity) {
      if (event.seq <= previous || event.kind !== "tool.called" || !event.run) continue;
      const run = current.runs[event.run]; if (!run) continue;
      const line = commandAnnouncement(event.body.tool, event.body.input, run, names); if (!line) continue;
      commandNews.add(line, () => prefsRef.current.commandNarration && getBuddyVoice().on && !speech.current.silenced && !!useLive.getState().crew.runs[run.id], undefined, `${run.id}:${event.body.id}`, Infinity);
    }
  }, [commandActivity, commandConnection, commandNews]);
  useEffect(() => () => news.stop(), [news]);
  useEffect(() => { speech.current.onError = message => setError(message); return () => { speech.current.onError = undefined; }; }, []);
  // Self-tests log every spoken line (and every repeat dropped) to ~/.shuacrew/spark-selftest.log, so a double shows.
  useEffect(() => { speech.current.onSay = (text, repeat) => { if ((window as { __sparkTiming?: boolean }).__sparkTiming) post({ type: "buddySelfTest", ok: !repeat, message: `${repeat ? "SAY-REPEAT-DROPPED" : "SAY"} ${location.pathname}: ${text.slice(0, 160)}` }); }; return () => { speech.current.onSay = undefined; }; }, []);
  const announce = (text: string, kind: "event" | "reminder" | "welcome" | "timer") => {
    setHeads({ text, kind }); setTimeout(() => setHeads((h) => (h?.text === text ? null : h)), 15_000);
    if (prefs.desktopPlacement !== "notch") setBubble({ text, path: kind === "welcome" ? "/" : "/today" });
    feel("happy");
    if (!inMeeting(agenda.current, Date.now()) && !timer) { lastSound.current = Date.now(); news.add(text, () => mine()); }
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
      news.add(text, () => mine());
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
  const announceCompletion = async (id: string) => {
    const run = useLive.getState().crew.runs[id];
    if (!run || !mine()) return;
    const key = `${id}:${run.turns}`;
    if (completionSeen.current.has(key)) return;
    completionSeen.current.add(key);
    let line = autopilotResult(run.title, run.status) ?? `“${run.title}” has an update.`;
    try { const result = await api<{summary:string}>(`/api/runs/${encodeURIComponent(id)}/spoken-summary`, {body:{}}); line = result.summary; }
    catch { line += " The detailed result is in the session; I couldn't prepare its spoken summary."; }
    const latest = useLive.getState().crew.runs[id];
    if (!latest || latest.turns !== run.turns || latest.status !== run.status || !mine()) return;
    setBubble({text:line,path:`/sessions/${id}`});
    setNotchUpdate({ title: autopilotResult(run.title, run.status) ?? run.title, text: line, path: `/sessions/${id}`, tone: run.status === "failed" ? "wait" : "done", run: id, turn: run.turns });
    setCompletionReports(current => [...current,{id:key,text:line}].slice(-20));
    logSense("heard", "Session summary", line);
    sound(run.status === "failed" ? "error" : "done");
    if (getBuddyVoice().on) news.add(line, () => { const current = useLive.getState().crew.runs[id]; return mine() && current?.turns === run.turns && current.status === run.status; });
  };
  useEffect(() => {
    const work = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && !r.labels?.includes("mission"));
    const prev = seen.current; seen.current = Object.fromEntries(work.map((r) => [r.id, r.status]));
    if (!prev || embedded) return; // crew news is the desktop Shua's to announce, once
    for (const r of work) {
      if (prev[r.id] === r.status || !prev[r.id]) continue;
      if (r.status === "done" || r.status === "merged") feel("happy"); else if (r.status === "failed") feel("concerned");
      const who = r.member ? crew.members[r.member]?.name : null;
      if (r.status === "done" && !autopilotWatch[r.id]) void announceCompletion(r.id);
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
            await followUp(m.run, `${move.message}\n\nOriginal user task:\n${m.task}`);
            update({ rounds: m.rounds + 1, status: "running" });
            setBubble({ text: move.say, path: `/sessions/${m.run}` }); news.add(move.say, () => mine());
            return;
          }
          if (move.kind === "needs-you") { feel("concerned"); update({}); setBubble({ text: move.say, path: `/sessions/${m.run}` }); speech.current.say(move.say); post({ type: "buddyRaise" }); return; }
          const say = move.kind === "report" ? move.say : `“${title}” stopped with a question. It needs you.`;
          const ok = move.kind === "report" && move.ok;
          feel(ok ? "happy" : "concerned");
          update({ done: true });
          if (move.kind === "report") void announceCompletion(m.run); else { setBubble({ text: say, path: `/sessions/${m.run}` }); news.add(say, () => mine()); } post({ type: "buddyRaise" });
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
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("shuacrew-voice-focus");
    const active = speaking || phase === "hearing" || phase === "transcribing" || fnHeld;
    if (active) channel.postMessage("voice-active");
    channel.onmessage = event => { if (event.data === "preview" && active) channel.postMessage("voice-active"); };
    return () => channel.close();
  }, [speaking, phase, fnHeld]);
  useEffect(() => {
    if (visual?.type !== "architecture" || working || busy || asking || phase === "hearing" || phase === "transcribing" || fnHeld || !mine() || !allowWork.current) return;
    if (architectureSession.current.announced.includes(architectureKey(visual))) return;
    architectureSession.current = reduceArchitectureSession(architectureSession.current, { type: "announce" });
    if (quietTurn.current || !getBuddyVoice().on || speech.current.silenced) return;
    lessonNarrationOwner.current = architectureKey(visual);
    for (const segment of narrationSegments(visual.summary)) speech.current.say(segment);
    for (const step of visual.steps) for (const segment of narrationSegments(step.body)) speech.current.say(segment, { narration: { lessonId: visual.id!, revision: visual.revision ?? 1, stepId: step.id! } });
  }, [visual, working, busy, asking, phase, fnHeld]);
  /** You did the step: look again and ask Spark for the next one, from what's really on screen now. */
  const checkingGuide = useRef(false);
  const advance = async () => {
    const step = guide; if (!step || !convo || checkingGuide.current || working) return;
    const generation = askGen.current;
    checkingGuide.current = true;
    post({ type: "buddyGuideStop" }); setBusy("Looking at what changed…"); setError("");
    try {
      await new Promise((r) => setTimeout(r, 700)); // let the app you clicked finish drawing
      const shot = await capture(), atts = await Promise.all(shotFiles(shot).map(upload));
      if (generation !== askGen.current || !allowWork.current) return;
      await followUp(convo.run, withAttachments(guideFollowUp(step.label, shot), atts));
    } catch (e) { setError((e as Error).message); } finally { checkingGuide.current = false; setBusy(""); }
  };
  const advanceRef = useRef(advance); advanceRef.current = advance;
  // The step's spot was clicked, or you did anything else (clicked elsewhere, pressed Return, typed and paused): look again.
  useEffect(() => {
    const on = () => void advanceRef.current();
    window.addEventListener("shuacrew:guideClick", on); window.addEventListener("shuacrew:guideActivity", on);
    return () => { window.removeEventListener("shuacrew:guideClick", on); window.removeEventListener("shuacrew:guideActivity", on); };
  }, []);
  const MAX_STEPS = 30; // A bounded desktop window; review and explicitly continue beyond it.
  const recentActs = useRef<string[]>([]);
  const desktopGeneration = useRef(0);
  const stopTask = (why = "") => {
    desktopGeneration.current++;
    setBusy("");
    pointerRequest.current?.abort(); setPointerFeedback(null); post({ type: "buddyGuideStop" });
    taskRef.current = null; setTask(null); setPending(null); setAutoTask(false); recentActs.current = []; post({ type: "buddyStopWatch" }); speech.current.stop();
    if (why) setError(why);
  };
  /** Do one step with the mouse or keyboard, then look again and ask for the next one. */
  /** Do one step — or a batch back to back (stopping at the first that fails) — then look again once and ask what's next. */
  const runAct = async (steps: Act | Act[], step: number, later: Act[] = []) => {
    if (!convo) return;
    if (step > MAX_STEPS) { stopTask(`Reached ${MAX_STEPS} desktop steps. Review the current app and ask to continue.`); return; }
    const desktopOwner = desktopGeneration.current;
    const generation = askGen.current, active = () => desktopOwner === desktopGeneration.current && generation === askGen.current && allowWork.current && mine() && getCompanion().control !== "off" && screenAllowed(readSee(), liveScreen.current), receiptKey = actReceiptKey.current;
    const list = (Array.isArray(steps) ? steps : [steps]).filter((a) => a.type !== "done");
    if (step <= 1) failStreak.current = 0; // a new task starts clean
    setPending(null);
    try {
      const said: string[] = []; let ok = true, ran = 0;
      for (const [i, a] of list.entries()) {
        if (!active() || (!taskRef.current && i > 0)) return; // stopped mid-batch
        setBusy(describeAct(a) + "…");
        // Shua does every step itself — in web pages through the page's own elements (ShuaWeb), no browser extension.
        if (!screenAllowed(readSee(), liveScreen.current)) throw new Error("Screen access is off. Enable it before desktop actions.");
        const before = screenFacts();
        const checked = await prepareFreshAction(a, before, async () => {
          const fresh = await capture();
          return { display: fresh.display, context: fresh.context, text: fresh.text, aspect: fresh.width / fresh.height };
        }, active);
        if (!active()) return;
        const r = await perform({ ...checked, color: accentOf(prefs.color) }, {requestId:`${receiptKey}:step:${step}:${i}`,active});
        if (!active()) return;
        liveTurn.current?.outcomes.push({ description: describeAct(a), ok: r.ok, message: r.message });
        setDone((d) => { const k = actKey.current; return { ...d, [k]: [...(d[k] ?? []), { label: describeAct(a), ...r }] }; });
        said.push(`${describeAct(a)}${r.ok ? (r.message && r.message !== describeAct(a) ? ` (${r.message})` : "") : ` — FAILED: ${r.message}`}`);
        ran = i + 1;
        if (!r.ok) { ok = false; break; }
        if (i < list.length - 1) await new Promise((go) => setTimeout(go, a.type === "type" || a.type === "key" ? 250 : 450)); // let the app keep up
      }
      // Failing in a row means the approach is wrong, not the wording: it used to re-aim at the same missing field five
      // times, a new name each time, until you said stop. Two in a row: change tack. Three: stop and say what's blocking.
      failStreak.current = ok ? 0 : failStreak.current + 1;
      if (failStreak.current >= 3) { const why = said.at(-1)?.split(" — FAILED: ")[1] ?? "it isn't working"; failStreak.current = 0; stopTask(`Three steps in a row didn't work (${why.replace(/\. Take a fresh look.*$/, "")}). Tell me what to try, or take over from here.`); return; }
      await new Promise((go) => setTimeout(go, 800)); // let the app react before looking
      if (!active() || !taskRef.current) return;
      const shot = await capture(), atts = await Promise.all(shotFiles(shot).map(upload));
      if (!active()) return;
      const tack = failStreak.current === 2 ? " TWO STEPS IN A ROW FAILED: don't retry the same thing under another name. Change approach — press it by its exact name from the controls list, bring the right app or window to the front first, use a keyboard shortcut or a do-action — or say plainly what's blocking and ask." : "";
      // Never let the model assume a step ran: everything planned but not done is named, so "done" can't be invented.
      const notRun = [...list.slice(ran), ...later];
      const skipped = notRun.length ? ` NOT RUN (${notRun.length}): ${notRun.map(describeAct).join("; ")} — ${ok ? "these need your fresh look first" : "nothing after the failure ran"}.` : "";
      await followUp(convo.run, withAttachments(actFollowUp(said.join("; then ") + skipped, ok, shot, step, MAX_STEPS) + tack, atts));
    } catch (e) { if (active()) stopTask((e as Error).message); } finally { if (active()) setBusy(""); }
  };
  const taskRef = useRef(task); taskRef.current = task;
  const failStreak = useRef(0);
  const runActRef = useRef(runAct); runActRef.current = runAct;
  useEffect(() => { const on = () => { void interruptRef.current(); stopTask("Stopped queued actions. An action already sent may finish."); }; window.addEventListener("shuacrew:actStop", on); return () => window.removeEventListener("shuacrew:actStop", on); }, []);
  const stopGuide = () => { setGuide(null); post({ type: "buddyGuideStop" }); speech.current.stop(); };
  /**
   * Stop whatever Spark is doing right now: its voice, a turn still getting ready (the generation counter makes any
   * pending screenshot/upload/model pick give up), and a turn the model is working on. Like ChatGPT's stop button.
   */
  const interrupt = async () => {
    if (workflowBusy()) await workflowCommand("stop").catch(() => {});
    commandNews.stop();
    cropNarration.current = false;
    if (liveActive()) stopLiveSpeech();
    setFnSent(false);
    clearTimeout(drawing.current.timer); drawing.current.queue = [];
    pointerRequest.current?.abort(); setPointerFeedback(null); post({ type: "buddyGuideStop" });
    askGen.current++; allowWork.current = false; quietTurn.current = true; askingRef.current?.answer(false); carryOn.current.clear(); actionChain.current = Promise.resolve(); speech.current.stop(); setBusy(""); if (taskRef.current) stopTask(); if (guide) stopGuide();
    if (convo && (status === "running" || status === "planning" || status === "queued")) await cancelRun(convo.run).catch(() => {});
  };
  const interruptRef = useRef(interrupt); interruptRef.current = interrupt;
  const chooseArea = async (analyze = false) => {
    if (areaSelecting.current) return;
    if (workflowBusy()) { setError("Stop recording or replay before selecting an area."); return; }
    areaSelecting.current = true; setSelectingArea(true);
    try {
      const area = await selectRegion();
      if (area) {
        setSelectedArea(area); setTab("chat"); setNotchTucked(false);
        if (prefsRef.current.desktopPlacement === "notch") { setOpen(false); setNook(true); } else setOpen(true);
        if (analyze && liveActive()) endLive();
        if (analyze) await askRef.current("Read the text in this selected area, then briefly explain what it means. If anything is unreadable, say so rather than guessing.", {area});
        else setDraft(current => current || "Analyze this selected area.");
      }
    } catch (e) { setError((e as Error).message); }
    finally { areaSelecting.current = false; setSelectingArea(false); }
  };
  chooseAreaRef.current = chooseArea;
  const ask = async (text = getCompanionDraft(), opt: { look?: boolean; origin?: "user" | "live"; signal?: AbortSignal; area?: Shot } = {}) => {
    const owningTurn = opt.origin === "live" ? liveTurn.current : null;
    const setError = (message: string) => {
      if (message && (window as { __sparkTiming?: boolean }).__sparkTiming) post({ type: "buddySelfTest", ok: false, message: `ASK ERROR ${message}` });
      if (owningTurn && liveTurn.current === owningTurn && !opt.signal?.aborted && message) { owningTurn.error = message; queueMicrotask(notifyLiveTurn); }
      setErrorState(message);
    };
    const demonstration = demonstrationIntent(text);
    if (demonstration) {
      if (demonstration === "start" && (prefs.control === "off" || !hands.trusted || !!busy || working || !!task || (call.tasks ?? 0) > 0)) { setError("Enable Accessibility and Mac control in Access & tools, and stop active tasks before teaching."); return; }
      try {
        if (demonstration === "stop" && workflows.phase !== "recording") { setError("No demonstration is being recorded."); return; }
        await workflowCommand(demonstration === "start" ? "record" : "stop", demonstration === "start" ? { followForeground: true } : {});
        setWorkflowsOpen(demonstration === "stop"); setOpen(false); setNook(true);
        setBrief({q:text,a:demonstration === "start" ? "Recording your demonstration. Perform the steps, then say stop recording." : "Recording stopped. Review the captured actions and text before saving."});
        clearCompanionDraft(text, getCompanionDraftRevision());
      } catch (e) { setError((e as Error).message); }
      return;
    }
    if (/^(?:(?:show|open|manage)(?: my)? workflows?|record (?:a )?(?:task|workflow)|teach (?:you|shua)(?: a task)?)[.!?]*$/i.test(text.trim())) { setWorkflowsOpen(true); setOpen(false); setNook(true); clearCompanionDraft(text, getCompanionDraftRevision()); return; }
    const replay = replayIntent(text);
    if (replay) {
      if(workflowBusy() || prefs.control === "off" || !hands.trusted || !!busy || working || !!task){setError("Stop current work and enable Mac control before replay.");return;}
      try{const listed=await workflowCommand("list");const matches=replay==="last"?[...listed.library].sort((a,b)=>b.createdAt-a.createdAt).slice(0,1):listed.library.filter(w=>w.name.toLowerCase()===replay.toLowerCase());
        if(matches.length!==1)throw Error("Name one saved workflow exactly, or say replay my last workflow.");const selected=matches[0]!;const issue=workflowReplayIssue(selected,selected.recordedInputs??{});
        setWorkflowsOpen(true);setOpen(false);setNook(true);if(issue)throw Error(issue);
        await workflowCommand("run",{workflowId:selected.id,inputs:selected.recordedInputs??{}});
        setBrief({q:text,a:`Started replay of ${selected.name}. Verification is in progress; the workflow panel shows the result. Escape stops it.`});clearCompanionDraft(text,getCompanionDraftRevision());
      }catch(e){setError((e as Error).message);}return;
    }
    if (workflowBusy()) { setError("Stop the workflow before starting another assistant task."); return; }
    const directMove = producerMove(text.trim());
    const direct = !!directMove && isInstant(directMove);
    if (!opt.area && !selectedArea && !direct && opt.origin !== "live" && liveVoiceRef.current && getBuddyVoice().on) {
      if (queueLiveText(text)) clearCompanionDraft(text, getCompanionDraftRevision()); else setError("Could not queue that voice request. Try a shorter message after the current request.");
      return;
    }
    if (!opt.area && !selectedArea && !direct && opt.origin !== "live" && liveActive()) { if (sendLiveText(text)) clearCompanionDraft(text, getCompanionDraftRevision()); else setError("The call is not ready for text yet."); return; }
    if (/^(?:let me )?(?:select|choose|box|mark) (?:an? |the )?(?:area|region)(?: to analy[sz]e)?[.!?]*$/i.test(text.trim())) { void chooseArea(); return; }
    let draftRevision = getCompanionDraftRevision();
    const clearSubmittedDraft = () => { if (opt.origin !== "live") clearCompanionDraft(text, draftRevision); };
    const area = opt.area ?? (opt.origin === "live" ? null : selectedArea);
    if (!text.trim()) return;
    const q = text.trim() + (area ? "\n\n[Selected area] Analyze only the attached cropped selection. It is a frozen screenshot, not the full display. Do not click, point, guide, or perform actions from crop coordinates. Explain what is visible and ask if context outside this box is needed." : ""); if (!q) return;
    const arrival = ++askArrival.current;
    architectureSession.current = reduceArchitectureSession(architectureSession.current, { type: "new-turn" });
    dismissLesson();
    const autoRequest = autopilotRequest(q);
    if (autoRequest) {
      if (autopilotBusy.current) return;
      const askedId = lastAskedApproval();
      const mentioned = askedId ? crew.approvals[askedId]?.run : undefined;
      const id = autopilotTarget(crew.runs, {target:autoRequest.target, focused:mentioned ?? focus.current.run});
      if (!id) {
        const a = "Which active crew session? Say enable autopilot for, followed by its full session name.";
        setBrief({q,a}); speech.current.say(a); clearSubmittedDraft(); return;
      }
      autopilotBusy.current = true;
      try {
        const result = await api<{ok:boolean;mode:string}>(`/api/runs/${encodeURIComponent(id)}/permission`, {body:{mode:autoRequest.mode}});
        if (!result.ok || result.mode !== autoRequest.mode) throw new Error("The session did not confirm its permission mode.");
        focus.current.run = id; saveFocus(focus.current);
        setAutopilotWatch(before => {
          const next = {...before};
          if (autoRequest.mode === "auto") { next[id] = crew.runs[id]!.title; autopilotNotified.current.delete(id); }
          else delete next[id];
          writeAutopilotWatch(next); return next;
        });
        const a = autoRequest.mode === "auto" ? `Autopilot is on for “${crew.runs[id]!.title}”. I'll let you know when it's finished or ready for review.` : `“${crew.runs[id]!.title}” is back in supervised mode.`;
        setBrief({q,a}); speech.current.unlock(); speech.current.say(a); clearSubmittedDraft();
      } catch (e) { setError(`Could not change Autopilot: ${(e as Error).message}`); }
      finally { autopilotBusy.current = false; }
      return;
    }
    const control = companionControl(q);
    if (control === "silence") { quietTurn.current = true; speech.current.silenced = true; speech.current.stop(); clearSubmittedDraft(); return; }
    if (control === "cancel") { await interrupt(); clearSubmittedDraft(); return; }
    if (control === "open-chat") { setOpen(true); setTab("chat"); clearSubmittedDraft(); return; }
    if (control === "repeat") {
      const last = [...messages].reverse().find(m => m.who === "spark" && !m.live);
      speech.current.unlock(); speech.current.stop(); speech.current.beginTurn(); const silent = speech.current.silenced; speech.current.silenced = false; if (brief?.a || last) speech.current.say(speakable(brief?.a || last!.text)); else setError("There isn't a completed answer to repeat yet."); speech.current.silenced = silent; clearSubmittedDraft(); return;
    }
    if (control === "show-again" && lastPoint.current) { clearSubmittedDraft(); void askRef.current(`Show me “${lastPoint.current.label}” again on the current screen. Point only; do not click.`, { look: true }); return; }
    const move = producerMove(q);
    // A timer/media command can run alongside a model turn; it must not cancel that work.
    if (move && isInstant(move)) {
      const generation = askGen.current, request = {id:crypto.randomUUID(),started:performance.now()};
      speech.current.unlock();
      recordActionTiming({request:request.id,route:"direct",started:request.started,dispatched:performance.now()});
      await runInstant(move, (a) => { recordActionTiming({request:request.id,route:"direct",started:request.started,completed:performance.now()}); setBrief({q,a}); speech.current.say(a); clearSubmittedDraft(); }, {setRadio,soundsVolume:sounds.volume,requestId:request.id,active:()=>generation===askGen.current});
      return;
    }
    if (status === "awaiting_approval") { setError("Approve or decline the waiting step first."); return; }
    // Asking while Spark is still thinking or talking: stop that and take the new question (talk or type over it).
    if (busy || working) await interrupt();
    if (arrival !== askArrival.current) return;
    const gen = ++askGen.current, stale = () => gen !== askGen.current || opt.signal?.aborted === true;
    pointerRequest.current?.abort(); setPointerFeedback(null); post({ type: "buddyGuideStop" });
    cropOnly.current = !!area;
    cropNarration.current = !!area;
    allowWork.current = true; quietTurn.current = opt.origin === "live"; speech.current.silenced = false;
    actionRequest.current = { id: crypto.randomUUID(), started: performance.now() };
    const request = actionRequest.current;
    if (!/^\[(guide|act|check|zoom)\]/.test(q)) { focus.current.task = q; saveFocus(focus.current); }
    followBottom.current = true;
    claim();
    lessonNarrationOwner.current = "";
    speech.current.unlock(); speech.current.stop(); speech.current.beginTurn(); ownLines.current.clear(); setNotchUpdate(null);
    setError(""); setBrief(null); setTab("chat");
    // "agent: …" (Clicky's "clicky agent"): hand it to the crew as a mission and stay with it.
    const mission = missionTask(q, prefs.nickname);
    if (mission) {
      const r = await perform({ type: "crew", ask: mission }, {requestId: request.id, active: () => !stale()});
      if (stale()) return; if (r.run) focus.current.run = r.run;
      const what = mission.length > 70 ? `${mission.slice(0, 67).replace(/\s+\S*$/, "")}…` : mission;
      const a = r.ok ? `The crew's taking “${what}”.${prefs.persist ? " I'll stay with it until it's done." : ""}` : `I couldn't start that: ${r.message}`;
      setBrief({ q, a }); speech.current.say(a); clearSubmittedDraft(); return;
    }
    // Player commands are unambiguous: they run instantly, every time, mid-conversation or not — no model involved.
    if (move?.kind === "hush") { await interrupt(); stopTask(); if (guide) stopGuide(); clearSubmittedDraft(); return; } // stop talking, the turn, any task or walkthrough
    // Voice mode by asking: from the notch it's the live voice session; elsewhere it's the open-mic conversation.
    if (move?.kind === "voice") {
      const notchVoice = prefs.desktopPlacement === "notch" && !embedded;
      const now = notchVoice ? voiceLive : prefs.conversation, next = move.on === "toggle" ? !now : move.on;
      setArmed(true); speech.current.unlock();
      if (notchVoice) setVoiceLive(next); else saveCompanion({ ...parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")), conversation: next });
      const a = next ? (now ? "Voice mode is already on. Just talk." : "Voice mode on. Just talk, I'm listening.") : (now ? "Voice mode off." : "Voice mode is already off.");
      setBrief({ q, a }); speech.current.say(a); clearSubmittedDraft(); return;
    }
    // Instant commands (music, settings pages, folders, focus…) never wait for a model: see spark/commands.

    if (move && !(convo && status && !["failed", "cancelled"].includes(status))) {
      const set = todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, Date.now());
      if (move.kind === "brief") {
        const a = studioAnswer({ track, set, waiting: Object.keys(crew.approvals).length, tokens: crew.today.tokens, costUsd: crew.today.costUsd });
        setBrief({ q, a }); speech.current.say(a); clearSubmittedDraft(); return;
      }
      if (move.kind === "explain") {
        const sel = await new Promise<{ text: string; app: string }>((resolve) => {
          const on = (e: Event) => { window.removeEventListener("shuacrew:selection", on); resolve((e as CustomEvent<{ text: string; app: string }>).detail); };
          window.addEventListener("shuacrew:selection", on); post({ type: "buddySelection" });
          setTimeout(() => { window.removeEventListener("shuacrew:selection", on); resolve({ text: "", app: "" }); }, 1500);
        });
        if (sel.text) logSense("saw", "Read your selection", `${sel.app}: ${sel.text}`);
        if (!sel.text) { const a = native() ? "Select the text or code you want explained first, then ask me again." : "Explain-this reads your selection in the ShuaCrew Mac app."; setBrief({ q, a }); speech.current.say(a); clearSubmittedDraft(); return; }
        clearSubmittedDraft();
        void askRef.current(`Explain this${sel.app ? ` from ${sel.app}` : ""}\n\n[screen] The user selected this and wants it explained at their level: what it is, what it does, why it matters, and one gotcha. Keep it short and concrete. Then add ONE quiz card about the key idea with a card block.\n\n<selection>\n${sel.text}\n</selection>`);
        return;
      }
      if (move.kind === "idea") {
        const r = await api<{ venture: { name: string }; scoring: boolean }>("/api/ideas", { body: { text: move.text } }).catch((e: Error) => ({ error: e.message }));
        const a = "error" in r ? r.error.replace(/^\d+\s*/, "") : `Saved “${r.venture.name}” to your idea inbox.${r.scoring ? " The crew will score it tonight: demand, competitors and effort, in your Library by morning." : ""}`;
        setBrief({ q, a }); speech.current.say(a); clearSubmittedDraft(); return;
      }
    }
    const look = opt.origin === "live" ? screenAllowed(readSee(), liveScreen.current) && (needsScreen(q) || !!opt.look) : !!area || see || liveOn || !!opt.look;
    if (opt.origin !== "live") draftRevision = acceptCompanionDraft(text);
    setBusy(look && !liveOn ? "Reading your screen…" : isDesign(q) ? "Designing…" : "Thinking…");
    // Where a turn's time goes before the model starts (logged during self-tests: SHUACREW_SPARK_SELFTEST=ask:…).
    const t0 = performance.now(), marks: Record<string, number> = {}, mark = (k: string) => { marks[k] = Math.round(performance.now() - t0); if ((window as { __sparkTiming?: boolean }).__sparkTiming) post({ type: "buddySelfTest", ok: true, message: `STEP ${k} ${marks[k]}ms` }); };
    try {
      let atts: Awaited<ReturnType<typeof upload>>[] = [], screen: { width: number; height: number; text: ScreenLine[]; context?: ScreenContext } | null = null;
      let intelligence: IntelligenceRequest = { ask: q, mode: prefs.brain, ...modelPreference(prefs.modelChoice), localModel: prefs.localModel, purpose: "conversation", images: look, tier: turnTier(q, { screen: look, design: isDesign(q) }) };
      // Asked about the weather: the real forecast comes along (Open-Meteo, ~0.3 s), so Spark answers at once instead of
      // web-searching and reading a page (17–20 s in the log). Never allowed to hold a turn up for more than 2 s.
      const weather = asksWeather(q) ? Promise.race([weatherForSpark().catch(() => ""), new Promise<string>((ok) => setTimeout(() => ok(""), 2000))]) : Promise.resolve("");
      // The screenshot doesn't depend on which model answers: take it and upload it NOW, alongside the model pick and
      // your Mac's context (it used to wait for them — ~0.9 s — then run on its own). Measured with the marks above.
      const shooting = look ? (area ? Promise.resolve(area) : capture()).then(async (shot) => { mark("screenshot"); const files = await Promise.all(shotFiles(shot).map(upload)); mark("upload"); return { shot, files }; }) : null;
      shooting?.catch(() => {}); // a failed look is reported where it's used
      const radioAnswer = radioNow(); // asked once, used for the context and the status line
      const musicContext = playingContext(() => radioAnswer);
      const relevantMusic = /\b(music|song|track|album|artist|playlist|playing|listening|spotify|radio)\b/i.test(q);
      const [resolved, mac, playing, forecast, workspace] = await Promise.all([resolveIntelligence(intelligence).finally(() => mark("pick")), macContext().finally(() => mark("mac")), (relevantMusic ? musicContext : optionalContext(musicContext, 150)).finally(() => mark("playing")), weather, workspaceContext()]); const selected = resolved.choice; intelligence = resolved.request; /* the request the gateway will re-check */ mark("context"); const personal = [mac, playing, forecast].filter(Boolean).join("\n"); if (stale()) return; setChoice(selected); setChoiceError(""); setHiRes("model" in selected && seesHiRes(selected.model ?? undefined));
      if (!selected.runtime) throw new Error(selected.reason);
      const brain = selected.runtime, wantLocal = brain === "local";
      const effort = intelligence.tier === "frontier" ? "high" : intelligence.tier === "balanced" ? "medium" : "low";
      const followSelected = (run: string, text: string) => api(`/api/runs/${run}/followup`, { body: { text, runtime: selected.runtime, model: selected.model, intelligence, selection: { runtime: selected.runtime, model: selected.model, effort } } });
      const disposition = turnDisposition(convo ? { runtime: actualRuntime, model: actualModel, status, contextUsed, rules: convo.rules } : null, { ...selected, rules: SPARK_RULES });
      if (disposition === "wait") throw new Error("This turn is still running. Wait or stop it before switching models.");
      // Only capable providers receive images. Local can use explicitly labeled screen text.
      const localNow = !selected.acceptsImages;
      if (look && shooting && (!localNow || needsScreen(q) || opt.look || area)) { const { shot, files } = await shooting; if (stale()) return; if (!localNow) atts = files; if (area && localNow) throw new Error("Choose an image-capable model to analyze the selected area."); if (area) setSelectedArea(null); mark("look"); if (stale()) return; screen = { width: shot.width, height: shot.height, text: shot.text, context: shot.context }; }
      const names = Object.fromEntries(Object.entries(crew.members).map(([id, m]) => [id, m.name]));
      const detail = crewDetail(crew.runs, crew.approvals, names, crew.plays);
      const now = crewNowBlock(track, todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, Date.now()), Object.keys(crew.approvals).length) + (detail ? `\n${detail}` : "");
      // Every follow-up carries the crew as it is now: a conversation only got it when it began, so Spark answered
      // "what's the crew doing?" from an hour ago and couldn't find a session started since (measured live).
      const crewLive = `\n\n${workspace}` + (detail ? `\n\n[crew right now]\n${detail}` : "") + architectureContext(architectureSession.current);
      const rs = getRadio(); if (!rs.loaded) void loadRadio();
      const playingNow = await radioAnswer; setRadio(playingNow); mark("radio");
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
      // Supply the pointing contract on every turn without resetting the existing conversation/history.
      const cursorGuide = screen && !area ? '\nSHOW WITH THE CURSOR: When the user asks "show me", "where is", or "point to" a visible item, emit a point block so the blue cursor companion physically points to it; words alone are insufficient. Use a current accessibility/OCR target ID when available, otherwise verified screenshot coordinates. For a walkthrough, emit a guide block for the next visible step. Showing does not mean clicking. If the item is not visible, explain that and guide to the control that reveals it; never invent its position. Example: ```point {"target":"#12","label":"Settings"}``` — substitute an actual current target. Local/text-only mode may point only to controls with supplied positions.' : '';
      const identity = `CURRENT COMPANION IDENTITY: Your name is ${companionName(prefs)}. Tone: ${prefs.tone}. Answer length: ${prefs.length}.${prefs.personality ? ` User preferences for your personality: ${prefs.personality}` : ""}\nSCREEN STATE: ${screenAllowed(readSee(), liveScreen.current) ? "Screen requests are enabled. Do not ask to turn on the eye." : "Screen requests are off. Do not capture or interact with the screen."} ${screen ? "Fresh screen evidence is attached to this turn." : "No screenshot attached this turn; that is not a macOS permission denial."}\nMAC CONTROL NOW: ${prefs.control === "off" ? "Mouse and keyboard are disabled by the user. Do not emit act blocks." : `Native action bridge is available with ${prefs.control === "ask" ? "approval before each step" : "automatic steps within the requested task"}. Accessibility ${hands.trusted ? "is granted" : "has not been confirmed; report a native denial if returned"}. Emit do blocks to open apps and one act block per observed desktop step; do not describe this as screenshot-only.`}\n${engineLine(brain, selected.model, wantLocal && prefs.brain !== "local")}${rightNow}${cursorGuide}\n${focusContext(focus.current, crew.runs)}`;
      const refreshedRules = convo && convo.rules !== SPARK_RULES ? buddyPrompt("Continue this conversation using these updated instructions.", screen, {name:companionName(prefs),tone:prefs.tone,length:prefs.length,control:prefs.control}, now, appNowBase) : "";
      const appNow = [appNowBase, workspace, identity, remembered, earlier, language, refreshedRules, workflowContext(q)].filter(Boolean).join("\n\n");
      const recap = convo && disposition === "new"
        ? messages.slice(-6).map((m) => `${m.who === "you" ? "User" : "You"}: ${m.text.slice(0, 400)}`).join("\n") : "";
      const screenLines = screen ? [screen.text.length ? screenText(screen.text, 2500, screen) : "", elementsText(screen.context, 120, screen)].filter(Boolean).join("\n") : "";
      // Keep the live part tiny (it's what the local model must read fresh): earlier-today only when you refer back.
      const runningNow = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && (r.status === "running" || r.status === "planning")).length;
      const liveStatus = `radio ${playingNow.playing ? `playing ${playingNow.title ?? playingNow.station ?? "a station"}` : "off"} · ${runningNow} crew session${runningNow === 1 ? "" : "s"} working · ${Object.keys(crew.approvals).length} decision${Object.keys(crew.approvals).length === 1 ? "" : "s"} waiting`;
      const liveLocal = localAsk(q, { now: new Date(), status: liveStatus, screen: screenLines, extra: [identity, workspace, architectureContext(architectureSession.current), remembered, asksAboutEarlier(q) ? earlier : "", recap ? `Earlier in this conversation (carry on naturally):\n${recap}` : ""] });
      // A replaced paused Spark turn must not wake later and repeat the same actions.
      if (convo && status === "paused" && disposition === "new") await cancelRun(convo.run);
      if (wantLocal && disposition === "new") {
        setBrief(null);
        const r = await api<{ id: string }>("/api/runs", { body: { ask: `<spark-system>\n${localSys}\n\n${appNowBase}\n</spark-system>\n${liveLocal}`, title: `${companionName(prefs)} · ${q.slice(0, 60)}`, runtime: "local", model: selected.model, intelligence, labels: ["buddy"] } });
        if (stale()) { await cancelRun(r.id).catch(() => {}); return; }
        const next = { run: r.id, first: q.split("\n\n[screen]")[0]!, runtime: "local", model: selected.model, rules: SPARK_RULES, previous: priorConversations(convo) }; handled.current = 0; setConvo(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
        clearSubmittedDraft(); return;
      }
      if (wantLocal) { await followSelected(convo!.run, `<spark-system>\n${localSys}\n\n${appNowBase}\n</spark-system>\n${liveLocal}`); clearSubmittedDraft(); return; }
      if (convo && disposition === "resume") {
        const mapped = (() => { try { return (JSON.parse(localStorage.getItem("shuacrew.buddy.mapped") ?? "[]") as string[]).includes(convo.run); } catch { return false; } })();
        const withMap = (text: string) => { const t = remembered && !text.includes("\n\n[screen]") ? `${text}\n\n[screen]\n${remembered}` : remembered ? `${text}\n\n${remembered}` : text; return mapped && !refreshedRules ? `${t}\n\n[app]\n${identity}` : `${t}\n\n[app]\n${appNow}`; };
        if (!mapped) { try { const m = JSON.parse(localStorage.getItem("shuacrew.buddy.mapped") ?? "[]") as string[]; localStorage.setItem("shuacrew.buddy.mapped", JSON.stringify([...m.slice(-50), convo.run])); } catch { /* ignore */ } }
        mark("post"); await followSelected(convo.run, withAttachments(withMap((screen ? `${q}\n\n[screen] A fresh screenshot is attached (${screen.width}×${screen.height}). Point, guide, draw or act if it helps.${screen.text.length ? `\n\n${screenText(screen.text, 6000, screen)}` : ""}${screen.context ? `\n\n${elementsText(screen.context, 120, screen)}` : ""}${screen.context && pointingText(screen.context, screen.text, screen) ? `\n\n${pointingText(screen.context, screen.text, screen)}` : ""}` : isDesign(q) ? `${q}\n\n(Use the connected CONCEPT STUDIO architecture visual first, then --- and the readable written design. No competing Mermaid unless requested.)` : q)) + crewLive, atts));
      } else {
        setBrief(null);
        mark("post"); const r = await api<{ id: string }>("/api/runs", { body: { ask: withAttachments(buddyPrompt(q, screen, { name: companionName(prefs), tone: prefs.tone, length: prefs.length, control: prefs.control, shortcuts: hands.shortcuts, voices, voice: prefs.conversation, memory: memory.facts, goal: memory.goal }, now, [appNow, architectureContext(architectureSession.current), installed.current && `INSTALLED APPS (open_app only these; asked for one that isn't here, say it isn't installed and offer its website or the App Store): ${installed.current}`, recap && `EARLIER IN THIS CONVERSATION (carry on naturally):\n${recap}`].filter(Boolean).join("\n\n")), atts), title: `${companionName(prefs)} · ${q.slice(0, 60)}`, runtime: brain, model: selected.model, intelligence, effort, labels: ["buddy"] } });
        if (stale()) { await cancelRun(r.id).catch(() => {}); return; }
        const next = { run: r.id, first: q.split("\n\n[screen]")[0]!, runtime: brain, model: selected.model, rules: SPARK_RULES, previous: priorConversations(convo) }; handled.current = 0; setConvo(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      if (stale()) return;
      if (convo && disposition === "resume" && convo.rules !== SPARK_RULES) { const next = {...convo,rules:SPARK_RULES}; setConvo(next); try {localStorage.setItem(KEY,JSON.stringify(next));} catch {} }
      clearSubmittedDraft(); mark("sent");
      if ((window as { __sparkTiming?: boolean }).__sparkTiming) post({ type: "buddySelfTest", ok: true, message: `timing ${q.slice(0, 40)}`, output: JSON.stringify(marks) });
    } catch (e) { if (!stale()) { setError((e as Error).message.replace(/^\d+\s*/, "")); if (opt.origin !== "live") restoreCompanionDraft(text, draftRevision); if (owningTurn && liveTurn.current === owningTurn) owningTurn.error = (e as Error).message; } } finally { if (!stale()) setBusy(""); }
  };
  // Open mic: every turn you speak is a message; talking over Spark stops it.
  const askRef = useRef(ask); askRef.current = ask;
  const liveState = useRef<() => LiveTurnState>(() => ({ pending: false, summary: "", outcomes: [] }));
  liveState.current = () => ({ progress: convo ? historyEvents[convo.run]?.at(-1)?.seq : undefined, pending: !!busy || working || !!taskRef.current || !!liveTurn.current?.pending || carryOn.current.size > 0,
    summary: liveTurn.current?.summary || "", outcomes: liveTurn.current?.outcomes ?? [], error: liveTurn.current?.error || undefined, visualId: liveTurn.current?.visualId });
  useEffect(() => {
    if (!isLiveOwner() || embedded) return;
    return registerExecutor(async request => {
      if (liveTurn.current) return { status: "unavailable", summary: "Another task is still stopping. Try again in a moment.", outcomes: [] };
      const turn = { request, summary: "", outcomes: [] as LiveTaskResult["outcomes"], pending: 0 };
      liveTurn.current = turn;
      setBrief(null); setError("");
      try { return await executeLiveTurn(request, { screenAllowed: screenAllowed(readSee(), liveScreen.current), needsScreen: needsScreen(request.text),
        dispatch: () => askRef.current(request.text, { origin: "live", signal: request.signal }), state: () => liveState.current(), subscribe: listener => { liveTurnListeners.current.add(listener); return () => { liveTurnListeners.current.delete(listener); }; }, cancel: () => { void interruptRef.current(); } }); }
      finally { if (liveTurn.current === turn) liveTurn.current = null; }
    });
  }, [embedded]);
  const showAgain = useCallback((label: string) => void askRef.current(`Show me “${label || "the previously indicated control"}” again on the current screen. Point only; do not click.`, { look: true }), []);
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
      logSense("heard", "Heard you", t); if (prefsRef.current.interrupt) speech.current.stop();
      if (autopilotRequest(t) || ["silence", "repeat", "open-chat"].includes(companionControl(t) ?? "")) { void askRef.current(t); return; }
      const waiting = askingRef.current;
      if (waiting) { const said = yesOrNo(t); if (said !== null) { waiting.answer(said); return; } waiting.answer(false); } // anything else: keep it, and carry on with what you said
      newTurn();
      if (m.mode !== "hold") sound("sent");
      void askRef.current(t); };
    m.onBargeIn = () => { if (prefsRef.current.interrupt) speech.current.duck(true); };
    // You kept talking over Spark: it stops now, like a person would, instead of waiting for the transcript.
    m.onYield = () => { if (prefsRef.current.interrupt) { logSense("heard", "Interrupted", ""); speech.current.stop(); } };
    m.onDropped = () => { setFnSent(false); speech.current.duck(false); };
    m.outputLevel = () => speech.current.level();
    if (fnCapturing.current) return;
    m.mode = wakeTurn.current ? "auto" : prefs.listen; m.lang = prefs.language;
    if (voiceLive) m.mode = "auto";
    // With Live as the voice the classic open mic stays off: a call is the conversation.
    const wanted = classicCaptureWanted({ engine: liveVoice ? "live" : "classic", conversation: prefs.listen !== "hold" && prefs.conversation, wake: wakeTurn.current, voice: voiceLive, callActive: call.active, switchBlocked: modeSwitchCaptureBlock.current });
    if (call.active) { speech.current.stop(); wakeTurn.current = false; if (voiceLive) setVoiceLive(false); }
    // Voice mode from the notch listens with the chat closed; otherwise the open mic lives with the open card.
    if (wanted && tab !== "teach" && (open || voiceLive) && armed && (!embedded || focused)) { speech.current.unlock(); void m.start(); } else m.stop();
  }, [prefs.conversation, prefs.listen, liveVoice, prefs.language, open, embedded, focused, armed, tab, voiceLive, call.active]);
  // Typing while the mic is open: key clicks never start a voice turn (Whisper made "and" of them), and the notch drops
  // the last thing you said aloud — you're writing now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.metaKey || e.ctrlKey || (e.key.length > 1 && e.key !== "Backspace" && e.key !== "Enter")) return; mic.current.muteFor(800); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  // Push-to-talk with the keyboard: hold Space while Spark's box is empty (or nothing is focused).
  useEffect(() => {
    if (prefs.listen !== "hold" || !open || tab === "teach") return;
    const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; if (!el) return false; if (el === input.current) return !!input.current?.value; return !!el.closest?.("input,textarea,select,[contenteditable=true],.xterm"); };
    const down = (e: KeyboardEvent) => { if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return; e.preventDefault(); setArmed(true); if (viaLive()) { liveFn("down"); liveFn("hold"); } else { speech.current.unlock(); void mic.current.press(); } };
    const up = (e: KeyboardEvent) => { if (e.code !== "Space") return; if (viaLive()) liveFn("release"); else mic.current.release(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); mic.current.release(); };
  }, [prefs.listen, liveVoice, open, tab]);
  useEffect(() => () => mic.current.stop(), []);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  /** Talking goes to a Live call when that's your voice and Live can take it (connected lately, plan not used up). */
  const viaLive = () => liveVoiceRef.current;
  // Guidance stays visible over the app being practiced without taking keyboard
  // focus. Pausing restores the user's normal pin preference.
  useEffect(() => { if (!embedded) post({ type: "buddyOnTop", on: prefs.onTop || practicing }); }, [prefs.onTop, practicing, embedded]);
  // Clicky-style: the collapsed companion rides beside your pointer (native; clicks pass through it while it follows).
  useEffect(() => { if (!embedded) post({ type: "buddyFollow", on: prefs.follow }); }, [prefs.follow, embedded]);
  useEffect(() => { if (!embedded) post({ type: "buddyScreenMemory" }); }, [embedded]); // wakes the recorder if you turned it on
  // "Hey Spark": the Mac app heard it — open, answer, and listen for one request (even with open mic off).
  useEffect(() => { if (!embedded) post({ type: "buddyWake", names: prefs.nickname ? [prefs.nickname] : [], ...(liveVoice ? { on: false } : {}) }); }, [embedded, prefs.nickname, liveVoice]);
  useEffect(() => {
    if (embedded) return;
    const on = () => {
      if (liveActive()) return;
      modeSwitchCaptureBlock.current = false;
      if (viaLive()) return;
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
  const toggleTalk = () => {
    modeSwitchCaptureBlock.current = false;
    if (liveActive()) { if (getLiveSnapshot().mode !== "talk") startNativeLive("talk"); else endLive(); return; }
    if (viaLive()) { setArmed(true); speech.current.unlock(); speech.current.stop(); startLive(); return; }
    if (liveVoice) { setArmed(true); speech.current.unlock(); setVoiceLive(value => !value); return; }
    setArmed(true); speech.current.unlock(); const cur = parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")); saveCompanion({ ...cur, conversation: !prefs.conversation }); };
  toggleTalkRef.current = toggleTalk;
  const reset = () => { dismissLesson(); speech.current.stop(); architectureSession.current = reduceArchitectureSession(architectureSession.current, { type: "reset" }); architectureMessage.current = ""; lessonNarrationOwner.current = ""; stopTask(); stopGuide(); setConvo(null); setBrief(null); setDone({}); try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
  const lastQuestion = [...messages].reverse().find((m) => m.who === "you")?.text;
  // The composer grows with what you type (one line when empty, up to about six).
  useEffect(() => { const el = input.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 150)}px`; }, [open, tab]);
  const focusPct = timer ? 1 - remainingFocusMs(timer, now) / timer.durationMs : 0;

  const status$ = speaking ? "speaking" : phase === "hearing" ? "hearing you" : phase === "transcribing" ? "got it" : working || busy ? "thinking" : prefs.conversation && phase === "listening" ? "listening" : embedded ? "here with you" : "on your Mac";
  // The header says plainly what Spark is doing right now, and what it's minding when it's idle.
  const statusLabel = speaking ? "Speaking" : phase === "hearing" ? "Listening" : phase === "transcribing" ? "Got it" : working || busy ? "Thinking" : prefs.conversation && phase === "listening" ? "Listening" : activeMissions.length ? `Minding ${activeMissions.length} mission${activeMissions.length === 1 ? "" : "s"}` : "Ready";
  const statusLive = speaking || phase === "hearing" || (prefs.conversation && phase === "listening");
  // A live welcome: the time of day, what's actually going on, and suggestions that fit this moment.
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late?" : hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
  const workingNow = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && (r.status === "running" || r.status === "planning")).length;
  const learningFocus = useLearningFocus();
  // Live activity: the crew's own work (not Shua's chat), newest first, shown under the notch while it runs.
  const liveRuns = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && !r.labels?.includes("buddy") && ["running", "planning", "awaiting_approval"].includes(r.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const justFinished = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && r.status === "done" && Date.now() - r.updatedAt < 2 * 3600_000 && !r.labels?.includes("buddy"))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const idleFocus = notchFocus({ approvals, working: workingNow, justFinished: justFinished ? { id: justFinished.id, title: justFinished.title } : null, ...learningFocus, hour });
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
  // The reply as it streams in (spoken words only, no machine blocks): the notch shows it live instead of "Thinking…".
  const streamText = messages.at(-1)?.who === "spark" && messages.at(-1)?.live ? prose(speakable(messages.at(-1)!.text)) : ""; // the notch reads as prose: no stars, hashes or bullets
  const spokenReply = voice.on && !quietTurn.current && !speech.current.silenced && !error;
  const visibleStream = notchReplyText(streamText, "", spokenReply, speech.current.busy);
  quiet.current = !!busy || working || speaking || phase === "hearing" || phase === "transcribing" || !!guide || practicing;
  newsBlocked.current = (call.active && call.mode !== "silent") || quiet.current || fnHeld || inMeeting(agenda.current, Date.now()) || !mine();
  commandBlocked.current = quiet.current || fnHeld || (!call.active && phase === "hearing") || inMeeting(agenda.current, Date.now()) || (!mine() && !(call.active && isLiveOwner()));
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
  useEffect(() => { if (!islandOpen) { setIslandTyping(false); setIslandMore(false); } }, [islandOpen]);
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
  const hearingNow = phase === "hearing" && !fnSent && !!heard;
  // Show processing as a compact wave in the notch, without thinking text or animated words.
  const processing = !speaking && !fnHeld && (fnSent || phase === "transcribing" || (phase !== "hearing" && (!!busy || working || speech.current.busy) && !visibleStream));
  // The cursor buddy mirrors Spark: listening while you talk, thinking while it works, speaking while it answers.
  const buddyState = call.active ? call.state === "speaking" ? "speaking" : call.state === "listening" ? "listening" : call.state === "ready" ? "idle" : "thinking" : companionVoiceState({ held: fnHeld, released: fnSent, phase, speaking, pending: !!busy || working || speech.current.busy });
  const readVoiceLevel = () => {
    if (call.active) { const levels = getLiveLevels(); return buddyState === "speaking" ? levels.voice : buddyState === "listening" ? levels.mic : 0; }
    return buddyState === "speaking" ? speech.current.level() : buddyState === "listening" ? getMicLevel() / 12 : 0;
  };
  useEffect(() => {
    const report = () => post({ type: "buddyState", state: buddyState === "idle" && (task || workflows.phase === "running") ? "thinking" : buddyState, color: accentOf("theme"), colors: cursorGradient("theme") });
    report();
    const observer = new MutationObserver(report);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent", "data-palette", "data-theme"] });
    return () => observer.disconnect();
  }, [buddyState, task, workflows.phase]);
  // Live level for the buddy (~20×/s, only while you talk or Spark does): its halo moves with your voice, it pulses with Spark's.
  useEffect(() => {
    if (buddyState !== "listening" && buddyState !== "speaking") return;
    const t = setInterval(() => {
      const liveLevels = getLiveLevels();
      const raw = call.active ? buddyState === "listening" ? liveLevels.mic : liveLevels.voice : buddyState === "listening" ? getMicLevel() : speech.current.level();
      const v = Math.min(1, Math.sqrt(Math.max(0, raw)) * 3);
      post({ type: "buddyLevel", v: Math.round(v * 100) / 100 });
    }, 50);
    return () => clearInterval(t);
  }, [buddyState, call.active]);
  // Ready for you: fn is down and nothing's been heard yet. Once words come in, the live captions take over.
  const fnReady = notched && fnHeld && !heard;
  useEffect(() => { if (speaking || streamText) setFnSent(false); }, [speaking, streamText]);
  useEffect(() => { if (phase === "error" || error) { setFnHeld(false); setFnSent(false); } }, [phase, error]); // never stuck "listening"
  const streamingNow = !!visibleStream && !speaking && !hearingNow;
  const live$ = useRef({ speaking: false, streaming: false, active: false, listening: false }); live$.current = { speaking, streaming: !!streamText, active: !!busy || working, listening: hearingNow || fnHeld || phase === "transcribing" };
  const lastSound = useRef(0), narrated = useRef(0);
  /**
   * Spark's own lines (progress, "done") go through here: each at most once per turn. Two separate cues both said
   * "Looking that up." on one search — now nothing it says on its own can repeat.
   */
  const ownLines = useRef(new Set<string>());
  const sayOwn = (text: string) => {
    if (quietTurn.current || !allowWork.current) return false;
    const k = text.toLowerCase().replace(/[^a-z ]/g, "").trim();
    if (ownLines.current.has(k)) return false;
    ownLines.current.add(k); lastSound.current = Date.now(); speech.current.say(text); return true;
  };
  // The crew finished something: Spark tells you, like a teammate leaning over — with a sound, and a line in the
  // notch. Only with heads-ups on (Settings → proactive), never for its own turns, never on first load.
  const crewWas = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    const before = crewWas.current; crewWas.current = statuses(crew.runs);
    if (mine()) {
      for (const [id, title] of Object.entries(autopilotWatch)) {
        const line = autopilotResult(title, crew.runs[id]?.status ?? "");
        if (!line || autopilotNotified.current.has(id)) continue;
        autopilotNotified.current.add(id);
        void announceCompletion(id);
        setAutopilotWatch(current => { const next = {...current}; delete next[id]; writeAutopilotWatch(next); return next; });
      }
    }
    if (!before || !prefsRef.current.proactive) return;
    const names = Object.fromEntries(Object.entries(crew.members).map(([id, m]) => [id, m.name]));
    const regular = Object.fromEntries(Object.entries(crew.runs).filter(([id]) => !autopilotWatch[id] && !autopilotNotified.current.has(id)));
    const news = crewFinished(before, regular, names);
    if (!news.length) return;
    for (const [id, run] of Object.entries(regular)) {
      if (before[id] && before[id] !== run.status && autopilotResult(run.title, run.status)) void announceCompletion(id);
    }
  }, [crew.runs, autopilotWatch]); // eslint-disable-line react-hooks/exhaustive-deps
  // The crew needs your OK: Spark says so and offers to answer (a bare "yes" approves it). Only new requests.
  const approvalsWas = useRef<Set<string> | null>(null);
  useEffect(() => {
    const before = approvalsWas.current; approvalsWas.current = new Set(Object.keys(crew.approvals));
    if (!before || !prefsRef.current.proactive) return;
    const names = Object.fromEntries(Object.entries(crew.members).map(([id, m]) => [id, m.name]));
    const ask = crewAsks(before, crew.approvals, crew.runs, names);
    if (!ask) return;
    logSense("heard", "Crew needs your OK", ask.line);
    const approval = crew.approvals[ask.id];
    const approvalRun = approval?.run ? crew.runs[approval.run] : undefined;
    if (approvalRun) setNotchUpdate({ title: "Your crew needs a decision", text: ask.line, path: `/sessions/${approvalRun.id}`, tone: "wait", run: approvalRun.id, turn: approvalRun.turns });
    if (getBuddyVoice().on) news.add(ask.line, () => !!useLive.getState().crew.approvals[ask.id] && mine() && getBuddyVoice().on && !speech.current.silenced, () => noteAsked(ask.line, ask.id));
  }, [crew.approvals]); // eslint-disable-line react-hooks/exhaustive-deps
  // No canned "On it" when you finish talking (it sounded robotic): the model's own first sentence is specific and
  // arrives in ~1.2 s, and the notch shows a small wave during the gap. The quiet clock restarts so progress waits its 4 s.
  const newTurn = () => { ownLines.current.clear(); lastSound.current = Date.now(); };
  useEffect(() => { if (speaking) lastSound.current = Date.now(); }, [speaking]);
  // A long turn never leaves you hanging — but with real news, not filler: after ~4 s of quiet, what it's actually doing
  // ("Pulling up space.com."), twice at most. Nothing specific to say: it stays quiet; working state is available in chat.
  const eventsRef = useRef(events); eventsRef.current = events;
  useEffect(() => {
    if (!busy && !working) { narrated.current = 0; return; }
    if (!(voiceLive || (prefs.conversation && prefs.listen !== "hold"))) return;
    const tick = setInterval(() => {
      // The first real update (what it's searching for, which site it opened) comes after ~1 s of quiet; later ones at 4 s.
      if (live$.current.listening || live$.current.speaking || live$.current.streaming || narrated.current >= 2 || Date.now() - lastSound.current < (narrated.current === 0 ? 1100 : 4000)) return;
      const line = progressLine(eventsRef.current as never, narrated.current); if (!line) return;
      if (sayOwn(line)) narrated.current++;
    }, 400);
    return () => clearInterval(tick);
  }, [busy, working, voiceLive, prefs.conversation, prefs.listen]);
  useEffect(() => {
    if (!notchUpdate) return;
    const current = crew.runs[notchUpdate.run];
    if (!current || current.turns !== notchUpdate.turn || ["running", "planning", "queued"].includes(current.status)) setNotchUpdate(null);
  }, [crew.runs, notchUpdate]);
  const companionApprovals = Object.values(crew.approvals).filter(a => a.run && crew.runs[a.run]?.labels.includes("buddy"));
  const normalActivity = notchActivity({ approval: !!asking || !!pending || !!call.approval || companionApprovals.length > 0, failed: !!error, preparing: fnPreparing, acting: !!task, working: processing || working || !!busy || (call.tasks ?? 0) > 0 || call.state === "working", listening: buddyState === "listening" || (call.active && call.state === "listening"), speaking: speaking || (call.active && call.state === "speaking"), watching: liveOn });
  const activity = workflows.phase === "recording" ? { label: `Watching · ${workflows.stepCount}`, tone: "observing" } : workflows.phase === "running" ? { label: `Workflow · ${workflows.stepIndex + 1}/${workflows.stepCount}`, tone: "working" } : workflows.phase === "needs-approval" ? { label: "Needs permission", tone: "permission" } : normalActivity;
  const assistantPhase: AssistantPhase = asking || pending || call.approval || companionApprovals.length || status === "awaiting_approval" ? "awaiting-approval" : error ? "failed" : fnPreparing ? "preparing" : buddyState === "listening" ? "listening" : task ? "acting" : processing || working || !!busy || (call.tasks ?? 0) > 0 || call.state === "working" ? "planning" : "idle";
  const assistantLabel = pending ? describeAct(pending) : asking?.command || error || (fnPreparing ? "Preparing your turn" : focus.current.task || busy || "Ready when you are");
  const presentationId = `${askGen.current}:${fnPreparing ? fnInteraction.current : "task"}:${assistantPhase === "idle" ? "idle" : "active"}`;
  if (presentation.current.taskId !== presentationId || (presentation.current.phase === "failed" && assistantPhase !== "failed")) presentation.current = beginAssistant(presentationId, askGen.current);
  presentation.current = reduceAssistant(presentation.current, { taskId: presentationId, generation: askGen.current, sequence: presentation.current.lastSequence + 1, phase: assistantPhase, label: assistantLabel });
  const assistantDeck = workflowsOpen ? <WorkflowLibrary onFocusChange={focused => { nookFocus.current = focused; if (focused) post({ type: "buddyNookFocus" }); }} onClose={() => { nookFocus.current = false; setWorkflowsOpen(false); }} blockedReason={prefs.control === "off" ? "Enable Mac control in Access & tools first." : !hands.trusted ? "Grant Accessibility access in Access & tools first." : undefined} disabled={prefs.control === "off" || !hands.trusted || !!busy || working || !!task || (call.tasks ?? 0) > 0} onAdapt={text => { setWorkflowsOpen(false); void ask(text); }} /> : missionOpen ? <AssistantMission onClose={() => setMissionOpen(false)} onStarted={() => setMissionOpen(false)} /> : accessOpen ? <AssistantAccess screenEnabled={see || liveOn} trusted={hands.trusted} control={prefs.control}
    onScreen={() => { if (see || liveOn) void interrupt(); if (liveOn) post({ type: "buddyLive", on: false }); saveSee(!(see || liveOn)); }}
    onAccessibility={() => post({ type: "buddyHands", ask: true })} onControl={control => { if (control === "off") void interrupt(); saveCompanion({ ...prefs, control, autonomy: 2 }); }}
    onClose={() => setAccessOpen(false)} onManage={() => post({ type: "buddyOpen", path: "/integrations" })} />
    : <AssistantDeck state={presentation.current} connection={commandConnection} screenEnabled={see || liveOn} evidence={observationEvidence} trusted={hands.trusted} control={prefs.control}
      background={Object.values(crew.runs).filter(r => r.id !== convo?.run && isTopLevelWork(r, crew.runs) && ["queued", "planning", "running", "awaiting_approval", "paused"].includes(r.status))} brain={choice?.runtime ? { label: `${({ claude: "Claude", codex: "Codex", local: "This Mac" } as Record<string, string>)[choice.runtime] ?? choice.runtime} · ${choice.model}`, note: /usage limit/.test(choice.reason) ? choice.reason.split(" · ")[0] : undefined } : choice ? { label: "No model right now", note: choice.reason } : undefined} onMission={() => setMissionOpen(true)} onWorkflows={() => setWorkflowsOpen(true)} onAsk={text => void ask(text)} onStop={() => void interrupt()} onAccess={() => setAccessOpen(true)} onRun={id => post({ type: "buddyOpen", path: `/sessions/${id}` })} />;
  const pointerStatus = pointerFeedback && <div className="notch-pointer-status" role="status"><MousePointer2 size={14} /><span>{pointerFeedback.message}</span>{pointerFeedback.phase === "blocked" ? <button type="button" onClick={() => showAgain(pointerFeedback.label)}>Find again</button> : pointerFeedback.phase !== "displayed" ? <button type="button" onClick={() => void interrupt()}>Cancel</button> : null}<button type="button" aria-label="Dismiss pointer feedback" onClick={() => { pointerRequest.current?.abort(); setPointerFeedback(null); post({ type: "buddyGuideStop" }); }}><X size={12} /></button></div>;
  const islandWanted = prefs.desktopPlacement === "notch" && notchPreviewWanted({ active: (call.active ? !!liveNotchText(call.feed, call.spokenText) || !!call.approval : !!(heard && (fnHeld || hearingNow || processing)) || !!(prefs.notchCaptions && ((speaking && caption) || visibleStream))) || !!error || pointerFeedback?.phase === "blocked" || !!pending || !!asking || !!task || (prefs.notchActivities !== false && liveRuns.length > 0), tucked: notchTucked, expanded: islandOpen || open });
  // Fluid, never flickering (measured: it opened for 6–58 ms and snapped shut between a reply's sentences, clipping
  // the caption mid-animation): open at once, close only after 0.9 s of real quiet; within a reply the height only
  // grows; and in a gap it keeps showing what it last showed rather than going blank.
  const islandLingering = useLinger(islandWanted, 900);
  const islandLive = islandLingering && !notchTucked && !islandOpen && !open;
  const lastRow = useRef<ReactNode>(null);
  const keepRow = (row: ReactNode) => { if (row) { lastRow.current = row; return row; } return islandLive ? lastRow.current : null; };
  // Self-test instrumentation: every time the island opens, closes or changes height (to count flicker per reply).
  const islandDropNow = islandLive ? liveDrop : 0;
  useEffect(() => {
    const element = liveBody.current;
    if (!islandLive || !element) { setLiveDrop(78); return; }
    const measure = () => setLiveDrop(previous => Math.max(previous, Math.min(170, Math.ceil(element.getBoundingClientRect().height + 18))));
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [islandLive]);
  useEffect(() => { if ((window as { __sparkTiming?: boolean }).__sparkTiming) post({ type: "buddySelfTest", ok: true, message: `island ${islandLive ? "live" : "rest"} drop=${islandDropNow} t=${Math.round(performance.now())} speaking=${+speaking} caption=${+!!caption} streaming=${+streamingNow} voice=${+getBuddyVoice().on} captions=${+prefs.notchCaptions} placement=${prefs.desktopPlacement} chat=${+open} nook=${+islandOpen}`, output: "" }); }, [islandLive, islandDropNow, speaking, !!caption, streamingNow, open, islandOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // Measure the open body so the island drops exactly as far as its content (nothing cut off), and tell the Mac app
  // how big it is so the hover area matches what you see.
  useEffect(() => {
    const el = islandBody.current; if (!el || !islandOpen) return;
    let previous = -1;
    const measure = () => {
      const style = getComputedStyle(el);
      const rows = Array.from(el.children).filter(child => child.getClientRects().length).map(child => {
        const margins = getComputedStyle(child);
        return (child as HTMLElement).offsetHeight + (parseFloat(margins.marginTop) || 0) + (parseFloat(margins.marginBottom) || 0);
      });
      const height = notchContentHeight(rows, (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0), parseFloat(style.rowGap) || 0, 480);
      if (height === previous) return;
      previous = height; setIslandDrop(height); post({ type: "buddyIsland", flare: ISLAND_FLARE, drop: height });
    };
    const ro = new ResizeObserver(measure);
    const observe = () => { ro.disconnect(); ro.observe(el); Array.from(el.children).forEach(child => ro.observe(child)); measure(); };
    const mutations = new MutationObserver(observe); mutations.observe(el, { childList: true }); observe();
    return () => { ro.disconnect(); mutations.disconnect(); };
  }, [islandOpen, call.active, accessOpen, workflowsOpen, companionApprovals.length, islandTyping, islandMore]);
  const nookHover = useRef((_: boolean) => {});
  const leaveOpen = useRef(() => {});
  const scrubbing = useRef(false);
  const scrubHold = useCallback((on: boolean) => { scrubbing.current = on; }, []);
  nookHover.current = (inside: boolean) => {
    cancelNookClose.current?.();
    if (inside) { setNotchTucked(false); if (!open && prefs.desktopPlacement === "notch") setNook(true); return; }
    cancelNookClose.current = scheduleNotchClose(() => {
      nookFocus.current = false; (document.activeElement as HTMLElement | null)?.blur?.(); setNook(false); setNotchTucked(true);
    }, () => scrubbing.current || nookFocus.current || !!getCompanionDraft().trim());
  };
  const nextMoves = lastSpark && !working && !busy ? parseNext(messages.at(-1)!.text) : [];
  // Nothing asked yet: the first three starters (the chat's own, fitting the moment), so the open notch is never an empty box.
  const nookStarters = !messages.length && !working && !busy ? starters.slice(0, 3) : [];
  // The island's one line: what it hears, says or does right now; else what needs you, the last reply, or the day.
  const lastReply = lastSpark ? prose(speakable(messages.at(-1)!.text)) : "";
  const replyText = streamText || (speaking ? lastReply : "");
  const islandHero: { text: string; sub?: string; live?: boolean; shimmer?: boolean; tone?: string } =
    (fnHeld || hearingNow) && heard ? { text: heard, live: true }
    : streamingNow ? { text: visibleStream, live: true }
    : speaking && caption ? { text: caption.text, live: true }
    : processing || working || !!busy ? { text: fnSent && heard ? heard : "Working on it", live: true, shimmer: true }
    : status === "paused" ? { ...pausedLine(recorded?.statusReason), tone: "hold" }
    : lastReply ? { text: lastReply }
    : { text: idleFocus.text, sub: idleFocus.sub, tone: idleFocus.tone };
  const callOwnsIsland = call.active && call.mode !== "silent";
  const islandChip = !fnHeld && !hearingNow && !speaking && !processing && !call.active && !pointerFeedback ? (nextMoves[0] ?? (!messages.length ? idleFocus.ask : undefined) ?? nookStarters[0] ?? null) : null;
  const quick = nextMoves.length ? nextMoves : lastSpark && !working && !busy ? ["Tell me more", "Make it shorter", ...(see ? ["Show me on screen"] : []), ...(prefs.control !== "off" && see ? ["Do it for me"] : [])] : [];
  const close = () => { setNook(false); setMini(false); if (embedded) onClose?.(); else setOpen(false); };
  leaveOpen.current = () => {
    if (embedded || !open || prefs.desktopPlacement !== "notch") return;
    const field = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (field && /^(INPUT|TEXTAREA)$/.test(field.tagName) && field.value.trim()) return; // mid-sentence: stay
    if (optionsPanel.current?.open) return;
    post({ type: "buddySelfTest", ok: true, message: "LEAVE closed the opened notch (pointer away 1.2 s)" });
    close();
  };
  // Doze after 15 quiet minutes with nothing running; anything happening wakes it.
  useEffect(() => { lastStir.current = Date.now(); setSleepy(false); }, [messages.length, speaking, busy, phase, open]);
  useEffect(() => {
    const t = setInterval(() => { const anyRunning = Object.values(useLive.getState().crew.runs).some((r) => r.status === "running" || r.status === "planning"); if (anyRunning) lastStir.current = Date.now(); setSleepy(Date.now() - lastStir.current > 15 * 60_000); }, 30_000);
    return () => clearInterval(t);
  }, []);
  const displayRuntime = working ? actualRuntime : choice?.runtime ?? actualRuntime;
  const displayProvider = displayRuntime === "local" ? "This Mac" : displayRuntime === "claude" ? "Claude" : displayRuntime === "codex" ? "Codex" : displayRuntime ?? "Connecting";
  const mood = (prefs.celebration !== "off" && (cheer || eventMood === "happy")) ? "happy" : speaking ? "speaking" : working || busy ? "thinking" : eventMood === "concerned" ? "concerned" : sleepy ? "sleepy" : "idle";
  const liveVoiceOn = liveVoice;
  const talkEnabled = call.active && call.mode === "talk" || voiceLive;
  const card = <section className={`buddy-card spk ${embedded ? "is-embedded" : ""} ${full ? "is-full" : ""} ${!embedded && prefs.desktopPlacement === "notch" ? "is-notched" : ""} ${callOwnsIsland ? "is-calling" : ""}`} style={sparkVars(prefs.color)} data-chat-style={prefs.chatStyle} data-chat-tone={prefs.chatTone} data-chat-corners={prefs.chatCorners} data-chat-text={prefs.chatText} data-chat-header={prefs.chatHeader} aria-label={`Ask ${companionName(prefs)}`} onPointerDown={() => setArmed(true)} onKeyDown={(e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault(); e.stopPropagation();
    if (busy || working || speaking) void interrupt(); else if (full) setSparkFull(false); else close();
  }}>
      <header className="spk-head">
        <span className={`spk-avatar is-${speaking ? "speaking" : phase === "hearing" ? "hearing" : working || busy ? "thinking" : "idle"}`}><SparkCharacter preferences={prefs} mood={mood} size={38} crop="portrait" /></span>
        <div className="spk-who"><strong>{companionName(prefs)}</strong><span role="status" className={`spk-status spk-pill is-${status$.split(" ")[0]}`}>{statusLive ? <VoiceWaveform compact state={buddyState} readLevel={readVoiceLevel} /> : <i className={`spk-dot ${working || busy ? "is-busy" : ""}`} />}{statusLabel}<span className="spk-provider">· {displayProvider}</span></span></div>
        <button type="button" aria-label="Visual teaching" title="Visual teaching" aria-pressed={tab === "teach"} onClick={() => setTab(tab === "teach" ? "chat" : "teach")}><BookOpen size={15} /></button>
        <button type="button" aria-label={tab === "chat" ? "Open widgets" : "Back to chat"} title={tab === "chat" ? "Widgets & approvals" : "Back to chat"} aria-pressed={tab === "widgets"} onClick={() => setTab(tab === "chat" ? "widgets" : "chat")} className="spk-widget-toggle">{tab === "chat" ? <LayoutGrid size={15} /> : <MessageCircle size={15} />}{approvals > 0 && <i />}</button>
        <details className="spk-options" ref={optionsPanel} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary aria-label="Conversation options" title="Conversation options"><SlidersHorizontal size={15} /></summary>
          <div className="spk-options-panel">
            <span className="spk-options-label">CONVERSATION</span>
            <CompanionModelPicker />
            <p className="spk-routing">{choiceError ? "Provider check unavailable — retry when connected" : choice?.runtime ? `${choice.runtime === "local" ? "This Mac" : choice.runtime} · ${choice.model}${actualRuntime && actualRuntime !== choice.runtime ? " · ready to try next turn" : ""}` : choice?.reason ?? "Checking connected providers…"}</p>
            <button type="button" onClick={() => { speech.current.unlock(); if (voice.on) speech.current.stop(); saveBuddyVoice({ on: !voice.on }); }}>{voice.on ? <Volume2 size={15} /> : <VolumeX size={15} />}<span>Spoken replies</span><b>{voice.on ? "On" : "Off"}</b></button>
            <button type="button" aria-pressed={prefs.conversation} onClick={toggleTalk}><Mic size={15} /><span>Hands-free conversation</span><b>{prefs.conversation ? "On" : "Off"}</b></button>
            <div className="spk-option-row"><span>Microphone mode</span><div className="spk-listen" role="radiogroup" aria-label="How to talk">
              <button type="button" role="radio" aria-checked={prefs.listen === "auto"} onClick={() => setListen("auto")} className={prefs.listen === "auto" ? "is-on" : ""}>Hands-free</button>
              <button type="button" role="radio" aria-checked={prefs.listen === "hold"} onClick={() => setListen("hold")} className={prefs.listen === "hold" ? "is-on" : ""}>Hold</button>
            </div></div>
            <button type="button" aria-pressed={liveOn} disabled={liveBusy} onClick={toggleLive}><Eye size={15} /><span>Watch screen live</span><b>{liveOn ? "On" : "Off"}</b></button>
            {!embedded && <button type="button" onClick={() => { setWide(v => !v); if (optionsPanel.current) optionsPanel.current.open = false; }}><Maximize2 size={15} /><span>{wide ? "Compact conversation" : "Roomier canvas"}</span></button>}
            {convo && !embedded && <button type="button" onClick={() => post({ type: "buddyOpen", run: convo.run })}><MessageCircle size={15} /><span>Open in ShuaCrew</span></button>}
            <button type="button" onClick={() => { if (embedded) window.shuacrew?.navigate("/settings"); else post({ type: "buddyOpen", path: "/settings" }); }}><SlidersHorizontal size={15} /><span>Personalize in Settings</span></button>
            {Object.values(crew.runs).filter(r => r.labels?.includes("buddy") && !("archived" in r && r.archived) && r.id !== convo?.run && ["done","cancelled","failed"].includes(r.status)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,8).map(r => <button key={r.id} type="button" disabled={working || !!busy} onClick={() => void (async () => {
              await loadRun(r.id); const created = useLive.getState().runEvents[r.id]?.find(e => e.kind === "run.created");
              const first = created?.kind === "run.created" ? firstUserAsk(created.body.ask) : r.title;
              const next: CompanionConversation = {run:r.id,first,runtime:r.runtime,model:r.model}; handled.current=null; setConvo(next); setBrief(null); setError(""); localStorage.setItem(KEY,JSON.stringify(next)); if (optionsPanel.current) optionsPanel.current.open=false;
            })().catch(e => setError((e as Error).message))}><MessageCircle size={15}/><span>Resume {r.title}</span></button>)}
            {convo && <button type="button" disabled={working || !!busy || !!task} onClick={() => { reset(); if (optionsPanel.current) optionsPanel.current.open = false; }}><RotateCcw size={15} /><span>New conversation</span></button>}
          </div>
        </details>
        {embedded && <button type="button" className="spk-full-toggle" aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen (Esc)" : "Full screen (⌘⇧J)"} aria-pressed={full} onClick={() => setSparkFull(!full)}>{full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}
        <button type="button" className="spk-close" aria-label={notched ? "Tuck into the notch" : "Close"} title={notched ? "Tuck into the notch (Esc)" : "Close (Esc)"} onClick={close}>{notched ? <Minimize2 size={15} /> : <X size={15} />}</button>
      </header>
      {notched && speaking && prefs.notchCaptions && caption && <div className="shua-chat-caption" role="status" aria-label="Spoken reply"><NotchCaption line={caption} lines={3} /></div>}
      {practicing && tab !== "teach" && <div className="buddy-practice-status" role="status"><button onClick={() => setTab("teach")}>{lesson?.practice.status === "checking" ? "Checking your latest attempt…" : "Your guided lesson is still here"}</button><button onClick={() => void pausePractice().catch(e => setError(String(e)))}>Pause</button></div>}
      {liveOn && <button type="button" className="spk-watch-banner" onClick={toggleLive} disabled={liveBusy}><i />Watching your screen live<span>Stop watching</span></button>}
      <PasteChip copyAgain={(h) => copyForPaste(h, native() ? post : undefined)} />
      <LivePanel />
      {(choiceError || choice?.runtime === null) && <p className="spk-connection-notice" role="status">{choiceError ? "Connection unavailable. Your message stays here." : choice?.reason}</p>}
      {choice?.runtime === "local" && prefs.brain !== "local" && <p className="spk-connection-notice is-fallback" role="status">Claude and Codex are unavailable, so {companionName(prefs)} is on this Mac ({choice.model}): chat and quick actions only. Real work waits for them.</p>}
      {tab === "chat" && (phase === "hearing" || phase === "transcribing" || phase === "error") && <p className="spk-mic-status" role="status">{phase === "hearing" ? "Listening…" : phase === "transcribing" ? "Turning your voice into text…" : "Microphone unavailable. You can keep typing."}</p>}
      {tab === "teach" ? <Teaching compact /> : tab === "widgets" ? <div className="buddy-thread buddy-widgets"><SparkWidgets ctx={embedded ? { go: (path) => { window.shuacrew?.navigate(path); } } : ctx} /></div> : <>
        <div className={`buddy-thread spk-thread${call.active ? " is-voice-thread-hidden" : ""}`} aria-hidden={call.active} ref={thread} onScroll={(e) => { const el = e.currentTarget; followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (followBottom.current) setBehind(false); }}>
          {!messages.length && !brief && <motion.div className="spk-hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <div className="spk-hello-avatar"><SparkCharacter preferences={prefs} mood="happy" size={64} crop="portrait" /></div>
            <h2>{greeting} I'm {companionName(prefs)}.</h2>
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
          {messages.map((m) => <SparkRow key={m.key} m={m} did={done[m.key]} color={accentOf(prefs.color)} wide={wide} setWide={setWide} reduceMotion={!!reduceMotion} showAgain={showAgain} />)}
          </AnimatePresence>
          {brief && messages.length > 0 && <>
            <div className="spk-row is-you"><div className="buddy-msg is-you">{brief.q}</div></div>
            <div className="spk-row"><div className="buddy-msg is-spark"><Markdown text={brief.a} /></div></div>
          </>}
          {completionReports.map(report => <div key={report.id} className="spk-row"><div className="buddy-msg is-spark"><div className="flex items-center justify-between gap-3"><small>Session update</small><button type="button" aria-label="Dismiss session update" title="Dismiss update" onClick={() => setCompletionReports(current => current.filter(item => item.id !== report.id))}><X size={14} /></button></div><p>{report.text}</p></div></div>)}
          {(phase === "hearing" || phase === "transcribing") && <motion.div className="spk-row is-you" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="buddy-msg is-you is-hearing">{heard || (phase === "hearing" ? "Listening…" : "…")}<i className="spk-live-caret" /></div>
          </motion.div>}
          {(busy || (working && messages.at(-1)?.who === "you")) && <motion.div className="spk-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><span className="spk-mini"><SparkCharacter preferences={prefs} mood="thinking" size={26} crop="portrait" /></span><p className="buddy-typing spk-typing"><span /><span /><span /> {busy || "thinking"}</p></motion.div>}
          {(quick.length > 0 || (convo && !working && !busy && lastQuestion)) && <details className="spk-followups">
            <summary>Continue conversation <ChevronRight size={12} /></summary>
          {lastSpark && !working && !busy && <Recommendations ask={[...messages].reverse().find((m) => m.who === "you")?.text.split("\n\n[screen]")[0] ?? ""} />}
          {quick.length > 0 && <motion.div className="spk-quick" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>{quick.map((q) => <button key={q} type="button" onClick={() => void ask(q)}>{q}</button>)}</motion.div>}
          {convo && !working && !busy && lastQuestion && <button type="button" className="buddy-handoff" onClick={() => void perform({ type: "crew", ask: lastQuestion }).then((r) => r.run && (embedded ? window.shuacrew?.navigate(`/sessions/${r.run}`) : post({ type: "buddyOpen", run: r.run })))}><Send size={11} /> Hand this to the crew as a full session</button>}
          </details>}
        </div>
        <AnimatePresence>{behind && <motion.button type="button" className="spk-latest" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} onClick={() => { followBottom.current = true; setBehind(false); thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); }}><ArrowUp size={12} style={{ transform: "rotate(180deg)" }} /> Latest</motion.button>}</AnimatePresence>
        {pointerStatus}
        {error && <div className="buddy-error" role="alert"><span>{error}</span><button type="button" onClick={() => { setError(""); setTab("chat"); input.current?.focus(); }}>Edit message</button></div>}
      </>}
      {activeMissions.length > 0 && <div className="spk-missions" aria-label="Missions I'm staying with">
        {activeMissions.slice(-3).map((m) => { const r = crew.runs[m.run]!; return <button key={m.run} type="button" className={`spk-mission is-${r.status}`} title={m.task}
          onClick={() => (embedded ? window.shuacrew?.navigate(`/sessions/${m.run}`) : post({ type: "buddyOpen", path: `/sessions/${m.run}` }))}>
          <i /><span>{r.title || m.task}</span><small>{r.status === "awaiting_approval" ? "needs you" : r.status.replace("_", " ")}{m.rounds ? ` · pushed ${m.rounds}×` : ""}</small></button>; })}
      </div>}
      {visual && open && (visual.type === "architecture" ? <ArchitectureCard key={architectureKey(visual)} lesson={visual} caption={caption?.text} narration={caption?.narration} onReplay={replayLesson} onPin={pinLesson} onClose={dismissLesson} onFollowup={text => void ask(text)} onPrevious={architectureSession.current.history.length ? previousLesson : undefined} /> : <VisualCard v={visual} onClose={dismissLesson} />)}
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
      {selectedArea && <SelectedAreaPreview {...selectedArea} onClear={() => setSelectedArea(null)} />}
      {tab !== "teach" && <form className="buddy-input spk-input chat-composer" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <button type="button" className={`buddy-see ${see || liveOn ? "is-on" : ""}`} aria-pressed={see || liveOn} title={liveOn ? "Watching your screen live. Stop watching to turn screen access off." : see ? "Screen enabled: I'll capture it when needed. macOS permission is checked on capture." : "Screen off: I won't look"} onClick={() => { if (liveOn) { post({ type: "buddyLive", on: false }); saveSee(false); } else saveSee(!see); }}>{see || liveOn ? <Eye size={15} /> : <EyeOff size={15} />}</button>
        <button type="button" className="buddy-see buddy-area" title="Select an area to analyze" aria-label="Select an area to analyze" disabled={selectingArea || working || !!busy} onClick={() => void chooseArea()}><Maximize2 size={15} /></button>
        <DraftArea inputRef={input} placeholder={prefs.conversation && phase === "listening" ? "Listening… or type" : see ? "Ask or tell me to do it…" : "Ask me anything…"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } }} />
        {liveVoiceOn
          // Live is the voice: the talk button is the call — tap to talk to Shua, tap again to hang up.
          ? <button type="button" className={`buddy-talk is-live ${talkEnabled ? "is-on" : ""}`} aria-pressed={talkEnabled} title={talkEnabled ? "End the call with Shua" : "Enable continuous listening"} aria-label={talkEnabled ? "End call" : "Talk to Shua"} onClick={toggleTalk} ref={talkBtn}><AudioLines size={15} /></button>
          : prefs.listen === "hold"
          ? <button type="button" className={`buddy-talk is-hold is-${phase}`} title="Hold to talk (or hold Space) — let go to send" aria-label="Hold to talk" ref={talkBtn}
              onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setArmed(true); speech.current.unlock(); mic.current.mode = "hold"; void mic.current.press(); }}
              onPointerUp={() => mic.current.release()} onPointerCancel={() => mic.current.release()}><AudioLines size={15} /></button>
          : <button type="button" className={`buddy-talk ${prefs.conversation ? "is-on" : ""} is-${phase}`} aria-pressed={prefs.conversation} title={prefs.conversation ? "Conversation on: just talk. Click to stop listening." : "Talk hands-free: just speak, no buttons"} onClick={toggleTalk} ref={talkBtn}><AudioLines size={15} /></button>}
        <ComposerActions active={!!busy || working || speaking} onStop={() => void interrupt()} />
      </form>}
    </section>;
  if (embedded) return <div className="buddy is-open is-embedded" style={sparkVars(prefs.color)}>{card}</div>;
  return <div className={`buddy ${open ? "is-open" : ""} ${prefs.desktopPlacement === "notch" ? "is-docked" : ""}`} data-size={prefs.size} data-notch-glow={prefs.notchGlow} data-notch-size={prefs.notchSize} data-presence={prefs.presence} data-celebration={prefs.celebration} style={sparkVars(prefs.color)}>
    <AnimatePresence>{open && <motion.div key="card" className={`spk-pop ${notched ? "is-notched" : ""}`} style={notched ? { "--hw": `${notchGeo.w}px`, "--hh": `${notchGeo.h}px` } as CSSProperties : undefined}
      // In the notch the chat grows out of the island like Dynamic Island: the black shape springs open from the notch
      // (transform only, top-centre), and what's inside arrives a beat later (spark-design.css). Elsewhere it rises in.
      initial={reduceMotion ? false : notched ? { opacity: 0, scaleX: 0.7, scaleY: 0.3, y: -4 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, scale: 1, scaleX: 1, scaleY: 1 }}
      exit={reduceMotion ? { opacity: 0 } : notched ? { opacity: 0, scaleX: 0.82, scaleY: 0.4, y: -4, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } } : { opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : notched ? { type: "spring", stiffness: 380, damping: 32, mass: 0.9 } : { type: "spring", stiffness: 420, damping: 34 }}>
      {notched && <div className="shua-chat-cap" aria-hidden="true"><span /><span className="shua-island-cam" /><span /></div>}
      {card}</motion.div>}</AnimatePresence>
    {!open && mini && <MiniCard name={companionName(prefs)} prefs={prefs} mood={mood}
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
    {prefs.desktopPlacement === "notch" ? <div className={`shua-island ${islandOpen ? "is-open" : islandLive ? "is-live" : "is-rest"}${fnHeld ? " is-ready" : ""}${callOwnsIsland ? " is-calling" : ""}`} style={{ "--hw": `${notchGeo.w}px`, "--hh": `${notchGeo.h}px`, "--flare": `${islandOpen ? ISLAND_FLARE : islandLive ? 180 : media?.playing ? 58 : 46}px`, "--drop": `${islandOpen ? islandDrop : islandDropNow}px` } as CSSProperties}
      onMouseEnter={() => nookHover.current(true)} onMouseLeave={() => nookHover.current(false)}>
      <div className="shua-island-shape">
        <NotchAura speaking={buddyState === "speaking"} listening={buddyState === "listening"} processing={processing || working || !!busy || call.state === "connecting" || call.state === "working" || (call.tasks ?? 0) > 0 || workflows.phase === "running"} level={readVoiceLevel} />
        <div className="shua-island-ears">
          <button type="button" className="shua-island-ear is-face" aria-label={`Open ${companionName(prefs)}`} onClick={() => { speech.current.unlock(); openChat(); }}>
            <NotchEqualizer compact state={buddyState === "speaking" ? "speaking" : assistantPhase === "idle" ? (workflows.phase === "recording" ? "watching" : buddyState) : assistantPhase} readLevel={readVoiceLevel} />
            {islandOpen && <strong>{companionName(prefs)}</strong>}
          </button>
          <span className="shua-island-cam" aria-hidden />
          <span className="shua-island-ear is-live">
            {activity ? <button type="button" className={`notch-activity is-${activity.tone}`} title={activity.label} onClick={() => { if (workflowBusy()) setWorkflowsOpen(true); setNook(true); }} aria-label={activity.label}><i aria-hidden /><span>{activity.label}</span></button>
              : approvals > 0 ? <em className="is-wait" aria-label={`${approvals} approvals waiting`}>{approvals}</em>
              : workingNow > 0 ? <em className="is-live" aria-label={`${workingNow} crew sessions working`}>{workingNow}</em>
              : nextTimer ? <em className="is-timer" title={nextTimer.label || "Timer"}><TimeLeft t={nextTimer} /></em>
              : timer ? <em className="is-focus">{Math.ceil(remainingFocusMs(timer, now) / 60000)}m</em>
              : idleFocus.tone === "done" ? <em className="is-done" aria-label={idleFocus.text}><Check size={11} strokeWidth={3} /></em>
              : idleFocus.tone === "learn" ? <em className="is-learn" aria-label={`${idleFocus.text} · ${idleFocus.sub ?? ""}`} title={idleFocus.sub}><b aria-hidden />{learningFocus.due}</em>
              : <i className="shua-island-dot" aria-label="Ready" />}
            {islandOpen && <button type="button" className="shua-island-expand" onClick={openChat} aria-label="Open chat" title="Open chat"><Maximize2 size={12} /></button>}
          </span>
        </div>
        <div className="shua-island-live" ref={liveBody} aria-hidden={!islandLive} inert={!islandLive}>{callOwnsIsland ? <LiveIsland textOnly /> : keepRow(
          // The reading surface is reserved for words; activity stays in the hardware-height header.
          (fnHeld || hearingNow || processing) && heard ? <div className="notch-hearing"><Rolling className="notch-heard">{heard}</Rolling></div>
          // Shua driving the screen: which step it's on, live, right under the notch — and how to stop it.
          : task && busy ? <p className="shua-island-hint is-task" role="status"><i className="notch-task-dot" aria-hidden="true" />Step {task.step} · {busy}<small>Esc to stop</small></p>
          // One surface from first streamed word to last spoken one: speaking brightens words in place, never restarts.
          : (streamingNow || speaking) && prefs.notchCaptions && replyText ? <SpokenReply text={replyText} line={speaking ? caption : null} streaming={!!streamText} />
          : speaking && prefs.notchCaptions && caption ? <NotchCaption line={caption} />
          : pending ? <p className="shua-island-hint">{`Can I ${describeAct(pending).toLowerCase()}? Hover to answer`}</p>
          : task ? <p className="shua-island-hint is-task" role="status"><i className="notch-task-dot" aria-hidden="true" />Step {task.step} · looking at the screen…<small>Esc to stop</small></p>
          : pointerFeedback?.phase === "blocked" ? <p className="shua-island-hint">{pointerFeedback.message}</p>
          : error ? <p className="shua-island-hint">Needs attention · hover for details</p>
          : visual?.type === "architecture" ? <button type="button" className="notch-lesson-peek" onClick={() => setNook(true)}><strong><BookOpen size={12} />{visual.title}<ChevronRight size={12} /></strong><span>{visual.summary}</span><small>{visual.nodes.map(node => node.label).join(" · ")}</small></button>
          : notchUpdate ? <button type="button" className={`notch-update-peek is-${notchUpdate.tone}`} onClick={() => setNook(true)}>{notchUpdate.tone === "wait" ? <Hand size={14} /> : <Check size={14} />}<span>{notchUpdate.title}</span><ChevronRight size={12} /></button>
          : heads ? <p className={`shua-island-hint is-heads is-${heads.kind}`}>{heads.kind === "reminder" ? <Bell size={12} /> : heads.kind === "event" ? <CalendarClock size={12} /> : <Sparkles size={12} />} {heads.text}</p>
          : asking?.kind === "delete" ? <p className="shua-island-hint is-delete"><Trash2 size={12} /> {asking.command}? Say yes or no</p>
          : guide ? <p className="shua-island-hint">Step {guide.step} · {guide.label}</p>
          : stuck ? <p className="shua-island-hint"><Compass size={12} /> {stuck.kind === "error" ? `Stuck in ${stuck.app}? Hover for help` : "Still searching? Hover for help"}</p>
          : liveRuns[0] && prefs.notchActivities !== false ? <NotchActivity run={liveRuns[0]} more={liveRuns.length - 1} onOpen={() => (embedded ? window.shuacrew?.navigate(`/sessions/${liveRuns[0]!.id}`) : post({ type: "buddyOpen", path: `/sessions/${liveRuns[0]!.id}` }))} /> : null)}</div>
        <div className={`shua-island-body${islandMore || workflowsOpen || accessOpen || missionOpen ? " is-more" : ""}`} ref={islandBody} aria-hidden={!islandOpen} inert={!islandOpen}>
          {/* One line, not a text box: what Shua is hearing, saying or doing right now — or your day at a glance. */}
          {!callOwnsIsland && <button type="button" tabIndex={islandOpen ? 0 : -1} className={`isl-hero${islandHero.live ? " is-live" : ""}${islandHero.shimmer ? " is-shimmer" : ""}${islandHero.tone ? ` is-tone-${islandHero.tone}` : ""}`} onClick={openChat} title="Open the conversation">
            {islandHero.tone && islandHero.tone !== "calm" && <span className="isl-kicker"><i />{FOCUS_KICKER[islandHero.tone]}</span>}
            <span className="isl-hero-text">{islandHero.text}</span>{islandHero.sub && <small>{islandHero.sub}</small>}
          </button>}
          {selectedArea && <SelectedAreaPreview {...selectedArea} onClear={() => setSelectedArea(null)} />}
          {companionApprovals.map(approval => <CompanionApproval key={approval.id} approval={approval} />)}
          {callOwnsIsland && <LiveIsland expanded textOnly />}
          {pointerFeedback && pointerStatus}
          {error && !pointerFeedback && <div className="notch-error" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
          {notchUpdate && <article className={`notch-update is-${notchUpdate.tone}`}><header><span>{notchUpdate.tone === "wait" ? "NEEDS YOU" : "CREW UPDATE"}</span><button type="button" aria-label="Dismiss crew update" onClick={() => setNotchUpdate(null)}><X size={13} /></button></header><strong>{notchUpdate.title}</strong>{notchUpdate.text.replace(notchUpdate.title, "").trim() && <p>{notchUpdate.text.replace(notchUpdate.title, "").trim()}</p>}<button type="button" className="notch-update-open" onClick={() => { post({ type: "buddyOpen", path: notchUpdate.path }); setNotchUpdate(null); }}>Open session <ChevronRight size={12} /></button></article>}
          {visual && (visual.type === "architecture" ? <section className="notch-lesson-summary" aria-label="Architecture lesson"><strong>{visual.title}</strong><p>{visual.summary}</p><div><button type="button" onClick={() => { pinLesson(); setNook(false); setNotchTucked(true); }}>Expand diagram <Maximize2 size={12} /></button><button type="button" aria-label="Dismiss lesson" onClick={dismissLesson}><X size={12} /></button></div></section> : <VisualCard v={visual} onClose={dismissLesson} />)}
          {timers.length > 0 && <ul className="spark-nook-timers" aria-label="Timers">{[...timers].sort((a, b) => remaining(a, now) - remaining(b, now)).map((t) => <li key={t.id} className={t.paused !== undefined ? "is-paused" : ""}>
            <span>{t.kind === "alarm" ? <AlarmClock size={13} /> : <Timer size={13} />}{t.label || (t.kind === "alarm" ? "Alarm" : "Timer")}</span>
            <b>{t.kind === "alarm" ? new Date(t.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : <TimeLeft t={t} />}</b>
            <button type="button" tabIndex={islandOpen ? 0 : -1} aria-label={`Cancel ${t.label || t.kind}`} onClick={() => setTimers(getTimers().filter((x) => x.id !== t.id))}>×</button></li>)}</ul>}
          {asking?.kind === "delete" && <div className="spark-nook-stuck is-delete"><div><b>{asking.command}?</b><small>{asking.why[0]!.toUpperCase() + asking.why.slice(1)}.</small></div>
            <button type="button" tabIndex={islandOpen ? 0 : -1} onClick={() => asking.answer(true)}>{asking.yes ?? "Delete"}</button><button type="button" tabIndex={islandOpen ? 0 : -1} onClick={() => asking.answer(false)}>{asking.yes === "Delete" || !asking.yes ? "Keep" : "Cancel"}</button></div>}
          {stuck && <div className="spark-nook-stuck"><div><b>{stuck.kind === "error" ? `Stuck in ${stuck.app}?` : "Still searching?"}</b><small>{stuck.detail}</small></div>
            <button type="button" tabIndex={islandOpen ? 0 : -1} className="is-go" onClick={stuckHelp}>Show me</button><button type="button" tabIndex={islandOpen ? 0 : -1} onClick={stuckLater}>Not now</button></div>}
          <LiveActivities tab={islandOpen ? 0 : -1} showMedia={showMedia} media={media} mediaCmd={mediaCmd} mediaSeek={mediaSeek} scrubHold={scrubHold} activeMissions={activeMissions} runs={crew.runs}
            task={pending ? task : null} pending={pending} guide={guide} busy={!!busy} working={working} runAct={(a, step) => void runAct(a, step)} doAll={() => { setAutoTask(true); if (pending && task) void runAct(pending, task.step); }}
            stopTask={stopTask} advance={() => void advance()} stopGuide={stopGuide} radio={radio} setRadio={setRadio} timer={timer} now={now} focusPct={focusPct} workingRuns={workingRuns} approvals={approvals} />
          {(islandMore || workflowsOpen || accessOpen || missionOpen) && <div className="isl-more">
            {workflowsOpen || accessOpen || missionOpen || !["recording", "review"].includes(workflows.phase) ? assistantDeck : <NotchTeachingBar inline state={workflows} blocked={prefs.control === "off" || !hands.trusted || !!busy || working || !!task || (call.tasks ?? 0) > 0}
              onToggle={() => ask(workflows.phase === "recording" ? "stop watching" : "watch me")} onReview={() => setWorkflowsOpen(true)}>{assistantDeck}</NotchTeachingBar>}
          </div>}
          {/* The dock: four ways in, one suggestion. Typing swaps the dock for a slim line, never a box. */}
          <div className={`isl-dock${islandTyping ? " is-typing" : ""}`}>
            {islandTyping ? <>
            <form className="spark-nook-ask isl-type" onSubmit={(e) => { e.preventDefault(); const d = getCompanionDraft(); if (!d.trim()) return; void ask(d); }}>
              <DraftInput autoFocus tabIndex={islandOpen ? 0 : -1} onPointerDown={() => post({ type: "buddyNookFocus" })} onFocus={() => { nookFocus.current = true; macContext.prefetch(); post({ type: "buddyNookFocus" }); }} onBlur={() => { nookFocus.current = false; }} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (busy || working || speaking) void interrupt(); else { nookFocus.current = false; e.currentTarget.blur(); setIslandTyping(false); } } }} placeholder={`Ask ${companionName(prefs)}…`} aria-label={`Ask ${companionName(prefs)}`} />
              <ComposerActions compact active={!!busy || working || speaking} onStop={() => void interrupt()} tabIndex={islandOpen ? 0 : -1} />
            </form>
            </> : <>
              <button type="button" tabIndex={islandOpen ? 0 : -1} className={`isl-btn is-talk${talkEnabled ? " is-on" : ""}`} aria-pressed={talkEnabled} onClick={toggleTalk} title={talkEnabled ? "End the conversation" : "Talk"} aria-label={talkEnabled ? "End call" : "Talk"}>{talkEnabled ? <Square size={13} /> : <Mic size={15} />}</button>
              <button type="button" tabIndex={islandOpen ? 0 : -1} className="isl-btn" onClick={() => { setIslandTyping(true); post({ type: "buddyNookFocus" }); }} title="Type" aria-label="Type"><Keyboard size={15} /></button>
              <button type="button" tabIndex={islandOpen ? 0 : -1} className={`isl-btn${see || liveOn ? " is-on" : ""}`} aria-pressed={see || liveOn} onClick={() => { if (see || liveOn) void interrupt(); if (liveOn) post({ type: "buddyLive", on: false }); saveSee(!(see || liveOn)); }} title={see || liveOn ? "Stop looking at the screen" : "Look at my screen"} aria-label="Screen"><Eye size={15} /></button>
              <button type="button" tabIndex={islandOpen ? 0 : -1} className={`isl-btn${islandMore ? " is-on" : ""}`} aria-pressed={islandMore} onClick={() => setIslandMore(v => !v)} title="Missions, workflows, access" aria-label="More"><Ellipsis size={15} /></button>
              {islandChip && <button type="button" tabIndex={islandOpen ? 0 : -1} className="isl-chip" onClick={() => void ask(islandChip)} title={islandChip}><Sparkles size={12} /><span>{islandChip}</span></button>}
              <button type="button" tabIndex={islandOpen ? 0 : -1} className="isl-btn is-open" onClick={openChat} title="Open the full conversation" aria-label="Open chat"><ArrowUpRight size={15} /></button>
            </>}
          </div>
        </div>
      </div>
    </div> : <div className={`buddy-spark size-${prefs.size} ${working || busy ? "is-thinking" : ""} ${speaking ? "is-speaking" : ""}`} aria-hidden="true">
      {timer && <svg className="buddy-focus" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="46" className="fill" style={{ strokeDashoffset: `${289 * (1 - focusPct)}` }} /></svg>}
      <SparkCharacter preferences={prefs} mood={mood} /><i className="buddy-shadow" />
      {approvals > 0 && <em className="buddy-badge">{approvals}</em>}
    </div>}
  </div>;
}
