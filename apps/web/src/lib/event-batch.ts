export function appendLoadedEvents<Event extends { run?: string | null }>(loaded: Record<string, Event[]>, batch: Event[]): Record<string, Event[]> {
  const additions = new Map<string, Event[]>();
  for (const event of batch) {
    if (!event.run || !loaded[event.run]) continue;
    const events = additions.get(event.run);
    if (events) events.push(event);
    else additions.set(event.run, [event]);
  }
  if (!additions.size) return loaded;
  const next = { ...loaded };
  for (const [run, events] of additions) next[run] = loaded[run]!.concat(events);
  return next;
}
