import { expect, it } from "vitest";
import { normalizeVoicePreferences } from "./voice-preferences";
it("requires explicit experimental interruption and bounds retained worker choices", () => {
  expect(normalizeVoicePreferences({ mode: "conversation", automaticInterruption: true, warmMinutes: 10 })).toMatchObject({ mode: "conversation", automaticInterruption: true, warmMinutes: 10 });
  expect(normalizeVoicePreferences({ automaticInterruption: "yes", warmMinutes: 999, endpoint: "bad" })).toMatchObject({ automaticInterruption: false, warmMinutes: 5, endpoint: "balanced" });
});
