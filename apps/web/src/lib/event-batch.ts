/**
 * Live events for runs whose history is already loaded. The history fetch and the socket overlap, so an event can
 * arrive both ways: anything at or below the newest seq a run already holds is a repeat and is dropped (a repeated
 * text delta would otherwise show the same words twice).
 */
export function appendLoadedEvents<Event extends { run?: string | null; seq: number }>(loaded: Record<string, Event[]>, batch: Event[]): Record<string, Event[]> {
  const additions = new Map<string, Event[]>();
  for (const event of batch) {
    if (!event.run || !loaded[event.run]) continue;
    const events = additions.get(event.run);
    const newest = events?.at(-1)?.seq ?? loaded[event.run]!.at(-1)?.seq ?? -Infinity;
    if (event.seq <= newest) continue;
    if (events) events.push(event);
    else additions.set(event.run, [event]);
  }
  if (!additions.size) return loaded;
  const next = { ...loaded };
  for (const [run, events] of additions) next[run] = loaded[run]!.concat(events);
  return next;
}
