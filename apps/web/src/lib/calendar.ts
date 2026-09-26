import { useEffect, useState } from "react";

export interface DayEvent { title: string; start: number; end: number; allDay: boolean }
type Native = { postMessage(m: unknown): void };
const native = () => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;

/** Today's meetings from your Mac's calendar (read locally by the app, only after you allow it). */
export function useDayCalendar() {
  const [state, setState] = useState<{ authorized: boolean; events: DayEvent[] } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<{ authorized: boolean; events: DayEvent[] }>).detail);
    window.addEventListener("shuacrew:calendar", on);
    native()?.postMessage({ type: "buddyCalendar" });
    const t = setInterval(() => native()?.postMessage({ type: "buddyCalendar" }), 5 * 60_000);
    return () => { window.removeEventListener("shuacrew:calendar", on); clearInterval(t); };
  }, []);
  return { state, available: !!native(), connect: () => native()?.postMessage({ type: "buddyCalendar", ask: true }) };
}

/** The meetings that matter for planning: timed (not all-day) ones that haven't ended. */
export function upcoming(events: DayEvent[], now = Date.now()) { return events.filter((e) => !e.allDay && e.end > now); }
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
