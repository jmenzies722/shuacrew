import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TeachingStore, TeachingEngine } from "./teaching.js";
function setup() {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "teaching-test-")), "lessons.json"),
    store = new TeachingStore(file);
  store.create();
  const id = store.snapshot().active!;
  const patch = {
    version: 1,
    sessionId: id,
    baseRevision: 0,
    title: "Recursion",
    answer: "A function calls itself.",
    assumptions: ["Illustrative example"],
    steps: [{ id: "step", title: "Call", text: "Start here", objects: ["node"], sources: [] }],
    operations: [
      {
        op: "create",
        object: {
          id: "node",
          kind: "rectangle",
          label: "factorial(3)",
          groupId: null,
          from: null,
          to: null,
          tone: "accent",
        },
      },
    ],
    annotations: [],
  };
  return { file, store, id, patch };
}
describe("shared teaching persistence", () => {
  it("persists and restores identity, selection and step; undo/redo increases revision", () => {
    const { file, store, id, patch } = setup();
    store.patch(id, patch);
    store.commit(id, 1, (d) => ({ ...d, selected: ["node"] }), false);
    const loaded = new TeachingStore(file);
    expect(loaded.get(id).selected).toEqual(["node"]);
    expect(loaded.get(id).stepId).toBe("step");
    loaded.commit(id, 2, (d) => ({
      ...d,
      objects: d.objects.map((o) => ({ ...o, label: "edited" })),
      edited: ["node"],
    }));
    loaded.history(id, 3, "undo");
    expect(loaded.get(id).objects[0]?.label).toBe("factorial(3)");
    loaded.history(id, 4, "redo");
    expect(loaded.get(id).objects[0]?.label).toBe("edited");
    expect(loaded.get(id).revision).toBe(5);
    expect(JSON.parse(readFileSync(file, "utf8")).active).toBe(id);
  });
  it("bounds repair and leaves malformed output unapplied", async () => {
    const { store, id } = setup();
    let calls = 0;
    const engine = new TeachingEngine(store, async () => {
      calls++;
      return { broken: true };
    });
    await expect(engine.explain(id, { baseRevision: 0, question: "Teach", sources: [] })).rejects.toThrow();
    expect(calls).toBe(2);
    expect(store.get(id).revision).toBe(0);
    expect(engine.busy(id)).toBe(false);
  });
  it("cancellation prevents a late SDK result from committing", async () => {
    const { store, id, patch } = setup();
    let release!: (value: unknown) => void;
    const engine = new TeachingEngine(
      store,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const running = engine.explain(id, { baseRevision: 0, question: "Teach", sources: [] });
    engine.cancel(id);
    release(patch);
    await expect(running).rejects.toThrow();
    expect(store.get(id).objects).toEqual([]);
  });
  it("concurrent edits reject the late model patch", async () => {
    const { store, id, patch } = setup();
    let release!: (value: unknown) => void;
    const engine = new TeachingEngine(
      store,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const running = engine.explain(id, { baseRevision: 0, question: "Teach", sources: [] });
    store.commit(id, 0, (d) => ({ ...d, title: "My title" }));
    release(patch);
    await expect(running).rejects.toThrow(/changed/);
    expect(store.get(id).title).toBe("My title");
  });
});

function practiceSetup() {
  const setupResult = setup(),
    { store, id, patch } = setupResult;
  store.patch(id, patch);
  store.commit(
    id,
    1,
    (d) => ({
      ...d,
      practice: { ...d.practice, active: true, status: "waiting", stepId: "step", displayId: 1 },
    }),
    false,
  );
  const now = Date.now();
  const event = {
    eventId: "event_one",
    sessionId: id,
    kind: "click",
    observedAt: now - 100,
    displayId: 1,
    x: 0.5,
    y: 0.5,
    source: {
      id: "source_one",
      title: "After click",
      kind: "capture",
      text: "Reference",
      image: "YWJj",
      mime: "image/jpeg",
      capture: {
        id: "capture_one",
        displayId: 1,
        capturedAt: now,
        sourceWidth: 200,
        sourceHeight: 200,
        width: 100,
        height: 100,
        display: { x: -100, y: 0, width: 100, height: 100 },
        crop: { x: 0, y: 0, width: 200, height: 200 },
        context: "display-1",
      },
    },
  };
  return { ...setupResult, event };
}
describe("persistent practice", () => {
  it("verifies an explicit screen check without describing it as a mouse click", async () => {
    const { store, id, event } = practiceSetup();
    const engine = new TeachingEngine(store, async (input) => {
      expect(input.system).toContain("explicit screen check");
      expect(JSON.parse(input.prompt).event.kind).toBe("check");
      return { eventId: event.eventId, stepId: "step", outcome: "verified", feedback: "The goal is visible.", evidence: "The result is on screen.", annotations: [] };
    });
    await engine.observe(id, { ...event, kind: "check" });
    expect(store.get(id).practice.status).toBe("verified");
    expect(store.get(id).practice.active).toBe(true);
  });
  it("leaves checking after a concurrent edit rejects a stale assessment, preserving the edit and goal", async () => {
    const { store, id, event } = practiceSetup();
    let release!: (value: unknown) => void;
    const engine = new TeachingEngine(store, () => new Promise((resolve) => { release = resolve; }));
    const running = engine.observe(id, event);
    store.commit(id, store.get(id).revision, (d) => ({ ...d, title: "My edited lesson" }));
    release({ eventId: event.eventId, stepId: "step", outcome: "verified", feedback: "Done", evidence: "Visible", annotations: [] });
    await expect(running).rejects.toThrow(/Stale/);
    const doc = store.get(id);
    expect(engine.busy(id)).toBe(false);
    expect(doc.title).toBe("My edited lesson");
    expect(doc.practice.active).toBe(true);
    expect(doc.stepId).toBe("step");
    expect(doc.practice.status).toBe("uncertain");
    expect(doc.practice.feedback).toContain("lesson changed");
    expect(doc.annotations).toEqual([]);
  });
  it("keeps the same goal and objects after a wrong attempt, and resumes as paused after restart", async () => {
    const { store, id, file, event } = practiceSetup();
    const engine = new TeachingEngine(store, async () => ({
      eventId: event.eventId,
      stepId: "step",
      outcome: "retry",
      feedback: "Try opening the menu again.",
      evidence: "The menu is closed.",
      annotations: [],
    }));
    await engine.observe(id, event);
    const doc = store.get(id);
    expect(doc.practice.active).toBe(true);
    expect(doc.practice.status).toBe("retry");
    expect(doc.stepId).toBe("step");
    expect(doc.objects[0]?.id).toBe("node");
    const restored = new TeachingStore(file).get(id);
    expect(restored.practice.active).toBe(false);
    expect(restored.practice.feedback).toContain("Try opening");
    expect(restored.stepId).toBe("step");
    await expect(engine.observe(id, event)).rejects.toThrow(/Stale/);
  });
  it("rejects mismatched events and displays without declaring success", async () => {
    const { store, id, event } = practiceSetup();
    let calls = 0;
    const engine = new TeachingEngine(store, async () => {
      calls++;
      return {
        eventId: "wrong",
        stepId: "step",
        outcome: "verified",
        feedback: "Done",
        evidence: "Visible",
        annotations: [],
      };
    });
    await expect(engine.observe(id, { ...event, displayId: 2 })).rejects.toThrow(/mismatched/);
    expect(calls).toBe(0);
    await expect(engine.observe(id, event)).rejects.toThrow(/different event/);
    expect(calls).toBe(2);
    expect(store.get(id).practice.status).toBe("uncertain");
    expect(store.get(id).practice.active).toBe(true);
  });
  it("binds retry hints to the exact fresh capture and keeps the goal active", async () => {
    const { store, id, event } = practiceSetup();
    const hint = {
      id: "hint",
      captureId: "capture_one",
      stepId: "step",
      kind: "arrow",
      x: 0.8,
      y: 0.8,
      w: 0,
      h: 0,
      endX: 0.2,
      endY: 0.2,
      label: "Try here",
    };
    const engine = new TeachingEngine(store, async () => ({
      eventId: event.eventId,
      stepId: "step",
      outcome: "retry",
      feedback: "Try the other control.",
      evidence: "The expected menu is not visible.",
      annotations: [hint],
    }));
    await engine.observe(id, event);
    expect(store.get(id).annotations).toEqual([hint]);
    expect(store.get(id).practice.capture?.id).toBe("capture_one");
    expect(store.get(id).practice.active).toBe(true);
    expect(store.get(id).stepId).toBe("step");
  });
  it("pause prevents a delayed verification from changing the saved goal", async () => {
    const { store, id, event } = practiceSetup();
    let release!: (value: unknown) => void;
    const engine = new TeachingEngine(
      store,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const running = engine.observe(id, event);
    engine.cancel(id);
    store.commit(
      id,
      store.get(id).revision,
      (d) => ({ ...d, practice: { ...d.practice, active: false, status: "paused" } }),
      false,
    );
    release({
      eventId: event.eventId,
      stepId: "step",
      outcome: "verified",
      feedback: "Done",
      evidence: "Visible",
      annotations: [],
    });
    await expect(running).rejects.toThrow();
    expect(store.get(id).practice.status).toBe("paused");
    expect(store.get(id).stepId).toBe("step");
  });
});

it("emits a Codex structured-output schema without unsupported oneOf", async () => {
  const { z } = await import("zod");
  const { TeachingPatchSchema } = await import("@shuacrew/core/teaching");
  const schema = z.toJSONSchema(TeachingPatchSchema, { target: "draft-7" });
  expect(JSON.stringify(schema)).not.toContain('"oneOf"');
  expect(JSON.stringify(schema)).toContain('"anyOf"');
});
