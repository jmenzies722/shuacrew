/**
 * The event hub: one WebSocket per client, carrying every fact as it happens.
 *
 * A client subscribes with the last sequence number it has; the hub sends everything after it
 * (history in pages), then live events. Reconnecting after a gateway restart is therefore just
 * "subscribe from where I was" — no gap, no duplicate state.
 *
 * Batches go out once per frame (16ms). When a client can't keep up, agent text deltas for the
 * same run are merged into one; state transitions (a run finishing, an approval arriving) are
 * never merged away or dropped.
 */
import type { AnyEvent } from "@shuacrew/core";
import type { WebSocket } from "@fastify/websocket";
import type { EventStore } from "./store.js";

const FRAME_MS = 16;
const SLOW_BYTES = 1 << 20; // a client with more than 1MB unsent is "slow"

interface Client {
  socket: WebSocket;
  queue: AnyEvent[];
  ready: boolean; // history sent; live events may flow
}

export class Hub {
  private clients = new Set<Client>();
  private timer: NodeJS.Timeout | null = null;
  private unsubscribe: () => void;

  constructor(private store: EventStore) {
    this.unsubscribe = store.subscribe((event) => this.publish(event));
  }

  get size(): number {
    return this.clients.size;
  }

  attach(socket: WebSocket): void {
    const client: Client = { socket, queue: [], ready: false };
    this.clients.add(client);
    socket.on("message", (raw: unknown) => {
      let message: { type?: string; after?: number };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.type === "subscribe") this.replay(client, Math.max(0, Number(message.after) || 0));
      if (message.type === "ping") this.send(client, { type: "pong", head: this.store.head });
    });
    socket.on("close", () => this.clients.delete(client));
    socket.on("error", () => this.clients.delete(client));
    this.send(client, { type: "hello", head: this.store.head });
  }

  private replay(client: Client, after: number): void {
    client.ready = false;
    client.queue = [];
    let page: AnyEvent[] = [];
    for (const event of this.store.read(after)) {
      page.push(event);
      if (page.length === 2000) {
        this.send(client, { type: "events", events: page, replay: true });
        page = [];
      }
    }
    this.send(client, { type: "events", events: page, replay: true, caughtUp: true });
    client.ready = true;
  }

  private publish(event: AnyEvent): void {
    for (const client of this.clients) {
      if (client.ready) client.queue.push(event);
    }
    this.timer ??= setTimeout(() => this.flush(), FRAME_MS);
  }

  private flush(): void {
    this.timer = null;
    for (const client of this.clients) {
      if (!client.queue.length) continue;
      const slow = client.socket.bufferedAmount > SLOW_BYTES;
      const events = slow ? coalesce(client.queue) : client.queue;
      client.queue = [];
      this.send(client, { type: "events", events });
    }
  }

  private send(client: Client, message: unknown): void {
    if (client.socket.readyState !== 1) return;
    client.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.unsubscribe();
    for (const client of this.clients) client.socket.close(1001, "gateway stopping");
    this.clients.clear();
  }
}

/** Merge consecutive text deltas per run; keep every other event exactly. */
export function coalesce(events: AnyEvent[]): AnyEvent[] {
  const out: AnyEvent[] = [];
  const lastDelta = new Map<string, number>(); // run → index in `out` of its pending delta
  for (const event of events) {
    if (event.kind === "agent.delta" && event.run) {
      const at = lastDelta.get(event.run);
      const previous = at === undefined ? undefined : out[at];
      if (previous && previous.kind === "agent.delta" && previous.body.turn === event.body.turn) {
        out[at!] = { ...event, body: { turn: event.body.turn, text: previous.body.text + event.body.text } };
        continue;
      }
      lastDelta.set(event.run, out.length);
      out.push(event);
      continue;
    }
    if (event.run) lastDelta.delete(event.run); // a state change ends the merge window for that run
    out.push(event);
  }
  return out;
}
