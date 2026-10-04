import { expect, it } from "vitest";
import { parseCompanion } from "./companion";
import { classicCaptureWanted } from "./live-preferences";

it("never silently opens Classic capture after Live fails or a mode switch", () => {
  const base = { engine: "live" as const, conversation: true, wake: false, voice: false, callActive: false, switchBlocked: false };
  expect(classicCaptureWanted(base)).toBe(false);
  expect(classicCaptureWanted({ ...base, voice: true })).toBe(true);
  expect(classicCaptureWanted({ ...base, voice: true, callActive: true })).toBe(false);
  expect(classicCaptureWanted({ ...base, engine: "classic", switchBlocked: true })).toBe(false);
});

it("preserves explicit Classic and unrelated saved preferences", () => {
  const preferences = parseCompanion({ voiceEngine: "classic", nickname: "Shua", desktopPlacement: "notch", control: "off" });
  expect(preferences.voiceEngine).toBe("classic"); expect(preferences.nickname).toBe("Shua");
  expect(preferences.desktopPlacement).toBe("notch"); expect(preferences.control).toBe("off");
});
it("normalizes unknown conversation engines to Live", () => {
  expect(parseCompanion({ voiceEngine: "unknown" }).voiceEngine).toBe("live");
});
