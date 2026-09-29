import { validFinish } from "./spark-color";
import { useSyncExternalStore } from "react";
export interface CompanionPreferences {
  version: 1; enabled: boolean; kind: "spark" | "crew"; nickname: string;
  face: "calm" | "curious" | "bright"; accessory: "none" | "cap" | "headphones" | "scarf" | "glasses" | "antenna" | "badge";
  presence: "interaction" | "subtle" | "playful"; placement: "corner" | "room-header";
  celebration: "off" | "subtle" | "expressive"; sound: boolean; volume: number; focus: "hide" | "still";
  /** Spark, made yours: who it is, its colour and size on the desktop, how it talks, how you summon it. */
  character: SparkCharacterId; color: string; eyeColor: string; personality: string; size: "s" | "m" | "l";
  tone: "cheerful" | "chill" | "direct" | "coach"; length: "brief" | "detailed";
  hotkey: SparkHotkey; guide: "click" | "manual";
  /** Mouse & keyboard: never, ask before each step, or autopilot (Esc stops). Voice: open-mic conversation. */
  control: "off" | "ask" | "auto"; conversation: boolean; interrupt: boolean;
  /** How the mic takes a turn: "auto" (open mic, just talk) or "hold" (push-to-talk: hold the talk button or Space). */
  listen: "auto" | "hold";
  /** On the desktop: pinned above every app, or (default) a normal window that comes forward when called, talking or teaching. */
  onTop: boolean;
  desktopPlacement: "free" | "notch";
  /** Radio DJ: a short spoken intro when a new track or station starts. Off unless you turn it on. */
  dj: boolean;
  /** What you speak: "en" (fastest, live captions) or "auto" (any language; Spark answers in it). */
  language: "en" | "auto";
  /** Spark's brain: "auto" = shared connected-provider routing with local conversation fallback; "local" = always on this Mac. */
  brain: "auto" | "local";
  modelChoice: string;
  /** Which local model: smart (gpt-oss 20B) or fast (Llama 3.2 3B). */
  localModel: "gpt-oss:20b" | "llama3.2:3b";
  /** Follow my cursor: the collapsed companion rides beside the pointer, Clicky-style (on by default). */
  follow: boolean;
  /** Keep going on its own: work handed to the crew becomes a mission Spark stays with to the end (on by default). */
  persist: boolean;
  /** How the chat window looks: solid (default) or frosted glass; its tone, corners, text size and header. */
  chatStyle: "solid" | "glass"; chatTone: "theme" | "deep" | "accent"; chatCorners: "round" | "soft" | "square"; chatText: "s" | "m" | "l"; chatHeader: "plain" | "gradient";
  /** The notch island: live captions while Spark talks, what's playing (with artwork), mic + screen controls, its edge glow and size. */
  /** Notice when I'm stuck: while live watching is on, Spark glances at the screen's text and offers help, unasked. */
  notice: boolean;
  /** Speak first: a heads-up before meetings, reminders when due, a catch-up when you come back (on by default). */
  proactive: boolean; headsUpMinutes: 5 | 10 | 15;
  notchCaptions: boolean; notchMedia: boolean; notchControls: boolean; notchGlow: "off" | "accent" | "spectrum"; notchSize: "compact" | "roomy";
}
export const ROBOT_CHARACTERS = ["spark", "scout", "atlas", "nova"] as const;
/** Retain saved legacy companions without offering them as new robot choices. */
export const SPARK_CHARACTERS = [...ROBOT_CHARACTERS, "orb", "byte", "kit", "blob"] as const;
export type SparkCharacterId = (typeof SPARK_CHARACTERS)[number];
export const SPARK_HOTKEYS = { "ctrl-opt-space": "⌃⌥Space", "ctrl-shift-space": "⌃⇧Space", "opt-shift-space": "⌥⇧Space", "ctrl-opt-s": "⌃⌥S" } as const;
export type SparkHotkey = keyof typeof SPARK_HOTKEYS;
export const SPARK_COLORS = ["#8e48ff", "#f5b544", "#ff7a59", "#f472b6", "#a78bfa", "#60a5fa", "#34d399", "#e5e7eb"] as const;
export function parseCompanion(value: unknown): CompanionPreferences {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const choice = <T extends string>(key: string, options: readonly T[], fallback: T): T => options.includes(v[key] as T) ? v[key] as T : fallback;
  return { version: 1, enabled: v.enabled === true, kind: choice("kind", ["spark", "crew"], "spark"), nickname: typeof v.nickname === "string" ? [...v.nickname.trim()].slice(0, 40).join("") || "Spark" : "Spark",
    face: choice("face", ["calm", "curious", "bright"], "calm"), accessory: choice("accessory", ["none", "cap", "headphones", "scarf", "glasses", "antenna", "badge"], "none"),
    presence: choice("presence", ["interaction", "subtle", "playful"], "subtle"), placement: choice("placement", ["corner", "room-header"], "corner"), celebration: choice("celebration", ["off", "subtle", "expressive"], "subtle"),
    sound: v.sound === true, volume: typeof v.volume === "number" && Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1 ? v.volume : 0.25, focus: choice("focus", ["hide", "still"], "still"),
    character: choice("character", SPARK_CHARACTERS, "spark"), color: validFinish(v.color) ? (v.color === "theme" ? "theme" : v.color.toLowerCase()) : "theme",
    eyeColor: typeof v.eyeColor === "string" && /^#[0-9a-f]{6}$/i.test(v.eyeColor) ? v.eyeColor.toLowerCase() : "#a5f3fc",
    personality: typeof v.personality === "string" ? v.personality.slice(0, 1000) : "",
    size: choice("size", ["s", "m", "l"], "m"), tone: choice("tone", ["cheerful", "chill", "direct", "coach"], "cheerful"), length: choice("length", ["brief", "detailed"], "brief"),
    hotkey: choice("hotkey", Object.keys(SPARK_HOTKEYS) as SparkHotkey[], "ctrl-opt-space"), guide: choice("guide", ["click", "manual"], "click"),
    control: choice("control", ["off", "ask", "auto"], "ask"), conversation: v.conversation === true, interrupt: v.interrupt !== false,
    desktopPlacement: choice("desktopPlacement", ["free", "notch"], "free"), listen: choice("listen", ["auto", "hold"], "auto"), onTop: v.onTop === true, dj: v.dj === true, language: choice("language", ["en", "auto"], "en"),
    modelChoice: typeof v.modelChoice === "string" && /^[a-z0-9_-]+:[a-zA-Z0-9_.:-]+$/.test(v.modelChoice) && !v.modelChoice.startsWith("local:") ? v.modelChoice.slice(0,160) : "",
    // Spark always uses connected cloud models: the on-Mac models were slow (up to a minute a reply) and held ~16 GB of GPU.
    brain: "auto", localModel: choice("localModel", ["gpt-oss:20b", "llama3.2:3b"], "gpt-oss:20b"),
    follow: v.follow !== false, persist: v.persist !== false,
    chatStyle: choice("chatStyle", ["solid", "glass"], "solid"), chatTone: choice("chatTone", ["theme", "deep", "accent"], "theme"), chatCorners: choice("chatCorners", ["round", "soft", "square"], "round"),
    chatText: choice("chatText", ["s", "m", "l"], "m"), chatHeader: choice("chatHeader", ["plain", "gradient"], "plain"),
    notice: v.notice !== false, proactive: v.proactive !== false, headsUpMinutes: ([5, 10, 15] as const).find((m) => m === v.headsUpMinutes) ?? 10, notchCaptions: v.notchCaptions !== false, notchMedia: v.notchMedia !== false, notchControls: v.notchControls !== false,
    notchGlow: choice("notchGlow", ["off", "accent", "spectrum"], "accent"), notchSize: choice("notchSize", ["compact", "roomy"], "roomy") };
}
export type CompanionPose = "offline" | "review" | "failed" | "working" | "idle";
export function companionPose(input: { connected: boolean; needsApproval: boolean; failed: boolean; active: boolean }): CompanionPose {
  return !input.connected ? "offline" : input.needsApproval ? "review" : input.failed ? "failed" : input.active ? "working" : "idle";
}
export function celebrateCompletion(state: { seen: string[]; watermark: number; lastCelebratedAt: number }, event: { id: string; seq: number }, now: number, pose: CompanionPose) {
  const fresh = event.seq > state.watermark && !state.seen.includes(event.id);
  const celebrate = fresh && pose === "idle" && now - state.lastCelebratedAt >= 10000;
  return { celebrate, state: { seen: [...state.seen.filter(id => id !== event.id), event.id].slice(-200), watermark: Math.max(state.watermark, event.seq), lastCelebratedAt: celebrate ? now : state.lastCelebratedAt } };
}
function load() {
  try {
    const p = parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null"));
    // The Pristine redesign: the old default amber becomes Iris once; a colour you picked yourself stays.
    if (localStorage.getItem("shuacrew.companion.design") !== "pristine") { if (p.color === "#f5b544") p.color = "#8e48ff"; localStorage.setItem("shuacrew.companion.design", "pristine"); localStorage.setItem("shuacrew.companion", JSON.stringify(p)); }
    // The Kiro redesign, once: the companion follows the theme's accent. Any colour picked after this stays.
    if (localStorage.getItem("shuacrew.companion.theme") !== "1") { p.color = "theme"; localStorage.setItem("shuacrew.companion.theme", "1"); localStorage.setItem("shuacrew.companion", JSON.stringify(p)); }
    // Fast by default, once: "This Mac only" read ~15k tokens per turn on a 20B model (up to a minute a reply). Auto sends
    // quick questions to a fast cloud model and still falls back to this Mac when the cloud is out. Picking it again sticks.
    if (localStorage.getItem("shuacrew.companion.brain") !== "auto-1") { if (p.brain === "local") p.brain = "auto"; localStorage.setItem("shuacrew.companion.brain", "auto-1"); localStorage.setItem("shuacrew.companion", JSON.stringify(p)); }
    return p;
  } catch { return parseCompanion(null); }
}
let preferences = load(); const listeners = new Set<() => void>();
export function saveCompanion(next: CompanionPreferences): boolean {
  preferences = parseCompanion(next); let saved = true;
  try { localStorage.setItem("shuacrew.companion", JSON.stringify(preferences)); } catch { saved = false; }
  listeners.forEach(listener => listener()); return saved;
}
// Spark's desktop panel shares this storage: a change in Settings reaches it at once.
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === "shuacrew.companion") { preferences = load(); listeners.forEach((l) => l()); } });
export function getCompanion() { return preferences; }
export function useCompanion() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => preferences, () => preferences); }
