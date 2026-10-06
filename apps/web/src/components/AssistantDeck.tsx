import { useEffect, useState } from "react";
import { CalendarCheck, Check, ChevronRight, Circle, Eye, Fingerprint, Headphones, Layers3, ScanEye, Square, Timer, Zap } from "lucide-react";
import type { AssistantState } from "../lib/assistant-state";
import { screenEvidence, type ScreenEvidence } from "../lib/screen-evidence";
import "./assistant-deck.css";

const phases: Record<AssistantState["phase"], string> = { idle: "Ready when you are", preparing: "Key received", connecting: "Connecting", listening: "Listening", planning: "Working through your request", "awaiting-approval": "Needs your approval", acting: "Taking action", verifying: "Checking the result", completed: "Result ready", failed: "Needs attention", cancelled: "Task stopped" };
export interface AssistantDeckProps {
  /** A running focus timer, in words ("18m left"), so the Focus chip shows the countdown instead of starting another. */
  focusLeft?: string;
  /** What is playing right now, so the Music chip names it. */
  nowPlaying?: { title: string; artist: string; playing: boolean } | null;
  state: AssistantState; connection: "live" | "connecting" | "offline";
  screenEnabled: boolean; evidence?: ScreenEvidence; trusted: boolean; control: "off" | "ask" | "auto";
  background: Array<{ id: string; title?: string; status?: string }>;
  onMission?: () => void; onWorkflows?: () => void;
  onAsk: (text: string) => void; onStop: () => void; onAccess: () => void; onRun?: (id: string) => void;
  /** What actually answers right now, and why if it isn't the usual one. */
  brain?: { label: string; note?: string };
}
export function AssistantDeck(p: AssistantDeckProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { if (!p.evidence) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [p.evidence]);
  const observation = screenEvidence(p.screenEnabled, p.evidence, now);
  const active = !["idle", "completed", "failed", "cancelled"].includes(p.state.phase);
  const stage = p.state.phase === "awaiting-approval" ? 1 : p.state.phase === "acting" ? 2 : p.state.phase === "verifying" || p.state.phase === "completed" ? 3 : 0;
  return <section className={`assistant-deck is-${p.state.phase}`} aria-label="Shua assistant control center">
    <header className="assistant-deck-heading"><span><Zap size={12} /> SHUA <b>PERSONAL ASSISTANT</b></span><small className={`connection-${p.connection}`}><i />{p.connection === "live" ? "Connected" : p.connection === "offline" ? "Offline" : "Connecting"}</small></header>
    <div className="assistant-deck-primary" role="status" aria-live="polite"><div><span className="assistant-eyebrow">{phases[p.state.phase]}</span><strong>{p.state.phase === "idle" ? "What’s next?" : p.state.label || phases[p.state.phase]}</strong></div>{active ? <button type="button" onClick={p.onStop} aria-label="Stop task"><Square size={13} /></button> : <span className="assistant-key"><span>fn</span> hold to talk</span>}</div>
    {active && <ol className="assistant-stages" aria-label="Task stages">{["Understand", "Permission", "Act", "Verify"].map((label, i) => <li key={label} className={i === stage ? "is-current" : ""} aria-current={i === stage ? "step" : undefined}><Circle size={7} />{label}</li>)}</ol>}
    {/* One live line at the top: what's happening, and which brain answers, always in the same place. */}
    {!active && <div className="deck-status" role="status">
      <span className={`deck-now${p.background.length ? " is-live" : ""}`}><i />{p.background.length ? `${p.background.length} working in the background` : observation.status === "fresh" ? "Just looked at your screen" : "Ready when you are"}</span>
      {p.brain && <span className={`deck-brain${p.brain.note ? " is-fallback" : ""}`} title={p.brain.note ?? "The model answering right now"}><i />{p.brain.label}</span>}
    </div>}
    {!active && <div className="deck-tiles" aria-label="Shua controls">
      {p.onWorkflows && <button type="button" className="deck-tile" onClick={p.onWorkflows}><i><Eye size={16} /></i><b>Teach Shua</b><small>Show it once, replay it</small></button>}
      <button type="button" className={`deck-tile is-${observation.status}`} title={observation.detail} onClick={() => p.screenEnabled ? p.onAsk("Look at my screen now. Describe only what you can verify in the current app and display, distinguish uncertainty, and suggest one next step. Do not click anything.") : p.onAccess()}>
        <i><ScanEye size={16} /></i><b>Look with me</b><small>{observation.status === "off" ? "Screen off · tap to allow" : observation.status === "fresh" ? "Just looked" : observation.label}</small></button>
      <button type="button" className="deck-tile" onClick={p.onAccess}><i><Fingerprint size={16} /></i><b>Access & tools</b><small>{p.control === "off" ? "Mac control off" : !p.trusted ? "Needs Accessibility" : p.control === "ask" ? "Asks before each step" : "Acts on its own"}</small></button>
      {p.onMission && <button type="button" className="deck-tile" onClick={p.onMission}><i><Layers3 size={16} /></i><b>Delegate</b><small>A longer task, start to finish</small></button>}
    </div>}
    {!active && <div className="deck-pills" aria-label="Start a task">
      {p.focusLeft ? <button type="button" className="is-live" onClick={() => p.onAsk("How long is left on my focus timer?")}><Timer size={13} />Focus · {p.focusLeft}</button>
        : <button type="button" onClick={() => p.onAsk("Start a 25 minute focus timer")}><Timer size={13} />Focus 25m</button>}
      <button type="button" className={p.nowPlaying?.playing ? "is-live is-music" : undefined} title={p.nowPlaying?.title ? `${p.nowPlaying.title} · ${p.nowPlaying.artist}` : undefined}
        onClick={() => p.onAsk("Show what is playing and help me choose music using my connected music app. Ask before starting playback.")}><Headphones size={13} />{p.nowPlaying?.playing && p.nowPlaying.title ? <span>{p.nowPlaying.title}</span> : "Music"}</button>
      <button type="button" onClick={() => p.onAsk("Help me plan the rest of my day using only sources I have permitted. Show priorities and gaps; ask before changing anything.")}><CalendarCheck size={13} />Plan my day</button>
    </div>}
    {p.background.length > 0 && <div className="assistant-background"><span className="assistant-eyebrow">IN THE BACKGROUND · {p.background.length}</span>{p.background.slice(0, 3).map(run => <button type="button" key={run.id} onClick={() => p.onRun?.(run.id)}><i /><span>{run.title || "Background task"}</span><small>{run.status?.replaceAll("_", " ") || "working"}</small><ChevronRight size={12} /></button>)}</div>}
    <footer><Check size={10} />{p.control === "off" ? "Mac control is off" : !p.trusted ? "Mac control needs Accessibility access" : p.control === "ask" ? "Ask before each Mac step" : "Mac control enabled · Esc stops actions"}</footer>
  </section>;
}
