import { expect, it } from "vitest";
import { ruleActive } from "./modes";
import { decodeTheme, encodeTheme } from "./theme-code";
import { DEFAULT_APPEARANCE } from "./appearance";
import { DEFAULT_LOOK } from "./look";

it("schedules: weekday windows, overnight windows, wrong days", () => {
  const mon10 = new Date(2026, 8, 28, 10, 0), sat10 = new Date(2026, 8, 26, 10, 0), mon23 = new Date(2026, 8, 28, 23, 0), tue2 = new Date(2026, 8, 29, 2, 0);
  const morning = { mode: "deep" as const, days: [1, 2, 3, 4, 5], start: 9 * 60, end: 12 * 60 };
  expect(ruleActive(morning, mon10)).toBe(true); expect(ruleActive(morning, sat10)).toBe(false);
  const night = { mode: "wind" as const, days: [0, 1, 2, 3, 4, 5, 6], start: 22 * 60, end: 7 * 60 };
  expect(ruleActive(night, mon23)).toBe(true); expect(ruleActive(night, tue2)).toBe(true); expect(ruleActive(night, mon10)).toBe(false);
});
it("theme codes round-trip and can only set valid values", () => {
  const look = { ...DEFAULT_LOOK, customAccent: "#ff66cc", monoFont: "menlo" as const };
  const code = encodeTheme({ ...DEFAULT_APPEARANCE, accent: "blue" }, look);
  expect(code).toMatch(/^SHUA1-[A-Za-z0-9_-]+$/);
  const back = decodeTheme(code, { appearance: DEFAULT_APPEARANCE, look: DEFAULT_LOOK });
  expect(back.look).toMatchObject({ customAccent: "#ff66cc", monoFont: "menlo" }); expect(back.appearance.accent).toBe("blue");
  const evil = "SHUA1-" + btoa(JSON.stringify({ a: { accent: "<script>", sendShortcut: "button-only" }, l: { customAccent: "javascript:" } })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const safe = decodeTheme(evil, { appearance: DEFAULT_APPEARANCE, look: DEFAULT_LOOK });
  expect(safe.appearance.accent).toBe(DEFAULT_APPEARANCE.accent); expect(safe.appearance.sendShortcut).toBe(DEFAULT_APPEARANCE.sendShortcut); expect(safe.look.customAccent).toBeNull();
  expect(() => decodeTheme("hello", { appearance: DEFAULT_APPEARANCE, look: DEFAULT_LOOK })).toThrow(/SHUA1/);
});

it("round-trips the Obsidian palette without replacing existing themes", () => {
 const back=decodeTheme(encodeTheme({...DEFAULT_APPEARANCE,palette:"obsidian",dark:"obsidian"},DEFAULT_LOOK),{appearance:DEFAULT_APPEARANCE,look:DEFAULT_LOOK});
 expect(back.appearance.palette).toBe("obsidian");expect(back.appearance.dark).toBe("obsidian");
});
