import { expect, it } from "vitest";
import { remainingFocusMs, parseFocusTimer, startFocus, pauseFocus, resumeFocus, formatFocusRemaining } from "./focus-timer";
it("rounds the complete countdown before splitting minutes and seconds", () => {
  expect(formatFocusRemaining(599999)).toBe("10:00");
  expect(formatFocusRemaining(599000)).toBe("9:59");
  expect(formatFocusRemaining(1)).toBe("0:01");
  expect(formatFocusRemaining(0)).toBe("Focus complete");
});
it("uses wall timestamps across sleep and relaunch with bounded durations", () => {
  expect(remainingFocusMs({ startedAt: 1000, durationMs: 1500000, pausedRemainingMs: null }, 1501000)).toBe(0);
  for (const minutes of [15, 25, 50] as const) expect(remainingFocusMs(startFocus(minutes, 1000), 1000)).toBe(minutes * 60000);
  expect(parseFocusTimer({ startedAt: Infinity, durationMs: -1 }, 1000)).toBeNull();
  expect(parseFocusTimer({ startedAt: 5000, durationMs: 900000, pausedRemainingMs: null }, 1000)).toBeNull();
});
it("pauses and resumes without counting paused time", () => {
  const paused = pauseFocus(startFocus(15, 1000), 61000);
  expect(remainingFocusMs(paused, 300000)).toBe(840000);
  expect(remainingFocusMs(resumeFocus(paused, 300000), 360000)).toBe(780000);
});
