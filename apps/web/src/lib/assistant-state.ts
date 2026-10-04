export type AssistantPhase = "idle" | "preparing" | "connecting" | "listening" | "planning" | "awaiting-approval" | "acting" | "verifying" | "completed" | "failed" | "cancelled";
export type AssistantEvent = { taskId: string; generation: number; sequence: number; phase: AssistantPhase; label: string };
export type AssistantState = AssistantEvent & { lastSequence: number };
export function beginAssistant(taskId: string, generation: number): AssistantState {
  return { taskId, generation, sequence: 0, lastSequence: 0, phase: "idle", label: "Ready when you are" };
}
export function reduceAssistant(state: AssistantState, event: AssistantEvent): AssistantState {
  if (event.taskId !== state.taskId || event.generation !== state.generation || event.sequence <= state.lastSequence || ["completed", "failed", "cancelled"].includes(state.phase)) return state;
  return { ...event, lastSequence: event.sequence };
}
