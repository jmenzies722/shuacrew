import { expect, it } from "vitest";
import { hudSeries } from "./hud";

it("buckets events by second and ignores future or stale ones", () => {
  const now = 100_000;
  const { perSecond, rate, lastAt } = hudSeries([now - 500, now - 800, now - 2_500, now - 45_000, now + 5_000], now);
  expect(perSecond.at(-1)).toBe(2);
  expect(perSecond.at(-3)).toBe(1);
  expect(perSecond.reduce((a, b) => a + b, 0)).toBe(3);
  expect(rate).toBeCloseTo(0.3);
  expect(lastAt).toBe(now + 5_000);
});
