import type { AnyEvent } from "@shuacrew/core/events";
export function lessonMessages(events: AnyEvent[]) {
  const turns = new Map<number, string>();
  for (const event of events) {
    if (event.kind === "agent.delta") turns.set(event.body.turn, (turns.get(event.body.turn) ?? "") + event.body.text);
    if (event.kind === "agent.message" && event.body.final) turns.set(event.body.turn, event.body.text);
  }
  return [...turns.entries()].map(([turn,text]) => ({turn,text: text.replace(/```cards\s*[\s\S]*?```/g, "").trim()}));
}
