import { describe, expect, it } from "vitest";
import { nextGap, skyAt, todayMoments } from "./today";

const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m).getTime();
const base = { now: at(14), runs: [], events: [], reminders: [], due: 0 };

describe("Today timeline", () => {
  it("lays the crew, meetings and reminders out in time order, with a tone for each", () => {
    const m = todayMoments({ ...base,
      runs: [{ id: "r1", title: "Pricing research", status: "done", createdAt: at(9), updatedAt: at(9, 40) },
        { id: "r2", title: "Landing page", status: "running", createdAt: at(13, 30), updatedAt: at(13, 55), ticker: "Writing the hero" },
        { id: "b", title: "Shua · hi", status: "done", createdAt: at(10), updatedAt: at(10), labels: ["buddy"] }],
      events: [{ title: "Standup", start: at(10), end: at(10, 15), allDay: false }, { title: "Design review", start: at(16), end: at(17), allDay: false }, { title: "Holiday", start: at(0), end: at(23, 59), allDay: true }],
      reminders: [{ id: "x", title: "Call bank", due: at(15), hasTime: true }] });
    expect(m.map((x) => [x.title, x.tone])).toEqual([["Pricing research", "done"], ["Standup", "past"], ["Landing page", "live"], ["Call bank", "next"], ["Design review", "next"]]);
    expect(m.find((x) => x.title === "Landing page")?.detail).toBe("Writing the hero");
  });
  it("skips yesterday and tomorrow", () => {
    expect(todayMoments({ ...base, runs: [{ id: "old", title: "Old", status: "done", createdAt: at(14) - 86_400_000, updatedAt: at(14) - 86_400_000 }] })).toEqual([]);
  });
  it("slots due cards into the next real gap", () => {
    const events = [{ title: "A", start: at(14, 5), end: at(14, 30), allDay: false }, { title: "B", start: at(14, 35), end: at(15), allDay: false }];
    expect(nextGap(at(14), events)).toBe(at(15)); // 14:00–14:05 and 14:30–14:35 are too short
    const learn = todayMoments({ ...base, events, due: 12 }).find((x) => x.kind === "learn");
    expect(learn).toMatchObject({ at: at(15), title: "Review 12 cards", go: "/learn" });
    expect(nextGap(at(22, 50), [])).toBeNull(); // not at midnight
  });
  it("follows the sun", () => {
    expect(skyAt(at(6))).toEqual({ progress: 0, phase: "dawn" });
    expect(skyAt(at(13, 30)).phase).toBe("day");
    expect(skyAt(at(18)).phase).toBe("golden");
    expect(skyAt(at(22)).phase).toBe("night");
  });
});
