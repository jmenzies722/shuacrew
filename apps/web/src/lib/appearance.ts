/**
 * How ShuaCrew looks: a palette (surfaces and text) and an accent. "Follow system" pairs a dark
 * palette with a light one. Applied as attributes on <html>; themes.css does the rest.
 */
export type PaletteId = "onyx" | "porcelain";
/**
 * One look, two modes (notion.css). The nine older palettes fold into the mode they belonged to, so a saved choice
 * lands on Dark or Light instead of snapping back to the default. The ids stay "onyx" and "porcelain": saved
 * preferences and the design layer keyed on them ([data-design="onyx"]) keep working.
 */
const RETIRED: Record<string, PaletteId> = {
  night: "onyx", cursor: "onyx", obsidian: "onyx", pristine: "onyx", frost: "onyx", graphite: "onyx", carbon: "onyx", midnight: "onyx",
  daylight: "porcelain", paper: "porcelain", sand: "porcelain",
};

export interface Palette {
  id: PaletteId;
  name: string;
  mode: "dark" | "light";
  blurb: string;
  /** For the picker's preview: window, panel, raised, text. */
  swatch: [string, string, string, string];
}

export const PALETTES: Palette[] = [
  { id: "onyx", name: "Dark", mode: "dark", blurb: "Soft black page, warm grey sidebar", swatch: ["#202020", "#191919", "#252525", "#e3e3e1"] },
  { id: "porcelain", name: "Light", mode: "light", blurb: "White page, warm grey sidebar", swatch: ["#f7f7f5", "#ffffff", "#f4f4f2", "#37352f"] },
];

export type AccentId = "azure" | "iris" | "amber" | "mono" | "blue" | "green" | "coral";

export const ACCENTS: Array<{ id: AccentId; name: string; dark: string; light: string }> = [
  { id: "azure", name: "Azure", dark: "#5aa9ff", light: "#1f6feb" },
  { id: "iris", name: "Iris", dark: "#8e48ff", light: "#723acc" },
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
  /** The full sidebar (threads and places in one column, the Codex way), or the slim rail with icons or labels. */
  navigation: "sidebar" | "icons" | "labels";
  startPage: "/" | "/floor" | "/activity" | "/board";
  sendShortcut: "enter" | "modifier-enter" | "button-only";
  spellcheck: "on" | "off";
  turnMap: "show" | "hide";
}

const KEY = "shuacrew.appearance";
export const DEFAULT_APPEARANCE: Appearance = { palette: "system", dark: "onyx", light: "porcelain", accent: "azure", density: "comfortable", reading: "default", motion: "system", navigation: "sidebar", startPage: "/", sendShortcut: "enter", spellcheck: "on", turnMap: "show" };

export function normalizeAppearance(value: unknown): Appearance {
  const raw = { ...(value && typeof value === "object" ? value as Record<string, unknown> : {}) };
  for (const key of ["palette", "dark", "light"] as const) if (typeof raw[key] === "string" && RETIRED[raw[key]]) raw[key] = RETIRED[raw[key]];
  const choices: Record<keyof Appearance, readonly string[]> = {
    palette: ["system", ...PALETTES.map((p) => p.id)],
    dark: PALETTES.filter((p) => p.mode === "dark").map((p) => p.id),
    light: PALETTES.filter((p) => p.mode === "light").map((p) => p.id),
    accent: ACCENTS.map((a) => a.id), density: ["comfortable", "compact"],
    reading: ["small", "default", "large"], motion: ["system", "reduced", "full"],
    navigation: ["sidebar", "icons", "labels"], startPage: ["/", "/floor", "/activity", "/board"],
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
/**
 * The sidebar redesign, once: a setup still on the old default (the icon rail) gets the full sidebar. Labels, a choice
 * nobody gets by default, stays; and once moved, choosing the rail again sticks.
 */
export function migrateToSidebar(a: Appearance, saved: boolean, store: Pick<Storage, "getItem" | "setItem"> = localStorage): Appearance {
  let done = false; try { done = store.getItem("shuacrew.nav") === "sidebar-v1"; } catch { /* ignore */ }
  if (done) return a;
  try { store.setItem("shuacrew.nav", "sidebar-v1"); } catch { /* cosmetic: never lose settings over it */ }
  return saved && a.navigation === "icons" ? { ...a, navigation: "sidebar" } : a;
}

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Appearance> | null;
    // The old setting was just "dark" / "light" / "system".
    const legacy = localStorage.getItem("shuacrew.theme");
    const base = normalizeAppearance(saved);
    if (!saved && legacy === "dark") base.palette = "onyx";
    if (!saved && legacy === "light") base.palette = "porcelain";
    const migrated = migrateToSidebar(base, Boolean(saved));
    // A retired palette folds into Dark or Light (normalizeAppearance); keep that, so the saved value is one that exists.
    if (saved && (JSON.stringify(migrated) !== JSON.stringify(base) || saved.palette !== migrated.palette || saved.dark !== migrated.dark || saved.light !== migrated.light)) saveAppearance(migrated);
    return migrated;
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
  // Onyx and Porcelain share one design language (onyx.css); the older palettes keep theirs.
  root.setAttribute("data-design", palette.id === "onyx" || palette.id === "porcelain" ? "onyx" : "classic");
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
