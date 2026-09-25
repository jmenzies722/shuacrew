import { describe, expect, it } from "vitest";
import { shouldSend } from "./composer-keys";

describe("composer send shortcut", () => {
  const enter = { key: "Enter", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false };
  it("never submits by keyboard in button-only mode", () => {
    for (const modifiers of [{}, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }]) {
      expect(shouldSend({ ...enter, ...modifiers }, "button-only")).toBe(false);
    }
  });
  it("uses the selected shortcut without sending a newline or an IME confirmation", () => {
    expect(shouldSend(enter, "enter")).toBe(true);
    expect(shouldSend(enter, "modifier-enter")).toBe(false);
    expect(shouldSend({ ...enter, metaKey: true }, "modifier-enter")).toBe(true);
    expect(shouldSend({ ...enter, ctrlKey: true }, "modifier-enter")).toBe(true);
    expect(shouldSend({ ...enter, shiftKey: true }, "enter")).toBe(false);
    expect(shouldSend({ ...enter, altKey: true }, "enter")).toBe(false);
    expect(shouldSend({ ...enter, isComposing: true }, "enter")).toBe(false);
    expect(shouldSend({ ...enter, keyCode: 229 }, "enter")).toBe(false);
    expect(shouldSend({ ...enter, key: "x", metaKey: true }, "modifier-enter")).toBe(false);
  });
});
