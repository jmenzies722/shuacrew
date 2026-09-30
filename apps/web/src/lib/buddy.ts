import { PANES } from "./settings-panes";
import { noEmoji } from "./no-emoji";
import { VISUAL_GUIDE } from "./visual";
/** The desktop buddy's contract with the model: short answers, a place to point on screen, and things to do on the Mac. */
export interface Point { x: number; y: number; label: string; target?: string }

/** One step of a guided walkthrough: where to look (a box, as fractions of the screenshot) and what to do there. */
export interface GuideStep { x: number; y: number; w: number; h: number; label: string; step: number; done: false; target?: string }
export type Guide = GuideStep | { done: true };

/** A shape Spark sketches on your screen (fractions of the screenshot, from the top-left). */
export type Shape =
  | { shape: "box"; x: number; y: number; w: number; h: number; label?: string; target?: string; corner?: "circle" | "pill" | "rounded" }
  | { shape: "circle"; x: number; y: number; r: number; label?: string; target?: string }
  | { shape: "arrow"; from: [number, number]; to: [number, number]; label?: string; target?: string }
  | { shape: "text"; x: number; y: number; text: string; stay?: number }
  /** Region marks: dim everything else, a marker stroke, a wavy underline. */
  | { shape: "spotlight" | "highlight" | "underline"; x: number; y: number; w: number; h: number; label?: string; target?: string; stay?: number }
  /** Point marks: a numbered step (optionally ringing a control), a tick, a cross. */
  | { shape: "step" | "check" | "cross"; x: number; y: number; w?: number; h?: number; n?: number; label?: string; target?: string; stay?: number }
  | { shape: "path"; points: Array<[number, number]>; label?: string; stay?: number }
  | { shape: "card"; x: number; y: number; w?: number; h?: number; title?: string; body?: string; items?: string[]; target?: string; stay?: number };

/** One line of on-device OCR: exact text and its box (fractions, from the top-left). */
export interface ScreenLine { t: string; x: number; y: number; w: number; h: number }

/** What Spark may do on your Mac. The Mac app checks every one again before doing it. */
export type Action =
  | { type: "open_app"; name: string }
  | { type: "open_url"; url: string }
  | { type: "open_path"; path: string }
  | { type: "focus"; minutes: number }
  | { type: "timer"; op: "start" | "alarm" | "cancel" | "pause" | "resume" | "list"; seconds?: number; at?: string; label?: string }
  | { type: "crew"; ask: string }
  | { type: "note"; text: string }
  | { type: "media"; command: "play" | "pause" | "toggle" | "next" | "previous" | "play_query" | "open_query" | "volume" | "volume_up" | "volume_down" | "mute" | "playlist" | "shuffle" | "repeat" | "love" | "add_to_library" | "seek" | "play_similar"; by?: "artist" | "vibe"; mood?: string; query?: string; app?: string; level?: number; on?: boolean; mode?: "off" | "one" | "all"; seconds?: number }
  | { type: "system"; what: "dark_mode" | "sleep_display" | "volume" | "volume_up" | "volume_down" | "mute" | "lock" | "screenshot" | "wifi" | "bluetooth" | "night_shift" | "browser_js" | "bluetooth_device" | "empty_trash"; on?: boolean; level?: number; device?: string }
  | { type: "shortcut"; name: string }
  | { type: "settings"; changes: SparkChanges }
  | { type: "learn"; topic?: string; drill?: boolean }
  | { type: "venture"; name: string; pitch?: string; validate?: boolean }
  | { type: "playbook"; playbook: string; idea?: string; venture?: string }
  | { type: "remember"; text: string }
  | { type: "run"; command: string }
  | { type: "go"; path: string }
  | { type: "card"; front: string; back: string }
  | { type: "radio"; cmd: "play" | "pause" | "resume" | "next" | "previous" | "stop"; station?: string }
  | { type: "mail"; op: "unread" | "search" | "read" | "draft"; query?: string; id?: number; to?: string; subject?: string; body?: string; limit?: number }
  | { type: "open_settings"; pane: string }
  | { type: "mac"; op: "find" | "read" | "recent" | "calendar" | "reminders" | "add_reminder" | "notes" | "contacts" | "status" | "music_now" | "music_playlists" | "notes_new" | "calendar_add" | "new_folder" | "reveal" | "open_file" | "browser_tabs" | "complete_reminder" | "delete_reminder" | "delete_event" | "delete_note" | "delete_reminders" | "complete_reminders" | "send_message" | "facetime" | "directions" | "chess"; to?: string; text?: string; mode?: "driving" | "walking" | "transit"; audio?: boolean; titles?: string[]; all?: boolean; list?: string; query?: string; date?: string; path?: string; kind?: string; days?: number; title?: string; due?: string; body?: string; start?: string; end?: string; location?: string; name?: string; in?: string };
/** Every page in ShuaCrew and what it's for — the map Spark carries so it can explain the app and take you anywhere. */
export const SHUACREW_PAGES: Array<{ path: string; name: string; hub: string; about: string }> = [
  { path: "/", name: "Sessions", hub: "Home", about: "chat with the crew; every task is a session that works in its own git branch and asks before anything risky" },
  { path: "/activity", name: "Today", hub: "Home", about: "your day: the morning brief, what needs you, what finished, focus time" },
  { path: "/crew", name: "Team", hub: "Crew", about: "your AI crew members (each has a role, model, voice, memory and lessons); create or edit them" },
  { path: "/rooms", name: "Rooms", hub: "Crew", about: "group chats where several crew members work a problem together" },
  { path: "/floor", name: "Floor", hub: "Crew", about: "a live map of who is working on what right now" },
  { path: "/studio", name: "Studio (ShuaCrew Radio)", hub: "Crew", about: "the radio: the user's own lofi files as stations plus live YouTube lofi jazz / hip-hop stations, ambience (rain, café, brown noise)" },
  { path: "/ventures", name: "Ventures", hub: "Build", about: "business ideas as a pipeline (idea → validate → build → launch → grow) with revenue" },
  { path: "/playbooks", name: "Playbooks", hub: "Build", about: "multi-step plans the crew runs with gates: validate-idea, landing-page, mvp, launch, growth-review" },
  { path: "/specs", name: "Specs", hub: "Build", about: "written specs the crew builds from" },
  { path: "/board", name: "Board", hub: "Build", about: "every session by status: queued, running, awaiting you, reviewing, done" },
  { path: "/schedules", name: "Schedules", hub: "Build", about: "work that runs on its own on a schedule" },
  { path: "/library", name: "Library", hub: "Know", about: "everything the crew made: reports, pages, specs, images, saved knowledge (searchable)" },
  { path: "/memory", name: "Memory", hub: "Know", about: "what every agent has learned about the user: lessons, preferences, corrections" },
  { path: "/teach", name: "Visual teaching", hub: "Know", about: "shared step-by-step explanations, source-grounded diagrams, editable canvas and capture-bound screen annotations; use this for visual lessons" },
  { path: "/learn", name: "Learning", hub: "Know", about: "courses and spaced-repetition quizzes toward the user's career goal" },
  { path: "/integrations", name: "Tools & Skills", hub: "System", about: "MCP tools, connected services and Claude Code skills (including the radio skill)" },
  { path: "/policy", name: "Policy & Audit", hub: "System", about: "what agents may never touch, what needs approval, and the full audit trail" },
  { path: "/observability", name: "Insights", hub: "System", about: "usage, tokens, cost, health and throughput over time" },
  { path: "/terminal", name: "Terminal", hub: "System", about: "a real terminal on the Mac, with an agent that can help" },
  { path: "/guide", name: "Guide", hub: "", about: "the ShuaCrew guide: what the app is, every hub and page, Spark, engines, privacy, shortcuts and what is not finished yet; open it when someone asks how ShuaCrew works" },
  { path: "/settings", name: "Settings", hub: "", about: "appearance/theme and accent, workspace, widgets, chat, agents, automation, safety, Spark, voice, notifications, mobile, data" },
];
/** What the app holds right now, for Spark to answer from (names only — never invented). */
export function shuacrewNow(input: { members: Array<{ name: string; role?: string }>; ventures: string[]; radio: { on: string | null; stations: string[] } }) {
  return [
    "SHUACREW — THE APP YOU LIVE IN (you know it inside out; explain any part and take them there):",
    ...SHUACREW_PAGES.map((p) => `- ${p.name}${p.hub ? ` (${p.hub})` : ""} ${p.path}: ${p.about}`),
    "Keys: ⌘J opens you (Spark) inside the app, ⌃⌥Space from anywhere; ⌘K search; ⌘N new session; ⌘1–5 the hubs; ⌘\\ folds the sidebar; ⌘⇧F Flow mode (hides everything but the work).",
    input.members.length ? `Crew members: ${input.members.map((m) => (m.role ? `${m.name} (${m.role})` : m.name)).join(", ")}.` : "No crew members yet.",
    input.ventures.length ? `Ventures: ${input.ventures.slice(0, 12).join(", ")}.` : "",
    `Radio: ${input.radio.on ? `playing ${input.radio.on}` : "off"}${input.radio.stations.length ? `; stations: ${input.radio.stations.slice(0, 10).join(", ")}` : ""}.`,
    'Take them to a page: ```do [{"type":"go","path":"/studio"}]``` · radio: ```do [{"type":"radio","cmd":"play","station":"lofi jazz"}]``` (cmd: play | pause | resume | next | previous | stop). Use radio for ShuaCrew Radio; media is only for Music/Spotify.',
  ].filter(Boolean).join("\n");
}

/** The playbooks Spark can start by id (the built-in library). */
export const PLAYBOOKS = ["validate-idea", "landing-page", "mvp", "launch", "growth-review"] as const;

/** What you can change about Spark just by asking it ("talk faster", "be the fox", "call yourself Nova"). */
export interface SparkChanges {
  name?: string; character?: "spark" | "orb" | "byte" | "kit" | "blob"; color?: string; size?: "s" | "m" | "l";
  tone?: "cheerful" | "chill" | "direct" | "coach"; length?: "brief" | "detailed";
  talks?: boolean; voice?: string; speed?: number; conversation?: boolean; interrupt?: boolean;
  control?: "off" | "ask" | "auto"; guide?: "click" | "manual"; hotkey?: "ctrl-opt-space" | "ctrl-shift-space" | "opt-shift-space" | "ctrl-opt-s";
}
const NAMED_COLORS: Record<string, string> = { amber: "#f5b544", orange: "#ff7a59", coral: "#ff7a59", pink: "#f472b6", purple: "#a78bfa", violet: "#a78bfa", blue: "#60a5fa", green: "#34d399", mint: "#34d399", white: "#e5e7eb", silver: "#e5e7eb", red: "#f87171", yellow: "#facc15", teal: "#2dd4bf" };
export function parseChanges(v: unknown): SparkChanges | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>, out: SparkChanges = {};
  const pick = <T extends string>(k: string, opts: readonly T[]) => (opts as readonly string[]).includes(o[k] as string) ? (o[k] as T) : undefined;
  const name = str(o.name, 24); if (name) out.name = name;
  const character = pick("character", ["spark", "orb", "byte", "kit", "blob"] as const); if (character) out.character = character;
  if (typeof o.color === "string") { const c = o.color.trim().toLowerCase(); const hex = /^#[0-9a-f]{6}$/.test(c) ? c : NAMED_COLORS[c]; if (hex) out.color = hex; }
  const size = pick("size", ["s", "m", "l"] as const); if (size) out.size = size;
  const tone = pick("tone", ["cheerful", "chill", "direct", "coach"] as const); if (tone) out.tone = tone;
  const length = pick("length", ["brief", "detailed"] as const); if (length) out.length = length;
  for (const k of ["talks", "conversation", "interrupt"] as const) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  const voice = str(o.voice, 40); if (voice && /^[a-z0-9_-]+$/i.test(voice)) out.voice = voice.toLowerCase();
  if (typeof o.speed === "number") out.speed = [0.9, 1, 1.15].reduce((a, b) => Math.abs(b - (o.speed as number)) < Math.abs(a - (o.speed as number)) ? b : a);
  const control = pick("control", ["off", "ask", "auto"] as const); if (control) out.control = control;
  const guide = pick("guide", ["click", "manual"] as const); if (guide) out.guide = guide;
  const hotkey = pick("hotkey", ["ctrl-opt-space", "ctrl-shift-space", "opt-shift-space", "ctrl-opt-s"] as const); if (hotkey) out.hotkey = hotkey;
  return Object.keys(out).length ? out : null;
}

