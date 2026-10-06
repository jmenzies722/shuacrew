import { expect, it } from "vitest";
import { locate, nameMatch, shapeOf } from "./snap";
import { parseDraw, parseGuide, parsePoint } from "./buddy";

// A 16:10 screen with a Save button, a round checkbox, a search field and one OCR text line (centre-based fractions).
const screen = {
  aspect: 16 / 10,
  context: { app: "Safari", elements: [
    { name: "Save", role: "button", x: 0.82, y: 0.07, w: 0.05, h: 0.03 },
    { name: "Cancel", role: "button", x: 0.75, y: 0.07, w: 0.05, h: 0.03 },
    { name: "Remember me", role: "checkbox", x: 0.3, y: 0.5, w: 0.012, h: 0.019 },
    { name: "Search", role: "searchfield", x: 0.5, y: 0.1, w: 0.2, h: 0.03 },
  ] },
  text: [{ t: "Privacy & Security", x: 0.2, y: 0.4, w: 0.12, h: 0.02 }],
};

it("names match by words and by quoted phrases", () => {
  expect(nameMatch("Click Save", "Save")).toBe(1);
  expect(nameMatch("Open “Privacy & Security”", "Privacy & Security")).toBe(1);
  expect(nameMatch("Click Save", "Cancel")).toBe(0);
});

it("lands exactly on the named control, centred on it (never shifted by half its size)", () => {
  const r = locate({ x: 0.79, y: 0.06, w: 0.08, h: 0.06, label: "Click Save" }, screen);
  expect(r).toMatchObject({ x: 0.82, y: 0.07, w: 0.05, h: 0.03, exact: true, shape: "pill" });
});

it("a picked item wins: '#1' is the first control, 'T0' the first text line", () => {
  expect(locate({ x: 0.5, y: 0.5, w: 0.04, h: 0.04, label: "", target: "#1" }, screen)).toMatchObject({ x: 0.82, y: 0.07, exact: true });
  expect(locate({ x: 0.5, y: 0.5, w: 0.04, h: 0.04, label: "", target: "T0" }, screen)).toMatchObject({ x: 0.2, y: 0.4, w: 0.12, shape: "rounded", exact: true });
});

it("takes the shape of the thing: a circle for a checkbox, a pill for a search field, a soft box for text", () => {
  expect(locate({ x: 0.3, y: 0.5, w: 0.04, h: 0.04, label: "Tick Remember me" }, screen).shape).toBe("circle");
  expect(locate({ x: 0.5, y: 0.1, w: 0.1, h: 0.04, label: "Type in Search" }, screen).shape).toBe("pill");
  expect(shapeOf({ w: 0.02, h: 0.032, role: "button" })).toBe("circle"); // a square icon button
  expect(shapeOf({ w: 0.12, h: 0.02 })).toBe("rounded");                  // a line of text
});

it("keeps the model's aim (marked inexact) when nothing real is near", () => {
  const aim = { x: 0.4, y: 0.8, w: 0.05, h: 0.05, label: "Click Save" };
  expect(locate(aim, screen)).toEqual({ x: 0.4, y: 0.8, w: 0.05, h: 0.05, shape: "rounded", exact: false });
  expect(locate(aim, null).exact).toBe(false);
});

it("guide, point and draw blocks carry a picked target", () => {
  const g = parseGuide('```guide {"target":"#1","label":"Click Save","step":1}```');
  expect(g && !g.done && g.target).toBe("#1");
  expect(parsePoint('```point {"target":"T0","label":"here"}```')?.target).toBe("T0");
  expect(parseGuide('```guide {"target":"bogus"}```')).toBeNull();
  expect(parseDraw('```draw [{"shape":"box","target":"#1","label":"save here"},{"shape":"arrow","from":[0.1,0.1],"target":"T0"}]```'))
    .toMatchObject([{ shape: "box", target: "#1" }, { shape: "arrow", target: "T0" }]);
});

it("reacquires a moved target by identity, never by recycled screenshot IDs", async () => {
  const { reacquire } = await import("./snap");
  const before = { context: { app: "Editor", window: "Project", elements: [{ name: "Save", role: "button", x:.2,y:.2,w:.1,h:.05 }] } };
  const after = { context: { app: "Editor", window: "Project", elements: [{ name: "Delete", role: "button", x:.2,y:.2,w:.1,h:.05 },{name:"Save",role:"button",x:.8,y:.7,w:.1,h:.05}] } };
  const aim = {x:.2,y:.2,w:.1,h:.05,label:"Save",target:"#1"};
  expect(reacquire(aim, before, after)).toMatchObject({x:.8,y:.7,exact:true});
  expect(reacquire(aim, before, {context:{...after.context,app:"Other"}})).toBeNull();
  expect(reacquire(aim, before, {context:{...after.context,elements:[after.context.elements[0]!]}})).toBeNull();
  expect(reacquire(aim, before, {context:{...after.context,elements:[after.context.elements[1]!,{...after.context.elements[1]!,x:.4}]}})).toBeNull();
});

it("settles two same-named controls only when one is clearly where it was", async () => {
  const { reacquire } = await import("./snap");
  const reply = (x: number, y: number) => ({ name: "Reply", role: "button", x, y, w: .06, h: .03 });
  const before = { context: { app: "Mail", window: "Inbox", elements: [reply(.3, .2), reply(.3, .6)] } };
  const after = { context: { app: "Mail", window: "Inbox", elements: [reply(.3, .21), reply(.3, .62)] } };
  expect(reacquire({ x: 0, y: 0, w: .03, h: .03, label: "", target: "#2" }, before, after)).toMatchObject({ y: .62 });
  expect(reacquire({ x: .3, y: .2, w: .03, h: .03, label: "Reply" }, before, after, true)).toMatchObject({ y: .21 });
  // Aimed between them, or not aimed at all: still ambiguous, no click.
  expect(reacquire({ x: .3, y: .4, w: .03, h: .03, label: "Reply" }, before, after, true)).toBeNull();
  expect(reacquire({ x: .3, y: .2, w: .03, h: .03, label: "Reply" }, before, after)).toBeNull();
  // Both crowded together near the old spot: no clear winner.
  expect(reacquire({ x: 0, y: 0, w: .03, h: .03, label: "", target: "#1" }, before, { context: { ...after.context, elements: [reply(.3, .2), reply(.32, .2)] } })).toBeNull();
});
