/**
 * Done means verified. When a session changes code, it must run a check after its last edit before it may rest.
 * This is the one rule, read from the run's own events so the gateway (which enforces it) and every screen (which
 * shows it) agree:
 *
 *   verified    files changed, and the last check after the last edit passed
 *   failing     files changed, and the last check after the last edit failed
 *   unverified  files changed, and nothing checked them afterwards
 *   none        nothing to verify: no files changed, or only prose (docs) changed
 *
 * It looks at the work since your last ask. If that work is unverified or failing, the gateway asks the agent once
 * to prove it (a turn by VERIFY_BY); whatever is true after that turn is the session's verdict. It never asks twice,
 * so an agent that cannot verify ends "unverified" instead of looping.
 */
import type { AnyEvent } from "./events.js";

export type VerifyState = "verified" | "failing" | "unverified" | "none";
export interface VerifyDecision {
  state: VerifyState;
  /** Ask the agent to prove it: only once per ask of yours, and only when there is something unproven. */
  nudge: boolean;
  /** Code files changed since your last ask (docs don't count). */
  files: number;
  /** The check that decided it, when there was one. */
  command?: string;
  /** This verdict comes after the gateway already asked for proof. */
  nudged: boolean;
}

/** Who a proof-request turn is by, in `run.followup` and `turn.started`. */
export const VERIFY_BY = "verify";

/** Prose a test suite doesn't cover: changing only these needs no check. */
const PROSE = /\.(md|mdx|markdown|txt|rst|adoc)$/i;

export function verifyDecision(events: AnyEvent[]): VerifyDecision {
  // The work in question starts at your last ask: the latest turn that wasn't the gateway's own proof request.
  let from = 0, nudged = false;
  for (const e of events) {
    if (e.kind !== "turn.started") continue;
    if (e.body.by === VERIFY_BY) nudged = true;
    else { from = e.seq; nudged = false; }
  }
  const files = new Set<string>();
  let lastEdit = 0;
  for (const e of events) {
    if (e.seq <= from || e.kind !== "file.changed" || PROSE.test(e.body.path)) continue;
    files.add(e.body.path);
    lastEdit = e.seq;
  }
  if (!files.size) return { state: "none", nudge: false, files: 0, nudged };
  let check: { command: string; passed: boolean } | undefined;
  for (const e of events) if (e.kind === "check.ran" && e.seq > lastEdit) check = { command: e.body.command, passed: e.body.exitCode === 0 };
  const state: VerifyState = !check ? "unverified" : check.passed ? "verified" : "failing";
  return { state, nudge: state !== "verified" && !nudged, files: files.size, ...(check ? { command: check.command } : {}), nudged };
}

/** What the gateway asks the agent when the work isn't proven. Plain and bounded: one check, one honest line. */
export function verifyAsk(decision: VerifyDecision): string {
  const changed = `${decision.files} file${decision.files === 1 ? "" : "s"}`;
  return decision.state === "failing"
    ? `Before this is done: your last check failed (${decision.command ?? "the check"}) after you changed ${changed}. Fix the failure and run the check again. If it cannot pass, say exactly why in one or two lines and stop; do not claim it works.`
    : `Before this is done: you changed ${changed} and ran no check afterwards. Run the project's tests (or the narrowest check that exercises what you changed) now and report the result. If no check applies, say in one line what you verified and how; do not claim it is verified without running something.`;
}

/**
 * Who the next turn is by. When everything queued for it came from one automatic source (the gateway's proof
 * request, a reviewer's findings) the turn is by that source; as soon as you have said anything too, it is yours.
 */
export function nextTurnBy(events: AnyEvent[]): string {
  let authors = new Set<string>();
  const withdrawn = new Set<string>();
  for (const e of events) if (e.kind === "run.followup.withdrawn") withdrawn.add(e.body.id);
  for (const e of events) {
    if (e.kind === "turn.started") authors = new Set();
    else if (e.kind === "run.followup" && !(e.body.id && withdrawn.has(e.body.id))) authors.add(e.body.by);
  }
  const [only] = authors;
  return authors.size === 1 && only && AUTOMATIC.has(only) ? only : "you";
}
/** Sources that queue a turn on their own. Anything else (you, a room's results) is a turn of yours. */
const AUTOMATIC = new Set([VERIFY_BY, "review"]);