/** One step of Spark using the mouse and keyboard, or the end of the task. Coordinates are screenshot fractions. */
export type Act =
  | { type: "press"; label: string }
  | { type: "click"; x: number; y: number; label: string; double?: boolean; button?: "right" }
  | { type: "type"; text: string; label: string }
  | { type: "key"; keys: string; label: string }
  | { type: "scroll"; x?: number; y?: number; amount: number; label: string }
  | { type: "done"; summary: string };

/** A ```point {"x":0..1,"y":0..1,"label":"…"}``` block (normalized to the screenshot), validated. */
export function parsePoint(text: string): Point | null {
  const m = /```point\s*([\s\S]*?)```/i.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]!.trim()) as { x?: unknown; y?: unknown; label?: unknown; target?: unknown };
    const target = targetId(v.target);
    const x = Number(v.x ?? (target ? 0.5 : NaN)), y = Number(v.y ?? (target ? 0.5 : NaN));
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y, label: typeof v.label === "string" ? v.label.trim().slice(0, 60) : "", ...(target ? { target } : {}) };
  } catch { return null; }
}

const frac = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null; };
/** A picked on-screen item: "#12" (a control) or "T40" (a text line), from the numbered lists Spark was given. */
function targetId(v: unknown): string | undefined { return typeof v === "string" && /^(#|T)\d{1,4}$/i.test(v.trim()) ? v.trim().toUpperCase() : undefined; }
/** A ```guide {...}``` block: the next step (centre x,y and size w,h as fractions), or {"done": true}. */
export function parseGuide(text: string): Guide | null {
  const m = /```guide\s*([\s\S]*?)```/i.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]!.trim()) as Record<string, unknown>;
    if (v.done === true) return { done: true };
    const target = targetId(v.target);
    const x = frac(v.x ?? (target ? 0.5 : undefined)), y = frac(v.y ?? (target ? 0.5 : undefined));
    if (x === null || y === null) return null;
    const w = Math.max(0.01, Math.min(0.6, frac(v.w) ?? 0.04)), h = Math.max(0.01, Math.min(0.6, frac(v.h) ?? 0.04));
    const step = Number.isInteger(v.step) && (v.step as number) > 0 && (v.step as number) < 100 ? (v.step as number) : 1;
    return { x, y, w, h, label: typeof v.label === "string" ? v.label.trim().slice(0, 60) : "", step, done: false, ...(target ? { target } : {}) };
  } catch { return null; }
}

const unit = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
const lab = (v: unknown) => (typeof v === "string" && v.trim() ? { label: v.trim().slice(0, 60) } : {});
const st = (v: unknown) => (typeof v === "number" && v > 0 ? { stay: Math.min(300, Math.round(v)) } : {});
/** A ```draw [...]``` block: up to 16 validated marks (fractions of the screen by now — pixels were converted). */
export function parseDraw(text: string): Shape[] {
  const m = /```draw\s*([\s\S]*?)```/i.exec(text);
  if (!m) return [];
  try {
    const v = JSON.parse(m[1]!.trim()) as unknown, list = Array.isArray(v) ? v : [v], out: Shape[] = [];
    for (const raw of list) {
      const o = raw as Record<string, unknown>;
      // A picked target ("#12" / "T40") can stand in for coordinates: Spark draws around the real thing.
      const target = targetId(o?.target), tg = target ? { target } : {};
      if (o?.shape === "box" && ([o.x, o.y, o.w, o.h].every(unit) || target)) out.push({ shape: "box", x: unit(o.x) ? o.x as number : 0.5, y: unit(o.y) ? o.y as number : 0.5, w: unit(o.w) ? o.w as number : 0.04, h: unit(o.h) ? o.h as number : 0.04, ...lab(o.label), ...tg });
      else if (o?.shape === "circle" && ([o.x, o.y, o.r].every(unit) || target)) out.push({ shape: "circle", x: unit(o.x) ? o.x as number : 0.5, y: unit(o.y) ? o.y as number : 0.5, r: unit(o.r) ? o.r as number : 0.03, ...lab(o.label), ...tg });
      else if (o?.shape === "arrow" && target && Array.isArray(o.from) && o.from.length === 2 && o.from.every(unit)) out.push({ shape: "arrow", from: o.from as [number, number], to: [0.5, 0.5], ...lab(o.label), target });
      else if (o?.shape === "arrow" && Array.isArray(o.from) && Array.isArray(o.to) && [...o.from, ...o.to].length === 4 && [...o.from, ...o.to].every(unit)) out.push({ shape: "arrow", from: o.from as [number, number], to: o.to as [number, number], ...lab(o.label) });
      else if (o?.shape === "text" && [o.x, o.y].every(unit) && typeof o.text === "string" && o.text.trim()) out.push({ shape: "text", x: o.x as number, y: o.y as number, text: o.text.trim().slice(0, 60), ...st(o.stay) });
      else if ((o?.shape === "spotlight" || o?.shape === "highlight" || o?.shape === "underline") && ([o.x, o.y, o.w, o.h].every(unit) || target))
        out.push({ shape: o.shape, x: unit(o.x) ? o.x as number : 0.5, y: unit(o.y) ? o.y as number : 0.5, w: unit(o.w) ? o.w as number : 0.1, h: unit(o.h) ? o.h as number : 0.03, ...lab(o.label), ...tg, ...st(o.stay) });
      else if ((o?.shape === "step" || o?.shape === "check" || o?.shape === "cross") && ([o.x, o.y].every(unit) || target)) {
        const n = Number.isInteger(o.n) && (o.n as number) > 0 && (o.n as number) < 100 ? { n: o.n as number } : {};
        out.push({ shape: o.shape, x: unit(o.x) ? o.x as number : 0.5, y: unit(o.y) ? o.y as number : 0.5, ...(unit(o.w) && unit(o.h) ? { w: o.w as number, h: o.h as number } : {}), ...n, ...lab(o.label), ...tg, ...st(o.stay) });
      }
      else if (o?.shape === "path" && Array.isArray(o.points)) {
        const points = (o.points as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every(unit)).slice(0, 8);
        if (points.length >= 2) out.push({ shape: "path", points, ...lab(o.label), ...st(o.stay) });
      }
      else if (o?.shape === "card" && ([o.x, o.y].every(unit) || target) && (typeof o.title === "string" || typeof o.body === "string")) {
        const items = Array.isArray(o.items) ? (o.items as unknown[]).filter((i): i is string => typeof i === "string" && !!i.trim()).slice(0, 4).map((i) => i.trim().slice(0, 80)) : [];
        out.push({ shape: "card", x: unit(o.x) ? o.x as number : 0.5, y: unit(o.y) ? o.y as number : 0.5, ...(typeof o.title === "string" ? { title: o.title.trim().slice(0, 50) } : {}), ...(typeof o.body === "string" ? { body: o.body.trim().slice(0, 220) } : {}), ...(items.length ? { items } : {}), ...tg, ...st(o.stay) });
      }
    }
    return out.slice(0, 16);
  } catch { return []; }
}

/** A reply as text and diagram parts, in order, so diagrams render as diagrams. */
export function splitDiagrams(text: string): Array<{ kind: "text" | "diagram"; value: string }> {
  const out: Array<{ kind: "text" | "diagram"; value: string }> = [];
  let last = 0;
  for (const m of text.matchAll(/```mermaid\s*\n([\s\S]*?)```/gi)) {
    if (m.index! > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "diagram", value: m[1]!.trim() });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out.filter((p) => p.value.trim());
}

/** Is this a system-design question? Those get the careful model, more room, and a diagram. */
export function isDesign(question: string) {
  return /\b(system design|design (a|an|the|me)|architect(ure)?|how would you (build|design|scale)|scal(e|ing|able)|high[- ]level design|hld|lld|distributed|microservices?|data (model|pipeline)|infra(structure)?|diagram|draw (a|an|me|the))\b/i.test(question);
}

/** The frontmost app's real controls, from macOS accessibility: exact names and positions. */
export interface Pointing { pointer?: { x: number; y: number; name?: string; role?: string }; gesture?: { kind: string; x: number; y: number; w: number; h: number } }
export interface ScreenContext extends Pointing { app?: string; window?: string; page?: { url?: string; title?: string }; elements?: Array<{ name: string; role: string; x: number; y: number; w?: number; h?: number }> }
export function elementsText(ctx: ScreenContext | undefined, max = 120, size?: { width: number; height: number }) {
  if (!ctx?.app && !ctx?.elements?.length) return "";
  const at = (x: number, y: number) => (size ? `${Math.round(x * size.width)},${Math.round(y * size.height)}` : `${x.toFixed(3)},${y.toFixed(3)}`);
  const rows = (ctx.elements ?? []).slice(0, max).map((e, i) => `#${i + 1} ${e.name} [${e.role}] @${at(e.x, e.y)}`);
  const page = ctx.page?.url ? `\nPAGE: ${ctx.page.title ? `“${ctx.page.title}” ` : ""}${ctx.page.url} — its controls are the [web …] rows: exact, read from the page itself. press {label} clicks one on the page; type {label: the field's name, text} fills that field (end text with \\n to press Enter).` : "";
  return `IN FRONT: ${ctx.app ?? "?"}${ctx.window ? ` — “${ctx.window}”` : ""}.${page}${rows.length ? `\nITS CONTROLS — exact, from macOS accessibility, including the menu bar, the Dock and the menu-bar icons ("#id name [role] @x,y"). To use one, act press {label: name} (most reliable); to point or guide at it, give its id as "target" (e.g. "target":"#12") — Spark draws its exact frame, far more precise than coordinates. The ids and numbers are ONLY for blocks: never say or write them; name things the way they see them ("the Share button, top right", "Wi-Fi in the menu bar", "Music in the Dock"):\n${rows.join("\n")}` : ""}`;
}

/**
 * What they're showing you with their own cursor: where the pointer is and what's under it ("what's this?"), and
 * anything they just circled, underlined or scribbled over while holding fn to talk — with what's inside it.
 */
