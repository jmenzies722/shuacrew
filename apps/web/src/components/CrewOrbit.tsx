/**
 * The Studio floor, live: your crew in orbit around you. Each agent is a lit avatar in its own colour, ringed by what
 * it's doing (a turning ring while it works, an amber halo while it waits on you), with work visibly flowing along
 * its line to you. Below, a station per agent: what it's doing this second, a heartbeat of its last 15 minutes,
 * today's numbers, and a box to hand it something. Every state comes from recorded events; nothing is simulated.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { ArrowUp, ArrowUpRight, Loader2, Radio, X } from "lucide-react";
import { formatTokens, since } from "@shuacrew/ui";
import { useLive } from "../lib/live";
import { selectRooms } from "../lib/room-view";
import { buildStage, type StageNode } from "../lib/floor-graph";
import { launchRun } from "../lib/api";
import { Glyph } from "../lib/glyphs";
import { Sparkline } from "./ControlRoom";
import "./crew-orbit.css";

const STATE: Record<StageNode["state"], string> = { working: "Working", waiting: "Needs you", queued: "Queued", failed: "Needs attention", recent: "Just finished", idle: "Available" };

/** A tool call in words, with what it touches: "Editing Sessions.tsx", "Running npm test". */
export function doing(tool: { name: string; detail: string } | undefined): string {
  if (!tool) return "";
  const n = tool.name.replace(/^mcp__/, ""), d = tool.detail ? ` ${tool.detail}` : "";
  if (/^(Read|read_file|NotebookRead)$/i.test(n)) return `Reading${d}`;
  if (/^(Edit|Write|MultiEdit|apply_patch|fileChange|NotebookEdit)$/i.test(n)) return `Editing${d}`;
  if (/^(Bash|shell|exec_command|commandExecution|terminal)$/i.test(n)) return `Running${d}`;
  if (/^(Grep|Glob|LS|search)$/i.test(n)) return `Searching${d}`;
  if (/^(WebFetch|WebSearch|web_search)$/i.test(n)) return "Reading the web";
  if (/^(Task|spawn_agent|Agent)$/i.test(n)) return "Handing part to a helper";
  return `Using ${n.split("__")[0]}${d}`;
}

/** Where each agent sits: an ellipse around you, the first at the top, spaced evenly. */
export function orbitPositions(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, count)) * Math.PI * 2;
    return { x: 50 + Math.cos(a) * 38, y: 50 + Math.sin(a) * 34 };
  });
}

const owns = (node: StageNode, r: RunView) => r.member === node.id || (!r.member && node.id === `agent:${r.runtime}`);

