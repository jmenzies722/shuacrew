import { expect, it } from "vitest";
import { bestAppleVoice, currentVoice, isAppleVoice } from "./voices";

it("keeps a saved Apple voice instead of falling back to the default", () => {
  expect(currentVoice("apple-zoe-premium")).toBe("apple-zoe-premium");
  expect(currentVoice("aiden")).toBe("michael");
  expect(currentVoice("nobody")).toBe("michael");
  expect(isAppleVoice("apple-../x")).toBe(false);
});

it("switches to an Apple voice only when a Premium one is installed", () => {
  expect(bestAppleVoice([{ id: "michael" }, { id: "apple-daniel-enhanced", engine: "apple", quality: "enhanced" }])).toBeUndefined();
  expect(bestAppleVoice([{ id: "apple-zoe-premium", engine: "apple", quality: "premium" }, { id: "apple-daniel-enhanced", engine: "apple", quality: "enhanced" }])).toBe("apple-zoe-premium");
});
