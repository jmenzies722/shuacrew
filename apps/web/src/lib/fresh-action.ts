import type { Act } from "./buddy";
import { reacquire, type ScreenFacts } from "./snap";
/** Rebind a proposed step to current evidence. Never turn an uncertain point into a click. */
export function freshAction(action: Act, before: (ScreenFacts & { display?: number }) | null, current: ScreenFacts & { display?: number }): Act {
  if (("screen" in action && action.screen !== undefined && action.screen !== 1) || (before?.display !== undefined && before.display !== current.display)) throw new Error("The target display changed or is a secondary display without verified app identity. Move the app to the primary observed display and look again.");
  if (!before?.context?.app || !current.context?.app || before.context.app !== current.context.app || before.context.window !== current.context.window) throw new Error("The app or window changed. Look again and confirm the next step.");
  if (action.type !== "click") return action;
  const target = reacquire({ ...action, w: .03, h: .03 }, before, current);
  if (!target) throw new Error("The click target is missing or ambiguous. No click was sent; look again.");
  return { ...action, x: target.x, y: target.y };
}
export async function prepareFreshAction(action: Act, before: (ScreenFacts & { display?: number }) | null, capture: () => Promise<ScreenFacts & { display?: number }>, active: () => boolean): Promise<Act> {
  if (!active()) throw new Error("Stopped before observing.");
  const current = await capture();
  if (!active()) throw new Error("Stopped or access revoked while observing. No action sent.");
  return freshAction(action, before, current);
}
