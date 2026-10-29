/**
 * How long the hovered island waits after the pointer leaves before it tucks back. Short, because leaving should feel
 * immediate; not zero, because the Mac app's hover zone already forgives a 14 pt overshoot and a quick slip back in
 * should keep it open. (It was 450 ms: long enough to read as lag.)
 */
export const NOTCH_LEAVE_GRACE_MS = 260;

export function scheduleNotchClose(close: () => void, dragging: () => boolean) {
  let timer: ReturnType<typeof setTimeout>;
  const attempt = () => {
    if (dragging()) { timer = setTimeout(attempt, 100); return; }
    close();
  };
  timer = setTimeout(attempt, NOTCH_LEAVE_GRACE_MS);
  return () => clearTimeout(timer);
}
