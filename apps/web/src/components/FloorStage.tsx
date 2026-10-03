import { useId, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { ArrowUpRight, Hand, Radio, Layers3, User, X } from "lucide-react";
import { since } from "@shuacrew/ui";
import { Glyph } from "../lib/glyphs";
import { useLive } from "../lib/live";
import { selectRooms } from "../lib/room-view";
import { buildStage, type StageNode } from "../lib/floor-graph";
import { useNowPlaying } from "./NowPlaying";
import "./floor-stage.css";
import { AgentWorkstation } from "./AgentWorkstation";

const W = 1000, CX = W / 2;
function verb(tool: string) {
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return "Reading";
  if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch|fileChange)$/.test(tool)) return "Editing";
  if (/^(Bash|commandExecution|shell)$/.test(tool)) return "Running";
  if (/^(WebFetch|WebSearch)$/.test(tool)) return "On the web";
  if (/^(Task|Agent)$/.test(tool)) return "Delegating";
  if (tool.startsWith("mcp__")) return `Using ${tool.split("__")[1]}`;
  return tool;
}
const PAST: Record<string, string> = { Reading: "Read", Editing: "Edited", Running: "Ran", "On the web": "Browsed", Delegating: "Delegated" };
const past = (tool: string) => { const v = verb(tool); return PAST[v] ?? v; };
const detailOf = (input: unknown) => { const o = (input ?? {}) as Record<string, unknown>; const changes = Array.isArray(o.changes) ? o.changes as Array<{ path?: unknown }> : null;
  return String(changes?.[0]?.path ?? o.file_path ?? o.path ?? o.command ?? o.url ?? o.query ?? "").replace(/^\s*(?:\/bin\/)?(?:zsh|bash|sh)\s+-l?c\s+(['"])([\s\S]*)\1\s*$/, "$2").split("/").pop()!.slice(0, 42); };
/** Each member's desk, from recorded steps: the last few (newest first) and an hour of activity in 5-minute bins. */
interface Desk { steps: Array<{ tool: string; detail: string; at: number; runId: string }>; bins: number[] }
function desks(activity: AnyEvent[], runs: Record<string, RunView>, members: Record<string, unknown>, now: number) {
  const out = new Map<string, Desk>();
  for (let i = activity.length - 1; i >= 0; i--) {
    const e = activity[i]!; if (e.kind !== "tool.called" || !e.run) continue;
    const r = runs[e.run]; if (!r) continue;
    // The same owner the stage seats it under (buildStage): a known member, else the runtime's own agent.
    const owner = r.member && members[r.member] ? r.member : `agent:${r.runtime}`, d = out.get(owner) ?? out.set(owner, { steps: [], bins: Array(12).fill(0) }).get(owner)!;
    if (d.steps.length < 6) d.steps.push({ tool: e.body.tool, detail: detailOf(e.body.input), at: e.at, runId: r.parent ?? r.id });
    const bin = Math.floor((now - e.at) / 300_000); if (bin >= 0 && bin < 12) d.bins[11 - bin]! += 1;
  }
  return out;
}

function seats(nodes: StageNode[], height: number) {
  const others = nodes.filter((n) => n.kind !== "you").sort((a, b) => a.label.localeCompare(b.label));
  const out = new Map<string, { x: number; y: number; depth: number }>([["you", { x: CX, y: height - 48, depth: 1 }]]);
  others.forEach((n, i) => {
    const row = Math.floor(i / 3), count = Math.min(3, others.length - row * 3);
    out.set(n.id, { x: Math.round(W / (count + 1) * (i % 3 + 1)), y: 190 + row * 290, depth: row / Math.max(1, Math.ceil(others.length / 3)) });
  });
  return out;
}
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const hallway = Math.round(Math.min(a.y, b.y) + 134);
  return `M ${a.x} ${a.y} V ${hallway} H ${b.x} V ${b.y}`;
};

export function FloorStage({ runs, activity, approvals, now }: { runs: Record<string, RunView>; activity: AnyEvent[]; approvals: Record<string, { run?: string | null }>; now: number }) {
  const officeId = useId().replace(/:/g, "");
  const members = useLive((s) => s.crew.members), rooms = useLive((s) => selectRooms(s.crew));
  const connection = useLive(s => s.connection);
  const track = useNowPlaying();
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null), [focus, setFocus] = useState<string | null>(null);
  const desk = useMemo(() => desks(activity, runs, members, now), [activity, runs, members, Math.floor(now / 30_000)]);
  const { nodes, edges } = useMemo(() => buildStage({ members, runs, rooms, approvals, activity, now }), [members, runs, rooms, approvals, activity, Math.floor(now / 1000)]);
  const H = Math.max(480, Math.ceil((nodes.length - 1) / 3) * 290 + 190);
  const pos = useMemo(() => seats(nodes, H), [nodes, H]);
  const color = useMemo(() => new Map(nodes.map((n) => [n.id, n.kind === "you" ? "var(--amber)" : n.color])), [nodes]);
  const busy = nodes.filter((n) => n.state === "working").length, waiting = nodes.filter((n) => n.state === "waiting").length;
  const handoffs = edges.filter((e) => e.kind === "delegation" && e.live).length;
  const perMin = useMemo(() => activity.filter((e) => e.kind === "tool.called" && now - e.at < 60_000).length, [activity, Math.floor(now / 5000)]);
  // A click focuses an agent (its desk opens, the others step back); the session is one more click from there.
  const open = (n: StageNode) => setFocus((f) => (f === n.id ? null : n.id));
  const focused = nodes.find((n) => n.id === focus);
  const hovered = nodes.find((n) => n.id === hover);
  return <section className={`stage ${busy || waiting ? "is-live" : ""} ${focused ? "has-focus" : ""}`} aria-label="Crew HQ workspace" onKeyDown={event => { if (event.key === "Escape") setFocus(null); }}>
    <header className="stage-head">
      <div className="hq-heading"><span><Layers3 size={15} /> CREW HQ</span><h2>A little office. Real work.</h2><p>Every desk belongs to your crew. Select an agent to see what’s happening.</p></div>
      <span className={`hq-connection is-${connection}`}><Radio size={13} />{connection === "live" ? "Live from your crew" : connection === "connecting" ? "Reconnecting · last known state" : "Offline · last known state"}</span>
    </header>
    <div className="hq-status">
      <div className="stage-chips">
        <span className={`stage-chip ${busy ? "is-ok" : ""}`} title={busy ? undefined : "Start a session or open a room: work and handoffs light up here as they happen."}><i />{busy ? `${busy} at work` : "Standing by"}</span>
        <span className={`stage-chip ${handoffs ? "is-violet" : ""}`}>{handoffs} live handoff{handoffs === 1 ? "" : "s"}</span>
        <span className={`stage-chip ${waiting ? "is-wait" : ""}`}>{waiting} waiting on you</span>
        <span className="stage-chip">{perMin} tools / min</span>
        {track.memberId && <span className="stage-chip is-ok">on stage · {track.who || track.title}</span>}
      </div>
      <ul className="stage-legend"><li><i className="is-session" />your session</li><li><i className="is-delegation" />handoff</li></ul>
    </div>
    <div className="hq-scroll"><div className="stage-canvas" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg className="hq-office" viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden="true">
        <defs><pattern id={`${officeId}-tiles`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 0H32V32H0Z" fill="#252e3a" /><path d="M0 31H32V32H0ZM31 0H32V31H31Z" fill="#2b3542" /></pattern></defs>
        <path d={`M16 16H984V${H - 16}H16Z`} fill={`url(#${officeId}-tiles)`} />
        <path d={`M16 16H984V40H16ZM16 40H28V${H - 16}H16ZM972 40H984V${H - 16}H972Z`} fill="#465363" />
        <path d="M16 16H984V22H16Z" fill="#687584" />
        <path d={`M28 ${H - 126}H972V${H - 120}H28Z`} fill="#526070" />
        {nodes.filter(node => node.kind !== "you").map((node, index) => {
          const position = pos.get(node.id)!;
          return <g key={node.id} transform={`translate(${position.x - 112} ${position.y - 132})`}>
            <path d="M0 0H224V244H0Z" fill={index % 2 ? "#303b49" : "#343c47"} />
            <path d="M0 0H224V8H0ZM0 8H4V244H0ZM220 8H224V244H220Z" fill="#536170" />
            <path d="M4 8H220V12H4Z" fill="#1b2533" />
            <path d="M12 18H58V40H12Z" fill="#1e2a39" /><path d="M16 22H54V36H16Z" fill="#69828d" /><path d="M32 22H36V36H32Z" fill="#344655" />
            <path d="M164 18H208V40H164Z" fill="#a18c6a" /><path d="M168 22H184V25H168ZM188 22H204V25H188ZM168 29H196V32H168Z" fill="#d3c9aa" />
            <path d="M0 240H76V246H0ZM148 240H224V246H148Z" fill="#536170" />
            <path d="M90 242H134V246H90Z" fill={node.color} opacity=".55" />
          </g>;
        })}
        <g transform={`translate(60 ${H - 100})`}>
          <path d="M0 8H110V52H0Z" fill="#182332" /><path d="M4 4H106V40H4Z" fill="#586c76" /><path d="M8 8H50V30H8ZM58 8H102V30H58Z" fill="#768b91" /><path d="M0 26H8V46H0ZM102 26H110V46H102Z" fill="#475b68" /><path d="M18 62H90V68H18ZM22 68H28V80H22ZM80 68H86V80H80Z" fill="#a28769" />
          <path d="M154 28H174V52H154Z" fill="#b58d6b" /><path d="M162 0H168V32H162ZM146 10H162V24H146ZM168 4H180V18H168Z" fill="#739a7d" />
        </g>
        <g transform={`translate(790 ${H - 102})`}>
          <path d="M0 0H114V62H0Z" fill="#655b51" /><path d="M4 6H110V26H4ZM4 32H110V54H4Z" fill="#2a3037" /><path d="M10 8H18V26H10ZM22 10H30V26H22ZM34 6H42V26H34ZM52 34H60V54H52ZM64 36H74V54H64Z" fill="#899c97" /><path d="M48 10H58V26H48ZM62 8H70V26H62ZM12 36H24V54H12Z" fill="#b59877" /><path d="M80 8H98V26H80ZM82 36H102V54H82Z" fill="#647b92" />
        </g>
        <text x="60" y={H - 110} className="hq-room-label">COMMON ROOM</text><text x="790" y={H - 110} className="hq-room-label">LIBRARY</text>
      </svg>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          {edges.map((e) => { const a = pos.get(e.from), b = pos.get(e.to); return a && b ? <linearGradient key={e.id} id={`g-${e.id}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
            <stop offset="0%" stopColor={e.kind === "delegation" ? color.get(e.from) : "var(--amber)"} /><stop offset="100%" stopColor={color.get(e.to)} /></linearGradient> : null; })}
        </defs>
        {edges.map((e) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const d = curve(a, b), paint = `url(#g-${e.id})`, live = e.live && connection === "live";
          return <g key={e.id} className={`stage-edge is-${e.kind} ${live ? "is-live" : ""}`}>
            <path d={d} fill="none" stroke={paint} strokeWidth={live ? 3 : 2} strokeOpacity={live ? 0.95 : 0.22} className="stage-beam" />
          </g>;
        })}
      </svg>
      {nodes.map((n, i) => {
        const p = pos.get(n.id)!, scale = 1;
        const d = desk.get(n.id), last = d?.steps[0], peak = Math.max(1, ...(d?.bins ?? [1]));
        return <button key={n.id} type="button" className={`stage-node is-${n.kind} is-${n.state}${track.memberId === n.id ? " is-on-stage" : ""}${focus === n.id ? " is-focus" : ""}`} aria-pressed={n.kind === "you" ? undefined : focus === n.id}
          style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, zIndex: 10 + Math.round(p.depth * 10), "--c": n.color, "--s": scale, "--d": `${i * 70}ms` } as React.CSSProperties}
          onClick={() => open(n)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
          disabled={n.kind === "you"} aria-label={n.kind === "you" ? "You" : `${n.label}, ${n.sub}, ${n.state}`}>
          {n.kind !== "you" && <AgentWorkstation state={n.state} identity={n.id} live={connection === "live"} />}
          {n.tool && <span className="stage-spark" key={n.tool.at}>{verb(n.tool.name)}{n.tool.detail ? <em> {n.tool.detail}</em> : null}<i className="stage-typing" aria-hidden="true"><b /><b /><b /></i></span>}
          {n.state === "waiting" && <span className="stage-need"><Hand size={10} /> needs you</span>}
          <span className={n.kind === "you" ? "hq-command" : "hq-identity"}>
            <span className="stage-glyph">{n.kind === "you" ? <User size={22} /> : n.kind === "agent" ? <b>{n.label[0]}</b> : <Glyph name={n.emoji} label={n.label} size={19} />}</span>
            {n.subagents > 0 && <span className="hq-delegates">+{n.subagents}</span>}
          </span>
          <span className="stage-name">{n.label}</span>
          {n.kind !== "you" && <span className={`stage-role is-${n.state}`}><i />{n.state === "working" ? "At work" : n.state === "waiting" ? "Needs your approval" : n.state === "queued" ? "Queued" : n.state === "failed" ? "Needs attention" : n.state === "recent" ? "Recently active" : "Ready when you are"}</span>}
          {n.kind !== "you" && (last ? <span className="stage-desk" aria-hidden="true">
            {d!.bins.some(Boolean) && <span className="stage-bars">{d!.bins.map((v, k) => <i key={k} style={{ height: `${v ? 18 + (v / peak) * 82 : 8}%` }} className={v ? "is-on" : ""} />)}</span>}
            <small>{past(last.tool)} <em>{last.detail || last.tool}</em> · {since(last.at).replace(/ ago$/, "")}</small>
          </span> : <span className="stage-desk is-empty" aria-hidden="true"><small>Ready for work</small></span>)}
        </button>;
      })}
      {hovered && hovered.kind !== "you" && hovered.id !== focus && (() => { const p = pos.get(hovered.id)!; return <div className="stage-card" style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, "--c": hovered.color } as React.CSSProperties} role="tooltip">
        <strong>{hovered.label}</strong><small>{hovered.sub}</small>
        <dl><dt>Status</dt><dd className={`is-${hovered.state}`}>{hovered.state === "recent" ? "just finished" : hovered.state}</dd>
          <dt>Sessions</dt><dd>{hovered.sessions}</dd>
          {hovered.subagents > 0 && <><dt>Subagents</dt><dd>{hovered.subagents} live</dd></>}
          {hovered.tool && <><dt>Now</dt><dd>{verb(hovered.tool.name)} {hovered.tool.detail}</dd></>}</dl>
        {hovered.runId && <span className="stage-card-cta">View desk details <ArrowUpRight size={12} /></span>}
      </div>; })()}
      {focused && focused.kind !== "you" && (() => { const d = desk.get(focused.id); const onRight = (pos.get(focused.id)?.x ?? 0) > CX; return <aside className={`stage-focus ${onRight ? "is-left" : ""}`} style={{ "--c": focused.color } as React.CSSProperties} aria-label={`${focused.label}'s desk`}>
        <header><strong>{focused.label}</strong><small>{focused.sub} · {focused.state === "recent" ? "just finished" : focused.state}</small><button type="button" aria-label="Close" onClick={() => setFocus(null)}><X size={14} /></button></header>
        {d?.steps.length ? <ol>{d.steps.map((st, k) => <li key={k}><b>{past(st.tool)}</b> <em>{st.detail || st.tool}</em><time>{since(st.at)}</time></li>)}</ol> : <p>No recorded steps yet. Give {focused.label} something to do from Team or a room.</p>}
        {(focused.runId ?? d?.steps[0]?.runId) && <button type="button" className="stage-focus-go" onClick={() => void navigate({ to: "/sessions/$id", params: { id: (focused.runId ?? d!.steps[0]!.runId)! } })}>Open {focused.state === "working" ? "the live" : "the last"} session <ArrowUpRight size={12} /></button>}
      </aside>; })()}
    </div></div>
    <footer className="hq-footer"><span><span className="hq-key">↵</span> Select an agent to explore their work</span><span>{nodes.length - 1} agent{nodes.length === 2 ? "" : "s"} · one crew</span></footer>
  </section>;
}
