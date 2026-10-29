/**
 * Shua's board: the page inside the Mac app's board window. Shua's page sends it a lesson (through the app), then the
 * step its voice is on; the board draws that step's parts, hand-drawn, the moment it's said. Without a voice (or once
 * you take over with the arrows) it moves on by itself at reading pace.
 *
 * `?demo=1` shows a sample lesson in an ordinary browser, for screenshots and for working on the board itself.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import rough from "roughjs";
import { Boxes, ChevronLeft, ChevronRight, CircleDot, Cloud, Cpu, Database, Globe, HardDrive, ListOrdered, Lock, Monitor, Network, Presentation, Search, Server, Split, User, X, Zap } from "lucide-react";
import { layoutBoard, readingMs, stageIndex, stages, wrapLabel, type Board, type BoardKind, type BoardLayout, type BoardMessage, type Stage } from "../lib/board";
import { DEMO_BOARD } from "./demo";
import "./board.css";

declare global {
  interface Window {
    /** The app hands the board its messages here. */
    shuaBoard?: (message: BoardMessage) => void;
    webkit?: { messageHandlers?: Record<string, { postMessage: (value: unknown) => void } | undefined> };
  }
}
const post = (message: Record<string, unknown>) => { try { window.webkit?.messageHandlers?.shuaBoard?.postMessage(message); } catch { /* not in the app */ } };

const ICONS: Record<BoardKind, ComponentType<{ x?: number; y?: number; width?: number; height?: number; strokeWidth?: number; className?: string }>> = {
  user: User, client: Monitor, cdn: Globe, lb: Split, api: Network, service: Boxes, server: Server, worker: Cpu, cache: Zap,
  db: Database, queue: ListOrdered, storage: HardDrive, search: Search, external: Cloud, auth: Lock, generic: CircleDot,
};

// How a stage is drawn: its groups, then its parts one after another, then its connections.
const NODE_GAP = 420, NODE_DRAW = 560, EDGE_GAP = 360, EDGE_DRAW = 480, GROUP_DRAW = 520;
interface Timed { at: number; dur: number }
function schedule(stage: Stage, groupsFirstSeen: string[]): { groups: Map<string, Timed>; nodes: Map<string, Timed>; edges: Map<string, Timed>; done: number } {
  const groups = new Map<string, Timed>(), nodes = new Map<string, Timed>(), edges = new Map<string, Timed>();
  groupsFirstSeen.forEach((g, i) => groups.set(g, { at: i * 120, dur: GROUP_DRAW }));
  let t = groupsFirstSeen.length ? 220 : 0;
  for (const id of stage.nodes) { nodes.set(id, { at: t, dur: NODE_DRAW }); t += NODE_GAP; }
  if (stage.nodes.length) t += NODE_DRAW - NODE_GAP;
  for (const id of stage.edges) { edges.set(id, { at: t, dur: EDGE_DRAW }); t += EDGE_GAP; }
  return { groups, nodes, edges, done: t + (stage.edges.length ? EDGE_DRAW - EDGE_GAP : 0) };
}

const generator = rough.generator();
const seedOf = (text: string) => { let h = 7; for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 2_000_000) + 1; };
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
}
/** A hand-drawn stroke: rough's paths for the shape (two passes of a felt-tip, a little wobble, the same every time). */
function sketch(d: string, seed: number, roughness = 0.9): string[] {
  return generator.toPaths(generator.path(d, { roughness, bowing: 0.7, strokeWidth: 1.8, seed, stroke: "currentColor", fill: undefined })).map((p) => p.d);
}
/** A smooth route through dagre's points (a quadratic through each midpoint), and its arrowhead. */
function route(points: Array<{ x: number; y: number }>): { d: string; head: string } {
  if (points.length < 2) return { d: "", head: "" };
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) { const p = points[i]!, n = points[i + 1]!; d += ` Q${p.x},${p.y} ${(p.x + n.x) / 2},${(p.y + n.y) / 2}`; }
  const end = points[points.length - 1]!, from = points[points.length - 2]!;
  d += ` L${end.x},${end.y}`;
  const a = Math.atan2(end.y - from.y, end.x - from.x), s = 11;
  const head = `M${end.x - s * Math.cos(a - 0.45)},${end.y - s * Math.sin(a - 0.45)} L${end.x},${end.y} L${end.x - s * Math.cos(a + 0.45)},${end.y - s * Math.sin(a + 0.45)}`;
  return { d, head };
}

