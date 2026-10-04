import { expect, it } from "vitest";
import { freshAction } from "./fresh-action";
const before = { context: { app: "Music", window: "Library", elements: [{ name: "Play", role: "button", x: .2, y: .2, w: .1, h: .05 }] } };
it("reacquires a moved target and refuses ambiguity or another window", () => {
  const action = { type: "click" as const, x: .2, y: .2, label: "Play" };
  const current = { context: { ...before.context, elements: [{ ...before.context.elements[0]!, x: .6 }] } };
  expect(freshAction(action, before, current)).toMatchObject({ x: .6 });
  expect(() => freshAction(action, before, { context: { ...current.context, window: "Other" } })).toThrow();
  expect(() => freshAction(action, before, { context: { ...current.context, elements: [...current.context.elements, ...current.context.elements] } })).toThrow();
});
it("never types into an app that changed and never guesses an unnamed click", () => {
  expect(() => freshAction({ type: "type", text: "hello", label: "Search" }, before, { context: { ...before.context, app: "Terminal" } })).toThrow();
  expect(() => freshAction({ type: "click", x: .2, y: .2, label: "" }, before, before)).toThrow();
});
it("refuses changed display geometry and never applies main-display targets to another display", () => {
  const action = { type: "click" as const, x: .2, y: .2, label: "Play", screen: 2 };
  expect(() => freshAction(action, before, before)).toThrow("display");
  expect(() => freshAction({ type: "key", keys: "Return", label: "Confirm" }, { ...before, display: 1 }, { ...before, display: 2 })).toThrow("display");
});
it("refuses dispatch preparation if stopped or permissions revoked while capture is pending", async () => {
  const { prepareFreshAction } = await import("./fresh-action");
  let alive = true; let resolve!: (value: typeof before) => void;
  const pending = prepareFreshAction({ type: "key", keys: "Return", label: "Confirm" }, before, () => new Promise(r => { resolve = r; }), () => alive);
  alive = false; resolve(before);
  await expect(pending).rejects.toThrow("Stopped");
});
