/**
 * Who on the crew fits a piece of work best, from what they're for: their triggers and role, matched as whole words
 * (or word starts, so "pricing" finds "price"). Shua, the generalist, is never the "best fit" — it's the fallback.
 */
export interface Matchable { id: string; name: string; role: string; triggers: string[] }

const words = (s: string) => s.toLowerCase().match(/[a-z0-9$]+/g) ?? [];

export function memberScore(text: string, m: Matchable): number {
  const said = words(text);
  if (!said.length) return 0;
  let score = 0;
  for (const t of [...m.triggers, ...m.role.split(/\s+/)]) {
    const parts = words(t);
    if (!parts.length) continue;
    // A phrase trigger ("landing page") counts when all its words appear; a word when it starts a said word.
    const hit = parts.every((p) => said.some((w) => w === p || (p.length >= 4 && w.startsWith(p.slice(0, Math.max(4, p.length - 2))))));
    if (hit) score += parts.length > 1 ? 2 : 1;
  }
  return score;
}

export function bestMember<T extends Matchable>(text: string, members: T[]): T | null {
  let best: T | null = null, top = 0;
  for (const m of members) {
    if (/personal assistant/i.test(m.role)) continue;
    const s = memberScore(text, m);
    if (s > top) { top = s; best = m; }
  }
  return best;
}
