/**
 * Every button answers the moment you press it: on pointer-down it gives a little (smaller controls give more), and on
 * release it springs back. It runs on the `scale` property through the Web Animations API, so it composes with each
 * button's own transform and transitions instead of overriding them, and it never waits for React to render.
 */
const PRESSABLE = "button, summary, [role='button'], [role='radio'], [role='tab'], a[href], .isl-hero";

/** How far a control of this size gives: a 30 px icon button dips to .92, a wide card barely moves. */
export function pressDepth(width: number, height: number): number {
  return Math.max(0.92, Math.min(0.985, 1 - 7 / Math.max(width, height, 1)));
}

function reduced(): boolean {
  const motion = document.documentElement.dataset.motion;
  if (motion === "reduced") return true;
  if (motion === "full") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function installPress(root: HTMLElement | Document | null): () => void {
  if (!root || typeof Element === "undefined" || !("animate" in Element.prototype)) return () => {};
  let held: { el: HTMLElement; down: Animation; depth: number } | null = null;
  const release = () => {
    if (!held) return;
    const { el, down, depth } = held; held = null;
    const now = Number.parseFloat(getComputedStyle(el).scale) || depth;
    down.cancel();
    el.animate([{ scale: String(now) }, { scale: "1" }], { duration: 420, easing: "cubic-bezier(.3, 1.55, .5, 1)" });
  };
  const press = (event: Event) => {
    const e = event as PointerEvent;
    if (e.button !== 0 || reduced()) return;
    const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
    if (!el || (root !== document && !(root as HTMLElement).contains(el))) return;
    if (el.matches(":disabled, [aria-disabled='true']") || el.closest("[data-no-press]")) return;
    release();
    const box = el.getBoundingClientRect(), depth = pressDepth(box.width, box.height);
    const down = el.animate([{ scale: "1" }, { scale: String(depth) }], { duration: 90, easing: "cubic-bezier(.3, 0, .5, 1)", fill: "forwards" });
    held = { el, down, depth };
  };
  root.addEventListener("pointerdown", press, { passive: true });
  window.addEventListener("pointerup", release, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });
  window.addEventListener("blur", release);
  return () => {
    release();
    root.removeEventListener("pointerdown", press);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
    window.removeEventListener("blur", release);
  };
}
