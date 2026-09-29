# Connected Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution after user review. Steps use checkbox syntax. No commits or pushes without asking.

**Goal:** Make Spark Auto use the platform's configured cloud providers, routing preferences, availability, and recovery, with an honest local fallback.

**Architecture:** Put selection in the gateway and use it for both normal Auto launches and Spark. Return an explicit selection and reason to Spark before it prepares a provider-specific turn; revalidate at launch because availability can change. Preserve provider-owned conversation IDs and existing approval policy.

**Tech Stack:** TypeScript, Fastify, React, Vitest, existing runtime adapters and event store.

**Spec:** `docs/superpowers/specs/2026-09-27-spark-workspace-redesign-proposal.md`, especially “User clarification,” “Spark in context,” and “Recovery and orchestration.”

## Global constraints

- No commit, push, provisioning change, or publication without authorization.
- Never access `~/Nectar-Work` or `~/Developer/work`.
- Keep the existing web/native split and existing approval boundaries.
- Keep explicit local-only private; it must not silently invoke cloud models.
- Crew coding work must not silently move to the conversational local runtime.
- Do not equate authentication, elapsed reset time, or a session ID with successful model recovery.
- No new paid services, dependencies, or periodic billable probe conversations.

## Review focus

1. A provider can become limited between selection and execution: revalidate and record the actual route.
2. Multiple model limits and account limits can overlap: one recovery cannot erase unrelated limits.
3. An expired timer can outlive a newer restriction: stale callbacks cannot clear the newer event.
4. A local or cloud conversation can fail: inspect actual run status, not a prose summary with a shadowed variable name.
5. An image request can fall back to a text-only model: never send unsupported images or claim visual understanding; retain available OCR as explicitly labeled text.

## Task 1: One gateway selector

**Files:** create `apps/gateway/src/intelligence.ts` and `apps/gateway/src/intelligence.test.ts`; modify `apps/gateway/src/runs.ts`, `apps/gateway/src/server.ts`, and gateway integration tests.

**Interfaces:**
- `IntelligenceRequest = { ask: string; mode: "auto" | "local"; purpose: "work" | "conversation"; images: boolean; tier: "fast" | "balanced" | "frontier"; localModel?: string }`.
- `IntelligenceChoice = { runtime: string; model: string; reason: string; acceptsImages: boolean; checkedAt: number } | { runtime: null; reason: string; retryAt: number | null; checkedAt: number }`.
- Pure `selectIntelligence(request, candidates, settings, now): IntelligenceChoice`; candidates carry runtime metadata, status, and active account/model restrictions. Use existing Runtime and GatewaySettingsValue types for metadata/settings rather than duplicating their schemas.
- `POST /api/intelligence/select` validates IntelligenceRequest and returns IntelligenceChoice, using the existing status cache and Supervisor limit data. No prompt text is included in a response or diagnostic log.

- [ ] Write selector tests: configured Claude→Codex order; unavailable first provider; model-specific limit with free sibling; account-wide limit; local-only; no installed local model; explicit sign-out; unknown sign-in status represented as unverified rather than confirmed; image-capable cloud choice; all clouds limited with text/OCR-only local fallback.
- [ ] Run `pnpm exec vitest run apps/gateway/src/intelligence.test.ts` and record the expected failures.
- [ ] Implement selection using existing `matchRoute` and `failoverCandidates`. Respect explicit run/member choices; Auto uses the shared policy. A keyword rule targets only known compatible models. Normal work excludes local. Conversation can fall back to local, with `acceptsImages: false`.
- [ ] Add route tests for invalid input, selection-only requests creating no runs, and provider status failures. Use injected status fixtures, not real subscriptions.
- [ ] Integrate Auto launch selection and execution revalidation. Preserve synchronous room launch/reservation contracts; do not make unrelated room callers async. Keep cached status ownership explicit in the gateway and pass a snapshot to the supervisor selector.
- [ ] Verify selector and gateway integration tests pass, including availability changing between preflight and launch and explicit selection remaining explicit.

## Task 2: Spark consumes shared intelligence

