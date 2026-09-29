import { useEffect, useMemo, useState } from "react";
import { Ear, Eye, Hand, History, Trash2 } from "lucide-react";
import { clearSparkLog, useSparkLog, type LogEntry } from "../lib/spark-log";
import { useCompanion } from "../lib/companion";

const COLS: Array<{ kind: "saw" | "heard" | "did"; title: string; icon: typeof Eye; empty: string }> = [
  { kind: "saw", title: "Saw", icon: Eye, empty: "Didn't look at your screen today." },
  { kind: "heard", title: "Heard", icon: Ear, empty: "Didn't hear anything today." },
  { kind: "did", title: "Did", icon: Hand, empty: "Didn't act on your Mac today." },
];
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Privacy at a glance: everything Spark saw, heard and did today — kept only on this Mac, deletable in one click. */
export function SparkToday() {
  const log = useSparkLog(), prefs = useCompanion(), name = prefs.nickname || "Spark";
  const [sure, setSure] = useState(false);
  const [memory, setMemory] = useState<{ moments: number; today: number; keepDays: number } | null>(null);
  const loadMemory = () => void fetch("/api/screen-memory").then((r) => r.json()).then(setMemory).catch(() => setMemory(null));
  useEffect(loadMemory, []);
  const forget = () => void fetch("/api/screen-memory", { method: "DELETE", headers: { "X-ShuaCrew": "1" } }).then(loadMemory);
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const today = useMemo(() => log.filter((e) => e.at >= midnight.getTime()), [log, midnight.getTime()]);
  const by = (k: "saw" | "heard" | "did") => today.filter((e) => (e.kind ?? "did") === k).slice(-30).reverse();
  return <section className="spark-today" aria-label={`What ${name} saw, heard and did today`}>
    <header>
      <div><h2>{name} today</h2><p>What it saw, heard and did — kept only on this Mac. Screenshots and audio are never stored; this is just the record that they happened.</p></div>
      {sure
        ? <span className="spark-today-confirm">Delete {log.length} entr{log.length === 1 ? "y" : "ies"}? <button type="button" className="is-danger" onClick={() => { clearSparkLog(); setSure(false); }}>Delete</button><button type="button" onClick={() => setSure(false)}>Keep</button></span>
        : <button type="button" onClick={() => setSure(true)} disabled={!log.length}><Trash2 size={13} /> Delete history</button>}
    </header>
    {memory && memory.moments > 0 && <p className="spark-today-memory"><History size={13} /> Screen memory: {memory.today} screen{memory.today === 1 ? "" : "s"} of text remembered today ({memory.moments} over the last {memory.keepDays} days). <button type="button" onClick={forget}>Forget all</button></p>}
    <div className="spark-today-cols">{COLS.map((c) => { const rows = by(c.kind); return <div key={c.kind} className="spark-today-col">
      <h3><c.icon size={14} /> {c.title} <small>{rows.length}</small></h3>
      {rows.length ? <ol>{rows.map((e: LogEntry, i) => <li key={`${e.at}-${i}`} className={e.ok ? "" : "is-failed"}><time>{time(e.at)}</time><span><b>{e.label}</b>{e.message && <small>{e.message}</small>}</span></li>)}</ol> : <p>{c.empty}</p>}
    </div>; })}</div>
  </section>;
}
