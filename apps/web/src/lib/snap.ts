import type { ScreenContext, ScreenLine } from "./buddy";

/**
 * Precise highlights: the model draws its box from a scaled-down screenshot, so it's close but rarely exact. Before
 * Spark shows it, snap it to something real on screen — an accessibility control (exact frame) or an OCR text line
 * (exact box) — preferring the one its label names, nearest to where the model aimed. No good match: keep the model's.
 */
export interface Box { x: number; y: number; w: number; h: number }
type Candidate = Box & { name: string; control: boolean };

const words = (s: string) => s.toLowerCase().replace(/[“”"'‘’]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
const STOP = new Set(["click", "tap", "press", "the", "a", "an", "on", "in", "to", "here", "button", "this", "that", "then", "and", "open", "select", "choose", "go", "at", "of", "for", "your", "it", "field", "menu", "icon", "link", "tab"]);

/** How well a label names a candidate: 1 = every word of its name is in the label (or a quoted phrase is the name). */
export function nameMatch(label: string, name: string): number {
  const quoted = label.match(/[“"']([^”"']{2,60})[”"']/)?.[1]?.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (quoted && (n === quoted || n.startsWith(quoted))) return 1;
  const nw = words(name).filter((w) => !STOP.has(w)), lw = new Set(words(label).filter((w) => !STOP.has(w)));
  if (!nw.length || !lw.size) return 0;
  return nw.filter((w) => lw.has(w)).length / Math.max(nw.length, Math.min(lw.size, 4));
}

export function snapBox(target: Box & { label: string }, screen: { text?: ScreenLine[]; context?: ScreenContext } | null): Box {
  if (!screen) return target;
  const cands: Candidate[] = [
    ...(screen.context?.elements ?? []).filter((e) => e.w && e.h).map((e) => ({ name: e.name, control: true, x: e.x - e.w! / 2, y: e.y - e.h! / 2, w: e.w!, h: e.h! })),
    ...(screen.text ?? []).map((l) => ({ name: l.t, control: false, x: l.x - l.w / 2, y: l.y - l.h / 2, w: l.w, h: l.h })),
  ].filter((c) => c.w > 0 && c.h > 0 && c.w < 0.6 && c.h < 0.4);
  const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
  let best: { c: Candidate; score: number } | null = null;
  for (const c of cands) {
    const d = Math.hypot(c.x + c.w / 2 - cx, c.y + c.h / 2 - cy);
    if (d > 0.3) continue;                                               // far from where the model aimed: not it
    const m = nameMatch(target.label, c.name);
    const inside = cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h;
    const score = m * 3 + (inside ? 1 : 0) + (c.control ? 0.25 : 0) - d * 4;
    if (m === 0 && !inside) continue;                                    // neither named nor under the aim
    if (!best || score > best.score) best = { c, score };
  }
  if (!best) return target;
  const pad = 0.004;
  return { x: Math.max(0, best.c.x - pad), y: Math.max(0, best.c.y - pad), w: Math.min(1, best.c.w + pad * 2), h: Math.min(1, best.c.h + pad * 2) };
}

/** The exact box of a picked item ("#12" → the 12th control, "T40" → text line 40), or null if it isn't on that screen. */
export function resolveTarget(target: string | undefined, screen: { text?: ScreenLine[]; context?: ScreenContext } | null): Box | null {
  if (!target || !screen) return null;
  const n = Number(target.slice(1)), pad = 0.004;
  const box = target.startsWith("#")
    ? (() => { const e = screen.context?.elements?.[n - 1]; return e?.w && e.h ? { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h } : e ? { x: e.x - 0.02, y: e.y - 0.015, w: 0.04, h: 0.03 } : null; })()
    : (() => { const l = screen.text?.[n]; return l ? { x: l.x - l.w / 2, y: l.y - l.h / 2, w: l.w, h: l.h } : null; })();
  return box ? { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), w: Math.min(1, box.w + pad * 2), h: Math.min(1, box.h + pad * 2) } : null;
}
