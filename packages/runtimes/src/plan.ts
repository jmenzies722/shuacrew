/**
 * The agent's own checklist, from whichever runtime wrote it. Codex reports its plan as a notification
 * (`turn/plan/updated`); Claude keeps one with the TodoWrite tool. Both arrive whole each time they change.
 */
import type { PlanStep } from "./runtime.js";

type Json = Record<string, any>;
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Codex app-server: `{ explanation, plan: [{ step, status: "pending" | "inProgress" | "completed" }] }`. */
export function codexPlan(params: Json): { steps: PlanStep[]; note: string } | null {
  if (!Array.isArray(params?.plan)) return null;
  const steps = params.plan.map((p: Json) => ({ text: clean(p.step), status: p.status === "completed" ? "done" : p.status === "inProgress" ? "active" : "pending" } as PlanStep)).filter((s: PlanStep) => s.text);
  return { steps, note: clean(params.explanation) };
}

/** Claude's TodoWrite input: `{ todos: [{ content, status: "pending" | "in_progress" | "completed", activeForm }] }`. */
export function todoPlan(input: unknown): { steps: PlanStep[] } | null {
  const todos = (input as Json)?.todos;
  if (!Array.isArray(todos)) return null;
  const steps = todos.map((t: Json) => {
    const status: PlanStep["status"] = t.status === "completed" ? "done" : t.status === "in_progress" ? "active" : "pending";
    // While a step runs, its "activeForm" ("Running the tests") reads better than its title ("Run the tests").
    return { text: clean(status === "active" && t.activeForm ? t.activeForm : t.content), status };
  }).filter((s: PlanStep) => s.text);
  return { steps };
}
