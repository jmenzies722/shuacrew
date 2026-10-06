/**
 * The Studio floor in 3D: a room you can turn, with a desk per agent and your platform up front. Agents sit at their
 * desks while they work (the screen shows the real step), walk over to you when they need your OK or bring finished
 * work back, and walk home again. Live work flows along the floor to you. Every state and step comes from recorded
 * events; only the camera is yours to move. Pure CSS 3D (perspective + preserve-3d), no WebGL.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { Check, Hand, Radio, RotateCcw, TriangleAlert } from "lucide-react";
import { useLive } from "../lib/live";
import { selectRooms } from "../lib/room-view";
import { buildStage, type StageNode } from "../lib/floor-graph";
import { Glyph } from "../lib/glyphs";
import { CAMERA, HUB, VIEWS, WORLD, clampCamera, deskLayout, spotFor, type Camera, type Desk } from "../lib/studio-layout";
import { Inspector, STATE, Station, doing, owns } from "./CrewStations";
import "./crew-studio3d.css";

const CAMERA_KEY = "shuacrew.studio.camera";
const loadCamera = (): Camera => { try { const v = JSON.parse(localStorage.getItem(CAMERA_KEY) ?? "null") as Camera | null; return v && [v.spin, v.tilt, v.zoom].every(Number.isFinite) ? clampCamera(v) : CAMERA; } catch { return CAMERA; } };
const saveCamera = (c: Camera) => { try { localStorage.setItem(CAMERA_KEY, JSON.stringify(c)); } catch { /* this view only */ } };
const WALK_MS = 1800;
type Css = React.CSSProperties & Record<`--${string}`, string | number>;

