/**
 * Spark → Chrome, precisely. Spark asks the paired Spark for Chrome extension to find, click or type into a page
 * element by what it's called; the extension answers with the real element's position (or does it), so web pages are
 * exact instead of guessed from pixels. The extension collects commands with a long poll; each gets one answer.
 */
import { randomUUID } from "node:crypto";

export type WebCommand = { id: string; kind: "locate" | "click" | "type"; text: string; value?: string };
export type WebResult = { found: boolean; name?: string; role?: string; rect?: { x: number; y: number; w: number; h: number }; error?: string };

export class WebBridge {
  private queue: WebCommand[] = [];
  private waiters: Array<(c: WebCommand | null) => void> = [];
  private pending = new Map<string, (r: WebResult | null) => void>();
  private seen = 0;

  /** Is the extension checking in? (It polls continuously while Chrome is open.) */
  connected(now = Date.now()) { return now - this.seen < 35_000 || this.waiters.length > 0; }

  /** The extension's long poll: the next command, or null after `waitMs`. */
  next(waitMs = 20_000): Promise<WebCommand | null> {
    this.seen = Date.now();
    const ready = this.queue.shift();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve) => {
      const done = (c: WebCommand | null) => { clearTimeout(t); this.waiters = this.waiters.filter((w) => w !== done); this.seen = Date.now(); resolve(c); };
      const t = setTimeout(() => done(null), waitMs);
      this.waiters.push(done);
    });
  }

  /** The extension's answer to one command. */
  answer(id: string, result: WebResult) { this.pending.get(id)?.(result); this.pending.delete(id); }

  /** Spark's side: send a command and wait (briefly) for the page's answer. Null if nobody answered in time. */
  send(command: Omit<WebCommand, "id">, waitMs = 3000): Promise<WebResult | null> {
    const full: WebCommand = { ...command, id: randomUUID() };
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.pending.delete(full.id); this.queue = this.queue.filter((c) => c.id !== full.id); resolve(null); }, waitMs);
      this.pending.set(full.id, (r) => { clearTimeout(t); resolve(r); });
      const waiter = this.waiters.shift();
      if (waiter) waiter(full); else this.queue.push(full);
    });
  }
}

/** A command from Spark, checked: one of three kinds, a short name, a bounded value. */
export function validWebCommand(body: unknown): Omit<WebCommand, "id"> | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!["locate", "click", "type"].includes(b.kind as string)) return null;
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 200) : "";
  if (!text) return null;
  const value = typeof b.value === "string" ? b.value.slice(0, 4000) : undefined;
  if (b.kind === "type" && value === undefined) return null;
  return { kind: b.kind as WebCommand["kind"], text, ...(value !== undefined ? { value } : {}) };
}
