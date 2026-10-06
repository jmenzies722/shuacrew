import type { ScreenContext, ScreenLine } from "./buddy";

/**
 * Precise highlights. The model aims from a scaled-down screenshot, so its box is close but rarely exact. Before
 * Spark shows anything, `locate` turns the aim into the real thing on screen — a numbered item it picked ("#12", "T40"),
 * else the control or text line its label names nearest the aim — and says what shape that thing is, so the
 * highlight hugs it: a circle for toggles and round icons, a pill for buttons and fields, a soft box for text.
 *
 * Everything here is CENTRE-based (x,y = centre, w,h = size, as fractions of the screen), like the drawing code on
 * the Mac side. Mixing centre and top-left once shifted every highlight by half its size.
 */
export type RegionShape = "circle" | "pill" | "rounded";
export interface Region { x: number; y: number; w: number; h: number; shape: RegionShape; exact: boolean; /** What it is, when re-identified. */ name?: string }
export interface Aim { x: number; y: number; w: number; h: number; label: string; target?: string }
export interface ScreenFacts { text?: ScreenLine[]; context?: ScreenContext; aspect?: number }
type Candidate = { x: number; y: number; w: number; h: number; name: string; role?: string };

const ROUND_ROLES = new Set(["checkbox", "radiobutton", "switch", "disclosuretriangle", "colorwell", "menuextra"]);
const PILL_ROLES = new Set(["button", "popupbutton", "menubutton", "searchfield", "textfield", "combobox", "tab", "link", "menubaritem", "slider"]);

/** What a highlight around this thing should look like: its shape, from its role and its real proportions. */
export function shapeOf(c: { w: number; h: number; role?: string }, aspect = 16 / 10): RegionShape {
  const ratio = (c.w * aspect) / c.h; // width ÷ height in real pixels
  if (c.role === "dockitem") return "rounded";                              // app icons are rounded squares
  if (c.role && ROUND_ROLES.has(c.role)) return "circle";
  if (c.role && ratio > 0.75 && ratio < 1.33 && c.h < 0.06) return "circle";   // a round or square icon button
  if (c.role && (PILL_ROLES.has(c.role) || ratio > 2.2)) return "pill";
  return "rounded";                                                          // text, regions, anything else
}

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

function candidates(screen: ScreenFacts): Candidate[] {
  return [
    ...(screen.context?.elements ?? []).filter((e) => e.w && e.h).map((e) => ({ x: e.x, y: e.y, w: e.w!, h: e.h!, name: e.name, role: e.role })),
    ...(screen.text ?? []).map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h, name: l.t })),
  ].filter((c) => c.w > 0 && c.h > 0 && c.w < 0.6 && c.h < 0.4);
}

/** A picked item: "#12" is the 12th control, "T40" is text line 40 (from the numbered lists Spark was given). */
function picked(target: string | undefined, screen: ScreenFacts): Candidate | null {
  if (!target) return null;
  const n = Number(target.slice(1));
  if (target.startsWith("#")) {
    const e = screen.context?.elements?.[n - 1];
    return e ? { x: e.x, y: e.y, w: e.w ?? 0.04, h: e.h ?? 0.03, name: e.name, role: e.role } : null;
  }
  const l = screen.text?.[n];
  return l ? { x: l.x, y: l.y, w: l.w, h: l.h, name: l.t } : null;
}

/** Turn where Spark aimed into the exact thing on screen, and its shape. Nothing real nearby: keep the aim, softly. */
export function locate(aim: Aim, screen: ScreenFacts | null): Region {
  const guess: Region = { x: aim.x, y: aim.y, w: aim.w, h: aim.h, shape: "rounded", exact: false };
  if (!screen) return guess;
  const aspect = screen.aspect ?? 16 / 10, found = picked(aim.target, screen);
  if (found) return { x: found.x, y: found.y, w: found.w, h: found.h, shape: shapeOf(found, aspect), exact: true };
  let best: { c: Candidate; score: number } | null = null;
  for (const c of candidates(screen)) {
    const d = Math.hypot(c.x - aim.x, c.y - aim.y);
    if (d > 0.3) continue;                                               // far from where it aimed: not it
    const m = nameMatch(aim.label, c.name);
    const inside = Math.abs(aim.x - c.x) <= c.w / 2 && Math.abs(aim.y - c.y) <= c.h / 2;
    if (m === 0 && !inside) continue;                                    // neither named nor under the aim
    const score = m * 3 + (inside ? 1 : 0) + (c.role ? 0.25 : 0) - d * 4;
    if (!best || score > best.score) best = { c, score };
  }
  return best ? { x: best.c.x, y: best.c.y, w: best.c.w, h: best.c.h, shape: shapeOf(best.c, aspect), exact: true } : guess;
}

/**
 * Two controls with the same name (two "Reply" buttons): take the one still where it was picked or aimed — only when it
 * barely moved and the other is clearly farther. Anything less certain stays ambiguous and no click is sent.
 */
function nearest(list: Candidate[], anchor: { x: number; y: number } | null): Candidate | null {
  if (!anchor || list.length < 2) return null;
  const ranked = list.map((c) => ({ c, d: Math.hypot(c.x - anchor.x, c.y - anchor.y) })).sort((a, b) => a.d - b.d);
  return ranked[0]!.d <= 0.04 && ranked[1]!.d >= ranked[0]!.d + 0.05 ? ranked[0]!.c : null;
}

/** Re-identify a target after a fresh capture. Numbered IDs belong only to their original capture. */
export function reacquire(aim: Aim, before: ScreenFacts | null, current: ScreenFacts, aimed = false): Region | null {
  if (before?.context?.app && current.context?.app !== before.context.app) return null;
  if (before?.context?.window && current.context?.window !== before.context.window) return null;
  const original = before ? picked(aim.target, before) : null;
  if (aim.target && before && !original) return null;
  const name = original?.name || aim.label;
  if (!name.trim()) return null;
  const all = candidates(current).filter(c => c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1);
  // Prefer accessibility controls; OCR duplicates the same label and must not introduce a second target.
  const controls = all.filter(c => c.role && (!original?.role || c.role === original.role));
  const matching = (list: Candidate[]) => {
    const exact = list.filter(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    return exact.length ? exact : list.filter(c => nameMatch(name, c.name) === 1);
  };
  const ax = matching(controls), matches = ax.length ? ax : matching(all.filter(c => !c.role));
  const c = matches.length === 1 ? matches[0]! : nearest(matches, original ?? (aimed ? aim : null));
  if (!c) return null;
  return { x:c.x, y:c.y, w:c.w, h:c.h, shape:shapeOf(c,current.aspect), exact:true, name:c.name };
}
