import { expect, it } from "vitest";
import type { HourBucket } from "@shuacrew/core/observability";
import { addLocalDays, busiest, lastHours, localDays, rhythm, startOfLocalDay, usualDay, versusUsual } from "./usage-math";

// Built with the local Date constructor, so these hold in any time zone the tests run in.
const now = new Date(2026, 9, 6, 15, 20).getTime(); // Tue 6 Oct, 3:20 pm local
const hourAt = (daysAgo: number, hour: number, byProvider: Record<string, number>): HourBucket => {
  const d = new Date(2026, 9, 6 - daysAgo, hour); const total = Object.values(byProvider).reduce((s, v) => s + v, 0);
  return { at: d.getTime(), inputTokens: total, outputTokens: 0, cacheTokens: 0, byProvider };
};
const hours = [hourAt(0, 14, { codex: 500, claude: 20 }), hourAt(0, 9, { codex: 100 }), hourAt(1, 23, { claude: 40 }), hourAt(3, 10, { codex: 300 }), hourAt(9, 10, { codex: 999 })];

it("buckets hours into local days ending today, heaviest provider first", () => {
  const s = localDays(hours, 7, now);
  expect(s.xs).toHaveLength(7);
  expect(s.xs.at(-1)).toBe(startOfLocalDay(now));
  expect(s.providers).toEqual(["codex", "claude"]);
  expect(s.values.codex!.at(-1)).toBe(600);
  expect(s.values.claude!.at(-2)).toBe(40);
  expect(s.totals.at(-1)).toBe(620);
  // A day with no record stays "unknown" instead of claiming zero use; the 9-days-ago hour falls outside the week.
  expect(s.known).toEqual([false, false, false, true, false, true, true]);
  expect(s.totals.reduce((a, b) => a + b, 0)).toBe(620 + 40 + 300);
});

it("keeps calendar days whole across daylight-saving changes", () => {
  const start = new Date(2026, 2, 7).getTime(); // spans the US spring-forward weekend
  expect(new Date(addLocalDays(start, 2)).getHours()).toBe(0);
});

it("maps usage onto weekday by hour, Monday first", () => {
  const grid = rhythm(hours);
  expect(grid[1]![14]).toBe(520); // Tuesday 2 pm
  expect(grid[0]![23]).toBe(40); // Monday 11 pm
  expect(busiest(grid)).toEqual({ day: 6, hour: 10, value: 999 }); // the whole window counts: Sunday 10 am, nine days ago
  expect(busiest(rhythm([]))).toBeNull();
  expect(rhythm(hours, "claude")[1]![14]).toBe(20);
});

it("reads the last 24 hours ending with this hour", () => {
  const h = lastHours(hours, now);
  expect(h).toHaveLength(24);
  expect(h.at(-2)).toBe(520); // 2 pm, one hour before the current 3 pm hour
  expect(h.at(-7)).toBe(100); // 9 am
  expect(lastHours(hours, now, 24, "claude").reduce((a, b) => a + b, 0)).toBe(60);
});

it("compares today with a usual day", () => {
  const s = localDays(hours, 7, now);
  expect(usualDay(s)).toBe(170); // median of the recorded days before today: 40 and 300
  expect(versusUsual(620, 170)).toBe("3.6× a usual day");
  expect(versusUsual(160, 170)).toBe("About a usual day");
  expect(versusUsual(20, 170)).toBe("Quieter than usual");
  expect(versusUsual(0, 0)).toBe("Nothing yet today");
});
