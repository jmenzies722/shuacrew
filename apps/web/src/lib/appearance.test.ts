import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, loadAppearance, normalizeAppearance, saveAppearance } from "./appearance";
afterEach(() => vi.unstubAllGlobals());
describe("workspace preferences", () => {
  it("preserves an explicit arrow-only selection across reload", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    saveAppearance(normalizeAppearance({ sendShortcut: "button-only" }));
    expect(loadAppearance().sendShortcut).toBe("button-only");
  });
  it("retains chat controls across reloads and rejects unsupported values", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const next = normalizeAppearance({ sendShortcut: "modifier-enter", spellcheck: "off", turnMap: "hide" });
    saveAppearance(next);
    expect(loadAppearance()).toMatchObject({ sendShortcut: "modifier-enter", spellcheck: "off", turnMap: "hide" });
    expect(normalizeAppearance({ sendShortcut: "auto", spellcheck: false, turnMap: "bad" })).toMatchObject({ sendShortcut: "enter", spellcheck: "on", turnMap: "show" });
  });
  it("preserves deliberate palettes while migrating older preferences", () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "shuacrew.appearance" ? JSON.stringify({ palette: "night", dark: "night", accent: "blue" }) : null });
    expect(loadAppearance()).toEqual({ ...DEFAULT_APPEARANCE, palette: "night", dark: "night", accent: "blue" });
  });
  it("recovers invalid values independently", () => {
    expect(normalizeAppearance({ palette: "missing", dark: "paper", light: "night", accent: null, navigation: "labels", startPage: "https://example.com" })).toEqual({ ...DEFAULT_APPEARANCE, navigation: "labels" });
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });
  it("round trips preferences with a storage version", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const preferences = { ...DEFAULT_APPEARANCE, density: "compact", reading: "large", navigation: "labels", motion: "reduced", startPage: "/floor" } as const;
    expect(saveAppearance(preferences)).toBe(true);
    expect(loadAppearance()).toEqual(preferences);
    expect(JSON.parse(data.get("shuacrew.appearance")!).version).toBe(1);
  });
  it("reports unavailable storage and handles malformed JSON", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{", setItem: () => { throw new Error("quota"); } });
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(saveAppearance(DEFAULT_APPEARANCE)).toBe(false);
  });
});
