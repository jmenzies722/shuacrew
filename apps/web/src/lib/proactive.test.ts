import { describe, expect, it } from "vitest";
import { announcements, inMeeting, welcomeBack, type Agenda } from "./proactive";

const now = Date.UTC(2026, 8, 30, 14, 0);
const min = 60_000;
const agenda: Agenda = {
  events: [
    { id: "standup", title: "Standup", start: now + 9 * min, end: now + 24 * min, allDay: false, location: "Zoom" },
    { id: "lunch", title: "Lunch with Sam", start: now + 90 * min, end: now + 150 * min, allDay: false },
    { id: "holiday", title: "Holiday", start: now - 60 * min, end: now + 20 * 60 * min, allDay: true },
  ],
  reminders: [
    { id: "stretch", title: "Stretch", due: now - 1 * min, hasTime: true },
    { id: "old", title: "Water plants", due: now - 3 * 60 * min, hasTime: true },
    { id: "someday", title: "Call mom", due: now + 60 * min, hasTime: true },
    { id: "dayonly", title: "Taxes", due: now - 1 * min, hasTime: false },
  ],
};

describe("Spark speaks first", () => {
  it("gives a heads-up before a meeting and says a reminder the moment it's due", () => {
    expect(announcements(agenda, now, new Set()).map((a) => a.text)).toEqual(["Heads up: Standup starts in 9 minutes, at Zoom.", "Reminder: Stretch."]);
  });
  it("never repeats itself, skips all-day events, and doesn't read out reminders you slept through", () => {
    const said = new Set(announcements(agenda, now, new Set()).map((a) => a.key));
    expect(announcements(agenda, now + 30_000, said)).toEqual([]);
  });
  it("says a moved meeting again (a new start is a new heads-up)", () => {
    const said = new Set(announcements(agenda, now, new Set()).map((a) => a.key));
    const moved = { ...agenda, events: [{ ...agenda.events[0]!, start: now + 5 * min }] };
    expect(announcements(moved, now, said).map((a) => a.text)).toEqual(["Heads up: Standup starts in 5 minutes, at Zoom."]);
  });
  it("knows when you're in a meeting (so it stays quiet)", () => {
    expect(inMeeting(agenda, now + 10 * min)).toBe(true);
    expect(inMeeting(agenda, now)).toBe(false); // the all-day holiday doesn't count
  });
});

describe("welcome back", () => {
  it("catches you up after a while away", () => {
    expect(welcomeBack({ awayMs: 40 * min, now, finished: ["Eli finished the landing page"], approvals: 1, agenda }))
      .toMatch(/^Welcome back\. Eli finished the landing page, 1 approval is waiting on you, 3 reminders are due, and next up is Standup at \d/);
    expect(welcomeBack({ awayMs: 40 * min, now, finished: ["a", "b"], approvals: 0, agenda: null })).toBe("Welcome back. The crew finished 2 things.");
  });
  it("stays quiet after a short break, or when there's nothing to say", () => {
    expect(welcomeBack({ awayMs: 5 * min, now, finished: ["x"], approvals: 1, agenda })).toBeNull();
    expect(welcomeBack({ awayMs: 60 * min, now, finished: [], approvals: 0, agenda: { events: [], reminders: [] } })).toBeNull();
  });
});

import { briefDay, morningBriefLine, morningDue } from "./proactive";
describe("morning brief", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();
  it("runs once a morning, 5 AM to noon", () => {
    expect(morningDue(at(7), null)).toBe(true);
    expect(morningDue(at(7), briefDay(at(6)))).toBe(false);
    expect(morningDue(at(4, 59), null)).toBe(false);
    expect(morningDue(at(12), null)).toBe(false);
  });
  it("says what's real, most useful first, and leaves out what's empty", () => {
    const line = morningBriefLine({ now: at(8), name: "Shua", weather: { temp: 51.4, label: "Clear", hi: 68 },
      agenda: { events: [{ id: "e1", title: "Standup", start: at(9, 30), end: at(9, 45), allDay: false }], reminders: [] }, finished: ["Rhea finished Pricing research"], approvals: 1, due: 12, goal: "DevOps Engineer" });
    expect(line).toBe("Good morning, Shua. It's 51 degrees and clear, up to 68. One meeting today: Standup at 9:30 AM. Overnight, Rhea finished Pricing research. 1 decision is waiting on you. You have 12 cards to review toward DevOps Engineer, about 5 minutes.");
    expect(morningBriefLine({ now: at(8), agenda: null, finished: [], approvals: 0, due: 0 })).toBe("Good morning.");
    expect(morningBriefLine({ now: at(8), agenda: null, finished: [], approvals: 0, due: 2 })).toBe("Good morning. You have 2 cards to review, about a minute.");
  });
});
