import { useSyncExternalStore } from "react";
/** Whether Spark's side panel is open in the app window. Remembered across launches. */
const KEY = "shuacrew.sparkPanel";
let open = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
const listeners = new Set<() => void>();
export function setSparkPanel(next: boolean) { open = next; try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* ignore */ } listeners.forEach((l) => l()); }
export function toggleSparkPanel() { setSparkPanel(!open); }
export function useSparkPanel() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => open, () => open); }

// A user-selected suggestion survives mounting the side panel. It never submits a turn.
let suggestion: string | null = null;
const suggestionListeners = new Set<() => void>();
export function suggestToSpark(text: string) {
  suggestion = text;
  setSparkPanel(true);
  suggestionListeners.forEach((notify) => notify());
}
export function takeSparkSuggestion() { const text = suggestion; suggestion = null; return text; }
export function watchSparkSuggestion(notify: () => void) {
  suggestionListeners.add(notify);
  return () => { suggestionListeners.delete(notify); };
}
