import type { RunView } from "@shuacrew/core/projections";

const WIN = new Set(["done", "merged"]);
/** Runs that became a win since the last look. The first look only records state: history never celebrates. */
export function newWins(previous: Map<string, string> | null, runs: Record<string, RunView>): { wins: RunView[]; next: Map<string, string> } {
  const next = new Map(Object.values(runs).map((r) => [r.id, r.status]));
  if (!previous) return { wins: [], next };
  const wins = Object.values(runs).filter((r) => !r.parent && WIN.has(r.status) && previous.has(r.id) && !WIN.has(previous.get(r.id)!));
  return { wins, next };
}
