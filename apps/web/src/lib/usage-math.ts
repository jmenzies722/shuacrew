/**
 * Turns the gateway's hourly usage (UTC hour starts) into what Usage draws, in this Mac's own time zone: days that
 * start at your midnight, the week by hour, the last 24 hours, and what a usual day looks like.
 */
import type { HourBucket } from "@shuacrew/core/observability";
import { median } from "./charts";

const HOUR = 3_600_000;
export const startOfLocalDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Calendar arithmetic, so a daylight-saving change never makes a day 23 or 25 hours long. */
export const addLocalDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const tokens = (h: HourBucket, provider?: string) => (provider ? h.byProvider[provider] ?? 0 : Object.values(h.byProvider).reduce((s, v) => s + v, 0));

export interface DaySeries {
  /** Local midnights, oldest first; the last one is today. */
  xs: number[];
  /** Providers, heaviest first (the heaviest is drawn at the bottom of a stack). */
  providers: string[];
  values: Record<string, number[]>;
  /** Whether anything at all was recorded that day (no record is not the same as zero use). */
  known: boolean[];
  totals: number[];
}

export function localDays(hours: readonly HourBucket[], days: number, now: number): DaySeries {
  const today = startOfLocalDay(now);
  const xs = Array.from({ length: Math.max(1, days) }, (_, i) => addLocalDays(today, i - Math.max(1, days) + 1));
  const index = new Map(xs.map((x, i) => [x, i]));
  const sums = new Map<string, number>();
  for (const h of hours) for (const [p, v] of Object.entries(h.byProvider)) sums.set(p, (sums.get(p) ?? 0) + v);
  const providers = [...sums.keys()].sort((a, b) => sums.get(b)! - sums.get(a)! || a.localeCompare(b));
  const values: Record<string, number[]> = Object.fromEntries(providers.map((p) => [p, xs.map(() => 0)]));
  const known = xs.map(() => false);
  for (const h of hours) {
    const i = index.get(startOfLocalDay(h.at));
    if (i === undefined) continue;
    known[i] = true;
    for (const [p, v] of Object.entries(h.byProvider)) values[p]![i]! += v;
  }
  const totals = xs.map((_, i) => providers.reduce((s, p) => s + values[p]![i]!, 0));
  return { xs, providers, values, known, totals };
}

/** Seven rows (Monday first) by 24 local hours. */
export function rhythm(hours: readonly HourBucket[], provider?: string): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const h of hours) { const d = new Date(h.at); grid[(d.getDay() + 6) % 7]![d.getHours()]! += tokens(h, provider); }
  return grid;
}

/** The single busiest weekday-and-hour, or null when nothing was recorded. */
export function busiest(grid: number[][]): { day: number; hour: number; value: number } | null {
  let best: { day: number; hour: number; value: number } | null = null;
  grid.forEach((row, day) => row.forEach((value, hour) => { if (value > 0 && (!best || value > best.value)) best = { day, hour, value }; }));
  return best;
}

/** Tokens in each of the last n clock hours, ending with the current (partial) hour. */
export function lastHours(hours: readonly HourBucket[], now: number, n = 24, provider?: string): number[] {
  const end = Math.floor(now / HOUR) * HOUR, out = new Array<number>(n).fill(0);
  for (const h of hours) { const i = n - 1 - Math.round((end - h.at) / HOUR); if (i >= 0 && i < n) out[i]! += tokens(h, provider); }
  return out;
}

/** A usual day: the median of the days before today that recorded anything (a quiet or wild day doesn't skew it). */
export function usualDay(series: DaySeries, provider?: string): number {
  const days = series.xs.map((_, i) => i).slice(0, -1).filter((i) => series.known[i]);
  return median(days.map((i) => (provider ? series.values[provider]?.[i] ?? 0 : series.totals[i]!)));
}

/** How today compares, in words a person would use. */
export function versusUsual(today: number, usual: number): string {
  if (!usual) return today ? "First busy day on record" : "Nothing yet today";
  const r = today / usual;
  return r >= 1.25 ? `${r >= 10 ? Math.round(r) : r.toFixed(1)}× a usual day` : r >= 0.8 ? "About a usual day" : today ? "Quieter than usual" : "Nothing yet today";
}
