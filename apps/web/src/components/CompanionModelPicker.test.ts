import { expect, it } from "vitest";
import { brainPreference } from "./CompanionModelPicker";

it("asks Claude in Claude voice mode, whatever Codex model was picked; Codex mode keeps the pick", () => {
  expect(brainPreference({ voiceEngine: "classic", modelChoice: "codex:gpt-5.5" })).toEqual({ preferredRuntime: "claude" });
  expect(brainPreference({ voiceEngine: "live", modelChoice: "codex:gpt-5.5" })).toEqual({ preferredRuntime: "codex", preferredModel: "gpt-5.5" });
  expect(brainPreference({ voiceEngine: "live", modelChoice: "" })).toEqual({ preferredRuntime: "codex" });
});
