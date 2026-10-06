import { useMemo } from "react";
import { crewPerformance } from "../lib/crew-performance";
import type { CrewMember, RunView } from "@shuacrew/core";

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const mins = (m: number | null) => (m === null ? "—" : m < 1 ? "<1 min" : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

/** Crew performance review: how each member is really doing, from their own sessions. */
export function CrewPerformance({ members, runs, lessons }: { members: CrewMember[]; runs: Record<string, RunView>; lessons: Record<string, number> }) {
  const rows = useMemo(() => crewPerformance(members.map((m) => m.id), Object.values(runs) as never, lessons), [members, runs, lessons]);
  const any = rows.some((r) => r.finished || r.failed);
  // A table of zeros is clutter: the review appears with the first finished (or failed) session.
  if (!any) return null;
  return <section className="crew-perf" aria-label="Crew performance">
    <header><strong>Performance review</strong><span>{any ? "From each member's own sessions — Shua chats and learning don't count." : "Numbers appear here once your crew finishes sessions."}</span></header>
    <div className="crew-perf-table" role="table">
      <div role="row" className="is-head"><span role="columnheader">Member</span><span role="columnheader">Finished</span><span role="columnheader">Failed</span><span role="columnheader">Success</span><span role="columnheader">Typical time</span><span role="columnheader">Tokens</span><span role="columnheader">Lessons</span></div>
      {rows.map((r) => { const m = members.find((x) => x.id === r.member)!; return <div role="row" key={r.member}>
        <span role="cell"><i style={{ background: m.color }} />{m.name}<small>{m.role}</small></span>
        <span role="cell">{r.finished}</span><span role="cell" className={r.failed ? "is-bad" : ""}>{r.failed}</span>
        <span role="cell">{r.successRate === null ? "—" : `${r.successRate}%`}</span><span role="cell">{mins(r.medianMinutes)}</span>
        <span role="cell">{tokens(r.tokens)}</span><span role="cell">{r.lessons}</span>
      </div>; })}
    </div>
  </section>;
}
