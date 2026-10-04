import { useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { launchRun } from "../lib/api";
import { missionRequest } from "../lib/assistant-mission";
import { addMission } from "../lib/missions";
export function AssistantMission({ onClose, onStarted }: { onClose: () => void; onStarted: (id: string) => void }) {
  const [goal, setGoal] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  async function start() {
    if (submitted.current) return;
    let request: ReturnType<typeof missionRequest>;
    try { request = missionRequest(goal); } catch (e) { setError(String(e)); return; }
    submitted.current = true; setBusy(true); setError("");
    try { const result = await launchRun(request); addMission(result.id, goal); onStarted(result.id); }
    catch { setError("The launch could not be confirmed. Check Sessions before submitting again; a task may already have started."); }
    finally { setBusy(false); } // No automatic resubmit after an unknown launch result.
  }
  return <section className="assistant-deck assistant-mission" aria-label="New background mission"><header className="assistant-deck-heading"><span><ArrowUpRight size={13} /> NEW MISSION</span><button type="button" onClick={onClose} aria-label="Close mission"><X size={14} /></button></header>
    <strong>Give Shua the whole task.</strong><p>Research, compare, build, or work with connected tools. A Codex session keeps the plan and progress while you get on with your day.</p>
    <form onSubmit={e => { e.preventDefault(); void start(); }}><textarea autoFocus aria-label="Mission brief" value={goal} maxLength={6000} disabled={submitted.current} onChange={e => setGoal(e.target.value)} placeholder="What should be done, which resources may be used, and what would a good result look like?" rows={4} />
      <small>Approvals stay with you. No sends, purchases, deletions, commits or pushes without asking.</small>
      {error && <p role="alert">{error}</p>}<button className="assistant-mission-start" type="submit" disabled={!goal.trim() || submitted.current}>{busy ? "Starting…" : submitted.current ? "Check Sessions" : "Start approved task"}<ArrowUpRight size={13} /></button></form>
    <footer>Claude + Codex · progress in Sessions · cancellable</footer></section>;
}
