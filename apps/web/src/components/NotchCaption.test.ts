import { expect, it } from "vitest";
import { revealTimes } from "./NotchCaption";

it("reveals words at speaking pace, pausing after punctuation, faster at a faster voice", () => {
  const t = revealTimes("Hi there, friend. Next up");
  expect(t).toHaveLength(5);
  expect(t[0]).toBe(0);
  expect(t.every((v, i) => i === 0 || v > t[i - 1]!)).toBe(true);
  // the gap after "friend." includes a sentence beat; after "there," a shorter comma beat
  expect(t[3]! - t[2]!).toBeGreaterThan(t[2]! - t[1]!);
  expect(revealTimes("one two three", 1.25)[2]).toBeLessThan(revealTimes("one two three", 1)[2]!);
  expect(revealTimes("   ")).toEqual([]);
});
