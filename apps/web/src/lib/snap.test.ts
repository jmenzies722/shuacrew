import { expect, it } from "vitest";
import { nameMatch, snapBox } from "./snap";

const screen = {
  context: { app: "Safari", elements: [
    { name: "Save", role: "button", x: 0.82, y: 0.07, w: 0.05, h: 0.03 },
    { name: "Cancel", role: "button", x: 0.75, y: 0.07, w: 0.05, h: 0.03 },
  ] },
  text: [{ t: "Privacy & Security", x: 0.2, y: 0.4, w: 0.12, h: 0.02 }],
};

it("names match by words and by quoted phrases", () => {
  expect(nameMatch("Click Save", "Save")).toBe(1);
  expect(nameMatch("Open “Privacy & Security”", "Privacy & Security")).toBe(1);
  expect(nameMatch("Click Save", "Cancel")).toBe(0);
});

it("snaps a rough box onto the control its label names", () => {
  const b = snapBox({ x: 0.78, y: 0.04, w: 0.08, h: 0.06, label: "Click Save" }, screen);
  expect(b.x).toBeCloseTo(0.82 - 0.025 - 0.004, 3);
  expect(b.w).toBeCloseTo(0.05 + 0.008, 3);
});

it("snaps onto an exact text line, and leaves the box alone when nothing real is near", () => {
  const b = snapBox({ x: 0.17, y: 0.38, w: 0.1, h: 0.05, label: "Open Privacy & Security" }, screen);
  expect(b.y).toBeCloseTo(0.4 - 0.01 - 0.004, 3);
  const away = { x: 0.4, y: 0.8, w: 0.05, h: 0.05, label: "Click Save" };
  expect(snapBox(away, screen)).toEqual(away);
  expect(snapBox(away, null)).toEqual(away);
});
