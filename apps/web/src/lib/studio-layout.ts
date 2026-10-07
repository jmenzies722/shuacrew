/**
 * The 3D Studio floor's geometry, in floor pixels (a WORLD.w × WORLD.d plane seen through a tilted camera): where each
 * agent's desk sits, where the agent stands for what it's doing, and the camera's limits. Pure, so it's tested.
 */
export const WORLD = { w: 1000, d: 900 } as const;
/** Your command platform, front and centre. */
export const HUB = { x: 500, y: 770 } as const;

export interface Desk { x: number; y: number }
/** Rows of desks behind your platform, back row first, each row centred. Up to four a row; 5–6 sit in rows of three. */
export function deskLayout(count: number): Desk[] {
  if (count <= 0) return [];
  const cols = count <= 4 ? count : count <= 6 ? 3 : 4, rows = Math.ceil(count / cols);
  const top = 140, bottom = 470, gap = rows === 1 ? 0 : (bottom - top) / (rows - 1);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols), inRow = row === rows - 1 ? count - row * cols : cols, col = i - row * cols;
    return { x: WORLD.w / 2 + (col - (inRow - 1) / 2) * 220, y: rows === 1 ? 330 : top + row * gap };
  });
}

export type FloorState = "working" | "waiting" | "queued" | "failed" | "recent" | "idle";
/**
 * Where an agent stands: at its desk while it works, rests or is queued; at your platform while it waits on you or
 * brings back finished work — visitors gather in an arc behind it, facing you, so no two stand (or talk) over each other.
 */
export function spotFor(state: FloorState, desk: Desk, visitor: number, visitors: number): { x: number; y: number; at: "desk" | "you" } {
  if (state === "waiting" || state === "recent") {
    const step = visitors > 1 ? Math.min(42, 150 / (visitors - 1)) : 0, a = ((-90 + (visitor - (visitors - 1) / 2) * step) * Math.PI) / 180;
    return { x: Math.round(HUB.x + Math.cos(a) * 165), y: Math.round(HUB.y + Math.sin(a) * 140), at: "you" };
  }
  // Beside its desk and a step forward, facing you: in full view, never hidden behind the screen it's working on.
  return { x: desk.x + 92, y: desk.y + 10, at: "desk" };
}

export interface Camera { spin: number; tilt: number; zoom: number }
export const CAMERA: Camera = { spin: -14, tilt: 56, zoom: 1 };
export const VIEWS: Record<"studio" | "above" | "low", Camera> = { studio: CAMERA, above: { spin: 0, tilt: 18, zoom: 0.95 }, low: { spin: -26, tilt: 68, zoom: 1.12 } };
/** Keep the camera where the room still reads: tilted 10–74°, spun freely (kept within ±180), zoomed 0.6–1.6×. */
export function clampCamera(c: Camera): Camera {
  const spin = ((((c.spin + 180) % 360) + 360) % 360) - 180;
  return { spin: Math.round(spin * 10) / 10, tilt: Math.min(74, Math.max(10, c.tilt)), zoom: Math.min(1.6, Math.max(0.6, c.zoom)) };
}
