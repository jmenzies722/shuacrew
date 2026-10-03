import { expect, it } from "vitest";
import { narrationFocus, narrationSegments } from "./lesson-narration";
import { normalizeArchitecture } from "./notch-lesson";
it("only follows playback for the active lesson revision", () => {
  const lesson = normalizeArchitecture({ id: "video", revision: 2, title: "Video", summary: "Overview", example: "A film", nodes: [{ id: "api", label: "API" }, { id: "cdn", label: "CDN" }], edges: [{ id: "deliver", from: "api", to: "cdn" }], steps: [{ id: "watch", title: "Watch", body: "Fetch a segment", focus: ["cdn"], edgeFocus: ["deliver"] }] })!;
  expect(narrationFocus(lesson, null).stepId).toBeNull();
  expect(narrationFocus(lesson, { lessonId: "video", revision: 1, stepId: "watch" }).nodes).toEqual([]);
  expect(narrationFocus(lesson, { lessonId: "video", revision: 2, stepId: "watch" })).toEqual({ nodes: ["cdn"], edges: ["deliver"], stepId: "watch" });
});
it("splits long narration below the speech request limit without losing words", () => {
  const text = "Explain the playback path carefully. ".repeat(100).trim();
  const segments = narrationSegments(text);
  expect(segments.length).toBeGreaterThan(1);
  expect(segments.every(segment => segment.length < 600)).toBe(true);
  expect(segments.join(" ")).toBe(text);
});
