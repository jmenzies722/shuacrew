import type { Act } from "./buddy";
import { reacquire, systemWide, type ScreenFacts } from "./snap";
/** Rebind a proposed step to current evidence. Never turn an uncertain point into a click. */
export function freshAction(action: Act, before: (ScreenFacts & { display?: number }) | null, current: ScreenFacts & { display?: number }): Act {
  if (("screen" in action && action.screen !== undefined && action.screen !== 1) || (before?.display !== undefined && before.display !== current.display)) throw new Error("The target display changed or is a secondary display without verified app identity. Move the app to the primary observed display and look again.");
  const anyApp = (action.type === "click" || action.type === "press") && systemWide(action.target, before);
  if (!anyApp && (!before?.context?.app || !current.context?.app || before.context.app !== current.context.app || before.context.window !== current.context.window)) throw new Error("The app or window changed. Look again and confirm the next step.");
  if (action.type !== "click" && action.type !== "press") return action;
  // Named accessibility presses can report success without activating a control.
  // Resolve the unique current target, then dispatch an actual click at that control.
  // A press has no position of its own; a click by position can settle a same-name tie by where it aimed.
  const aim = action.type === "press" ? {label:action.label,x:0,y:0,w:.03,h:.03,...(action.target ? {target:action.target} : {})} : {...action,w:.03,h:.03};
  const target = reacquire(aim, before, current, action.type === "click" && !action.target);
  if (!target) throw new Error("The click target is missing or ambiguous. No click was sent; look again.");
  // By number, the step carries the control's own name, so what ran is reported as what it was ("Clicked “ShuaCrew”").
  return { ...action, type:"click", x: target.x, y: target.y, label: action.label || target.name || "" };
}
export async function prepareFreshAction(action: Act, before: (ScreenFacts & { display?: number }) | null, capture: () => Promise<ScreenFacts & { display?: number }>, active: () => boolean): Promise<Act> {
  if (!active()) throw new Error("Stopped before observing.");
  const current = await capture();
  if (!active()) throw new Error("Stopped or access revoked while observing. No action sent.");
  return freshAction(action, before, current);
}
