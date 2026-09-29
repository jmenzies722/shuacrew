import type { AnyEvent } from "./events.js";

/** One projection for execution and display. Edits never resurrect consumed messages. */
export function queuedMessages(events: AnyEvent[]): Array<{ id?: string; text: string }> {
  let pending: Array<{ id?: string; text: string }> = [];
  for (const e of events) {
    if (e.kind === "run.followup") pending.push({ id: e.body.id, text: e.body.text });
    if (e.kind === "run.followup.withdrawn") pending = pending.filter((f) => f.id !== e.body.id);
    if (e.kind === "run.followup.edited") pending = pending.map((f) => f.id === e.body.id ? { ...f, text: e.body.text } : f);
    if (e.kind === "run.followups.reordered") {
      const order = new Map(e.body.ids.map((id, i) => [id, i]));
      pending.sort((a, b) => (order.get(a.id ?? "") ?? order.size) - (order.get(b.id ?? "") ?? order.size));
    }
    if (e.kind === "turn.started") pending = [];
  }
  return pending;
}
