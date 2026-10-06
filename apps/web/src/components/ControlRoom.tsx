/**
 * The Tools hub's instruments ("Control Room"): one header with a live status line, readouts without boxes, sheets,
 * and charts you can scrub. Usage, Insights, Developer, Tools & Skills and Policy all build from these, so the hub
 * reads as one console. The live touches (the signal sweep, the "now" pulse) are transform/opacity only and rest
 * with [data-idle] and Reduce motion.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { bandPath, niceMax, smoothPath, squarify, stack } from "../lib/charts";
import "./control-room.css";

export type Tone = "ok" | "wait" | "bad" | "idle" | "live";

/** Measures an element (and keeps measuring as the window resizes), so SVG strokes stay crisp at any width. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height); setSize((s) => (s.w === w && s.h === h ? s : { w, h })); };
    read();
    const ro = new ResizeObserver(read); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** A page's head: title, one live sentence about how things are, and the page's own controls. */
export function ControlHeader({ title, kicker, status, tone = "ok", children }: { title: string; kicker?: ReactNode; status: ReactNode; tone?: Tone; children?: ReactNode }) {
  return <header className="cr-head">
    <div className="cr-head-main">
      {kicker && <span className="cr-kicker">{kicker}</span>}
      <h1>{title}</h1>
      <p className={`cr-status is-${tone}`} role="status"><i aria-hidden="true" />{status}</p>
    </div>
    {children && <div className="cr-head-actions">{children}</div>}
    <span className="cr-trace" aria-hidden="true" />
  </header>;
}

export interface Readout { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; dim?: boolean }
/** A strip of readings divided by hairlines (one instrument, not a grid of boxes). */
export function Readouts({ items, className = "" }: { items: Readout[]; className?: string }) {
  return <dl className={`cr-readouts ${className}`}>{items.map((r) => <div key={r.label} className={`cr-readout${r.tone ? ` is-${r.tone}` : ""}${r.dim ? " is-dim" : ""}`}>
    <dt>{r.label}</dt><dd>{r.value}</dd>{r.sub && <small>{r.sub}</small>}
  </div>)}</dl>;
}

/** A segmented switch whose pill slides to the choice. */
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return <div className="cr-seg" role="group" aria-label={label}>{options.map(([v, text]) => {
    const on = v === value;
    return <button key={String(v)} type="button" aria-pressed={on} className={on ? "is-on" : ""} onClick={() => onChange(v)}>
      {on && <motion.span layoutId={`cr-seg-${id}`} className="cr-seg-on" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
      <span>{text}</span>
    </button>;
  })}</div>;
}

/** A titled surface. */
export function Sheet({ title, hint, actions, className = "", children, id }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode; id?: string }) {
  return <section className={`cr-sheet ${className}`} id={id}>
    {(title || actions) && <header className="cr-sheet-head">{title && <h2>{title}</h2>}{hint && <small>{hint}</small>}{actions && <div className="cr-sheet-actions">{actions}</div>}</header>}
    {children}
  </section>;
}

export interface ChartSeries { id: string; label: string; color: string; values: number[]; dashed?: boolean }
interface AreaChartProps {
  xs: number[];
  series: ChartSeries[];
  /** Layers sit on top of each other (parts of one total) instead of overlapping (separate measures). */
  stacked?: boolean;
  height?: number;
  label: string;
  formatX: (x: number, i: number) => string;
  /** The axis label under point i, or null for none; the chart thins labels so they never collide. */
  tick: (x: number, i: number, n: number) => string | null;
  formatValue: (v: number) => string;
  onScrub?: (i: number | null) => void;
  /** The last point is now: it gets a soft pulse. */
  live?: boolean;
  /** Points with no measurement at all say so in the readout instead of claiming zero. */
  known?: boolean[];
  /** Width before the first measurement (server rendering, tests). */
  width?: number;
}
const PAD = { t: 14, r: 56, b: 26, l: 2 };

