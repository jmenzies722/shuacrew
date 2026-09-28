import { useSyncExternalStore } from "react";

/** Fonts, chat layout and sounds. Presentation only — never changes what agents may do. */
export interface LookPrefs {
  version: 1;
  uiFont: "geist" | "system";
  readingFont: "sans" | "serif";
  monoFont: "jetbrains" | "sf-mono" | "menlo";
  ligatures: boolean;
  chatStyle: "document" | "bubbles";
  chatWidth: "narrow" | "default" | "wide";
  timestamps: "hover" | "always";
  sounds: { approval: boolean; done: boolean; failed: boolean; volume: number };
  /** Any accent colour (#rrggbb) — overrides the preset accent. null = use the preset. */
  customAccent: string | null;
  /** A slow aurora behind the whole app (GPU transforms only). */
  livingBackground: boolean;
  motionStyle: "calm" | "responsive" | "expressive";
}
const KEY = "shuacrew.look";
export const DEFAULT_LOOK: LookPrefs = { version: 1, uiFont: "geist", readingFont: "sans", monoFont: "jetbrains", ligatures: true, chatStyle: "bubbles", chatWidth: "default", timestamps: "hover", sounds: { approval: false, done: false, failed: false, volume: 0.4 }, customAccent: null, livingBackground: false, motionStyle: "responsive" };

export const FONT_STACK = {
  ui: { geist: `"Geist Variable", system-ui, sans-serif`, system: `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif` },
  reading: { sans: "inherit", serif: `"New York", ui-serif, Georgia, serif` },
  mono: { jetbrains: `"JetBrains Mono Variable", ui-monospace, monospace`, "sf-mono": `ui-monospace, "SF Mono", Menlo, monospace`, menlo: `Menlo, ui-monospace, monospace` },
} as const;
const WIDTH = { narrow: "680px", default: "780px", wide: "960px" } as const;

export function parseLook(value: unknown): LookPrefs {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pick = <T extends string>(k: string, opts: readonly T[], d: T): T => (opts.includes(v[k] as T) ? v[k] as T : d);
  const s = v.sounds && typeof v.sounds === "object" ? v.sounds as Record<string, unknown> : {};
  const vol = typeof s.volume === "number" && s.volume >= 0 && s.volume <= 1 ? s.volume : DEFAULT_LOOK.sounds.volume;
  return {
    version: 1, uiFont: pick("uiFont", ["geist", "system"], "geist"), readingFont: pick("readingFont", ["sans", "serif"], "sans"),
    monoFont: pick("monoFont", ["jetbrains", "sf-mono", "menlo"], "jetbrains"), ligatures: v.ligatures !== false,
    chatStyle: pick("chatStyle", ["document", "bubbles"], "bubbles"), chatWidth: pick("chatWidth", ["narrow", "default", "wide"], "default"),
    timestamps: pick("timestamps", ["hover", "always"], "hover"),
    sounds: { approval: s.approval === true, done: s.done === true, failed: s.failed === true, volume: vol },
    customAccent: typeof v.customAccent === "string" && /^#[0-9a-f]{6}$/i.test(v.customAccent) ? v.customAccent.toLowerCase() : null,
    livingBackground: v.livingBackground === true,
    motionStyle: pick("motionStyle", ["calm", "responsive", "expressive"], "responsive"),
  };
}

/** Write the look onto the document root as CSS variables and data attributes. */
export function applyLook(p: LookPrefs, root: HTMLElement = document.documentElement) {
  // At a default, write nothing: the app's own tokens stay exactly as they were.
  const set = (name: string, value: string | null) => (value === null ? root.style.removeProperty(name) : root.style.setProperty(name, value));
  set("--font-ui", p.uiFont === DEFAULT_LOOK.uiFont ? null : FONT_STACK.ui[p.uiFont]);
  set("--font-mono", p.monoFont === DEFAULT_LOOK.monoFont ? null : FONT_STACK.mono[p.monoFont]);
  set("--font-reading", p.readingFont === DEFAULT_LOOK.readingFont ? null : FONT_STACK.reading[p.readingFont]);
  set("--chat-width", p.chatWidth === DEFAULT_LOOK.chatWidth ? null : WIDTH[p.chatWidth]);
  // One accent, from the theme: clear any custom accent an older version left inline.
  set("--amber", null); set("--amber-soft", null); set("--on-accent", null);
  root.dataset.motionStyle = p.motionStyle;
  root.dataset.living = p.livingBackground ? "on" : "off";
  root.dataset.ligatures = p.ligatures ? "on" : "off";
  root.dataset.chatStyle = p.chatStyle;
  root.dataset.timestamps = p.timestamps;
}

function load() { try { return parseLook(JSON.parse(localStorage.getItem(KEY) ?? "null")); } catch { return parseLook(null); } }
let current = load();
if (typeof document !== "undefined") applyLook(current);
const listeners = new Set<() => void>();
export function getLook() { return current; }
export function saveLook(patch: Partial<LookPrefs>): boolean {
  current = parseLook({ ...current, ...patch, sounds: { ...current.sounds, ...(patch.sounds ?? {}) } });
  applyLook(current);
  let saved = true;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { saved = false; }
  listeners.forEach((l) => l());
  return saved;
}
export function useLook() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current); }

/** Relative luminance (WCAG) of #rrggbb. */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string) { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); }
