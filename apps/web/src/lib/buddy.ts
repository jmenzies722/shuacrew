/** The desktop buddy's contract with the model: short answers, a place to point on screen, and things to do on the Mac. */
export interface Point { x: number; y: number; label: string }

/** One step of a guided walkthrough: where to look (a box, as fractions of the screenshot) and what to do there. */
export interface GuideStep { x: number; y: number; w: number; h: number; label: string; step: number; done: false }
export type Guide = GuideStep | { done: true };

/** What Spark may do on your Mac. The Mac app checks every one again before doing it. */
export type Action =
  | { type: "open_app"; name: string }
  | { type: "open_url"; url: string }
  | { type: "open_path"; path: string }
  | { type: "focus"; minutes: number }
  | { type: "crew"; ask: string }
  | { type: "note"; text: string };

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
  }
}

/** What the bubble shows: the reply without machine-readable blocks. */
export function speakable(text: string) { return text.replace(/```(point|do|guide)[\s\S]*?(```|$)/gi, "").trim(); }

/** Plain words for the voice: no markdown, no code, no link targets. */
export function spoken(text: string) {
  return speakable(text).replace(/```[\s\S]*?(```|$)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*(#+|[-*]|\d+\.)\s+/gm, "").replace(/[*_~>#]/g, "").replace(/\s+/g, " ").trim();
}

/** Real-time speech: the whole sentences that arrived since `from` in a streaming reply. Stops at any code block. */
export function nextSentences(text: string, from: number, final = false): { chunks: string[]; upto: number } {
  const fence = text.indexOf("```");
  const end = fence >= 0 ? fence : text.length;
  if (from >= end) return { chunks: [], upto: from };
  const tail = text.slice(from, end);
  let cut = 0;
  for (const m of tail.matchAll(/[.!?:](?=\s)|\n/g)) cut = m.index! + 1;
  if (final || fence >= 0) cut = tail.length;
  const chunks = tail.slice(0, cut).split(/(?<=[.!?:])\s+|\n+/).map(spoken).filter((s) => /\w/.test(s));
  return { chunks, upto: from + cut };
}

export interface Persona { name: string; tone: "cheerful" | "chill" | "direct" | "coach"; length: "brief" | "detailed" }
const TONES: Record<Persona["tone"], string> = {
  cheerful: "warm, upbeat and encouraging",
  chill: "relaxed and easygoing, a calm friend",
  direct: "straight to the point, no filler, no pleasantries",
  coach: "a patient teacher: explain the why briefly so they learn it for next time",
};

export function buddyPrompt(question: string, screen: { width: number; height: number } | null, persona: Persona = { name: "Spark", tone: "cheerful", length: "brief" }) {
  return [
    `You are ${persona.name}, the user's desktop buddy on their Mac, part of ShuaCrew. Personality: ${TONES[persona.tone]}. ${persona.length === "brief" ? "Keep it to ~80 words" : "Up to ~200 words when it helps"}; plain spoken language (your reply is read aloud), a short list only when steps need it. Do not use tools except to read the attached screenshot.`,
    "You CAN do things on the Mac. When the user asks you to do something (or it clearly helps), add one block and it happens right away:",
    '```do [{"type":"open_app","name":"Safari"}]```',
    'Actions: open_app {name: the app\'s usual name, e.g. "Visual Studio Code", "Notes", "Terminal"} · open_url {url: https://…} (use a search URL like https://www.google.com/search?q=… to look something up) · open_path {path: "~/Developer/projects/…"} (a file or folder; opens it) · focus {minutes: 5|10|15|25|45|50|60|90} · note {text} (adds to their scratch note) · crew {ask} (hands a bigger job — coding, research, anything with many steps — to their ShuaCrew agents as a full session).',
    "Say in one short sentence what you're doing (\"Opening Safari for you.\"). Never claim you can't open apps or sites. You can't click or type inside other apps yourself: SHOW them instead.",
    screen
      ? [
        `The attached image is the user's screen right now (${screen.width}×${screen.height}). Ground your answer in what is actually visible.`,
        `To show one thing, add: \`\`\`point {"x": 0.0-1.0, "y": 0.0-1.0, "label": "2–5 words"}\`\`\` (x,y = its CENTER as fractions of the image width/height).`,
        `GUIDE MODE — when they want to be shown how to do something on screen ("how do I…", "show me", "walk me through"), guide ONE step at a time: say just that step in a sentence, then add \`\`\`guide {"x": centre 0-1, "y": centre 0-1, "w": width 0-1, "h": height 0-1, "label": "Click Share", "step": 1}\`\`\` boxing exactly the control to use. Their Mac spotlights it; when they click it you'll get a fresh screenshot to plan the next step from what is really there now. If the thing isn't visible yet, guide them to what reveals it (a menu, a tab, scrolling). When the task is complete, say so and add \`\`\`guide {"done": true}\`\`\`.`,
      ].join("\n")
      : "No screenshot this time; answer from the question alone. If they want to be shown something on screen, ask them to turn on the eye so you can see.",
    `\nThe user says: ${question}`,
  ].join("\n");
}

/** What goes back after they do a guided step: a fresh look, and the ask for what's next. */
export function guideFollowUp(label: string, screen: { width: number; height: number }) {
  return `[guide] Done — I did “${label}”. A fresh screenshot is attached (${screen.width}×${screen.height}). What's the next step? Use one guide block, or guide {"done": true} if we're finished.`;
}
