import { describe, it, expect } from "vitest";
import { emptyLesson, applyTeachingPatch, validateLesson } from "./teaching.js";
const object = {
  id: "a",
  kind: "rectangle",
  label: "Call stack",
  groupId: null,
  from: null,
  to: null,
  tone: "accent",
};
const patch = {
  version: 1,
  sessionId: "lesson",
  baseRevision: 0,
  title: "Recursion",
  answer: "A call can call itself.",
  assumptions: [],
  steps: [{ id: "one", title: "Call", text: "Begin", sources: [], objects: ["a"] }],
  operations: [{ op: "create", object }],
  annotations: [],
};
describe("teaching transactions", () => {
  it("applies a complete patch and preserves identity on follow-up", () => {
    const a = applyTeachingPatch(emptyLesson("lesson"), patch);
    const b = applyTeachingPatch(a, {
      ...patch,
      baseRevision: 1,
      operations: [{ op: "update", object: { ...object, label: "Base case" } }],
    });
    expect(b.objects[0]?.id).toBe("a");
    expect(b.revision).toBe(2);
    expect(a.objects[0]?.label).toBe("Call stack");
  });
  it("rejects partial JSON, stale revisions and unknown citations atomically", () => {
    const d = emptyLesson("lesson");
    for (const bad of [
      "{",
      { ...patch, baseRevision: 1 },
      { ...patch, steps: [{ ...patch.steps[0], sources: [{ sourceId: "missing", locator: "line 1" }] }] },
    ])
      expect(() => applyTeachingPatch(d, bad)).toThrow();
    expect(d.objects).toEqual([]);
  });
  it("protects user edits and rejects dangling connectors", () => {
    const d = applyTeachingPatch(emptyLesson("lesson"), patch);
    d.edited = ["a"];
    expect(() =>
      applyTeachingPatch(d, { ...patch, baseRevision: 1, operations: [{ op: "update", object }] }),
    ).toThrow(/edited/);
    expect(() =>
      validateLesson({ ...d, objects: [{ ...object, kind: "connector", from: "a", to: "missing" }] }),
    ).toThrow();
  });
  it("rejects stale capture references and nested group cycles", () => {
    expect(() =>
      applyTeachingPatch(emptyLesson("lesson"), {
        ...patch,
        annotations: [
          { id: "x", captureId: "old", stepId: "one", kind: "label", x: 0, y: 0, w: 0, h: 0, label: "Here" },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateLesson({ ...emptyLesson("lesson"), objects: [{ ...object, kind: "group", groupId: "a" }] }),
    ).toThrow(/Cyclic/);
  });
});
