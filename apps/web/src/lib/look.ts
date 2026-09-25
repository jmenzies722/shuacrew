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
}
const KEY = "shuacrew.look";
export const DEFAULT_LOOK: LookPrefs = { version: 1, uiFont: "geist", readingFont: "sans", monoFont: "jetbrains", ligatures: true, chatStyle: "bubbles", chatWidth: "default", timestamps: "hover", sounds: { approval: false, done: false, failed: false, volume: 0.4 } };

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
