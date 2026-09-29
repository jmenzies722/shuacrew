import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Braces, Check, Copy, Eye, EyeOff, RefreshCw, SlidersHorizontal, SquareTerminal } from "lucide-react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { PaneHeader } from "../components/Pane";
import { DeveloperSettings } from "../components/DeveloperSettings";
import { EventInspector, GatewayLog, StorageUsage, bytes } from "../components/DevTools";
import { DiagnosticsSettings, FlagSettings } from "../components/BatchSettings";
import { PromptInspector } from "../components/BatchSettings2";
import { Segmented } from "../components/SettingControls";
import "./observability.css";
import "./developer.css";

type Group = "agent" | "run" | "tool" | "turn" | "room" | "approval" | "policy" | "mcp" | "gateway" | "other";
interface Metrics { minutes: number; bucketMs: number; total: number; groups: Group[]; buckets: Array<{ at: number } & Record<Group, number>>; tools: Array<{ name: string; calls: number; failed: number }>; outcomes: Record<string, number>; partial: boolean }
interface Health { ok: boolean; version: string; build: string; head: number; rssMb: number; uptimeS: number; service: boolean; pendingApprovals: number }

const COLORS: Record<Group, string> = { agent: "#e879f9", run: "var(--amber)", tool: "#7aa2f7", turn: "var(--ok)", room: "#bb9af7", approval: "var(--wait)", policy: "#f87171", mcp: "#56d4dd", gateway: "#94a3b8", other: "#52525b" };
// Default order pairs the half-width widgets side by side.
const WIDGETS = [
  ["health", "Health"], ["outcomes", "Run outcomes"], ["activity", "Activity"], ["tools", "Tool leaderboard"], ["storage", "Storage"],
  ["events", "Event inspector"], ["prompts", "Prompt inspector"], ["api", "API explorer"], ["log", "Gateway log"], ["diagnostics", "Memory, audit & voice"], ["flags", "Experimental"], ["report", "Debug report"],
] as const;
type WidgetId = (typeof WIDGETS)[number][0];
interface Layout { order: WidgetId[]; hidden: WidgetId[]; minutes: 15 | 60 | 360 | 1440; refresh: 0 | 5 | 15 | 60 }
const KEY = "shuacrew.devConsole";
const DEFAULT: Layout = { order: WIDGETS.map(([id]) => id), hidden: [], minutes: 60, refresh: 15 };
function loadLayout(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Layout> | null;
    if (!v) return DEFAULT;
    const known = new Set<string>(WIDGETS.map(([id]) => id));
    const order = (v.order ?? []).filter((id): id is WidgetId => known.has(id));
    return { order: [...order, ...DEFAULT.order.filter((id) => !order.includes(id))], hidden: (v.hidden ?? []).filter((id): id is WidgetId => known.has(id)), minutes: [15, 60, 360, 1440].includes(v.minutes as number) ? v.minutes! : 60, refresh: [0, 5, 15, 60].includes(v.refresh as number) ? v.refresh! : 15 };
  } catch { return DEFAULT; }
}

