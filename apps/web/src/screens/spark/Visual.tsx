import { useEffect, useState, type CSSProperties } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Moon, Snowflake, Sun, Wind, TrendingDown, TrendingUp, User, Monitor, Globe, Split, Webhook, Boxes, Server, Cog, Zap, Database, Layers, HardDrive, Search, ExternalLink, KeyRound, Check, X, Lightbulb } from "lucide-react";
import { countdownParts, flowLayout, type NodeKind, type Visual, type WeatherIcon } from "../../lib/visual";

const ICONS: Record<WeatherIcon, typeof Sun> = { sun: Sun, partly: CloudSun, cloud: Cloud, rain: CloudRain, storm: CloudLightning, snow: Snowflake, wind: Wind, fog: CloudFog, night: Moon };
const NODE_ICONS: Record<NodeKind, typeof Sun> = { user: User, client: Monitor, cdn: Globe, lb: Split, api: Webhook, service: Boxes, server: Server, worker: Cog, cache: Zap, db: Database, queue: Layers, storage: HardDrive, search: Search, external: ExternalLink, auth: KeyRound };
const reduced = () => typeof matchMedia === "undefined" || (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced");

/** A number that counts up to its value (eased), once. */
function CountUp({ to, decimals }: { to: number; decimals: number }) {
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (reduced()) { setV(to); return; }
    let raf = 0; const t0 = performance.now(), dur = 900;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}

/** Grows from 0 on the next frame, so the width animates in. */
function useGrown() { const [on, setOn] = useState(false); useEffect(() => { const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r); }, []); return on; }

const stagger = (i: number) => ({ "--i": i } as CSSProperties);

