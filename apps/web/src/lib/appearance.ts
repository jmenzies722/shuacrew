/**
 * How ShuaCrew looks: a palette (surfaces and text) and an accent. "Follow system" pairs a dark
 * palette with a light one. Applied as attributes on <html>; themes.css does the rest.
 */
export type PaletteId = "pristine" | "frost" | "night" | "cursor" | "graphite" | "carbon" | "midnight" | "daylight" | "paper" | "sand";
export type AccentId = "iris" | "amber" | "mono" | "blue" | "green" | "coral";

export interface Palette {
  id: PaletteId;
  name: string;
  mode: "dark" | "light";
  blurb: string;
  /** For the picker's preview: window, panel, raised, text. */
  swatch: [string, string, string, string];
}

export const PALETTES: Palette[] = [
  { id: "pristine", name: "Pristine", mode: "dark", blurb: "Graphite layers, hairline edges", swatch: ["#0c0c0e", "#131316", "#19191d", "#ededf0"] },
  { id: "frost", name: "Frost Black", mode: "dark", blurb: "Frosted glass on true black", swatch: ["#050506", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.1)", "#f2f2f4"] },
  { id: "night", name: "Night", mode: "dark", blurb: "Blue-black instrument panel", swatch: ["#0b0d10", "#12151a", "#181c22", "#e8eaed"] },
  { id: "cursor", name: "Cursor Black", mode: "dark", blurb: "True neutral black", swatch: ["#0a0a0a", "#111111", "#181818", "#ededed"] },
  { id: "graphite", name: "Graphite", mode: "dark", blurb: "Soft neutral grey", swatch: ["#161618", "#1c1c1f", "#242428", "#e8e8ea"] },
  { id: "carbon", name: "Carbon", mode: "dark", blurb: "Warm black", swatch: ["#0f0e0c", "#161412", "#1e1b18", "#ece6de"] },
  { id: "midnight", name: "Midnight", mode: "dark", blurb: "Deep navy", swatch: ["#0a0f1c", "#0f1626", "#151e33", "#e4e9f4"] },
  { id: "daylight", name: "Daylight", mode: "light", blurb: "Cool, crisp light", swatch: ["#f4f5f7", "#ffffff", "#f7f8fa", "#111418"] },
  { id: "paper", name: "Paper", mode: "light", blurb: "Clean neutral white", swatch: ["#f7f7f8", "#ffffff", "#f3f3f5", "#111113"] },
  { id: "sand", name: "Sand", mode: "light", blurb: "Warm light", swatch: ["#f6f3ec", "#fdfbf7", "#f0ebe1", "#1e1a14"] },
];

export const ACCENTS: Array<{ id: AccentId; name: string; dark: string; light: string }> = [
  { id: "iris", name: "Iris", dark: "#8b7cf6", light: "#6a55e0" },
  { id: "amber", name: "Amber", dark: "#ffb020", light: "#b86e00" },
  { id: "mono", name: "Mono", dark: "#ededed", light: "#18181b" },
  { id: "blue", name: "Blue", dark: "#5b8cff", light: "#2f63d6" },
  { id: "green", name: "Green", dark: "#3ddc97", light: "#0c8a57" },
  { id: "coral", name: "Coral", dark: "#ff7a59", light: "#d9512e" },
];

export interface Appearance {
  /** A palette, or "system" to switch between `dark` and `light` with macOS. */
  palette: PaletteId | "system";
  dark: PaletteId;
  light: PaletteId;
  accent: AccentId;
  density: "comfortable" | "compact";
  reading: "small" | "default" | "large";
  motion: "system" | "reduced" | "full";
  navigation: "icons" | "labels";
  startPage: "/" | "/floor" | "/activity" | "/ventures" | "/board";
  sendShortcut: "enter" | "modifier-enter" | "button-only";
  spellcheck: "on" | "off";
  turnMap: "show" | "hide";
}

const KEY = "shuacrew.appearance";
export const DEFAULT_APPEARANCE: Appearance = { palette: "system", dark: "pristine", light: "daylight", accent: "iris", density: "comfortable", reading: "default", motion: "system", navigation: "icons", startPage: "/", sendShortcut: "enter", spellcheck: "on", turnMap: "show" };

export function normalizeAppearance(value: unknown): Appearance {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const choices: Record<keyof Appearance, readonly string[]> = {
    palette: ["system", ...PALETTES.map((p) => p.id)],
    dark: PALETTES.filter((p) => p.mode === "dark").map((p) => p.id),
    light: PALETTES.filter((p) => p.mode === "light").map((p) => p.id),
    accent: ACCENTS.map((a) => a.id), density: ["comfortable", "compact"],
    reading: ["small", "default", "large"], motion: ["system", "reduced", "full"],
    navigation: ["icons", "labels"], startPage: ["/", "/floor", "/activity", "/ventures", "/board"],
    sendShortcut: ["enter", "modifier-enter", "button-only"], spellcheck: ["on", "off"], turnMap: ["show", "hide"],
  };
  return Object.fromEntries(Object.entries(choices).map(([key, allowed]) => [key,
    typeof raw[key] === "string" && allowed.includes(raw[key]) ? raw[key] : DEFAULT_APPEARANCE[key as keyof Appearance],
  ])) as unknown as Appearance;
}

/**
 * The Pristine redesign, once: a setup still on the old defaults (Frost Black, Amber) moves to Pristine and Iris.
 * A palette or accent you chose yourself is left exactly as it is.
 */
export function migrateToPristine(a: Appearance, saved: boolean, store: Pick<Storage, "getItem" | "setItem"> = localStorage): Appearance {
  let done = false; try { done = store.getItem("shuacrew.design") === "pristine"; } catch { /* ignore */ }
  if (!saved || done) return a;
  const next = { ...a };
  if (next.dark === "frost") next.dark = "pristine";
  if (next.palette === "frost") next.palette = "pristine";
  if (next.accent === "amber") next.accent = "iris";
  try { store.setItem("shuacrew.design", "pristine"); } catch { /* the move is cosmetic; never lose your settings over it */ }
  return next;
}

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Appearance> | null;
    // The old setting was just "dark" / "light" / "system".
    const legacy = localStorage.getItem("shuacrew.theme");
    const base = normalizeAppearance(saved);
    if (!saved && legacy === "dark") base.palette = "night";
    if (!saved && legacy === "light") base.palette = "daylight";
    return migrateToPristine(base, Boolean(saved));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(a: Appearance) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...a, version: 1 }));
    return true;
  } catch {
    return false;
  }
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;

