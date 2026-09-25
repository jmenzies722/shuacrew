import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { ArrowUpRight, Hand, User } from "lucide-react";
import { Glyph } from "../lib/glyphs";
import { useLive } from "../lib/live";
import { selectRooms } from "../lib/room-view";
import { buildStage, type StageNode } from "../lib/floor-graph";
import { useNowPlaying } from "./NowPlaying";
import "./floor-stage.css";

const W = 1000, H = 480, CX = W / 2, CY = H / 2 + 24, RX = 380, RY = 150;
function verb(tool: string) {
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return "Reading";
  if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch|fileChange)$/.test(tool)) return "Editing";
  if (/^(Bash|commandExecution|shell)$/.test(tool)) return "Running";
  if (/^(WebFetch|WebSearch)$/.test(tool)) return "On the web";
  if (/^(Task|Agent)$/.test(tool)) return "Delegating";
  if (tool.startsWith("mcp__")) return `Using ${tool.split("__")[1]}`;
  return tool;
}
const rank = (n: StageNode) => ({ waiting: 0, working: 1, recent: 2, idle: 3 })[n.state];
/** Deterministic seats: you at the centre, the crew on an ellipse — busiest first, from the top. */
function seats(nodes: StageNode[]) {
  const others = nodes.filter((n) => n.kind !== "you").sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  const out = new Map<string, { x: number; y: number; depth: number }>([["you", { x: CX, y: CY, depth: 0.5 }]]);
  others.forEach((n, i) => {
    const t = -Math.PI / 2 + (i / Math.max(1, others.length)) * Math.PI * 2;
    const y = CY + Math.sin(t) * RY;
    out.set(n.id, { x: CX + Math.cos(t) * RX, y, depth: (y - (CY - RY)) / (2 * RY) }); // 0 = back, 1 = front
  });
  return out;
}
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return `M ${a.x} ${a.y} Q ${mx - (dy / len) * 46} ${my + (dx / len) * 46 - 18} ${b.x} ${b.y}`;
};