export function pointingText(ctx: ScreenContext | undefined, lines: ScreenLine[] | undefined, size?: { width: number; height: number }): string {
  if (!ctx?.pointer && !ctx?.gesture) return "";
  const at = (x: number, y: number) => (size ? `${Math.round(x * size.width)},${Math.round(y * size.height)}` : `${x.toFixed(3)},${y.toFixed(3)}`);
  const inBox = (px: number, py: number, b: { x: number; y: number; w: number; h: number }) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
  const els = (ctx.elements ?? []).map((e, i) => ({ ...e, id: `#${i + 1}` })).filter((e) => e.w && e.h);
  const txt = (lines ?? []).map((l, i) => ({ ...l, id: `T${i}` }));
  const out: string[] = [];
  const p = ctx.pointer;
  if (p) {
    // Under the pointer: what macOS says is there, else the smallest control (a web page's own too) or text line around it.
    const box = (e: { x: number; y: number; w?: number; h?: number }) => ({ x: e.x - (e.w ?? 0) / 2, y: e.y - (e.h ?? 0) / 2, w: e.w ?? 0, h: e.h ?? 0 });
    const el = els.filter((e) => inBox(p.x, p.y, box(e))).sort((a, b) => a.w! * a.h! - b.w! * b.h!)[0];
    const line = txt.find((l) => inBox(p.x, p.y, box(l))); // OCR boxes are centre + size, like controls
    const under = p.name ? `“${p.name}”${p.role ? ` [${p.role}]` : ""}` : el ? `“${el.name}” [${el.role}] (${el.id})` : line ? `the text “${line.t.slice(0, 80)}” (${line.id})` : "";
    out.push(`THEIR POINTER is at ${at(p.x, p.y)}${under ? `, over ${under}` : ""}. When they say "this", "that" or "here" without naming it, they mean what's under their pointer.`);
  }
  const g = ctx.gesture;
  if (g) {
    const inside = (x: number, y: number) => inBox(x, y, g);
    const things = [...els.filter((e) => inside(e.x, e.y)).map((e) => `“${e.name}” (${e.id})`), ...txt.filter((l) => inside(l.x, l.y)).map((l) => `“${l.t.slice(0, 60)}” (${l.id})`)].slice(0, 10);
    const what = g.kind === "underline" ? "UNDERLINED" : g.kind === "circle" ? "CIRCLED" : "SCRIBBLED OVER";
    out.push(`THEY JUST ${what} (with their cursor, while talking) the area ${at(g.x, g.y)} to ${at(g.x + g.w, g.y + g.h)}${things.length ? ` — inside it: ${things.join(", ")}` : ""}. That area is what "this"/"these" means now: answer about it, point back at it, and zoom there if it's small.`);
  }
  return out.join("\n");
}

/** Machine blocks that have finished streaming, in order: each can run the moment it's complete. */
export function completedBlocks(text: string, size?: { width: number; height: number } | null): Array<{ key: string; kind: "do" | "act" | "point" | "guide" | "draw" | "visual" | "zoom"; raw: string }> {
  const out: Array<{ key: string; kind: "do" | "act" | "point" | "guide" | "draw" | "visual" | "zoom"; raw: string }> = [];
  for (const m of text.matchAll(/```(do|act|point|guide|draw|visual|zoom)\s*([\s\S]*?)```/gi)) {
    const kind = m[1]!.toLowerCase() as "do";
    out.push({ key: `${m.index}:${kind}`, kind, raw: size && /^(act|point|guide|draw|zoom)$/.test(kind) ? pixelsToFractions(m[0], kind, size) : m[0] });
  }
  return out;
}

/**
 * Claude points in screenshot pixels — that's how it's trained, and it's far more precise than guessing fractions.
 * Spark asks for pixels of the exact image it sent, then turns them into fractions of the screen here, before any
 * block is read. A block already in fractions (every coordinate 0–1) passes through untouched.
 */
export function pixelsToFractions(raw: string, kind: string, size: { width: number; height: number }): string {
  const m = /^(```[a-z]+\s*)([\s\S]*?)(```)$/i.exec(raw.trim());
  if (!m || !size.width || !size.height) return raw;
  let v: unknown;
  try { v = JSON.parse(m[2]!.trim()); } catch { return raw; }
  const W = size.width, H = size.height, nums: number[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== "object") return;
    for (const [k, val] of Object.entries(o as Record<string, unknown>)) {
      if (["x", "y", "w", "h", "r"].includes(k) && typeof val === "number") nums.push(val);
      else if (["from", "to"].includes(k) && Array.isArray(val)) nums.push(...val.filter((n): n is number => typeof n === "number"));
      else if (k === "points" && Array.isArray(val)) for (const pt of val) if (Array.isArray(pt)) nums.push(...pt.filter((n): n is number => typeof n === "number"));
    }
  };
  walk(v);
  if (!nums.some((n) => n > 1)) return raw; // already fractions
  const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 10000) / 10000));
  const pair = (a: unknown) => (Array.isArray(a) && a.length === 2 && a.every((n) => typeof n === "number") ? [clamp((a[0] as number) / W), clamp((a[1] as number) / H)] : a);
  const fix = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(fix);
    if (!o || typeof o !== "object") return o;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o as Record<string, unknown>)) {
      if (typeof val === "number" && (k === "x" || k === "w" || k === "r")) out[k] = clamp(val / W);
      else if (typeof val === "number" && (k === "y" || k === "h")) out[k] = clamp(val / H);
      else if (k === "from" || k === "to") out[k] = pair(val);
      else if (k === "points" && Array.isArray(val)) out[k] = val.map(pair);
      else out[k] = val;
    }
    return out;
  };
  void kind;
  return `${m[1]}${JSON.stringify(fix(v))}${m[3]}`;
}

