import { classifyMacStep, verifiedReceipt, type MacEvidence, type MacObservation, type MacReceipt, type MacStep, type MacTaskProgress, type MacTaskScope } from "./mac-task-contract";

export type MacTaskResult = { status: "completed" | "blocked" | "paused" | "cancelled"; receipts: MacReceipt[]; summary: string };
export type MacTaskAdapter = {
  observe(signal: AbortSignal): Promise<MacObservation>;
  planNext(observation: MacObservation, index: number): MacStep | null;
  complete(observation: MacObservation): boolean;
  dispatch(step: MacStep, signal: AbortSignal): Promise<MacReceipt>;
  verify(step: MacStep, signal: AbortSignal): Promise<MacEvidence>;
  record?(receipt: MacReceipt): Promise<void>;
  cancel(): void;
};
export async function runMacTask(scope: MacTaskScope, adapter: MacTaskAdapter, signal: AbortSignal, onProgress: (progress: MacTaskProgress) => void): Promise<MacTaskResult> {
  const receipts: MacReceipt[] = [], used = new Set<string>();
  const abort = new AbortController();
  const stop = () => { abort.abort(signal.reason); adapter.cancel(); };
  let expired = false;
  const timer = setTimeout(() => { expired = true; abort.abort(); adapter.cancel(); }, Math.max(0, scope.deadline - Date.now()));
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  const check = () => { if (abort.signal.aborted || Date.now() >= scope.deadline) throw new Error("Stopped or task deadline reached."); };
  const progress = (phase: MacTaskProgress["phase"], label: string) => onProgress({ taskId: scope.taskId, generation: scope.generation, phase, label });
  const wait = <Value>(promise: Promise<Value>): Promise<Value> => new Promise((resolve, reject) => {
    const cancel = () => { cleanup(); reject(new Error("Stopped.")); };
    const cleanup = () => abort.signal.removeEventListener("abort", cancel);
    if (abort.signal.aborted) { cancel(); return; }
    abort.signal.addEventListener("abort", cancel, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
  try {
    let retries = 0;
    for (;;) {
      check(); progress("observing", "Checking the app");
      const observation = await wait(adapter.observe(abort.signal));
      check();
      if (observation.taskId !== scope.taskId || observation.generation !== scope.generation ||
        !scope.allowedBundleIds.includes(observation.bundleId) || Date.now() - observation.observedAt > 2000 || observation.observedAt > Date.now()) throw new Error("Stale or out-of-scope observation.");
      if (receipts.length && receipts.at(-1)?.status === "verified" && adapter.complete(observation)) {
        progress("verified", "Result verified");
        return { status: "completed", receipts, summary: "Completed and verified in the app." };
      }
      if (used.size >= Math.min(scope.maxSteps, 12)) throw new Error("Stopped at the task's step limit.");
      const step = adapter.planNext(observation, used.size);
      if (!step) { if (retries++ < 2) continue; throw new Error("Could not uniquely identify the next control."); }
      retries = 0;
      const verdict = classifyMacStep(scope, step, Date.now());
      if (verdict !== "allow") {
        if (verdict === "needs-approval") progress("needs-approval", "This step needs approval; no action taken");
        throw new Error("The requested step is outside the approved routine scope.");
      }
      if (step.observationId !== observation.id || used.has(step.actionId)) throw new Error("Stale or duplicate action; not repeated.");
      progress("targeting", step.operation === "open" ? "Opening the scoped app" : "Target identified");
      check(); used.add(step.actionId);
      const slot = receipts.length;
      receipts.push({ taskId: scope.taskId, actionId: step.actionId, dispatch: "unknown", status: "unverified", message: "Dispatch outcome not yet known." });
      progress("acting", "Performing one step");
      const dispatch = await wait(adapter.dispatch(step, abort.signal));
      check();
      if (dispatch.taskId !== scope.taskId || dispatch.actionId !== step.actionId) throw new Error("Mismatched action receipt.");
      receipts[slot] = { ...dispatch, status: dispatch.status === "verified" ? "unverified" : dispatch.status };
      if (dispatch.dispatch === "not-sent") throw new Error(dispatch.message);
      progress("verifying", "Checking the result");
      const evidence = await wait(adapter.verify(step, abort.signal));
      check();
      receipts[slot] = verifiedReceipt(scope, step, evidence);
      if (adapter.record) await wait(adapter.record(receipts[slot]!));
      if (receipts[slot]!.status !== "verified") throw new Error(receipts[slot]!.message);
    }
  } catch (error) {
    const status = signal.aborted ? signal.reason === "takeover" ? "paused" : "cancelled" : "blocked";
    const summary = expired ? "Stopped at the 120-second task deadline." : status === "paused" ? "Paused because you took control. Resume only after checking the app." : status === "cancelled" ? "Stopped. Earlier steps may already have taken effect." : error instanceof Error ? error.message : "The task could not be verified.";
    progress(status, summary);
    return { status, receipts, summary };
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", stop); adapter.cancel();
    for (const receipt of receipts) { if (receipt.status !== "verified") await adapter.record?.(receipt).catch(() => {}); }
  }
}
