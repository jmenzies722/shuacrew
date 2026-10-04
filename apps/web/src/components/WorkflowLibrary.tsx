import { api } from "../lib/api";
import { getCompanion } from "../lib/companion";
import { modelPreference } from "./CompanionModelPicker";
import { useEffect, useState } from "react";
import { Eye, Square, X } from "lucide-react";
import { useWorkflows, workflowBusy, workflowCommand, workflowLabel, type SavedWorkflow } from "../lib/workflow-memory";
import "./workflow-library.css";
export function WorkflowLibrary({ onClose, onAdapt, disabled = false, blockedReason, onFocusChange }: { blockedReason?: string; onFocusChange?: (focused: boolean) => void; onClose: () => void; onAdapt: (text: string) => void; disabled?: boolean }) {
  const state = useWorkflows();
  const [name, setName] = useState(""), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<SavedWorkflow | null>(null);
  const [feedback, setFeedback] = useState(""), [teaching, setTeaching] = useState(false), [proposal, setProposal] = useState<{ before: SavedWorkflow; removed: number; needsDemonstration: boolean } | null>(null);
  async function teach() {
    if (!review) return;
    const before = { ...review, name: name.trim() || review.name }; setTeaching(true); setError("");
    try {
      const result = await api<{ summary: string; lessons: string[]; steps: SavedWorkflow["steps"]; model: string; at: number; needsDemonstration: boolean }>("/api/workflows/teach", { body: {
        name: before.name, steps: before.steps, feedback, priorLessons: (before.teachings ?? []).flatMap(t => t.lessons).slice(-80), successes: before.successes, failures: before.failures,
        model: modelPreference(getCompanion().modelChoice).preferredModel,
      }, signal: AbortSignal.timeout(125000) });
      setReview({ ...before, steps: result.steps, teachings: [...(before.teachings ?? []), { feedback, summary: result.summary, lessons: result.lessons, model: result.model, at: result.at }].slice(-10) });
      setProposal({ before, removed: before.steps.length - result.steps.length, needsDemonstration: result.needsDemonstration });
    } catch (e) { setError((e as Error).message); } finally { setTeaching(false); }
  }
  useEffect(() => { void workflowCommand("list").catch(e => setError(e.message)); }, []);
  useEffect(() => { if (state.phase === "review" && state.draft) { setReview(state.draft); setName(state.draft.name); setFeedback(""); setProposal(null); } }, [state.phase, state.draft]);
  const current = state.library.find(w => w.id === selected), running = state.library.find(w => w.id === state.workflowId);
  async function command(operation: string, payload: Record<string, unknown> = {}) { setPending(true); setError(""); try { await workflowCommand(operation, payload); if (operation === "save") setReview(null); } catch (e) { setError((e as Error).message); } finally { setPending(false); } }
  const time = (ms?: number) => ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`;
  return <section className="workflow-library" aria-label="Teach Shua" onFocusCapture={() => onFocusChange?.(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onFocusChange?.(false); }}>
    <header><strong>Teach Shua</strong><button aria-label="Close workflows" disabled={teaching} onClick={onClose}><X size={14} /></button></header>
    <p>Say “watch me”, demonstrate, then review what Shua understood.</p>
    {workflowBusy() ? <div className="workflow-running" role="status"><b>{state.phase === "recording" ? "Recording" : state.phase === "needs-approval" ? "Needs your decision" : `Step ${state.stepIndex + 1} / ${state.stepCount}`}</b><span>{state.message}</span>{state.phase === "recording" && <div className="demonstration-live"><div className="demonstration-scan" aria-hidden="true"><Eye size={22} /><i /><i /><i /></div><strong>{state.observedApp ? `Watching ${state.observedApp}` : "Waiting for your task app"}</strong><ol aria-label="Recently captured actions">{state.draft?.steps.slice(-3).map(step => <li key={step.id}><span>{step.operation === "checkpoint" ? "Needs help" : "Captured"}</span>{workflowLabel(step)}</li>)}</ol></div>}{state.phase === "recording" && <small>{state.draft?.steps.filter(s => s.operation !== "checkpoint").length ?? 0} actions captured · {state.draft?.steps.filter(s => s.operation === "checkpoint").length ?? 0} need help. Demonstrate in your foreground app.</small>}<button onClick={() => void command("stop")}><Square size={12} />Stop</button>
      {state.phase === "needs-approval" && running && <button disabled={pending} onClick={() => void command("approve", { workflowId: running.id, stepId: running.steps[state.stepIndex]?.id })}>Allow this step</button>}
    </div> : review ? <div className="workflow-review"><label>Name<input disabled={teaching} value={name} onChange={e => setName(e.target.value)} maxLength={100} /></label><p>{review.steps.some(s => s.operation === "checkpoint") ? "Some actions need help. The steps below explain what to demonstrate differently; you can also send them to Shua." : "Actions captured. Review them, then teach or save this workflow."}</p><small>Text becomes a reusable input. Editable fields are replaced; keyboard-only fields receive single-line typing at the focused caret.</small>
      <ol>{review.steps.map((step, index) => <li key={step.id}><span>{workflowLabel(step)}<small>{state.appNames[step.app] || step.app}{!step.expected && !step.expectedNumber && step.operation !== "input" ? " · checkpoint needed" : ""}</small></span><button disabled={teaching} aria-label={`Remove step ${index + 1}`} onClick={() => setReview({ ...review, steps: review.steps.filter(s => s.id !== step.id) })}><X size={12} /></button></li>)}</ol>
      <label>Teach Shua<textarea disabled={teaching} value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={2000} placeholder="What should this accomplish? What should Shua do differently next time?" /></label>
      <small>Send the recorded controls, input slots and your feedback to Codex. Your typed input values are not included.</small>
      <button disabled={pending || teaching || !review.steps.length} onClick={() => void teach()}>{teaching ? "Shua is reviewing your demonstration…" : "Send workflow to Shua"}</button>
      {proposal && <div className="workflow-teaching" role="status"><strong>Shua’s review of your demonstration</strong><p>{review.teachings?.at(-1)?.summary}</p><ul>{review.teachings?.at(-1)?.lessons.map((lesson, i) => <li key={i}>{lesson}</li>)}</ul><small>{proposal.removed} redundant focus steps proposed for removal. This revision has not been replayed.</small>{proposal.needsDemonstration && <p>A corrected demonstration is needed for the requested behavior. These notes alone do not change how the Mac is controlled.</p>}<button disabled={teaching} onClick={() => { setReview(proposal.before); setProposal(null); }}>Discard suggestion</button></div>}
      <div className="workflow-actions"><button disabled={pending || teaching || !name.trim() || !review.steps.length} onClick={() => void command("save", { workflow: { ...review, name: name.trim() } })}>{proposal ? "Save taught workflow" : "Save workflow"}</button><button disabled={teaching} onClick={() => { setReview(null); setProposal(null); }}>Back</button></div>
    </div> : <>
      <div className="workflow-record">
        <p>Shua follows the foreground app while you demonstrate. Protected apps and secure fields are skipped.</p>
        <small>No video or typed values are saved. Stop anytime, or say “stop watching”.</small>
        <button disabled={pending || disabled} onClick={() => void command("record", { followForeground: true })}><Eye size={14} />Watch me</button>
        {disabled && <small>{blockedReason || "Stop the current assistant task before teaching."}</small>}
      </div>
      <div className="workflow-list">{state.library.length === 0 ? <p>No saved workflows yet.</p> : state.library.map(w => <button key={w.id} className={selected === w.id ? "is-selected" : ""} onClick={() => { setSelected(w.id); }}><strong>{w.name}</strong><small>{w.steps.length} steps · {w.successes} verified runs · {w.teachings?.length ?? 0} teachings</small><small>Last {time(w.lastMs)} · best {time(w.bestMs)} · {w.failures} stopped</small></button>)}</div>
      {current && <div className="workflow-run"><strong>{current.name}</strong><details><summary>Review {current.steps.length} steps</summary><ol>{current.steps.map(s => <li key={s.id}>{workflowLabel(s)}</li>)}</ol></details>
        <div className="workflow-actions"><button onClick={() => { setReview(current); setName(current.name); setFeedback(""); setProposal(null); }}>Teach / edit</button></div>
        {!!current.teachings?.length && <details><summary>What Shua learned</summary>{current.teachings.map((t, i) => <div key={i}><small>{t.model} · {new Date(t.at).toLocaleDateString()}</small><p>{t.summary}</p><ul>{t.lessons.map((lesson, j) => <li key={j}>{lesson}</li>)}</ul></div>)}</details>}
        <button disabled={pending || disabled} onClick={() => void command("record", { apps: current.apps, workflowId: current.id, followForeground: true })}>Record a correction</button>
        <small>A correction replaces this workflow’s steps after review/save and keeps its teaching history.</small>
        <button className="workflow-adapt" onClick={() => onAdapt(`Help adapt my saved workflow ${JSON.stringify(current.name)}. Inspect current permitted screen context and propose a corrected demonstration. Do not claim the saved workflow is updated; I must review and save the revision. Current stop reason: ${state.message}. Procedural reference data: ${JSON.stringify(current.steps.map(workflowLabel))}`)}>Ask Shua to adapt</button>
        <button className="workflow-remove" disabled={pending} onClick={() => void command("delete", { workflowId: current.id })}>Remove saved workflow</button>
      </div>}
    </>}
    {!workflowBusy() && state.message && <p role="status">{state.message}</p>}{error && <p className="workflow-error" role="alert">{error}</p>}
  </section>;
}
