import { useSyncExternalStore } from "react";
/** Every action Spark takes, kept on this Mac: what it tried, whether it worked. Measures how well it's doing for you. */
export interface LogEntry { at: number; label: string; ok: boolean; message: string }
const KEY = "shuacrew.spark.log";
const listeners = new Set<() => void>();
const load = (): LogEntry[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.slice(-200) : []; } catch { return []; } };
let entries = load();
export function logAction(e: Omit<LogEntry, "at">) {
  entries = [...entries, { ...e, at: Date.now() }].slice(-200);
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { entries = load(); listeners.forEach((l) => l()); } });
export function useSparkLog() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => entries, () => entries); }
export function summary(list: LogEntry[], since = Date.now() - 7 * 86_400_000) {
  const recent = list.filter((e) => e.at >= since), ok = recent.filter((e) => e.ok).length;
  return { total: recent.length, ok, rate: recent.length ? Math.round((ok / recent.length) * 100) : null };
}
