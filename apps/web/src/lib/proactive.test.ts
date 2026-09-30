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
