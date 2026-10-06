/**
 * Shua's journal, so its accuracy and speed are measured, not claimed: every step it takes on your screen (press,
 * click, type, key, scroll) and whether it worked, and how fast its voice answers. One JSON line each, next to the
 * event store; reads keep the newest MAX.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";

export interface JournalEntry {
  at: number;
  /** press · click · type · key · scroll · ui (a press inside ShuaCrew by name) */
  kind: string;
  /** How the target was found: an exact numbered item, by name, or by position. */
  how: "target" | "name" | "position" | "none";
  label: string;
  ok: boolean;
  message: string;
  /** The app it acted in, when known. */
  app?: string;
  /** Plan to result, in milliseconds. */
  ms?: number;
}
export interface JournalStats {
  total: number;
  ok: number;
  /** ok / total, 0..1; null with nothing recorded. */
  rate: number | null;
  byHow: Record<string, { total: number; ok: number }>;
  byKind: Record<string, { total: number; ok: number }>;
  /** Most common reasons a step failed, newest wording. */
  failures: Array<{ why: string; count: number }>;
  recent: JournalEntry[];
}

const MAX = 5000;
const KINDS = new Set(["press", "click", "type", "key", "scroll", "ui"]);
const HOWS = new Set(["target", "name", "position", "none"]);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Accept only well-formed steps; anything else is dropped rather than stored. */
export function toEntry(v: unknown, now = Date.now()): JournalEntry | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (!KINDS.has(o.kind as string) || typeof o.ok !== "boolean") return null;
  const ms = Number(o.ms);
  return {
    at: now, kind: o.kind as string, how: HOWS.has(o.how as string) ? (o.how as JournalEntry["how"]) : "none",
    label: str(o.label, 80), ok: o.ok, message: str(o.message, 200),
    ...(str(o.app, 60) ? { app: str(o.app, 60) } : {}), ...(Number.isFinite(ms) && ms >= 0 && ms < 600_000 ? { ms: Math.round(ms) } : {}),
  };
}

/** The reason a step failed, without the advice tail, so the same failure groups together. */
const reason = (m: string) => m.replace(/\. (Take a fresh look|Look again|No click was sent).*$/i, "").replace(/[“"][^”"]*[”"]/g, "“…”").slice(0, 90);

export function journalStats(entries: JournalEntry[], since = 0): JournalStats {
  const list = entries.filter((e) => e.at >= since);
  const tally = (key: (e: JournalEntry) => string) => {
    const out: Record<string, { total: number; ok: number }> = {};
    for (const e of list) { const k = key(e), t = (out[k] ??= { total: 0, ok: 0 }); t.total++; if (e.ok) t.ok++; }
    return out;
  };
  const fails = new Map<string, number>();
  for (const e of list) if (!e.ok) fails.set(reason(e.message), (fails.get(reason(e.message)) ?? 0) + 1);
  const ok = list.filter((e) => e.ok).length;
  return {
    total: list.length, ok, rate: list.length ? ok / list.length : null, byHow: tally((e) => e.how), byKind: tally((e) => e.kind),
    failures: [...fails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([why, count]) => ({ why, count })),
    recent: list.slice(-12).reverse(),
  };
}

export class ShuaJournal {
  constructor(readonly file: string) {}
  read(): JournalEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8").split("\n").flatMap((line) => { try { return line ? [JSON.parse(line) as JournalEntry] : []; } catch { return []; } });
  }
  add(entry: JournalEntry) {
    appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
    // Trim now and then, not on every write: keep the newest MAX.
    if (Math.random() < 0.02) { const all = this.read(); if (all.length > MAX) writeFileSync(this.file, all.slice(-MAX).map((e) => JSON.stringify(e)).join("\n") + "\n"); }
  }
}

/** Voice speed: from the moment you stop talking to the first sound of Shua's answer. */
export interface VoiceSample { at: number; ms: number; mode: "live" | "push" }
export interface VoiceStats { count: number; p50: number | null; p90: number | null; best: number | null; last: number | null; byMode: Record<string, { count: number; p50: number | null }> }
/** The value at fraction p of sorted values (nearest rank); null when empty. */
export const rank = (sorted: number[], p: number): number | null => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))]! : null);
export function voiceStats(samples: VoiceSample[], since = 0): VoiceStats {
  const list = samples.filter((s) => s.at >= since), sorted = list.map((s) => s.ms).sort((a, b) => a - b);
  const byMode: VoiceStats["byMode"] = {};
  for (const mode of new Set(list.map((s) => s.mode))) { const m = list.filter((s) => s.mode === mode).map((s) => s.ms).sort((a, b) => a - b); byMode[mode] = { count: m.length, p50: rank(m, 0.5) }; }
  return { count: list.length, p50: rank(sorted, 0.5), p90: rank(sorted, 0.9), best: sorted[0] ?? null, last: list.at(-1)?.ms ?? null, byMode };
}

export function registerShuaJournal(app: FastifyInstance, home: string) {
  const voice = path.join(home, "shua-voice.jsonl");
  const samples = (): VoiceSample[] => existsSync(voice) ? readFileSync(voice, "utf8").split("\n").flatMap((l) => { try { return l ? [JSON.parse(l) as VoiceSample] : []; } catch { return []; } }).slice(-MAX) : [];
  app.post("/api/shua/voice", async (request, reply) => {
    const b = (request.body ?? {}) as { ms?: unknown; mode?: unknown };
    const ms = Number(b.ms);
    if (!Number.isFinite(ms) || ms < 50 || ms > 30_000) return reply.code(400).send({ error: "ms must be 50–30000." });
    appendFileSync(voice, `${JSON.stringify({ at: Date.now(), ms: Math.round(ms), mode: b.mode === "push" ? "push" : "live" })}\n`);
    return { recorded: 1 };
  });
  app.get<{ Querystring: { days?: string } }>("/api/shua/voice", async (request) => {
    const days = Math.max(1, Math.min(90, Number(request.query.days) || 7));
    return voiceStats(samples(), Date.now() - days * 86_400_000);
  });
  const journal = new ShuaJournal(path.join(home, "shua-actions.jsonl"));
  app.post("/api/shua/journal", async (request, reply) => {
    const body = request.body as { steps?: unknown[] } | undefined;
    const steps = (Array.isArray(body?.steps) ? body.steps : [body]).slice(0, 12).map((s) => toEntry(s)).filter((e): e is JournalEntry => !!e);
    if (!steps.length) return reply.code(400).send({ error: "No valid steps." });
    for (const e of steps) journal.add(e);
    return { recorded: steps.length };
  });
  app.get<{ Querystring: { days?: string } }>("/api/shua/journal", async (request) => {
    const days = Math.max(1, Math.min(90, Number(request.query.days) || 7));
    return journalStats(journal.read(), Date.now() - days * 86_400_000);
  });
  return journal;
}
