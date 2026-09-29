import { describe, expect, it } from "vitest";
import { fixNames, vocabulary } from "./media.js";

describe("transcripts spell your names right", () => {
  const names = ["Rhea", "Eli", "Maya", "Otto", "Shua", "ShuaCrew", "Codex"];
  it("snaps near-misses mid-sentence to the exact name", () => {
    expect(fixNames("Hey Shuaa, have Ria research it. Then ask Eli to open a PR on ShuaaCrew.", names))
      .toBe("Hey Shua, have Rhea research it. Then ask Eli to open a PR on ShuaCrew.");
  });
  it("never touches the first word of a sentence or lowercase words", () => {
    expect(fixNames("All good. All done, and ria is lowercase.", names)).toBe("All good. All done, and ria is lowercase.");
    expect(fixNames("Ella said hi to Oto", names)).toBe("Ella said hi to Otto");
  });
  it("builds a short, de-duplicated hint", () => {
    const v = vocabulary(["Rhea", "rhea", "Leash"]);
    expect(v.startsWith("Rhea, Leash, ShuaCrew")).toBe(true);
    expect(v.split(", ").length).toBeLessThanOrEqual(60);
  });
});
