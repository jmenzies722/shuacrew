/** How each crew member is really doing, from their sessions: finished, failed, success rate, typical time, tokens. */
export interface PerfRun { member?: string; status: string; labels?: string[]; parent?: string; createdAt: number; updatedAt: number; usage?: { inputTokens: number; outputTokens: number } }
export interface Perf { member: string; finished: number; failed: number; successRate: number | null; medianMinutes: number | null; tokens: number; lessons: number }

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

export function crewPerformance(members: string[], runs: PerfRun[], lessons: Record<string, number> = {}): Perf[] {
  return members.map((member) => {
    const mine = runs.filter((r) => r.member === member && !r.parent && !r.labels?.includes("buddy") && !r.labels?.includes("learning"));
    const finished = mine.filter((r) => r.status === "done" || r.status === "merged");
    const failed = mine.filter((r) => r.status === "failed").length;
    const closed = finished.length + failed;
    return {
      member, finished: finished.length, failed,
      successRate: closed ? Math.round((finished.length / closed) * 100) : null,
      medianMinutes: median(finished.map((r) => (r.updatedAt - r.createdAt) / 60_000)),
      tokens: mine.reduce((n, r) => n + (r.usage ? r.usage.inputTokens + r.usage.outputTokens : 0), 0),
      lessons: lessons[member] ?? 0,
    };
  });
}
