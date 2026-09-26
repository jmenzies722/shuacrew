import { localDay } from "./morning";

/** What you talked to Spark about today — kept on this Mac, only today's, so a new conversation still knows "earlier". */
const KEY = "shuacrew.spark.today";
interface Day { day: string; asks: Array<{ at: number; q: string }> }
const read = (): Day => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Day | null; return v && v.day === localDay(new Date()) ? v : { day: localDay(new Date()), asks: [] }; } catch { return { day: localDay(new Date()), asks: [] }; } };

export function rememberAsk(q: string, now = Date.now()) {
  const text = q.split("\n\n[")[0]!.trim().slice(0, 200);
  if (text.length < 4) return;
  const d = read(); d.asks = [...d.asks.filter((a) => a.q !== text), { at: now, q: text }].slice(-12);
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
/** Earlier today, for Spark's prompt (empty on a fresh day). */
export function earlierToday(): string {
  const d = read();
  if (!d.asks.length) return "";
  const t = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return ["EARLIER TODAY the user asked you (use it when they refer back — \"that thing from earlier\"; don't bring it up otherwise):", ...d.asks.map((a) => `- ${t(a.at)}: ${a.q}`)].join("\n");
}
