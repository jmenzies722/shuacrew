import { expect, it } from "vitest";
import { parseVisual } from "./visual";
import { lessonFocus, voiceEnvelope, normalizeArchitecture } from "./notch-lesson";

const lesson = { type: "architecture", title: "Request path", summary: "A cache avoids repeated database reads.", nodes: [{ id: "api", label: "API" }, { id: "cache", label: "Cache" }], edges: [{ from: "api", to: "cache", label: "lookup" }], steps: [{ title: "Lookup", body: "The API asks the cache first.", focus: ["cache"] }], example: "A cached product loads without another query." };
it("normalizes legacy identity and rejects lossy graphs and unsafe sources", () => {
  const normalized = normalizeArchitecture(lesson)!;
  expect(normalized.id).toBe(normalizeArchitecture(lesson)!.id);
  expect(normalized.steps[0]!.id).toBeTruthy();
  const nodes = Array.from({ length: 12 }, (_, index) => ({ id: `node-${index}`, label: `配送 ${index}` }));
  const edges = Array.from({ length: 20 }, (_, index) => ({ id: `edge-${index}`, from: nodes[index % 12]!.id, to: nodes[(index + 1) % 12]!.id }));
  const valid = { ...lesson, nodes, edges, steps: [{ title: "Serve", body: "Deliver video.", focus: [nodes[0]!.id] }] };
  expect(normalizeArchitecture(valid)?.nodes).toHaveLength(12);
  expect(normalizeArchitecture({ ...valid, nodes: [...nodes, { id: "extra", label: "extra" }] })).toBeNull();
  expect(normalizeArchitecture({ ...valid, edges: [...edges, edges[0]] })).toBeNull();
  expect(normalizeArchitecture({ ...lesson, sources: [{ title: "Bad", url: "javascript:alert(1)" }] })).toBeNull();
  expect(normalizeArchitecture({ ...lesson, steps: [{ ...lesson.steps[0], focus: ["missing"] }] })).toBeNull();
  expect(normalizeArchitecture({ ...lesson, steps: [{ ...lesson.steps[0], edgeFocus: ["missing"] }] })).toBeNull();
});
it("accepts a paced architecture lesson with validated references", () => {
  const parsed = parseVisual(JSON.stringify(lesson));
  expect(parsed).toMatchObject(lesson);
});
it("rejects duplicate identities and dangling architecture edges", () => {
  expect(parseVisual(JSON.stringify({ ...lesson, nodes: [lesson.nodes[0], lesson.nodes[0]] }))).toBeNull();
  expect(parseVisual(JSON.stringify({ ...lesson, edges: [{ from: "api", to: "missing" }] }))).toBeNull();
});
it("rejects missing explanations and invalid quiz answers", () => {
  expect(parseVisual(JSON.stringify({ ...lesson, steps: [{ title: "Empty" }] }))).toBeNull();
  expect(parseVisual(JSON.stringify({ ...lesson, quiz: { question: "Why?", options: ["One", "Two"], answer: 1.5 } }))).toBeNull();
});
it("highlights only nodes named by the audible sentence", () => {
  expect(lessonFocus(lesson.nodes, "The cache answers now.")).toEqual(["cache"]);
  expect(lessonFocus(lesson.nodes, "Recapitulate the whole system.")).toEqual([]);
});
it("bounds audio energy and returns silence when playback stops", () => {
  expect(voiceEnvelope(0.5, 1, false)).toBe(0);
  expect(voiceEnvelope(0, NaN, true)).toBe(0);
  expect(voiceEnvelope(0, 0, true)).toBe(0);
  expect(voiceEnvelope(0, 0.1, true)).toBeGreaterThan(0);
  expect(voiceEnvelope(1, 20, true)).toBeLessThanOrEqual(1);
});
