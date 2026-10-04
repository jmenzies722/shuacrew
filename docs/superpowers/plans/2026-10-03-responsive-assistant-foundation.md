# Responsive Assistant Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Fn/notch feedback immediate and unify observable task progress without changing the existing native execution authority.

**Architecture:** Add a pure presentation reducer and bounded latency recorder around existing native gesture and task events. Replace completion polling with subscriptions, then project those events into the notch. This is the first delivery slice; provider enforcement, durable complex-task coordination, and proactive routines require subsequent focused plans.

**Tech Stack:** Swift/AppKit, React/TypeScript, existing gateway transport, Vitest and Swift tests; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-personal-assistant-direction.md`, including the immediate interaction and complex-task section.

## Global Constraints

- No commits or pushes without asking. Preserve existing uncommitted live work.
- Do not access either sealed work directory, including through symlinks.
- All model inference uses OpenAI through the connected ChatGPT/Codex account.
- This slice adds no inference calls, microphone permissions, or model fallback.
- Preserve Fn tap/hold semantics and the 300 ms hold threshold.
- Target p95 below 50 ms for native Fn-down to visible acknowledgment; report measured evidence, not a guarantee.
- Do not use unverified speech interruption controls or reconnect workarounds.
- One native actuator; do not dispatch desktop actions from presentation code.
- No installation or live-call interruption as part of automated tests.

## Review Focus

- Fn plus another key must clear preparing feedback without toggling the notch (Task 2).
- Release during asynchronous connection must never reopen microphone input (Task 2).
- Old task events must not overwrite a newer task or resurrect cancelled state (Task 1).
- Completion between subscription registration and dispatch resolution must not be missed (Task 3).
- A stalled web view must not turn a local native acknowledgment into a false listening claim (Tasks 2 and 5).

### Task 1: Shared presentation and latency state

**Files:** Create `apps/web/src/lib/assistant-state.ts`, `assistant-state.test.ts`, `interaction-latency.ts`, and `interaction-latency.test.ts`.

**Interfaces:** Export `AssistantPhase = "idle" | "preparing" | "connecting" | "listening" | "planning" | "awaiting-approval" | "acting" | "verifying" | "completed" | "failed" | "cancelled"`. Export `AssistantEvent` with `taskId: string`, `generation: number`, `sequence: number`, `phase: AssistantPhase`, `label: string`; `AssistantState` has those fields plus `lastSequence: number`. Export `reduceAssistant(state: AssistantState, event: AssistantEvent): AssistantState`. New task ownership is established by a separate `beginAssistant(taskId: string, generation: number): AssistantState`; arbitrary events cannot replace it. Export `LatencyRecorder` with `mark(id: string, stage: string, at: number): void`, `duration(id: string, from: string, to: string): number | undefined`, and `clear(id: string): void`.

- [ ] Write reducer tests asserting wrong IDs/generations and non-increasing sequences leave state unchanged; cancelled/failed/completed states reject later events; approval state never implies dispatch.
- [ ] Write timing tests asserting missing or reversed timestamps return undefined, valid timestamps return elapsed milliseconds, and capacity is capped at 256 interaction records with oldest-record eviction. Store timing labels only, no transcripts or screenshots.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/assistant-state.test.ts apps/web/src/lib/interaction-latency.test.ts`; establish failing tests before implementation.
- [ ] Implement the exported interfaces; timestamps within one measurement use a single monotonic clock.
- [ ] Repeat the focused command; require all tests passing.

### Task 2: Immediate native acknowledgment and gesture lifecycle

**Files:** Modify `apps/mac/Sources/ShuaCrew/Buddy.swift`, `apps/web/src/screens/Buddy.tsx`, and `apps/web/src/lib/fn-capture.ts`; extend `apps/web/src/lib/fn-capture.test.ts` and `apps/mac/Tests/ShuaCrewCoreTests/FnGestureTests.swift` after confirming its existing location.

**Interfaces:** Preserve `FnGesture.Signal` and `fnCapture(signal, mic, callActive)`. Feed native press into a local preparing indicator before asynchronous bridge/network operations; this indicator says preparing, never listening. Use Task 1's reducer for web presentation, and generation guards already used by the microphone lifecycle.

