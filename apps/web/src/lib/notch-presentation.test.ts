import { expect, it } from "vitest";
import { notchPreviewWanted, notchReplyText } from "./notch-presentation";

it("shows complete streaming text even while voice is enabled", () => {
  expect(notchReplyText("An answer is streaming", "Old answer", true, true)).toBe("An answer is streaming");
  expect(notchReplyText("", "Complete answer awaiting audio", true, true)).toBe("Complete answer awaiting audio");
});

it("preserves text-only replies and completed playback history", () => {
  expect(notchReplyText("Streaming answer", "Old answer", false, true)).toBe("Streaming answer");
  expect(notchReplyText("", "Finished reply", true, false)).toBe("Finished reply");
});

it("keeps passive lessons, history and completed work out of the resting notch", () => {
  expect(notchPreviewWanted({ active: false, tucked: false, expanded: false })).toBe(false);
});

it("shows a transient active status without competing with the expanded panel", () => {
  expect(notchPreviewWanted({ active: true, tucked: false, expanded: false })).toBe(true);
  expect(notchPreviewWanted({ active: true, tucked: false, expanded: true })).toBe(false);
});

it("does not reopen after the user moves away, even while voice is active", () => {
  expect(notchPreviewWanted({ active: true, tucked: true, expanded: false })).toBe(false);
});
