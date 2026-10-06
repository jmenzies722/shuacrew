/**
 * Today as a timeline: what already happened, a "now" line, and what's coming — from the crew, your calendar and
 * your reminders. Due review cards get slotted into the next real gap in your day. Pure, so it can be tested.
 */
export type MomentKind = "session" | "meeting" | "reminder" | "learn";
export type MomentTone = "done" | "live" | "wait" | "failed" | "next" | "past";
export interface Moment { id: string; at: number; end?: number; kind: MomentKind; tone: MomentTone; title: string; detail?: string; go?: string }

export interface TodayInput {
  now: number;
  runs: Array<{ id: string; title: string; status: string; createdAt: number; updatedAt: number; ticker?: string; labels?: string[] }>;
  events: Array<{ id?: string; title: string; start: number; end: number; allDay: boolean }>;
  reminders: Array<{ id: string; title: string; due: number; hasTime: boolean }>;
  due: number;
}

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const MIN = 60_000;
const SESSION_TONE: Record<string, MomentTone> = { done: "done", merged: "done", running: "live", planning: "live", queued: "live", awaiting_approval: "wait", paused: "wait", failed: "failed", cancelled: "past" };

/** The next stretch of at least `need` minutes with no meeting, starting no earlier than now (and before 11pm). */
export function nextGap(now: number, events: TodayInput["events"], need = 15): number | null {
  const busy = events.filter((e) => !e.allDay && e.end > now).sort((a, b) => a.start - b.start);
  let t = Math.ceil(now / (5 * MIN)) * 5 * MIN;
  for (const e of busy) {
    if (e.start - t >= need * MIN) break;
    t = Math.max(t, e.end);
  }
  const late = startOfDay(now) + 23 * 60 * MIN;
  return t + need * MIN <= late ? t : null;
}

export function todayMoments(i: TodayInput): Moment[] {
  const day0 = startOfDay(i.now), day1 = day0 + 24 * 60 * MIN;
  const out: Moment[] = [];
  for (const r of i.runs) {
    if (r.createdAt < day0 || r.createdAt >= day1 || r.labels?.some((l) => l === "buddy" || l === "learning")) continue;
    const tone = SESSION_TONE[r.status] ?? "past";
    out.push({ id: `s:${r.id}`, at: r.createdAt, end: tone === "live" ? undefined : r.updatedAt, kind: "session", tone, title: r.title,
      detail: tone === "live" ? (r.ticker || "Working") : tone === "wait" ? "Needs you" : tone === "done" ? "Finished" : tone === "failed" ? "Didn't finish" : "Stopped", go: `/sessions/${r.id}` });
  }
  for (const e of i.events) {
    if (e.allDay || e.end <= day0 || e.start >= day1) continue;
    const tone: MomentTone = e.end <= i.now ? "past" : e.start <= i.now ? "live" : "next";
    out.push({ id: `m:${e.id ?? e.start}:${e.title}`, at: e.start, end: e.end, kind: "meeting", tone, title: e.title });
  }
  for (const r of i.reminders) {
    if (r.due < day0 || r.due >= day1) continue;
    out.push({ id: `r:${r.id}`, at: r.hasTime ? r.due : day0 + 9 * 60 * MIN, kind: "reminder", tone: r.due < i.now && r.hasTime ? "wait" : "next", title: r.title, detail: r.hasTime ? undefined : "Today" });
  }
  if (i.due > 0) {
    const slot = nextGap(i.now, i.events);
    if (slot !== null) out.push({ id: "learn", at: slot, end: slot + Math.max(5, Math.round(i.due * 0.4)) * MIN, kind: "learn", tone: "next", title: `Review ${i.due} card${i.due === 1 ? "" : "s"}`, detail: "A free gap in your day", go: "/learn" });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Where the sun is, 0 (6am) → 1 (9pm), and what the sky looks like. */
export function skyAt(now: number): { progress: number; phase: "night" | "dawn" | "day" | "golden" | "dusk" } {
  const d = new Date(now), h = d.getHours() + d.getMinutes() / 60;
  const progress = Math.min(1, Math.max(0, (h - 6) / 15));
  const phase = h < 5.5 || h >= 21 ? "night" : h < 8 ? "dawn" : h < 17 ? "day" : h < 19.5 ? "golden" : "dusk";
  return { progress, phase };
}
