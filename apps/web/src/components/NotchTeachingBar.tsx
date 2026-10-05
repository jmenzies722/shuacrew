import { useState, type ReactNode } from "react";
import { Eye, Square, ChevronDown } from "lucide-react";
import type { WorkflowState } from "../lib/workflow-memory";
import "./notch-teaching-bar.css";

export function NotchTeachingBar({ state, blocked, onToggle, onReview, children, inline = false }: {
  state: WorkflowState; blocked: boolean; onToggle: () => Promise<void>; onReview: () => void; children: ReactNode;
  /** Already behind the island's More button: show the controls, not a second "More". */
  inline?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const recording = state.phase === "recording";
  const review = state.phase === "review" && !!state.draft;
  const steps = state.draft?.steps ?? [];
  const missed = steps.filter(step => step.operation === "checkpoint").length;
  const busy = ["running", "needs-approval"].includes(state.phase);
  async function toggle() {
    if (pending) return;
    if (review) { onReview(); return; }
    setPending(true);
    try { await onToggle(); } finally { setPending(false); }
  }
  return <section className={`notch-teaching${recording ? " is-recording" : ""}`} aria-label="Demonstration controls">
    <div className="notch-teaching-actions">
      <button type="button" className="notch-watch" disabled={pending || busy || (!recording && !review && blocked)} onClick={() => void toggle()}>
        {recording ? <Square size={12} /> : <Eye size={14} />}
        {pending ? "One moment…" : recording ? "Finish recording" : review ? "Review recording" : "Watch me"}
      </button>
      {!inline && <details className="notch-more"><summary aria-label="More controls">More<ChevronDown size={12} /></summary><div>{children}</div></details>}
    </div>
    {inline && <div className="notch-more-inline">{children}</div>}
    {recording && <div className="notch-capture-status" role="status"><i aria-hidden="true" /><span><strong>{state.observedApp ? `Watching ${state.observedApp}` : "Switch to your task app"}</strong><small>{steps.length - missed} captured{missed > 0 ? ` · ${missed} need help` : " · demonstrate your task"}</small></span></div>}
    {!recording && !review && blocked && <small className="notch-teaching-help">{inline ? "Watch me needs Mac control: turn it on under Access below." : "Open More → Access & tools to enable Mac control, or finish the active task."}</small>}
  </section>;
}