/** A smooth area chart you can scrub with the pointer or the arrow keys; the parent can follow along via onScrub. */
export function AreaChart({ xs, series, stacked = false, height = 220, label, formatX, tick, formatValue, onScrub, live = false, known, width }: AreaChartProps) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const w = size.w || width || 0, n = xs.length;
  const geo = useMemo(() => {
    if (!w || !n) return null;
    const iw = Math.max(1, w - PAD.l - PAD.r), ih = height - PAD.t - PAD.b;
    const tops = stacked ? stack(series.map((s) => s.values)) : series.map((s) => s.values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0)));
    const max = niceMax(Math.max(0, ...tops.flat()));
    const x = (i: number) => PAD.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v: number) => PAD.t + ih - (v / max) * ih;
    const base = xs.map((_, i) => [x(i), y(0)] as const);
    const layers = series.map((s, k) => {
      const up = tops[k]!.map((v, i) => [x(i), y(v)] as const);
      const lo = stacked && k ? tops[k - 1]!.map((v, i) => [x(i), y(v)] as const) : base;
      return { s, up, line: smoothPath(up), area: bandPath(up, lo) };
    });
    const room = Math.max(2, Math.floor(iw / 76)), step = Math.max(1, Math.ceil(n / room));
    const ticks = xs.map((at, i) => ({ i, x: x(i), text: tick(at, i, n) }))
      .filter((t) => t.text && (t.i === n - 1 || (t.i % step === 0 && n - 1 - t.i >= step * 0.75)));
    return { iw, ih, x, y, max, layers, ticks };
  }, [w, n, xs, series, stacked, height, tick]);

  const scrub = (i: number | null) => { setHover(i); onScrub?.(i); };
  const at = (clientX: number, el: SVGSVGElement) => {
    if (!geo) return null;
    const px = clientX - el.getBoundingClientRect().left;
    return Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / geo.iw) * (n - 1))));
  };
  const key = (e: React.KeyboardEvent) => {
    const cur = hover ?? n - 1;
    const next = e.key === "ArrowLeft" ? cur - 1 : e.key === "ArrowRight" ? cur + 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key === "Escape" ? null : undefined;
    if (next === undefined) return;
    e.preventDefault(); scrub(next === null ? null : Math.max(0, Math.min(n - 1, next)));
  };
  const total = (i: number) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0);

  return <div className="cr-chart" ref={ref} style={{ height }}>
    {geo && <svg width={w} height={height} role="img" aria-label={label} tabIndex={0}
      onPointerMove={(e) => scrub(at(e.clientX, e.currentTarget))} onPointerLeave={() => scrub(null)} onKeyDown={key} onBlur={() => scrub(null)}>
      <defs>{series.map((s) => <linearGradient key={s.id} id={`${uid}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style={{ stopColor: s.color, stopOpacity: stacked ? 0.5 : 0.26 }} /><stop offset="100%" style={{ stopColor: s.color, stopOpacity: stacked ? 0.1 : 0 }} />
      </linearGradient>)}</defs>
      {[0.5, 1].map((f) => <g key={f}><line className="cr-grid" x1={PAD.l} x2={w - PAD.r + 4} y1={geo.y(geo.max * f)} y2={geo.y(geo.max * f)} /><text className="cr-axis" x={w - PAD.r + 10} y={geo.y(geo.max * f) + 4}>{formatValue(geo.max * f)}</text></g>)}
      <line className="cr-base" x1={PAD.l} x2={w - PAD.r + 4} y1={geo.y(0)} y2={geo.y(0)} />
      <g className="cr-plot" key={`${n}-${xs[0] ?? 0}`}>
        {geo.layers.map((l) => <path key={`a-${l.s.id}`} className="cr-area" d={l.area} fill={`url(#${uid}-${l.s.id})`} />)}
        {geo.layers.map((l) => <path key={`l-${l.s.id}`} className="cr-line" d={l.line} style={{ stroke: l.s.color }} strokeDasharray={l.s.dashed ? "4 4" : undefined} />)}
      </g>
      {geo.ticks.map((t) => <text key={t.i} className={`cr-axis is-x${t.i === n - 1 && live ? " is-now" : ""}`} x={t.x} y={height - 7} textAnchor={t.i === 0 ? "start" : t.i === n - 1 ? "end" : "middle"}>{t.text}</text>)}
      {hover !== null ? <g className="cr-cursor">
        <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t - 4} y2={geo.y(0)} />
        {geo.layers.map((l) => <circle key={l.s.id} cx={geo.x(hover)} cy={l.up[hover]![1]} r={3.5} style={{ fill: l.s.color }} />)}
      </g> : live && geo.layers.length > 0 && <g className="cr-now">
        {(() => { const l = geo.layers.at(-1)!, p = l.up.at(-1)!; return <><circle className="cr-now-ring" cx={p[0]} cy={p[1]} r={7} style={{ fill: l.s.color }} /><circle cx={p[0]} cy={p[1]} r={3} style={{ fill: l.s.color }} /></>; })()}
      </g>}
    </svg>}
    {geo && hover !== null && <div className="cr-tip" style={{ left: Math.max(90, Math.min(w - PAD.r - 90, geo.x(hover))) }} aria-hidden="true">
      <b>{formatX(xs[hover]!, hover)}</b>
      {known && !known[hover] ? <span className="cr-tip-row is-none">Nothing recorded</span> : <>
        {[...series].reverse().map((s) => <span key={s.id} className="cr-tip-row"><i style={{ background: s.color }} />{s.label}<em>{formatValue(s.values[hover] ?? 0)}</em></span>)}
        {stacked && series.length > 1 && <span className="cr-tip-row is-total">Total<em>{formatValue(total(hover))}</em></span>}
      </>}
    </div>}
  </div>;
}

/** A tiny trend line for a row: no axes, no interaction. */
export function Sparkline({ values, color, height = 28 }: { values: number[]; color: string; height?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (values.length < 2) return <span className="cr-spark is-empty" style={{ height }} />;
  const max = Math.max(1, ...values), pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 2 + (1 - Math.max(0, v) / max) * (height - 4)] as const);
  const base = pts.map(([x]) => [x, height] as const);
  return <svg className="cr-spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
    <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} /><stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} /></linearGradient></defs>
    <path d={bandPath(pts, base)} fill={`url(#${uid})`} />
    <path d={smoothPath(pts)} fill="none" style={{ stroke: color }} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
  </svg>;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = (h: number) => (h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`);
/** When you work: a week (rows, Monday first) by hour of day (columns), each cell as bright as its share. */
export function RhythmMap({ grid, formatValue }: { grid: number[][]; formatValue: (v: number) => string }) {
  const max = Math.max(0, ...grid.flat());
  return <div className="cr-rhythm" role="img" aria-label="Usage by weekday and hour">
    <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="cr-rhythm-hour">{h % 6 === 0 ? HOURS(h) : ""}</span>)}
    {grid.map((row, d) => <div key={d} className="cr-rhythm-row">
      <span className="cr-rhythm-day">{DAYS[d]}</span>
      {row.map((v, h) => <i key={h} style={{ "--a": `${v && max ? Math.round((0.18 + 0.82 * Math.sqrt(v / max)) * 100) : 0}%` } as React.CSSProperties}
        title={`${DAYS[d]} ${HOURS(h)}–${HOURS((h + 1) % 24)}: ${v ? formatValue(v) : "nothing"}`} />)}
    </div>)}
  </div>;
}

export interface Tile { id: string; label: string; value: number; color: string; sub?: string }
/** Where it went: every tile's area is its share, biggest first; click a tile to open it. */
export function Treemap({ tiles, height = 280, formatValue, onOpen, width }: { tiles: Tile[]; height?: number; formatValue: (v: number) => string; onOpen?: (id: string) => void; width?: number }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const w = size.w || width || 0;
  const laid = useMemo(() => squarify([...tiles].sort((a, b) => b.value - a.value), { x: 0, y: 0, w, h: height }), [tiles, w, height]);
  const total = tiles.reduce((s, t) => s + t.value, 0);
  return <div className="cr-tree" ref={ref} style={{ height }}>
    {laid.map((t) => {
      const big = t.w > 84 && t.h > 58, mid = t.w > 40 && t.h > 26;
      return <button key={t.id} type="button" className="cr-tile" disabled={!onOpen || t.id === "rest"} onClick={() => onOpen?.(t.id)}
        style={{ left: t.x, top: t.y, width: t.w, height: t.h, "--c": t.color } as React.CSSProperties}
        title={`${t.label}: ${formatValue(t.value)} (${Math.round((t.value / Math.max(1, total)) * 100)}%)`}>
        {big && <b>{t.label}</b>}
        {mid && <em>{formatValue(t.value)}{big && t.sub ? <small> · {t.sub}</small> : null}</em>}
      </button>;
    })}
  </div>;
}
