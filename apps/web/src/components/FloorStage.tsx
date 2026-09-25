import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { Hand, User } from "lucide-react";
import { Glyph } from "../lib/glyphs";
import { useLive } from "../lib/live";
import { selectRooms } from "../lib/room-view";
import { buildStage, type StageNode } from "../lib/floor-graph";
import "./floor-stage.css";

const W = 1000, H = 440;
function verb(tool: string) {
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return "Reading";
  if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch|fileChange)$/.test(tool)) return "Editing";
  if (/^(Bash|commandExecution|shell)$/.test(tool)) return "Running";
  if (/^(WebFetch|WebSearch)$/.test(tool)) return "On the web";
  if (/^(Task|Agent)$/.test(tool)) return "Delegating";
  if (tool.startsWith("mcp__")) return `Using ${tool.split("__")[1]}`;
  return tool;
}

/** Deterministic seats: you in the middle, everyone else on an ellipse (busy members first, from the top). */
function seats(nodes: StageNode[]) {
  const others = nodes.filter((n) => n.kind !== "you").sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  const out = new Map<string, { x: number; y: number }>([["you", { x: W / 2, y: H / 2 + 10 }]]);
  others.forEach((n, i) => {
    const t = -Math.PI / 2 + (i / Math.max(1, others.length)) * Math.PI * 2;
    out.set(n.id, { x: W / 2 + Math.cos(t) * 390, y: H / 2 + 10 + Math.sin(t) * 158 });
  });
  return out;
}
const rank = (n: StageNode) => ({ waiting: 0, working: 1, recent: 2, idle: 3 })[n.state];

export function FloorStage({ runs, activity, approvals, now }: { runs: Record<string, RunView>; activity: AnyEvent[]; approvals: Record<string, { run?: string | null }>; now: number }) {
  const members = useLive((s) => s.crew.members), rooms = useLive((s) => selectRooms(s.crew));
  const navigate = useNavigate();
  const { nodes, edges } = useMemo(() => buildStage({ members, runs, rooms, approvals, activity, now }), [members, runs, rooms, approvals, activity, Math.floor(now / 1000)]);
  const pos = useMemo(() => seats(nodes), [nodes]);
  const busy = nodes.filter((n) => n.state === "working" || n.state === "waiting").length;
  const path = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return `M ${a.x} ${a.y} Q ${mx - (dy / len) * 38} ${my + (dx / len) * 38} ${b.x} ${b.y}`;
  };
  const open = (n: StageNode) => (n.runId ? void navigate({ to: "/sessions/$id", params: { id: n.runId } }) : n.kind === "member" ? void navigate({ to: "/crew" }) : undefined);
  return <section className="stage" aria-label="Crew stage: who is working, and for whom">
    <header className="stage-head">
      <span className={`stage-live ${busy ? "is-on" : ""}`}>{busy ? `${busy} at work` : "Standing by"}</span>
      <ul className="stage-legend"><li><i className="is-session" />your session</li><li><i className="is-delegation" />handoff</li><li><i className="is-wait" />needs you</li></ul>
    </header>
    <div className="stage-canvas">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <radialGradient id="stage-floor" cx="50%" cy="55%" r="60%"><stop offset="0%" stopColor="var(--amber)" stopOpacity=".07" /><stop offset="100%" stopColor="var(--amber)" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx={W / 2} cy={H / 2 + 10} rx={390} ry={158} fill="url(#stage-floor)" stroke="var(--line)" strokeDasharray="2 7" />
        {edges.map((e) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const d = path(a, b), color = e.kind === "delegation" ? "#bb9af7" : "var(--amber)";
          return <g key={e.id} className={`stage-edge is-${e.kind} ${e.live ? "is-live" : ""}`}>
            <path d={d} fill="none" stroke={color} strokeOpacity={e.live ? 0.55 : 0.18} strokeWidth={e.live ? 2 : 1.25} vectorEffect="non-scaling-stroke" className="stage-edge-line" />
            {e.live && <circle r="4.5" fill={color} className="stage-pulse"><animateMotion dur={e.kind === "delegation" ? "1.8s" : "2.4s"} repeatCount="indefinite" path={d} /></circle>}
          </g>;
        })}
      </svg>
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        return <button key={n.id} type="button" className={`stage-node is-${n.kind} is-${n.state}`} style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, "--c": n.color } as React.CSSProperties}
          onClick={() => open(n)} disabled={n.kind === "you"} title={n.kind === "you" ? "You" : `${n.label}${n.sub ? ` · ${n.sub}` : ""}${n.sessions ? ` · ${n.sessions} session${n.sessions === 1 ? "" : "s"}` : ""}`}>
          {n.tool && <span className="stage-spark" key={n.tool.at}>{verb(n.tool.name)}{n.tool.detail ? <em> {n.tool.detail}</em> : null}</span>}
          {n.state === "waiting" && <span className="stage-need"><Hand size={10} /> needs you</span>}
          <span className="stage-orb">
            {n.kind === "you" ? <User size={20} /> : n.kind === "agent" ? <b>{n.label[0]}</b> : <Glyph name={n.emoji} label={n.label} size={18} />}
            {n.subagents > 0 && <span className="stage-sats" aria-label={`${n.subagents} subagents`}>{Array.from({ length: Math.min(6, n.subagents) }, (_, i) => <i key={i} style={{ "--i": i, "--n": Math.min(6, n.subagents) } as React.CSSProperties} />)}</span>}
          </span>
          <span className="stage-name">{n.label}</span>
          {n.kind !== "you" && <span className="stage-role">{n.state === "working" ? "working" : n.state === "waiting" ? "waiting on you" : n.sub}</span>}
        </button>;
      })}
      {!edges.length && <p className="stage-quiet">Your crew is standing by. Start a session or open a room — work and handoffs appear here as they happen.</p>}
    </div>
  </section>;
}
