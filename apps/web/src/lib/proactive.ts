/**
 * Spark speaking first, Jarvis-style: a heads-up before a meeting, a reminder the moment it's due, and a short
 * "welcome back" when you return to your Mac. Pure decisions here (what's worth saying, and when); Spark delivers
 * them — out loud, or as a quiet bubble while you're in a meeting.
 */

/** What the Mac app reports: the next day of events and timed reminders (only from calendars you've allowed). */
export interface Agenda {
  events: Array<{ id: string; title: string; start: number; end: number; allDay: boolean; location?: string }>;
  reminders: Array<{ id: string; title: string; due: number; hasTime: boolean }>;
}

export interface Announcement { key: string; kind: "event" | "reminder"; text: string }

/** A reminder counts as "just due" for this long; a Mac that was asleep through it doesn't read out old ones. */
const DUE_WINDOW = 5 * 60_000;

/** What's worth saying right now that hasn't been said: events starting within `headsUpMin`, reminders just due. */
export function announcements(agenda: Agenda, now: number, said: ReadonlySet<string>, headsUpMin = 10): Announcement[] {
  const out: Announcement[] = [];
  for (const e of agenda.events) {
    if (e.allDay) continue;
    const ahead = e.start - now, key = `ev:${e.id}:${e.start}`;
    if (ahead <= 0 || ahead > headsUpMin * 60_000 || said.has(key)) continue;
    const mins = Math.max(1, Math.round(ahead / 60_000));
    out.push({ key, kind: "event", text: `Heads up: ${e.title} starts in ${mins} minute${mins === 1 ? "" : "s"}${e.location ? `, at ${e.location}` : ""}.` });
  }
  for (const r of agenda.reminders) {
    if (!r.hasTime) continue;
    const late = now - r.due, key = `rem:${r.id}:${r.due}`;
    if (late < 0 || late > DUE_WINDOW || said.has(key)) continue;
    out.push({ key, kind: "reminder", text: `Reminder: ${r.title}.` });
  }
  return out;
}

/** In a meeting right now (a timed event under way): Spark shows things quietly instead of talking over it. */
export function inMeeting(agenda: Agenda | null, now: number): boolean {
  return !!agenda?.events.some((e) => !e.allDay && e.start <= now && now < e.end);
}

/** The next timed event that hasn't started, for "next up". */
export function nextEvent(agenda: Agenda | null, now: number) {
  return agenda?.events.filter((e) => !e.allDay && e.start > now).sort((a, b) => a.start - b.start)[0];
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * A short catch-up when you come back after a while (15+ minutes): what the crew finished, what's waiting on you,
 * what's overdue and what's next. Nothing worth saying → null (no "welcome back" for its own sake). `finished` holds
 * whole phrases: "Eli finished the landing page".
 */
export function welcomeBack(o: { awayMs: number; now: number; finished: string[]; approvals: number; agenda: Agenda | null }): string | null {
  if (o.awayMs < 15 * 60_000) return null;
  const parts: string[] = [];
  if (o.finished.length === 1) parts.push(o.finished[0]!);
  else if (o.finished.length > 1) parts.push(`the crew finished ${o.finished.length} things`);
  if (o.approvals) parts.push(`${o.approvals} approval${o.approvals === 1 ? " is" : "s are"} waiting on you`);
  const overdue = o.agenda?.reminders.filter((r) => r.due <= o.now).length ?? 0;
  if (overdue) parts.push(`${overdue} reminder${overdue === 1 ? " is" : "s are"} due`);
  const next = nextEvent(o.agenda, o.now);
  if (next && next.start - o.now < 3 * 3_600_000) parts.push(`next up is ${next.title} at ${clock(next.start)}`);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
  return `Welcome back. ${list[0]!.toUpperCase()}${list.slice(1)}.`;
}

/** Time for the morning brief: 5 AM to noon, once a day (the caller keeps the day it last ran). */
export function morningDue(now: number, lastDay: string | null): boolean {
  const d = new Date(now), h = d.getHours();
  return h >= 5 && h < 12 && lastDay !== `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export const briefDay = (now: number) => { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/**
 * The morning brief, spoken: built only from what's real (no model), so it's instant. Short sentences, the most
 * useful first; anything empty is left out rather than said as "nothing".
 */
export function morningBriefLine(o: {
  now: number; name?: string; weather?: { temp: number; label: string; hi?: number; lo?: number; rainSoon?: boolean } | null;
  agenda: Agenda | null; finished: string[]; approvals: number; due: number; goal?: string;
}): string {
  const s: string[] = [];
  s.push(`Good morning${o.name ? `, ${o.name}` : ""}.`);
  if (o.weather) s.push(`It's ${Math.round(o.weather.temp)} degrees and ${o.weather.label.toLowerCase()}${o.weather.hi !== undefined ? `, up to ${Math.round(o.weather.hi)}` : ""}${o.weather.rainSoon ? ", with rain on the way" : ""}.`);
  const day0 = new Date(o.now); day0.setHours(23, 59, 59, 999);
  const meetings = (o.agenda?.events ?? []).filter((e) => !e.allDay && e.end > o.now && e.start <= day0.getTime()).sort((a, b) => a.start - b.start);
  if (meetings.length === 1) s.push(`One meeting today: ${meetings[0]!.title} at ${clock(meetings[0]!.start)}.`);
  else if (meetings.length > 1) s.push(`${meetings.length} meetings today, starting with ${meetings[0]!.title} at ${clock(meetings[0]!.start)}.`);
  else if (o.agenda) s.push("Your calendar's clear.");
  if (o.finished.length === 1) s.push(`Overnight, ${o.finished[0]}.`);
  else if (o.finished.length > 1) s.push(`Overnight the crew finished ${o.finished.length} things.`);
  if (o.approvals) s.push(`${o.approvals} decision${o.approvals === 1 ? " is" : "s are"} waiting on you.`);
  if (o.due) s.push(`You have ${o.due} card${o.due === 1 ? "" : "s"} to review${o.goal ? ` toward ${o.goal}` : ""}, ${o.due * 0.4 < 1.5 ? "about a minute" : `about ${Math.round(o.due * 0.4)} minutes`}.`);
  return s.join(" ");
}
