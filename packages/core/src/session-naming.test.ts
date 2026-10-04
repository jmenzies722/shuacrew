import { expect, it } from "vitest";
import { nameSession } from "./session-naming.js";

it("preserves an explicitly quoted session title over a suggested title", () => {
  expect(nameSession('Create a session called "Sable — Keyboard Polish" and fix the shortcuts.', "Fix shortcuts")).toEqual({ title: "Sable — Keyboard Polish", titleSource: "explicit" });
  expect(nameSession('Audit the renderer. Name this session “Frame Performance”.').title).toBe("Frame Performance");
  expect(nameSession("Title: 'Shua’s Next Chapter'\nImprove the notch").title).toBe("Shua’s Next Chapter");
});
it("does not mistake a quoted subject for a requested title", () => {
  expect(nameSession('Fix the "login" button', "Login button fix")).toEqual({ title: "Login button fix", titleSource: "suggested" });
  expect(nameSession('Explain why the code says name = "Frame"').titleSource).toBe("derived");
});
it("uses the model's short title without rewriting it", () => {
  expect(nameSession("Check why authentication fails on refresh", "Refresh token repair")).toEqual({ title: "Refresh token repair", titleSource: "suggested" });
});
it("derives short task titles without filler or cut words", () => {
  expect(nameSession("Can you please fix Sable keyboard shortcuts? Also add tests.").title).toBe("Fix Sable keyboard shortcuts");
  expect(nameSession("Please help me improve the notch readability and animation timing while preserving the existing voice behavior").title).toBe("Improve the notch readability and animation timing");
  expect(nameSession("\n\n").title).toBe("New session");
  expect(nameSession("检查中文输入法的问题").title).toBe("检查中文输入法的问题");
});
