import { expect, it } from "vitest";
import { fitTimes, revealTimes } from "./NotchCaption";

it("re-times words to the sentence's real length, so the last word lands just before it ends", () => {
  const text = "Kokoro speaks a little faster than the guess", t = revealTimes(text);
  expect(fitTimes(t, text, 1)).toEqual(t); // length not known yet: keep the estimate
  const fast = fitTimes(t, text, 1, 1500), slow = fitTimes(t, text, 1, 6000);
  expect(fast.at(-1)!).toBeLessThan(t.at(-1)!);
  expect(slow.at(-1)!).toBeGreaterThan(t.at(-1)!);
  expect(fast.at(-1)!).toBeLessThan(1500);
  expect(fast[0]).toBe(0);
});

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
