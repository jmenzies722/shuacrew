/**
 * Screen memory: a private, text-only timeline of what was on your screen, so Spark can answer "what was that error an
 * hour ago?". The Mac app reads the screen's text about once a minute — only while you've turned it on — and sends it
 * here. Nothing leaves this Mac, no images are kept, and it forgets on its own after a few days (or instantly on Clear).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

export interface Moment { at: number; app: string; window: string; text: string }
export const KEEP_DAYS = 3;
const MAX_TEXT = 6000;

/** Words worth matching: lowercase, 3+ letters or digits, minus the most common filler. */
const STOP = new Set(["the", "and", "that", "this", "what", "was", "were", "with", "from", "have", "you", "your", "for", "are", "earlier", "ago", "before", "hour", "minutes", "screen", "saw", "remind", "about", "there", "which", "when", "where", "did", "said", "say"]);
export const terms = (q: string) => [...new Set(q.toLowerCase().match(/[a-z0-9][a-z0-9_.:-]{2,}/g) ?? [])].filter((w) => !STOP.has(w)).slice(0, 12);

/** Best moments for a question: every term that appears scores, rarer and more recent moments win. */
export function search(moments: Moment[], q: string, now = Date.now(), limit = 5) {
  const words = terms(q);
  if (!words.length) return [];
  return moments
    .map((m) => {
      const hay = `${m.app} ${m.window} ${m.text}`.toLowerCase();
      const hits = words.filter((w) => hay.includes(w));
      const recency = 1 / (1 + (now - m.at) / 3_600_000); // an hour ago counts about half
      return { m, score: hits.length ? hits.length / words.length + 0.25 * recency : 0, hits };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.at - a.m.at)
    .slice(0, limit)
    .map(({ m, hits }) => ({ at: m.at, app: m.app, window: m.window, excerpt: excerpt(m.text, hits) }));
}
/** The lines around the first match, so the answer carries the actual error or number, not the whole screen. */
export function excerpt(text: string, hits: string[], width = 600) {
  const lower = text.toLowerCase();
  const i = Math.max(0, Math.min(...hits.map((h) => lower.indexOf(h)).filter((n) => n >= 0), text.length));
  const start = Math.max(0, i - width / 3);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + width).trim()}${start + width < text.length ? "…" : ""}`;
}

export class ScreenMemory {
  constructor(readonly file = process.env.SHUACREW_SCREEN_MEMORY || path.join(os.homedir(), ".shuacrew", "screen-memory.jsonl")) {}
  all(now = Date.now()): Moment[] {
    if (!existsSync(this.file)) return [];
    const cutoff = now - KEEP_DAYS * 86_400_000;
    return readFileSync(this.file, "utf8").split("\n").flatMap((line) => { try { const m = JSON.parse(line) as Moment; return m.at >= cutoff ? [m] : []; } catch { return []; } });
  }
  /** Keep a moment unless it's the same screen as the last one; drop anything past the retention window. */
  add(m: Moment, now = Date.now()): boolean {
    const text = m.text.replace(/[ \t]+/g, " ").trim().slice(0, MAX_TEXT);
    if (text.length < 20) return false;
    const all = this.all(now), last = all.at(-1);
    if (last && last.app === m.app && last.window === m.window && last.text === text) return false;
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const line = JSON.stringify({ at: m.at, app: m.app.slice(0, 80), window: m.window.slice(0, 160), text }) + "\n";
    if (all.length && all[0]!.at < now - KEEP_DAYS * 86_400_000 + 3_600_000) writeFileSync(this.file, all.map((x) => JSON.stringify(x)).join("\n") + "\n" + line, { mode: 0o600 });
    else appendFileSync(this.file, line, { mode: 0o600 });
    return true;
  }
  clear() { rmSync(this.file, { force: true }); }
}

export function screenMemoryRoutes(app: FastifyInstance, memory = new ScreenMemory()) {
  app.post<{ Body: Partial<Moment> }>("/api/screen-memory", async (req) => {
    const b = req.body ?? {};
    const kept = typeof b.text === "string" && memory.add({ at: typeof b.at === "number" ? b.at : Date.now(), app: String(b.app ?? ""), window: String(b.window ?? ""), text: b.text });
    return { kept };
  });
  app.get<{ Querystring: { q?: string } }>("/api/screen-memory/search", async (req) => ({ results: search(memory.all(), req.query.q ?? "") }));
  app.get("/api/screen-memory", async () => {
    const all = memory.all(), midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    return { moments: all.length, today: all.filter((m) => m.at >= midnight.getTime()).length, oldest: all[0]?.at ?? null, keepDays: KEEP_DAYS };
  });
  app.delete("/api/screen-memory", async () => { memory.clear(); return { ok: true }; });
  return memory;
}
