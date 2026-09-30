import { expect, it } from "vitest";
import { waveBars } from "./wave";

it("follows your voice: calm when quiet, tall in the middle when you talk", () => {
  const quiet = waveBars(0, 1.3), loud = waveBars(1, 1.3), sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  expect(quiet).toHaveLength(17);
  expect(Math.max(...quiet)).toBeLessThan(0.25);                 // silence: a small ripple
  expect(Math.min(...quiet)).toBeGreaterThanOrEqual(0.12);       // never flat
  expect(sum(loud)).toBeGreaterThan(sum(quiet) * 3);
  expect(loud[8]!).toBeGreaterThan(loud[0]!);                    // centre taller than the edge
  expect(sum(waveBars(0.3, 2))).toBeGreaterThan(sum(waveBars(0, 2))); // soft speech still moves it
  expect(waveBars(0.6, 0.5)).not.toEqual(waveBars(0.6, 0.62));   // it ripples on its own
  expect(Math.max(...loud)).toBeLessThanOrEqual(1);
});