export function Developer() {
  const [layout, setLayout] = useState(loadLayout);
  const [customizing, setCustomizing] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null), [health, setHealth] = useState<Health | null>(null), [error, setError] = useState(""), [tick, setTick] = useState(0);
  const head = useLive((s) => s.crew.head);
  const save = (next: Layout) => { setLayout(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* this view only */ } };
  useEffect(() => {
    let alive = true;
    const load = () => Promise.all([api<Metrics>(`/api/dev/metrics?minutes=${layout.minutes}`), api<Health>("/api/health")])
      .then(([m, h]) => { if (alive) { setMetrics(m); setHealth(h); setError(""); } }).catch((e: Error) => alive && setError(e.message));
    void load();
    const t = layout.refresh ? setInterval(load, layout.refresh * 1000) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [layout.minutes, layout.refresh, tick]);
  const visible = layout.order.filter((id) => !layout.hidden.includes(id));
  const move = (id: WidgetId, d: number) => { const o = [...layout.order], i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j]!, o[i]!]; save({ ...layout, order: o }); };
  const widget = (id: WidgetId) => {
    switch (id) {
      case "health": return <HealthWidget health={health} liveHead={head} />;
      case "activity": return <ActivityWidget m={metrics} />;
      case "tools": return <ToolsWidget m={metrics} />;
      case "outcomes": return <OutcomesWidget m={metrics} />;
      case "events": return <EventInspector />;
      case "prompts": return <PromptInspector />;
      case "api": return <ApiExplorer />;
      case "log": return <GatewayLog />;
      case "storage": return <StorageUsage />;
      case "diagnostics": return <DeveloperSettings />;
      case "flags": return <FlagSettings />;
      case "report": return <DiagnosticsSettings />;
    }
  };
  const wide = new Set<WidgetId>(["activity", "events", "prompts", "api", "log", "diagnostics"]);
  return <div className="pane-scroll dc">
    <div className="pane-body pane-body-wide">
      <PaneHeader eyebrow="System" icon={SquareTerminal} title="Developer" description="Live instruments for the gateway: real activity from the event log, tools, logs and a read-only API explorer. Arrange it the way you work."
        actions={<>
          <Segmented label="Time window" value={String(layout.minutes)} onChange={(v) => save({ ...layout, minutes: Number(v) as Layout["minutes"] })} options={[["15", "15m"], ["60", "1h"], ["360", "6h"], ["1440", "24h"]]} />
          <Segmented label="Refresh" value={String(layout.refresh)} onChange={(v) => save({ ...layout, refresh: Number(v) as Layout["refresh"] })} options={[["5", "5s"], ["15", "15s"], ["60", "1m"], ["0", "Off"]]} />
          <button type="button" className="dc-btn" onClick={() => setTick((n) => n + 1)} aria-label="Refresh now"><RefreshCw size={14} /></button>
          <button type="button" className={`dc-btn${customizing ? " is-on" : ""}`} onClick={() => setCustomizing((v) => !v)} aria-pressed={customizing}><SlidersHorizontal size={14} /> Customize</button>
        </>} />
      <nav className="obs-tabs dc-tabs" aria-label="Analytics panes"><Link to="/observability">Observability</Link><Link to="/usage">Usage</Link><Link to="/developer" aria-current="page">Developer</Link></nav>
      {error && <p className="dc-error" role="alert">{error}</p>}
      {customizing && <section className="dc-customize" aria-label="Customize the console">
        <p>Show, hide and order the widgets. Saved on this Mac.</p>
        <ol>{layout.order.map((id, i) => { const hidden = layout.hidden.includes(id), label = WIDGETS.find(([w]) => w === id)![1]; return <li key={id} className={hidden ? "is-hidden" : ""}>
          <button type="button" aria-label={hidden ? `Show ${label}` : `Hide ${label}`} onClick={() => save({ ...layout, hidden: hidden ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id] })}>{hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
          <span>{label}</span>
          <button type="button" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => move(id, -1)}><ArrowUp size={13} /></button>
          <button type="button" aria-label={`Move ${label} down`} disabled={i === layout.order.length - 1} onClick={() => move(id, 1)}><ArrowDown size={13} /></button>
        </li>; })}</ol>
        <button type="button" className="dc-btn" onClick={() => save(DEFAULT)}>Reset layout</button>
      </section>}
      <div className="dc-grid">{visible.map((id) => <section key={id} className={`dc-widget${wide.has(id) ? " is-wide" : ""}`} aria-label={WIDGETS.find(([w]) => w === id)![1]}>
        <h2>{WIDGETS.find(([w]) => w === id)![1]}</h2>{widget(id)}
      </section>)}</div>
    </div>
  </div>;
}

function HealthWidget({ health, liveHead }: { health: Health | null; liveHead: number }) {
  if (!health) return <p className="dc-muted">Measuring…</p>;
  const up = health.uptimeS < 3600 ? `${Math.floor(health.uptimeS / 60)}m` : `${Math.floor(health.uptimeS / 3600)}h ${Math.floor((health.uptimeS % 3600) / 60)}m`;
  return <div className="dc-kpis">
    <div><span className={`dc-dot ${health.ok ? "is-ok" : "is-bad"}`} />{health.ok ? "Responding" : "Unhealthy"}<small>Gateway {health.version}</small></div>
    <div><strong>{up}</strong><small>Uptime</small></div>
    <div><strong>{health.rssMb} MB</strong><small>Memory</small></div>
    <div><strong>#{Math.max(health.head, liveHead).toLocaleString()}</strong><small>Events</small></div>
    <div><strong>{health.pendingApprovals}</strong><small>Approvals waiting</small></div>
    <div><strong>{health.service ? "On" : "Off"}</strong><small>Always-on service</small></div>
  </div>;
}