/**
 * One stroke that draws itself on: its length is measured once it's in the page, then the dash slides to zero at an
 * even pace. With `pen`, a small tip rides the end of the line as it grows (moved along the path by script: WebKit's
 * offset-path on SVG can't be relied on, and a pen stuck in the corner is worse than none).
 */
function Ink({ d, at, dur, className, pen }: { d: string; at: number; dur: number; className?: string; pen?: boolean }) {
  const ref = useRef<SVGPathElement>(null), tip = useRef<SVGCircleElement>(null), [len, setLen] = useState(0);
  useLayoutEffect(() => { try { setLen(Math.ceil(ref.current?.getTotalLength() ?? 0) + 2); } catch { setLen(1); } }, [d]);
  useEffect(() => {
    const path = ref.current, dot = tip.current;
    if (!pen || !len || !dur || !path || !dot || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now() + at;
    const tick = (now: number) => {
      const t = (now - start) / dur;
      if (t >= 1) { dot.style.opacity = "0"; return; }
      if (t >= 0) { const p = path.getPointAtLength(t * len); dot.setAttribute("cx", String(p.x)); dot.setAttribute("cy", String(p.y)); dot.style.opacity = "1"; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); dot.style.opacity = "0"; };
  }, [pen, len, at, dur]);
  const style = { "--len": len || 1, "--at": `${at}ms`, "--dur": `${dur}ms` } as React.CSSProperties;
  return <>
    <path ref={ref} d={d} className={`board-ink ${len ? "is-drawing" : ""} ${className ?? ""}`} style={style} />
    {pen && <circle ref={tip} r={4.2} className="board-pen" />}
  </>;
}

export default function BoardPage() {
  const [board, setBoard] = useState<Board | null>(() => (new URLSearchParams(location.search).has("demo") ? DEMO_BOARD : null));
  const [accent, setAccent] = useState<string | undefined>();
  const [stage, setStage] = useState(0);
  const [manual, setManual] = useState(false);
  const speaking = useRef(false), quietSince = useRef(Date.now()), drawnAt = useRef(Date.now());
  // The message handler is installed once, so it reads the board and whether you've taken over from refs.
  const boardRef = useRef(board), manualRef = useRef(manual);
  boardRef.current = board; manualRef.current = manual;
  const [view, setView] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => { const on = () => setView({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);

  const plan = useMemo(() => (board ? stages(board) : []), [board]);
  // The canvas is the window less the header and caption.
  const layout = useMemo<BoardLayout | null>(() => (board ? layoutBoard(board, { width: Math.max(320, view.width - 44), height: Math.max(240, view.height - 260) }) : null), [board, view]);
  const last = Math.max(0, plan.length - 1);
  const go = useCallback((next: number) => setStage(Math.max(0, Math.min(last, next))), [last]);

  // The app's messages.
  useEffect(() => {
    window.shuaBoard = (message) => {
      if (message.op === "show") { setBoard(message.board); setAccent(message.accent); setStage(0); setManual(false); drawnAt.current = Date.now(); }
      // The voice only moves the board forward (a summary sentence between steps never takes a step back), and never
      // after you've taken over with the arrows.
      else if (message.op === "step") { const b = boardRef.current; if (b && b.key === message.key && message.step && !manualRef.current) { const i = stageIndex(b, message.step); setStage((s) => Math.max(s, i)); } }
      else if (message.op === "speaking") { speaking.current = message.on; if (!message.on) quietSince.current = Date.now(); }
      else if (message.op === "hide") setBoard(null);
    };
    post({ type: "boardReady" });
    return () => { window.shuaBoard = undefined; };
  }, []);
  useEffect(() => { drawnAt.current = Date.now(); }, [stage]);

  // At reading pace when nothing is saying it: a self-paced board, a voice that has gone quiet, or no voice at all.
  useEffect(() => {
    if (!board || manual || stage >= last) return;
    const timer = setInterval(() => {
      const step = board.steps[stage]; // the next stage's step (stage i+1 is steps[i])
      const hold = schedule(plan[stage]!, []).done + readingMs(stage === 0 ? board.summary || board.title : board.steps[stage - 1]?.body ?? "");
      const quiet = board.paced === "self" || (!speaking.current && Date.now() - quietSince.current > 2500);
      if (step && quiet && Date.now() - drawnAt.current > hold) setStage((s) => Math.min(last, s + 1));
    }, 400);
    return () => clearInterval(timer);
  }, [board, manual, stage, last, plan]);

  const close = useCallback(() => { post({ type: "boardClose" }); setBoard(null); }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") { setManual(true); go(stage + 1); }
      else if (e.key === "ArrowLeft") { setManual(true); go(stage - 1); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [close, go, stage]);

  if (!board || !layout) return <div className="board-root is-empty" />;
  const step = stage > 0 ? board.steps[stage - 1] : undefined;
  // Which stage first shows each part and group, and when within it.
  const shownAt = new Map<string, number>();
  plan.forEach((s, i) => { for (const id of [...s.nodes, ...s.edges]) shownAt.set(id, i); });
  const groupStage = new Map<string, number>();
  for (const n of board.nodes) if (n.group) groupStage.set(n.group, Math.min(groupStage.get(n.group) ?? Infinity, shownAt.get(n.id) ?? 0));
  const timing = plan.map((s, i) => schedule(s, [...groupStage].filter(([, at]) => at === i).map(([g]) => g)));
  const current = new Set([...(plan[stage]?.nodes ?? []), ...(plan[stage]?.edges ?? [])]);
  const ask = (label: string) => post({ type: "boardAsk", text: `Tell me more about ${label} in this design.` });
  const style = (accent ? { "--board-accent": accent } : {}) as React.CSSProperties;

  return <div className="board-root" style={style}>
    <section className="board" role="dialog" aria-label={board.title}>
      <header className="board-head">
        <span className="board-kicker"><Presentation size={13} aria-hidden /> Shua's board</span>
        <h1>{board.title}</h1>
        {board.scope && <p className="board-scope">{board.scope}</p>}
        <nav className="board-controls" aria-label="Board steps">
          <button type="button" aria-label="Previous step" disabled={stage === 0} onClick={() => { setManual(true); go(stage - 1); }}><ChevronLeft size={16} /></button>
          <span className="board-count">{stage === 0 ? "Overview" : `${stage} / ${board.steps.length}`}</span>
          <button type="button" aria-label="Next step" disabled={stage >= last} onClick={() => { setManual(true); go(stage + 1); }}><ChevronRight size={16} /></button>
          <button type="button" className="board-close" aria-label="Close the board" onClick={close}><X size={16} /></button>
        </nav>
      </header>
      <div className="board-canvas">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${board.title}: ${board.nodes.map((n) => n.label).join(", ")}`}>
          {layout.groups.map((g) => {
            const at = groupStage.get(g.name) ?? 0;
            if (at > stage) return null;
            const t = at === stage ? timing[at]!.groups.get(g.name) ?? { at: 0, dur: 0 } : { at: 0, dur: 0 };
            return <g key={`group:${g.name}`} className="board-group" style={{ "--at": `${t.at}ms` } as React.CSSProperties}>
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={18} />
              <text x={g.x + 16} y={g.y + 22}>{g.name}</text>
            </g>;
          })}
          {board.edges.map((e) => {
            const at = shownAt.get(e.id) ?? 0;
            if (at > stage) return null;
            const t = at === stage ? timing[at]!.edges.get(e.id)! : { at: 0, dur: 0 };
            const { d, head } = route(layout.edges.get(e.id) ?? []);
            if (!d) return null;
            const pts = layout.edges.get(e.id)!, mid = pts[Math.floor(pts.length / 2)]!;
            return <g key={e.id} className={`board-edge ${current.has(e.id) ? "is-now" : ""}`}>
              {sketch(d, seedOf(e.id), 0.7).map((p, i) => <Ink key={i} d={p} at={t.at} dur={t.dur} pen={i === 0 && at === stage} />)}
              <Ink d={head} at={t.at + t.dur * 0.85} dur={160} />
              {e.label && <g className="board-edge-label" style={{ "--at": `${t.at + t.dur * 0.7}ms` } as React.CSSProperties}>
                <rect x={mid.x - e.label.length * 3.4 - 8} y={mid.y - 11} width={e.label.length * 6.8 + 16} height={20} rx={10} />
                <text x={mid.x} y={mid.y + 4} textAnchor="middle">{e.label}</text>
              </g>}
            </g>;
          })}
          {board.nodes.map((n) => {
            const at = shownAt.get(n.id) ?? 0;
            if (at > stage) return null;
            const box = layout.nodes.get(n.id)!, t = at === stage ? timing[at]!.nodes.get(n.id)! : { at: 0, dur: 0 };
            const Icon = ICONS[n.kind], lines = wrapLabel(n.label);
            const role = n.role && n.role.length > 30 ? `${n.role.slice(0, 29).trimEnd()}…` : n.role;
            return <g key={n.id} className={`board-node ${current.has(n.id) ? "is-now" : ""}`} role="button" tabIndex={0} aria-label={`${n.label}${n.role ? `: ${n.role}` : ""}`}
              onClick={() => ask(n.label)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ask(n.label); } }}>
              <rect className="board-node-fill" x={box.x} y={box.y} width={box.w} height={box.h} rx={14} style={{ "--at": `${t.at + t.dur * 0.4}ms` } as React.CSSProperties} />
              {sketch(roundedRect(box.x, box.y, box.w, box.h, 14), seedOf(n.id)).map((p, i) => <Ink key={i} d={p} at={t.at} dur={t.dur} pen={i === 0 && at === stage} />)}
              <g className="board-node-text" style={{ "--at": `${t.at + t.dur * 0.55}ms` } as React.CSSProperties}>
                <Icon x={box.x + 14} y={box.y + box.h / 2 - 10 - (role ? 6 : 0)} width={20} height={20} strokeWidth={1.8} className="board-node-icon" />
                {lines.map((line, i) => <text key={i} className="board-node-label" x={box.x + 44} y={box.y + box.h / 2 + (i - (lines.length - 1) / 2) * 17 + 5 - (role ? 7 : 0)}>{line}</text>)}
                {role && <text className="board-node-role" x={box.x + 44} y={box.y + box.h / 2 + (lines.length - 1) * 8.5 + 15}>{role}</text>}
              </g>
            </g>;
          })}
        </svg>
      </div>
      <footer className="board-caption" aria-live="polite">
        <small>{stage === 0 ? "The big picture" : `Step ${stage} of ${board.steps.length}`}</small>
        <strong>{step?.title ?? board.title}</strong>
        {(step?.body || board.summary) && <p>{step?.body ?? board.summary}</p>}
        <div className="board-dots" aria-hidden>{plan.map((_, i) => <i key={i} data-on={i <= stage} data-now={i === stage} />)}</div>
        {stage === last && board.followups.length > 0 && <div className="board-followups">{board.followups.map((f) => <button type="button" key={f} onClick={() => post({ type: "boardAsk", text: f })}>{f}</button>)}</div>}
      </footer>
    </section>
  </div>;
}
