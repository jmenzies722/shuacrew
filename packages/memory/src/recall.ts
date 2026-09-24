/**
 * Which lessons a new run should be told about. Keyword retrieval with IDF weighting: no model
 * call, no embedding service, deterministic, fast enough to run on every launch. (sqlite-vec was
 * the plan; for tens-to-hundreds of short lessons, IDF over stems measured as well on the eval —
 * see docs/research.md.)
 */
import { live, type Lesson, type MemoryView, type Skill } from "./memory.js";

const STOP = new Set(
  "a an and are as at be but by do does for from has have how i if in into is it its me my no not of on or our so that the their them then there these this to too up us was we were what when where which while who why will with you your should would could can just than very also always never don't dont add make use new need get set every any all via".split(" "),
);

/** Lowercase word stems: "Testing", "tests" and "tested" all become "test". */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

function stem(w: string): string {
  if (w.length <= 4) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  for (const suffix of ["ions", "ion", "ing", "ed", "es", "s", "ly"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) return trimE(w.slice(0, -suffix.length));
  }
  return trimE(w);
}

/** "migrate" and "migration" meet at "migrat". */
const trimE = (w: string) => (w.length > 4 && w.endsWith("e") ? w.slice(0, -1) : w);

export interface Candidate {
  lesson: Lesson;
  /** Terms the ask and the lesson share. */
  shared: string[];
  /** Inverse document frequency of each shared term across all live lessons: rare words matter more. */
  idf: Record<string, number>;
  /** How many distinct terms the lesson has — long lessons match more words by chance. */
  length: number;
  /** Whether the lesson is scoped to the repo this run is in. */
  sameProject: boolean;
}

/**
 * How relevant one lesson is to the ask about to run. 0 means "leave it out".
 */
export function score(c: Candidate): number {
  if (!c.shared.length) return 0;
  const weights = c.shared.map((t) => c.idf[t]!);
  // One common word in passing ("plan", "test") is noise; one rare word or two words together is signal.
  if (weights.length < 2 && Math.max(...weights) < 2) return 0;
  // Lessons are one or two sentences, so length normalisation cost more than it saved (see `pnpm eval`).
  const match = weights.reduce((a, b) => a + b, 0);
  return match * (0.5 + c.lesson.confidence) * (c.sameProject ? 1.5 : 1);
}

export interface Recalled {
  lesson: Lesson;
  score: number;
  shared: string[];
}

/** The lessons worth injecting into a run, best first. */
export function recall(memory: MemoryView, ask: string, project?: string, limit = 6, now = Date.now()): Recalled[] {
  const pool = Object.values(memory.lessons).filter((l) => live(l, now) && (l.scope === "global" || l.project === project));
  if (!pool.length) return [];
  const docs = pool.map((l) => new Set(terms(l.text)));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  const wanted = new Set(terms(ask));
  const out: Recalled[] = [];
  pool.forEach((lesson, i) => {
    const doc = docs[i]!;
    const shared = [...doc].filter((t) => wanted.has(t));
    const idf = Object.fromEntries(shared.map((t) => [t, Math.log(1 + pool.length / (df.get(t) ?? 1))]));
    const s = score({ lesson, shared, idf, length: doc.size, sameProject: !!project && lesson.project === project });
    if (s > 0) out.push({ lesson, score: s, shared });
  });
  // Keep what's close to the best match: a lesson far behind it is riding on a stray word.
  out.sort((a, b) => b.score - a.score);
  const floor = (out[0]?.score ?? 0) * 0.6; // swept 0.5–0.7 on the eval; 0.6 is where precision stops rising
  return out.filter((r) => r.score >= floor).slice(0, limit);
}

/** Lessons and accepted skills, as the run's system addendum. Empty when there is nothing to say. */
export function render(recalled: Recalled[], skills: Skill[] = []): string {
  const parts: string[] = [];
  if (recalled.length) {
    parts.push(
      "Lessons from earlier work in this workspace (the person taught these; follow them unless the task says otherwise):",
      ...recalled.map((r) => `- ${r.lesson.text}`),
    );
  }
  for (const s of skills) parts.push(`\nSkill: ${s.name}\n${s.body}`);
  return parts.join("\n");
}

/** Accepted skills whose name or body overlaps the ask. */
export function relevantSkills(memory: MemoryView, ask: string): Skill[] {
  const wanted = new Set(terms(ask));
  return Object.values(memory.skills).filter((s) => s.status === "accepted" && terms(`${s.name} ${s.body}`).filter((t) => wanted.has(t)).length >= 2);
}

/**
 * A follow-up that corrects the agent is a lesson waiting to be written down. Only clear, general
 * instructions count — "no, use pnpm not npm", "always run the linter first" — not one-off asks.
 */
export function correctionIn(text: string): string | undefined {
  const t = text.trim();
  if (t.length < 12 || t.length > 400) return undefined;
  const rule = /\b(always|never|don'?t|do not|stop|instead of|rather than|prefer|make sure|remember)\b/i;
  const pushback = /^(no|nope|wrong|not that|that's wrong|that is wrong)\b[,.! ]/i;
  if (!rule.test(t) && !pushback.test(t)) return undefined;
  const sentences = t.replace(pushback, "").replace(/^[\s—–-]+/, "").split(/(?<=[.!?])\s+/);
  const sentence = sentences.find((s) => rule.test(s)) ?? sentences[0]!;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1).replace(/[.!]*$/, ".");
}

/**
 * Asks that keep coming back are a skill nobody has written yet. Groups past asks by shared terms
 * and proposes one skill per group of `min`+ that no skill already covers.
 */
export function skillCandidates(memory: MemoryView, min = 3): Array<{ name: string; body: string; from: string[] }> {
  const asks = memory.asks.map((a) => ({ ...a, terms: new Set(terms(a.text)) })).filter((a) => a.terms.size >= 2);
  const covered = Object.values(memory.skills).flatMap((s) => s.from);
  const used = new Set<string>(covered);
  const groups: Array<typeof asks> = [];
  for (const a of asks) {
    if (used.has(a.run)) continue;
    const group = asks.filter((b) => !used.has(b.run) && jaccard(a.terms, b.terms) >= 0.5);
    if (group.length >= min) {
      group.forEach((g) => used.add(g.run));
      groups.push(group);
    }
  }
  return groups.map((group) => {
    const common = new Set([...group[0]!.terms].filter((t) => group.every((g) => g.terms.has(t))));
    // Named in the person's own words, not stems.
    const words = (group[0]!.text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w, i, all) => common.has(terms(w)[0] ?? "") && all.indexOf(w) === i);
    const name = words.slice(0, 4).join("-") || "recurring-task";
    const examples = group.slice(0, 3).map((g) => `- "${g.text.split("\n")[0]!.slice(0, 120)}"`);
    return {
      name,
      body: `You've been asked this ${group.length} times. Examples:\n${examples.join("\n")}\n\nSteps that worked (edit before accepting):\n1. \n2. \n3. `,
      from: group.map((g) => g.run),
    };
  });
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let both = 0;
  for (const t of a) if (b.has(t)) both += 1;
  return both / (a.size + b.size - both || 1);
}
