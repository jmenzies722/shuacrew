import type { RunView } from "@shuacrew/core/projections";

export function repoName(repo?: string): string {
  return repo?.split("/").filter(Boolean).pop() || "workspace";
}

/** A child run inherits its parent's repo when it has none of its own. */
export function runRepo(run: RunView, runs: Record<string, RunView>): string | undefined {
  return run.repo ?? (run.parent ? runs[run.parent]?.repo : undefined);
}

/**
 * The one rule every pane (Board, Today, Floor) uses for "is this a session you'd see on its own?".
 * `runs` is the full, unscoped run map so a child's parent can be looked up even when it's out of scope or archived.
 */
export function isTopLevelWork(run: RunView, runs: Record<string, RunView>): boolean {
  // A child (delegation/subagent) belongs to its parent's thread. In the full run map a parent is always created
  // before its children, and the projection deletes archived runs — so a missing parent means it was archived,
  // and archiving a session hides its whole thread.
  void runs;
  // Learning sessions (coach, courses, drills, resume) live in Learning, not in your work views.
  return !run.parent && !run.labels?.includes("learning");
}

export function inScope(repo: string | undefined, scope: string | null): boolean {
  return scope === null || repo === scope;
}

export function scopeRuns(runs: Record<string, RunView>, scope: string | null): Record<string, RunView> {
  if (!scope) return runs;
  const out: Record<string, RunView> = {};
  for (const run of Object.values(runs)) {
    if (inScope(runRepo(run, runs), scope)) out[run.id] = run;
  }
  return out;
}

/** The same sentence Policy uses: verdict, rule, layer. */
export function policyLine(verdict: string, rule: string, layer?: string): string {
  return layer ? `${verdict} — rule ${rule} in the ${layer} layer` : `${verdict} — rule ${rule}`;
}

/** When a usage window pauses a run, say when it resumes. Otherwise the status reason. */
export function pauseClock(
  run: { status: string; runtime: string; model?: string; statusReason?: string },
  limited: Record<string, { until: number; credits?: boolean }>,
  now = Date.now(),
): string | null {
  if (run.status !== "paused") return null;
  const hit = (run.model ? limited[`${run.runtime} · ${run.model}`] : undefined) ?? limited[run.runtime];
  if (!hit || hit.credits) return run.statusReason ? `Paused · ${run.statusReason}` : "Paused";
  const soon = hit.until - now < 86_400_000;
  const until = new Date(hit.until).toLocaleString([], soon ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", hour: "numeric", minute: "2-digit" });
  return `Paused · resumes ${until}`;
}
