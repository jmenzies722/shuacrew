/** The sessions behind every number on Usage and Insights: searchable, paged 50 at a time, each row one click from its session. */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ObservedRun } from "@shuacrew/core/observability";
import { compact } from "../lib/charts";
import { plainTitle, providerName, providerTint, statusLabel, statusTone } from "../lib/providers-look";
import { Sheet } from "./ControlRoom";

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
};

export function RunsTable({ runs, total, offset, onOffset, mode, title, loading }: {
  runs: ObservedRun[]; total: number; offset: number; onOffset: (n: number) => void;
  /** "tokens" shows where usage went; "status" shows how the work went. */
  mode: "tokens" | "status"; title: string; loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = q ? runs.filter((r) => `${r.title} ${r.runtime} ${r.status} ${r.id}`.toLowerCase().includes(q)) : runs;
  const top = Math.max(1, ...runs.map((r) => r.inputTokens + r.outputTokens));
  return <Sheet title={title} hint={`${total.toLocaleString()} session${total === 1 ? "" : "s"}${mode === "tokens" ? " · heaviest first" : " · latest first"}`}
    actions={<input className="cr-search" type="search" placeholder="Filter this page…" aria-label="Filter sessions on this page" value={query} onChange={(e) => setQuery(e.target.value)} />}>
    {!runs.length ? <p className="cr-muted">{loading ? "Reading your sessions…" : "No sessions in this window."}</p> : <>
      <div className="cr-table-wrap"><table className="cr-table">
        <thead><tr><th>Session</th><th>Model</th><th>State</th>
          {mode === "tokens" ? <><th className="is-num">Input</th><th className="is-num">Output</th><th className="is-num">From cache</th><th style={{ width: "18%" }}>Share</th></> : <><th className="is-num">Tokens</th><th className="is-num">Last activity</th></>}
        </tr></thead>
        <tbody>{rows.map((r) => {
          const used = r.inputTokens + r.outputTokens, measured = r.usageRecords > 0;
          return <tr key={r.id}>
            <td><Link to="/sessions/$id" params={{ id: r.id }}>{plainTitle(r.title) || r.id}</Link>{mode === "tokens" && <small>{ago(r.updatedAt)}{r.room ? " · crew room" : ""}</small>}</td>
            <td><span className="cr-pill is-plain"><i className="cr-dot" style={{ background: providerTint(r.runtime) }} />{providerName(r.runtime)}</span></td>
            <td><span className={`cr-pill is-${statusTone(r.status)}`}>{statusLabel(r.status)}</span></td>
            {mode === "tokens" ? <>
              <td className="is-num">{measured ? compact(r.inputTokens) : "—"}</td>
              <td className="is-num">{measured ? compact(r.outputTokens) : "—"}</td>
              <td className="is-num">{measured ? compact(r.cacheTokens) : "—"}</td>
              <td><span className="cr-bar" title={measured ? `${used.toLocaleString()} tokens` : "No usage recorded"}><i style={{ width: `${(used / top) * 100}%`, ["--c" as string]: providerTint(r.runtime) }} /></span></td>
            </> : <>
              <td className="is-num" title={measured ? `${used.toLocaleString()} tokens` : "No usage recorded"}>{measured ? compact(used) : "—"}</td>
              <td className="is-num">{ago(r.updatedAt)}</td>
            </>}
          </tr>;
        })}</tbody>
      </table></div>
      {q && !rows.length && <p className="cr-muted" style={{ padding: "12px 0 0" }}>Nothing on this page matches “{query}”.</p>}
      {total > 50 && <div className="cr-pager">
        <span>{offset + 1}–{Math.min(offset + 50, total)} of {total.toLocaleString()}</span>
        <button type="button" className="cr-btn" disabled={offset === 0 || loading} onClick={() => onOffset(Math.max(0, offset - 50))} aria-label="Previous page"><ChevronLeft size={14} /></button>
        <button type="button" className="cr-btn" disabled={offset + 50 >= total || loading} onClick={() => onOffset(offset + 50)} aria-label="Next page"><ChevronRight size={14} /></button>
      </div>}
    </>}
  </Sheet>;
}
