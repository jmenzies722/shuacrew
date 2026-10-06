/**
 * Shua from your iPhone: what you type or say on the phone goes to the Mac's own Shua (the notch), so it can do
 * everything it does there — open apps, play music, brief you, hand work to the crew — with the same checks. The
 * phone posts an ask; the notch, listening here, takes it and says which conversation will carry the reply, which the
 * phone then follows through the run's events. Nothing is answered here: if the notch isn't listening, the phone
 * is told plainly that Shua isn't open on the Mac.
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";

export interface RemoteAsk { id: string; text: string; at: number; status: "sent" | "taken"; run?: string }
type Listener = (ask: RemoteAsk) => void;

export class ShuaRemote {
  private listeners = new Set<Listener>();
  private asks = new Map<string, RemoteAsk>();
  constructor(private now = () => Date.now()) {}
  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  get listening() { return this.listeners.size > 0; }
  /** Hands an ask to the notch; null when no notch is listening. Keeps the last 50 for the phone to follow. */
  send(text: string): RemoteAsk | null {
    if (!this.listening) return null;
    const ask: RemoteAsk = { id: `ra_${randomBytes(6).toString("hex")}`, text, at: this.now(), status: "sent" };
    this.asks.set(ask.id, ask);
    if (this.asks.size > 50) this.asks.delete(this.asks.keys().next().value!);
    for (const fn of this.listeners) fn(ask);
    return ask;
  }
  take(id: string, run: string): boolean {
    const ask = this.asks.get(id);
    if (!ask) return false;
    ask.status = "taken"; ask.run = run;
    return true;
  }
  get(id: string) { return this.asks.get(id); }
}

/** A phone ask: plain text, trimmed, never empty, never a novel. */
export function remoteText(v: unknown): string | null {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return t ? t.slice(0, 2000) : null;
}

export function registerShuaRemote(app: FastifyInstance, remote = new ShuaRemote()) {
  // From the phone (through the phone door's allowlist).
  app.post("/api/shua/remote", async (request, reply) => {
    const text = remoteText((request.body as { text?: unknown } | undefined)?.text);
    if (!text) return reply.code(400).send({ error: "Say what you'd like Shua to do." });
    const ask = remote.send(text);
    return ask ? { id: ask.id } : reply.code(409).send({ error: "Shua isn't open on your Mac right now. Open ShuaCrew there and try again." });
  });
  app.get<{ Params: { id: string } }>("/api/shua/remote/:id", async (request, reply) => remote.get(request.params.id) ?? reply.code(404).send({ error: "That ask has expired." }));
  // From the notch on the Mac (loopback only: not on the phone's allowlist).
  app.post<{ Params: { id: string }; Body: { run?: string } }>("/api/shua/remote/:id/take", async (request, reply) => {
    const run = typeof request.body?.run === "string" ? request.body.run : "";
    return run && remote.take(request.params.id, run) ? { ok: true } : reply.code(404).send({ error: "Unknown ask." });
  });
  app.get("/api/shua/remote/events", (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    reply.raw.write(": shua\n\n");
    const off = remote.subscribe((ask) => reply.raw.write(`data: ${JSON.stringify({ id: ask.id, text: ask.text })}\n\n`));
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => { off(); clearInterval(ping); });
  });
  return remote;
}
