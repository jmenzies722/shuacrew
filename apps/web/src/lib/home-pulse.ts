/**
 * Home's three numbers, worked out from what the gateway recorded — nothing estimated, nothing invented:
 * Intelligence (which brain answers and what it has learned), Autopilot (what runs next on its own and how the last
 * day went) and Speed (how fast Shua starts talking, and how often its on-screen steps work). Pure, for tests.
 */
export interface PulseSchedule { id: string; name: string; paused?: boolean; next: number[]; lastFired?: number; lastOk?: boolean }
export interface VoiceStats { count: number; p50: number | null }
export interface JournalStats { total: number; ok: number; rate: number | null }

/** The soonest run any active schedule will make, at or after now. */
export function nextAutopilot(schedules: PulseSchedule[], now = Date.now()): { name: string; at: number } | null {
  let best: { name: string; at: number } | null = null;
  for (const s of schedules) {
    if (s.paused) continue;
    const at = s.next.find((t) => t >= now);
    if (at !== undefined && (!best || at < best.at)) best = { name: s.name, at };
  }
  return best;
}

/** How the schedules that fired in the last day went (each schedule counts once: its most recent run). */
export function lastDay(schedules: PulseSchedule[], now = Date.now()): { ok: number; failed: number } {
  let ok = 0, failed = 0;
  for (const s of schedules) {
    if (s.lastFired === undefined || now - s.lastFired > 86_400_000 || s.lastOk === undefined) continue;
    if (s.lastOk) ok++; else failed++;
  }
  return { ok, failed };
}

/** "2:00 AM", or "Tomorrow 2:00 AM", or "Sat 2:00 AM": the day only when it isn't today. */
export function whenLabel(at: number, now = Date.now()): string {
  const time = new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(at) - day(now)) / 86_400_000);
  return days <= 0 ? time : days === 1 ? `Tomorrow ${time}` : `${new Date(at).toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/** A wait the way you'd say it: "480 ms" under a second, "2.7 s" above. */
export function msLabel(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** The shortest window (7, 30 or 90 days) that has voice samples, so the number is as recent as the data allows. */
export const SPEED_WINDOWS = [7, 30, 90] as const;
export function firstMeasured<T extends { count?: number; total?: number }>(byWindow: Array<[number, T | null]>): [number, T] | null {
  for (const [days, stats] of byWindow) if (stats && (stats.count ?? stats.total ?? 0) > 0) return [days, stats];
  return null;
}
