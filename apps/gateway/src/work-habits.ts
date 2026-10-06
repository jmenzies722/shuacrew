/**
 * How a work session should work so the person can follow it and trust the result: a visible plan for anything
 * multi-step (it becomes the plan card), and proof before "done" (it becomes the receipt's verdict).
 */
const PLAN_TOOL: Record<string, string> = { codex: "the update_plan tool", claude: "the TodoWrite tool" };

export function workHabits(runtime: string): string {
  const tool = PLAN_TOOL[runtime] ?? "a short checklist";
  return [
    "How to work here, so the person can follow along and trust the result:",
    `- For a task with three or more steps, keep a plan with ${tool}: 3 to 7 concrete steps, each marked in progress and then done as you go. Skip it for a one-step answer.`,
    "- Before you call anything done, prove it: run the project's own checks (tests, typecheck, build, whichever exist) and say which ran and what they returned. If you could not verify something, say so plainly instead.",
    "- Finish with what changed, how you verified it, and anything left to do.",
  ].join("\n");
}