export function resolvePalette(a: Appearance): Palette {
  const id = a.palette === "system" ? (media?.matches === false ? a.light : a.dark) : a.palette;
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

let unfollow: (() => void) | null = null;
let unwatchMotion: (() => void) | null = null;

export function applyAppearance(a: Appearance, animate = false) {
  const root = document.documentElement;
  const palette = resolvePalette(a);
  if (animate) {
    root.classList.add("theme-switching");
    setTimeout(() => root.classList.remove("theme-switching"), 320);
  }
  root.setAttribute("data-theme", palette.mode);
  root.setAttribute("data-palette", palette.id);
  root.setAttribute("data-accent", a.accent);
  root.setAttribute("data-density", a.density);
  root.setAttribute("data-navigation", a.navigation);
  root.style.setProperty("--reading-size", a.reading === "small" ? "13px" : a.reading === "large" ? "16px" : "14px");
  const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
  const updateMotion = () => root.setAttribute("data-motion", a.motion === "reduced" || (a.motion === "system" && motionMedia.matches) ? "reduced" : "full");
  unwatchMotion?.();
  updateMotion();
  motionMedia.addEventListener("change", updateMotion);
  unwatchMotion = () => motionMedia.removeEventListener("change", updateMotion);
  // The Mac app's own chrome (title bar, sidebar material) follows the palette, not just macOS.
  (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: { postMessage(m: unknown): void } } } }).webkit?.messageHandlers?.shuacrew?.postMessage({ type: "appearance", mode: palette.mode, palette: palette.id });
  unfollow?.();
  unfollow = null;
  if (a.palette === "system" && media) {
    const onChange = () => applyAppearance(a, true);
    media.addEventListener("change", onChange);
    unfollow = () => media.removeEventListener("change", onChange);
  }
}
