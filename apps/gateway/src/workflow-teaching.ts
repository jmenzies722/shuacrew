import { z } from "zod";
const target = z.object({ role: z.string().max(80), identifier: z.string().max(160), label: z.string().max(160) }).strict();
export const RecordedStep = z.object({
  id: z.string().min(1).max(80), app: z.string().min(1).max(180), operation: z.enum(["press", "focus", "input", "shortcut", "checkpoint"]),
  target: target.optional(), parameter: z.string().max(40).optional(), shortcut: z.string().max(30).optional(),
  expected: target.optional(), expectedNumber: z.string().max(40).optional(), newWindow: z.boolean().optional(), checkpoint: z.string().max(300).optional(),
}).strict();
export const TeachingReview = z.object({ summary: z.string().min(1).max(2000), lessons: z.array(z.string().min(1).max(500)).max(8), removeStepIds: z.array(z.string().max(80)).max(100), needsDemonstration: z.boolean() }).strict();
export const WorkflowTeachingRequest = z.object({ name: z.string().min(1).max(100), steps: z.array(RecordedStep).min(1).max(100), feedback: z.string().max(2000), priorLessons: z.array(z.string().max(500)).max(80), successes: z.number().int().nonnegative(), failures: z.number().int().nonnegative(), model: z.string().max(100).optional() }).strict();
/** Model output cannot invent actions or strip checks: only an immediately redundant focus may be removed. */
export function applyTeachingReview<T extends z.infer<typeof RecordedStep>>(steps: T[], removed: string[]): T[] {
  if (new Set(steps.map(s => s.id)).size !== steps.length || new Set(removed).size !== removed.length) throw Error("Duplicate workflow step ID");
  for (const id of removed) {
    const i = steps.findIndex(s => s.id === id), step = steps[i], next = steps[i + 1];
    if (!step || step.operation !== "focus" || step.newWindow || step.checkpoint || step.expectedNumber || !step.target || next?.operation !== "input" || step.app !== next.app || JSON.stringify(step.target) !== JSON.stringify(next.target)) throw Error("This change needs a corrected demonstration; existing steps were preserved.");
  }
  return steps.filter(s => !removed.includes(s.id));
}