export function CrewStudio3D({ runs, activity, approvals, now }: { runs: Record<string, RunView>; activity: AnyEvent[]; approvals: Record<string, { run?: string | null }>; now: number }) {
  const members = useLive((s) => s.crew.members), rooms = useLive((s) => selectRooms(s.crew)), connection = useLive((s) => s.connection);
  const [selected, setSelected] = useState<string | null>(null);
  const graph = useMemo(() => buildStage({ members, rooms, runs, activity, approvals, now }), [members, rooms, runs, activity, approvals, now]);
  const agents = useMemo(() => graph.nodes.filter((n) => n.kind !== "you").sort((a, b) => a.label.localeCompare(b.label)), [graph]);
  const desks = useMemo(() => new Map(agents.map((n, i) => [n.id, deskLayout(agents.length)[i]!])), [agents]);
  const visitors = agents.filter((n) => n.state === "waiting" || n.state === "recent");
  const live = connection === "live";
  const working = agents.filter((n) => n.state === "working").length, waiting = agents.filter((n) => n.state === "waiting").length;
  const focused = agents.find((n) => n.id === selected);

  // The camera: drag to turn and tilt, pinch to zoom, arrow keys too. Remembered on this Mac.
  const [cam, setCam] = useState<Camera>(loadCamera);
  const move = (c: Camera) => { const next = clampCamera(c); setCam(next); saveCamera(next); };
  const stage = useRef<HTMLDivElement>(null), [fit, setFit] = useState(1);
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setFit(Math.min(0.92, Math.max(0.4, Math.min((e!.contentRect.width - 24) / 1240, (e!.contentRect.height - 20) / 820)))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null), dragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  const onDown = (e: React.PointerEvent) => { if (e.button !== 0 || (e.target as HTMLElement).closest(".s3-ui, .studio-inspector")) return; drag.current = { x: e.clientX, y: e.clientY, cam, moved: false }; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; setDragging(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    setCam(clampCamera({ ...d.cam, spin: d.cam.spin + dx * 0.3, tilt: d.cam.tilt - dy * 0.22 }));
  };
  // A drag that turned the room isn't also a click on whoever was under the pointer.
  const onUp = () => { const d = drag.current; drag.current = null; if (d?.moved) { setDragging(false); saveCamera(cam); dragged.current = true; setTimeout(() => { dragged.current = false; }, 0); } };
  useEffect(() => {
    const el = stage.current; if (!el) return;
    // Pinch (ctrl+wheel on a trackpad) zooms; a plain scroll keeps scrolling the page.
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); setCam((c) => { const n = clampCamera({ ...c, zoom: c.zoom * Math.exp(-e.deltaY * 0.01) }); saveCamera(n); return n; }); };
    el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel);
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setSelected(null);
    const step: Record<string, Partial<Camera>> = { ArrowLeft: { spin: cam.spin - 8 }, ArrowRight: { spin: cam.spin + 8 }, ArrowUp: { tilt: cam.tilt - 6 }, ArrowDown: { tilt: cam.tilt + 6 }, "+": { zoom: cam.zoom * 1.1 }, "=": { zoom: cam.zoom * 1.1 }, "-": { zoom: cam.zoom / 1.1 } };
    if (step[e.key] && e.target === e.currentTarget) { e.preventDefault(); move({ ...cam, ...step[e.key] }); }
  };

  // A heartbeat per agent for its station: tool calls per minute over the last 15 minutes.
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

  const world: Css = { "--spin": `${cam.spin}deg`, "--tilt": `${cam.tilt}deg`, width: WORLD.w, height: WORLD.d, marginLeft: -WORLD.w / 2, marginTop: -WORLD.d / 2 };
  return <section className={`studio3d-wrap${live ? "" : " is-stale"}`} aria-label="Your crew, live, in 3D">
    <div ref={stage} className={`studio3d${dragging ? " is-dragging" : ""}`} tabIndex={0} aria-label="Studio floor. Drag or use the arrow keys to turn the room; pinch or plus and minus to zoom."
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
      onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); } }}>
      <div className="s3-sky" aria-hidden="true" />
      <div className="s3-camera" style={{ transform: `scale(${(fit * cam.zoom).toFixed(3)})` }}>
        <div className="s3-world" style={world}>
          <div className="s3-floor" aria-hidden="true" />
          <svg className="s3-paths" viewBox={`0 0 ${WORLD.w} ${WORLD.d}`} aria-hidden="true">
            {agents.map((n) => { const d = desks.get(n.id)!, flowing = n.state === "working" && live;
              return <path key={n.id} className={`s3-path${flowing ? " is-live" : ""}${n.state === "waiting" ? " is-wait" : ""}`} style={{ ["--c" as string]: n.color }}
                d={`M ${d.x} ${d.y + 34} L ${HUB.x} ${HUB.y - 70}`} />; })}
          </svg>
          {agents.map((n) => <Desk3D key={n.id} node={n} desk={desks.get(n.id)!} live={live} />)}
          <Hub3D waiting={waiting} working={working} />
          {live && agents.filter((n) => n.state === "working").map((n) => <Packets key={n.id} node={n} desk={desks.get(n.id)!} />)}
          {/* With a crowd at your platform, finished work just says "Done"; its title is on the station below. */}
          {agents.map((n) => { const v = visitors.indexOf(n), spot = spotFor(n.state, desks.get(n.id)!, Math.max(0, v), visitors.length);
            return <Agent3D key={n.id} node={n} x={spot.x} y={spot.y} away={spot.at === "you"} title={n.runId && visitors.length <= 2 ? runs[n.runId]?.title : undefined}
              selected={selected === n.id} onPick={() => setSelected(selected === n.id ? null : n.id)} />; })}
        </div>
      </div>

      <div className="s3-ui s3-top">
        <span className="s3-live"><Radio size={12} />{live ? "Live" : "Last known state · reconnecting"}</span>
        <span className="s3-count">{waiting ? <><Hand size={12} /> {waiting} waiting on you</> : working ? `${working} at work` : agents.length ? "Everyone at their desk" : ""}</span>
      </div>
      <div className="s3-ui s3-views" role="group" aria-label="Camera">
        {(Object.keys(VIEWS) as Array<keyof typeof VIEWS>).map((k) => <button key={k} type="button" className={JSON.stringify(cam) === JSON.stringify(clampCamera(VIEWS[k])) ? "is-on" : ""} onClick={() => move(VIEWS[k])}>{k === "studio" ? "Studio" : k === "above" ? "Above" : "Close"}</button>)}
        <button type="button" aria-label="Reset the view" title="Reset the view" onClick={() => move(CAMERA)}><RotateCcw size={12} /></button>
      </div>
      <p className="s3-ui s3-hint" aria-hidden="true">Drag to turn · pinch to zoom · click anyone</p>
      {!agents.length && <p className="s3-ui s3-empty">Your studio is ready. <Link to="/crew">Add your first agent →</Link></p>}
      {focused && <Inspector node={focused} runs={runs} activity={activity} onClose={() => setSelected(null)} />}
    </div>
    {agents.length > 0 && <div className="stations">{agents.map((n) => <Station key={n.id} node={n} runs={runs} beat={beats.get(n.id) ?? []} now={now} onOpen={() => setSelected(n.id)} />)}</div>}
  </section>;
}

