import { expect, it } from "vitest";
import { endsSentence, learnCoupling, vadStart, vadStep, type VadState } from "./handsfree";

const run = (rms: number, ms: number, echo?: number) => {
  let s: VadState = vadStart(); let event: string | undefined;
  for (let t = 0; t < ms; t += 20) { const r = vadStep(s, rms, 20, undefined, true, echo); s = r.state; if (r.event) event = r.event; }
  return event;
};

it("with Spark's echo measured, a normal voice interrupts in about a quarter second", () => {
  expect(run(0.12, 300, 0.03)).toBe("start");        // you, clearly above the echo
  expect(run(0.12, 200, 0.03)).toBeUndefined();      // not yet: a blip isn't an interruption
});

it("Spark's own voice coming back through the speakers never counts as you", () => {
  expect(run(0.05, 3000, 0.04)).toBeUndefined();     // echo-level sound, however long
});

it("without a measured echo it stays cautious (louder and sustained)", () => {
  expect(run(0.05, 300)).toBeUndefined();
});

it("learns how much of Spark reaches the mic, and ignores silence between words", () => {
  let c = 0.6;
  for (let i = 0; i < 300; i++) c = learnCoupling(c, 0.02, 0.2);   // quiet room: 10% comes back
  expect(c).toBeLessThan(0.15);
  expect(learnCoupling(0.3, 0.5, 0.001)).toBe(0.3);
});

it("a finished-sounding sentence lets the turn end sooner", () => {
  expect(endsSentence("Can you open my calendar?")).toBe(true);
  expect(endsSentence("so what I was thinking")).toBe(false);
});