export function CrewOrbit({ runs, activity, approvals, now }: { runs: Record<string, RunView>; activity: AnyEvent[]; approvals: Record<string, { run?: string | null }>; now: number }) {
  const members = useLive((s) => s.crew.members), rooms = useLive((s) => selectRooms(s.crew)), connection = useLive((s) => s.connection);
  const [selected, setSelected] = useState<string | null>(null);
  const graph = useMemo(() => buildStage({ members, rooms, runs, activity, approvals, now }), [members, rooms, runs, activity, approvals, now]);
  const agents = useMemo(() => graph.nodes.filter((n) => n.kind !== "you").sort((a, b) => a.label.localeCompare(b.label)), [graph]);
  const pos = useMemo(() => new Map(agents.map((n, i) => [n.id, orbitPositions(agents.length)[i]!])), [agents]);
  const live = connection === "live";
  const working = agents.filter((n) => n.state === "working").length, waiting = agents.filter((n) => n.state === "waiting").length;
  const focused = agents.find((n) => n.id === selected);

  // A heartbeat per agent: tool calls per minute over the last 15 minutes, from its own runs.
  const beats = useMemo(() => {
    const out = new Map<string, number[]>(), owner = new Map<string, string>();
    for (const r of Object.values(runs)) { const n = agents.find((a) => owns(a, r)); if (n) owner.set(r.id, n.id); }
    for (const n of agents) out.set(n.id, new Array<number>(15).fill(0));
    for (const e of activity) {
      if (e.kind !== "tool.called" || !e.run || now - e.at > 15 * 60_000) continue;
      const id = owner.get(e.run); if (!id) continue;
      const i = 14 - Math.floor((now - e.at) / 60_000); if (i >= 0) out.get(id)![i]!++;
    }
    return out;
  }, [activity, runs, agents, Math.floor(now / 10_000)]);

  return <section className={`orbit-wrap${live ? "" : " is-stale"}`} aria-label="Your crew, live">
    <div className="orbit" onKeyDown={(e) => { if (e.key === "Escape") setSelected(null); }}>
      <div className="orbit-bg" aria-hidden="true"><i /><i /><i /></div>
      <svg className="orbit-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {graph.edges.map((e) => {
          const a = e.from === "you" ? { x: 50, y: 50 } : pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const color = agents.find((n) => n.id === e.to)?.color ?? "var(--amber)";
          return <g key={e.id} className={`orbit-edge is-${e.kind}${e.live && live ? " is-live" : ""}`} style={{ ["--c" as string]: color }}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />
            {e.live && live && <line className="orbit-flow" x1={b.x} y1={b.y} x2={a.x} y2={a.y} vectorEffect="non-scaling-stroke" />}
          </g>;
        })}
      </svg>
      <div className="orbit-core" aria-label={`You · ${working} working · ${waiting} waiting on you`}>
        <span className="orbit-core-glow" aria-hidden="true" />
        <b>You</b><small>{waiting ? `${waiting} waiting on you` : working ? `${working} working` : "All quiet"}</small>
      </div>
      {agents.map((n) => { const p = pos.get(n.id)!, depth = 0.86 + (p.y / 100) * 0.26;
        return <button key={n.id} type="button" className={`orbit-agent is-${n.state}${selected === n.id ? " is-selected" : ""}`} aria-pressed={selected === n.id}
          style={{ left: `${p.x}%`, top: `${p.y}%`, ["--c" as string]: n.color, ["--d" as string]: depth, zIndex: Math.round(p.y) }} onClick={() => setSelected(selected === n.id ? null : n.id)}
          title={`${n.label} · ${STATE[n.state]}${n.tool ? ` · ${doing(n.tool)}` : ""}`}>
          <span className="orbit-avatar"><span className="orbit-ring" aria-hidden="true" />{n.emoji ? <Glyph name={n.emoji} fallback={n.id} label={n.label} size={22} /> : <b>{n.label.slice(0, 1)}</b>}</span>
          <span className="orbit-name">{n.label}</span>
          <span className="orbit-state">{n.state === "working" && n.tool ? doing(n.tool) : STATE[n.state]}</span>
        </button>; })}
      {!agents.length && <p className="orbit-empty">Your studio is ready. <Link to="/crew">Add your first agent →</Link></p>}
      <span className="orbit-live"><Radio size={12} />{live ? "Live" : "Last known state · reconnecting"}</span>
      {focused && <Inspector node={focused} runs={runs} activity={activity} onClose={() => setSelected(null)} />}
    </div>
    {agents.length > 0 && <div className="stations">{agents.map((n) => <Station key={n.id} node={n} runs={runs} beat={beats.get(n.id) ?? []} now={now} onOpen={() => setSelected(n.id)} />)}</div>}
  </section>;
}