/** A desk: a solid box with a screen facing you that shows the real step while its agent works. */
function Desk3D({ node, desk, live }: { node: StageNode; desk: Desk; live: boolean }) {
  const on = node.state === "working";
  return <div className={`s3-desk is-${node.state}`} style={{ left: desk.x - 66, top: desk.y - 32, ["--c" as string]: node.color }} aria-hidden="true">
    <i className="s3-lamp" />
    <i className="s3-face s3-top-face" /><i className="s3-face s3-front"><span>{node.label}</span></i><i className="s3-face s3-back" /><i className="s3-face s3-left" /><i className="s3-face s3-right" />
    <div className="s3-screen">
      <span className="s3-screen-glass">{on && node.tool ? <><b>{doing(node.tool).split(" ")[0]}</b><small>{node.tool.detail || node.tool.name.replace(/^mcp__/, "")}</small></> : node.state === "waiting" ? <b>Paused</b> : node.state === "failed" ? <b>Stopped</b> : <small>{node.label}</small>}</span>
      {on && live && <span className="s3-scan" />}
    </div>
  </div>;
}

/** Your platform, front and centre: it glows amber while anyone waits on you. */
function Hub3D({ waiting, working }: { waiting: number; working: number }) {
  return <div className={`s3-hub${waiting ? " is-wait" : working ? " is-busy" : ""}`} style={{ left: HUB.x - 92, top: HUB.y - 92 }}>
    <i className="s3-hub-pulse" /><i className="s3-hub-pulse" /><i className="s3-hub-disc" /><i className="s3-hub-top" />
    <div className="s3-bill s3-you"><b>You</b><small>{waiting ? `${waiting} waiting on you` : working ? `${working} working` : "All quiet"}</small></div>
  </div>;
}

/** Work flowing from a working agent's desk to you, along the floor. */
function Packets({ node, desk }: { node: StageNode; desk: Desk }) {
  const style = (i: number): Css => ({ "--x1": `${desk.x}px`, "--y1": `${desk.y + 36}px`, "--x2": `${HUB.x}px`, "--y2": `${HUB.y - 70}px`, "--c": node.color, animationDelay: `${i * 0.9}s` });
  return <>{[0, 1].map((i) => <i key={i} className="s3-packet" style={style(i)} aria-hidden="true" />)}</>;
}

/** An agent: stands where its state puts it, walks there when that changes, and faces you whichever way the room turns. */
function Agent3D({ node, x, y, away, title, selected, onPick }: { node: StageNode; x: number; y: number; away: boolean; title?: string; selected: boolean; onPick: () => void }) {
  const [walking, setWalking] = useState(false);
  const was = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const prev = was.current; was.current = { x, y };
    if (!prev || (prev.x === x && prev.y === y)) return;
    setWalking(true); const t = setTimeout(() => setWalking(false), WALK_MS); return () => clearTimeout(t);
  }, [x, y]);
  const bubble = node.state === "working" ? doing(node.tool) || "Thinking"
    : node.state === "waiting" ? "Needs your OK"
    : node.state === "recent" ? `Done${title ? ` · ${title}` : ""}`
    : node.state === "failed" ? "Hit a problem" : node.state === "queued" ? "Up next" : "";
  return <div className={`s3-spot is-${node.state}${walking ? " is-walking" : ""}${away ? " is-away" : ""}${selected ? " is-selected" : ""}`}
    style={{ transform: `translate3d(${x}px, ${y}px, 0)`, ["--c" as string]: node.color }}>
    <i className="s3-shadow" aria-hidden="true" /><i className="s3-halo" aria-hidden="true" />
    <div className="s3-bill">
      {bubble && <span className="s3-bubble">{node.state === "waiting" ? <Hand size={11} /> : node.state === "recent" ? <Check size={11} /> : node.state === "failed" ? <TriangleAlert size={11} /> : null}{bubble}</span>}
      <button type="button" className="s3-figure" onClick={onPick} aria-pressed={selected}
        aria-label={`${node.label} · ${STATE[node.state]}${node.state === "working" && node.tool ? ` · ${doing(node.tool)}` : ""}`}>
        <span className="s3-head">{node.emoji ? <Glyph name={node.emoji} fallback={node.id} label={node.label} size={18} /> : <b>{node.label.slice(0, 1)}</b>}</span>
        <span className="s3-body"><i /><i /></span>
      </button>
      <span className="s3-name">{node.label}</span>
    </div>
  </div>;
}
