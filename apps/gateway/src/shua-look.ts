/**
 * Shua's look, so the iPhone shows exactly the Shua you designed on the Mac: the Mac's own window renders your
 * character (same drawing, finish, eyes, accessories) to SVG and publishes it here with its animation CSS; the phone
 * reads it through the phone door. Stored as one small file; never scripts, never anything but markup and CSS.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";

export interface ShuaLook {
  /** What you call Shua ("Shua" unless you renamed it). */
  name: string;
  /** The character, rendered: one <span class="spark-character …">…<svg>…</svg></span>. */
  markup: string;
  /** spark-character.css: the moods (thinking, speaking, happy, concerned, sleepy) and idle motion. */
  css: string;
  /** Your accent, for the phone's tint (#rrggbb). */
  accent: string;
  /** Shua's voice on the Mac, so the phone speaks with the same one (ShuaCrew's voice engine). */
  voiceId?: string;
  voiceSpeed?: number;
  at: number;
}

const MAX = 250_000;
/** Markup and CSS only: anything that could run (scripts, handlers, external loads) is refused, not cleaned. */
export function toLook(v: unknown, now = Date.now()): ShuaLook | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const markup = typeof o.markup === "string" ? o.markup : "", css = typeof o.css === "string" ? o.css : "";
  if (!markup.startsWith("<") || markup.length > MAX || css.length > MAX) return null;
  if (/<script|<iframe|<object|<embed|<foreignObject|\son\w+\s*=|javascript:|href\s*=\s*["']?(?!#)/i.test(markup)) return null;
  if (/@import|url\(\s*["']?(?!#|data:image\/svg)|expression\(|<\/?style/i.test(css)) return null;
  const accent = typeof o.accent === "string" && /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent.toLowerCase() : "#8e48ff";
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 24) : "Shua";
  const voiceId = typeof o.voiceId === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(o.voiceId) ? o.voiceId : undefined;
  const speed = Number(o.voiceSpeed), voiceSpeed = Number.isFinite(speed) && speed >= 0.8 && speed <= 1.2 ? speed : undefined;
  return { name, markup, css, accent, ...(voiceId ? { voiceId } : {}), ...(voiceSpeed ? { voiceSpeed } : {}), at: now };
}

/** Your first name, from this Mac's account ("Josh Menzies" → "Josh"), so Shua can greet you by it. Read once. */
let first: string | null | undefined;
export function macFirstName(): string | undefined {
  if (first === undefined) {
    try { first = execFileSync("/usr/bin/id", ["-F"], { encoding: "utf8", timeout: 2000 }).trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") || null; }
    catch { first = null; }
  }
  return first ?? undefined;
}

export function registerShuaLook(app: FastifyInstance, home: string) {
  const file = path.join(home, "shua-look.json");
  const read = (): ShuaLook | null => { try { return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ShuaLook) : null; } catch { return null; } };
  app.post("/api/shua/look", async (request, reply) => {
    const look = toLook(request.body);
    if (!look) return reply.code(400).send({ error: "Not a character: markup and CSS only." });
    const before = read();
    if (before && before.markup === look.markup && before.css === look.css && before.accent === look.accent && before.name === look.name && before.voiceId === look.voiceId && before.voiceSpeed === look.voiceSpeed) return { saved: false };
    writeFileSync(file, JSON.stringify(look), { mode: 0o600 });
    return { saved: true };
  });
  app.get("/api/shua/look", async (_request, reply) => {
    const look = read();
    if (!look) return reply.code(404).send({ error: "No look published yet: open ShuaCrew on the Mac." });
    const firstName = macFirstName();
    return firstName ? { ...look, firstName } : look;
  });
}
