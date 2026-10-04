export type MacTaskScope = { taskId: string; generation: number; request: string; allowedBundleIds: string[]; allowedResourceRoots: string[]; startedAt: number; deadline: number; maxSteps: number };
export type MacPredicate = { kind: "app" | "values"; values: string[] };
export type MacStep = { actionId: string; observationId: string; targetId: string; operation: "open" | "press"; bundleId: string; expected: MacPredicate; risk: "routine" | "consequential" | "forbidden" };
export type MacEvidence = { observationId: string; observedAt: number; actionId: string; taskId: string; generation: number; predicateMatched: boolean };
export type MacReceipt = { taskId: string; actionId: string; dispatch: "not-sent" | "sent" | "unknown"; status: "verified" | "failed" | "unverified" | "cancelled" | "needs-approval"; message: string; evidence?: MacEvidence };
export type MacTarget = { id: string; label: string; role: string; x: number; y: number; width: number; height: number };
export type MacObservation = { id: string; taskId: string; generation: number; observedAt: number; bundleId: string; pid: number; windowId: string; displayId: string; geometryRevision: string; targets: MacTarget[]; values: string[]; mode: "rpn" | "basic" | "fixture" | "unavailable" };
export type MacTaskProgress = { taskId: string; generation: number; phase: "observing" | "targeting" | "acting" | "verifying" | "verified" | "needs-approval" | "blocked" | "paused" | "cancelled"; label: string; reason?: string };
export function classifyMacStep(scope: MacTaskScope, step: MacStep, now: number): "allow" | "needs-approval" | "deny" {
  const supported = ["com.apple.calculator", "dev.shuacrew.mac-task-fixture"];
  if (!scope.taskId || !Number.isSafeInteger(scope.generation) || scope.generation < 1 ||
    !Number.isFinite(now) || now < scope.startedAt || now >= scope.deadline || scope.deadline - scope.startedAt > 120000 ||
    scope.maxSteps < 1 || scope.maxSteps > 12 || !Number.isSafeInteger(scope.maxSteps) || scope.allowedResourceRoots.length ||
    scope.allowedBundleIds.length !== 1 || !supported.includes(step.bundleId) || !scope.allowedBundleIds.includes(step.bundleId) ||
    !step.actionId || !step.observationId || !["open", "press"].includes(step.operation) ||
    (step.operation === "press" && (!step.targetId || step.expected.kind !== "values")) ||
    !["app", "values"].includes(step.expected.kind) || step.expected.values.length > 12 ||
    step.expected.values.some(value => !/^-?\d+(?:\.\d+)?$/.test(value)) || step.risk === "forbidden") return "deny";
  return step.risk === "routine" ? "allow" : "needs-approval";
}
export function verifiedReceipt(scope: MacTaskScope, step: MacStep, evidence?: MacEvidence): MacReceipt {
  const verified = evidence?.predicateMatched === true && evidence.taskId === scope.taskId && evidence.generation === scope.generation &&
    evidence.actionId === step.actionId && evidence.observationId !== step.observationId && !!evidence.observationId &&
    evidence.observedAt >= scope.startedAt && evidence.observedAt <= scope.deadline;
  return { taskId: scope.taskId, actionId: step.actionId, dispatch: "sent", status: verified ? "verified" : "unverified",
    message: verified ? "Observed the expected result." : "The action's result could not be verified. It will not be repeated.", ...(evidence ? { evidence } : {}) };
}
