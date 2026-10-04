import { expect, it } from "vitest";
import { beginAssistant, reduceAssistant } from "./assistant-state";
it("rejects stale owners, generations, duplicate sequences and late success", () => {
  const state = beginAssistant("a", 2);
  const event = { taskId: "a", generation: 2, sequence: 1, phase: "acting" as const, label: "Opening app" };
  expect(reduceAssistant(state, { ...event, taskId: "b" })).toBe(state);
  expect(reduceAssistant(state, { ...event, generation: 1 })).toBe(state);
  const acting = reduceAssistant(state, event);
  expect(reduceAssistant(acting, event)).toBe(acting);
  const cancelled = reduceAssistant(acting, { ...event, sequence: 2, phase: "cancelled" });
  expect(reduceAssistant(cancelled, { ...event, sequence: 3, phase: "completed" })).toBe(cancelled);
});
it("keeps approval separate from acting and labels actual state", () => {
  expect(reduceAssistant(beginAssistant("a", 1), { taskId: "a", generation: 1, sequence: 1, phase: "awaiting-approval", label: "Open Music?" })).toMatchObject({ phase: "awaiting-approval", label: "Open Music?" });
});
