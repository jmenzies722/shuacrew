export interface FocusTimer { startedAt: number; durationMs: number; pausedRemainingMs: number | null }
export function formatFocusRemaining(remaining: number): string {
  if (!Number.isFinite(remaining) || remaining <= 0) return "Focus complete";
  const seconds = Math.ceil(remaining / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function parseFocusTimer(value: unknown, now = Date.now()): FocusTimer | null {
  if (!value || typeof value !== "object") return null;
  const v = value as FocusTimer;
  if (!Number.isFinite(v.startedAt) || v.startedAt < 0 || v.startedAt > now || !Number.isFinite(v.durationMs) || v.durationMs <= 0 || v.durationMs > 3000000 || !(v.pausedRemainingMs === null || Number.isFinite(v.pausedRemainingMs) && v.pausedRemainingMs >= 0 && v.pausedRemainingMs <= v.durationMs)) return null;
  return { startedAt: v.startedAt, durationMs: v.durationMs, pausedRemainingMs: v.pausedRemainingMs };
}
export function remainingFocusMs(timer: FocusTimer, now: number): number {
  const safe = parseFocusTimer(timer, now);
  if (!safe) return 0;
  return safe.pausedRemainingMs ?? Math.max(0, Math.min(safe.durationMs, safe.durationMs - (now - safe.startedAt)));
}
export function startFocus(minutes: 15 | 25 | 50, now = Date.now()): FocusTimer { return { startedAt: now, durationMs: ([15, 25, 50].includes(minutes) ? minutes : 25) * 60000, pausedRemainingMs: null }; }
export function pauseFocus(timer: FocusTimer, now = Date.now()): FocusTimer { return { ...timer, pausedRemainingMs: remainingFocusMs(timer, now) }; }
export function resumeFocus(timer: FocusTimer, now = Date.now()): FocusTimer { return { ...timer, startedAt: now - (timer.durationMs - remainingFocusMs(timer, now)), pausedRemainingMs: null }; }
export function loadFocus(): FocusTimer | null { try { return parseFocusTimer(JSON.parse(localStorage.getItem("shuacrew.focus") ?? "null")); } catch { return null; } }
export function saveFocus(timer: FocusTimer | null): boolean { try { localStorage.setItem("shuacrew.focus", JSON.stringify(timer)); return true; } catch { return false; } }
