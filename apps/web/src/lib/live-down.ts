/**
 * How long voice stays on classic after a Live call fails. A dropped connection is worth retrying soon; a used-up
 * Codex plan is not — retrying it costs the next press, every press, until the plan resets.
 */
const RETRY_AFTER = 10 * 60_000, LIMIT_FALLBACK = 6 * 3_600_000;

export function liveDownUntil(detail: string | undefined, now = Date.now()): number {
  if (!detail || !/usage limit/i.test(detail)) return now + RETRY_AFTER;
  // Codex says when: "try again at Oct 9th, 2026 8:28 PM."
  const when = /try again at ([A-Za-z]+ \d{1,2})(?:st|nd|rd|th)?, (\d{4}) (\d{1,2}:\d{2}) ?([AP]M)/i.exec(detail);
  const reset = when ? new Date(`${when[1]}, ${when[2]} ${when[3]} ${(when[4] ?? "").toUpperCase()}`).getTime() : NaN;
  return Number.isFinite(reset) && reset > now ? reset : now + LIMIT_FALLBACK;
}
