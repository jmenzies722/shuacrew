import { useId, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { ArrowUpRight, List, Minus, Plus, Radio, X } from "lucide-react";
import { since } from "@shuacrew/ui";
import { useLive } from "../lib/live";
import { selectRooms } from "../lib/room-view";
import { buildStage, type StageNode } from "../lib/floor-graph";
import "./crew-studio.css";

const labels: Record<StageNode["state"], string> = { working: "Working", waiting: "Needs you", queued: "Queued", failed: "Needs attention", recent: "Recently active", idle: "Available" };
const position = (index: number) => ({ x: 210 + index % 3 * 270 + (Math.floor(index / 3) % 2 ? 35 : 0), y: 210 + Math.floor(index / 3) * 235 });

export function FloorStage({ runs, activity, approvals, now }: { runs: Record<string, RunView>; activity: AnyEvent[]; approvals: Record<string, { run?: string | null }>; now: number }) {
  const id = useId().replace(/:/g, "");
  const members = useLive(s => s.crew.members), rooms = useLive(s => selectRooms(s.crew)), connection = useLive(s => s.connection);
  const [selected, setSelected] = useState<string | null>(null), [list, setList] = useState(false), [zoom, setZoom] = useState(1);
  const triggers = useRef(new Map<string, SVGElement | HTMLButtonElement>());
  const graph = useMemo(() => buildStage({ members, rooms, runs, activity, approvals, now }), [members, rooms, runs, activity, approvals, now]);
  const agents = graph.nodes.filter(n => n.kind !== "you").sort((a, b) => a.id.localeCompare(b.id));
  const focused = agents.find(n => n.id === selected);
  const positions = new Map(agents.map((n, i) => [n.id, position(i)]));
  const height = Math.max(530, Math.ceil(agents.length / 3) * 235 + 190);
  const owned = focused ? Object.values(runs).filter(r => r.member === focused.id || (!r.member && focused.id === `agent:${r.runtime}`)).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  const events = focused ? activity.filter(e => e.run && owned.some(r => r.id === e.run) && e.kind === "tool.called").slice(-5).reverse() : [];
  const close = () => { const previous = selected; setSelected(null); if (previous) triggers.current.get(previous)?.focus(); };
  const live = connection === "live";
  return <section className={`crew-studio ${live ? "is-connected" : "is-stale"}`} aria-label="Crew Studio" onKeyDown={e => { if (e.key === "Escape") close(); }}>
    <div className="studio-toolbar"><span className="studio-connection"><Radio size={12} />{live ? "Live" : "Last known state · reconnecting"}</span><div className="studio-view-controls"><button onClick={() => setList(!list)} aria-pressed={list}><List size={14} />{list ? "Studio view" : "List view"}</button>{!list && <><button onClick={() => setZoom(z => Math.max(.7, z - .1))} aria-label="Zoom out"><Minus size={14} /></button><button onClick={() => setZoom(1)}>Fit</button><button onClick={() => setZoom(z => Math.min(1.5, z + .1))} aria-label="Zoom in"><Plus size={14} /></button></>}</div></div>
    <div className={`studio-layout ${focused ? "has-selection" : ""}`}>
      <div className="studio-world-scroll">
        {list ? <div className="studio-agent-list">{agents.map(n => <button key={n.id} ref={el => { if(el) triggers.current.set(n.id,el); }} onClick={() => setSelected(n.id)} aria-pressed={selected === n.id}><span className="studio-monogram">{n.label.slice(0,1)}</span><span><strong>{n.label}</strong><small>{n.sub}</small></span><em data-state={n.state}>{labels[n.state]}</em></button>)}</div> : <svg className="studio-world" viewBox={`0 0 1000 ${height}`} style={{ width: `${zoom * 100}%`, height: `${zoom * 540}px` }} role="group" aria-label="Isometric agent workstations">
          <defs><linearGradient id={`${id}-floor`} x2="1" y2="1"><stop stopColor="#202634"/><stop offset="1" stopColor="#0a0d15"/></linearGradient><linearGradient id={`${id}-desk`} x2=".3" y2="1"><stop stopColor="#596276"/><stop offset="1" stopColor="#242b3a"/></linearGradient><radialGradient id={`${id}-light`}><stop stopColor="#7379f6" stopOpacity=".22"/><stop offset="1" stopColor="#7379f6" stopOpacity="0"/></radialGradient></defs>
          <ellipse cx="500" cy={height/2} rx="490" ry={height/2} fill={`url(#${id}-light)`}/>
          <path d={`M38 114L800 35 962 135 962 ${height-100} 235 ${height-20} 38 ${height-130}Z`} fill="#05070c" stroke="#454b6133"/>
          <path d={`M38 96L800 17 962 117 962 ${height-118} 235 ${height-38} 38 ${height-148}Z`} fill={`url(#${id}-floor)`} stroke="#5e6b8955"/>
          <path d={`M38 96L800 17 800 38 38 118Z`} fill="#303748"/>
          <path d={`M38 96V${height-148}L55 ${height-138}V108Z`} fill="#434b6133"/>
          <path d={`M66 ${height-162}L235 ${height-66} 938 ${height-143}`} stroke="#8b92ff66" fill="none"/>
          {graph.edges.filter(e => e.kind === "delegation").map(e => { const a=positions.get(e.from), b=positions.get(e.to);return a&&b?<path key={e.id} d={`M${a.x} ${a.y+60} Q500 ${Math.max(a.y,b.y)+125} ${b.x} ${b.y+60}`} className={`studio-handoff ${e.live&&live ? "is-flowing" : ""}`} />:null;})}
          {agents.map((n,i) => { const p=position(i), active=live&&n.state==="working"; return <g key={n.id} ref={el => {if(el) triggers.current.set(n.id,el);}} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`${n.label}: ${labels[n.state]}. ${n.sub}`} aria-pressed={selected===n.id} onClick={() => setSelected(n.id)} onKeyDown={e => {if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(n.id);}}} className={`studio-station ${active?"is-working":""} ${selected===n.id?"is-selected":""}`}>
            <ellipse cx="0" cy="55" rx="110" ry="39" fill="#0007"/>
            <path className="studio-station-ring" d="M-109 14L18-22 115 26-12 64Z" fill="#7e91ff08" stroke="#899eff22"/>
            <path d="M-84-2V49L-73 55V4ZM70-3V47L81 41V-9Z" fill="#111725" stroke="#616a8022"/>
            <path d="M-103-23L23-59 111-11-17 27Z" fill={`url(#${id}-desk)`} stroke="#8c9ab155"/>
            <path d="M-103-23V-15L-17 35V27ZM-17 27V35L111-3V-11Z" fill="#151c29"/>
            <path d="M-17 29L110-9" stroke={n.state==="waiting"?"#eec185":"#899aff"} strokeOpacity={active||selected===n.id?1:.25} strokeWidth="2"/>
            <path d="M-42-47L23-65V-118L-42-101Z" fill="#080c16" stroke="#8292b1" strokeWidth="2"/>
            <path d="M-37-53L18-69V-111L-37-97Z" fill={active?"#223b65":"#131c2b"}/>
            <path d="M-29-88L6-98M-29-78L-5-85M-29-68L11-80" stroke={active?"#a6c5ff":"#39465c"} strokeWidth="2" className="studio-screen-lines"/>
            <path d="M-10-54V-39L6-44V-58M-22-37L-4-43 12-35-7-29Z" fill="#333e52"/>
            <path d="M-33-14L11-27 35-14-10-1Z" fill="#151b28" stroke="#63718b55"/>
            <path d="M51-32L65-36 76-30 62-26Z" fill="#bcc7df77"/>
            <ellipse cx="54" cy="30" rx="23" ry="12" fill="#111620" stroke="#5d6880"/>
            <path d="M38 22Q37 0 52-2Q69-2 70 18L63 35H45Z" fill="#353e52" stroke="#71819c88"/>
            <circle cx="52" cy="-8" r="13" fill="#b3bdcf"/><path d="M39-10Q38-28 54-23Q66-22 66-10" fill="#182032"/>
            <circle cx="53" cy="-8" r="4" fill={active?"#b4ceff":"#46536b"} className="studio-agent-light"/>
            <text x="0" y="99" textAnchor="middle" className="studio-agent-name">{n.label.length>24?n.label.slice(0,23)+"…":n.label}</text>
            <text x="0" y="119" textAnchor="middle" className={`studio-agent-state is-${n.state}`}>{labels[n.state]}</text>
          </g>;})}
          <text x="90" y={height-104} className="studio-floor-label">SHUA / STUDIO</text>
        </svg>}
        {!agents.length && <p className="studio-empty">Your studio is ready. <Link to="/crew">Add your first agent →</Link></p>}
      </div>
      {focused && <aside className="studio-inspector" aria-label={`${focused.label} details`}><header><span className="studio-eyebrow">AGENT DETAILS</span><button onClick={close} aria-label="Close agent details"><X size={16}/></button></header><div className="studio-avatar">{focused.label.slice(0,1)}</div><h3>{focused.label}</h3><p>{focused.sub}</p><span className="studio-inspector-state" data-state={focused.state}>{labels[focused.state]}{!live ? " · last known" : ""}</span>
        <h4>Sessions</h4>{owned.length ? owned.slice(0,6).map(r => <Link key={r.id} to="/sessions/$id" params={{id:r.id}} className="studio-run"><strong>{r.title||r.id}</strong><small>{r.status.replaceAll("_"," ")} · {since(r.updatedAt)}</small><code>{r.id}</code><ArrowUpRight size={13}/></Link>) : <p className="studio-muted">No recorded sessions in this scope.</p>}
        <h4>Latest recorded actions</h4>{events.length ? <ol className="studio-events">{events.map(e => <li key={e.seq}><strong>{e.kind==="tool.called"?e.body.tool:""}</strong><time dateTime={new Date(e.at).toISOString()}>{since(e.at)}</time></li>)}</ol> : <p className="studio-muted">No recent tool actions.</p>}
        <Link to="/crew" className="studio-assignment">Manage agent & assign work <ArrowUpRight size={14}/></Link>
      </aside>}
    </div>
    <footer className="studio-footer"><span>Select a station to inspect its work · Esc to close</span><Link to="/rooms">Open a collaboration room <ArrowUpRight size={12}/></Link></footer>
  </section>;
}
