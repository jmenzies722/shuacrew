/** "Your week on autopilot": when each routine and schedule fires over the next seven days, at a glance. */
import { Bot, Terminal } from "lucide-react";
import { autopilotWeek } from "../lib/autopilot-week";

type S = Parameters<typeof autopilotWeek>[0][number];
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function AutopilotWeek({ schedules }: { schedules: S[] }) {
  const week = autopilotWeek(schedules);
  const total = week.reduce((n, d) => n + d.runs.length, 0);
  return <section className="aw" aria-label="Your week on autopilot">
    <header><div><h2>Your week on autopilot</h2><small>{total ? `${total} run${total === 1 ? "" : "s"} over the next 7 days, while you do something else` : "Nothing scheduled yet: turn on a routine below and it shows up here"}</small></div></header>
    <div className="aw-days">{week.map((d) => <div key={d.key} className={`aw-day${d.today ? " is-today" : ""}${d.runs.length ? "" : " is-empty"}`}>
      <span className="aw-label">{d.label}</span>
      <div className="aw-runs">{d.runs.slice(0, 4).map((r) => <span key={r.id} className={`aw-run${r.script ? " is-script" : ""}`} title={r.ask ?? r.name}>
        {r.script ? <Terminal size={11} /> : <Bot size={11} />}<b>{hhmm(r.at)}</b><em>{r.name}</em>
      </span>)}{d.runs.length > 4 && <span className="aw-more">+{d.runs.length - 4} more</span>}</div>
    </div>)}</div>
  </section>;
}
