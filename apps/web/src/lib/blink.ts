/**
 * Every robot on screen blinks together, now and then: one short animation on a timer instead of an endless
 * keyframe loop (which kept WebKit drawing every frame between blinks). Skips while ShuaCrew rests in the
 * background (data-idle), when the page is hidden, and with reduced motion.
 */
let started = false;
export function startBlinking(root: HTMLElement = document.documentElement) {
  if (started || typeof window === "undefined") return;
  started = true;
  const calm = () => root.dataset.idle !== undefined || root.dataset.motion === "reduced" || document.visibilityState !== "visible" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const blink = () => {
    if (!calm()) { root.dataset.blink = ""; setTimeout(() => { delete root.dataset.blink; }, 240); }
    setTimeout(blink, 3500 + Math.random() * 3000); // irregular, like a person, not a metronome
  };
  setTimeout(blink, 2000 + Math.random() * 2000);
}
