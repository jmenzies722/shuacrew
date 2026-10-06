/**
 * Usage: how much, carried by which plan, when you work, and where it went. Every number is a recorded observation
 * from the gateway's event log, drawn in this Mac's own days and hours. Subscriptions don't bill per token, so there
 * are no invented dollars; "a usual day" is your own median, not a quota guess.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ObservabilityReport } from "@shuacrew/core/observability";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { useWorkspace } from "../lib/workspace-prefs";
import { compact, seconds } from "../lib/charts";
import { busiest, lastHours, localDays, rhythm, usualDay, versusUsual } from "../lib/usage-math";
import { plainTitle, providerName, providerTint } from "../lib/providers-look";
import { AreaChart, ControlHeader, Readouts, RhythmMap, Seg, Sheet, Sparkline, Treemap, type Readout, type Tone } from "../components/ControlRoom";
import { RunsTable } from "../components/RunsTable";
import type { ProviderHealth } from "./Observability";
import "./usage.css";

type Period = 7 | 30 | 0;
const KEY = "shuacrew.usage.period", DAY = 86_400_000;
const readPeriod = (): Period => { try { const v = localStorage.getItem(KEY); return v === "30" ? 30 : v === "0" ? 0 : 7; } catch { return 7; } };
const PROJECT_TINTS = ["#a78bfa", "#34d3c5", "#f59e0b", "#f472b6", "#60a5fa", "#a3e635", "#fb7185", "#22d3ee"];
const WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
/** The status line's word on today, against your own usual day. */
const todayLine = (today: number, usual: number) => (!today ? "quiet so far today" : !usual ? "today is your first busy day on record" : `today is ${versusUsual(today, usual).toLowerCase()}`);
const hourName = (h: number) => new Date(2026, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

export function Usage() {
  const [period, setPeriodState] = useState<Period>(readPeriod);
  const setPeriod = (p: Period) => { setPeriodState(p); setScrub(null); try { localStorage.setItem(KEY, String(p)); } catch { /* this view only */ } };
  const [venture, setVenture] = useState("");
  const [scoped, setScoped] = useState<ObservabilityReport | null>(null), [wide, setWide] = useState<ObservabilityReport | null>(null);
  const [page, setPage] = useState<{ offset: number; report: ObservabilityReport } | null>(null), [offset, setOffset] = useState(0);
  const [runtimes, setRuntimes] = useState<ProviderHealth[]>([]), [error, setError] = useState(""), [readAt, setReadAt] = useState(0), [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<string[]>([]), [scrub, setScrub] = useState<number | null>(null), [group, setGroup] = useState<"sessions" | "projects">("sessions");
  const connection = useLive((s) => s.connection), limited = useLive((s) => s.crew.limited), ventures = useLive((s) => s.crew.ventures);
  const budget = useWorkspace().dailyTokenBudget;
  const navigate = useNavigate();

  // The period's report (sessions heaviest first) plus the last 30 days by the hour, which every view draws from.
  useEffect(() => {
    let alive = true;
    const v = venture ? `&venture=${encodeURIComponent(venture)}` : "";
    const load = () => Promise.all([
      api<ObservabilityReport>(`/api/observability?days=${period}&sort=tokens${v}`),
      period === 30 ? Promise.resolve(null) : api<ObservabilityReport>(`/api/observability?days=30${v}`),
      api<ProviderHealth[]>("/api/runtimes").catch(() => null),
    ]).then(([s, w, rt]) => {
      if (!alive) return;
      setScoped(s); setWide(w ?? s); if (rt) setRuntimes(rt); setError(""); setReadAt(Date.now()); setNow(Date.now());
    }, (e: Error) => { if (alive) setError(e.message); });
    void load();
    const t = setInterval(load, 30_000), focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { alive = false; clearInterval(t); window.removeEventListener("focus", focus); };
  }, [period, venture]);
  useEffect(() => { setOffset(0); setPage(null); }, [period, venture]);
  useEffect(() => {
    if (!offset) return;
    let alive = true;
    void api<ObservabilityReport>(`/api/observability?days=${period}&sort=tokens&offset=${offset}${venture ? `&venture=${encodeURIComponent(venture)}` : ""}`)
      .then((report) => { if (alive) setPage({ offset, report }); }, (e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [offset, period, venture]);

  const hours = useMemo(() => wide?.hourly ?? [], [wide]);
  const month = useMemo(() => localDays(hours, 30, now), [hours, now]);
  const chart = useMemo(() => {
    if (!scoped) return null;
    if (period) { const s = localDays(hours, period, now); return { xs: s.xs, providers: s.providers, values: s.values, known: s.known }; }
    // All history: the report's UTC days with the gaps filled, so time stays to scale.
    const rows = scoped.daily.filter((r) => r.records);
    if (!rows.length) return { xs: [] as number[], providers: ["all"], values: { all: [] as number[] }, known: [] as boolean[] };
    const by = new Map(rows.map((r) => [r.id, r])), xs: number[] = [];
    for (let t = Date.parse(`${rows[0]!.id}T00:00:00Z`); t <= Date.parse(`${rows.at(-1)!.id}T00:00:00Z`); t += DAY) xs.push(t);
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    return { xs, providers: ["all"], values: { all: xs.map((t) => { const r = by.get(iso(t)); return r ? r.inputTokens + r.outputTokens : 0; }) }, known: xs.map((t) => by.has(iso(t))) };
  }, [scoped, hours, period, now]);
  const series = useMemo(() => (chart ? chart.providers.filter((p) => !hidden.includes(p)).map((p) => ({ id: p, label: providerName(p), color: providerTint(p), values: chart.values[p]! })) : []), [chart, hidden]);
  const sumAt = (i: number) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0);
  const periodTotal = chart ? chart.xs.reduce((s, _, i) => s + sumAt(i), 0) : 0;
  const shown = scrub !== null && chart ? sumAt(scrub) : periodTotal;
  const providerTotals = chart ? chart.providers.map((p) => ({ id: p, total: chart.values[p]!.reduce((a, b) => a + b, 0) })) : [];
  const allTotal = Math.max(1, providerTotals.reduce((s, p) => s + p.total, 0));
  const lead = providerTotals[0];

  // Week over week, in your own days (the 30 hourly days cover both weeks).
  const trend = useMemo(() => {
    if (period !== 7) return null;
    const two = localDays(hours, 14, now), before = two.totals.slice(0, 7).reduce((a, b) => a + b, 0), after = two.totals.slice(7).reduce((a, b) => a + b, 0);
    return before ? (after - before) / before : null;
  }, [hours, now, period]);

  const today = month.totals.at(-1) ?? 0, usual = usualDay(month);
  const windows = Object.entries(limited ?? {}).filter(([, w]) => w.until > now);
  const stale = connection !== "live" && !!scoped;
  const status: { text: string; tone: Tone } = error && !scoped ? { text: `Couldn't read usage: ${error}`, tone: "bad" }
    : stale ? { text: `The gateway isn't answering; showing the reading from ${new Date(readAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`, tone: "wait" }
    : windows.length ? { text: windows.map(([k, w]) => `${providerName(k.split(" · ")[0]!.toLowerCase())} is resting until ${new Date(w.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`).join(" · "), tone: "wait" }
    : !scoped ? { text: "Reading your sessions…", tone: "idle" }
    : !periodTotal ? { text: period ? `Nothing recorded in the last ${period} days.` : "Nothing recorded yet.", tone: "idle" }
    : { text: [trend !== null ? `${trend >= 0 ? "Up" : "Down"} ${Math.abs(Math.round(trend * 100))}% on the week before` : null, lead && chart?.providers[0] !== "all" ? `${providerName(lead.id)} carries ${Math.round((lead.total / allTotal) * 100)}%` : null, todayLine(today, usual)].filter(Boolean).join(" · ").replace(/^./, (c) => c.toUpperCase()), tone: "ok" };

  const fmtDay = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", ...(period === 0 ? { timeZone: "UTC" } : {}) });
  const tick = useMemo(() => (t: number, i: number, n: number) => i === n - 1 && period ? "Today" : new Date(t).toLocaleDateString([], period === 7 ? { weekday: "short" } : { month: "short", day: "numeric", ...(period === 0 ? { timeZone: "UTC" } : {}) }), [period]);

  const finished = scoped ? Object.entries(scoped.statuses).reduce((n, [k, v]) => (["done", "merged", "failed", "cancelled"].includes(k) ? n + v : n), 0) : 0;
  const good = scoped ? (scoped.statuses.done ?? 0) + (scoped.statuses.merged ?? 0) : 0;
  const measuredRuns = scoped ? Math.max(1, scoped.totalRuns - scoped.coverage.runsWithoutUsage) : 1;
  const cacheShare = scoped && scoped.totals.inputTokens + scoped.totals.cacheTokens ? scoped.totals.cacheTokens / (scoped.totals.inputTokens + scoped.totals.cacheTokens) : null;
  const budgetUse = budget ? today / budget : null;
  const readouts: Readout[] = scoped ? [
    { label: "Today", value: compact(today), tone: budgetUse !== null && budgetUse >= 1 ? "bad" : budgetUse !== null && budgetUse >= 0.8 ? "wait" : undefined,
      sub: budget ? `${Math.round((budgetUse ?? 0) * 100)}% of your ${compact(budget)} budget` : <Link to="/settings" hash="budget" className="us-link">Set a daily budget</Link> },
    { label: "Sessions", value: scoped.totalRuns.toLocaleString(), sub: finished ? `${Math.round((good / finished) * 100)}% finished well` : "none finished yet" },
    { label: "Per session", value: compact((scoped.totals.inputTokens + scoped.totals.outputTokens) / measuredRuns), sub: "tokens, on average" },
    { label: "Reused from cache", value: cacheShare === null ? "—" : `${Math.round(cacheShare * 100)}%`, sub: `${compact(scoped.totals.cacheTokens)} tokens not re-sent` },
    { label: "First reply", value: seconds(scoped.latency.firstResponse.p50Ms ?? scoped.latency.firstResponse.meanMs), sub: scoped.latency.firstResponse.p90Ms ? `slowest 10%: ${seconds(scoped.latency.firstResponse.p90Ms)}` : "typical" },
  ] : [];

  const plans = useMemo(() => {
    const ids = [...new Set([...month.providers, ...runtimes.map((r) => r.id)])].filter((id) => id !== "mock");
    return ids.map((id) => {
      const health = runtimes.find((r) => r.id === id), limit = Object.entries(limited ?? {}).find(([k, w]) => k.toLowerCase().startsWith(id) && w.until > now)?.[1];
      const state = limit ? { text: `Resting until ${new Date(limit.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, tone: "wait" }
        : !health ? { text: "Recorded usage", tone: "idle" }
        : !health.status.installed ? { text: "Not installed", tone: "idle" }
        : health.status.signedIn === false ? { text: "Sign-in required", tone: "bad" }
        : health.status.overridingKeys.length ? { text: "API key overrides your plan", tone: "wait" }
        : health.status.signedIn === null ? { text: "Connection unverified", tone: "idle" } : { text: "Connected", tone: "ok" };
      const todayP = month.values[id]?.at(-1) ?? 0, usualP = usualDay(month, id);
      return { id, label: providerName(id), state, today: todayP, usual: usualP, spark: lastHours(hours, now, 24, id), month: month.values[id]?.reduce((a, b) => a + b, 0) ?? 0 };
    }).sort((a, b) => b.month - a.month);
  }, [month, runtimes, limited, hours, now]);

  const grid = useMemo(() => rhythm(hours), [hours]), peak = busiest(grid);
  const quiet = grid.map((row, d) => ({ d, v: row.reduce((a, b) => a + b, 0) })).filter((x) => !x.v).map((x) => WEEKDAYS[x.d]!.replace(/s$/, ""));

  const tiles = useMemo(() => {
    if (!scoped) return [];
    if (group === "projects") return scoped.ventures.map((v, i) => ({ id: v.id, label: v.id === "unassigned" ? "No project" : ventures[v.id]?.name ?? v.id, value: v.inputTokens + v.outputTokens, color: v.id === "unassigned" ? "#8b8b96" : PROJECT_TINTS[i % PROJECT_TINTS.length]!, sub: `${v.records} records` }));
    const top = scoped.runs.filter((r) => r.inputTokens + r.outputTokens > 0).slice(0, 24);
    const rest = scoped.totals.inputTokens + scoped.totals.outputTokens - top.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
    return [...top.map((r) => ({ id: r.id, label: plainTitle(r.title) || r.id, value: r.inputTokens + r.outputTokens, color: providerTint(r.runtime), sub: providerName(r.runtime) })),
      ...(rest > 0 ? [{ id: "rest", label: `Everything else (${scoped.totalRuns - top.length} sessions)`, value: rest, color: "#8b8b96" }] : [])];
  }, [scoped, group, ventures]);

  const ventureOptions = [...new Set([venture, ...(scoped?.availableVentures ?? []), ...Object.keys(ventures)])].filter(Boolean);
  const table = offset && page?.offset === offset ? page.report : scoped;

  return <div className="cr-scroll"><div className="cr-page us">
    <ControlHeader title="Usage" kicker={<><BarChart3 size={13} /> Tools</>} status={status.text} tone={status.tone}>
      {ventureOptions.length > 0 && <select className="cr-select" aria-label="Project" value={venture} onChange={(e) => setVenture(e.target.value)}>
        <option value="">All projects</option>{ventureOptions.map((id) => <option key={id} value={id}>{ventures[id]?.name ?? id}</option>)}
      </select>}
      <Seg label="Period" value={period} onChange={setPeriod} options={[[7, "7 days"], [30, "30 days"], [0, "All time"]] as const} />
    </ControlHeader>

    {!scoped || !chart ? <><div className="cr-skeleton" style={{ height: 380 }} /><div className="cr-skeleton" style={{ height: 96 }} /></> : <>
      <section className="cr-sheet us-hero" style={{ ["--hero" as string]: lead && chart.providers[0] !== "all" ? providerTint(lead.id) : "var(--amber)" }}>
        <div className="us-hero-top">
          <div className="us-figure" aria-live="polite">
            <small>{scrub !== null ? fmtDay(chart.xs[scrub]!) + (scrub === chart.xs.length - 1 && period ? " · today so far" : "") : period ? `Last ${period} days` : chart.xs.length ? `Since ${new Date(chart.xs[0]!).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "All time"}</small>
            <strong title={`${shown.toLocaleString()} tokens`}>{compact(shown)}<span>tokens</span></strong>
            {scrub === null && trend !== null && <em className={`us-delta ${trend > 0.02 ? "is-up" : trend < -0.02 ? "is-down" : ""}`}>{trend > 0.02 ? <TrendingUp size={12} /> : trend < -0.02 ? <TrendingDown size={12} /> : <Minus size={12} />}{Math.abs(Math.round(trend * 100))}% vs last week</em>}
          </div>
          {chart.providers[0] !== "all" && <ul className="cr-legend us-legend">{chart.providers.map((p) => {
            const on = !hidden.includes(p), at = scrub !== null ? chart.values[p]![scrub] ?? 0 : providerTotals.find((x) => x.id === p)!.total;
            return <li key={p}><button type="button" aria-pressed={on} onClick={() => setHidden((h) => (on ? (h.length + 1 >= chart.providers.length ? h : [...h, p]) : h.filter((x) => x !== p)))} title={on ? `Hide ${providerName(p)}` : `Show ${providerName(p)}`}>
              <i style={{ background: providerTint(p) }} /><b>{providerName(p)}</b>{compact(at)}
            </button></li>;
          })}</ul>}
        </div>
        {chart.xs.length ? <AreaChart xs={chart.xs} series={series} stacked height={250} label={`Tokens per day, ${period ? `last ${period} days` : "all time"}`} live={period !== 0}
          known={chart.known} formatX={fmtDay} tick={tick} formatValue={compact} onScrub={setScrub} /> : <p className="cr-muted us-empty">Nothing recorded yet. Usage appears here after your first session.</p>}
        <details className="cr-notes us-exact"><summary>Exact values</summary>
          <div className="cr-table-wrap"><table className="cr-table"><thead><tr><th>Day</th>{chart.providers.map((p) => <th key={p} className="is-num">{providerName(p)}</th>)}<th className="is-num">Total</th></tr></thead>
            <tbody>{chart.xs.map((x, i) => <tr key={x}><td>{fmtDay(x)}</td>{chart.providers.map((p) => <td key={p} className="is-num">{chart.known[i] ? chart.values[p]![i]!.toLocaleString() : "—"}</td>)}<td className="is-num">{chart.known[i] ? chart.providers.reduce((s, p) => s + chart.values[p]![i]!, 0).toLocaleString() : "nothing recorded"}</td></tr>).reverse()}</tbody></table></div>
        </details>
      </section>

      <Readouts items={readouts} />

      <div className="cr-row is-wide-left">
        <Sheet title="Your plans" hint="today against your own usual day · last 24 hours">
          {plans.length ? <ul className="us-plans">{plans.map((p) => <li key={p.id}>
            <div className="us-plan-name"><i className="cr-dot" style={{ background: providerTint(p.id) }} /><b>{p.label}</b><span className={`cr-pill is-${p.state.tone}`}>{p.state.text}</span></div>
            <Sparkline values={p.spark} color={providerTint(p.id)} height={34} />
            <div className="us-plan-today"><strong>{compact(p.today)}</strong><small>{versusUsual(p.today, p.usual)}</small></div>
          </li>)}</ul> : <p className="cr-muted">No plans connected yet. <Link to="/settings" hash="agents" className="us-link">Connect Claude or Codex</Link></p>}
        </Sheet>
        <Sheet title="Your rhythm" hint="last 30 days, your time">
          <RhythmMap grid={grid} formatValue={(v) => `${compact(v)} tokens`} />
          <p className="cr-muted us-rhythm-note">{peak ? `You lean in most on ${WEEKDAYS[peak.day]} around ${hourName(peak.hour)}.${quiet.length && quiet.length < 7 ? ` Quiet: ${quiet.join(", ")}.` : ""}` : "Your week fills in as you work."}</p>
        </Sheet>
      </div>

      <Sheet title="Where it went" hint={group === "sessions" ? "each tile is a session, sized by tokens · click to open" : "by project · click to focus on one"}
        actions={<Seg label="Group by" value={group} onChange={setGroup} options={[["sessions", "Sessions"], ["projects", "Projects"]] as const} />}>
        {tiles.length ? <Treemap tiles={tiles} height={300} formatValue={compact}
          onOpen={(id) => (group === "sessions" ? void navigate({ to: "/sessions/$id", params: { id } }) : setVenture(id === "unassigned" ? "" : id))} />
          : <p className="cr-muted">No session recorded tokens in this window.</p>}
      </Sheet>

      {table && <RunsTable title="Every session" mode="tokens" runs={table.runs} total={table.totalRuns} offset={offset} onOffset={setOffset} loading={!!offset && page?.offset !== offset} />}

      <details className="cr-notes"><summary>How these numbers are measured</summary>
        <p>Recorded by this Mac's gateway as each session reports usage: {scoped.coverage.usageRecords.toLocaleString()} usage records{scoped.coverage.runsWithoutUsage ? `, ${scoped.coverage.runsWithoutUsage} sessions without any` : ""}. Days and hours are in your time zone{period === 0 ? " (all-time days are UTC)" : ""}. Cache tokens are counted separately and are not added to input. {scoped.totals.reportedCostUsd !== null ? `Providers reported $${scoped.totals.reportedCostUsd.toFixed(2)} of API cost; ` : ""}subscription bills and remaining quota aren't something any provider reports, so neither appears here.</p>
      </details>
    </>}
  </div></div>;
}
