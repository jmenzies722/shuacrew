import { useSyncExternalStore } from "react";
/** Every action Spark takes, kept on this Mac: what it tried, whether it worked. Measures how well it's doing for you. */
/** did: an action it took · saw: a screenshot, live watching or your selection · heard: what it transcribed. */
export interface LogEntry { at: number; label: string; ok: boolean; message: string; kind?: "did" | "saw" | "heard" }
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
/** What Spark sensed, for the privacy view: never the image or audio itself, just that it happened and when. */
export function logSense(kind: "saw" | "heard", label: string, message = "") { logAction({ kind, label, ok: true, message: message.slice(0, 280) }); }
/** Forget everything in Spark's log on this Mac. */
export function clearSparkLog() { entries = []; try { localStorage.removeItem(KEY); } catch { /* ignore */ } listeners.forEach((l) => l()); }
export function useSparkLog() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => entries, () => entries); }
export function summary(list: LogEntry[], since = Date.now() - 7 * 86_400_000) {
  const recent = list.filter((e) => e.at >= since), ok = recent.filter((e) => e.ok).length;
  return { total: recent.length, ok, rate: recent.length ? Math.round((ok / recent.length) * 100) : null };
}
