import { expect, it } from "vitest";
import { parseBody, type AnyEvent, type Kind } from "@shuacrew/core/events";
import { observability } from "./observability.js";
import { EventStore } from "./store.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";

const now = Date.UTC(2026, 8, 24, 12), day = 86400000;
it("does not count context-limit-only telemetry as a usage measurement", () => {
  const { events, add } = fixture();
  add("usage.recorded", { runtime: "codex", contextLimit: 200000 }, now - 1);
  const report = observability(events, { now, days: 7 });
  expect(report.coverage.usageRecords).toBe(3);
  expect(report.coverage.contextOnlyRecords).toBe(1);
});
it("derives operational history from events and excludes synthetic runtimes", () => {
  const { events, add } = fixture();
  add("run.created", { runtime: "mock", title: "Synthetic", ask: "demo" }, now - 2000, "demo1");
  add("usage.recorded", { runtime: "mock", inputTokens: 9999 }, now - 1000, "demo1");
  add("run.status", { status: "failed" }, now - 500, "demo1");
  const report = observability(events, { now, days: 7 });
  expect(report.totals.inputTokens).toBe(230);
  expect(report.totalRuns).toBe(2);
  expect(report.availableProviders).not.toContain("mock");
  expect(report.operations.at(-1)).toMatchObject({ started: 1, completed: 1, failed: 1, firstResponseMs: 1000, responseSamples: 1 });
  expect(report.operations[0]!.firstResponseMs).toBeNull();
  expect(report.coverage.syntheticEventsExcluded).toBe(3);
});
function fixture() {
  const events: AnyEvent[] = [];
  const add = (kind: Kind, body: unknown, at: number, run: string | null = "r1") => events.push({ seq: events.length + 1, at, run, kind, body: parseBody(kind, body), session: null, prev: "", hash: "" } as AnyEvent);
  add("run.created", { runtime: "codex", title: "Public draft", ask: "PRIVATE PROMPT", venture: "v1" }, now - 2 * day);
  add("turn.started", { turn: 1, text: "PRIVATE PROMPT" }, now - 5000);
  add("agent.delta", { turn: 1, text: "PRIVATE RESPONSE" }, now - 4000);
  add("usage.recorded", { runtime: "codex", inputTokens: 100, outputTokens: 30, cacheTokens: 40, accounting: "codex-delta-v1" }, now - 3000);
  add("usage.recorded", { runtime: "codex", inputTokens: 80, outputTokens: 20, cacheTokens: 20 }, now - 2000);
  add("turn.completed", { turn: 1, route: { runtime: "codex" }, durationMs: 4000 }, now - 1000);
  add("run.status", { status: "done" }, now - 1000);
  add("run.created", { runtime: "claude", title: "Other draft", ask: "SECRET", venture: "v2" }, now - 10000, "r2");
  add("usage.recorded", { runtime: "claude", inputTokens: 50, outputTokens: 10, costUsd: 0.02 }, now - 1000, "r2");
  add("run.status", { status: "failed", reason: "PRIVATE ERROR" }, now - 500, "r2");
  return { events, add };
}
it("reconciles token buckets and coverage, without pretending unknown cost is zero", () => {
  const { events } = fixture(), report = observability(events, { now, days: 7 });
  expect(report.totals).toMatchObject({ inputTokens: 230, outputTokens: 60, cacheTokens: 60, reportedCostUsd: 0.02 });
  expect(report.coverage).toMatchObject({ usageRecords: 3, legacyRecords: 2, costRecords: 1, runsWithoutUsage: 0 });
  expect(report.providers.reduce((sum, p) => sum + p.inputTokens, 0)).toBe(230);
  expect(report.daily.reduce((sum, p) => sum + p.outputTokens, 0)).toBe(60);
  expect(report.latency.firstResponse).toEqual({ meanMs: 1000, samples: 1, p50Ms: 1000, p90Ms: 1000 });
  expect(report.latency.turnDuration).toEqual({ meanMs: 4000, samples: 1, p50Ms: 4000, p90Ms: 4000 });
  expect(report.statuses.failed).toBe(1);
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE|SECRET/);
  const codex = observability(events, { now, days: 7, provider: "codex", venture: "v1" });
  expect(codex.totals).toMatchObject({ inputTokens: 180, outputTokens: 50, reportedCostUsd: null });
  expect(codex.runs.map(r => r.id)).toEqual(["r1"]);
});
it("uses inclusive UTC day boundaries, excludes future events, and preserves empty unknowns", () => {
  const { events, add } = fixture(), boundary = Date.UTC(2026, 8, 18);
  add("usage.recorded", { runtime: "codex", inputTokens: 999 }, boundary - 1);
  add("usage.recorded", { runtime: "codex", inputTokens: 7 }, boundary);
  add("usage.recorded", { runtime: "codex", inputTokens: 888 }, now + 1);
  const report = observability(events, { now, days: 7 });
  expect(report.source.from).toBe(boundary);
  expect(report.totals.inputTokens).toBe(237);
  expect(report.daily).toHaveLength(7);
  const empty = observability(events, { now, days: 7, venture: "missing" });
  expect(empty.runs).toEqual([]);
  expect(empty.totals.reportedCostUsd).toBeNull();
  expect(empty.latency.firstResponse).toEqual({ meanMs: null, samples: 0, p50Ms: null, p90Ms: null });
});
it("deduplicates repeated event sequences and bounds run/timeline results", () => {
  const { events, add } = fixture();
  for (let i = 0; i < 80; i++) add("run.created", { runtime: "codex", ask: "fixture", title: `Run ${i}` }, now - 100, `extra${i}`);
  const report = observability([...events, ...events], { now, days: 7 });
  expect(report.totalRuns).toBe(82); expect(report.runs).toHaveLength(50); expect(report.timeline.length).toBeLessThanOrEqual(40);
  expect(report.totals.inputTokens).toBe(230);
  expect(observability(events, { now, days: 7, offset: 50 }).runs).toHaveLength(32);
});
it("does not turn a later chunk into first-response latency when the first response preceded the window", () => {
  const { events, add } = fixture(), boundary = Date.UTC(2026, 8, 18);
  add("turn.started", { turn: 2, text: "private" }, boundary - 3000);
  add("agent.delta", { turn: 2, text: "private" }, boundary - 2000);
  add("agent.delta", { turn: 2, text: "private" }, boundary + 2000);
  expect(observability(events, { now, days: 7 }).latency.firstResponse).toEqual({ meanMs: 1000, samples: 1, p50Ms: 1000, p90Ms: 1000 });
});
it("validates the read-only route and preserves origin protections", async () => {
  const store = new EventStore(":memory:"), runtimes = new Map(), supervisor = new Supervisor(store, runtimes, { workspace: "/tmp/shua-observability-test" });
  const { app } = await createServer({ store, runtimes, supervisor });
  try {
    const head = store.head;
    expect((await app.inject("/api/observability?days=999")).statusCode).toBe(400);
    expect((await app.inject("/api/observability?offset=-1")).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/observability", headers: { host: "evil.example" } })).statusCode).toBe(421);
    const response = await app.inject("/api/observability?days=7");
    expect(response.statusCode).toBe(200); expect(response.json().totals.reportedCostUsd).toBeNull();
    expect(store.head).toBe(head);
  } finally { await app.close(); supervisor.shutdown(); store.close(); }
});
it("does not label context-only ACP updates as measured zero usage", () => {
  const { events, add } = fixture();
  add("run.created", { runtime: "kiro", title: "Context fixture", ask: "private" }, now - 200, "context");
  add("usage.recorded", { runtime: "kiro", inputTokens: 0, outputTokens: 0, contextUsed: 1000, contextLimit: 200000 }, now - 100, "context");
  const report = observability(events, { now, days: 7, provider: "kiro" });
  expect(report.coverage).toMatchObject({ usageRecords: 0, contextOnlyRecords: 1, runsWithoutUsage: 1 });
  expect(report.runs[0]!.usageRecords).toBe(0);
  expect(report.totals.reportedCostUsd).toBeNull();
});
it("buckets usage by the hour, per provider, and reports latency percentiles", () => {
  const { events, add } = fixture();
  for (const [i, ms] of [200, 400, 600, 800, 10000].entries()) {
    add("turn.started", { turn: 10 + i, text: "q" }, now - 60000 + i * 1000, "r2");
    add("agent.delta", { turn: 10 + i, text: "hi" }, now - 60000 + i * 1000 + ms, "r2");
  }
  const report = observability(events, { now, days: 7 });
  const hours = report.hourly!;
  expect(hours.every((h) => h.at % 3600000 === 0)).toBe(true);
  expect(hours.reduce((n, h) => n + h.inputTokens, 0)).toBe(report.totals.inputTokens);
  const last = hours.at(-1)!;
  expect(last.byProvider).toEqual({ codex: 230, claude: 60 });
  // Six first responses (1000 from the fixture plus five here): the median ignores the 10 s outlier, p90 catches it.
  expect(report.latency.firstResponse.p50Ms).toBe(600);
  expect(report.latency.firstResponse.p90Ms).toBe(10000);
});
it("pages runs by tokens when asked, so the heaviest sessions are never cut off by recency", () => {
  const { events } = fixture();
  expect(observability(events, { now, days: 7 }).runs.map((r) => r.id)).toEqual(["r2", "r1"]);
  expect(observability(events, { now, days: 7, sort: "tokens" }).runs.map((r) => r.id)).toEqual(["r1", "r2"]);
});
