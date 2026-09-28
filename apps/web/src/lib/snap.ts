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
export interface Region { x: number; y: number; w: number; h: number; shape: RegionShape; exact: boolean }
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
