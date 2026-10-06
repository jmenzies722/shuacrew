import { HealthAlerts } from "../components/HealthAlerts";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowUpRight, BarChart3, RefreshCw } from "lucide-react";
import type { ObservabilityReport, UsageBucket } from "@shuacrew/core/observability";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { readObservabilityPreferences } from "../lib/observability-preferences";
import { analyticsPolling } from "../lib/observability-polling";
import { MetricLineChart } from "../components/MetricLineChart";
import { OperationCharts } from "../components/OperationCharts";
import { analyticsEventListener } from "../lib/analytics-events";
import "./observability.css";
import { UsageDashboard } from "../components/UsageDashboard";

export type ProviderHealth = { id: string; label: string; authMode: string; limitedUntil: number | null; status: { installed: boolean; signedIn: boolean | null; overridingKeys: string[] } };
const number = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });
const duration = (v: number | null) => v === null ? "Unknown" : `${(v / 1000).toFixed(1)}s`;
const cost = (v: number | null) => v === null ? "Unknown" : `$${v.toFixed(4)}`;
export function ProviderStrip({ providers }: { providers: ProviderHealth[] }) {
  return <div className="obs-providers">{providers.map(p => <div key={p.id}><span className={`obs-dot ${p.status.installed && p.status.signedIn === true && !p.status.overridingKeys.length ? "is-ok" : ""}`} /><strong>{p.label}</strong><span>{!p.status.installed ? "Not installed" : p.status.overridingKeys.length ? "API override detected" : p.status.signedIn === false ? "Sign-in required" : p.status.signedIn === null ? "Connection unverified" : p.limitedUntil && p.limitedUntil > Date.now() ? `Limited until ${new Date(p.limitedUntil).toLocaleString()}` : "Connected"}</span></div>)}</div>;
}
export function UsageChart({ rows }: { rows: UsageBucket[] }) {
  const values = (key: "inputTokens" | "outputTokens") => rows.map(r => ({ at: Date.parse(`${r.id}T00:00:00Z`), value: r.records ? r[key] : null }));
  return <><MetricLineChart label="Recorded token history" unit="tokens" series={[{ name: "Input", color: "var(--amber)", values: values("inputTokens") }, { name: "Output", color: "var(--ok)", dashed: true, values: values("outputTokens") }]} /><p className="obs-note">Daily UTC observations. Gaps mean no usage measurement; they do not prove zero consumption. Today's bucket is partial.</p><details className="obs-exact"><summary>Exact daily values · UTC</summary><div className="obs-table-scroll"><table><thead><tr><th>Date</th><th>Input</th><th>Output</th><th>Cache (separate)</th><th>Records</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.id}</td><td>{r.records ? number(r.inputTokens) : "Unknown"}</td><td>{r.records ? number(r.outputTokens) : "Unknown"}</td><td>{r.records ? number(r.cacheTokens) : "Unknown"}</td><td>{r.records}</td></tr>)}</tbody></table></div></details></>;
}
function Card({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="obs-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
export function Observability({ usage = false, embedded = false }: { usage?: boolean; embedded?: boolean }) {
  const [prefs] = useState(readObservabilityPreferences), [days, setDays] = useState(prefs.days), [provider, setProvider] = useState(""), [venture, setVenture] = useState(""), [offset, setOffset] = useState(0);
  const [data, setData] = useState<ObservabilityReport>(), [providers, setProviders] = useState<ProviderHealth[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0);
  const [providerError, setProviderError] = useState("");
  const poller = useRef<ReturnType<typeof analyticsPolling<ObservabilityReport, ProviderHealth[]>> | null>(null);
  const [search, setSearch] = useState(""), [sort, setSort] = useState("recent");
  const connection = useLive(s => s.connection), ventures = useLive(s => s.crew.ventures);
  const query = new URLSearchParams({ days: String(days), offset: String(offset), ...(provider ? { provider } : {}), ...(venture ? { venture } : {}) }).toString();
  useEffect(() => {
    setData(undefined);
    const current = analyticsPolling(() => api<ObservabilityReport>(`/api/observability?${query}`), () => api<ProviderHealth[]>("/api/runtimes"), s => {
      if (s.report) setData(s.report); if (s.providers) setProviders(s.providers);
      setError(s.error); setProviderError(s.providerError); setLoading(s.loading);
    }, prefs.refreshSeconds);
    poller.current = current; void current.start();
    const unsubscribe = useLive.subscribe(analyticsEventListener(useLive.getState(), current.invalidate));
    return () => { unsubscribe(); current.stop(); if (poller.current === current) poller.current = null; };
  }, [query, prefs.refreshSeconds]);
  useEffect(() => { if (refresh) void poller.current?.refresh(); }, [refresh]);
  const resetPage = (fn: () => void) => { fn(); setOffset(0); };
  const rows = (data?.runs ?? []).filter(r => `${r.title} ${r.id} ${r.runtime} ${r.status}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "tokens" ? b.inputTokens + b.outputTokens - a.inputTokens - a.outputTokens : b.updatedAt - a.updatedAt);
  return <div className="obs-page">
    {!embedded && <header className="obs-hero"><div><h1>{usage ? "Usage" : "Insights"}</h1><p>{usage ? "Observed tokens. Honest coverage. No invented bill." : "Find what needs you. Follow every number back to a real run."}</p></div><button className="obs-refresh" onClick={() => setRefresh(n => n + 1)} disabled={loading}><RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}</button></header>}
    {!embedded && <nav className="obs-tabs" aria-label="Analytics panes"><Link to="/observability" aria-current={!usage ? "page" : undefined}>Observability</Link><Link to="/usage" aria-current={usage ? "page" : undefined}>Usage</Link><Link to="/developer">Developer <ArrowUpRight size={13} /></Link></nav>}
    {!usage && <HealthAlerts />}
    <ProviderStrip providers={providers} />
    {providerError && <p className="obs-warning" role="status">Provider status could not refresh; any connection indicators above are stale. {providerError}</p>}
    <div className="obs-filters"><label>Window<select value={days} onChange={e => resetPage(() => setDays(Number(e.target.value) as typeof days))}><option value={7}>Last 7 UTC days</option><option value={30}>Last 30 UTC days</option><option value={0}>All recorded history</option></select></label><label>Provider<select value={provider} onChange={e => resetPage(() => setProvider(e.target.value))}><option value="">All providers</option>{[...new Set([provider, ...(data?.availableProviders ?? []), ...providers.map(p => p.id)])].filter(Boolean).map(p => <option key={p}>{p}</option>)}</select></label><label>Venture<select value={venture} onChange={e => resetPage(() => setVenture(e.target.value))}><option value="">All ventures</option>{[...new Set([venture, ...(data?.availableVentures ?? []), ...Object.keys(ventures)])].filter(Boolean).map(id => <option value={id} key={id}>{ventures[id]?.name ?? id}</option>)}</select></label><span className="obs-source">{connection !== "live" ? "Disconnected · recorded data only" : data ? `Local event log · #${data.source.head} · checked ${new Date(data.source.computedAt).toLocaleTimeString()}` : "Reading local event log…"}</span></div>
    {error && <p className="obs-warning" role="alert">{data ? "Refresh failed; showing the last successful snapshot. " : "Analytics unavailable. "}{error}</p>}
    {!data ? <p className="obs-empty" role="status">{loading ? "Reading recorded work…" : "No snapshot available. Try Refresh."}</p> : <>
      {!data.totalRuns && <p className="obs-empty">No recorded runs match these filters. This is an empty selection, not a provider outage.</p>}
      {!usage && (() => {
        const working = (data.statuses.running ?? 0) + (data.statuses.planning ?? 0), queued = data.statuses.queued ?? 0, waiting = data.statuses.awaiting_approval ?? 0, failed = data.statuses.failed ?? 0;
        // Four boxes of zeros said nothing: when all is quiet, say so in one line; otherwise show only what's happening.
        if (!working && !queued && !waiting && !failed) return <p className="obs-calm"><i /> All quiet: nothing running, nothing waiting on you, nothing failed in this window.</p>;
        return <div className="obs-cards">{[["Working", working, "Running or planning now"], ["Queued", queued, "Waiting to start"], ["Needs approval", waiting, "Waiting for your decision"], ["Failed", failed, "Inspect before retrying"]].filter(([, n]) => n).map(([label, n, detail]) => <Card key={label as string} label={label as string} value={number(n as number)} detail={detail as string} />)}</div>;
      })()}
      {usage && <div className="obs-cards"><Card label="Recorded input" value={number(data.totals.inputTokens)} detail={`${data.coverage.usageRecords} usage records`} /><Card label="Recorded output" value={number(data.totals.outputTokens)} detail="Reasoning included for corrected Codex records" /><Card label="Cache tokens" value={number(data.totals.cacheTokens)} detail="Separate category · not added to input" /><Card label="Reported API cost" value={cost(data.totals.reportedCostUsd)} detail={`${data.coverage.costRecords}/${data.coverage.usageRecords} records report cost · not subscription billing`} /></div>}
      <details className="obs-notes"><summary>Data notes</summary><p>Coverage: {data.coverage.legacyRecords} legacy records · {data.coverage.deltaRecords} corrected cumulative deltas · {data.coverage.fallbackRecords} last-observation fallbacks · {data.coverage.runsWithoutUsage} runs without usage · {data.coverage.contextOnlyRecords} context-only observations excluded. Legacy totals may contain earlier accounting errors. Subscription bill and remaining quota: unknown.</p></details>
{!usage && <OperationCharts rows={data.operations ?? []} />}
      {usage && <div className="obs-grid"><section className="obs-panel"><div className="obs-panel-heading"><div><h2>Usage over time</h2><p>Recorded tokens · UTC · zero baseline</p></div><span className="obs-legend"><i /> Input <i /> Output</span></div><UsageChart rows={data.daily} /></section><section className="obs-panel"><h2>By provider</h2>{data.providers.length ? data.providers.map(p => <div className="obs-breakdown" key={p.id}><div><strong>{p.id}</strong><span>{number(p.inputTokens + p.outputTokens)} tokens</span></div><progress max={Math.max(1, data.totals.inputTokens + data.totals.outputTokens)} value={p.inputTokens + p.outputTokens} aria-label={`${p.id} recorded tokens`} /><small>{number(p.inputTokens)} input · {number(p.outputTokens)} output · {p.records} records</small></div>) : <p className="obs-empty">No usage reported.</p>}<div className="obs-latency"><div><span>First text response</span><strong>{duration(data.latency.firstResponse.meanMs)}</strong><small>Mean · {data.latency.firstResponse.samples} turns</small></div><div><span>Turn duration</span><strong>{duration(data.latency.turnDuration.meanMs)}</strong><small>Mean · {data.latency.turnDuration.samples} turns</small></div></div><p className="obs-note">Turn start to first recorded text; not microphone-to-audio latency.</p></section></div>}
      {usage && <section className="obs-panel"><h2>By venture</h2><div className="obs-venture-list">{data.ventures.map(v => <div key={v.id}><strong>{v.id === "unassigned" ? "Not assigned to a venture" : ventures[v.id]?.name ?? v.id}</strong><span>{number(v.inputTokens)} input / {number(v.outputTokens)} output</span><small>{cost(v.reportedCostUsd)} reported · {v.records} records</small></div>)}</div></section>}
      <section className="obs-panel"><div className="obs-panel-heading"><div><h2>Inspect the source</h2><p>{data.totalRuns} matching runs · filters apply to observed events; status is current</p></div><div className="obs-table-controls"><input aria-label="Search visible runs" placeholder="Search this page…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Sort visible runs" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Recent first</option><option value="tokens">Most tokens</option></select></div></div><div className="obs-table-scroll"><table><thead><tr><th>Run</th><th>Current provider</th><th>State</th><th>Input</th><th>Output</th><th>Reported cost</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><Link to="/sessions/$id" params={{ id: r.id }}>{r.title || r.id} ↗</Link>{r.room && <Link className="obs-room-link" to="/rooms/$id" params={{ id: r.room }}>Crew room ↗</Link>}</td><td>{r.runtime}</td><td><span className={`obs-status is-${r.status}`}>{r.status.replaceAll("_", " ")}</span></td><td>{r.usageRecords ? number(r.inputTokens) : "Unknown"}</td><td>{r.usageRecords ? number(r.outputTokens) : "Unknown"}</td><td>{cost(r.reportedCostUsd)}</td></tr>)}</tbody></table></div><div className="obs-pagination"><button disabled={offset === 0 || loading} onClick={() => setOffset(n => Math.max(0, n - 50))}>Previous</button><span>{data.totalRuns ? offset + 1 : 0}–{Math.min(offset + 50, data.totalRuns)} of {data.totalRuns}</span><button disabled={offset + 50 >= data.totalRuns || loading} onClick={() => setOffset(n => n + 50)}>Next</button></div></section>
      {!usage && <section className="obs-panel"><h2>Recent recorded activity</h2><div className="obs-timeline">{data.timeline.map(e => <Link key={e.seq} to="/sessions/$id" params={{ id: e.run }}><time>{new Date(e.at).toLocaleTimeString()}</time><strong>{e.label.replaceAll(".", " · ")}</strong><small>#{e.seq} · {e.run}</small><ArrowUpRight size={13} /></Link>)}</div></section>}
      <p className="obs-note">Source window: {new Date(data.source.from).toISOString()} → {new Date(data.source.to).toISOString()}. Values are recorded observations, not a final provider bill. All data stays on this gateway.</p>
    </>}
  </div>;
}
/** /usage: the dashboard first; every session and the data notes fold away underneath it. */
export function Usage() { return <UsageDashboard><Observability usage embedded /></UsageDashboard>; }
