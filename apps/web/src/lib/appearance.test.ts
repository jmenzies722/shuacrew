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
  it("keeps your accent and folds an old palette into Dark", () => {
    const seen: Record<string, string> = { "shuacrew.design": "onyx", "shuacrew.design.onyx-mac": "1", "shuacrew.appearance": JSON.stringify({ palette: "midnight", dark: "midnight", accent: "blue" }) };
    vi.stubGlobal("localStorage", { getItem: (key: string) => seen[key] ?? null, setItem: () => {} });
    expect(loadAppearance()).toEqual({ ...DEFAULT_APPEARANCE, palette: "onyx", dark: "onyx", accent: "blue" });
  });
  it("moves a retired palette to its twin rather than the default", () => {
    expect(normalizeAppearance({ palette: "night", dark: "cursor" })).toMatchObject({ palette: "onyx", dark: "onyx" });
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

describe("one look, two modes", () => {
  it("is Dark and Light with the blue accent for new setups", async () => {
    const { DEFAULT_APPEARANCE, PALETTES } = await import("./appearance");
    expect(DEFAULT_APPEARANCE).toMatchObject({ dark: "onyx", light: "porcelain", accent: "azure" });
    expect(PALETTES.map((p) => [p.id, p.name, p.mode])).toEqual([["onyx", "Dark", "dark"], ["porcelain", "Light", "light"]]);
  });
  it("folds every retired palette into the mode it belonged to, keeping your accent", async () => {
    const { normalizeAppearance } = await import("./appearance");
    for (const dark of ["obsidian", "pristine", "frost", "graphite", "carbon", "midnight", "night", "cursor"]) expect(normalizeAppearance({ palette: dark, dark, accent: "coral" }), dark).toMatchObject({ palette: "onyx", dark: "onyx", accent: "coral" });
    for (const light of ["daylight", "paper", "sand"]) expect(normalizeAppearance({ palette: light, light }), light).toMatchObject({ palette: "porcelain", light: "porcelain" });
    expect(normalizeAppearance({ palette: "system", dark: "frost", light: "sand" })).toMatchObject({ palette: "system", dark: "onyx", light: "porcelain" });
  });
  it("saves the folded palette, so a second read at startup gets the same answer", async () => {
    const data = new Map<string, string>([["shuacrew.appearance", JSON.stringify({ palette: "obsidian", dark: "obsidian", accent: "coral" })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    const { loadAppearance } = await import("./appearance");
    expect(loadAppearance()).toMatchObject({ palette: "onyx", accent: "coral" });
    expect(JSON.parse(data.get("shuacrew.appearance")!)).toMatchObject({ palette: "onyx", dark: "onyx" });
    expect(loadAppearance()).toMatchObject({ palette: "onyx", accent: "coral" });
  });
});
