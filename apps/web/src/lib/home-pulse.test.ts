import { expect, it } from "vitest";
import { firstMeasured, lastDay, msLabel, nextAutopilot, whenLabel } from "./home-pulse";

const now = new Date(2026, 10, 12, 14, 0).getTime();
const h = 3_600_000;

it("finds the soonest run of any active schedule, skipping paused ones and past times", () => {
  const schedules = [
    { id: "a", name: "Nightly build", next: [now - h, now + 12 * h] },
    { id: "b", name: "Standup", next: [now + 18 * h] },
    { id: "c", name: "Paused soon", paused: true, next: [now + h] },
  ];
  expect(nextAutopilot(schedules, now)).toEqual({ name: "Nightly build", at: now + 12 * h });
  expect(nextAutopilot([], now)).toBeNull();
  expect(nextAutopilot([{ id: "x", name: "x", next: [] }], now)).toBeNull();
});

it("counts the last day's outcomes once per schedule and ignores older or unknown ones", () => {
  expect(lastDay([
    { id: "a", name: "a", next: [], lastFired: now - 2 * h, lastOk: true },
    { id: "b", name: "b", next: [], lastFired: now - 5 * h, lastOk: false },
    { id: "c", name: "c", next: [], lastFired: now - 30 * h, lastOk: false },
    { id: "d", name: "d", next: [], lastFired: now - h },
    { id: "e", name: "e", next: [] },
  ], now)).toEqual({ ok: 1, failed: 1 });
});

it("says the day only when the run isn't today", () => {
  expect(whenLabel(now + 2 * h, now)).not.toMatch(/Tomorrow|Sat/);
  expect(whenLabel(now + 12 * h, now)).toMatch(/^Tomorrow /);
  expect(whenLabel(now + 48 * h, now)).toMatch(/^Sat /);
});

it("reads a wait the way you'd say it", () => {
  expect(msLabel(480)).toBe("480 ms");
  expect(msLabel(2712)).toBe("2.7 s");
  expect(msLabel(12_400)).toBe("12 s");
});

it("uses the most recent window that has data, and nothing when none does", () => {
  expect(firstMeasured([[7, { count: 0 }], [30, { count: 0 }], [90, { count: 164 }]])).toEqual([90, { count: 164 }]);
  expect(firstMeasured([[7, { count: 3 }], [30, { count: 9 }]])).toEqual([7, { count: 3 }]);
  expect(firstMeasured([[7, null], [30, { total: 0 }]])).toBeNull();
});
