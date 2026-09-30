/**
 * Timers and alarms, like Siri's: any length, several at once, named ("pasta"), alarms at a clock time, pause, cancel,
 * "how long's left". Kept in this Mac's storage so every Spark surface sees the same ones (and a reload keeps them);
 * the desktop Spark rings them — chime, spoken, a Mac notification — and the notch counts the nearest one down.
 */
import { useSyncExternalStore } from "react";

export interface Timer { id: string; label: string; kind: "timer" | "alarm"; endsAt: number; durationMs: number; paused?: number }

const KEY = "shuacrew.timers";
const MAX = 12 * 3_600_000; // 12 hours: longer is an alarm or a reminder

export function remaining(t: Timer, now: number): number { return t.paused ?? Math.max(0, t.endsAt - now); }

/** "4:05", "1:02:30", or for a long wait "2 h 5 min". */
export function formatLeft(ms: number): string {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** A spoken length: "7 minutes", "1 hour and 30 minutes", "45 seconds". */
export function spokenLength(ms: number): string {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const part = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? "" : "s"}` : "");
  return [part(h, "hour"), part(m, "minute"), h ? "" : part(sec, "second")].filter(Boolean).join(" and ") || "0 seconds";
}

/** Which timers a name means: "pasta" → the pasta timer; nothing named → all of them (for "cancel the timer"). */
export function matching(timers: Timer[], label?: string): Timer[] {
  if (!label?.trim()) return timers;
  const want = label.toLowerCase().replace(/\b(the|my|timer|alarm)\b/g, "").trim();
  return want ? timers.filter((t) => t.label.toLowerCase().includes(want)) : timers;
}

export function newTimer(seconds: number, label: string, now = Date.now()): Timer | null {
  const ms = Math.round(seconds * 1000);
  if (!(ms >= 1000 && ms <= MAX)) return null;
  return { id: Math.random().toString(36).slice(2, 10), label: label.trim().slice(0, 40), kind: "timer", endsAt: now + ms, durationMs: ms };
}

/** An alarm at a clock time today — or tomorrow, if that time has already passed. */
export function newAlarm(at: Date, label: string, now = Date.now()): Timer | null {
  let when = at.getTime();
  if (!Number.isFinite(when)) return null;
  while (when <= now) when += 86_400_000;
  if (when - now > 24 * 3_600_000) return null;
  return { id: Math.random().toString(36).slice(2, 10), label: label.trim().slice(0, 40), kind: "alarm", endsAt: when, durationMs: when - now };
}

/** The ones that just rang (and so leave the list). */
export function due(timers: Timer[], now: number): { rang: Timer[]; left: Timer[] } {
  const rang = timers.filter((t) => t.paused === undefined && t.endsAt <= now);
  return { rang, left: timers.filter((t) => !rang.includes(t)) };
}

/** What Spark says when one rings. */
export function ringLine(t: Timer): string {
  if (t.kind === "alarm") return t.label ? `It's time: ${t.label}.` : "Your alarm is going off.";
  return t.label ? `Your ${t.label} timer is done.` : `Your ${spokenLength(t.durationMs)} timer is done.`;
}

