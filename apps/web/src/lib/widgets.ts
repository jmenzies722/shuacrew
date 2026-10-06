import { useSyncExternalStore } from "react";

/** Widgets: small live views of real things (your Mac, your crew, your day) you can place in the top bar and in Spark. */
export const WIDGETS = ["playing", "weather", "focus", "crew", "clock", "spend", "system", "learning", "note", "countdown"] as const;
export type WidgetId = (typeof WIDGETS)[number];
export type Placement = "topbar" | "spark" | "notch";

export const WIDGET_INFO: Record<WidgetId, { name: string; blurb: string }> = {
  playing: { name: "Radio", blurb: "ShuaCrew Radio: what's on, play, pause and skip, and a quick station switch." },
  weather: { name: "Weather", blurb: "Now, today's high and low, the next hours." },
  focus: { name: "Focus", blurb: "5–90 minute blocks; a notification and a chime when done. Shared by the app and Spark." },
  crew: { name: "Crew", blurb: "Sessions working right now and decisions waiting on you — answer them in place." },
  clock: { name: "Clocks", blurb: "Your time plus up to four places you work with." },
  spend: { name: "Today", blurb: "Tokens, cost and sessions so far today." },
  system: { name: "This Mac", blurb: "CPU load, memory, disk and battery, read locally." },
  learning: { name: "Learning", blurb: "Cards due and your practice streak." },
  note: { name: "Scratch note", blurb: "A quick note that follows you between the app and Spark; send it to the crew." },
  countdown: { name: "Countdown", blurb: "Days until something that matters: a launch, an interview, a trip." },
};

export interface WidgetPrefs {
  version: 1 | 2 | 3;
  /** Display order, both places. */
  order: WidgetId[];
  topbar: WidgetId[];
  spark: WidgetId[];
  /** Live activities in the MacBook notch island. */
  notch: WidgetId[];
  /** IANA time zones for the Clocks widget. */
  zones: string[];
  countdown: { label: string; date: string } | null;
}

export const DEFAULT_WIDGETS: WidgetPrefs = {
  version: 3, order: [...WIDGETS], topbar: ["playing", "crew", "weather", "focus"], spark: ["playing", "crew", "focus", "weather", "spend", "note"], notch: ["playing", "crew", "focus", "weather", "system", "countdown"], zones: [], countdown: null,
};

const isId = (v: unknown): v is WidgetId => typeof v === "string" && (WIDGETS as readonly string[]).includes(v);
const validZone = (z: string) => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; } catch { return false; } };

/** Anything stored (older, hand-edited, from another version) becomes a valid set of preferences. */
export function parseWidgets(value: unknown): WidgetPrefs {
  if (!value || typeof value !== "object") return DEFAULT_WIDGETS;
  const v = value as Partial<Record<keyof WidgetPrefs, unknown>>;
  const list = (x: unknown, fallback: WidgetId[]) => (Array.isArray(x) ? [...new Set(x.filter(isId))] : fallback);
  const order = list(v.order, DEFAULT_WIDGETS.order);
  // Widgets added in a later version join the end of your order instead of disappearing.
  for (const id of WIDGETS) if (!order.includes(id)) order.push(id);
  const zones = Array.isArray(v.zones) ? [...new Set(v.zones.filter((z): z is string => typeof z === "string" && validZone(z)))].slice(0, 4) : [];
  const c = v.countdown as { label?: unknown; date?: unknown } | null | undefined;
  const countdown = c && typeof c.label === "string" && typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? { label: c.label.trim().slice(0, 40) || "Countdown", date: c.date } : null;
  let topbar = list(v.topbar, DEFAULT_WIDGETS.topbar);
  let spark = list(v.spark, DEFAULT_WIDGETS.spark);
  const notch = list(v.notch, DEFAULT_WIDGETS.notch);
  // First time Now Playing exists: put it on. After a v2 save, turning it off stays off.
  const knewPlaying = Array.isArray(v.order) && v.order.includes("playing");
  if (v.version !== 2 && v.version !== 3 && !knewPlaying && Array.isArray(v.topbar) && !topbar.includes("playing")) topbar = ["playing", ...topbar];
  if (v.version !== 2 && v.version !== 3 && !knewPlaying && Array.isArray(v.spark) && !spark.includes("playing")) spark = ["playing", ...spark];
  return { version: 3, order, topbar, spark, notch, zones, countdown };
}

/** The widgets shown in one place, in your order. */
/** Widgets that no longer exist as a surface (the lofi radio moved out; music lives in Studio). Kept in saved
 * preferences so nothing else shifts, but never shown or offered. */
export const RETIRED: ReadonlySet<WidgetId> = new Set<WidgetId>(["playing"]);
export function placed(prefs: WidgetPrefs, where: Placement): WidgetId[] {
  const on = new Set(prefs[where]);
  return prefs.order.filter((id) => on.has(id) && !RETIRED.has(id));
}

export function moveWidget(order: WidgetId[], id: WidgetId, step: -1 | 1): WidgetId[] {
  const i = order.indexOf(id), j = i + step;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Whole days from today until a YYYY-MM-DD date, in local time (0 = today, negative = past). */
export function daysUntil(date: string, now = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y!, (m ?? 1) - 1, d ?? 1).getTime(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** Consecutive days with at least one review, ending today (or yesterday, if today hasn't started yet). */
export function streak(days: Array<{ day: string; reviews: number }>): number {
  const list = [...days].sort((a, b) => a.day.localeCompare(b.day));
  let i = list.length - 1;
  if (i >= 0 && list[i]!.reviews === 0) i--;
  let n = 0;
  for (; i >= 0 && list[i]!.reviews > 0; i--) n++;
  return n;
}

// One store for every view. The app window and Spark's desktop panel share this origin's storage,
// so a change in either reaches the other through the `storage` event.
const KEY = "shuacrew.widgets";
const listeners = new Set<() => void>();
const load = () => { try { return parseWidgets(JSON.parse(localStorage.getItem(KEY) ?? "null")); } catch { return DEFAULT_WIDGETS; } };
let current = load();
export function getWidgets() { return current; }
export function saveWidgets(patch: Partial<WidgetPrefs>) {
  current = parseWidgets({ ...current, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export function toggleWidget(id: WidgetId, where: Placement, on: boolean) {
  const list = current[where].filter((x) => x !== id);
  saveWidgets({ [where]: on ? [...list, id] : list });
}
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { current = load(); listeners.forEach((l) => l()); } });
export function useWidgets() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current); }

/** The scratch note: plain text, shared the same way. */
const NOTE = "shuacrew.widgets.note";
const noteListeners = new Set<() => void>();
let note = (() => { try { return localStorage.getItem(NOTE) ?? ""; } catch { return ""; } })();
export function saveNote(text: string) { note = text.slice(0, 4000); try { localStorage.setItem(NOTE, note); } catch { /* ignore */ } noteListeners.forEach((l) => l()); }
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === NOTE) { note = e.newValue ?? ""; noteListeners.forEach((l) => l()); } });
export function useNote() { return useSyncExternalStore((l) => { noteListeners.add(l); return () => { noteListeners.delete(l); }; }, () => note, () => note); }
