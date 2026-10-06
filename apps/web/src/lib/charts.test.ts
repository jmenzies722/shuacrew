import { expect, it } from "vitest";
import { bandPath, compact, median, niceMax, seconds, smoothPath, squarify, stack } from "./charts";

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

it("draws a smooth path that never overshoots the recorded range", () => {
  const pts = [[0, 50], [10, 0], [20, 100], [30, 100], [40, 20]] as const;
  const d = smoothPath(pts);
  expect(d.startsWith("M0,50")).toBe(true);
  expect(d).not.toContain("NaN");
  // Every control point's y stays within the data's range: no invented peaks or dips below zero.
  const ys = numbers(d).filter((_, i) => i % 2 === 1);
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...ys)).toBeLessThanOrEqual(100);
});

it("handles one point and no points", () => {
  expect(smoothPath([])).toBe("");
  expect(smoothPath([[5, 5]])).toBe("M5,5");
});

it("closes a band between two lines", () => {
  const d = bandPath([[0, 10], [10, 5]], [[0, 20], [10, 20]]);
  expect(d.endsWith("Z")).toBe(true);
  expect(d).toContain("L10,20");
});

it("rounds axis maxima to readable numbers", () => {
  expect(niceMax(0)).toBe(1);
  expect(niceMax(7)).toBe(10);
  expect(niceMax(1.7e6)).toBe(2e6);
  expect(niceMax(2.2e5)).toBe(2.5e5);
  expect(niceMax(Number.NaN)).toBe(1);
});

it("stacks series as running totals and ignores negatives", () => {
  expect(stack([[1, 2], [3, -4]])).toEqual([[1, 2], [4, 2]]);
});

it("lays out a treemap whose areas are proportional and fill the box", () => {
  const box = { x: 0, y: 0, w: 600, h: 300 };
  const tiles = squarify([{ value: 6 }, { value: 6 }, { value: 4 }, { value: 3 }, { value: 2 }, { value: 2 }, { value: 1 }, { value: 0 }], box);
  expect(tiles).toHaveLength(7); // zero-value items take no space
  const area = tiles.reduce((s, t) => s + t.w * t.h, 0);
  expect(area).toBeCloseTo(600 * 300, 3);
  expect(tiles[0]!.w * tiles[0]!.h).toBeCloseTo((6 / 24) * 600 * 300, 3);
  for (const t of tiles) {
    expect(t.x).toBeGreaterThanOrEqual(-1e-9); expect(t.y).toBeGreaterThanOrEqual(-1e-9);
    expect(t.x + t.w).toBeLessThanOrEqual(600 + 1e-6); expect(t.y + t.h).toBeLessThanOrEqual(300 + 1e-6);
  }
  expect(squarify([{ value: 1 }], { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
});

it("formats instrument values", () => {
  expect(compact(950)).toBe("950"); expect(compact(12_400)).toBe("12k"); expect(compact(3_100_000)).toBe("3.1M");
  expect(seconds(840)).toBe("840 ms"); expect(seconds(9100)).toBe("9.1 s"); expect(seconds(null)).toBe("—");
  expect(median([5, 1, 100])).toBe(5); expect(median([])).toBe(0); expect(median([1, 3])).toBe(2);
});
