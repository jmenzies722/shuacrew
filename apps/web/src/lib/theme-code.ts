import { normalizeAppearance, type Appearance } from "./appearance";
import { parseLook, type LookPrefs } from "./look";

/** Share your look as a short code: palette, accent, fonts, conversation style. Never anything private. */
const PICK_APPEARANCE = ["palette", "dark", "light", "accent", "density", "reading"] as const;
const PICK_LOOK = ["uiFont", "readingFont", "monoFont", "ligatures", "chatStyle", "chatWidth", "customAccent", "livingBackground"] as const;

export function encodeTheme(a: Appearance, l: LookPrefs): string {
  const payload = { a: Object.fromEntries(PICK_APPEARANCE.map((k) => [k, a[k]])), l: Object.fromEntries(PICK_LOOK.map((k) => [k, l[k]])) };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `SHUA1-${b64}`;
}
/** Decode through the same validators the app uses, so a code can only ever set valid values. */
export function decodeTheme(code: string, current: { appearance: Appearance; look: LookPrefs }): { appearance: Appearance; look: LookPrefs } {
  const m = /^SHUA1-([A-Za-z0-9_-]+)$/.exec(code.trim());
  if (!m) throw new Error("That isn't a ShuaCrew theme code (they start with SHUA1-).");
  let payload: { a?: Record<string, unknown>; l?: Record<string, unknown> };
  try { payload = JSON.parse(decodeURIComponent(escape(atob(m[1]!.replace(/-/g, "+").replace(/_/g, "/"))))); } catch { throw new Error("That theme code is damaged."); }
  const a = Object.fromEntries(Object.entries(payload.a ?? {}).filter(([k]) => (PICK_APPEARANCE as readonly string[]).includes(k)));
  const l = Object.fromEntries(Object.entries(payload.l ?? {}).filter(([k]) => (PICK_LOOK as readonly string[]).includes(k)));
  return { appearance: normalizeAppearance({ ...current.appearance, ...a }), look: parseLook({ ...current.look, ...l }) };
}
