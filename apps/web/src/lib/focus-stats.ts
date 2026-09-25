/** Minutes spent in Flow, per local day — counted while Flow is actually on (this device only). */
const KEY = "shuacrew.focusMinutes";
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function read(): Record<string, number> { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>; } catch { return {}; } }
export function addFocusMinute(now = new Date()) {
  const all = read(), k = day(now);
  all[k] = (all[k] ?? 0) + 1;
  const keep = Object.fromEntries(Object.entries(all).sort(([a], [b]) => b.localeCompare(a)).slice(0, 60));
  try { localStorage.setItem(KEY, JSON.stringify(keep)); } catch { /* ignore */ }
}
export function focusMinutes(days = 7, now = new Date()) {
  const all = read();
  return Array.from({ length: days }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (days - 1 - i)); return { day: day(d), minutes: all[day(d)] ?? 0 }; });
}
