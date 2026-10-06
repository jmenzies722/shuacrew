/** The next seven days of automation: every scheduled run that isn't paused, bucketed by local day, in time order. */
export interface WeekRun { id: string; name: string; at: number; ask?: string; script?: boolean }
export interface WeekDay { key: string; label: string; today: boolean; runs: WeekRun[] }

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function autopilotWeek(schedules: Array<{ id: string; name: string; paused: boolean; next: number[]; ask?: string; script?: string }>, now = Date.now()): WeekDay[] {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i);
    return { key: dayKey(d.getTime()), label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short" }), today: i === 0, runs: [] };
  });
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const s of schedules) {
    if (s.paused) continue;
    for (const at of s.next) {
      if (at < now) continue;
      byKey.get(dayKey(at))?.runs.push({ id: `${s.id}:${at}`, name: s.name, at, ask: s.ask, script: !!s.script });
    }
  }
  for (const d of days) d.runs.sort((a, b) => a.at - b.at);
  return days;
}
