import { useEffect, useRef, useState } from "react";
import { useLive } from "../lib/live";
import { saveWorkspace, useWorkspace } from "../lib/workspace-prefs";
import { hudSeries } from "../lib/hud";
import "./dev-tools.css";

const POS = "shuacrew.hudPosition";
function loadPos() { try { const p = JSON.parse(localStorage.getItem(POS) ?? "null"); if (typeof p?.x === "number" && typeof p?.y === "number") return p as { x: number; y: number }; } catch { /* default */ } return { x: Math.max(0, window.innerWidth - 260), y: 64 }; }

/** Floating developer HUD: live stream health from what this window has actually received. */
export function DevHud() {
  const { hud } = useWorkspace();
  const connection = useLive((s) => s.connection);
  const head = useLive((s) => s.crew.head);
  const activity = useLive((s) => s.activity);
  const [now, setNow] = useState(Date.now());
  const [pos, setPos] = useState(loadPos);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.altKey && e.shiftKey && e.code === "KeyH") { e.preventDefault(); saveWorkspace({ hud: !hud }); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [hud]);
  useEffect(() => { if (!hud) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [hud]);
  if (!hud) return null;
  const { perSecond, rate, lastAt } = hudSeries(activity.map((e) => e.at), now);
  const max = Math.max(1, ...perSecond);
  const points = perSecond.map((v, i) => `${(i / (perSecond.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: Math.max(0, Math.min(window.innerWidth - 240, e.clientX - drag.current.dx)), y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy)) });
  };
  return <aside className="dev-hud" style={{ left: pos.x, top: pos.y }} aria-label="Developer HUD">
    <header onPointerDown={(e) => { drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={move} onPointerUp={() => { drag.current = null; try { localStorage.setItem(POS, JSON.stringify(pos)); } catch { /* per-viewer nicety only */ } }}>
      <span className={`dot ${connection}`} />LIVE HUD<button type="button" aria-label="Hide HUD" onClick={() => saveWorkspace({ hud: false })}>×</button>
    </header>
    <dl>
      <dt>stream</dt><dd>{connection}</dd>
      <dt>head</dt><dd>#{head.toLocaleString()}</dd>
      <dt>events/s</dt><dd>{rate.toFixed(1)}</dd>
      <dt>last event</dt><dd>{lastAt ? ago(now - lastAt) : "—"}</dd>
    </dl>
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="var(--amber)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>
  </aside>;
}
function ago(ms: number) { return ms < 1500 ? "now" : ms < 60_000 ? `${Math.round(ms / 1000)}s ago` : `${Math.round(ms / 60_000)}m ago`; }
