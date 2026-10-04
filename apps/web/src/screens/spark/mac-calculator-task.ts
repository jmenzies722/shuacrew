import { requestMacTask } from "../../lib/mac-task-bridge";
import { calculatorSequence, type CalculatorRequest } from "../../lib/mac-calculator";
import { runMacTask, type MacTaskAdapter } from "../../lib/mac-task";
import type { MacEvidence, MacObservation, MacStep, MacTaskProgress, MacTaskScope } from "../../lib/mac-task-contract";
import { performMacStep, recordMacReceipt } from "./actions";
import { native, post } from "./bridge";

export async function executeCalculatorTask(request: CalculatorRequest, options: { text: string; signal: AbortSignal; onProgress: (progress: MacTaskProgress) => void; offset?: number; startedAt?: number }) {
  if (!native()) throw new Error("Verified Mac tasks require the native app.");
  const sequence = calculatorSequence(request), offset = options.offset ?? 0;
  const startedAt = options.startedAt ?? Date.now();
  const scope: MacTaskScope = { taskId: crypto.randomUUID(), generation: 1, request: options.text, allowedBundleIds: ["com.apple.calculator"], allowedResourceRoots: [], startedAt, deadline: startedAt + 120000, maxSteps: 12 - offset };
  const abort = new AbortController();
  const stop = () => abort.abort(options.signal.reason);
  options.signal.addEventListener("abort", stop, { once: true });
  if (options.signal.aborted) stop();
  let ended = false, finalVerified = false;
  const receive = (event: Event) => {
    const progress = (event as CustomEvent<MacTaskProgress>).detail;
    if (ended || progress?.taskId !== scope.taskId || progress.generation !== scope.generation) return;
    if (progress.phase === "paused" || progress.phase === "cancelled") abort.abort(progress.phase === "paused" ? "takeover" : "cancelled");
  };
  window.addEventListener("shuacrew:macTaskProgress", receive);
  const bridge = (operation: string, signal: AbortSignal, step?: MacStep) => requestMacTask({ operation, scope, ...(step ? { step } : {}) }, post, window, signal);
  const adapter: MacTaskAdapter = {
    observe: async signal => (await bridge("observe", signal)).observation as MacObservation,
    planNext: (observation, index) => {
      const absolute = index + offset, instruction = sequence[absolute];
      if (!instruction) return null;
      if (absolute > 0 && observation.mode !== "rpn") throw new Error("This verified Calculator adapter supports RPN mode only. No guessed input was sent.");
      const matches = observation.targets.filter(target => target.label === instruction.label);
      if (absolute > 0 && matches.length !== 1) return null;
      return { actionId: `step-${absolute}`, observationId: observation.id, targetId: matches[0]?.id ?? "", bundleId: "com.apple.calculator", operation: absolute === 0 ? "open" : "press", expected: { kind: absolute === 0 ? "app" : "values", values: instruction.expected }, risk: "routine" };
    },
    complete: observation => finalVerified && observation.values.length === 1 && observation.values[0] === request.expected,
    dispatch: (step, signal) => performMacStep(scope, step, signal),
    verify: async (step, signal) => {
      let evidence: MacEvidence | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(new Error("Stopped.")); };
          const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, 200);
          if (signal.aborted) { cancel(); return; }
          signal.addEventListener("abort", cancel, { once: true });
        });
        evidence = (await bridge("verify", signal, step)).evidence as MacEvidence;
        if (evidence.predicateMatched) break;
      }
      if (step.actionId === `step-${sequence.length - 1}` && evidence?.predicateMatched) finalVerified = true;
      return evidence!;
    },
    record: recordMacReceipt,
    cancel: () => { ended = true; post({ type: "buddyMacTask", id: crypto.randomUUID(), operation: "cancel", scope }); },
  };
  try {
    await bridge("begin", abort.signal);
    const result = await runMacTask(scope, adapter, abort.signal, options.onProgress);
    return { ...result, summary: result.status === "completed" ? `Calculator shows ${request.expected}. I verified the result in the app.` : result.summary, startedAt,
      resumeOffset: result.status === "paused" && result.receipts.every(receipt => receipt.status === "verified") && offset + result.receipts.length < sequence.length ? offset + result.receipts.length : null };
  } finally {
    adapter.cancel(); options.signal.removeEventListener("abort", stop); window.removeEventListener("shuacrew:macTaskProgress", receive);
  }
}
