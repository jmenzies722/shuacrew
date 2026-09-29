# Observability Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and one independent review. No commits or pushes without permission.

**Goal:** Make work health and recorded usage inspectable inside the installed Mac app.

**Architecture:** Derive read-only analytics from the existing immutable event store. Share a typed browser-safe response contract between gateway and UI. Keep diagnostic preferences local; no external telemetry service.

**Tech Stack:** Existing TypeScript, Zod, Fastify, React and AppKit/WKWebView.

**Spec:** `docs/superpowers/specs/2026-09-24-observability-design.md`.

## Global Constraints

- Continue the user's requested native Mac product; no separate dashboard deployment.
- No commits, pushes, new credentials, microphone permissions, or external publication.
- Never access the sealed day-job directories.
- Missing usage/cost is unknown, not zero. Recorded API cost is not subscription billing.
- Preserve historical events; clearly label legacy accounting coverage.
- All charts and totals use the same explicit UTC window, provider and venture filters.

## Review Focus

1. Repeated cumulative usage and resumed-thread baselines must not inflate new measurements.
2. Missing counters, cost, or latency samples must not become false zeroes.
3. Provider/venture filters must reconcile cards, chart, and run drill-down.
4. Refresh and failures must not erase filters or mislabel stale data as live.
5. Developer diagnostics must not expose credentials, raw environment, or transcript text.

### Task 1: Accounting and analytical data contract

**Files:** Modify `packages/runtimes/src/codex.ts`, `runtime.ts`, `runtimes.test.ts`, core `events.ts`, gateway `runs.ts`; create core `observability.ts`, gateway `observability.ts`, `observability.test.ts`; register endpoint in `server.ts`.

**Interfaces:** `observability(events: Iterable<AnyEvent>, options: {now: number; days: 7|30|0; provider?: string; venture?: string; offset?: number}): ObservabilityReport`. Report carries source head/window, coverage, nullable cost/latency, token totals, daily/provider/venture buckets, statuses, bounded timeline and paginated run rows. GET `/api/observability?days=7&provider=codex&venture=id&offset=0` validates filters and returns this contract.

- [ ] Write accounting fixtures with an active turn, input100/output30/reasoning20, a duplicate total, then total180/50. Expected recorded output50, not90; duplicate emits no new usage. A resumed baseline before turn/start contributes nothing. A decreasing counter is explicitly marked fallback coverage.

```ts
expect(usage.reduce((n, e) => n + e.outputTokens, 0)).toBe(50);
expect(translator.translate("thread/tokenUsage/updated", duplicate)).toEqual([]);
```

- [ ] Run `pnpm exec vitest run packages/runtimes/src/runtimes.test.ts`; observe failures before implementing counter bookkeeping and accounting metadata. Keep cache separate and omit unsupported context-occupancy inference.
- [ ] Write literal analytical fixtures: two providers, two ventures, known and missing costs, events on UTC boundary, failed and approval-waiting runs, first-response latency and completion duration. Assert sums, nulls, filters, empty state and pagination.

```ts
expect(report.totals.inputTokens).toBe(180);
expect(report.totals.reportedCostUsd).toBeNull();
expect(report.coverage.legacyRecords).toBe(1);
expect(report.runs.every(r => r.runtime === "codex")).toBe(true);
```

- [ ] Run `pnpm exec vitest run apps/gateway/src/observability.test.ts`; expect missing module/behavior failure. Implement pure aggregation without transcript payloads, secret environment, or inferred prices. Clamp pagination to50 rows and timeline to40 records; expose total row count and freshness.
- [ ] Add route tests: malformed days/offset400, cross-origin blocked by existing hooks, identical source totals and no event mutations.
- [ ] Run focused tests, `pnpm test`, `pnpm typecheck`; expect all pass.

### Task 2: Native analytics panes and Developer settings

**Files:** Create `apps/web/src/screens/Observability.tsx`, `observability.css`, `components/DeveloperSettings.tsx`, `lib/observability-preferences.ts` and tests. Modify router, Shell navigation, Settings.

**Interfaces:** `/observability` and `/usage` consume `ObservabilityReport`; Developer diagnostics use existing `/api/health`, `/api/runtimes`, `/api/audit/verify`. Preferences `{refreshSeconds:0|5|15|30, days:7|30|0}` use validated local storage defaults15/7.

- [ ] Write preference tests: invalid stored values fall back; valid values round-trip; inaccessible storage does not crash.

```ts
expect(parseObservabilityPreferences({refreshSeconds:-1,days:999})).toEqual({refreshSeconds:15,days:7});
```

- [ ] Run preference tests; observe missing behavior failure, then implement validation/storage.
- [ ] Build shared filter toolbar, source/freshness status, four operational cards, token cards, zero-baseline daily chart with exact-value table, provider/venture breakdowns, searchable sortable run links, and bounded event timeline. Show sample counts alongside latency, legacy coverage prominently, and unknown subscription bills/quota explicitly. Do not decorate with fabricated live activity.
- [ ] Add Developer section with health fields, connection status, explicit audit verification result/time, refresh/default-window selectors, and links to analytics/policy. Audit verification remains user-triggered and read-only.
- [ ] Run `pnpm test`, `pnpm typecheck`, UI build and `git diff --check`; expect pass, retain existing CSS warning separately.

### Task 3: Installed verification and independent review

**Files:** `docs/observability-verification.md` and the plan ledger.

- [ ] Compare installed endpoint aggregates to literal source-event calculations without dumping transcripts. Verify empty/provider/venture filters and All restoration in the actual Mac app, including a narrow layout and Developer diagnostics.
- [ ] Run full tests, typecheck, UI build and Swift tests. Restart only with no active user work. Record exact commands/output and any uncovered paths.
- [ ] One independent read-only review of the whole slice. Fix Important findings with failing-first regressions; rerun tests. Do not dispatch a second review or commit/push.
- [ ] Report actual capability and limitations; this slice does not certify voice, phone approvals or public distribution.

## Execution ruling

The user repeatedly requested direct, continuous implementation of these exact surfaces. Continue inline with those existing requirements; the optional async design question can refine the work but is not a new authority or credential gate. Scope changes with external side effects still require explicit direction. Keep the existing dirty checkout and record evidence rather than creating a disconnected replacement project.
