import { noEmoji } from "./no-emoji";
/** The desktop buddy's contract with the model: short answers, a place to point on screen, and things to do on the Mac. */
export interface Point { x: number; y: number; label: string }

/** One step of a guided walkthrough: where to look (a box, as fractions of the screenshot) and what to do there. */
export interface GuideStep { x: number; y: number; w: number; h: number; label: string; step: number; done: false }
export type Guide = GuideStep | { done: true };

/** A shape Spark sketches on your screen (fractions of the screenshot, from the top-left). */
export type Shape =
  | { shape: "box"; x: number; y: number; w: number; h: number; label?: string }
  | { shape: "circle"; x: number; y: number; r: number; label?: string }
  | { shape: "arrow"; from: [number, number]; to: [number, number]; label?: string }
  | { shape: "text"; x: number; y: number; text: string };

/** One line of on-device OCR: exact text and its box (fractions, from the top-left). */
export interface ScreenLine { t: string; x: number; y: number; w: number; h: number }

/** What Spark may do on your Mac. The Mac app checks every one again before doing it. */
export type Action =
  | { type: "open_app"; name: string }
  | { type: "open_url"; url: string }
  | { type: "open_path"; path: string }
  | { type: "focus"; minutes: number }
  | { type: "crew"; ask: string }
  | { type: "note"; text: string }
  | { type: "media"; command: "play" | "pause" | "toggle" | "next" | "previous" | "play_query" | "volume" | "volume_up" | "volume_down" | "mute"; query?: string; app?: string; level?: number }
  | { type: "system"; what: "dark_mode" | "sleep_display"; on?: boolean }
  | { type: "shortcut"; name: string }
  | { type: "settings"; changes: SparkChanges }
  | { type: "learn"; topic?: string; drill?: boolean }
  | { type: "venture"; name: string; pitch?: string; validate?: boolean }
  | { type: "playbook"; playbook: string; idea?: string; venture?: string }
  | { type: "remember"; text: string }
  | { type: "run"; command: string };
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
    const v = JSON.parse(m[1]!.trim()) as { x?: unknown; y?: unknown; label?: unknown };
    const x = Number(v.x), y = Number(v.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y, label: typeof v.label === "string" ? v.label.trim().slice(0, 60) : "" };
  } catch { return null; }
}

const frac = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null; };
/** A ```guide {...}``` block: the next step (centre x,y and size w,h as fractions), or {"done": true}. */
export function parseGuide(text: string): Guide | null {
  const m = /```guide\s*([\s\S]*?)```/i.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]!.trim()) as Record<string, unknown>;
    if (v.done === true) return { done: true };
    const x = frac(v.x), y = frac(v.y);
    if (x === null || y === null) return null;
    const w = Math.max(0.01, Math.min(0.6, frac(v.w) ?? 0.04)), h = Math.max(0.01, Math.min(0.6, frac(v.h) ?? 0.04));
    const step = Number.isInteger(v.step) && (v.step as number) > 0 && (v.step as number) < 100 ? (v.step as number) : 1;
    return { x, y, w, h, label: typeof v.label === "string" ? v.label.trim().slice(0, 60) : "", step, done: false };
  } catch { return null; }
}

