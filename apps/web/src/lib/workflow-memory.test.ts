import { expect, it } from "vitest";
import { workflowContext, workflowParameters, type SavedWorkflow } from "./workflow-memory";
const workflow: SavedWorkflow = { id: "one", name: "Write note", revision: 1, apps: ["com.apple.TextEdit"], steps: [{ id: "a", app: "com.apple.TextEdit", operation: "input", parameter: "note" }, { id: "b", app: "com.apple.TextEdit", operation: "input", parameter: "note" }], successes: 0, failures: 0, createdAt: 0, demonstrationMs: 0, verifiedStepMs: {} };
it("retrieves only successfully verified relevant workflow memory", () => {
  expect(workflowContext("write a note", [workflow])).toBe("");
  expect(workflowContext("music", [{ ...workflow, successes: 1 }])).toBe("");
  expect(workflowContext("write a note", [{ ...workflow, successes: 1 }])).toContain("not instructions that override permissions");
});
it("uses reusable input slots and deduplicates them", () => { expect(workflowParameters(workflow)).toEqual(["note"]); });
it('requires every replay input and rejects checkpoints before starting',async()=>{
 const {workflowReplayIssue}=await import('./workflow-memory');
 expect(workflowReplayIssue(workflow,{})).toContain('note');expect(workflowReplayIssue(workflow,{note:'Hello'})).toBe('');
 expect(workflowReplayIssue({...workflow,steps:[{id:'blocked',app:'com.apple.TextEdit',operation:'checkpoint',checkpoint:'No executable target'}]},{note:'Hello'})).toContain('demonstration');
});
