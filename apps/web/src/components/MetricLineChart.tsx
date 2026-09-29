import { useState } from "react";
import { lineGeometry, type LineSample } from "../lib/line-series";
export interface MetricSeries { name: string; color: string; values: LineSample[]; dashed?: boolean }
export function MetricLineChart({ label, unit, series, formatTime = at => new Date(at).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" }) }: { label: string; unit: string; series: MetricSeries[]; formatTime?: (at: number) => string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = series.reduce((m, s) => Math.max(m, lineGeometry(s.values).max), 1);
  const charts = series.map(s => ({ ...s, ...lineGeometry(s.values, max, 86400000) }));
  const reference = charts[0], points = reference?.points ?? [];
  const hasData = charts.some(s => s.points.some(p => p.y !== null));
  const shown = points.find(p => p.at === selected) ?? points.at(-1);
  const compact = (n: number) => n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
  return <div className="metric-line-chart">
    <div className="metric-line-readout"><span>{shown ? formatTime(shown.at) : "No observations"}</span>{charts.map(s => { const p = s.points.find(p => p.at === shown?.at); return <strong key={s.name} style={{ color: s.color }}>{s.name} <b>{p?.y == null ? "Unknown" : p.value!.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></strong>; })}</div>
    {!hasData ? <div className="obs-empty">No measured observations for this chart.</div> : <svg viewBox="0 0 670 224" role="img" aria-label={`${label}. Zero baseline. ${unit}. Missing measurements are gaps.`}>
      {[0, .5, 1].map(t => <g key={t}><line x1="54" x2="654" y1={16 + t * 180} y2={16 + t * 180} className="metric-grid" /><text x="46" y={20 + t * 180} textAnchor="end">{compact(max * (1 - t))}</text></g>)}
      <g transform="translate(54 16)">{charts.map(s => <g key={s.name}><path d={s.path} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? "6 4" : undefined} vectorEffect="non-scaling-stroke" />{s.points.filter(p => p.y !== null).map(p => <circle key={p.at} cx={p.x} cy={p.y!} r={selected === p.at ? 5 : 3} fill={s.color}><title>{`${formatTime(p.at)} · ${s.name}: ${p.value} ${unit}`}</title></circle>)}</g>)}{shown && <line x1={shown.x} x2={shown.x} y1="0" y2="180" className="metric-crosshair" />}</g>
      <text x="54" y="218">{points[0] && formatTime(points[0].at)}</text><text x="654" y="218" textAnchor="end">{points.at(-1) && formatTime(points.at(-1)!.at)}</text>
    </svg>}
    {points.length > 1 && <label className="metric-scrubber">Inspect observation<input type="range" min="0" max={points.length - 1} value={Math.max(0, points.findIndex(p => p.at === shown?.at))} onChange={e => setSelected(points[Number(e.target.value)]!.at)} aria-label={`Inspect ${label} observation`} /></label>}
  </div>;
}
