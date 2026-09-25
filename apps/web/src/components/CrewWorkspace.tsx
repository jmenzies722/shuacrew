import type { RoomView } from "@shuacrew/core/rooms";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, CheckCheck, GitBranch, Timer, Wrench } from "lucide-react";
import { Glyph } from "../lib/glyphs";
import { useLive } from "../lib/live";
import { workspaceView } from "../lib/room-view";
import "./crew-workspace.css";
export function CrewWorkspace({ room }: { room: RoomView }) {
  const runs = useLive(s => s.crew.runs), members = useLive(s => s.crew.members), connection = useLive(s => s.connection);
  const [selectedRequest, setSelectedRequest] = useState("");
  const request = room.turns.slice(0, -1).some(t => t.requestId === selectedRequest) ? selectedRequest : "";
  const view = workspaceView(room, runs, connection, request);
  const [now, setNow] = useState(Date.now());
  const ticking = connection === "live" && view.agents.some(a => ["working", "planning", "needs approval", "queued", "usage limit"].includes(a.state));
  useEffect(() => { if (!ticking) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [ticking]);
  const children = view.agents.slice(1);
  const hasKnownState = view.agents.some(agent => !["history unavailable", "disconnected"].includes(agent.state));
  return <section className="crew-workspace" aria-label="Live crew workspace">
    <header><div><span className="room-eyebrow"><Activity size={12} /> ACTIVITY</span><h2>Inside the work</h2></div><span className={`room-pill ${connection === "live" ? "is-working" : ""}`}>{connection === "live" ? "Connected" : "Offline"}</span></header>
    <p className="crew-workspace-caption">{connection === "live" ? "Assignments, tools, and the people behind them." : "Last recorded state. Live work is unknown until reconnected."}</p>
    {room.turns.length > 1 && <label className="crew-request-picker"><span>Request history</span><select aria-label="Activity request" value={request} onChange={e => setSelectedRequest(e.target.value)}><option value="">Latest request</option>{room.turns.slice(0, -1).toReversed().map(turn => <option key={turn.requestId} value={turn.requestId}>{room.messages.find(m => m.requestId === turn.requestId && m.author === "you")?.text.slice(0, 70) ?? turn.requestId}</option>)}</select></label>}
    {!view.agents.length ? <div className="crew-activity-empty"><GitBranch size={26} /><h3>Make the first move.</h3><p>Send your crew a goal. Their assignments and real handoffs will appear here.</p></div> : <>
      <div className="crew-work-counts" aria-label="Recorded task states"><div><strong>{hasKnownState ? view.counts.working : "—"}</strong><span>Working</span></div><div><strong>{hasKnownState ? view.counts.waiting : "—"}</strong><span>Waiting</span></div><div><strong>{hasKnownState ? view.counts.complete : "—"}</strong><span>Complete</span></div></div>
      {view.agents.some(agent => agent.state === "history unavailable") && <p className="room-note">Unavailable source sessions are excluded from counts.</p>}
      <div className="crew-graph" aria-label={`${view.edges.length} delegated tasks`}>
        <div className="crew-graph-root"><GitBranch size={14} />{members[view.agents[0]!.memberId]?.name ?? view.agents[0]!.memberId}<small>Request lead</small></div>
        {!!children.length && <svg viewBox={`0 0 ${Math.max(1, children.length) * 80} 60`} preserveAspectRatio="none" aria-hidden="true">{children.map((child, i) => <path key={child.runId} d={`M ${children.length * 40} 0 V 24 H ${i * 80 + 40} V 60`} fill="none" stroke="var(--line)" strokeWidth="2" />)}</svg>}
        <div className="crew-graph-leaves">{children.map((child, i) => <a key={child.runId} href={`#task-${child.runId}`} title={members[child.memberId]?.name ?? child.memberId} aria-label={`Assignment ${i + 1}: ${child.task}`} style={{ color: members[child.memberId]?.color }}><Glyph name={members[child.memberId]?.emoji} fallback={child.memberId} size={15} /><small>{i + 1}</small></a>)}</div>
      </div>
      <div className="crew-task-list">{view.agents.map((agent, i) => {
        const active = ["working", "needs approval", "queued", "usage limit"].includes(agent.state);
        const duration = agent.startedAt ? Math.max(0, Math.floor(((active ? now : agent.updatedAt ?? now) - agent.startedAt) / 1000)) : undefined;
        return <article key={agent.runId} id={`task-${agent.runId}`} className={`crew-task is-${agent.state.replaceAll(" ", "-")}`}>
          <div className="crew-task-heading"><span className="crew-avatar" style={{ color: members[agent.memberId]?.color }}><Glyph name={members[agent.memberId]?.emoji} fallback={agent.memberId} size={16} /></span><div><strong>{members[agent.memberId]?.name ?? agent.memberId}</strong><small>{i === 0 ? "Request lead" : `Assignment ${i}`} · {agent.runtime ?? "No runtime record"}</small></div></div>
          <span className={`room-pill crew-task-state is-${agent.state.replaceAll(" ", "-")}`}>{agent.state}</span>
          {agent.task.length > 180 ? <details className="crew-task-description"><summary>{agent.task.slice(0, 160)}… <span>Full task</span></summary><p>{agent.task}</p></details> : <p>{agent.task}</p>}{agent.tool && <div className="crew-task-tool"><Wrench size={12} />{agent.tool}</div>}{agent.reason && <small>{agent.reason}</small>}
          <footer><span><Timer size={11} />{duration === undefined ? "No timing record" : `${Math.floor(duration / 60)}m ${duration % 60}s`}</span>{runs[agent.runId] ? <span><CheckCheck size={11} />{agent.checks.filter(c => c.passed).length}/{agent.checks.length} checks · {agent.files.length} files</span> : <span>Source session unavailable</span>}{runs[agent.runId] && <Link to="/sessions/$id" params={{ id: agent.runId }}>Inspect work <ArrowUpRight size={12} /></Link>}</footer>
        </article>;
      })}</div>
    </>}
    <p className="room-note">Status comes from recorded runs and tool activity. No simulated progress.</p>
  </section>;
}
