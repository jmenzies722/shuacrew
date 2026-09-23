/**
 * The audit trail is the log itself, hash-chained.
 *
 * Each event stores the hash of the one before it and a hash over (prev, seq, at, kind, run,
 * session, body). Editing, deleting or reordering any stored event breaks every hash after it,
 * so `verify` proves the record is the record — without keeping a second copy that could drift.
 */
import { createHash } from "node:crypto";

export const GENESIS = "0".repeat(64);

/** JSON with sorted keys, so the same value always hashes the same way. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
}

export interface Chainable {
  seq: number;
  at: number;
  kind: string;
  run: string | null;
  session: string | null;
  body: unknown;
  prev: string;
  hash: string;
}

export function hashOf(fact: Omit<Chainable, "hash">): string {
  return createHash("sha256")
    .update(fact.prev)
    .update("\u0000")
    .update(canonical([fact.seq, fact.at, fact.kind, fact.run, fact.session, fact.body]))
    .digest("hex");
}

export type Verification = { ok: true; count: number; head: string } | { ok: false; count: number; brokenAt: number; why: string };

/** Walk the chain from the start. Stops at the first fact that does not follow from the last. */
export function verify(facts: Iterable<Chainable>): Verification {
  let prev = GENESIS;
  let count = 0;
  let lastSeq = 0;
  for (const fact of facts) {
    if (fact.seq <= lastSeq) return { ok: false, count, brokenAt: fact.seq, why: "out of order" };
    if (fact.prev !== prev) return { ok: false, count, brokenAt: fact.seq, why: "does not follow the previous event" };
    if (hashOf(fact) !== fact.hash) return { ok: false, count, brokenAt: fact.seq, why: "contents were changed" };
    prev = fact.hash;
    lastSeq = fact.seq;
    count += 1;
  }
  return { ok: true, count, head: prev };
}