export function FloorStage({ runs, activity, approvals, now }: { runs: Record<string, RunView>; activity: AnyEvent[]; approvals: Record<string, { run?: string | null }>; now: number }) {
  const members = useLive((s) => s.crew.members), rooms = useLive((s) => selectRooms(s.crew));
  const track = useNowPlaying();
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => buildStage({ members, runs, rooms, approvals, activity, now }), [members, runs, rooms, approvals, activity, Math.floor(now / 1000)]);
  const pos = useMemo(() => seats(nodes), [nodes]);
  const color = useMemo(() => new Map(nodes.map((n) => [n.id, n.kind === "you" ? "var(--amber)" : n.color])), [nodes]);
  const busy = nodes.filter((n) => n.state === "working").length, waiting = nodes.filter((n) => n.state === "waiting").length;
  const handoffs = edges.filter((e) => e.kind === "delegation" && e.live).length;
  const perMin = useMemo(() => activity.filter((e) => e.kind === "tool.called" && now - e.at < 60_000).length, [activity, Math.floor(now / 5000)]);
  const open = (n: StageNode) => (n.runId ? void navigate({ to: "/sessions/$id", params: { id: n.runId } }) : n.kind === "member" ? void navigate({ to: "/crew" }) : undefined);
  const hovered = nodes.find((n) => n.id === hover);
  return <section className={`stage ${busy || waiting ? "is-live" : ""}`} aria-label="Crew stage: who is working, and for whom">
    <div className="stage-aurora" aria-hidden="true"><i /><i /><i /></div>
    <div className="stage-plane" aria-hidden="true"><span /><span /><span /></div>
    <header className="stage-head">
      <div className="stage-chips">
        <span className={`stage-chip ${busy ? "is-ok" : ""}`}><i />{busy ? `${busy} at work` : "Standing by"}</span>
        <span className={`stage-chip ${handoffs ? "is-violet" : ""}`}>{handoffs} live handoff{handoffs === 1 ? "" : "s"}</span>
        <span className={`stage-chip ${waiting ? "is-wait" : ""}`}>{waiting} waiting on you</span>
        <span className="stage-chip">{perMin} tools / min</span>
        {track.memberId && <span className="stage-chip is-ok">on stage · {track.who || track.title}</span>}
      </div>
      <ul className="stage-legend"><li><i className="is-session" />your session</li><li><i className="is-delegation" />handoff</li></ul>
    </header>
    <div className="stage-canvas">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <filter id="stage-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
          {edges.map((e) => { const a = pos.get(e.from), b = pos.get(e.to); return a && b ? <linearGradient key={e.id} id={`g-${e.id}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
            <stop offset="0%" stopColor={e.kind === "delegation" ? color.get(e.from) : "var(--amber)"} /><stop offset="100%" stopColor={color.get(e.to)} /></linearGradient> : null; })}
        </defs>
        {edges.map((e) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const d = curve(a, b), paint = `url(#g-${e.id})`;
          return <g key={e.id} className={`stage-edge is-${e.kind} ${e.live ? "is-live" : ""}`}>
            {e.live && <path d={d} fill="none" stroke={paint} strokeWidth={9} strokeOpacity={0.35} filter="url(#stage-glow)" />}
            <path d={d} fill="none" stroke={paint} strokeWidth={e.live ? 2.2 : 1.2} strokeOpacity={e.live ? 0.95 : 0.22} strokeLinecap="round" className="stage-beam" />
            {e.live && [0, 0.14, 0.26].map((lag, i) => <circle key={i} r={[5, 3.4, 2.2][i]} fill={i === 0 ? "#fff" : color.get(e.to)} opacity={[1, 0.6, 0.35][i]} className="stage-comet">
              <animateMotion dur={e.kind === "delegation" ? "1.9s" : "2.6s"} begin={`-${lag}s`} repeatCount="indefinite" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1" />
            </circle>)}
          </g>;
        })}
      </svg>
      {nodes.map((n, i) => {
        const p = pos.get(n.id)!, scale = n.kind === "you" ? 1 : 0.84 + p.depth * 0.26;
        return <button key={n.id} type="button" className={`stage-node is-${n.kind} is-${n.state}${track.memberId === n.id ? " is-on-stage" : ""}`}
          style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, zIndex: 10 + Math.round(p.depth * 10), "--c": n.color, "--s": scale, "--d": `${i * 70}ms` } as React.CSSProperties}
          onClick={() => open(n)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
          disabled={n.kind === "you"} aria-label={n.kind === "you" ? "You" : `${n.label}, ${n.sub}, ${n.state}`}>
          <span className="stage-shadow" aria-hidden="true" />
          {n.tool && <span className="stage-spark" key={n.tool.at}>{verb(n.tool.name)}{n.tool.detail ? <em> {n.tool.detail}</em> : null}</span>}
          {n.state === "waiting" && <span className="stage-need"><Hand size={10} /> needs you</span>}
          <span className="stage-orb">
            <span className="stage-glyph">{n.kind === "you" ? <User size={22} /> : n.kind === "agent" ? <b>{n.label[0]}</b> : <Glyph name={n.emoji} label={n.label} size={19} />}</span>
            {n.subagents > 0 && <span className="stage-sats" aria-label={`${n.subagents} subagents`}>{Array.from({ length: Math.min(6, n.subagents) }, (_, k) => <i key={k} style={{ "--i": k, "--n": Math.min(6, n.subagents) } as React.CSSProperties} />)}</span>}
          </span>
          <span className="stage-name">{n.label}</span>
          {n.kind !== "you" && <span className="stage-role">{n.state === "working" ? "working" : n.state === "waiting" ? "waiting on you" : n.state === "recent" ? "just finished" : n.sub}</span>}
        </button>;
      })}
      {hovered && hovered.kind !== "you" && (() => { const p = pos.get(hovered.id)!; return <div className="stage-card" style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, "--c": hovered.color } as React.CSSProperties} role="tooltip">
        <strong>{hovered.label}</strong><small>{hovered.sub}</small>
        <dl><dt>Status</dt><dd className={`is-${hovered.state}`}>{hovered.state === "recent" ? "just finished" : hovered.state}</dd>
          <dt>Sessions</dt><dd>{hovered.sessions}</dd>
          {hovered.subagents > 0 && <><dt>Subagents</dt><dd>{hovered.subagents} live</dd></>}
          {hovered.tool && <><dt>Now</dt><dd>{verb(hovered.tool.name)} {hovered.tool.detail}</dd></>}</dl>
        {hovered.runId && <span className="stage-card-cta">Open session <ArrowUpRight size={12} /></span>}
      </div>; })()}
      {!edges.length && <p className="stage-quiet">Your crew is standing by. Start a session or open a room — work and handoffs light up here as they happen.</p>}
    </div>
  </section>;
}
