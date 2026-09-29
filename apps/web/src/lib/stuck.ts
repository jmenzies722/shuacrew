/**
 * Noticing when you're stuck, from glances at your screen's text (every ~15 s while live watching is on). Pure, so
 * the rules are testable: an error that stays on screen, the same error coming back after you tried something, or
 * searching the web for help again and again. Spark offers once, then leaves you alone: a cooldown between offers,
 * and "Not now" mutes that particular thing for half an hour.
 */
export interface Glance { at: number; app: string; text: string }
export interface StuckState { history: Glance[]; lastOffer: number; muted: Record<string, number> }
export interface StuckOffer { key: string; kind: "error" | "search"; app: string; detail: string }

export const STUCK_START: StuckState = { history: [], lastOffer: -Infinity, muted: {} };
const COOLDOWN = 5 * 60_000, MUTE = 30 * 60_000, WINDOW = 5 * 60_000;
const ERROR = /\b(error|failed|failure|exception|traceback|fatal|denied|not found|cannot|can't|couldn't|unable to|invalid|undefined is not|segmentation fault|panic|ENOENT|EACCES|ECONNREFUSED|timed out)\b/i;
const BROWSERS = /^(Safari|Google Chrome|Chrome|Arc|Firefox|Microsoft Edge|Brave Browser|Orion|Dia)$/;
const HELP = /\b(how (do|to|can) i|not working|doesn'?t work|won'?t|stack ?overflow|fix|error|help)\b/i;

/** The first error-looking line: a stable fingerprint (numbers and paths blurred) plus the line to mention. */
export function errorLine(text: string): { print: string; line: string } | null {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length >= 8 && l.length <= 240 && ERROR.test(l));
  return line ? { line, print: line.toLowerCase().replace(/\d+/g, "#").replace(/[/~][^\s]+/g, "/…").slice(0, 80) } : null;
}

export function stuckSignal(state: StuckState, glance: Glance): { state: StuckState; offer?: StuckOffer } {
  const now = glance.at;
  const history = [...state.history.filter((g) => now - g.at < WINDOW), glance].slice(-24);
  const muted = Object.fromEntries(Object.entries(state.muted).filter(([, until]) => until > now));
  const next = { history, lastOffer: state.lastOffer, muted };
  if (now - state.lastOffer < COOLDOWN) return { state: next };
  const offer = (o: StuckOffer) => muted[o.key] ? { state: next } : { state: { ...next, lastOffer: now }, offer: o };

  // An error that has stayed on screen for three glances in a row (~30 s+) in the same app.
  const err = errorLine(glance.text);
  if (err) {
    const recent = history.slice(-3);
    if (recent.length === 3 && recent.every((g) => g.app === glance.app && errorLine(g.text)?.print === err.print))
      return offer({ key: `error:${glance.app}:${err.print}`, kind: "error", app: glance.app, detail: err.line });
    // Or the same error came back after you'd moved on from it (tried something, it failed again).
    const seen = history.slice(0, -1).map((g) => errorLine(g.text)?.print);
    const gone = seen.lastIndexOf(err.print) >= 0 && seen.slice(seen.lastIndexOf(err.print) + 1).some((p) => p !== err.print);
    if (gone && seen.filter((p) => p === err.print).length >= 2)
      return offer({ key: `error:${glance.app}:${err.print}`, kind: "error", app: glance.app, detail: err.line });
  }
  // Searching for help: three different help-looking browser pages within a few minutes.
  if (BROWSERS.test(glance.app)) {
    const pages = new Set(history.filter((g) => BROWSERS.test(g.app)).map((g) => g.text.split("\n").find((l) => HELP.test(l))?.slice(0, 80)).filter(Boolean));
    if (pages.size >= 3) return offer({ key: `search:${[...pages].at(-1)}`, kind: "search", app: glance.app, detail: [...pages].at(-1)! });
  }
  return { state: next };
}

/** "Not now": that particular thing stays quiet for half an hour. */
export function muteStuck(state: StuckState, key: string, now: number): StuckState {
  return { ...state, muted: { ...state.muted, [key]: now + MUTE } };
}
