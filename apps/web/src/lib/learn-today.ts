/**
 * Learn's Today, the parts that must be right: which skill really needs work, and your week of practice.
 * Pure, so they're tested without a server.
 */
export interface TrackScore { id: string; name: string; reviews: number; accuracy: number | null; lapses: number }

/**
 * The skill to work on: the lowest accuracy among skills with enough answers to mean something (3+), and only if it's
 * actually weak (under 80%). Never a skill you're acing — the old pick could say "close the gap" over 100%.
 */
export function weakestSkill(tracks: TrackScore[], minReviews = 3, below = 0.8): TrackScore | null {
  const scored = tracks.filter((t) => t.reviews >= minReviews && t.accuracy !== null && t.accuracy < below);
  return scored.sort((a, b) => (a.accuracy! - b.accuracy!) || (b.lapses - a.lapses))[0] ?? null;
}

/**
 * The last seven days of practice, oldest first, for a forgiving weekly rhythm: how many days you practised, not an
 * unbroken streak. Research on streaks: breaking one is a top reason people quit; a weekly target isn't fragile.
 */
export function weekRhythm(days: Array<{ day: string; reviews: number }>, today = new Date()): { days: Array<{ day: string; label: string; reviews: number; today: boolean }>; practised: number; reviews: number } {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const by = new Map(days.map((d) => [d.day, d.reviews]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i));
    return { day: key(d), label: d.toLocaleDateString([], { weekday: "narrow" }), reviews: by.get(key(d)) ?? 0, today: i === 6 };
  });
  return { days: week, practised: week.filter((d) => d.reviews > 0).length, reviews: week.reduce((n, d) => n + d.reviews, 0) };
}

/**
 * Your goal as a role you can put in a heading: "Become an AI Platform Engineer / AI Enablement Engineer, dedicating
 * 12 hours per week…" → "AI Platform Engineer / AI Enablement Engineer". Drops "become (a/an)", stops at the first
 * comma or "dedicating/spending/while…", and keeps it short. The whole sentence stays in Goal & skills.
 */
export function goalRole(goal: string, max = 60): string {
  let g = goal.trim().replace(/^(i\s+want\s+to\s+|to\s+)?(become|becoming|be)\s+(an?\s+|the\s+)?/i, "");
  g = g.split(/\s*[,;.(]\s*|\s+(?:dedicating|spending|while|by|within|in\s+\d|with\s+\d)\b/i)[0]!.trim();
  if (g.length > max) g = g.slice(0, max).replace(/\s+\S*$/, "") + "…";
  return g;
}
/** "a"/"an" for a role. */
export const article = (role: string) => (/^[aeiou]/i.test(role) && !/^(uni|use|eu)/i.test(role) ? "an" : "a");
