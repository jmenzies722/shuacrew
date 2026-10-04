import { expect, it } from "vitest";
import { notchContentHeight, companionVoiceState } from "./notch-layout";

it("measures intrinsic rows without growing from its own constrained height", () => {
  const measure = () => notchContentHeight([60, 38], 26, 12, 300);
  expect(measure()).toBe(136);
  expect(measure()).toBe(measure());
  expect(notchContentHeight([500, 38], 26, 12, 300)).toBe(300);
});

it("moves directly from held recording to preparation during the release tail", () => {
  expect(companionVoiceState({ held: true, released: false, phase: "hearing", speaking: false, pending: false })).toBe("listening");
  expect(companionVoiceState({ held: false, released: true, phase: "hearing", speaking: false, pending: false })).toBe("thinking");
  expect(companionVoiceState({ held: false, released: true, phase: "off", speaking: false, pending: true })).toBe("thinking");
  expect(companionVoiceState({ held: false, released: true, phase: "off", speaking: true, pending: true })).toBe("speaking");
  expect(companionVoiceState({ held: false, released: false, phase: "off", speaking: false, pending: false })).toBe("idle");
});
