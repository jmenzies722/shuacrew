/**
 * What /api/snapshot sends: the folded state, with each run's `ask` cut to what a list or a search needs.
 * A conversation with Shua stores its whole composed prompt as the ask (up to ~65 KB each), which made the
 * snapshot every window loads on launch and reconnect 2.5 MB — 99% of it prompt text nobody reads there.
 * The full ask stays in the event log (and in a run's own events) for anything that needs it.
 */
import type { CrewState, RunView } from "@shuacrew/core/projections";

/** Shua's runs are titled; their ask is a prompt. A work session's ask is what you typed: keep almost all of it. */
const ASK_LIMIT = { buddy: 280, work: 8000 };

export function leanRun(run: RunView): RunView {
  const limit = run.labels.includes("buddy") ? ASK_LIMIT.buddy : ASK_LIMIT.work;
  return run.ask.length > limit ? { ...run, ask: `${run.ask.slice(0, limit)}…` } : run;
}

export function snapshotView(state: CrewState): CrewState {
  const runs: CrewState["runs"] = {};
  for (const [id, run] of Object.entries(state.runs)) runs[id] = leanRun(run);
  return { ...state, runs };
}

/**
 * A Shua conversation's events, as a window needs them. Each of your messages to Shua is stored with the prompt it
 * was sent with: Shua's whole persona before "The user says: ", your screen after "[screen]", the app guide after
 * "[app]". Every reader keeps only your words (the last marker onward, cut at those sections), so they're collapsed here,
 * keeping the markers: a big conversation went from ~930 KB to a fraction. The store keeps everything.
 */
const SAID = "\nThe user says: ";
export function leanText(text: string): string {
  let out = text;
  const said = out.lastIndexOf(SAID);
  if (said > 200 && out.startsWith("You are Shua")) out = `You are Shua… (prompt omitted)${out.slice(said)}`;
  // Context sections every reader cuts at: your screen, and the app guide sent with messages from the iPhone.
  for (const marker of ["\n\n[screen]", "\n\n[app]"]) {
    const at = out.indexOf(marker);
    if (at >= 0 && out.length - at > 200) out = `${out.slice(0, at)}${marker} …`;
  }
  return out;
}

type Ev = { kind: string; body: unknown };
export function eventsView<E extends Ev>(events: E[], buddy: boolean): E[] {
  if (!buddy) return events;
  return events.map((e) => {
    const body = e.body as Record<string, unknown>;
    if ((e.kind === "turn.started" || e.kind === "run.followup") && typeof body.text === "string") {
      const text = leanText(body.text);
      return text === body.text ? e : { ...e, body: { ...body, text } };
    }
    if (e.kind === "run.created" && typeof body.ask === "string") {
      const ask = leanText(body.ask);
      return ask === body.ask ? e : { ...e, body: { ...body, ask } };
    }
    return e;
  });
}