function ActivityWidget({ m }: { m: Metrics | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!m) return <p className="dc-muted">Loading…</p>;
  const totals = m.buckets.map((b) => m.groups.reduce((s, g) => s + b[g], 0)), max = Math.max(1, ...totals);
  const w = 100 / m.buckets.length, active = m.groups.filter((g) => m.buckets.some((b) => b[g] > 0));
  const h = hover !== null ? m.buckets[hover] : null;
  return <div className="dc-activity">
    <div className="dc-activity-top"><strong>{m.total.toLocaleString()}</strong><span>events in the last {m.minutes >= 60 ? `${m.minutes / 60}h` : `${m.minutes}m`}</span>
      <ul className="dc-legend">{active.map((g) => <li key={g}><i style={{ background: COLORS[g] }} />{g}</li>)}</ul></div>
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="dc-bars" role="img" aria-label={`Events per ${m.bucketMs / 60000} minute${m.bucketMs > 60000 ? "s" : ""}`} onMouseLeave={() => setHover(null)}>
      {m.buckets.map((b, i) => { let y = 40; return <g key={b.at} onMouseEnter={() => setHover(i)}>
        <rect x={i * w} y={0} width={w} height={40} fill="transparent" />
        {m.groups.map((g) => { const hgt = (b[g] / max) * 38; y -= hgt; return hgt > 0 ? <rect key={g} x={i * w + w * 0.12} y={y} width={w * 0.76} height={hgt} rx={0.4} fill={COLORS[g]} opacity={hover === null || hover === i ? 1 : 0.35} /> : null; })}
      </g>; })}
    </svg>
    <div className="dc-activity-foot">{h ? <span>{new Date(h.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {m.groups.filter((g) => h[g]).map((g) => `${h[g]} ${g}`).join(" · ") || "no events"}</span> : <span>Hover a bar for its breakdown.</span>}
      {m.partial && <span className="dc-warn">Only the newest 60k events are scanned — earlier activity in this window isn't shown.</span>}</div>
  </div>;
}

function ToolsWidget({ m }: { m: Metrics | null }) {
  if (!m) return <p className="dc-muted">Loading…</p>;
  if (!m.tools.length) return <p className="dc-muted">No tool calls in this window.</p>;
  const max = Math.max(...m.tools.map((t) => t.calls));
  return <ol className="dc-tools">{m.tools.map((t) => <li key={t.name}>
    <span className="dc-tool-name" title={t.name}>{t.name.replace(/^mcp__/, "").replaceAll("__", " · ")}</span>
    <span className="dc-tool-bar"><i style={{ width: `${(t.calls / max) * 100}%` }} />{t.failed > 0 && <b style={{ width: `${(t.failed / max) * 100}%` }} />}</span>
    <span className="dc-tool-n">{t.calls}{t.failed > 0 && <em> · {t.failed} failed</em>}</span>
  </li>)}</ol>;
}

function OutcomesWidget({ m }: { m: Metrics | null }) {
  const running = useLive((s) => Object.values(s.crew.runs).filter((r) => ["running", "planning", "awaiting_approval"].includes(r.status)).length);
  if (!m) return <p className="dc-muted">Loading…</p>;
  const rows: Array<[string, number, string]> = [["Done", m.outcomes.done! + m.outcomes.merged!, "var(--ok)"], ["Failed", m.outcomes.failed!, "var(--bad)"], ["Cancelled", m.outcomes.cancelled!, "#8b949e"], ["Running now", running, "var(--amber)"]];
  const total = rows.slice(0, 3).reduce((s, [, n]) => s + n, 0);
  const rate = total ? Math.round(((m.outcomes.done! + m.outcomes.merged!) / total) * 100) : null;
  return <div className="dc-outcomes">
    <div className="dc-ring" style={{ "--p": rate ?? 0 } as React.CSSProperties}><strong>{rate === null ? "—" : `${rate}%`}</strong><small>success</small></div>
    <ul>{rows.map(([label, n, c]) => <li key={label}><i style={{ background: c }} />{label}<span>{n}</span></li>)}</ul>
  </div>;
}

const ENDPOINTS = ["/api/health", "/api/status", "/api/runtimes", "/api/settings", "/api/crew", "/api/rooms", "/api/mcp", "/api/dev/metrics?minutes=60", "/api/dev/storage", "/api/speech/storage", "/api/audit/verify"];
/** Read-only: GET requests to this gateway only. */
function ApiExplorer() {
  const [path, setPath] = useState(ENDPOINTS[0]!), [out, setOut] = useState(""), [ms, setMs] = useState<number | null>(null), [copied, setCopied] = useState(false), [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true); const t = performance.now();
    try { const r = await api<unknown>(path); const text = JSON.stringify(r, null, 2); setOut(text.length > 60_000 ? `${text.slice(0, 60_000)}\n… (${bytes(text.length)} total)` : text); }
    catch (e) { setOut(`Error: ${(e as Error).message}`); }
    setMs(Math.round(performance.now() - t)); setBusy(false);
  }, [path]);
  const curl = useMemo(() => `curl -s ${window.location.origin}${path}`, [path]);
  return <div className="dc-api">
    <div className="dc-api-bar"><span className="dc-get">GET</span>
      <select className="setting-input" aria-label="Endpoint" value={path} onChange={(e) => setPath(e.target.value)}>{ENDPOINTS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
      <button type="button" className="dc-btn is-primary" disabled={busy} onClick={() => void run()}><Braces size={13} /> Send</button>
      <button type="button" className="dc-btn" onClick={() => { void navigator.clipboard?.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? <Check size={13} /> : <Copy size={13} />} curl</button>
      {ms !== null && <span className="dc-muted">{ms} ms</span>}</div>
    <pre className="dc-json">{out || "Pick an endpoint and press Send. Read-only; nothing here changes your data."}</pre>
  </div>;
}