- [ ] Extend gesture tests for immediate press, hold starting at 0.3 seconds, tap, modifier cancellation, repeated key-down, and release during a deferred connection. Assert release/cancel prevents delayed capture activation.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/fn-capture.test.ts` and `swift test --package-path apps/mac --filter FnGesture`; establish the changed-behavior failure.
- [ ] Move native visual acknowledgment before asynchronous work without opening the full chat window. Clear it on modifier cancellation; do not prewarm microphone or service on app launch. Ensure local acknowledgment works with web/gateway unavailable.
- [ ] Repeat focused tests and native build checks; verify no duplicate tap/hold action is introduced.

### Task 3: Event-driven task completion

**Files:** Modify `apps/web/src/lib/live-turn.ts` and its production callers located with `rg -n 'executeLiveTurn' apps/web/src`; create `apps/web/src/lib/live-turn.test.ts`.

**Interfaces:** Extend the existing adapter with `subscribe(listener: () => void): () => void`. The owner calls listeners when `LiveTurnState` changes; register before dispatch, evaluate immediately after dispatch resolution, and unsubscribe exactly once on settle/abort. Preserve the existing `Promise<LiveTaskResult>` result shape.

- [ ] Add tests for synchronous completion, completion before dispatch resolves, normal streamed changes, dispatch failure, abort during dispatch, and late callbacks after settlement. Assert listener cleanup and no scheduled 100 ms polling timer.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/live-turn.test.ts`; confirm failures expose the missing subscription contract.
- [ ] Implement subscription-backed evaluation and wire real state owners, scoped to the active task. Preserve screen-access checks, cancellation behavior, and verified-outcome semantics.
- [ ] Repeat tests plus `pnpm exec vitest run apps/web/src/lib/live-task.test.ts apps/web/src/lib/live-task-integration.test.ts` to verify existing queue behavior.

### Task 4: Coherent notch task presentation

**Files:** Modify `apps/web/src/components/NotchThinking.tsx`, `MacTaskStatus.tsx`, `apps/web/src/screens/Buddy.tsx`, and `apps/web/src/screens/spark-design.css`; extend `NotchThinking.test.tsx` and `MacTaskStatus.test.tsx`.

**Interfaces:** Consume Task 1's state as presentation only. Keep native `MacTaskProgress` and its verified receipts authoritative for action results. Priority: approval, blocked/error, active task, suggestion, music/idle. Retain the existing cancel/resume callbacks.

- [ ] Add tests for immediate preparing state, connecting without a listening claim, permission prominence, partial/failed results, cancellation, and stale event rejection at the integration boundary.
- [ ] Run the two component test files and establish failures for the added states.
- [ ] Render readable task/step labels with restrained transitions, stable notch geometry, reduced-motion support, and always reachable cancel. Show activity summaries, not hidden model reasoning. Keep audio waveforms tied to actual audio levels.
- [ ] Repeat component tests; inspect compact/expanded layouts, overflow, keyboard controls, and permission cards in the local preview.

### Task 5: Measure the full interaction and verify regressions

**Files:** Create `docs/verification/responsive-assistant-foundation-2026-10-03.md`; instrument the event boundaries modified above using Task 1's recorder. Keep measurements opt-in and local.

**Interfaces:** Measure native key-event to native draw in the native monotonic clock. Measure web stages separately with `performance.now()`; never subtract timestamps from different clocks. Record cold/warm samples, sample counts, and nearest-rank p50/p95.

- [ ] Run the focused tests above, then `pnpm test`, `pnpm typecheck`, and `swift test --package-path apps/mac`. Record exact commands, exit status, and summaries; distinguish pre-existing failures.
- [ ] Collect 30 warm and 10 cold Fn/notch trials where hardware automation permits, including disconnected gateway and delayed web readiness. If physical Fn or audible timing requires the user, report those measurements as pending rather than simulated success.
- [ ] Record Fn-to-visible-feedback, release-to-first-text, release-to-audible-output, approval-to-dispatch, and dispatch-to-verification where observable. No fabricated timing for unsupported boundaries.
- [ ] Document whether the 50 ms p95 target passes. Investigate missed targets before declaring the slice complete. Do not claim complex-task or universal desktop reliability from these tests.

## Subsequent focused plans

1. Enforce OpenAI-only routing at gateway ingress, selection, fallback, schedules, and saved preferences; remove alternative choices from UI while preserving history.
2. Extend the existing task contract with a durable dependency graph, approval revisions, one desktop lease, checkpoint/reconciliation, bounded execution windows, and truthful partial results.
3. Finish verified native voice interruption using the existing subscribed transport and hardware evidence.
4. Add opt-in proactive focus/music routines backed by the coordinator and permission scopes.

## Execution handoff

Recommended method: native execution in this session, preserving existing work and making no commits. Review this first slice before code changes; later slices retain the complete personal-assistant direction and get their own focused plans.