/** One agent's station: now, heartbeat, today, and a box to hand it something. */
function Station({ node, runs, beat, now, onOpen }: { node: StageNode; runs: Record<string, RunView>; beat: number[]; now: number; onOpen: () => void }) {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const today = Object.values(runs).filter((r) => owns(node, r) && r.createdAt >= midnight.getTime());
  const steps = today.reduce((s, r) => s + r.toolCalls, 0), tokens = today.reduce((s, r) => s + r.usage.inputTokens + r.usage.outputTokens, 0);
  const [ask, setAsk] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const hand = async () => {
    if (!ask.trim()) return;
    setBusy(true); setNote("");
    try { await launchRun({ ask: ask.trim(), ...(node.kind === "member" ? { member: node.id } : { runtime: node.id.replace(/^agent:/, "") }) }); setAsk(""); setNote("Handed over. It's on the floor."); }
    catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  };
  return <article className={`station is-${node.state}`} style={{ ["--c" as string]: node.color }}>
    <header onClick={onOpen}>
      <span className="station-avatar">{node.emoji ? <Glyph name={node.emoji} fallback={node.id} label={node.label} size={16} /> : <b>{node.label.slice(0, 1)}</b>}</span>
      <span className="station-who"><b>{node.label}</b><small>{node.sub}</small></span>
      <span className={`station-pill is-${node.state}`}><i />{STATE[node.state]}</span>
    </header>
    <p className="station-now">{node.state === "working" ? <><Loader2 size={12} className="station-spin" />{doing(node.tool) || "Thinking"}</> : node.state === "waiting" ? "Paused before a step that needs your OK" : node.runId && runs[node.runId] ? `Last: ${runs[node.runId]!.title}` : "Ready for work"}</p>
    <Sparkline values={beat} color={node.color} height={30} />
    <footer><span>{today.length} session{today.length === 1 ? "" : "s"} today</span><span>{steps} steps</span>{tokens > 0 && <span>{formatTokens(tokens)} tok</span>}<span className="station-beat">{beat.reduce((a, b) => a + b, 0)} in 15 min</span></footer>
    <form className="station-hand" onSubmit={(e) => { e.preventDefault(); void hand(); }}>
      <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`Hand ${node.label} something…`} aria-label={`Hand ${node.label} a task`} disabled={busy} />
      <button type="submit" disabled={busy || !ask.trim()} aria-label="Hand it over">{busy ? <Loader2 size={13} className="station-spin" /> : <ArrowUp size={13} />}</button>
    </form>
    {note && <p className="station-note">{note}</p>}
  </article>;
}

/** The agent you clicked: what it's on, its sessions and its latest actions. */
function Inspector({ node, runs, activity, onClose }: { node: StageNode; runs: Record<string, RunView>; activity: AnyEvent[]; onClose: () => void }) {
  const owned = Object.values(runs).filter((r) => owns(node, r)).sort((a, b) => b.updatedAt - a.updatedAt);
  const ids = new Set(owned.map((r) => r.id));
  const recent = activity.filter((e) => e.kind === "tool.called" && e.run && ids.has(e.run)).slice(-6).reverse();
  return <aside className="orbit-inspector" style={{ ["--c" as string]: node.color }} aria-label={`${node.label} details`}>
    <header><span className="station-avatar">{node.emoji ? <Glyph name={node.emoji} fallback={node.id} label={node.label} size={16} /> : <b>{node.label.slice(0, 1)}</b>}</span>
      <span className="station-who"><b>{node.label}</b><small>{node.sub} · {STATE[node.state]}</small></span>
      <button type="button" onClick={onClose} aria-label="Close"><X size={15} /></button></header>
    {node.tool && node.state === "working" && <p className="station-now"><Loader2 size={12} className="station-spin" />{doing(node.tool)}</p>}
    <h4>Sessions</h4>
    {owned.length ? owned.slice(0, 5).map((r) => <Link key={r.id} to="/sessions/$id" params={{ id: r.id }} className="orbit-run"><b>{r.title || r.id}</b><small>{r.status.replaceAll("_", " ")} · {since(r.updatedAt)}</small><ArrowUpRight size={12} /></Link>) : <p className="orbit-muted">No sessions yet.</p>}
    <h4>Latest actions</h4>
    {recent.length ? <ol className="orbit-actions">{recent.map((e) => { const b = e.body as { tool: string; input?: Record<string, unknown> }; const detail = String(b.input?.file_path ?? b.input?.command ?? b.input?.url ?? "").split("/").pop()!.slice(0, 40);
      return <li key={e.seq}><span>{doing({ name: b.tool, detail })}</span><time>{since(e.at)}</time></li>; })}</ol> : <p className="orbit-muted">Nothing recorded recently.</p>}
    <Link to="/crew" className="orbit-manage">Manage in Agents <ArrowUpRight size={12} /></Link>
  </aside>;
}