**Files:** modify `apps/web/src/screens/Buddy.tsx`, `apps/web/src/lib/spark-brain.ts`, `apps/web/src/lib/spark-brain.test.ts`, `apps/web/src/components/SparkSettings.tsx`, and `apps/web/src/lib/companion.ts`; create `apps/web/src/lib/intelligence.ts` and its tests.

**Interfaces:**
- Client `selectIntelligence(request): Promise<IntelligenceChoice>` calls Task 1's endpoint.
- A pure turn decision helper consumes actual run status, recorded runtime/model, and the new choice; returns `resume` or `new`, never a foreign provider's session ID.
- UI displays the recorded run's runtime/model once launched; the preflight choice is an estimate until then.

- [ ] Write tests for Claude→Codex→local transitions, explicit local mode, resuming the same provider, switching with recap, failed/cancelled conversations starting fresh, and selection errors preserving the typed message.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/intelligence.test.ts apps/web/src/lib/spark-brain.test.ts` and record expected failures.
- [ ] Replace hard-coded Claude model selection with Task 1's response. Select before screenshot upload, use capability information, and preserve OCR-only behavior for local. Fix the `status` shadowing in the ask path.
- [ ] Preserve the current in-flight turn and its action handling; change providers only at the next turn boundary. Use actual routed events to reconcile preflight and launched provider information.
- [ ] Change Settings label to “Auto · connected providers,” explain shared routing and separate subscription limits, and link to Agents. Keep “Always on this Mac” explicit. Display provider/model and fallback reason in Spark; do not show “Claude is out” for every local condition.
- [ ] Verify tests and `pnpm --filter @shuacrew/web build`. Inspect Settings and Spark in the running Mac app, including narrow layout and failed selection. Do not restart live user runs to refresh the interface.

## Task 3: Recovery means evidence

**Files:** modify `apps/gateway/src/runs.ts`, `packages/core/src/events.ts`, `packages/core/src/projections.ts`, and their tests; create `apps/gateway/src/intelligence-recovery.test.ts`.

**Interfaces:**
- Add backward-compatible `runtime.retrying` event `{ runtime, model?, limitSeq }` for an eligible retry after a known restriction.
- Keep existing `runtime.restored` readable for old logs; new restore emissions require a successful response and clear only the applicable restriction.
- Persist restriction event sequence as the retry generation. Timer handlers compare it with the latest applicable restriction before acting.

- [ ] Write fake-clock tests for stale timer after a new limit, model A reset while model B remains limited, account limit dominance, system wake after reset, restart, repeated refusal/backoff, and exactly one queued retry.
- [ ] Run `pnpm exec vitest run apps/gateway/src/intelligence-recovery.test.ts` and record expected failures.
- [ ] Refactor timer/manual retry to mark eligible retries and queue only eligible paused work. Bound retry delay when a provider supplies a past or invalid reset timestamp. Preserve existing crew-room restart behavior and concurrency caps.
- [ ] Emit restored after a usable text response or successful completion, scoped to a restriction older than that attempt. Errors, session creation alone, and status probes do not establish recovery. A later limit in the same attempt remains authoritative.
- [ ] Update projections and UI wording to distinguish reset estimate, retrying, and confirmed recovery. Confirm old persisted events still fold correctly.
- [ ] Run relevant gateway/core tests, then `pnpm test`, `pnpm typecheck`, and `pnpm --filter @shuacrew/web build`. Record command outputs and any pre-existing failures separately.

## Handoff and remaining scope

Native execution is recommended: these three tasks share state and event semantics,
so implementing them together in this session avoids split ownership. Review the
plan before implementation. No execution method has been selected yet.

This plan deliberately delivers the connected intelligence slice. The Settings
redesign, notch surfaces, canvas, action-receipt hardening, and compounding daily
workflow still require implementation; completing this plan will not mean the
whole redesign is done.

The user confirmed both notch surfaces, MacBook first. After this intelligence
slice, prioritize MacBook docking and its Settings controls, then expand the
shared visual polish/canvas work. Implement the iPhone Dynamic Island afterward.
