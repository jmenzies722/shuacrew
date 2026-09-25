import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";

/**
 * Learning: your career goal, skill tracks, review cards and daily drills — grounded in your own work.
 * Stored in ~/.shuacrew/learning.json (0600). Nothing is seeded: every card comes from you or from a
 * session you asked the crew to teach you from.
 */
const track = z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), name: z.string().trim().min(1).max(60), level: z.number().int().min(1).max(5), focus: z.boolean() });
const card = z.object({
  id: z.string(), track: z.string().max(40), front: z.string().min(1).max(800), back: z.string().min(1).max(2000),
  source: z.object({ run: z.string().max(80).optional(), title: z.string().max(200).optional() }).default({}),
  created: z.number(), due: z.number(), interval: z.number().min(0), ease: z.number().min(1.3).max(3.5), reps: z.number().int().min(0), lapses: z.number().int().min(0),
});
const drill = z.object({ day: z.string(), track: z.string(), run: z.string(), done: z.boolean() });
export const LearningSchema = z.object({
  version: z.literal(1).default(1),
  profile: z.object({ goal: z.string().max(200).default(""), about: z.string().max(1000).default(""), tracks: z.array(track).max(24).default([]) }).default({ goal: "", about: "", tracks: [] }),
  cards: z.array(card).max(5000).default([]),
  drills: z.array(drill).max(400).default([]),
  studied: z.array(z.object({ run: z.string(), at: z.number(), study: z.string() })).max(400).default([]),
  reviews: z.array(z.object({ at: z.number(), grade: z.enum(["again", "good", "easy"]) })).max(20000).default([]),
});
export type LearningState = z.infer<typeof LearningSchema>;
export type Card = z.infer<typeof card>;
export type Grade = "again" | "good" | "easy";

const DAY = 86_400_000;
/** SM-2-style scheduling. "again" comes back in 10 minutes; "good" and "easy" push the card out. */
export function schedule(c: Pick<Card, "interval" | "ease" | "reps" | "lapses">, grade: Grade, now = Date.now()) {
  if (grade === "again") return { interval: 0, ease: Math.max(1.3, c.ease - 0.2), reps: 0, lapses: c.lapses + 1, due: now + 10 * 60_000 };
  const reps = c.reps + 1;
  const ease = grade === "easy" ? Math.min(3.5, c.ease + 0.15) : c.ease;
  let interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(Math.max(1, c.interval) * ease);
  if (grade === "easy") interval = Math.round(interval * 1.3) || 2;
  return { interval, ease, reps, lapses: c.lapses, due: now + interval * DAY };
}

/** Cards a teaching run wrote: a ```cards JSON block (or a bare JSON array) of {front, back}. */
export function parseCards(text: string): Array<{ front: string; back: string }> {
  const block = /```(?:cards|json)?\s*(\[[\s\S]*?\])\s*```/i.exec(text)?.[1] ?? /(\[\s*\{[\s\S]*\}\s*\])/.exec(text)?.[1];
  if (!block) return [];
  try {
    const raw = JSON.parse(block) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((x) => (x && typeof x === "object" && typeof (x as { front?: unknown }).front === "string" && typeof (x as { back?: unknown }).back === "string"
      ? [{ front: (x as { front: string }).front.trim().slice(0, 800), back: (x as { back: string }).back.trim().slice(0, 2000) }] : []))
      .filter((c) => c.front && c.back).slice(0, 8);
  } catch { return []; }
}

export class Learning {
  private value: LearningState;
  constructor(private file: string) {
    let v: LearningState = LearningSchema.parse({});
    try { if (existsSync(file)) { const p = LearningSchema.safeParse(JSON.parse(readFileSync(file, "utf8"))); if (p.success) v = p.data; } } catch { /* start clean */ }
    this.value = v;
  }
  get(): LearningState { return this.value; }
  private save(next: LearningState) {
    const valid = LearningSchema.parse(next), tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(valid)}\n`, { mode: 0o600 }); renameSync(tmp, this.file); chmodSync(this.file, 0o600);
    this.value = valid; return valid;
  }
  setProfile(profile: Partial<LearningState["profile"]>) { return this.save({ ...this.value, profile: { ...this.value.profile, ...profile } }); }
  addCards(cards: Array<{ front: string; back: string }>, trackId: string, source: Card["source"] = {}, now = Date.now()) {
    const fresh = cards.map((c) => ({ id: `c_${randomUUID().slice(0, 8)}`, track: trackId, front: c.front, back: c.back, source, created: now, due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 }));
    this.save({ ...this.value, cards: [...this.value.cards, ...fresh] });
    return fresh;
  }
  review(id: string, grade: Grade, now = Date.now()) {
    const c = this.value.cards.find((x) => x.id === id); if (!c) throw new Error("No such card");
    const next = { ...c, ...schedule(c, grade, now) };
    this.save({ ...this.value, cards: this.value.cards.map((x) => (x.id === id ? next : x)), reviews: [...this.value.reviews, { at: now, grade }].slice(-20000) });
    return next;
  }
  removeCard(id: string) { this.save({ ...this.value, cards: this.value.cards.filter((c) => c.id !== id) }); }
  recordDrill(d: z.infer<typeof drill>) { this.save({ ...this.value, drills: [...this.value.drills.filter((x) => x.day !== d.day), d].slice(-400) }); }
  markDrillDone(day: string) { this.save({ ...this.value, drills: this.value.drills.map((d) => (d.day === day ? { ...d, done: true } : d)) }); }
  recordStudy(run: string, study: string, now = Date.now()) { this.save({ ...this.value, studied: [...this.value.studied.filter((s) => s.run !== run), { run, at: now, study }].slice(-400) }); }
  due(now = Date.now()) { return this.value.cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due); }
  /** The focus track you're least confident in (lowest level; ties → fewest cards). */
  weakest() {
    const focus = this.value.profile.tracks.filter((t) => t.focus);
    const pool = focus.length ? focus : this.value.profile.tracks;
    return [...pool].sort((a, b) => a.level - b.level || this.value.cards.filter((c) => c.track === a.id).length - this.value.cards.filter((c) => c.track === b.id).length)[0];
  }
}
