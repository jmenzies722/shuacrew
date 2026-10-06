/**
 * Insights: is everything healthy, what needs you, how much work moves and how fast replies come back. Every
 * number is a recorded observation from the gateway's event log and links back to the session behind it; the page
 * refreshes on its own as new events land. Tokens live on Usage; gateway internals live in the Developer console.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, CircleDot, Hand, OctagonAlert, Play, RefreshCw, SquareTerminal, Wrench } from "lucide-react";
import type { ObservabilityReport } from "@shuacrew/core/observability";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { readObservabilityPreferences, saveObservabilityPreferences } from "../lib/observability-preferences";
import { analyticsPolling } from "../lib/observability-polling";
import { analyticsEventListener } from "../lib/analytics-events";
import { compact, seconds } from "../lib/charts";
import { plainTitle, providerName, providerTint } from "../lib/providers-look";
import { useHealthAlerts } from "../components/HealthAlerts";
import { AreaChart, ControlHeader, Readouts, Seg, Sheet, type Readout, type Tone } from "../components/ControlRoom";
import { RunsTable } from "../components/RunsTable";
import "./observability.css";

export type ProviderHealth = { id: string; label: string; authMode: string; limitedUntil: number | null; status: { installed: boolean; signedIn: boolean | null; overridingKeys: string[] } };

/** A provider's connection in plain words; "Connected" only when sign-in is actually confirmed. */
export function providerState(p: ProviderHealth, now = Date.now()): { text: string; tone: Tone } {
  if (!p.status.installed) return { text: "Not installed", tone: "idle" };
  if (p.status.overridingKeys.length) return { text: "API override detected", tone: "wait" };
  if (p.status.signedIn === false) return { text: "Sign-in required", tone: "bad" };
  if (p.status.signedIn === null) return { text: "Connection unverified", tone: "idle" };
  if (p.limitedUntil && p.limitedUntil > now) return { text: `Resting until ${new Date(p.limitedUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, tone: "wait" };
  return { text: "Connected", tone: "ok" };
}
export function ProviderStrip({ providers }: { providers: ProviderHealth[] }) {
  return <div className="obs-providers">{providers.map((p) => { const s = providerState(p); return <div key={p.id}><span className={`obs-dot ${s.tone === "ok" ? "is-ok" : ""}`} /><strong>{p.label}</strong><span>{s.text}</span></div>; })}</div>;
}

const FEED_ICON: Record<string, typeof Play> = { "run.created": Play, "run.status": CircleDot, "turn.started": Activity, "turn.completed": CheckCircle2, "tool.called": Wrench, "approval.requested": Hand, "approval.decided": CheckCircle2 };
const feedText = (kind: string, label: string) => kind === "run.created" ? "started" : kind === "run.status" ? (label === "awaiting_approval" ? "needs you" : label.replaceAll("_", " ")) : kind === "turn.started" ? "took a turn" : kind === "turn.completed" ? "finished a turn" : kind === "tool.called" ? `used ${label.replace(/^mcp__/, "").replaceAll("__", " · ")}` : kind === "approval.requested" ? "asked for approval" : kind === "approval.decided" ? "got a decision" : label;
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

export function Observability() {
  const [prefs] = useState(readObservabilityPreferences);
  const [days, setDaysState] = useState(prefs.days), [provider, setProvider] = useState(""), [venture, setVenture] = useState(""), [offset, setOffset] = useState(0);
  const setDays = (d: typeof days) => { setDaysState(d); setOffset(0); saveObservabilityPreferences({ ...prefs, days: d }); };
  const [data, setData] = useState<ObservabilityReport>(), [providers, setProviders] = useState<ProviderHealth[]>([]), [error, setError] = useState(""), [providerError, setProviderError] = useState(""), [loading, setLoading] = useState(false);
  const poller = useRef<ReturnType<typeof analyticsPolling<ObservabilityReport, ProviderHealth[]>> | null>(null);
  const connection = useLive((s) => s.connection), ventures = useLive((s) => s.crew.ventures), liveRuns = useLive((s) => s.crew.runs);
  const alerts = useHealthAlerts();
  const query = new URLSearchParams({ days: String(days), offset: String(offset), ...(provider ? { provider } : {}), ...(venture ? { venture } : {}) }).toString();
  useEffect(() => {
    const current = analyticsPolling(() => api<ObservabilityReport>(`/api/observability?${query}`), () => api<ProviderHealth[]>("/api/runtimes"), (s) => {
      if (s.report) setData(s.report); if (s.providers) setProviders(s.providers);
      setError(s.error); setProviderError(s.providerError); setLoading(s.loading);
    }, prefs.refreshSeconds);
    poller.current = current; void current.start();
    // New events (a run starts, a turn ends) refresh the page within a second, so it stays live without a reload.
    const unsubscribe = useLive.subscribe(analyticsEventListener(useLive.getState(), current.invalidate));
    return () => { unsubscribe(); current.stop(); if (poller.current === current) poller.current = null; };
  }, [query, prefs.refreshSeconds]);

  const s = data?.statuses ?? {};
  const working = (s.running ?? 0) + (s.planning ?? 0), queued = s.queued ?? 0, waiting = s.awaiting_approval ?? 0, failed = s.failed ?? 0;
  const done = (s.done ?? 0) + (s.merged ?? 0), finished = done + failed + (s.cancelled ?? 0);
  const critical = alerts?.filter((a) => a.level === "critical") ?? [], warn = alerts?.filter((a) => a.level === "warn") ?? [];
  const connected = providers.filter((p) => providerState(p).tone === "ok");
  const status: { text: string; tone: Tone } = error && !data ? { text: `Couldn't read your activity: ${error}`, tone: "bad" }
    : connection !== "live" && data ? { text: "The gateway isn't answering; showing the last reading.", tone: "wait" }
    : critical.length ? { text: critical[0]!.text, tone: "bad" }
    : waiting ? { text: `${waiting} session${waiting === 1 ? " is" : "s are"} waiting on you.`, tone: "wait" }
    : warn.length ? { text: warn[0]!.text, tone: "wait" }
    : !data ? { text: "Reading your activity…", tone: "idle" }
    : { text: [working ? `${working} working now` : "All quiet", connected.length ? `${connected.map((p) => providerName(p.id)).join(" and ")} connected` : null, "gateway healthy"].filter(Boolean).join(" · "), tone: working ? "live" : "ok" };

  const readouts: Readout[] = data ? [
    { label: "Working now", value: working, tone: working ? "live" : undefined, dim: !working, sub: queued ? `${queued} queued` : "running or planning" },
    { label: "Waiting on you", value: waiting, tone: waiting ? "wait" : undefined, dim: !waiting, sub: waiting ? "approve or deny" : "nothing to decide" },
    { label: "Finished", value: done, sub: finished ? `${Math.round((done / finished) * 100)}% finished well` : "none finished yet" },
    { label: "Failed", value: failed, tone: failed ? "bad" : undefined, dim: !failed, sub: failed ? "inspect before retrying" : "nothing failed" },
    { label: "First reply", value: seconds(data.latency.firstResponse.p50Ms ?? data.latency.firstResponse.meanMs), sub: data.latency.firstResponse.p90Ms ? `slowest 10%: ${seconds(data.latency.firstResponse.p90Ms)}` : "typical" },
    { label: "A whole turn", value: seconds(data.latency.turnDuration.p50Ms ?? data.latency.turnDuration.meanMs), sub: data.latency.turnDuration.p90Ms ? `slowest 10%: ${seconds(data.latency.turnDuration.p90Ms)}` : "typical" },
  ] : [];

  const ops = data?.operations ?? [];
  const xs = useMemo(() => ops.map((o) => Date.parse(`${o.id}T00:00:00Z`)), [ops]);
  const throughput = useMemo(() => [
    { id: "started", label: "Started", color: "var(--amber)", values: ops.map((o) => o.started) },
    { id: "completed", label: "Completed", color: "var(--ok)", values: ops.map((o) => o.completed) },
    ...(ops.some((o) => o.failed) ? [{ id: "failed", label: "Failed", color: "var(--bad)", values: ops.map((o) => o.failed), dashed: true }] : []),
  ], [ops]);
  const speed = useMemo(() => [{ id: "reply", label: "First reply", color: "var(--accent-2, var(--amber))", values: ops.map((o) => o.firstResponseMs ?? 0) }], [ops]);
  const fmtDay = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const tick = useMemo(() => (t: number, i: number, n: number) => (i === n - 1 && days ? "Today" : new Date(t).toLocaleDateString([], days === 7 ? { weekday: "short", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" })), [days]);
  // One line per session, its latest step: a busy session shouldn't push everything else off the list.
  const feed = useMemo(() => { const seen = new Set<string>(), out: NonNullable<typeof data>["timeline"] = []; for (const e of data?.timeline ?? []) { if (e.kind === "turn.started" || seen.has(e.run)) continue; seen.add(e.run); out.push(e); if (out.length >= 8) break; } return out; }, [data]);
  const ventureOptions = [...new Set([venture, ...(data?.availableVentures ?? []), ...Object.keys(ventures)])].filter(Boolean);
  const providerOptions = [...new Set([provider, ...(data?.availableProviders ?? []), ...providers.map((p) => p.id)])].filter(Boolean);

  return <div className="cr-scroll"><div className="cr-page obs">
    <ControlHeader title="Insights" kicker={<><Activity size={13} /> Tools</>} status={status.text} tone={status.tone}>
      {providerOptions.length > 1 && <select className="cr-select" aria-label="Model" value={provider} onChange={(e) => { setProvider(e.target.value); setOffset(0); }}>
        <option value="">All models</option>{providerOptions.map((p) => <option key={p} value={p}>{providerName(p)}</option>)}</select>}
      {ventureOptions.length > 0 && <select className="cr-select" aria-label="Project" value={venture} onChange={(e) => { setVenture(e.target.value); setOffset(0); }}>
        <option value="">All projects</option>{ventureOptions.map((id) => <option key={id} value={id}>{ventures[id]?.name ?? id}</option>)}</select>}
      <Seg label="Period" value={days} onChange={setDays} options={[[7, "7 days"], [30, "30 days"], [0, "All time"]] as const} />
      <button type="button" className="cr-btn" onClick={() => void poller.current?.refresh()} disabled={loading} aria-label="Refresh now" title="Refresh now"><RefreshCw size={14} className={loading ? "obs-spin" : ""} /></button>
    </ControlHeader>

    {alerts && alerts.length > 0 && <ul className="obs-alerts">{alerts.map((a) => <li key={a.id} className={`is-${a.level}`}>{a.level === "critical" ? <OctagonAlert size={15} /> : <AlertTriangle size={15} />}<span>{a.text}</span></li>)}</ul>}
    {error && data && <p className="cr-error" role="alert">Refresh failed; showing the last reading. {error}</p>}
    {providerError && <p className="cr-error" role="status">Model status couldn't refresh, so the connections below may be stale. {providerError}</p>}

    {!data ? <><div className="cr-skeleton" style={{ height: 96 }} /><div className="cr-skeleton" style={{ height: 300 }} /></> : <>
      <Readouts items={readouts} />

      <div className="cr-row is-wide-left">
        <Sheet title="Work moving" hint="turns started and completed per day · UTC">
          {xs.length ? <AreaChart xs={xs} series={throughput} height={220} label="Turns started and completed per day" formatX={fmtDay} tick={tick} formatValue={(v) => compact(v)} live={days !== 0} /> : <p className="cr-muted">No turns recorded in this window.</p>}
          <ul className="cr-legend obs-legend">{throughput.map((t) => <li key={t.id}><i style={{ background: t.color }} />{t.label}<b>{t.values.reduce((a, b) => a + b, 0).toLocaleString()}</b></li>)}</ul>
        </Sheet>
        <Sheet title="Connections" hint="your models, right now">
          {providers.length ? <ul className="obs-conn">{providers.map((p) => { const st = providerState(p); return <li key={p.id}>
            <i className="cr-dot" style={{ background: providerTint(p.id) }} /><span><b>{providerName(p.id)}</b><small>{p.label}{p.authMode ? ` · ${p.authMode}` : ""}</small></span>
            <span className={`cr-pill is-${st.tone}`}>{st.text}</span>
          </li>; })}</ul> : <p className="cr-muted">{providerError ? "Couldn't read your models." : "Checking your models…"}</p>}
          <Link to="/settings" hash="runtimes" className="obs-more">Manage connections <ArrowUpRight size={12} /></Link>
        </Sheet>
      </div>

      <div className="cr-row is-wide-left">
        <Sheet title="Reply speed" hint="average time to the first words of a reply, per day · UTC">
          {ops.some((o) => o.responseSamples) ? <AreaChart xs={xs} series={speed} height={190} label="First reply time per day" formatX={fmtDay} tick={tick} formatValue={(v) => seconds(v)} known={ops.map((o) => o.responseSamples > 0)} live={days !== 0} />
            : <p className="cr-muted">No replies measured in this window.</p>}
        </Sheet>
        <Sheet title="Live activity" hint="each session’s latest step">
          {feed.length ? <ol className="obs-feed">{feed.map((e) => { const Icon = FEED_ICON[e.kind] ?? CircleDot, title = plainTitle(liveRuns[e.run]?.title ?? data.runs.find((r) => r.id === e.run)?.title ?? "") || "A session";
            return <li key={e.seq} className={`is-${e.kind.replace(".", "-")}${e.kind === "run.status" ? ` is-${e.label}` : ""}`}>
              <Link to="/sessions/$id" params={{ id: e.run }}><Icon size={13} /><span><b>{title}</b> {feedText(e.kind, e.label)}</span><time dateTime={new Date(e.at).toISOString()}>{ago(e.at)}</time></Link>
            </li>; })}</ol> : <p className="cr-muted">Nothing recorded yet.</p>}
        </Sheet>
      </div>

      <RunsTable title="Sessions in this window" mode="status" runs={data.runs} total={data.totalRuns} offset={offset} onOffset={setOffset} loading={loading} />

      <Link to="/developer" className="cr-sheet obs-dev">
        <SquareTerminal size={18} /><span><b>Developer console</b><small>Event inspector, prompt inspector, API explorer, gateway log and diagnostics</small></span><ArrowUpRight size={15} />
      </Link>

      <details className="cr-notes"><summary>How these numbers are measured</summary>
        <p>From this Mac's event log, head #{data.source.head.toLocaleString()}, read {new Date(data.source.computedAt).toLocaleTimeString()}. Daily buckets are UTC. Statuses are each session's current state; counts cover sessions with activity in the window. Reply speed runs from a turn's start to its first recorded text (not microphone-to-voice). {data.coverage.syntheticEventsExcluded ? `${data.coverage.syntheticEventsExcluded} demo events are left out. ` : ""}Tokens are on Usage.</p>
      </details>
    </>}
  </div></div>;
}
