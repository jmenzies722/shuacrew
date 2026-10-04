import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, Circle, Eye, Fingerprint, Headphones, Layers3, ShieldCheck, Square, Timer, Zap } from "lucide-react";
import type { AssistantState } from "../lib/assistant-state";
import { screenEvidence, type ScreenEvidence } from "../lib/screen-evidence";
import "./assistant-deck.css";

const phases: Record<AssistantState["phase"], string> = { idle: "Ready when you are", preparing: "Key received", connecting: "Connecting", listening: "Listening", planning: "Working through your request", "awaiting-approval": "Needs your approval", acting: "Taking action", verifying: "Checking the result", completed: "Result ready", failed: "Needs attention", cancelled: "Task stopped" };
export interface AssistantDeckProps {
  state: AssistantState; connection: "live" | "connecting" | "offline";
  screenEnabled: boolean; evidence?: ScreenEvidence; trusted: boolean; control: "off" | "ask" | "auto";
  background: Array<{ id: string; title?: string; status?: string }>;
  onMission?: () => void; onWorkflows?: () => void;
  onAsk: (text: string) => void; onStop: () => void; onAccess: () => void; onRun?: (id: string) => void;
}
export function AssistantDeck(p: AssistantDeckProps) {
  const [now, setNow] = useState(Date.now);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => { if (!p.evidence) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [p.evidence]);
  const observation = screenEvidence(p.screenEnabled, p.evidence, now);
  const active = !["idle", "completed", "failed", "cancelled"].includes(p.state.phase);
  const stage = p.state.phase === "awaiting-approval" ? 1 : p.state.phase === "acting" ? 2 : p.state.phase === "verifying" || p.state.phase === "completed" ? 3 : 0;
  return <section className={`assistant-deck is-${p.state.phase}`} aria-label="Shua assistant control center">
    <header className="assistant-deck-heading"><span><Zap size={12} /> SHUA <b>PERSONAL ASSISTANT</b></span><small className={`connection-${p.connection}`}><i />{p.connection === "live" ? "Connected" : p.connection === "offline" ? "Offline" : "Connecting"}</small></header>
    <div className="assistant-deck-primary" role="status" aria-live="polite"><div><span className="assistant-eyebrow">{phases[p.state.phase]}</span><strong>{p.state.phase === "idle" ? "What’s next?" : p.state.label || phases[p.state.phase]}</strong></div>{active ? <button type="button" onClick={p.onStop} aria-label="Stop task"><Square size={13} /></button> : <span className="assistant-key"><span>fn</span> hold to talk</span>}</div>
    {active && <ol className="assistant-stages" aria-label="Task stages">{["Understand", "Permission", "Act", "Verify"].map((label, i) => <li key={label} className={i === stage ? "is-current" : ""} aria-current={i === stage ? "step" : undefined}><Circle size={7} />{label}</li>)}</ol>}
    <div className="assistant-access-strip">{p.onWorkflows && <button type="button" onClick={p.onWorkflows}><Eye size={12} />Teach Shua</button>}<span title="Models run on your Claude and ChatGPT/Codex subscriptions; voice is Codex Live"><ShieldCheck size={11} /> Claude + Codex</span><button type="button" onClick={p.onAccess}><Fingerprint size={12} />Access & tools<ChevronRight size={10} /></button></div>
    <div className={`assistant-observation is-${observation.status}`} title={observation.detail}><Eye size={12} /><span>{observation.label}</span><small>{observation.status === "fresh" ? "Just observed" : observation.status === "stale" ? "Re-check needed" : observation.status === "off" ? "Private" : "On request"}</small></div>
    {!active && <button type="button" className="assistant-tools-toggle" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}><Layers3 size={12} />{toolsOpen ? "Hide shortcuts" : "Shortcuts & tasks"}<ChevronRight size={12} /></button>}
    {!active && toolsOpen && <div className="assistant-launches" aria-label="Start a task">
      <button type="button" onClick={() => p.onAsk("Start a 25 minute focus timer")}><Timer size={16} /><span>Focus session<small>25 minutes, one thing</small></span><ArrowUpRight size={12} /></button>
      <button type="button" onClick={() => p.onAsk("Show what is playing and help me choose music using my connected music app. Ask before starting playback.")}><Headphones size={16} /><span>Music & mood<small>Your connected music</small></span><ArrowUpRight size={12} /></button>
      <button type="button" onClick={() => p.onAsk("Help me plan the rest of my day using only sources I have permitted. Show priorities and gaps; ask before changing anything.")}><Layers3 size={16} /><span>Plan my day<small>Priorities, then a plan</small></span><ArrowUpRight size={12} /></button>
      <button type="button" disabled={!p.screenEnabled} onClick={() => p.onAsk("Look at my screen now. Describe only what you can verify in the current app and display, distinguish uncertainty, and suggest one next step. Do not click anything.")}><Eye size={16} /><span>Look with me<small>Fresh view, clear next step</small></span><ArrowUpRight size={12} /></button>
    </div>}
    {!active && toolsOpen && p.onMission && <button type="button" className="assistant-delegate" onClick={p.onMission}><Layers3 size={13} /><span>Delegate a longer task</span><ArrowUpRight size={12} /></button>}
    {p.background.length > 0 && <div className="assistant-background"><span className="assistant-eyebrow">IN THE BACKGROUND · {p.background.length}</span>{p.background.slice(0, 3).map(run => <button type="button" key={run.id} onClick={() => p.onRun?.(run.id)}><i /><span>{run.title || "Background task"}</span><small>{run.status?.replaceAll("_", " ") || "working"}</small><ChevronRight size={12} /></button>)}</div>}
    <footer><Check size={10} />{p.control === "off" ? "Mac control is off" : !p.trusted ? "Mac control needs Accessibility access" : p.control === "ask" ? "Ask before each Mac step" : "Mac control enabled · Esc stops actions"}</footer>
  </section>;
}
