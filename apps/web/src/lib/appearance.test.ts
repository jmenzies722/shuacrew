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
  it("preserves deliberate palettes picked after the one-time Onyx move", () => {
    const seen: Record<string, string> = { "shuacrew.design": "onyx", "shuacrew.design.onyx-mac": "1", "shuacrew.appearance": JSON.stringify({ palette: "midnight", dark: "midnight", accent: "blue" }) };
    vi.stubGlobal("localStorage", { getItem: (key: string) => seen[key] ?? null, setItem: () => {} });
    expect(loadAppearance()).toEqual({ ...DEFAULT_APPEARANCE, palette: "midnight", dark: "midnight", accent: "blue" });
  });
  it("moves a retired palette to its twin rather than the default", () => {
    expect(normalizeAppearance({ palette: "night", dark: "cursor" })).toMatchObject({ palette: "midnight", dark: "frost" });
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

describe("the Pristine move", () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it("moves only the old defaults, once", async () => {
    const { migrateToPristine, DEFAULT_APPEARANCE } = await import("./appearance");
    const s = store();
    const moved = migrateToPristine({ ...DEFAULT_APPEARANCE, dark: "frost", palette: "frost", accent: "amber" }, true, s);
    expect(moved).toMatchObject({ dark: "pristine", palette: "pristine", accent: "iris" });
    expect(migrateToPristine({ ...DEFAULT_APPEARANCE, dark: "frost", accent: "amber" }, true, s)).toMatchObject({ dark: "frost", accent: "amber" }); // already moved once
    expect(migrateToPristine({ ...DEFAULT_APPEARANCE, dark: "midnight", accent: "blue" }, true, store())).toMatchObject({ dark: "midnight", accent: "blue" }); // yours stays
  });
});

describe("the Onyx move", () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it("is the default for new setups", async () => {
    const { DEFAULT_APPEARANCE } = await import("./appearance");
    expect(DEFAULT_APPEARANCE).toMatchObject({ dark: "onyx", light: "porcelain", accent: "azure" });
  });
  it("moves only the previous defaults, once", async () => {
    const { migrateToOnyx, DEFAULT_APPEARANCE } = await import("./appearance");
    const s = store();
    expect(migrateToOnyx({ ...DEFAULT_APPEARANCE, palette: "pristine", dark: "pristine", light: "daylight", accent: "iris" }, true, s))
      .toMatchObject({ palette: "onyx", dark: "onyx", light: "porcelain", accent: "azure" });
    expect(migrateToOnyx({ ...DEFAULT_APPEARANCE, dark: "pristine", accent: "iris" }, true, s)).toMatchObject({ dark: "pristine", accent: "iris" }); // already moved
    expect(migrateToOnyx({ ...DEFAULT_APPEARANCE, palette: "midnight", dark: "carbon", light: "sand", accent: "coral" }, true, store()))
      .toMatchObject({ palette: "midnight", dark: "carbon", light: "sand", accent: "coral" }); // yours stays
  });
  it("keeps a migration's result: a second read at startup still gets Onyx", async () => {
    const data = new Map<string, string>([["shuacrew.appearance", JSON.stringify({ palette: "obsidian", dark: "obsidian", accent: "coral" })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    const { loadAppearance } = await import("./appearance");
    expect(loadAppearance()).toMatchObject({ palette: "onyx", accent: "coral" });
    expect(loadAppearance()).toMatchObject({ palette: "onyx", accent: "coral" });
  });
  it("moves any palette to Onyx once, keeping your accent", async () => {
    const { migrateOnyxEverywhere, DEFAULT_APPEARANCE } = await import("./appearance");
    const s = store();
    expect(migrateOnyxEverywhere({ ...DEFAULT_APPEARANCE, palette: "obsidian", dark: "obsidian", light: "sand", accent: "iris" }, true, s))
      .toMatchObject({ palette: "onyx", dark: "onyx", light: "porcelain", accent: "iris" });
    expect(migrateOnyxEverywhere({ ...DEFAULT_APPEARANCE, palette: "midnight", accent: "coral" }, true, s)).toMatchObject({ palette: "midnight" }); // picked after: stays
    expect(migrateOnyxEverywhere({ ...DEFAULT_APPEARANCE, palette: "paper" }, true, store())).toMatchObject({ palette: "porcelain" }); // light stays light
    expect(migrateOnyxEverywhere({ ...DEFAULT_APPEARANCE, palette: "system", accent: "green" }, true, store())).toMatchObject({ palette: "system", dark: "onyx", light: "porcelain", accent: "green" });
  });
  it("doesn't re-run the Pristine move after the Onyx one", async () => {
    const { migrateToPristine, DEFAULT_APPEARANCE } = await import("./appearance");
    const s = store(); s.setItem("shuacrew.design", "onyx");
    expect(migrateToPristine({ ...DEFAULT_APPEARANCE, dark: "frost", accent: "amber" }, true, s)).toMatchObject({ dark: "frost", accent: "amber" });
  });
});