const unit = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
const lab = (v: unknown) => (typeof v === "string" && v.trim() ? { label: v.trim().slice(0, 60) } : {});
/** A ```draw [...]``` block: up to 12 validated shapes. */
export function parseDraw(text: string): Shape[] {
  const m = /```draw\s*([\s\S]*?)```/i.exec(text);
  if (!m) return [];
  try {
    const v = JSON.parse(m[1]!.trim()) as unknown, list = Array.isArray(v) ? v : [v], out: Shape[] = [];
    for (const raw of list) {
      const o = raw as Record<string, unknown>;
      if (o?.shape === "box" && [o.x, o.y, o.w, o.h].every(unit)) out.push({ shape: "box", x: o.x as number, y: o.y as number, w: o.w as number, h: o.h as number, ...lab(o.label) });
      else if (o?.shape === "circle" && [o.x, o.y, o.r].every(unit)) out.push({ shape: "circle", x: o.x as number, y: o.y as number, r: o.r as number, ...lab(o.label) });
      else if (o?.shape === "arrow" && Array.isArray(o.from) && Array.isArray(o.to) && [...o.from, ...o.to].length === 4 && [...o.from, ...o.to].every(unit)) out.push({ shape: "arrow", from: o.from as [number, number], to: o.to as [number, number], ...lab(o.label) });
      else if (o?.shape === "text" && [o.x, o.y].every(unit) && typeof o.text === "string" && o.text.trim()) out.push({ shape: "text", x: o.x as number, y: o.y as number, text: o.text.trim().slice(0, 60) });
    }
    return out.slice(0, 12);
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
export interface ScreenContext { app?: string; window?: string; elements?: Array<{ name: string; role: string; x: number; y: number }> }
export function elementsText(ctx: ScreenContext | undefined, max = 120) {
  if (!ctx?.app && !ctx?.elements?.length) return "";
  const rows = (ctx.elements ?? []).slice(0, max).map((e) => `${e.name} [${e.role}] @${e.x.toFixed(3)},${e.y.toFixed(3)}`);
  return `IN FRONT: ${ctx.app ?? "?"}${ctx.window ? ` — “${ctx.window}”` : ""}.${rows.length ? `\nITS CONTROLS — exact, from macOS accessibility ("name [role] @x,y" centres as fractions from the top-left). To use one, act press {label: name} (most reliable) or point/guide at its @x,y:\n${rows.join("\n")}` : ""}`;
}

/** Machine blocks that have finished streaming, in order: each can run the moment it's complete. */
export function completedBlocks(text: string): Array<{ key: string; kind: "do" | "act" | "point" | "guide" | "draw"; raw: string }> {
  const out: Array<{ key: string; kind: "do" | "act" | "point" | "guide" | "draw"; raw: string }> = [];
  for (const m of text.matchAll(/```(do|act|point|guide|draw)\s*([\s\S]*?)```/gi)) out.push({ key: `${m.index}:${m[1]!.toLowerCase()}`, kind: m[1]!.toLowerCase() as "do", raw: m[0] });
  return out;
}

/** OCR lines as a compact, exact block for the model (reading order, with centres). */
export function screenText(lines: ScreenLine[] | undefined, max = 9000) {
  if (!lines?.length) return "";
  const rows = [...lines].sort((a, b) => (Math.abs(a.y - b.y) < 0.006 ? a.x - b.x : a.y - b.y)).map((l) => `${l.t} @${l.x.toFixed(3)},${l.y.toFixed(3)}`);
  let out = "", n = 0;
  for (const r of rows) { if (out.length + r.length > max) break; out += r + "\n"; n++; }
  return `SCREEN TEXT — exact, from on-device OCR of the full-resolution screen (${n}${n < rows.length ? ` of ${rows.length}` : ""} lines; "text @x,y" = centre as fractions from the top-left). Quote numbers and names from here, not from the image; use these positions to point precisely:\n${out}`;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
function toAction(v: unknown): Action | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  switch (o.type) {
    case "open_app": { const name = str(o.name, 80); return name ? { type: "open_app", name } : null; }
    case "open_url": { const url = str(o.url, 2000); try { return url && /^https?:$/.test(new URL(url).protocol) ? { type: "open_url", url } : null; } catch { return null; } }
    case "open_path": { const path = str(o.path, 500); return path && /^~?\//.test(path) && !path.split("/").includes("..") ? { type: "open_path", path } : null; }
    case "focus": { const minutes = Number(o.minutes); return [5, 10, 15, 25, 45, 50, 60, 90].includes(minutes) ? { type: "focus", minutes } : null; }
    case "crew": { const ask = str(o.ask, 4000); return ask ? { type: "crew", ask } : null; }
    case "note": { const text = str(o.text, 2000); return text ? { type: "note", text } : null; }
    case "media": {
      const cmds = ["play", "pause", "toggle", "next", "previous", "play_query", "volume", "volume_up", "volume_down", "mute"] as const;
      const command = cmds.find((c) => c === o.command); if (!command) return null;
      const level = Number(o.level), query = str(o.query, 200), app = str(o.app, 20);
      if (command === "play_query" && !query) return null;
      return { type: "media", command, ...(query ? { query } : {}), ...(app ? { app } : {}), ...(Number.isFinite(level) ? { level: Math.max(0, Math.min(100, Math.round(level))) } : {}) };
    }
    case "system": return o.what === "dark_mode" || o.what === "sleep_display" ? { type: "system", what: o.what, ...(typeof o.on === "boolean" ? { on: o.on } : {}) } : null;
    case "shortcut": { const name = str(o.name, 120); return name ? { type: "shortcut", name } : null; }
    case "settings": { const changes = parseChanges(o.changes); return changes ? { type: "settings", changes } : null; }
    case "learn": { const topic = str(o.topic, 120); return topic || o.drill === true ? { type: "learn", ...(topic ? { topic } : {}), ...(o.drill === true ? { drill: true } : {}) } : null; }
    case "venture": { const name = str(o.name, 60), pitch = str(o.pitch, 300); return name ? { type: "venture", name, ...(pitch ? { pitch } : {}), ...(o.validate === true ? { validate: true } : {}) } : null; }
    case "playbook": { const playbook = (PLAYBOOKS as readonly string[]).includes(o.playbook as string) ? (o.playbook as string) : null; const idea = str(o.idea, 300), venture = str(o.venture, 80); return playbook ? { type: "playbook", playbook, ...(idea ? { idea } : {}), ...(venture ? { venture } : {}) } : null; }
    case "remember": { const text = str(o.text, 500); return text ? { type: "remember", text } : null; }
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
    case "crew": return "Hand to the crew";
    case "note": return "Add to your note";
    case "media": return a.command === "play_query" ? `Play “${a.query}”` : `Music: ${a.command.replace("_", " ")}`;
    case "system": return a.what === "dark_mode" ? "Dark mode" : "Sleep display";
    case "shortcut": return `Run “${a.name}”`;
    case "settings": return `Updated: ${Object.keys(a.changes).join(", ")}`;
    case "learn": return a.drill ? "Quiz drill" : `Course: ${a.topic}`;
    case "venture": return `Venture: ${a.name}`;
    case "playbook": return `Playbook: ${a.playbook.replace(/-/g, " ")}`;
    case "remember": return "Taught the crew";
    case "run": return `Run ${a.command.length > 48 ? `${a.command.slice(0, 48)}…` : a.command}`;
  }
}

/** An ```act {...}``` block: Spark's next mouse/keyboard step, or {"type":"done"}. Validated; ⌘Q and friends are the Mac's call. */
export function parseAct(text: string): Act | null {
  const m = /```act\s*([\s\S]*?)```/i.exec(text);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]!.trim()) as Record<string, unknown>;
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

/** What goes back after Spark does a step: what happened, a fresh look, and the ask for the next step. */
export function actFollowUp(did: string, ok: boolean, screen: { width: number; height: number; text?: ScreenLine[]; context?: ScreenContext }, step: number, max: number) {
  return `[act] Step ${step} ${ok ? "done" : "FAILED"}: ${did}. A fresh screenshot is attached (${screen.width}×${screen.height}). ${step >= max ? "That was the last allowed step: finish with {\"type\":\"done\"} and say what's left." : "Next single step as one act block, or {\"type\":\"done\",\"summary\":\"…\"} when the task is complete."}${screen.text?.length ? `\n\n${screenText(screen.text, 6000)}` : ""}${screen.context ? `\n\n${elementsText(screen.context)}` : ""}`;
}

/** What the bubble shows: the reply without machine-readable blocks. */
export function speakable(text: string) { return noEmoji(text).replace(/```(point|do|guide|draw|act)[\s\S]*?(```|$)/gi, "").trim(); }

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

export function buddyPrompt(question: string, screen: { width: number; height: number; text?: ScreenLine[]; context?: ScreenContext } | null, persona: Persona = { name: "Spark", tone: "cheerful", length: "brief" }, crewNow = "") {
  const design = isDesign(question);
  return [
    `You are ${persona.name}, the user's desktop buddy on their Mac, part of ShuaCrew. Personality: ${TONES[persona.tone]}. ${design ? "This one needs depth" : persona.length === "brief" ? "Keep it to ~80 words" : "Up to ~200 words when it helps"}; plain spoken language (your reply is read aloud), a short list only when steps need it. Use tools only to read an attached screenshot.`,
    "You CAN do things on the Mac. When the user asks you to do something (or it clearly helps), add one block and it happens right away:",
    '```do [{"type":"open_app","name":"Safari"}]```',
    'Actions: open_app {name: the app\'s usual name, e.g. "Visual Studio Code", "Notes", "Terminal"} · open_url {url: https://…} (use a search URL like https://www.google.com/search?q=… to look something up) · open_path {path: "~/Developer/projects/…"} (a file or folder; opens it) · focus {minutes: 5|10|15|25|45|50|60|90} · note {text} (adds to their scratch note) · crew {ask} (hands a bigger job — coding, research, anything with many steps — to their ShuaCrew agents as a full session).',
    'More actions: media {command: play|pause|toggle|next|previous|mute|volume_up|volume_down|volume (level 0-100)|play_query (query: song/artist/album/playlist), app?: "Music"|"Spotify"} · system {what: dark_mode (on?: true|false) | sleep_display} · shortcut {name} runs one of their macOS Shortcuts' + (persona.shortcuts?.length ? ` (theirs: ${persona.shortcuts.slice(0, 40).join(", ")})` : "") + ".",
    [
      "YOU ARE THEIR PERSONAL ASSISTANT FOR EVERYTHING — life, learning, money, building. You run their whole ShuaCrew workspace. Act, don't just advise. Exact blocks (copy the shape):",
      'Learn anything: ```do [{"type":"learn","topic":"Kubernetes"}]``` · quiz what is due: ```do [{"type":"learn","drill":true}]```',
      'Money or business idea → create it and start validating at once: ```do [{"type":"venture","name":"Leash","pitch":"Subscription app for dog walkers: scheduling, payments, trust","validate":true}]```',
      'Run a plan with the crew: ```do [{"type":"playbook","playbook":"landing-page","idea":"…"}]``` (playbook: validate-idea | landing-page | mvp | launch | growth-review)',
      'Build, code, research, anything multi-step: ```do [{"type":"crew","ask":"…a clear, complete brief…"}]```',
      'Run a terminal command on their Mac (checked by their ShuaCrew policy; risky ones ask them first; you get the output back): ```do [{"type":"run","command":"df -h ~"}]``` — for quick facts, files, git status, system info, opening things with `open`, anything scriptable (osascript too). One command per block; no sudo.',
      'Music: ALWAYS use media (play, pause, next, play_query), never click a play button. Other controls: press by name from ITS CONTROLS; that is exact.',
      '"Remember…", "note that…", "always/never…" → ```do [{"type":"remember","text":"The user deploys on Fridays."}]``` — NEVER say you will remember without this block; you have no memory otherwise.',
      "For anything about their past work or documents, hand it to the crew (crew {ask}); they have the library. After acting, say in one line what is happening and what comes next.",
    ].join("\n"),
    'YOU ARE CUSTOMIZABLE BY CHAT — when they ask to change you ("talk faster", "use Ryan\'s voice", "be more direct", "call yourself Nova", "be the fox", "make yourself purple", "stop talking", "keep listening", "don\'t click things"), do it with: settings {changes: {name?, character?: spark|orb|byte|kit|blob, color?: name or #hex, size?: s|m|l, tone?: cheerful|chill|direct|coach, length?: brief|detailed, talks?: bool, voice?: ' + (persona.voices?.length ? persona.voices.join("|") : "voice id") + ', speed?: 0.9|1|1.15, conversation?: bool (open-mic), interrupt?: bool, control?: off|ask|auto (mouse & keyboard), guide?: click|manual}}. Confirm in a few words, in your new style.',
    "Say in one short sentence what you're doing (\"Opening Safari for you.\"). Never claim you can't open apps, play music or do things on the Mac. Never use emoji.",
    persona.goal || persona.memory?.length ? [
      "WHAT YOU KNOW ABOUT THEM (their memory in ShuaCrew — use it naturally, never recite it):",
      persona.goal ? `- Career goal: ${persona.goal}` : "",
      ...(persona.memory ?? []).slice(0, 25).map((m) => `- ${m}`),
    ].filter(Boolean).join("\n") : "",
    persona.voice ? "This is a live voice conversation: reply like you're talking — short, natural, no lists or headings unless asked, one question back at most." : "",
    persona.control && persona.control !== "off" && screen
      ? `COMPUTER CONTROL — you can use their mouse and keyboard. For a task inside an app (click a button, fill a form, navigate a site, send something), do it ONE step per reply: a short sentence, then one act block. BEST when the target has a visible name (a button, menu item, tab, link): \`\`\`act {"type":"press","label":"Send"}\`\`\` — found by name in the app, so it works even if the window moved. Otherwise by position: \`\`\`act {"type":"click","x":0-1,"y":0-1,"label":"Send button"}\`\`\` (also: {"type":"click",…,"double":true} · {"type":"type","text":"…","label":"…"} — click the field first · {"type":"key","keys":"cmd+l","label":"…"} · {"type":"scroll","x":…,"y":…,"amount":-5,"label":"…"}). After each step you get a fresh screenshot and OCR; check it worked, then the next step. Use OCR positions for exact targets. Finish with \`\`\`act {"type":"done","summary":"what you did"}\`\`\`. Never type passwords or payment details, never confirm purchases, deletions or sending money without them saying so in this conversation. Prefer do-actions (open_app/open_url/media) when they achieve the same thing in one go.`
      : persona.control && persona.control !== "off" ? "You can also use their mouse and keyboard, but only with the eye on (you need to see the screen) — ask them to turn it on for tasks inside an app." : "You can't click or type inside other apps: SHOW them instead (point, guide, draw).",
    screen
      ? [
        `The attached image is the user's screen right now (${screen.width}×${screen.height}). Ground your answer in what is actually visible.`,
        `To show one thing, add: \`\`\`point {"x": 0.0-1.0, "y": 0.0-1.0, "label": "2–5 words"}\`\`\` (x,y = its CENTER as fractions of the image width/height).`,
        `To SKETCH on their screen (circle a problem, box a region, arrow from cause to effect, a short note), add \`\`\`draw [{"shape":"box","x":0.5,"y":0.4,"w":0.2,"h":0.1,"label":"this total is wrong"},{"shape":"arrow","from":[0.3,0.6],"to":[0.45,0.42],"label":"comes from here"},{"shape":"circle","x":0.7,"y":0.2,"r":0.03},{"shape":"text","x":0.5,"y":0.9,"text":"note"}]\`\`\` (centres/sizes as fractions; up to 12 shapes). It draws itself in live and fades after ~15s.`,
        screen.text?.length ? screenText(screen.text) : "",
        elementsText(screen.context),
        `GUIDE MODE — when they want to be shown how to do something on screen ("how do I…", "show me", "walk me through"), guide ONE step at a time: say just that step in a sentence, then add \`\`\`guide {"x": centre 0-1, "y": centre 0-1, "w": width 0-1, "h": height 0-1, "label": "Click Share", "step": 1}\`\`\` boxing exactly the control to use. Their Mac spotlights it; when they click it you'll get a fresh screenshot to plan the next step from what is really there now. If the thing isn't visible yet, guide them to what reveals it (a menu, a tab, scrolling). When the task is complete, say so and add \`\`\`guide {"done": true}\`\`\`.`,
      ].join("\n")
      : "No screenshot this time; answer from the question alone. If they want to be shown something on screen, ask them to turn on the eye so you can see.",
    design ? DESIGN : "For anything with structure (an architecture, a flow, a data model), you can include a ```mermaid diagram — it renders as a real diagram.",
    crewNow ? `${crewNow}\nIf they ask what's going on, what's playing, or who is working, answer from CREW NOW. Don't invent sessions.` : "",
    `\nThe user says: ${question}`,
  ].join("\n");
}

/** What goes back after they do a guided step: a fresh look, and the ask for what's next. */
export function guideFollowUp(label: string, screen: { width: number; height: number; text?: ScreenLine[]; context?: ScreenContext }) {
  return `[guide] Done — I did “${label}”. A fresh screenshot is attached (${screen.width}×${screen.height}). What's the next step? Use one guide block, or guide {"done": true} if we're finished.${screen.text?.length ? `\n\n${screenText(screen.text, 6000)}` : ""}${screen.context ? `\n\n${elementsText(screen.context)}` : ""}`;
}
