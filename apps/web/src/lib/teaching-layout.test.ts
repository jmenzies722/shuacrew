import { describe, it, expect } from "vitest";
import { emptyLesson, type VisualObject } from "@shuacrew/core";
import { layoutTeaching, wrapLabel } from "./teaching-layout";
const measure = (s: string) => s.length * 8;
describe("teaching label layout", () => {
  it("wraps long and unbroken labels before sizing boxes", () => {
    const text = "Long label " + "x".repeat(150);
    expect(wrapLabel(text, 100, measure).every((line) => measure(line) <= 100)).toBe(true);
  });
  it("keeps crowded automatically positioned nodes apart and routes cycles finitely", () => {
    const doc = emptyLesson("test");
    doc.objects = Array.from(
      { length: 20 },
      (_, i) =>
        ({
          id: `n${i}`,
          kind: "rectangle",
          label: "Detailed label ".repeat((i % 4) + 1),
          groupId: null,
          from: null,
          to: null,
          tone: "neutral",
        }) as VisualObject,
    );
    for (let i = 0; i < 20; i++)
      doc.objects.push({
        id: `e${i}`,
        kind: "connector",
        label: "data flow",
        from: `n${i}`,
        to: `n${(i + 1) % 20}`,
        groupId: null,
        tone: "neutral",
      });
    const layout = layoutTeaching(doc, measure);
    for (const a of layout.boxes)
      for (const b of layout.boxes)
        if (a.id !== b.id)
          expect(
            a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
          ).toBe(true);
    expect(layout.edges.every((e) => !e.path.includes("NaN"))).toBe(true);
  });
  it("preserves user positions independently of canvas zoom or screen origin", () => {
    const doc = emptyLesson("test");
    doc.objects = [
      { id: "n", kind: "rectangle", label: "My edit", groupId: null, from: null, to: null, tone: "neutral" },
    ];
    doc.positions.n = { x: -500, y: 250 };
    const layout = layoutTeaching(doc, measure);
    expect(layout.boxes[0]?.x).toBe(-500);
    expect(layout.bounds.x).toBeLessThan(-500);
  });
  it("folds long chains into readable rows without overlapping nodes", () => {
    const doc = emptyLesson("chain");
    for (let i = 0; i < 9; i++) {
      doc.objects.push({
        id: `n${i}`,
        kind: "rectangle",
        label: "A meaningful long label for this stage",
        from: null,
        to: null,
        groupId: null,
        tone: "neutral",
      });
      if (i)
        doc.objects.push({
          id: `e${i}`,
          kind: "connector",
          label: "data",
          from: `n${i - 1}`,
          to: `n${i}`,
          groupId: null,
          tone: "neutral",
        });
    }
    const layout = layoutTeaching(doc, measure);
    expect(layout.bounds.width).toBeLessThan(1400);
    expect(new Set(layout.boxes.map((b) => b.y)).size).toBe(3);
    for (const a of layout.boxes)
      for (const b of layout.boxes)
        if (a.id !== b.id)
          expect(
            a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
          ).toBe(true);
    expect(layout.edges.every((e) => !e.path.includes("NaN"))).toBe(true);
  });
});
