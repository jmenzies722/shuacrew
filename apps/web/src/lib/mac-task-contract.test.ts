import { expect, it } from "vitest";
import { classifyMacStep, verifiedReceipt, type MacTaskScope, type MacStep } from "./mac-task-contract";

export const scope: MacTaskScope = { taskId: "task", generation: 1, request: "Calculate", allowedBundleIds: ["com.apple.calculator"], allowedResourceRoots: [], startedAt: 1000, deadline: 121000, maxSteps: 12 };
export const step: MacStep = { actionId: "one", observationId: "obs", targetId: "One", operation: "press", bundleId: "com.apple.calculator", expected: { kind: "values", values: ["1"] }, risk: "routine" };

it("bounds time and scope and never treats a model risk label as authority", () => {
  expect(classifyMacStep(scope, step, 2000)).toBe("allow");
  expect(classifyMacStep(scope, step, 121000)).toBe("deny");
  expect(classifyMacStep(scope, { ...step, bundleId: "com.apple.Safari" }, 2000)).toBe("deny");
  expect(classifyMacStep(scope, { ...step, risk: "consequential" }, 2000)).toBe("needs-approval");
  expect(classifyMacStep(scope, { ...step, operation: "shell" } as unknown as MacStep, 2000)).toBe("deny");
  expect(classifyMacStep({ ...scope, allowedResourceRoots: ["/tmp/alias-to-work"] }, step, 2000)).toBe("deny");
});

it("requires fresh matching post-action evidence for success", () => {
  expect(verifiedReceipt(scope, step, undefined).status).toBe("unverified");
  const evidence = { observationId: "after", observedAt: 2100, actionId: "one", predicateMatched: true, taskId: "task", generation: 1 };
  expect(verifiedReceipt(scope, step, evidence).status).toBe("verified");
  expect(verifiedReceipt(scope, step, { ...evidence, observationId: "obs" }).status).toBe("unverified");
  expect(verifiedReceipt(scope, step, { ...evidence, generation: 2 }).status).toBe("unverified");
  expect(verifiedReceipt(scope, step, { ...evidence, predicateMatched: false }).status).toBe("unverified");
});
