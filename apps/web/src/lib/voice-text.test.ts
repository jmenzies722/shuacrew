import { describe, it, expect } from "vitest";
import { spokenText, SpeechSegmenter } from "./voice-text";

describe("speech output", () => {
  it("keeps prose but removes code, links and credentials", () => {
    expect(spokenText("Try this.\n```sh\nrm -rf /tmp/demo\n```\nThen [read the guide](https://example.com). `TOKEN` sk-proj-123456789012345678901234567890")).toBe("Try this. Then read the guide.");
  });
  it("holds partial sentences and split code fences until safe to speak", () => {
    const s = new SpeechSegmenter();
    expect(s.push("Hello")).toEqual([]);
    expect(s.push(" there.\n``")).toEqual(["Hello there."]);
    expect(s.push("`sh\necho secret.\n```\nNext step.")).toEqual(["Next step."]);
    expect(s.finish()).toEqual([]);
  });
  it("does not release fragments of a credential across deltas", () => {
    const s = new SpeechSegmenter();
    expect(s.push("Your key is sk-proj-")).toEqual([]);
    expect(s.push("123456789012345678901234567890. ")).toEqual(["Your key is ."]);
  });
});
