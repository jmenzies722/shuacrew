import type { AnyEvent } from "@shuacrew/core";

/**
 * How fast each model starts talking on Spark's turns, learned from this Mac's own history.
 * First word, not full reply: that is the wait the user feels in the notch.
 */
export class LatencyBook {
  private ms = new Map<string, { avg: number; n: number }>();
  static readonly ALPHA = 0.2;

  record(runtime: string, model: string, firstWordMs: number) {
    if (!(firstWordMs > 0) || firstWordMs > 300_000) return;
    const key = `${runtime}:${model}`, cur = this.ms.get(key);
    // An EWMA follows a model that got faster or slower this week; the first samples weigh in fully.
    const alpha = cur ? Math.max(LatencyBook.ALPHA, 1 / (cur.n + 1)) : 1;
    this.ms.set(key, { avg: cur ? cur.avg + alpha * (firstWordMs - cur.avg) : firstWordMs, n: (cur?.n ?? 0) + 1 });
  }

  estimate(runtime: string, model: string): { ms: number; samples: number } | undefined {
    const v = this.ms.get(`${runtime}:${model}`);
    return v ? { ms: Math.round(v.avg), samples: v.n } : undefined;
  }

  /** Replays Spark turns (buddy-labelled runs) from the event log: turn start → first streamed word. */
  seed(events: Iterable<AnyEvent>) {
    const buddy = new Set<string>(), started = new Map<string, number>(), first = new Map<string, number>();
    for (const e of events) {
      if (!e.run) continue;
      if (e.kind === "run.created") { if ((e.body as { labels?: string[] }).labels?.includes("buddy")) buddy.add(e.run); }
      else if (e.kind === "turn.started") { started.set(e.run, e.at); first.delete(e.run); }
      else if (e.kind === "agent.delta") { if (started.has(e.run) && !first.has(e.run)) first.set(e.run, e.at); }
      else if (e.kind === "turn.completed") {
        const route = (e.body as { route?: { runtime?: string; model?: string } }).route;
        const t0 = started.get(e.run), t1 = first.get(e.run);
        if (buddy.has(e.run) && route?.runtime && route.model && t0 !== undefined && t1 !== undefined) this.record(route.runtime, route.model, t1 - t0);
        started.delete(e.run);
      }
    }
    return this;
  }
}
