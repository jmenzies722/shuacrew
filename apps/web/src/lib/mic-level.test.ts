import { afterEach, expect, it } from "vitest";
import { getMicLevel, setMicLevel, subscribeMicLevel } from "./mic-level";

afterEach(() => setMicLevel(0));

it("preserves quiet speech and small changes instead of quantizing them away", () => {
  setMicLevel(0.012);
  expect(getMicLevel()).toBe(0.012);
  setMicLevel(0.018);
  expect(getMicLevel()).toBe(0.018);
});

it("publishes silence, clamps invalid input, and releases subscribers", () => {
  const readings: number[] = [];
  const unsubscribe = subscribeMicLevel(() => readings.push(getMicLevel()));
  setMicLevel(2); setMicLevel(0); setMicLevel(NaN); setMicLevel(-1);
  unsubscribe(); setMicLevel(0.5);
  expect(readings).toEqual([1, 0]);
});
