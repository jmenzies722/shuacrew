/**
 * Usage, as a dashboard: how much this week, which model family carries it, where the tokens go, how fast and how
 * reliable the work is, and how close you are to a limit. Every number comes from the gateway's recorded events
 * (/api/observability); subscriptions have no per-token bill, so tokens — not invented dollars — are the measure.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Gauge, Sparkles, Timer, Zap } from "lucide-react";
import type { ObservabilityReport } from "@shuacrew/core/observability";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { useWorkspace } from "../lib/workspace-prefs";
import "./usage-dashboard.css";

const compact = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`;
const secs = (ms?: number) => (ms === undefined || !Number.isFinite(ms) ? "—" : ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);
const NAMES: Record<string, string> = { claude: "Claude", codex: "Codex", local: "This Mac" };
const TINT: Record<string, string> = { claude: "#e8916b", codex: "#7aa2ff", local: "#34d399" };

export function UsageDashboard({ children }: { children?: React.ReactNode }) {
  const [days, setDays] = useState<7 | 30>(7), [data, setData] = useState<ObservabilityReport | null>(null), [error, setError] = useState("");
  const today = useLive((s) => s.crew.today), limited = useLive((s) => s.crew.limited), budget = useWorkspace().dailyTokenBudget;
  useEffect(() => {
    let alive = true;
    const load = () => api<ObservabilityReport>(`/api/observability?days=${days}`).then((d) => { if (alive) { setData(d); setError(""); } }, (e: Error) => { if (alive) setError(e.message); });
    void load(); const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [days]);
  const view = useMemo(() => {
    if (!data) return null;
    const tokens = data.totals.inputTokens + data.totals.outputTokens;
    const daily = data.daily.map((b) => ({ day: b.id, input: b.inputTokens, output: b.outputTokens, total: b.inputTokens + b.outputTokens }));
    const peak = Math.max(1, ...daily.map((d) => d.total));
    const half = Math.floor(daily.length / 2), recent = daily.slice(half).reduce((n, d) => n + d.total, 0), before = daily.slice(0, half).reduce((n, d) => n + d.total, 0);
    const providers = [...data.providers].map((p) => ({ id: p.id, tokens: p.inputTokens + p.outputTokens, records: p.records })).filter((p) => p.tokens > 0).sort((a, b) => b.tokens - a.tokens);
    const providerTotal = Math.max(1, providers.reduce((n, p) => n + p.tokens, 0));
    const top = [...data.runs].map((r) => ({ id: r.id, title: r.title.replace(/^(Spark|Shua) · /, ""), runtime: r.runtime, tokens: r.inputTokens + r.outputTokens })).filter((r) => r.tokens > 0).sort((a, b) => b.tokens - a.tokens).slice(0, 6);
    const finished = Object.entries(data.statuses).reduce((n, [k, v]) => (["done", "merged", "failed", "cancelled"].includes(k) ? n + v : n), 0);
    const good = (data.statuses.done ?? 0) + (data.statuses.merged ?? 0);
    return { tokens, daily, peak, trend: before ? (recent - before) / before : null, providers, providerTotal, top, finished, good, cache: data.totals.cacheTokens };
  }, [data]);
  const now = Date.now();
  const windows = Object.entries(limited ?? {}).filter(([, w]) => w.until > now);
  const budgetUse = budget ? Math.min(1.5, today.tokens / budget) : null;

  return <div className="usage">
    <header className="usage-head">
      <div><span className="usage-kicker"><Gauge size={13} /> Usage</span><h1>{view ? `${compact(view.tokens)} tokens ${days === 7 ? "this week" : "this month"}` : "Usage"}</h1>
        <p>{view?.trend !== null && view?.trend !== undefined ? `${view.trend >= 0 ? "Up" : "Down"} ${Math.abs(Math.round(view.trend * 100))}% on the period before · ` : ""}Tokens from your recorded sessions. Subscriptions don't bill per token, so no invented dollars.</p></div>
      <nav className="usage-seg" role="tablist" aria-label="Period">{([7, 30] as const).map((d) => <button key={d} role="tab" aria-selected={days === d} className={days === d ? "is-on" : ""} onClick={() => setDays(d)}>{d === 7 ? "7 days" : "30 days"}</button>)}</nav>
    </header>
    {error && <p className="usage-error" role="alert">Couldn't read usage: {error}</p>}
    {!view ? <p className="usage-muted">Reading your sessions…</p> : <>
      <section className="usage-tiles">
        <article className="usage-tile is-lead">
          <span>Today</span><strong>{compact(today.tokens)}</strong>
          <small>{today.runs} session{today.runs === 1 ? "" : "s"}{budget ? ` · ${Math.round((budgetUse ?? 0) * 100)}% of your ${compact(budget)} budget` : ""}</small>
          {budget ? <i className={`usage-meter${(budgetUse ?? 0) >= 1 ? " is-over" : (budgetUse ?? 0) >= 0.8 ? " is-near" : ""}`}><i style={{ width: `${Math.min(100, (budgetUse ?? 0) * 100)}%` }} /></i>
            : <Link to="/settings" hash="workspace" className="usage-link">Set a daily budget <ArrowUpRight size={12} /></Link>}
        </article>
        <article className="usage-tile"><span><Zap size={12} /> Finished well</span><strong>{view.finished ? `${Math.round((view.good / view.finished) * 100)}%` : "—"}</strong><small>{view.good} of {view.finished} sessions done</small></article>
        <article className="usage-tile"><span><Timer size={12} /> First reply</span><strong>{secs(data!.latency.firstResponse.meanMs ?? undefined)}</strong><small>average · a turn takes {secs(data!.latency.turnDuration.meanMs ?? undefined)}</small></article>
        <article className="usage-tile"><span><Sparkles size={12} /> Context reused</span><strong>{compact(view.cache)}</strong><small>cached tokens, not re-sent</small></article>
      </section>

      {windows.length > 0 && <section className="usage-limits">{windows.map(([key, w]) => <p key={key}><i />{key.replace(" · ", " ")} — {w.message.toLowerCase()} · back at {new Date(w.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>)}</section>}

      <section className="usage-grid">
        <article className="usage-panel usage-days">
          <header><h2>Every day</h2><span><i className="is-in" /> Input <i className="is-out" /> Output</span></header>
          <div className="usage-bars" style={{ gridTemplateColumns: `repeat(${view.daily.length}, minmax(0, 1fr))` }}>
            {view.daily.map((d, i) => <div key={d.day} className={`usage-bar${i === view.daily.length - 1 ? " is-today" : ""}`} title={`${d.day}: ${d.total.toLocaleString()} tokens`}>
              <span className="usage-bar-stack" style={{ height: `${Math.max(d.total ? 3 : 0, (d.total / view.peak) * 100)}%` }}>
                <i className="is-out" style={{ flexGrow: d.output || 0 }} /><i className="is-in" style={{ flexGrow: d.input || 0 }} />
              </span>
              <small>{i === view.daily.length - 1 ? "Today" : view.daily.length <= 10 || i % 3 === 0 ? new Date(`${d.day}T12:00:00Z`).toLocaleDateString([], view.daily.length <= 10 ? { weekday: "short" } : { day: "numeric" }) : ""}</small>
            </div>)}
          </div>
        </article>
        <article className="usage-panel">
          <header><h2>Who's carrying it</h2></header>
          {view.providers.length ? <>
            <div className="usage-split">{view.providers.map((p) => <i key={p.id} style={{ flexGrow: p.tokens, background: TINT[p.id] ?? "var(--amber)" }} title={`${NAMES[p.id] ?? p.id}: ${compact(p.tokens)}`} />)}</div>
            <ul className="usage-legend">{view.providers.map((p) => <li key={p.id}><i style={{ background: TINT[p.id] ?? "var(--amber)" }} /><b>{NAMES[p.id] ?? p.id}</b><span>{Math.round((p.tokens / view.providerTotal) * 100)}%</span><small>{compact(p.tokens)} · {p.records} records</small></li>)}</ul>
          </> : <p className="usage-muted">No recorded model usage in this window.</p>}
        </article>
      </section>

      <article className="usage-panel">
        <header><h2>Where the tokens go</h2><span>heaviest sessions</span></header>
        {view.top.length ? <ol className="usage-top">{view.top.map((r) => <li key={r.id}>
          <Link to="/sessions/$id" params={{ id: r.id }}><b>{r.title}</b><small>{NAMES[r.runtime] ?? r.runtime}</small></Link>
          <i><i style={{ width: `${(r.tokens / view.top[0]!.tokens) * 100}%`, background: TINT[r.runtime] ?? "var(--amber)" }} /></i>
          <span>{compact(r.tokens)}</span>
        </li>)}</ol> : <p className="usage-muted">Nothing recorded yet.</p>}
      </article>
      {children && <details className="usage-more"><summary>Every session and the data notes</summary>{children}</details>}
    </>}
  </div>;
}
