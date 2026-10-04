import { expect, it } from "vitest";
import { voiceEnvelope } from "./voice-envelope";

it("rises quickly on syllables and settles more gently between them", () => {
  const rise = voiceEnvelope(0, 1, 16);
  const fall = 1 - voiceEnvelope(1, 0, 16);
  expect(rise).toBeGreaterThan(fall);
  expect(rise).toBeGreaterThan(0);
  expect(rise).toBeLessThan(1);
});

it("is frame-rate independent and settles to real silence", () => {
  expect(voiceEnvelope(voiceEnvelope(0, 0.8, 16), 0.8, 16)).toBeCloseTo(voiceEnvelope(0, 0.8, 32), 6);
  expect(voiceEnvelope(0.1, 0, 2000)).toBe(0);
  expect(voiceEnvelope(0, 0, 16)).toBe(0);
});
