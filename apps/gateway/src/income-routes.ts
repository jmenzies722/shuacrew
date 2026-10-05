/**
 * Income: money in that a venture's Stripe doesn't already report — consulting invoices, sponsorships, content
 * payouts, one-off sales. Each entry is an event, so the ledger is as auditable as everything else.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { EventStore } from "./store.js";

const KINDS = ["consulting", "content", "product", "sponsorship", "other"] as const;

export function incomeRoutes(app: FastifyInstance, store: EventStore) {
  app.post<{ Body: { amount?: unknown; currency?: unknown; kind?: unknown; venture?: unknown; note?: unknown; on?: unknown } }>("/api/income", async (request, reply) => {
    const b = request.body ?? {};
    const amount = typeof b.amount === "number" ? b.amount : Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) return reply.code(400).send({ error: "how much came in?" });
    if (!KINDS.includes(b.kind as (typeof KINDS)[number])) return reply.code(400).send({ error: `kind: ${KINDS.join(" | ")}` });
    const on = typeof b.on === "number" && Number.isFinite(b.on) && b.on <= Date.now() + 86_400_000 ? b.on : undefined;
    const id = `inc_${randomUUID().slice(0, 8)}`;
    store.append("income.logged", {
      id, amount: Math.round(amount * 100) / 100, kind: b.kind as (typeof KINDS)[number],
      currency: typeof b.currency === "string" && /^[a-zA-Z]{3}$/.test(b.currency) ? b.currency.toLowerCase() : "usd",
      venture: typeof b.venture === "string" && b.venture ? b.venture.slice(0, 80) : undefined,
      note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 300) : undefined, on,
    });
    return { id };
  });
  app.post<{ Params: { id: string } }>("/api/income/:id/remove", async (request) => {
    store.append("income.removed", { id: request.params.id });
    return { ok: true };
  });
}
