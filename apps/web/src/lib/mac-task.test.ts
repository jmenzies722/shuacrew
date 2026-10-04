import { expect, it, vi, afterEach } from "vitest";
import { runMacTask, type MacTaskAdapter } from "./mac-task";
import type { MacTaskScope, MacObservation } from "./mac-task-contract";

afterEach(() => vi.useRealTimers());
function fixture(goal = 1) {
  const startedAt = Date.now();
  const scope: MacTaskScope = { taskId: "test", generation: 1, request: "increment", allowedBundleIds: ["dev.shuacrew.mac-task-fixture"], allowedResourceRoots: [], startedAt, deadline: startedAt + 120000, maxSteps: 12 };
  let value = 0, observations = 0;
  const mutations: string[] = [];
  const adapter: MacTaskAdapter = {
    observe: async () => ({ id: `obs-${++observations}`, taskId: "test", generation: 1, observedAt: Date.now(), bundleId: scope.allowedBundleIds[0]!, pid: 42, windowId: "main", displayId: "1", geometryRevision: "a", targets: [], values: [String(value)], mode: "fixture" }),
    planNext: (observation, index) => ({ actionId: `action-${index}`, observationId: observation.id, targetId: "increment", operation: "press", bundleId: scope.allowedBundleIds[0]!, expected: { kind: "values", values: [String(value + 1)] }, risk: "routine" }),
    complete: () => value === goal,
    dispatch: async step => { mutations.push(step.actionId); value++; return { taskId: "test", actionId: step.actionId, dispatch: "sent", status: "unverified", message: "Dispatched" }; },
    verify: async step => ({ observationId: `after-${++observations}`, observedAt: Date.now(), actionId: step.actionId, taskId: "test", generation: 1, predicateMatched: step.expected.values[0] === String(value) }),
    cancel() {},
  };
  return { scope, adapter, mutations };
}

it("completes twenty fixture runs only after observed outcomes", async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const test = fixture();
    const phases: string[] = [];
    const result = await runMacTask(test.scope, test.adapter, new AbortController().signal, progress => phases.push(progress.phase));
    expect(result.status).toBe("completed");
    expect(result.receipts[0]?.status).toBe("verified");
    expect(test.mutations).toEqual(["action-0"]);
    expect(phases).toContain("verifying");
  }
});
it("never repeats an uncertain mutation or reports its dispatch as completion", async () => {
  const test = fixture();
  test.adapter.verify = async () => { throw new Error("Read-back unavailable"); };
  const result = await runMacTask(test.scope, test.adapter, new AbortController().signal, () => {});
  expect(result.status).toBe("blocked");
  expect(test.mutations).toHaveLength(1);
  expect(result.receipts[0]?.status).toBe("unverified");
});
it("stops at twelve steps", async () => {
  const test = fixture(13);
  expect((await runMacTask(test.scope, test.adapter, new AbortController().signal, () => {})).status).toBe("blocked");
  expect(test.mutations).toHaveLength(12);
});
it("does not dispatch after cancellation during observation", async () => {
  const test = fixture(), abort = new AbortController(), observe = test.adapter.observe;
  test.adapter.observe = async signal => { abort.abort(); return observe(signal); };
  expect((await runMacTask(test.scope, test.adapter, abort.signal, () => {})).status).toBe("cancelled");
  expect(test.mutations).toHaveLength(0);
});
it("allows only two reobservations for a missing target", async () => {
  const test = fixture();
  let reads = 0;
  const observe = test.adapter.observe;
  test.adapter.observe = async signal => { reads++; return observe(signal); };
  test.adapter.planNext = () => null;
  expect((await runMacTask(test.scope, test.adapter, new AbortController().signal, () => {})).status).toBe("blocked");
  expect(reads).toBe(3);
  expect(test.mutations).toHaveLength(0);
});
it("does not reuse an action ID even with new observations", async () => {
  const test = fixture(2), plan = test.adapter.planNext;
  test.adapter.planNext = (observation, index) => ({ ...plan(observation, index)!, actionId: "same" });
  expect((await runMacTask(test.scope, test.adapter, new AbortController().signal, () => {})).status).toBe("blocked");
  expect(test.mutations).toEqual(["same"]);
});
