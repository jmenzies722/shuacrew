import { localDay } from "./morning";

/** Exam countdowns and job follow-ups from Learn (the gateway's learnReminders), soonest first. */
export interface LearnReminder { id: string; kind: "exam" | "followup"; days: number; title: string; text: string }

const EXAM_DAYS = new Set([14, 7, 3, 2, 1, 0]);
/**
 * What the notch says now, once a day each and only in waking hours (9 am – 9 pm): an exam at two weeks, one week and
 * the last three days; a follow-up the day it's due, and each day it's overdue. At most two at a time.
 */
export function learnNudges(rs: LearnReminder[], said: ReadonlySet<string>, now: Date): Array<{ key: string; text: string }> {
  if (now.getHours() < 9 || now.getHours() >= 21) return [];
  const day = localDay(now);
  return rs.filter((r) => (r.kind === "exam" ? EXAM_DAYS.has(r.days) : r.days <= 0))
    .map((r) => ({ key: `learn:${r.id}:${day}`, text: r.text })).filter((n) => !said.has(n.key)).slice(0, 2);
}

/** The morning brief's share: exams within two weeks and follow-ups due today (or late), two at most. */
export const briefReminders = (rs: LearnReminder[]) => rs.filter((r) => (r.kind === "exam" ? r.days <= 14 : r.days <= 0)).slice(0, 2).map((r) => r.text);
