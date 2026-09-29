/** Keep scalar snapshots: live projection mutates the previous crew object in place. */
export function analyticsEventListener(initial: { crew: { head: number }; connection: string }, invalidate: () => void) {
  let head = initial.crew.head, connection = initial.connection;
  return (next: typeof initial) => {
    if (next.crew.head !== head || next.connection !== connection) { head = next.crew.head; connection = next.connection; invalidate(); }
  };
}
