import type { MacTaskProgress } from "../lib/mac-task-contract";

export function MacTaskStatus({ progress, canResume, onResume, onCancel }: { progress: MacTaskProgress; canResume: boolean; onResume: () => void; onCancel: () => void }) {
  const working = ["observing", "targeting", "acting", "verifying"].includes(progress.phase);
  const labels: Record<MacTaskProgress["phase"], string> = { observing: "Observing", targeting: "Target found", acting: "Acting", verifying: "Verifying", verified: "Verified", "needs-approval": "Needs approval", blocked: "Blocked", paused: "Paused", cancelled: "Stopped" };
  return <section className="notch-pointer-status mac-task-status" role="status" aria-label="Verified Mac task" aria-live="polite"><span><strong>{labels[progress.phase]}</strong><br />{progress.label}{progress.reason && <small>{progress.reason}</small>}</span>{progress.phase === "paused" && canResume && <button type="button" onClick={onResume}>Resume</button>}<button type="button" onClick={onCancel}>{working ? "Cancel" : "Dismiss"}</button></section>;
}