/** OCR lines as a compact, exact block for the model (reading order, with centres). */
export function screenText(lines: ScreenLine[] | undefined, max = 9000, size?: { width: number; height: number }) {
  if (!lines?.length) return "";
  const at = (x: number, y: number) => (size ? `${Math.round(x * size.width)},${Math.round(y * size.height)}` : `${x.toFixed(3)},${y.toFixed(3)}`);
  const rows = lines.map((l, i) => ({ l, i })).sort((a, b) => (Math.abs(a.l.y - b.l.y) < 0.006 ? a.l.x - b.l.x : a.l.y - b.l.y)).map(({ l, i }) => `T${i} ${l.t} @${at(l.x, l.y)}`);
  let out = "", n = 0;
  for (const r of rows) { if (out.length + r.length > max) break; out += r + "\n"; n++; }
  return `SCREEN TEXT — read off their screen by on-device OCR, not typed by the user (never quote or comment on stray lines unless asked); exact, from the full-resolution screen (${n}${n < rows.length ? ` of ${rows.length}` : ""} lines; "Tid text @x,y" = centre${size ? " in screenshot pixels" : " as fractions"} from the top-left; to point or guide at a line, give "target":"T<id>" for its exact box). Quote numbers and names from here, not from the image; use these positions to point precisely:\n${out}`;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
function toAction(v: unknown): Action | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  switch (o.type) {
    case "open_app": { const name = str(o.name, 80); return name ? { type: "open_app", name } : null; }
    case "open_url": { const url = str(o.url, 2000); try { return url && /^https?:$/.test(new URL(url).protocol) ? { type: "open_url", url } : null; } catch { return null; } }
    case "open_path": { const path = str(o.path, 500); return path && /^~?\//.test(path) && !path.split("/").includes("..") ? { type: "open_path", path } : null; }
    case "timer": {
      const op = (["start", "alarm", "cancel", "pause", "resume", "list"] as const).find((x) => x === o.op); if (!op) return null;
      const seconds = Number(o.seconds), label = str(o.label, 40), at = str(o.at, 40);
      if (op === "start" && !(seconds >= 1 && seconds <= 43_200)) return null;
      if (op === "alarm" && !at) return null;
      return { type: "timer", op, ...(op === "start" ? { seconds } : {}), ...(at && op === "alarm" ? { at } : {}), ...(label ? { label } : {}) };
    }
    case "focus": { const minutes = Number(o.minutes); return [5, 10, 15, 25, 45, 50, 60, 90].includes(minutes) ? { type: "focus", minutes } : null; }
    case "crew": { const ask = str(o.ask, 4000); return ask ? { type: "crew", ask } : null; }
    case "mail": {
      // Their mail through the Mail app: read and draft only. The Mac app checks every field again.
      const op = (["unread", "search", "read", "draft"] as const).find((x) => x === o.op);
      if (!op) return null;
      const limit = Number.isInteger(o.limit) && (o.limit as number) >= 1 && (o.limit as number) <= 25 ? (o.limit as number) : undefined;
      if (op === "unread") return { type: "mail", op, ...(limit ? { limit } : {}) };
      if (op === "search") { const query = str(o.query, 120); return query ? { type: "mail", op, query, ...(limit ? { limit } : {}) } : null; }
      if (op === "read") return Number.isInteger(o.id) && (o.id as number) > 0 ? { type: "mail", op, id: o.id as number } : null;
      const to = str(o.to, 200) ?? "", subject = str(o.subject, 300) ?? "", body = str(o.body, 20_000) ?? "";
      return (to === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) && (subject || body) ? { type: "mail", op, to, subject, body } : null;
    }
    case "open_settings": { const pane = PANES.find((p) => p.key === o.pane); return pane ? { type: "open_settings", pane: pane.key } : null; }
    case "mac": {
      // Your Mac, read on this Mac: files (Spotlight), calendar, reminders, notes, contacts, status. The Mac app checks again.
      const op = (["find", "read", "recent", "calendar", "reminders", "add_reminder", "notes", "contacts", "status", "music_now", "music_playlists", "notes_new", "calendar_add", "new_folder", "reveal", "open_file", "browser_tabs", "complete_reminder", "delete_reminder", "delete_event", "delete_note", "delete_reminders", "complete_reminders", "send_message", "facetime", "directions", "chess"] as const).find((x) => x === o.op);
      if (!op) return null;
      const days = Number.isInteger(o.days) && (o.days as number) >= 1 && (o.days as number) <= 30 ? { days: o.days as number } : {};
      if (op === "find") { const query = str(o.query, 120); const kind = ["pdf", "images", "apps", "folders", "documents"].includes(o.kind as string) ? { kind: o.kind as string } : {}; return query ? { type: "mac", op, query, ...kind } : null; }
      if (op === "read") { const path = str(o.path, 500); return path ? { type: "mac", op, path } : null; }
      if (op === "contacts") { const query = str(o.query, 80); return query ? { type: "mac", op, query } : null; }
      if (op === "notes") { const query = str(o.query, 80); return { type: "mac", op, ...(query ? { query } : {}) }; }
      if (op === "notes_new") { const title = str(o.title, 200), body = str(o.body, 20_000); return title || body ? { type: "mac", op, ...(title ? { title } : {}), ...(body ? { body } : {}) } : null; }
      if (op === "calendar_add") { const title = str(o.title, 200), start = str(o.start, 40), end = str(o.end, 40), location = str(o.location, 200); return title && start ? { type: "mac", op, title, start, ...(end ? { end } : {}), ...(location ? { location } : {}) } : null; }
      if (op === "new_folder") { const name = str(o.name, 120), dir = str(o.in, 500); return name ? { type: "mac", op, name, ...(dir ? { in: dir } : {}) } : null; }
      if (op === "reveal" || op === "open_file") { const path = str(o.path, 500); return path ? { type: "mac", op, path } : null; }
      if (op === "add_reminder") { const title = str(o.title, 200); const due = str(o.due, 40); return title ? { type: "mac", op, title, ...(due ? { due } : {}) } : null; }
      // Messages, calls, directions: to a contact by name (or a number/email). Sending and calling always ask first.
      if (op === "send_message") { const to = str(o.to, 80), text = str(o.text, 1000); return to && text ? { type: "mac", op, to, text } : null; }
      if (op === "facetime") { const to = str(o.to, 80); return to ? { type: "mac", op, to, ...(o.audio === true ? { audio: true } : {}) } : null; }
      if (op === "directions") { const to = str(o.to, 200), mode = (["driving", "walking", "transit"] as const).find((m) => m === o.mode); return to ? { type: "mac", op, to, ...(mode ? { mode } : {}) } : null; }
      // Many at once: named ones, all of them, or all in one list — one yes, one pass on the Mac.
      if (op === "delete_reminders" || op === "complete_reminders") {
        const titles = Array.isArray(o.titles) ? o.titles.map((t) => str(t, 200)).filter((t): t is string => !!t).slice(0, 200) : [];
        const list = str(o.list, 100), all = o.all === true;
        return titles.length || all ? { type: "mac", op, ...(titles.length ? { titles } : {}), ...(all ? { all } : {}), ...(list ? { list } : {}) } : null;
      }
      // Finishing or deleting by name (a date narrows it); the Mac app asks which one if several match.
      if (op === "complete_reminder" || op === "delete_reminder" || op === "delete_event" || op === "delete_note") { const title = str(o.title, 200), date = str(o.date, 40); return title ? { type: "mac", op, title, ...(date ? { date } : {}) } : null; }
      return { type: "mac", op, ...days };
    }
    case "note": { const text = str(o.text, 2000); return text ? { type: "note", text } : null; }
    case "media": {
      const cmds = ["play", "pause", "toggle", "next", "previous", "play_query", "open_query", "volume", "volume_up", "volume_down", "mute", "playlist", "shuffle", "repeat", "love", "add_to_library", "seek", "play_similar"] as const;
      const command = cmds.find((c) => c === o.command); if (!command) return null;
      const level = Number(o.level), query = str(o.query, 200), app = str(o.app, 20), seconds = Number(o.seconds), mood = str(o.mood, 30);
      if ((command === "play_query" || command === "open_query" || command === "playlist") && !query) return null;
      if (command === "seek" && !(Number.isFinite(seconds) && seconds >= 0)) return null;
      return { type: "media", command, ...(query ? { query } : {}), ...(app ? { app } : {}), ...(Number.isFinite(level) ? { level: Math.max(0, Math.min(100, Math.round(level))) } : {}),
        ...(typeof o.on === "boolean" ? { on: o.on } : {}), ...(o.mode === "off" || o.mode === "one" || o.mode === "all" ? { mode: o.mode } : {}), ...(command === "seek" ? { seconds: Math.min(36_000, seconds) } : {}), ...(command === "play_similar" && (o.by === "artist" || o.by === "vibe") ? { by: o.by } : {}), ...(command === "play_similar" && mood ? { mood } : {}) };
    }
    case "system": {
      const what = (["dark_mode", "sleep_display", "volume", "volume_up", "volume_down", "mute", "lock", "screenshot", "wifi", "bluetooth", "night_shift", "browser_js", "bluetooth_device", "empty_trash"] as const).find((w) => w === o.what); if (!what) return null;
      if (what === "bluetooth_device") { const device = str(o.device, 60); return device ? { type: "system", what, device, ...(o.on === false ? { on: false } : {}) } : null; }
      const level = Number(o.level);
      if (what === "volume" && !(level >= 0 && level <= 100)) return null;
      return { type: "system", what, ...(typeof o.on === "boolean" ? { on: o.on } : {}), ...(what === "volume" ? { level: Math.round(level) } : {}) };
    }
    case "shortcut": { const name = str(o.name, 120); return name ? { type: "shortcut", name } : null; }
    case "settings": { const changes = parseChanges(o.changes); return changes ? { type: "settings", changes } : null; }
    case "learn": { const topic = str(o.topic, 120); return topic || o.drill === true ? { type: "learn", ...(topic ? { topic } : {}), ...(o.drill === true ? { drill: true } : {}) } : null; }
    case "venture": { const name = str(o.name, 60), pitch = str(o.pitch, 300); return name ? { type: "venture", name, ...(pitch ? { pitch } : {}), ...(o.validate === true ? { validate: true } : {}) } : null; }
    case "playbook": { const playbook = (PLAYBOOKS as readonly string[]).includes(o.playbook as string) ? (o.playbook as string) : null; const idea = str(o.idea, 300), venture = str(o.venture, 80); return playbook ? { type: "playbook", playbook, ...(idea ? { idea } : {}), ...(venture ? { venture } : {}) } : null; }
    case "remember": { const text = str(o.text, 500); return text ? { type: "remember", text } : null; }
    case "card": { const front = str(o.front, 240), back = str(o.back, 800); return front && back ? { type: "card", front, back } : null; }
    case "go": { const path = str(o.path, 80); return path && SHUACREW_PAGES.some((p) => p.path === path || path.startsWith(`${p.path}/`) || path.startsWith(`${p.path}#`)) ? { type: "go", path } : null; }
    case "radio": { const cmds = ["play", "pause", "resume", "next", "previous", "stop"] as const; const cmd = cmds.find((c) => c === o.cmd); const station = str(o.station, 80); return cmd ? { type: "radio", cmd, ...(station ? { station } : {}) } : null; }
    case "run": { const command = str(o.command, 2000); return command && !/[\u0000-\u0008]/.test(command) ? { type: "run", command } : null; }
    default: return null;
  }
}
/** Every ```do``` block: one action or a list; anything unknown or unsafe-looking is dropped. At most 5. */
export function parseActions(text: string): Action[] {
  const out: Action[] = [];
  for (const m of text.matchAll(/```do\s*([\s\S]*?)```/gi)) {
    try { const v = JSON.parse(m[1]!.trim()) as unknown; for (const a of Array.isArray(v) ? v : [v]) { const ok = toAction(a); if (ok) out.push(ok); } } catch { /* skip a malformed block */ }
  }
  return out.slice(0, 5);
}
export function describeAction(a: Action): string {
  switch (a.type) {
    case "open_app": return `Open ${a.name}`;
    case "open_url": { try { return `Open ${new URL(a.url).host}`; } catch { return "Open link"; } }
    case "open_path": return `Open ${a.path.split("/").filter(Boolean).at(-1) ?? a.path}`;
    case "focus": return `${a.minutes}-minute focus`;
    case "timer": return a.op === "start" ? `${a.label ? `${a.label} timer` : "Timer"}: ${Math.round((a.seconds ?? 0) / 60) || a.seconds + " s"}${a.seconds && a.seconds >= 60 ? " min" : ""}` : a.op === "alarm" ? `Alarm for ${a.at}` : a.op === "list" ? "Check your timers" : `${a.op[0]!.toUpperCase()}${a.op.slice(1)} ${a.label ? `the ${a.label} timer` : "the timer"}`;
    case "crew": return "Hand to the crew";
    case "mail": return a.op === "unread" ? "Check unread mail" : a.op === "search" ? `Search mail for “${a.query}”` : a.op === "read" ? "Read the message" : `Draft to ${a.to || "…"} (not sent)`;
    case "open_settings": return `Open ${PANES.find((p) => p.key === a.pane)?.name ?? "Settings"}`;
    case "mac": return a.op === "chess" ? "Read the board and find the best move" : a.op === "find" ? `Search your Mac for “${a.query}”` : a.op === "read" ? `Read ${a.path?.split("/").pop()}` : a.op === "recent" ? "Your recent files" : a.op === "calendar" ? "Check your calendar" : a.op === "reminders" ? "Check your reminders" : a.op === "add_reminder" ? `Remind you: ${a.title}` : a.op === "send_message" ? `Send “${a.text}” to ${a.to}` : a.op === "facetime" ? `Call ${a.to} on FaceTime${a.audio ? " audio" : ""}` : a.op === "directions" ? `Directions to ${a.to}` : a.op === "delete_reminders" || a.op === "complete_reminders" ? `${a.op === "delete_reminders" ? "Delete" : "Finish"} ${a.all ? `all your reminders${a.list ? ` in ${a.list}` : ""}` : `${a.titles?.length ?? 0} reminder${a.titles?.length === 1 ? "" : "s"}`}` : a.op === "complete_reminder" ? `Mark “${a.title}” done` : a.op === "delete_reminder" ? `Delete the reminder “${a.title}”` : a.op === "delete_event" ? `Delete “${a.title}” from your calendar${a.date ? ` (${a.date.slice(0, 10)})` : ""}` : a.op === "delete_note" ? `Delete the note “${a.title}”` : a.op === "notes" ? (a.query ? `Search your notes for “${a.query}”` : "Your latest notes") : a.op === "contacts" ? `Look up ${a.query}` : a.op === "music_now" ? "Check what's playing" : a.op === "music_playlists" ? "Check your playlists" : a.op === "notes_new" ? `New note: ${a.title ?? "…"}` : a.op === "calendar_add" ? `Add “${a.title}” to your calendar` : a.op === "new_folder" ? `New folder “${a.name}”` : a.op === "reveal" ? `Show ${a.path?.split("/").pop()} in Finder` : a.op === "open_file" ? `Open ${a.path?.split("/").pop()}` : a.op === "browser_tabs" ? "Check your open tabs" : "Check your Mac";
    case "note": return "Add to your note";
    case "media": return a.command === "play_similar" ? a.mood ? `Play something ${a.mood} from your library` : (a.by === "vibe" ? "Play something similar from your library" : "Play another song from your library") : a.command === "play_query" ? `Play “${a.query}”` : a.command === "playlist" ? `Play your ${a.query} playlist` : a.command === "open_query" ? `Open ${a.query}` : a.command === "shuffle" ? `Shuffle ${a.on === false ? "off" : "on"}` : a.command === "repeat" ? `Repeat ${a.mode ?? "all"}` : a.command === "love" ? "Favourite this song" : a.command === "add_to_library" ? "Add this song to your library" : `Music: ${a.command.replace(/_/g, " ")}`;
    case "system": return { dark_mode: "Dark mode", sleep_display: "Sleep display", volume: `Volume to ${a.level}%`, volume_up: "Volume up", volume_down: "Volume down", mute: a.on === false ? "Unmute" : "Mute", lock: "Lock your Mac", screenshot: "Take a screenshot", wifi: `Wi-Fi ${a.on === false ? "off" : "on"}`, bluetooth: `Bluetooth ${a.on === false ? "off" : "on"}`, night_shift: a.on === undefined ? "Toggle Night Shift" : `Night Shift ${a.on ? "on" : "off"}`, browser_js: "Let Shua work inside web pages (Allow JavaScript from Apple Events)", bluetooth_device: `${a.on === false ? "Disconnect" : "Connect"} ${a.device ?? "the device"}`, empty_trash: "Empty the Trash" }[a.what];
    case "shortcut": return `Run “${a.name}”`;
    case "settings": return `Updated: ${Object.keys(a.changes).join(", ")}`;
    case "learn": return a.drill ? "Quiz drill" : `Course: ${a.topic}`;
    case "venture": return `Venture: ${a.name}`;
    case "playbook": return `Playbook: ${a.playbook.replace(/-/g, " ")}`;
    case "remember": return "Taught the crew";
    case "card": return "Added a quiz card";
    case "go": return `Open ${SHUACREW_PAGES.find((p) => a.path === p.path || a.path.startsWith(p.path + "/"))?.name ?? a.path}`;
    case "radio": return a.cmd === "play" ? `Radio: ${a.station ?? "on"}` : `Radio: ${a.cmd}`;
    case "run": return `Run ${a.command.length > 48 ? `${a.command.slice(0, 48)}…` : a.command}`;
  }
}

/** An ```act {...}``` block: Spark's next mouse/keyboard step, or {"type":"done"}. Validated; ⌘Q and friends are the Mac's call. */
/** One act block: a single step, or several in a row (```act [ … ]```) that run back to back before the next look. */
export function parseActs(text: string): Act[] {
  const m = /```act\s*([\s\S]*?)```/i.exec(text);
  if (!m) return [];
  try {
    const v = JSON.parse(m[1]!.trim()) as unknown;
    const list = (Array.isArray(v) ? v : [v]).map((o) => toAct(o as Record<string, unknown>)).filter((a): a is Act => !!a);
    const done = list.findIndex((a) => a.type === "done");
    return (done >= 0 ? list.slice(0, done + 1) : list).slice(0, 6);
  } catch { return []; }
}
export function parseAct(text: string): Act | null { return parseActs(text)[0] ?? null; }
/** A ```zoom {x,y,w,h}``` block (fractions after pixelsToFractions): the region to look at closely. */
export function parseZoom(raw: string): { x: number; y: number; w: number; h: number } | null {
  const m = /```zoom\s*([\s\S]*?)```/i.exec(raw);
  try {
    const o = JSON.parse(m?.[1]?.trim() ?? "") as Record<string, number>;
    const x = Number(o.x), y = Number(o.y), w = Number(o.w), h = Number(o.h);
    return [x, y, w, h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && w > 0.005 && h > 0.005 ? { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) } : null;
  } catch { return null; }
}
function toAct(o: Record<string, unknown>): Act | null {
  if (!o || typeof o !== "object") return null;
  try {
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
    switch (o.type) {
      case "press": return label ? { type: "press", label } : null;
      case "click": return unit(o.x) && unit(o.y) ? { type: "click", x: o.x as number, y: o.y as number, label, ...(o.double === true ? { double: true } : {}), ...(o.button === "right" ? { button: "right" as const } : {}) } : null;
      case "type": return typeof o.text === "string" && o.text.length > 0 && o.text.length <= 2000 ? { type: "type", text: o.text, label } : null;
      case "key": return typeof o.keys === "string" && /^[a-z0-9⌘⇧⌥⌃+ ,./\-=\[\]]{1,40}$/i.test(o.keys) ? { type: "key", keys: o.keys, label } : null;
      case "scroll": { const amount = Math.max(-30, Math.min(30, Math.round(Number(o.amount) || -5))); return { type: "scroll", amount, label, ...(unit(o.x) && unit(o.y) ? { x: o.x as number, y: o.y as number } : {}) }; }
      case "done": return { type: "done", summary: typeof o.summary === "string" ? o.summary.slice(0, 200) : "" };
      default: return null;
    }
  } catch { return null; }
}
export function describeAct(a: Act): string {
  switch (a.type) {
    case "press": return `Press “${a.label}”`;
    case "click": return `${a.double ? "Double-click" : a.button === "right" ? "Right-click" : "Click"} ${a.label ? `“${a.label}”` : "there"}`;
    case "type": return `Type “${a.text.length > 40 ? `${a.text.slice(0, 40)}…` : a.text}”`;
    case "key": return `Press ${a.keys}`;
    case "scroll": return `Scroll ${a.amount < 0 ? "down" : "up"}`;
    case "done": return "Done";
  }
}

/** During a walkthrough every reply is one short line: say the step, never narrate or quote the screen text. */
const STEP_STYLE = " Reply in ONE short sentence (under 15 words) plus the block — no recap, no commentary. The screen text below is read off their screen by OCR, not typed by them: never quote it or comment on stray lines in it.";

/** What goes back after Spark does a step: what happened, a fresh look, and the ask for the next step. */
export function actFollowUp(did: string, ok: boolean, screen: { width: number; height: number; text?: ScreenLine[]; context?: ScreenContext }, step: number, max: number) {
  return `[act] Step ${step} ${ok ? "done" : "FAILED"}: ${did}. A fresh screenshot is attached (${screen.width}×${screen.height}). ${Number.isFinite(max) && step >= max ? "That was the last allowed step: finish with {\"type\":\"done\"} and say what's left." : "Next step as one act block (several in an array when they don't need a look in between), zoom first if the target is small, or {\"type\":\"done\",\"summary\":\"…\"} when the task is complete."}${STEP_STYLE}${screen.text?.length || screen.context ? `\n\n[screen]\n${screen.text?.length ? screenText(screen.text, 6000, screen) : ""}${screen.context ? `\n${elementsText(screen.context, 120, screen)}` : ""}` : ""}`;
}

/** The whole reply for the open notch once Spark has finished: every sentence (it used to stop at two), no blocks or markdown marks. */
export function restingReply(text: string) { return speakable(text).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim(); }

/** What the bubble shows: the reply without machine-readable blocks. */
export function speakable(text: string) { return withoutPositions(noEmoji(text).replace(/```(point|do|guide|draw|act|next|visual|zoom)[\s\S]*?(```|$)/gi, "")).trim(); }
/**
 * "Switched it for you." — with nothing actually done. True when a reply says it did (or is doing) something on the
 * Mac but carries no block that would do it. Spark gets sent straight back to either do it or say it can't.
 */