/** Spark's visual card: drops from the notch (or sits in the chat), animated, in the theme's accent. */
export function VisualCard({ v, onClose }: { v: Visual; onClose?: () => void }) {
  const grown = useGrown();
  return (
    <figure className={`spk-visual is-${v.type}`} aria-label={v.title || "Visual"}>
      {v.title && <figcaption>{v.title}{onClose && <button type="button" aria-label="Close" onClick={onClose}>×</button>}</figcaption>}
      {v.type === "stat" && <div className="spk-v-stat">
        <b>{v.prefix}<CountUp to={v.value} decimals={Math.abs(v.value) < 100 && v.value % 1 ? 2 : 0} />{v.unit && <small>{v.unit}</small>}</b>
        {v.delta !== undefined && <span className={v.delta >= 0 ? "is-up" : "is-down"}>{v.delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{v.delta >= 0 ? "+" : ""}{v.delta}%{v.deltaLabel && ` ${v.deltaLabel}`}</span>}
        {v.sub && <em>{v.sub}</em>}
      </div>}
      {v.type === "compare" && (() => {
        const max = Math.max(...v.items.map((i) => Math.abs(i.value))) || 1;
        const best = v.better ? v.items.reduce((b, i) => ((v.better === "high" ? i.value > b.value : i.value < b.value) ? i : b)) : null;
        return <ul className="spk-v-bars">{v.items.map((i, k) => <li key={i.label} style={stagger(k)} className={best === i ? "is-best" : ""}>
          <span>{i.label}</span><i><s style={{ width: grown ? `${(Math.abs(i.value) / max) * 100}%` : 0 }} /></i><b>{i.display ?? i.value.toLocaleString()}</b></li>)}</ul>;
      })()}
      {v.type === "forecast" && <ol className="spk-v-forecast">{v.items.map((i, k) => { const Icon = ICONS[i.icon]; return <li key={i.label + k} style={stagger(k)}>
        <span>{i.label}</span><Icon size={20} className={`is-${i.icon}`} /><b>{Math.round(i.temp)}°</b>{i.rain !== undefined && <small>{i.rain}%</small>}</li>; })}</ol>}
      {v.type === "timeline" && <ol className="spk-v-timeline">{v.items.map((i, k) => <li key={i.time + i.label} style={stagger(k)} className={i.now ? "is-now" : ""}><time>{i.time}</time><i /><span>{i.label}</span></li>)}</ol>}
      {v.type === "steps" && <ol className="spk-v-steps">{v.steps.map((st, k) => <li key={k} style={stagger(k)}><i>{k + 1}</i><span>{st}</span></li>)}</ol>}
      {v.type === "list" && <ol className="spk-v-list">{v.items.map((i, k) => <li key={i.label} style={stagger(k)}><i>{k + 1}</i><span><b>{i.label}</b>{i.detail && <small>{i.detail}</small>}</span>{i.score !== undefined && <em>{i.score}</em>}</li>)}</ol>}
      {v.type === "flow" && <Flow v={v} />}
      {v.type === "sequence" && <Sequence v={v} />}
      {v.type === "layers" && <ol className="spk-v-layers">{v.layers.map((l, k) => <li key={l.label} style={{ ...stagger(k), "--w": `${100 - k * (40 / v.layers.length)}%` } as CSSProperties}><b>{l.label}</b>{l.detail && <small>{l.detail}</small>}</li>)}</ol>}
      {v.type === "cycle" && <Cycle v={v} />}
      {v.type === "concept" && <div className="spk-v-concept">
        <b><Lightbulb size={16} />{v.term}</b><p>{v.definition}</p>
        {v.points.length > 0 && <ul>{v.points.map((p, k) => <li key={k} style={stagger(k)}>{p}</li>)}</ul>}
        {v.analogy && <em style={stagger(v.points.length)}>Like: {v.analogy}</em>}</div>}
      {v.type === "chart" && <Chart v={v} />}
      {v.type === "score" && <div className="spk-v-score">
        {[v.home, v.away].map((side, k) => { const win = side.score > (k ? v.home : v.away).score; return <div key={k} className={win ? "is-win" : ""} style={stagger(k)}><span>{side.name}</span><b><CountUp to={side.score} decimals={0} /></b></div>; })}
        {v.status && <em>{v.status}</em>}</div>}
      {v.type === "gauge" && <div className="spk-v-gauge">
        <svg viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="42" pathLength={100} /><circle className="is-fill" cx="50" cy="50" r="42" pathLength={100} style={{ strokeDashoffset: grown ? 100 - (v.value / v.max) * 100 : 100 }} /></svg>
        <div><b><CountUp to={v.value} decimals={0} />{v.unit && <small>{v.unit}</small>}</b>{v.label && <span>{v.label}</span>}</div></div>}
      {v.type === "proscons" && <div className="spk-v-proscons">
        <ul>{v.pros.map((p, k) => <li key={k} style={stagger(k)}><Check size={13} />{p}</li>)}</ul>
        <ul>{v.cons.map((c, k) => <li key={k} style={stagger(k + v.pros.length)}><X size={13} />{c}</li>)}</ul></div>}
      {v.type === "countdown" && <Countdown v={v} />}
      {v.type === "math" && <ol className="spk-v-math">{v.steps.map((st, k) => <li key={k} style={stagger(k)}><b>{st.expr}</b>{st.note && <small>{st.note}</small>}</li>)}
        {v.answer && <li className="is-answer" style={stagger(v.steps.length)}><span>=</span><b>{v.answer}</b></li>}</ol>}
      {v.type === "code" && <div className="spk-v-code">
        <pre>{v.code.split("\n").map((line, k) => <span key={k} className={v.focus.length ? (v.focus.includes(k + 1) ? "is-focus" : "is-dim") : ""} style={stagger(k)}><i>{k + 1}</i>{line || " "}</span>)}</pre>
        {(v.lang || v.note) && <em>{v.lang && <code>{v.lang}</code>}{v.note}</em>}</div>}
      {v.type === "table" && <table className="spk-v-table"><thead><tr>{v.columns.map((c, k) => <th key={k}>{c}</th>)}</tr></thead>
        <tbody>{v.rows.map((r, k) => <tr key={k} className={v.best === k ? "is-best" : ""} style={stagger(k)}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody></table>}
      {v.type === "quiz" && <Quiz v={v} />}
    </figure>
  );
}

/** System design, drawn: boxes in columns by how far along the request flow they are, arrows between, a packet
 * travelling along each arrow in turn — so the flow is something you watch, not just read. */
function Flow({ v }: { v: Extract<Visual, { type: "flow" }> }) {
  // Each row needs the box (30) plus its label under it and air (~34): 64 per row keeps labels clear of the next box.
  const pos = flowLayout(v.nodes, v.edges), W = 320, ROW = 64, most = Math.max(...[...pos.values()].map((p) => p.rows)), H = Math.max(96, most * ROW + 8);
  const at = (id: string) => { const p = pos.get(id)!; return { x: 30 + (p.cols === 1 ? (W - 60) / 2 : (p.col * (W - 60)) / (p.cols - 1)), y: H / 2 + (p.row - (p.rows - 1) / 2) * ROW - 6 }; };
  return <svg className="spk-v-flow" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={v.title}>
    <defs><marker id="spk-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8z" /></marker></defs>
    {v.edges.map((e, k) => { const a = at(e.from), b = at(e.to), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const x1 = a.x + ux * 22, y1 = a.y + uy * 16, x2 = b.x - ux * 24, y2 = b.y - uy * 18, d = `M${x1} ${y1} L${x2} ${y2}`;
      return <g key={k} className="spk-v-edge" style={stagger(k)}>
        <path d={d} markerEnd="url(#spk-arrow)" pathLength={100} />
        {!reduced() && <circle r="3" className="spk-v-packet"><animateMotion dur="1.6s" repeatCount="indefinite" begin={`${0.6 + k * 0.45}s`} path={d} /></circle>}
        {e.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle">{e.label}</text>}</g>; })}
    {v.nodes.map((node, k) => { const p = at(node.id), Icon = NODE_ICONS[node.kind]; return <g key={node.id} className={`spk-v-node is-${node.kind}`} style={stagger(k)} transform={`translate(${p.x} ${p.y})`}>
      <rect x="-22" y="-17" width="44" height="30" rx="9" /><Icon x={-8} y={-12} width={16} height={16} />
      <text y="26" textAnchor="middle">{node.label}</text></g>; })}
  </svg>;
}

/** Who talks to whom, in order: lifelines down, each message drawn after the last. */
function Sequence({ v }: { v: Extract<Visual, { type: "sequence" }> }) {
  const W = 320, top = 26, gap = 26, H = top + v.messages.length * gap + 16, x = (i: number) => 30 + (i * (W - 60)) / (v.actors.length - 1);
  return <svg className="spk-v-seq" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={v.title}>
    {v.actors.map((a, i) => <g key={a}><text x={x(i)} y="12" textAnchor="middle" className="is-actor">{a}</text><line x1={x(i)} x2={x(i)} y1="18" y2={H - 4} /></g>)}
    {v.messages.map((m, k) => { const y = top + k * gap + 10, x1 = x(m.from), x2 = x(m.to); return <g key={k} className="spk-v-msg" style={{ "--i": k } as CSSProperties}>
      <path d={`M${x1} ${y} L${x2 + (x2 > x1 ? -4 : 4)} ${y}`} markerEnd="url(#spk-arrow-seq)" pathLength={100} />
      <text x={(x1 + x2) / 2} y={y - 5} textAnchor="middle">{m.label}</text></g>; })}
    <defs><marker id="spk-arrow-seq" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8z" /></marker></defs>
  </svg>;
}

/** A loop: the steps round a ring, the lit one moving on every second. */
function Cycle({ v }: { v: Extract<Visual, { type: "cycle" }> }) {
  const [on, setOn] = useState(0);
  useEffect(() => { if (reduced()) return; const t = setInterval(() => setOn((i) => (i + 1) % v.steps.length), 1100); return () => clearInterval(t); }, [v.steps.length]);
  // Drawn at the card's own scale (320 wide, like the flow), so labels stay the same size as everywhere else.
  const W = 320, H = 150, CX = W / 2, CY = 74, RX = 104, RY = 48;
  const place = (i: number) => { const a = (i / v.steps.length) * Math.PI * 2 - Math.PI / 2; return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) }; };
  return <svg className="spk-v-cycle" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={v.title}>
    <ellipse cx={CX} cy={CY} rx={RX} ry={RY} />
    {v.steps.map((st, i) => { const p = place(i), side = p.x > CX + 20 ? "start" : p.x < CX - 20 ? "end" : "middle";
      return <g key={st} className={i === on ? "is-on" : ""} style={stagger(i)} transform={`translate(${p.x} ${p.y})`}><circle r="5" />
        <text x={side === "start" ? 10 : side === "end" ? -10 : 0} y={side !== "middle" ? 3.5 : p.y < CY ? -10 : 17} textAnchor={side}>{st}</text></g>; })}
  </svg>;
}

/** A line that draws itself, with the area under it and the last value called out. */
function Chart({ v }: { v: Extract<Visual, { type: "chart" }> }) {
  const W = 300, H = 90, vals = v.points.map((p) => p.value), lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = v.points.map((p, i) => ({ x: 6 + (i * (W - 12)) / (v.points.length - 1), y: 8 + (1 - (p.value - lo) / span) * (H - 22) }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "), last = v.points.at(-1)!, up = last.value >= v.points[0]!.value;
  return <div className="spk-v-chart">
    <b className={up ? "is-up" : "is-down"}>{v.prefix}{last.value.toLocaleString()}{v.unit && <small>{v.unit}</small>}</b>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path className="is-area" d={`${line} L${pts.at(-1)!.x} ${H - 12} L${pts[0]!.x} ${H - 12}Z`} />
      <path className={`is-line ${up ? "is-up" : "is-down"}`} d={line} pathLength={100} />
      <circle cx={pts.at(-1)!.x} cy={pts.at(-1)!.y} r="3.5" className={up ? "is-up" : "is-down"} />
    </svg>
    <div className="spk-v-axis">{v.points.filter((_, i) => i === 0 || i === v.points.length - 1 || v.points.length <= 7).map((p, i) => <span key={i}>{p.label}</span>)}</div>
  </div>;
}

/** Ticks every second on its own (the rest of the card doesn't re-render); says so once the moment arrives. */
function Countdown({ v }: { v: Extract<Visual, { type: "countdown" }> }) {
  const at = new Date(v.target).getTime(), [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const parts = countdownParts(at - now);
  const when = new Date(at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  return <div className="spk-v-countdown" role="timer" aria-live="off">
    {parts.length ? <ol>{parts.map((p, k) => <li key={p.unit} style={stagger(k)}><b>{p.value}</b><small>{p.unit}</small></li>)}</ol> : <b className="is-now">Happening now</b>}
    <em>{v.sub ? `${when} · ${v.sub}` : when}</em>
  </div>;
}

/** Check you got it: tap an answer; right lights up, a wrong pick shows the right one and why. */
function Quiz({ v }: { v: Extract<Visual, { type: "quiz" }> }) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  return <div className="spk-v-quiz">
    <p>{v.question}</p>
    <ol>{v.options.map((o, k) => <li key={k} style={stagger(k)}>
      <button type="button" disabled={done} onClick={() => setPicked(k)}
        className={done ? (k === v.answer ? "is-right" : k === picked ? "is-wrong" : "is-dim") : ""}>
        <i>{String.fromCharCode(65 + k)}</i>{o}{done && k === v.answer && <Check size={13} />}{done && k === picked && k !== v.answer && <X size={13} />}</button></li>)}</ol>
    {done && <em className={picked === v.answer ? "is-right" : ""}>{picked === v.answer ? "Right. " : "Not quite. "}{v.why}</em>}
  </div>;
}
