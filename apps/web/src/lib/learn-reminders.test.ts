import { expect, it } from "vitest";
import { briefReminders, learnNudges, type LearnReminder } from "./learn-reminders";

const r = (id: string, kind: LearnReminder["kind"], days: number): LearnReminder => ({ id, kind, days, title: id, text: `${id} in ${days}` });
const rs = [r("vercel", "followup", -2), r("anthropic", "followup", 0), r("stripe", "followup", 1), r("saa", "exam", 7), r("cka", "exam", 12)];

it("nudges once a day, in waking hours, at the moments that matter", () => {
  const noon = new Date(2026, 9, 7, 12), key = "2026-10-07";
  expect(learnNudges(rs, new Set(), noon).map((n) => n.key)).toEqual([`learn:vercel:${key}`, `learn:anthropic:${key}`]);
  expect(learnNudges(rs, new Set([`learn:vercel:${key}`, `learn:anthropic:${key}`]), noon).map((n) => n.text)).toEqual(["saa in 7"]); // 12 days: not a nudge day
  expect(learnNudges(rs, new Set(), new Date(2026, 9, 7, 7))).toEqual([]); // too early
  expect(learnNudges(rs, new Set(), new Date(2026, 9, 7, 22))).toEqual([]); // too late
});

it("the morning brief hears what's due and exams within two weeks", () => {
  expect(briefReminders(rs)).toEqual(["vercel in -2", "anthropic in 0"]);
  expect(briefReminders([r("saa", "exam", 7), r("far", "exam", 20)])).toEqual(["saa in 7"]);
});