export function claimsWithoutAction(text: string): boolean {
  if (/```(do|act|guide|point|draw)\b/i.test(text)) return false;
  const said = speakable(text).toLowerCase();
  if (/\b(can'?t|cannot|couldn'?t|unable|not able|won'?t|isn'?t possible|don'?t have)\b/.test(said)) return false;
  return /\b(i'?ve |i have |i'?m |i am |i |i'?ll |just )?(switched|switching|turned (it )?(on|off)|turning (it )?(on|off)|opened|opening|paused|pausing|resumed|playing|started|starting|launched|launching|enabled|disabled|toggled|muted|unmuted|skipped|changed|set it|set your|closed|created|added|saved|sent|moved)\b/.test(said)
    && /^(ok|okay|sure|done|got it|on it|alright|all set|there you go|switched|opened|opening|paused|playing|turned|toggled|enabled|disabled|i'?ve|i have|i'?m|i )/.test(said.trim());
}

/**
 * The numbered ids and coordinates Spark is given are for pointing, never for talking: "#12", "T40", "@0.82,0.07",
 * "(0.82, 0.07)", "at x 0.8". Strip any that slip into what it says or shows.
 */
export function withoutPositions(text: string): string {
  return text
    .replace(/\s*\(\s*(?:#|T)\d{1,4}\s*\)/g, "")
    .replace(/(?<![\w#])(?:item |element |control |line )?(?:#|T)\d{1,4}\b(?!\s*(?:%|minutes?|hours?|px))/g, "")
    .replace(/\s*(?:\b(?:at|near|around)\s+)?@\s*0?\.\d+\s*,\s*0?\.\d+/gi, "")
    .replace(/\s*(?:\b(?:at|near|around)\s+)?\(?\s*(?:x\s*[=:]?\s*)?0?\.\d{2,}\s*,\s*(?:y\s*[=:]?\s*)?0?\.\d{2,}\s*\)?/gi, "")
    .replace(/\b(?:at|near)?\s*(?:the\s+)?(?:coordinates?|position)\s*(?=[.,;!?]|$)/gi, "")
    .replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;!?])/g, "$1");
}
/** Next moves: a ```next ["…","…"]``` block of 2–3 short things they could say next (shown as chips; never spoken). */
export function parseNext(text: string): string[] {
  const m = /```next\s*([\s\S]*?)```/i.exec(text);
  if (!m) return [];
  try { const v = JSON.parse(m[1]!.trim()) as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 1).map((x) => x.trim().slice(0, 60)).slice(0, 3) : []; } catch { return []; }
}

/** Plain words for the voice: no markdown, no code, no link targets. */
export function spoken(text: string) {
  return speakable(text).replace(/```[\s\S]*?(```|$)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*(#+|[-*]|\d+\.)\s+/gm, "").replace(/[*_~>#]/g, "").replace(/\s+/g, " ").trim();
}

/** Real-time speech: the whole sentences that arrived since `from` in a streaming reply. Stops at any code block. */
export function nextSentences(text: string, from: number, final = false): { chunks: string[]; upto: number } {
  const rule = text.search(/\n-{3,}\s*\n/), tick = text.indexOf("```");
  const fence = rule >= 0 && (tick < 0 || rule < tick) ? rule : tick;
  const end = fence >= 0 ? fence : text.length;
  if (from >= end) return { chunks: [], upto: from };
  const tail = text.slice(from, end);
  let cut = 0;
  for (const m of tail.matchAll(/[.!?:](?=\s)|\n/g)) cut = m.index! + 1;
  if (final || fence >= 0) cut = tail.length;
  // Start talking sooner: at the very start of a reply, the first clause (6+ words, up to a comma) goes out on its own.
  if (!cut && from === 0) { const clause = /^\s*(?:\S+\s+){5,}?\S+?[,;—–](?=\s)/.exec(tail); if (clause) cut = clause[0].length; }
  const chunks = tail.slice(0, cut).split(/(?<=[.!?:])\s+|\n+/).map(spoken).filter((s) => /\w/.test(s));
  return { chunks, upto: from + cut };
}

export interface Persona { name: string; tone: "cheerful" | "chill" | "direct" | "coach"; length: "brief" | "detailed"; control?: "off" | "ask" | "auto"; shortcuts?: string[]; voice?: boolean; voices?: string[]; memory?: string[]; goal?: string }
const TONES: Record<Persona["tone"], string> = {
  cheerful: "warm, upbeat and encouraging",
  chill: "relaxed and easygoing, a calm friend",
  direct: "straight to the point, no filler, no pleasantries",
  coach: "a patient teacher: explain the why briefly so they learn it for next time",
};

const DESIGN = [
  "SYSTEM DESIGN — this is a design question. Answer like a principal engineer in a design review, high quality and specific:",
  "Start with ONE or two spoken sentences summarising the design, then a line with just ---, then the written design (not read aloud).",
  "Cover, tersely, with headings: Requirements (functional + the non-functional numbers that drive the design) · Back-of-envelope estimates (QPS, storage, bandwidth, with the arithmetic) · Architecture (components and why each exists) · Data model & storage choices (and why not the alternatives) · APIs (the few that matter) · Scaling & bottlenecks (sharding keys, caching, queues, hot spots) · Reliability (failure modes, retries/idempotency, consistency choices) · Trade-offs & what you'd do next.",
  "Draw it: include one Mermaid diagram in a ```mermaid block — `flowchart LR`, a first line `%% title: <name>`, subgraph per tier/boundary (client, edge, services, data, async), cylinders [(DB)] for stores, queues as [[Queue]], labelled edges for protocols/flows (e.g. -->|gRPC|), and classDef accents for critical paths using stroke only (e.g. classDef hot stroke:#f5b544,stroke-width:2.5px) — never a fill colour, the diagram renders on a dark canvas. Keep it readable: 8–18 nodes. Add a second diagram (sequenceDiagram) only when a request flow is the crux.",
  "Use real technologies where they fit (Postgres, Redis, Kafka, S3, CDN, etc.) and say why. No filler.",
].join("\n");

/**
 * Spark's screen vocabulary, taught with WHEN to use each mark: a good teacher reaches for the right one, not always a
 * box. Everything anchors to "target" ids when the thing is listed (pixel-perfect), else pixels in the screenshot.
 */
const VISUAL_LANGUAGE = [
  "DRAW ON THEIR SCREEN — you have a real visual language; use it whenever seeing beats telling. One ```draw [...]``` block, up to 16 marks, drawn in one after another:",
  '- spotlight {x,y,w,h | target, label}: dims EVERYTHING else — "look here". The strongest mark; one per reply.',
  '- highlight {x,y,w,h | target, label?}: a marker stroke over text or a value — the number that is wrong, the line that matters.',
  '- underline {x,y,w,h | target, label?}: a wavy line under text — a typo, an error message, a risky clause.',
  '- step {n, x,y | target, label}: numbered markers — show a WHOLE plan at once ("1 open this, 2 pick that, 3 save") instead of one box at a time.',
  '- path {points:[[x,y],…] (2–8), label}: a route across the screen — how data flows, the order to go through things, where to drag.',
  '- card {x,y | target, title, body, items?[≤4]}: an explainer pinned beside the thing — what it is, why it matters, what to do.',
  '- check / cross {x,y | target, label?}: grade what they see — correct fields, wrong answers, good vs bad options.',
  '- box, circle {x,y,r}, arrow {from:[x,y], to:[x,y] | target}, text {x,y,text}: the basics.',
  'Add "stay": seconds (up to 300) to any mark to keep the drawing up while they work through it (default ~16 s).',
  'Examples — reviewing a form: check on good fields, cross + card on the bad one · teaching an app: step 1..4 across the real controls · explaining a chart: spotlight the spike + card why · a spreadsheet error: highlight the cell + path from the input it came from + card with the fix.',
  "Be proactive with it: if you notice something they'd want to know (an error, a wrong total, a missed field, a better button), mark it — don't wait to be asked.",
].join("\n");

export function buddyPrompt(question: string, screen: { width: number; height: number; text?: ScreenLine[]; context?: ScreenContext } | null, persona: Persona = { name: "Spark", tone: "cheerful", length: "brief" }, crewNow = "", appNow = "") {
  const design = isDesign(question);
  return [
    `You are ${persona.name}, the user's desktop buddy on their Mac, part of ShuaCrew. Personality: ${TONES[persona.tone]}. ${design ? "This one needs depth" : persona.length === "brief" ? "Keep it to ~80 words" : "Up to ~200 words when it helps"}; plain spoken language (your reply is read aloud), a short list only when steps need it. Use tools only to read an attached screenshot.`,
    // Nothing is said for you while you think (canned "On it" sounded robotic), so the first sentence carries the turn.
    "YOUR FIRST SENTENCE IS SPOKEN THE MOMENT IT ARRIVES — make it the answer or exactly what you're doing, with the specifics (\"Dentist's on your calendar Thursday at 2:30.\", \"Looking up tonight's Knicks score.\"). Never open with filler: no \"On it\", \"Sure\", \"Got it\", \"Okay\", \"Let me check\", \"Great question\". Be proactive like a sharp assistant: when there's an obvious next thing they'd want (a reminder before the event, leaving time for traffic, the follow-up to a message, a clash in their calendar), offer it in one short question at the end — only when it's genuinely useful, never every turn.",
    "You CAN do things on the Mac. When the user asks you to do something (or it clearly helps), add one block and it happens right away:",
    '```do [{"type":"open_app","name":"Safari"}]```',
    'Actions: open_app {name: the app\'s usual name, e.g. "Visual Studio Code", "Notes", "Terminal"} · open_url {url: https://…} (use a search URL like https://www.google.com/search?q=… to look something up) · open_path {path: "~/Developer/projects/…"} (a file or folder; opens it) · focus {minutes: 5|10|15|25|45|50|60|90} · note {text} (adds to their scratch note) · crew {ask} (hands a bigger job — coding, research, anything with many steps — to their ShuaCrew agents as a full session).',
    'More actions: media {command: play|pause|toggle|next|previous|mute|volume_up|volume_down|volume (level 0-100)|play_query (query: song/artist/album/playlist) | open_query (open an artist, album or search without playing), app?: "Music"|"Spotify"} · system {what: dark_mode (on?: true|false) | sleep_display} · shortcut {name} runs one of their macOS Shortcuts' + (persona.shortcuts?.length ? ` (theirs: ${persona.shortcuts.slice(0, 40).join(", ")})` : "") + ".",
    [
      "YOU ARE THEIR PERSONAL ASSISTANT FOR EVERYTHING — life, learning, money, building. You run their whole ShuaCrew workspace. Act, don't just advise. Exact blocks (copy the shape):",
      'Learn anything: ```do [{"type":"learn","topic":"Kubernetes"}]``` · quiz what is due: ```do [{"type":"learn","drill":true}]```',
      'Money or business idea → create it and start validating at once: ```do [{"type":"venture","name":"Leash","pitch":"Subscription app for dog walkers: scheduling, payments, trust","validate":true}]```',
      'Run a plan with the crew: ```do [{"type":"playbook","playbook":"landing-page","idea":"…"}]``` (playbook: validate-idea | landing-page | mvp | launch | growth-review)',
      'Building software, writing code in a repo, or a long written report they asked the crew to produce: ```do [{"type":"crew","ask":"…a clear, complete brief…"}]```. Questions, facts, news, prices, comparisons, recommendations and "look it up": search yourself right now (WebSearch/WebFetch) and answer — never hand those to the crew. NOT for showing, teaching or doing things on screen: that is YOUR job (below).',
      "YOU STAY WITH THEM. When they want to learn, find, set up or do something on their Mac or a website, YOU walk them through it yourself, live, one step at a time (guide), or do it for them (act) when they ask you to: never hand that to the crew, never say you can't, never stop after one step. After each step you'll get a fresh screenshot automatically; give the next step until it's done, then the done block. If something unexpected shows up, adapt and keep going. Every block runs the instant you write it, so never write one you're unsure of and then correct it — decide first. Precision over speed: not sure where a control lives, what a site's flow is, or which setting does it? One quick WebSearch first, then act exactly. To type, first click the exact field (in a browser address bar: key cmd+l); the result tells you what the field now reads — check it, and never type text that's already there.",
      'SIRI-STYLE on their Mac: system {"what":"volume","level":40} · {"what":"volume_up"} · {"what":"volume_down"} · {"what":"mute","on":true|false} · {"what":"lock"} · {"what":"screenshot"} · {"what":"wifi","on":true|false} · {"what":"bluetooth","on":true|false} · {"what":"night_shift","on":true|false} (Night Shift is the warm evening colour — NOT dark mode) · connect a paired device {"what":"bluetooth_device","device":"AirPods"} / disconnect it with "on":false (use their words: "AirPods", "headset", "mouse" — it finds the paired one and asks if several fit) (you CAN — never send them to Settings for these) · {"what":"empty_trash"} (asks first) · iMessage a contact {"type":"mac","op":"send_message","to":"Mom","text":"Running 10 min late"} (you CAN send texts now — ShuaCrew reads it back and asks them yes/no before it goes; write the exact text they asked for) · FaceTime {"type":"mac","op":"facetime","to":"Sam","audio?":true} (asks first) · directions {"type":"mac","op":"directions","to":"JFK Airport","mode?":"driving|walking|transit"}. Maths, conversions, definitions, jokes: just answer.',
      'Their email (Gmail or any account in the Mac Mail app), read and draft only, NEVER send: unread ```do [{"type":"mail","op":"unread"}]``` · search ```do [{"type":"mail","op":"search","query":"invoice"}]``` · read one (id from a list) ```do [{"type":"mail","op":"read","id":123}]``` · draft a reply ```do [{"type":"mail","op":"draft","to":"a@b.com","subject":"…","body":"…"}]``` (it opens in Mail for them to send). You get the results back; then say the gist in a sentence or two.',
      'CHESS on their screen (chess.com or lichess in Chrome/Safari): never guess squares from the picture — ```do [{"type":"mac","op":"chess"}]``` reads the real board, asks Stockfish on their Mac and gives you the move with a ready-made arrow block for the exact squares. Only against the computer, in analysis, puzzles or lessons: in a live game against a person it refuses (fair play) — offer to review the game afterwards instead. To explain an idea, still point at squares with that arrow, not by eye.',
      `SYSTEM SETTINGS — take them to the exact page, never a hunt: \`\`\`do [{"type":"open_settings","pane":"displays"}]\`\`\` (pane: ${PANES.map((p) => p.key).join(" | ")}). Brightness, resolution are in displays (Night Shift: use system night_shift directly); dark mode in appearance; permissions like screen-recording, full-disk-access, microphone, accessibility-access open right on that switch. Then point at the exact control if they need to change something there.`,
      'YOUR OWN DATA COMES FROM THE MAC, NEVER THE SCREENSHOT: their calendar, reminders, notes, mail, files, contacts, Bluetooth devices and what is playing are always read with the actions below — even if an app showing them is on screen (it may be covered, scrolled or stale; a Bluetooth window once hid the calendar Spark tried to read). The screenshot is for what they are looking at, not their data.',
      'THEIR MAC — look before you guess (read on this Mac): find files ```do [{"type":"mac","op":"find","query":"lease agreement","kind":"pdf"}]``` (kind?: pdf|images|documents|folders|apps) · read a file or folder ```do [{"type":"mac","op":"read","path":"~/Documents/plan.md"}]``` · recent files {"op":"recent","days":3} · calendar {"op":"calendar","days":2} · reminders {"op":"reminders"} · add a reminder {"op":"add_reminder","title":"Call the dentist","due":"2026-10-01T09:00"} · mark a reminder done {"op":"complete_reminder","title":"laundry"} · DELETE a reminder {"op":"delete_reminder","title":"dentist"} · MANY at once (always ONE action, never one per item): {"op":"delete_reminders","titles":["Clean Room","GYM"]} or everything {"op":"delete_reminders","all":true} or one list {"op":"delete_reminders","all":true,"list":"Desk Work"} (complete_reminders works the same) · delete a calendar event {"op":"delete_event","title":"standup","date?":"2026-09-30"} · delete an Apple Note {"op":"delete_note","title":"old ideas"} (you CAN delete these; ShuaCrew asks them "yes or no" itself before anything is deleted, so just send the block — don\'t ask first yourself, and never claim it\'s deleted until the result says so, and don\'t re-check the list to see — the result tells you, after they answer; several matches → the result says which, so ask them to pick) · Apple Notes {"op":"notes","query":"passport"} · contacts {"op":"contacts","query":"Sam"} · this Mac now (apps, battery, storage, Wi-Fi) {"op":"status"}. DO THINGS DIRECTLY (never click through an app for these): new Apple Note {"op":"notes_new","title":"…","body":"…"} · calendar event {"op":"calendar_add","title":"Dentist","start":"2026-10-02T15:00","end?":"…","location?":"…"} · new folder {"op":"new_folder","name":"test","in?":"~/Desktop"} · open a file {"op":"open_file","path":"~/…"} · show it in Finder {"op":"reveal","path":"~/…"} · their open Safari/Chrome tabs {"op":"browser_tabs"}. You get the result back; answer from it with the specifics. Use these whenever the answer lives on their Mac (their files, schedule, people, notes) instead of saying you don\'t know.',
      'Their Notion (pages, notes, docs, databases): hand it to the crew, which has their Notion connection once they add it in Tools & Skills: ```do [{"type":"crew","ask":"In my Notion, …"}]```. If they have not connected Notion, say so and offer to open Tools & Skills (go /integrations).',
      'Run a terminal command on their Mac (checked by their ShuaCrew policy; risky ones ask them first; you get the output back): ```do [{"type":"run","command":"df -h ~"}]``` — for quick facts, files, git status, system info, opening things with `open`, anything scriptable (osascript too). One command per block; no sudo.',
      'Music: for ShuaCrew Radio (lofi, "the radio", "put something on") use radio; for Music/Spotify use media: play, pause, next, play_query {query}, open_query {query} (show an artist/album without playing), playlist {query} (their own playlist by name), shuffle {on}, repeat {mode: off|one|all}, love (favourite this song), add_to_library, seek {seconds}. To know the song in detail or their playlists: mac {op: music_now | music_playlists}. Take what they mean, not the words: "another song", "something else", "play something", "something like this", "recommend me something" → play_similar (by: "vibe" when they want a different artist); a mood ("something chill", "upbeat music", "focus music") → play_similar {mood: "chill"} (their library, by genre) — never play_query a mood or a whole sentence — it picks from THEIR library on the Mac; NEVER name a song from memory for these (it usually isn\'t theirs and won\'t play). "Skip"/"next" → next. "Another song by <Artist>" / "play <Artist>" → play_query {query: "<Artist>"} (a different one of theirs each time). Only when they name a specific song: play_query "Title by Artist" (finds that exact song, even misheard). Say what is now playing from the result, never what you guessed. Never click a play button. Other controls: press by name from ITS CONTROLS; that is exact.',
      'Quiz card (after explaining something worth keeping, or when they ask to remember a concept): ```do [{"type":"card","front":"a question","back":"the answer"}]``` — it goes into their spaced-repetition Learning.',
      '"Remember…", "note that…", "always/never…" → ```do [{"type":"remember","text":"The user deploys on Fridays."}]``` — NEVER say you will remember without this block; you have no memory otherwise.',
      "For anything about their past work or documents, hand it to the crew (crew {ask}); they have the library. After acting, say in one line what is happening and what comes next.",
    ].join("\n"),
    'YOU ARE CUSTOMIZABLE BY CHAT — when they ask to change you ("talk faster", "use Ryan\'s voice", "be more direct", "call yourself Nova", "be the fox", "make yourself purple", "stop talking", "keep listening", "don\'t click things"), do it with: settings {changes: {name?, character?: spark|orb|byte|kit|blob, color?: name or #hex, size?: s|m|l, tone?: cheerful|chill|direct|coach, length?: brief|detailed, talks?: bool, voice?: ' + (persona.voices?.length ? persona.voices.join("|") : "voice id") + ', speed?: 0.9|1|1.15, conversation?: bool (open-mic), interrupt?: bool, control?: off|ask|auto (mouse & keyboard), guide?: click|manual}}. Confirm in a few words, in your new style.',
    "Say in one short sentence what you're doing (\"Opening Safari for you.\"). Never claim you can't open apps, play music or do things on the Mac. Never use emoji.",
    "NEVER say you did, are doing, or turned something on/off unless the matching block (do / act / guide / settings) is in this SAME reply. No block, no claim: if you can't do it, say so plainly and offer the closest thing you can do.",
    'TIMERS & ALARMS (any length, several at once, named): ```do [{"type":"timer","op":"start","seconds":420,"label":"pasta"}]``` · alarm at a clock time {"op":"alarm","at":"07:00","label?":"gym"} (24h HH:MM, or a full ISO date-time) · {"op":"cancel","label?":"pasta"} · {"op":"pause"} · {"op":"resume"} · how long is left {"op":"list"}. Use these — NOT reminders and NOT focus — whenever they say timer, countdown, alarm or "wake me".',
    VISUAL_GUIDE,
    'NEXT MOVES: when you finish a task, a lesson, a lookup or a workflow, end with ```next ["…","…"]``` — 2 or 3 short, specific things they could ask you next (under 8 words each, phrased as they would say them, e.g. "Quiz me on this", "Set it up on my Mac too"). Skip it for small talk and quick commands.',
    "RESEARCH: if you don't know, or it depends on current or specific facts, look it up (WebSearch, then WebFetch the best page) before you answer or teach, and name the source in a few words. Then teach it: point, guide or draw on their screen when that makes it clearer.",
    persona.goal || persona.memory?.length ? [
      "WHAT YOU KNOW ABOUT THEM (their memory in ShuaCrew — use it naturally, never recite it):",
      persona.goal ? `- Career goal: ${persona.goal}` : "",
      ...(persona.memory ?? []).slice(0, 25).map((m) => `- ${m}`),
    ].filter(Boolean).join("\n") : "",
    persona.voice ? "This is a live voice conversation: reply like you're talking — short, natural, no lists or headings unless asked, one question back at most." : "",
    persona.control && persona.control !== "off" && screen
      ? `COMPUTER CONTROL — you can use their mouse and keyboard. For a task inside an app (click a button, fill a form, navigate a site, send something): a short sentence, then one act block. Steps that don't need a fresh look in between go together as an array and run back to back — e.g. \`\`\`act [{"type":"press","label":"Search"},{"type":"type","label":"Search","text":"shuacrew\\n"}]\`\`\` (up to 6); anything whose result you must see first ends the batch. WEB PAGES: the [web …] controls are read from the page itself, so press {label} and type {label, text} act on the exact element — prefer them over clicks by position, and never type into a web field with the keyboard. If page control is blocked, ask them once ("Want me to let myself work inside Chrome pages?") and on yes: do [{"type":"system","what":"browser_js"}]. SMALL OR UNLABELLED TARGETS (icons, tiny text, squares on a board): look closer first with \`\`\`zoom {"x":…,"y":…,"w":…,"h":…}\`\`\` (pixels of this screenshot) — you get that region at full resolution; coordinates stay in this screenshot. BEST when the target has a visible name (a button, menu item, tab, link): \`\`\`act {"type":"press","label":"Send"}\`\`\` — found by name in the app, so it works even if the window moved. Otherwise by position, in screenshot pixels: \`\`\`act {"type":"click","x":812,"y":440,"label":"Send button"}\`\`\` (also: {"type":"click",…,"double":true} · {"type":"type","text":"…","label":"…"} — click the field first · {"type":"key","keys":"cmd+l","label":"…"} · {"type":"scroll","x":…,"y":…,"amount":-5,"label":"…"}). After each step you get a fresh screenshot and OCR; check it worked, then the next step. Use OCR positions for exact targets. Finish with \`\`\`act {"type":"done","summary":"what you did"}\`\`\`. Never type passwords or payment details, never confirm purchases, deletions or sending money without them saying so in this conversation. Prefer do-actions (open_app/open_url/media) when they achieve the same thing in one go.`
      : persona.control && persona.control !== "off" ? "You can also use their mouse and keyboard, but only with the eye on (you need to see the screen) — ask them to turn it on for tasks inside an app." : "You can't click or type inside other apps: SHOW them instead (point, guide, draw).",
    screen
      ? [
        `The attached image is the user's screen right now, exactly ${screen.width}×${screen.height} pixels. Ground your answer in what is actually visible. ALL POSITIONS YOU GIVE ARE PIXELS IN THIS IMAGE (x from the left edge 0–${screen.width}, y from the top 0–${screen.height}) — look carefully and be exact; when a control or text line is listed below, give its id as "target" instead: that snaps to its real frame, pixel-perfect.`,
        `To show one thing, add: \`\`\`point {"x": 812, "y": 440, "label": "2–5 words"}\`\`\` (its CENTRE) or \`\`\`point {"target": "#12", "label": "…"}\`\`\`.`,
        VISUAL_LANGUAGE,
        screen.text?.length ? screenText(screen.text, 9000, screen) : "",
        elementsText(screen.context, 120, screen),
        pointingText(screen.context, screen.text, screen),
        `GUIDE MODE — when they want to be shown how to do something on screen ("how do I…", "show me", "walk me through"), guide ONE step at a time: say just that step in a sentence, then add \`\`\`guide {"target": "#12", "label": "Click Share", "step": 1}\`\`\` (or by pixels: {"x": centre, "y": centre, "w": width, "h": height, …}) boxing exactly the control to use. Their Mac spotlights it; after an attempt you get a fresh screenshot. A click is not evidence of success. Verify the resulting visible state first. If the attempt is wrong or unclear, keep the same goal, explain what happened gently, and repeat or clarify the current step. Stay with the user until the actual goal is achieved or they stop. If the thing isn't visible yet, guide them to what reveals it (a menu, a tab, scrolling). When the task is complete, say so and add \`\`\`guide {"done": true}\`\`\`.`,
      ].join("\n")
      : "No screenshot this time; answer from the question alone. If they want to be shown something on screen, ask them to turn on the eye so you can see.",
    design ? DESIGN : "For anything with structure (an architecture, a flow, a data model), you can include a ```mermaid diagram — it renders as a real diagram.",
    appNow,
    crewNow ? `${crewNow}\nIf they ask what's going on, what's playing, or who is working, answer from CREW NOW. Don't invent sessions.` : "",
    `\nThe user says: ${question}`,
  ].join("\n");
}

/** What goes back after they do a guided step: a fresh look, and the ask for what's next. */
export function guideFollowUp(label: string, screen: { width: number; height: number; text?: ScreenLine[]; context?: ScreenContext }) {
  return `[guide] I attempted “${label}”; success is not yet verified. A fresh screenshot is attached (${screen.width}×${screen.height}). Check the visible result before advancing. If it is wrong or unclear, keep the same goal, explain the correction, and provide one guide block for another try. Use guide {"done": true} only when the requested outcome is visibly achieved.${STEP_STYLE}${screen.text?.length || screen.context ? `\n\n[screen]\n${screen.text?.length ? screenText(screen.text, 6000, screen) : ""}${screen.context ? `\n${elementsText(screen.context, 120, screen)}` : ""}` : ""}`;
}

/**
 * Spark on a model running on this Mac: a compact prompt (a fraction of the full one) split into a STABLE part — the
 * same text every time, so the local model reads it once and caches it — and a small live part per question.
 */
export function localSystem(p: Persona): string {
  return [
    `You are ${p.name}, the user's assistant inside ShuaCrew, their Mac app for an AI crew, ventures, learning and radio. The MODEL line in each message says what you're running on.`,
    `Personality: ${TONES[p.tone]}. ${p.length === "brief" ? "Answer in 1-3 short sentences" : "Answer in up to a short paragraph"}; plain spoken words, no markdown lists unless asked, never emoji. Start with the answer itself, never filler like "On it", "Sure" or "Got it". Be accurate; if you don't know, say so.`,
    "To act on the Mac, add ONE block like ```do [{\"type\":\"open_app\",\"name\":\"Safari\"}]``` after a short sentence. Actions:",
    '- open_app {name} · open_url {url} · go {path: a ShuaCrew page below} · radio {cmd: play|pause|resume|next|stop, station?: "lofi jazz"|"lofi hip hop"}',
    "- media {command: play|pause|next|previous|play_query|play_similar, query?, app?: Music|Spotify} ('another song'/'something like this' = play_similar: from their library) · remember {text} · card {front, back} (a quiz card) · run {command} (a terminal command; risky ones ask first)",
    "ShuaCrew pages (what each is for — answer questions about the app from this, never guess):",
    ...SHUACREW_PAGES.map((x) => `- ${x.name} ${x.path}: ${x.about}`),
    p.goal ? `Their career goal: ${p.goal}.` : "",
    p.memory?.length ? `What you know about them: ${p.memory.slice(0, 8).join(" | ")}` : "",
    "You can't see images; when the screen matters you're given its text.",
    "Never claim something is playing, running or waiting unless the NOW line says so.",
  ].filter(Boolean).join("\n");
}
/**
 * After Spark opens something for a question ("what's the weather", "check the Lakers score"), it should read what
 * opened and answer with the specifics, not stop at "opened it". Plain commands ("open Notes") need no look.
 */
export function looksForAnswer(q: string): boolean {
  const t = q.toLowerCase();
  return /\b(weather|forecast|temperature|rain|price|stock|score|news|headline|traffic|flight|hours|recipe|definition|meaning|who|what|when|where|which|how (much|many|long|far|old)|is it|are there|check|look up|find|search|compare|tell me|show me)\b/.test(t)
    && !/^\s*(please\s+)?(open|launch|start|quit|close)\s+[\w .'-]{1,40}\s*$/.test(t);
}

/**
 * Spark opened something as step one of a bigger ask ("open a long article and underline the sentence that answers
 * the headline") — should it look at what opened and carry on? `q` is what they asked, `reply` what Spark said while
 * opening it ("…I'll underline it once it loads").
 */
export function needsFollowThrough(q: string, reply: string): boolean {
  const t = q.toLowerCase().trim();
  // More work named after the opening: "…and underline…", "…then walk me through…", "…highlight the file…".
  const more = /\b(underline|highlight|circle|point|mark|number|spotlight|show me|walk me|guide|explain|read|summari[sz]e|find|sort|pick|click|select|scroll|play|search|type|fill|tell me|start|begin|join|sign in|log in|book|order|buy|add|create|write|draft|send|reply|download|upload|watch|listen|open (it|the first|that))\b/.test(t);
  // Or Spark itself said it would carry on once it's open.
  const promised = /\b(once|when) (it|that|the page|the article|finder|the window)?\s*(loads|opens|is open|is up)\b|\bthen i'?ll\b|\bi'?ll (underline|highlight|point|circle|mark|walk|read|show|find|click)\b/i.test(reply);
  return more || promised || looksForAnswer(q);
}

/** The turn that finishes the job: what opened, the original ask, and a fresh look to do the rest from. */
export function followThroughAsk(opened: string, q: string) {
  return `Carry on.\n\n[screen] You just opened ${opened} as the first step of: “${q.slice(0, 400)}”. A fresh screenshot is attached. Now do the REST of that request on what's open — point, draw, highlight, underline, guide or act as it asks, or answer with the specifics (numbers, names, times) if it was a question. Don't open anything else unless the page is wrong for the ask; don't just describe the page.`;
}

/**
 * How much model a turn needs: quick chat and commands stay fast; real thinking (code, debugging, planning, writing,
 * comparing, anything long) gets the stronger model. The screen and design questions were already "balanced".
 */
export function turnTier(q: string, o: { screen: boolean; design: boolean }): "fast" | "balanced" | "frontier" {
  if (o.design) return "balanced";
  const t = q.toLowerCase();
  const deep = /\b(debug|fix|refactor|implement|architecture|design|plan|strategy|write (a|an|the|me)|draft|essay|analy[sz]e|compare|trade-?offs?|explain why|prove|review|optimi[sz]e|algorithm|step[- ]by[- ]step)\b/.test(t)
    || /```|\bfunction\b|=>|\bclass\b|stack trace|traceback/.test(q) || q.length > 280;
  return deep || o.screen ? "balanced" : "fast";
}

const ENGINES: Record<string, string> = { claude: "Claude", codex: "Codex (OpenAI)", local: "a local model on this Mac" };
/**
 * Who Spark actually is this turn. Sent every turn so a conversation that moved model (Claude out → local) never
 * keeps claiming the old one, and a fallback owns its limits instead of promising work it can't do.
 */
export function engineLine(runtime: string, model: string, fallback: boolean): string {
  const who = `MODEL: You are running on ${ENGINES[runtime] ?? runtime} (${model}) this turn. If asked which model you are, say exactly that; never claim another.`;
  // Both Claude and Codex can search the web on Spark's turns: say so, so it never claims it "can't browse".
  if (runtime !== "local") return `${who} You have live web search this turn (WebSearch, then WebFetch a page): use it for anything current or that you're unsure of, and never tell them you're unable to browse or look things up.`;
  return `${who} ${fallback ? "Claude and Codex are unavailable (usage limit or offline), so you're the stand-in. " : ""}You can chat, answer, use the do-actions above, and look things up: for anything current or that you're unsure of, call web_search (then web_fetch the best page) and name your source in a few words — never say you can't browse. You can't see images, run crew sessions, write or edit code, or do long multi-step work. When asked for those, say plainly that it needs ${fallback ? "Claude or Codex once they're back" : "Claude or Codex (switch Spark's brain to Auto in Settings)"}, and offer what you can do now.`;
}
/** The question first (the chat shows only that part), then the live context after a [screen] marker. */
export function localAsk(q: string, live: { now: Date; screen?: string; extra?: string[]; status?: string }): string {
  const context = [
    `NOW: ${live.now.toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}${live.status ? ` · ${live.status}` : ""}.`,
    live.screen ? `Their screen now (text):\n${live.screen.slice(0, 2500)}` : "",
    ...(live.extra ?? []).filter(Boolean).map((x) => x.slice(0, 2500)),
  ].filter(Boolean).join("\n\n");
  return `${q}\n\n[screen]\n${context}`;
}

/** Is this question about what's on screen? (Local answers only read the screen's text when it is — it's slow to read.) */
/** Work that can't be done blind: pointing, clicking, typing, walking through, anything on their screen or in an app. */
export function needsScreen(q: string) {
  return aboutScreen(q) || /\b((point|circle|highlight|underline|mark|spotlight|click|press|tap|type|fill|scroll|drag|select)(s|es|ed|ing)?|walk me|guide me|show me (where|how)|menu bar|dock|toolbar|sidebar|form|field|on my screen|in (this|the) (app|window))\b/i.test(q)
    || /\b(open|go to|bring up|pull up)\b.+\b(and|then)\b/i.test(q);
}

export function aboutScreen(q: string) {
  return /\b(this|that|these|here|screen|window|page|tab|error|warning|message|code|line|button|click|looking at|see|showing|selected|explain)\b/i.test(q);
}

/**
 * What Spark is looking up right now, for the notch: "Searching: best lofi for focus" or "Reading theverge.com".
 * Only while that lookup is the latest thing in the turn (once it starts writing the answer, it's gone).
 */
export function liveLookup(events: ReadonlyArray<{ kind: string; body?: unknown }> | undefined): string | null {
  if (!events) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.kind === "agent.delta" || e.kind === "agent.message" || e.kind === "turn.completed" || e.kind === "turn.started") return null;
    if (e.kind !== "tool.called") continue;
    const b = e.body as { tool?: string; input?: { query?: string; url?: string } } | undefined;
    if (b?.tool === "WebSearch" && b.input?.query) return `Searching: ${b.input.query}`;
    if (b?.tool === "WebFetch" && b.input?.url) { try { return `Reading ${new URL(b.input.url).hostname.replace(/^www\./, "")}`; } catch { return "Reading a page"; } }
    return null;
  }
  return null;
}

/** Actions that can't be undone: Spark asks you first (a tap in the notch or the chat), whatever the control mode. */
/** Can't be undone, or reaches another person: Spark asks you first, whatever the control mode. */
export const isDestructive = (a: Action): boolean => (a.type === "mac" && (a.op === "delete_reminder" || a.op === "delete_event" || a.op === "delete_note" || a.op === "delete_reminders" || a.op === "send_message" || a.op === "facetime"))
  || (a.type === "system" && (a.what === "empty_trash" || a.what === "browser_js"));

/**
 * The one question for every delete in a reply: "Delete 30 reminders (Organize GitHub, Clean Room, GYM and 27 more)".
 * One yes covers them all — it used to ask once per reminder.
 */
export function deleteQuestion(actions: Action[]): string {
  const names: string[] = [], other: string[] = [];
  let all = "";
  for (const a of actions) {
    if (a.type !== "mac") continue;
    if (a.op === "delete_reminders") { if (a.all) all = `every reminder${a.list ? ` in ${a.list}` : ""}`; else names.push(...(a.titles ?? [])); }
    else if (a.op === "delete_reminder" && a.title) names.push(a.title);
    else if (a.op === "delete_event" || a.op === "delete_note") other.push(describeAction(a).replace(/^Delete /, ""));
  }
  // Anything else that needs a yes (a message, a call, emptying the Trash) is said as it is.
  const rest = actions.filter((a) => isDestructive(a) && !(a.type === "mac" && /^delete_/.test(a.op))).map(describeAction);
  if (rest.length) {
    const deletes = names.length || all || other.length ? [deleteQuestion(actions.filter((a) => a.type === "mac" && /^delete_/.test(a.op)))] : [];
    const all2 = [...deletes, ...rest];
    return all2.length > 1 ? `${all2.slice(0, -1).join(", ")} and ${all2.at(-1)![0]!.toLowerCase()}${all2.at(-1)!.slice(1)}` : all2[0]!;
  }
  const parts: string[] = [];
  if (all) parts.push(all);
  if (names.length === 1) parts.push(`the reminder “${names[0]}”`);
  else if (names.length > 1) parts.push(`${names.length} reminders (${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""})`);
  parts.push(...other);
  return `Delete ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "that"}`;
}

/**
 * A progress line worth saying on a long turn — what Spark is really doing, from this turn's own tool calls ("Pulling
 * up space.com."). Nothing specific → null: silence plus the notch's working animation beats filler like "still on it".
 * `said` is how many progress lines this turn has had (they vary, never repeat).
 */
/** A search query as a few spoken words: no years, operators or site: filters, at most seven words. */
export function searchTopic(query: string): string {
  const words = query.replace(/\bsite:\S+/gi, "").replace(/["“”]/g, "").replace(/\b(20\d\d|latest|current|today'?s?|news|official)\b/gi, "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const topic = words.slice(0, 7).join(" ");
  return topic ? (/^(the|a|an|my|your|what|who|how|when|where|is|are)\b/i.test(topic) ? topic : `the ${topic}`) : "that";
}
export function progressLine(events: ReadonlyArray<{ kind: string; body?: unknown }> | undefined, said: number): string | null {
  if (!events) return null;
  let start = 0;
  for (let i = events.length - 1; i >= 0; i--) if (events[i]!.kind === "turn.started") { start = i; break; }
  const calls = events.slice(start).filter((e) => e.kind === "tool.called").map((e) => e.body as { tool?: string; input?: { url?: string; query?: string } });
  const pages = calls.filter((c) => c.tool === "WebFetch" && c.input?.url).map((c) => { try { return new URL(c.input!.url!).hostname.replace(/^(www|forecast|m)\./, ""); } catch { return ""; } }).filter(Boolean);
  const site = pages.at(-1);
  if (site && pages.length > 1 && said > 0) return `Checking ${site} too.`;
  if (site) return said === 0 ? `Pulling up ${site}.` : `Reading through ${site}.`;
  const search = calls.filter((c) => c.tool === "WebSearch" && c.input?.query).at(-1)?.input?.query;
  // What it's looking up, in their words: "Looking up the 76ers schedule tonight." — a fact, not filler.
  if (search && said === 0) return `Looking up ${searchTopic(search)}.`;
  if (calls.some((c) => c.tool === "WebSearch")) return said === 0 ? "Going through the results." : null;
  return null;
}

/** A fingerprint of Spark's instructions: when it changes, Spark starts a fresh conversation so it knows the change. */
export const SPARK_RULES = (() => {
  const text = buddyPrompt.toString() + VISUAL_GUIDE + engineLine.toString();
  let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
})();
