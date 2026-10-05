import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotchTeachingBar } from "./NotchTeachingBar";
import type { WorkflowState } from "../lib/workflow-memory";
const base: WorkflowState = { phase: "idle", message: "", stepIndex: 0, stepCount: 0, library: [], draft: null, workflowId: "", appNames: {} };
const render = (state = base, blocked = false) => renderToStaticMarkup(<NotchTeachingBar state={state} blocked={blocked} onToggle={async () => {}} onReview={() => {}}><span>Secondary controls</span></NotchTeachingBar>);
it("has one primary recording button and secondary controls collapsed", () => {
  const html = render();
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain("Watch me"); expect(html).not.toContain("<details open");
  expect(html).not.toContain("captured");
});
it("keeps stop available if permissions change, and distinguishes missed actions", () => {
  const state = { ...base, phase: "recording", observedApp: "TextEdit", draft: { steps: [{ operation: "input" }, { operation: "checkpoint" }] } } as WorkflowState;
  const html = render(state, true);
  expect(html).toContain("Finish recording"); expect(html).not.toContain("disabled");
  expect(html).toContain("Watching TextEdit"); expect(html).toContain("1 captured · 1 need help");
});
it("offers review for an unsaved demonstration instead of overwriting it", () => {
  const html = render({ ...base, phase: "review", draft: { steps: [] } } as unknown as WorkflowState, true);
  expect(html).toContain("Review recording"); expect(html).not.toContain("disabled");
});
it("blocks new recording during replay or when Mac access is missing", () => {
  expect(render(base, true)).toContain("disabled");
  expect(render({ ...base, phase: "running" })).toContain("disabled");
});
