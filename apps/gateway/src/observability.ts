import type { AnyEvent } from "@shuacrew/core/events";
import type { HourBucket, ObservabilityReport, ObservedRun, UsageBucket, UsageTotals, OperationBucket } from "@shuacrew/core/observability";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EventStore } from "./store.js";

const DAY = 86400000, HOUR = 3600000;
const zero = (): UsageTotals => ({ inputTokens: 0, outputTokens: 0, cacheTokens: 0, reportedCostUsd: null });
const bucket = (id: string): UsageBucket => ({ id, records: 0, ...zero() });
const operation = (id: string): OperationBucket => ({ id, started: 0, completed: 0, failed: 0, approvals: 0, firstResponseMs: null, responseSamples: 0 });
const nonnegative = (v: number | undefined) => typeof v === "number" && Number.isFinite(v) && v >= 0;
export function observability(source: Iterable<AnyEvent>, options: { now: number; days: 7 | 30 | 0; provider?: string; venture?: string; offset?: number; sort?: "recent" | "tokens" }): ObservabilityReport {
  const events = [...new Map([...source].map(e => [e.seq, e])).values()].filter(e => e.at <= options.now).sort((a, b) => a.seq - b.seq);
  const from = options.days ? Math.floor(options.now / DAY) * DAY - (options.days - 1) * DAY : events.reduce((min, e) => Math.min(min, e.at), options.now);
  const runs = new Map<string, ObservedRun>(), runtimeAt = new Map<number, string>();
  const providers = new Set<string>(), ventures = new Set<string>();
  for (const e of events) {
    if (e.kind === "run.created" && e.run) {
      const venture = e.body.venture ?? (e.body.parent ? runs.get(e.body.parent)?.venture : undefined);
      runs.set(e.run, { id: e.run, title: e.body.title, runtime: e.body.runtime, venture, room: e.body.labels.find(l => l.startsWith("room:"))?.slice(5), status: "queued", updatedAt: e.at, usageRecords: 0, ...zero() });
      providers.add(e.body.runtime); if (venture) ventures.add(venture);
    }
    const run = e.run && runs.get(e.run);
    if (run) {
      run.updatedAt = Math.max(run.updatedAt, e.at);
      if (e.kind === "run.routed") run.runtime = e.body.runtime;
      if (e.kind === "run.status") run.status = e.body.status;
      runtimeAt.set(e.seq, e.kind === "usage.recorded" ? e.body.runtime : run.runtime);
    }
    if (e.kind === "usage.recorded") providers.add(e.body.runtime);
  }
  const totals = zero(), daily = new Map<string, UsageBucket>(), byProvider = new Map<string, UsageBucket>(), byVenture = new Map<string, UsageBucket>();
  const coverage = { usageRecords: 0, legacyRecords: 0, deltaRecords: 0, fallbackRecords: 0, costRecords: 0, runsWithoutUsage: 0, contextOnlyRecords: 0, syntheticEventsExcluded: 0 };
  const operations = new Map<string, OperationBucket>();
  const hourly = new Map<number, HourBucket>(), hourFloor = Math.max(from, options.now - 30 * DAY);
  const selected = new Set<string>(), timeline: ObservabilityReport["timeline"] = [];
  const starts = new Map<string, number>(), responded = new Set<string>(), responseTimes: number[] = [], durations: number[] = [];
  const add = (target: UsageTotals, body: Extract<AnyEvent, {kind: "usage.recorded"}>["body"]) => {
    if (nonnegative(body.inputTokens)) target.inputTokens += body.inputTokens;
    if (nonnegative(body.outputTokens)) target.outputTokens += body.outputTokens;
    if (nonnegative(body.cacheTokens)) target.cacheTokens += body.cacheTokens;
    if (nonnegative(body.costUsd)) target.reportedCostUsd = (target.reportedCostUsd ?? 0) + body.costUsd!;
  };
  for (const e of events) {
    const run = e.run ? runs.get(e.run) : undefined;
    const key = e.run && "turn" in e.body ? `${e.run}:${e.body.turn}` : "";
    if (e.kind === "turn.started") starts.set(key, e.at);
    const firstResponse = (e.kind === "agent.delta" || e.kind === "agent.message") && !responded.has(key) && starts.has(key);
    if (firstResponse) responded.add(key);
    if (e.at < from || !run || (options.venture && run.venture !== options.venture) || (options.provider && runtimeAt.get(e.seq) !== options.provider)) continue;
    if (runtimeAt.get(e.seq) === "mock") { coverage.syntheticEventsExcluded++; continue; }
    selected.add(run.id);
    const date = new Date(e.at).toISOString().slice(0, 10), op = operations.get(date) ?? operation(date);
    operations.set(date, op);
    if (e.kind === "turn.started") op.started++;
    if (e.kind === "turn.completed") op.completed++;
    if (e.kind === "run.status" && e.body.status === "failed") op.failed++;
    if (e.kind === "approval.requested") op.approvals++;
    if (firstResponse) {
      const elapsed = e.at - starts.get(key)!;
      if (elapsed >= 0) { responseTimes.push(elapsed); op.firstResponseMs = ((op.firstResponseMs ?? 0) * op.responseSamples + elapsed) / (op.responseSamples + 1); op.responseSamples++; }
    }
    if (e.kind === "turn.completed") {
      const duration = e.body.durationMs ?? (starts.has(key) ? e.at - starts.get(key)! : undefined);
      if (nonnegative(duration)) durations.push(duration!);
    }
    if (e.kind === "usage.recorded") {
      // Older ACP adapters persisted context occupancy with zero consumption placeholders.
      // Preserve those facts, but do not claim they measured token consumption.
      if ((e.body.contextUsed !== undefined || e.body.contextLimit !== undefined) && e.body.inputTokens === 0 && e.body.outputTokens === 0 && e.body.cacheTokens === 0 && e.body.costUsd === undefined) { coverage.contextOnlyRecords++; continue; }
      coverage.usageRecords++; run.usageRecords++;
      if (!e.body.accounting) coverage.legacyRecords++;
      else if (e.body.accounting === "codex-delta-v1") coverage.deltaRecords++;
      else coverage.fallbackRecords++;
      if (nonnegative(e.body.costUsd)) coverage.costRecords++;
      add(totals, e.body); add(run, e.body);
      if (e.at >= hourFloor) {
        const at = Math.floor(e.at / HOUR) * HOUR, hour = hourly.get(at) ?? { at, inputTokens: 0, outputTokens: 0, cacheTokens: 0, byProvider: {} };
        const tokens = (nonnegative(e.body.inputTokens) ? e.body.inputTokens : 0) + (nonnegative(e.body.outputTokens) ? e.body.outputTokens : 0);
        hour.inputTokens += nonnegative(e.body.inputTokens) ? e.body.inputTokens : 0; hour.outputTokens += nonnegative(e.body.outputTokens) ? e.body.outputTokens : 0; hour.cacheTokens += nonnegative(e.body.cacheTokens) ? e.body.cacheTokens : 0;
        hour.byProvider[e.body.runtime] = (hour.byProvider[e.body.runtime] ?? 0) + tokens; hourly.set(at, hour);
      }
      for (const [map, id] of [[daily, new Date(e.at).toISOString().slice(0, 10)], [byProvider, e.body.runtime], [byVenture, run.venture ?? "unassigned"]] as const) {
        const item = map.get(id) ?? bucket(id); add(item, e.body); item.records++; map.set(id, item);
      }
    }
    if (["run.created", "run.status", "turn.started", "turn.completed", "tool.called", "approval.requested", "approval.decided"].includes(e.kind)) {
      const label = e.kind === "run.status" ? e.body.status : e.kind === "tool.called" ? e.body.tool : e.kind;
      timeline.push({ seq: e.seq, at: e.at, run: run.id, kind: e.kind, label });
    }
  }
  // Fill empty days for finite windows; all-history stays sparse to avoid unbounded charts.
  if (options.days) for (let at = from; at <= options.now; at += DAY) { const id = new Date(at).toISOString().slice(0, 10); if (!daily.has(id)) daily.set(id, bucket(id)); if (!operations.has(id)) operations.set(id, operation(id)); }
  const heavy = (r: ObservedRun) => r.inputTokens + r.outputTokens;
  const rows = [...selected].map(id => runs.get(id)!).sort((a, b) => (options.sort === "tokens" ? heavy(b) - heavy(a) : 0) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const statuses: Record<string, number> = {};
  for (const row of rows) { statuses[row.status] = (statuses[row.status] ?? 0) + 1; if (!row.usageRecords) coverage.runsWithoutUsage++; }
  // Percentiles by nearest rank: an average hides the one slow turn you actually noticed.
  const rank = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]! : null);
  const mean = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return { meanMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, samples: values.length, p50Ms: rank(sorted, 0.5), p90Ms: rank(sorted, 0.9) }; };
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  return {
    source: { head: events.at(-1)?.seq ?? 0, lastEventAt: events.length ? events.reduce((max, e) => Math.max(max, e.at), 0) : null, from, to: options.now, computedAt: options.now, timezone: "UTC" },
    totals, coverage, statuses, latency: { firstResponse: mean(responseTimes), turnDuration: mean(durations) },
    daily: [...daily.values()].sort((a, b) => a.id.localeCompare(b.id)), providers: [...byProvider.values()], ventures: [...byVenture.values()],
    operations: [...operations.values()].sort((a, b) => a.id.localeCompare(b.id)),
    hourly: [...hourly.values()].sort((a, b) => a.at - b.at),
    availableProviders: [...providers].filter(p => p !== "mock").sort(), availableVentures: [...ventures].sort(), runs: rows.slice(offset, offset + 50), totalRuns: rows.length, offset,
    timeline: timeline.sort((a, b) => b.at - a.at || b.seq - a.seq).slice(0, 40),
  };
}

export function observabilityRoutes(app: FastifyInstance, store: EventStore) {
  const query = z.object({ days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(0)])).default(7), provider: z.string().max(96).optional(), venture: z.string().max(96).optional(), offset: z.coerce.number().int().min(0).max(1000000).default(0), sort: z.enum(["recent", "tokens"]).default("recent") }).strict();
  app.get("/api/observability", async (request, reply) => {
    const parsed = query.safeParse(request.query); if (!parsed.success) return reply.code(400).send({ error: "Invalid observability filters" });
    reply.header("Cache-Control", "no-store");
    return observability(store.read(0), { now: Date.now(), ...parsed.data });
  });
}