/** "How long's left": the timers, soonest first, in a sentence. */
export function leftLine(timers: Timer[], now: number): string {
  if (!timers.length) return "You don't have any timers running.";
  return [...timers].sort((a, b) => remaining(a, now) - remaining(b, now)).slice(0, 3)
    .map((t) => `${t.label ? `${t.label}: ` : t.kind === "alarm" ? "Alarm: " : ""}${t.kind === "alarm" ? new Date(t.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : `${spokenLength(remaining(t, now))} left`}${t.paused !== undefined ? " (paused)" : ""}`).join(". ") + ".";
}

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90 };
/** A spoken length in seconds: "7 minutes", "an hour and a half", "1 hour 30 min", "90 seconds", "half an hour". */
export function parseDuration(text: string): number | null {
  // "two and a half minutes" → "2.5 minutes" (the half sits between the number and its unit).
  const t = text.toLowerCase().replace(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+and a half\s+(hours?|hrs?|minutes?|mins?)/g, (_, n: string, u: string) => `${(WORDS[n] ?? Number(n)) + 0.5} ${u}`);
  if (/\bhalf an? hour\b/.test(t)) return 1800;
  let total = 0, found = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five|forty|fifty|sixty|ninety)\s*(hours?|hrs?|h\b|minutes?|mins?|m\b|seconds?|secs?|s\b)/g)) {
    const n = WORDS[m[1]!] ?? Number(m[1]); const u = m[2]!;
    total += n * (u.startsWith("h") ? 3600 : u.startsWith("m") ? 60 : 1); found = true;
  }
  if (found && /\band a half\b/.test(t)) total += /hour|hr/.test(t) ? 1800 : /min/.test(t) ? 30 : 0;
  return found && total > 0 ? Math.round(total) : null;
}

// ——— the shared store ———
const listeners = new Set<() => void>();
function load(): Timer[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Timer[]; return Array.isArray(v) ? v.filter((t) => t && typeof t.endsAt === "number" && typeof t.id === "string") : []; } catch { return []; }
}
let current: Timer[] = typeof localStorage === "undefined" ? [] : load();
export function getTimers(): Timer[] { return current; }
export function setTimers(next: Timer[]) {
  current = next; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { current = load(); listeners.forEach((l) => l()); } });
export function useTimers() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current); }

/** Everything Spark (or an instant command) can do with timers, as one call that returns what to say. */
export function timerOp(op: { op: "start" | "alarm" | "cancel" | "pause" | "resume" | "list"; seconds?: number; at?: string; label?: string }, now = Date.now()): { ok: boolean; message: string } {
  const all = getTimers(), label = op.label ?? "";
  switch (op.op) {
    case "start": {
      const t = newTimer(op.seconds ?? 0, label, now);
      if (!t) return { ok: false, message: "Timers can run from a second up to 12 hours." };
      setTimers([...all, t]); return { ok: true, message: `${label ? `${label[0]!.toUpperCase()}${label.slice(1)} timer` : "Timer"} set for ${spokenLength(t.durationMs)}` };
    }
    case "alarm": {
      const at = op.at ? new Date(op.at.length <= 5 ? `${new Date(now).toDateString()} ${op.at}` : op.at) : null;
      const t = at ? newAlarm(at, label, now) : null;
      if (!t) return { ok: false, message: "I couldn't tell what time to set the alarm for." };
      setTimers([...all, t]); return { ok: true, message: `Alarm set for ${new Date(t.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${new Date(t.endsAt).getDate() !== new Date(now).getDate() ? " tomorrow" : ""}` };
    }
    case "cancel": {
      const hit = matching(all, label);
      if (!hit.length) return { ok: false, message: label ? `There's no ${label} timer.` : "You don't have any timers running." };
      setTimers(all.filter((t) => !hit.includes(t)));
      const one = hit[0]!;
      return { ok: true, message: hit.length === 1 ? `Cancelled the ${one.label ? `${one.label} ${one.kind}` : one.kind === "alarm" ? "alarm" : `${spokenLength(one.durationMs)} timer`}` : `Cancelled ${hit.length} timers` };
    }
    case "pause": case "resume": {
      const hit = matching(all, label).filter((t) => (op.op === "pause") === (t.paused === undefined) && t.kind === "timer");
      if (!hit.length) return { ok: false, message: op.op === "pause" ? "There's no running timer to pause." : "There's no paused timer." };
      setTimers(all.map((t) => (!hit.includes(t) ? t : op.op === "pause" ? { ...t, paused: remaining(t, now) } : (({ paused, ...rest }) => ({ ...rest, endsAt: now + (paused ?? 0) }))(t))));
      return { ok: true, message: `${op.op === "pause" ? "Paused" : "Resumed"} ${hit.length === 1 ? "the timer" : `${hit.length} timers`}` };
    }
    case "list": return { ok: true, message: leftLine(all, now) };
  }
}
