import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Copy, HardDrive, Pause, Play, RefreshCw, ScrollText, Search } from "lucide-react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { saveWorkspace, useWorkspace } from "../lib/workspace-prefs";
import { SettingRow, Switch } from "./SettingControls";
import "./dev-tools.css";

interface DevEvent { seq: number; at: number; kind: string; run?: string; body: string }
const SWATCH = ["var(--amber)", "var(--ok)", "#7aa2f7", "#bb9af7", "var(--wait)", "#56d4dd", "var(--bad)", "#8b949e"];
const KINDS = ["", "run.", "tool.", "turn.", "approval.", "room.", "crew.", "mcp.", "play.", "venture."];

/** Live, newest-first view of the gateway's event log. Read-only; bodies are redacted by the gateway. */
export function EventInspector() {
  const [kind, setKind] = useState("");
  const [find, setFind] = useState("");
  const [events, setEvents] = useState<DevEvent[]>([]);
  const [head, setHead] = useState(0);
  const [live, setLive] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const liveSeq = useLive((s) => s.crew.head);
  const load = useCallback(async (before?: number) => {
    try {
      const r = await api<{ head: number; events: DevEvent[] }>(`/api/dev/events?limit=150${kind ? `&kind=${encodeURIComponent(kind)}` : ""}${before ? `&before=${before}` : ""}`);
      setHead(r.head); setError("");
      setEvents((prev) => (before ? [...prev, ...r.events] : r.events));
    } catch (e) { setError((e as Error).message); }
  }, [kind]);
  useEffect(() => { void load(); }, [load]);
  // Follow the live stream: refetch the top whenever a new event arrives (only while Live is on).
  // Debounced: a streaming run emits many events a second.
  useEffect(() => { if (!live || !liveSeq) return; const t = setTimeout(() => void load(), 400); return () => clearTimeout(t); }, [live, liveSeq, load]);
  const words = find.toLowerCase().trim();
  const shown = useMemo(() => (words ? events.filter((e) => `${e.kind} ${e.run ?? ""} ${e.body}`.toLowerCase().includes(words)) : events), [events, words]);
  return <div className="settings-card dev-card">
    <div className="dev-toolbar">
      <label className="dev-search"><Search size={13} /><input aria-label="Filter events" placeholder="Filter by text, run id…" value={find} onChange={(e) => setFind(e.target.value)} /></label>
      <select className="setting-input" aria-label="Event kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map((k) => <option key={k} value={k}>{k ? `${k}*` : "All kinds"}</option>)}
      </select>
      <button type="button" className={`dev-chip${live ? " is-live" : ""}`} onClick={() => setLive(!live)} aria-pressed={live}>{live ? <Pause size={12} /> : <Play size={12} />}{live ? "Live" : "Paused"}</button>
      <span className="dev-meta">head #{head.toLocaleString()}</span>
    </div>
    {error && <p role="alert" className="dev-error">{error}</p>}
    <ol className="dev-events" aria-label="Events, newest first">
      {shown.map((e) => <li key={e.seq} className={open === e.seq ? "is-open" : ""}>
        <button type="button" onClick={() => setOpen(open === e.seq ? null : e.seq)} aria-expanded={open === e.seq}>
          <ChevronRight size={12} className="dev-caret" />
          <span className="dev-seq">#{e.seq}</span>
          <span className={`dev-kind k-${e.kind.split(".")[0]}`}>{e.kind}</span>
          <span className="dev-body">{e.body}</span>
          <time>{new Date(e.at).toLocaleTimeString()}</time>
        </button>
        {open === e.seq && <div className="dev-detail">
          {e.run && <p>run <code>{e.run}</code></p>}
          <pre>{pretty(e.body)}</pre>
          <button type="button" className="dev-chip" onClick={() => void navigator.clipboard?.writeText(e.body)}><Copy size={12} /> Copy JSON</button>
        </div>}
      </li>)}
      {!shown.length && !error && <li className="dev-empty">{events.length ? "No events match this filter." : "No events of this kind yet."}</li>}
    </ol>
    {events.length > 0 && events[events.length - 1]!.seq > 1 && <button type="button" className="dev-more" onClick={() => void load(events[events.length - 1]!.seq)}>Load older</button>}
  </div>;
}
function pretty(body: string) { try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; } }

/** The gateway's own log, tail only, redacted. */
export function GatewayLog() {
  const [data, setData] = useState<{ file: string; size: number; lines: string[] } | null>(null);
  const [find, setFind] = useState("");
  const refresh = useCallback(() => void api<{ file: string; size: number; lines: string[] }>("/api/dev/log").then(setData).catch(() => setData({ file: "", size: 0, lines: [] })), []);
  useEffect(refresh, [refresh]);
  const lines = (data?.lines ?? []).filter((l) => !find || l.toLowerCase().includes(find.toLowerCase()));
  return <div className="settings-card dev-card">
    <div className="dev-toolbar">
      <label className="dev-search"><Search size={13} /><input aria-label="Search log" placeholder="Search the log…" value={find} onChange={(e) => setFind(e.target.value)} /></label>
      <button type="button" className="dev-chip" onClick={refresh}><RefreshCw size={12} /> Refresh</button>
      <span className="dev-meta"><ScrollText size={12} /> {data ? `${bytes(data.size)} · last ${data.lines.length} lines` : "loading…"}</span>
    </div>
    <pre className="dev-log" aria-label="Gateway log">{lines.length ? lines.map((l, i) => <span key={i} className={/error|exception|crash/i.test(l) ? "is-error" : /warn/i.test(l) ? "is-warn" : ""}>{l}{"\n"}</span>) : "Nothing to show."}</pre>
  </div>;
}

/** What ShuaCrew keeps on this Mac. */
export function StorageUsage() {
  const [data, setData] = useState<{ home: string; events: number; areas: Array<{ label: string; bytes: number }> } | null>(null);
  useEffect(() => { void api<NonNullable<typeof data>>("/api/dev/storage").then(setData).catch(() => undefined); }, []);
  const total = data?.areas.reduce((s, a) => s + a.bytes, 0) ?? 0;
  return <div className="settings-card dev-card">
    <div className="dev-toolbar"><span className="dev-meta"><HardDrive size={12} /> {data ? <><code>{data.home}</code> · {bytes(total)} · {data.events.toLocaleString()} events</> : "Measuring…"}</span></div>
    {data && <div className="dev-storage">
      <div className="dev-stack" aria-hidden="true">{data.areas.filter((a) => a.bytes).map((a) => <span key={a.label} style={{ flexGrow: a.bytes, background: SWATCH[data.areas.indexOf(a) % SWATCH.length] }} />)}</div>
      <ul>{[...data.areas].sort((a, b) => b.bytes - a.bytes).map((a, i) => <li key={a.label}><i style={{ background: SWATCH[data.areas.indexOf(a) % SWATCH.length] }} />{a.label}<span>{bytes(a.bytes)}</span>{i === 0 && total > 0 && <small>{Math.round((a.bytes / total) * 100)}%</small>}</li>)}</ul>
    </div>}
  </div>;
}

export function HudToggle() {
  const prefs = useWorkspace();
  return <div className="settings-card">
    <SettingRow name="Live HUD" detail="A small floating panel: connection state, events per second, last sequence and stream lag. Drag it anywhere; ⌥⇧H toggles it." modified={prefs.hud}>
      <Switch label="Show the live HUD" on={prefs.hud} onChange={(hud) => saveWorkspace({ hud })} />
    </SettingRow>
  </div>;
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"]; let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}
