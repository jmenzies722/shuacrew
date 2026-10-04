# Unified Notch Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete one notch-owned Live conversation with existing Mac/screen actions, teaching visuals, truthful results, and a visible Classic fallback.

**Architecture:** Separate transport, call coordination, and execution. The notch owns media; other windows forward commands and render snapshots through the native bridge. Reuse Buddy's action and visual pipelines without a second speaking assistant.

**Tech Stack:** TypeScript, React, Vitest, WebRTC, gateway WebSockets, Swift macOS webview bridge.

**Spec:** `docs/superpowers/specs/2026-10-02-unified-notch-call-design.md`

## Global Constraints

- Preserve Claude's pending work and the previously implemented teaching system rather than introducing another assistant or replacing either wholesale.
- No commit or push is authorized.
- Screen access off remains off.
- Idle hang-up uses the same documented 45-second interval as the implementation, only when listening with no active task, speech, or approval.
- Execution stays local without subagents unless separately requested.
- Do not access the sealed day-job directories. Do not install dependencies or switch branches for this work.
- Use installed Node CLIs: the pnpm wrapper previously attempted dependency reconciliation. Record observed outputs, not presumed successes.

## Review Focus

Execution status: implementation and automated checks are recorded in `docs/verification/unified-notch-call-2026-10-02.md`. Unchecked steps remain incomplete or only partially covered; native Live acceptance currently fails during connection setup. Do not interpret the unit suite as an end-to-end pass.

- Ending a call while microphone acquisition is unresolved must stop the late stream (Task 1).
- A hidden or reloaded main window must not acquire a second microphone (Task 2).
- An approval answered after cancellation must never authorize queued work (Task 3).
- A screen request while screen access is off must not capture or silently enable it (Task 4).
- A stored usage limit from an old session must not disable Live forever (Task 5).

## Task 1: Repair transport message and media lifecycle

**Files:** Modify `apps/web/src/lib/live-voice.ts`; create `apps/web/src/lib/live-voice.test.ts`; update callers in `apps/web/src/components/LiveMode.tsx`.

**Interfaces:** `LiveCall.sendText(text: string): boolean` sends user text; `LiveCall.speak(text: string): boolean` sends an assistant announcement. Both return false without sending when the socket is not open or the call ended. Existing `done` and `approve` messages use the same safe-send guard. `end(): void` stays idempotent.

- [x] Add tests `sendTextUsesTextMessage`, `speakUsesSayMessage`, `closedSocketDoesNotSend`, and `lateMicrophoneIsStopped`: assert exact message types, zero sends after end, and each late track stopped once.
- [x] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-voice.test.ts`; confirm failures expose the duplicate-method/lifecycle defects.
- [x] Replace ambiguous methods with the interfaces above, update every caller, and guard delayed media/socket callbacks using call termination state.
- [x] Rerun that suite and `node node_modules/typescript/bin/tsc --noEmit -p apps/web`; require passing tests and exit 0.

## Task 2: One call owner and shared view

**Files:** Create `apps/web/src/lib/live-session.ts` and `apps/web/src/lib/live-session.test.ts`; modify `apps/web/src/components/LiveMode.tsx`, `apps/web/src/screens/Buddy.tsx`, and the existing message-dispatch implementation under `apps/mac/Sources/ShuaCrew` after locating its current ownership routing.

**Interfaces:** `LiveSession` exposes `start(): void`, `end(): void`, `sendText(text: string): boolean`, `getSnapshot(): LiveSnapshot`, and `subscribe(listener: () => void): () => void`. `LiveSnapshot` contains `callId: string | null`, current phase, feed, approval, task count, and availability. Native commands use `{type: "liveCommand", commandId: string, action: "start" | "end" | "text", text?: string}`; snapshots use `{type: "liveSnapshot", callId: string | null, revision: number, snapshot: LiveSnapshot}`. Validate both directions and reject stale revisions.

- [ ] Add tests `repeatedStartAcquiresOnce`, `mainWindowForwardsWithoutCapture`, `ownerLossEndsCall`, and `staleCallCannotUpdateSnapshot`; assert one media owner, forwarded command identity, cleanup, and unchanged newer state.
- [x] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-session.test.ts`; verify RED.
- [x] Move coordination out of the rendering component into the session unit. Bind ownership to the native notch webview; route main-window commands to that owner, with explicit unavailable status if absent. Standalone browser use owns one local session rather than pretending a native owner exists.
- [ ] Rerun session tests and typecheck. Test native routing through the existing Swift package test structure; isolate any pure routing helper for unit coverage rather than relying on UI timing.

## Task 3: Cancellable, serialized execution and approvals

**Files:** Create `apps/web/src/lib/live-task.ts` and `apps/web/src/lib/live-task.test.ts`; modify `apps/web/src/lib/live-session.ts`, `apps/web/src/components/LiveMode.tsx`, `apps/gateway/src/live.ts`, and `apps/gateway/src/live.test.ts`.

**Interfaces:** `LiveTaskRequest = {callId: string; taskId: string; text: string; signal: AbortSignal}`. `LiveTaskResult = {status: "completed" | "failed" | "cancelled" | "unavailable"; summary: string; outcomes: Array<{description: string; ok: boolean; message: string}>; visualId?: string}`. `LiveTaskExecutor = (request: LiveTaskRequest) => Promise<LiveTaskResult>`. `registerExecutor(executor: LiveTaskExecutor): () => void` uses identity-checked cleanup. `cancelTask(taskId: string): void` aborts the active or queued task.

- [ ] Add tests `duplicateTaskExecutesOnce`, `macAndScreenTasksSerialize`, `emptyResultIsNotSuccess`, `endDeniesApproval`, `lateYesCannotAuthorize`, and `timeoutCancelsTask`: assert single execution, maximum concurrency one, explicit failure, false approval, no later side effect, and aborted signal at 120 seconds.
- [ ] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-task.test.ts apps/gateway/src/live.test.ts`; verify RED for new cases.
- [ ] Implement the queue and call-scoped result cache, capped at 100 entries and cleared at call end. Preserve actual partial outcomes. Clear relay/approval timers on settlement, propagate timeout cancellation, and reject stale call/task results. Replace unconditional screen-capability claims with availability-aware instructions.
- [ ] Rerun both suites; verify no pending fake timers and unchanged protected-path/approval policy tests.

## Task 4: Connect Buddy actions and teaching silently

**Files:** Modify `apps/web/src/screens/Buddy.tsx`, `apps/web/src/components/LiveMode.tsx`, and `apps/web/src/lib/live-task.ts`; create `apps/web/src/lib/live-task-integration.test.ts`; extend `apps/web/src/lib/notch-lesson.test.ts` where needed.

**Interfaces:** Buddy registers `LiveTaskExecutor` only in the owner. Extend its internal turn options with `{look?: boolean; origin?: "user" | "live"; signal?: AbortSignal}` and return `Promise<LiveTaskResult | void>`; the adapter must resolve from completed action/visual processing, not merely request dispatch. Live-origin turns do not read or clear the composer draft and do not recursively route back into Live.

- [ ] Add tests `screenOffCapturesNothing`, `liveTurnPreservesDraft`, `liveTurnNeverUsesClassicSpeech`, `resultWaitsForActions`, and `lessonPublishesOnce`: assert zero capture/speech calls, identical draft revision/text, completion only after executor settlement, and one visual publication.
- [ ] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-task-integration.test.ts apps/web/src/lib/notch-lesson.test.ts`; confirm RED. Mock transport/native actions, not the task adapter being tested.
- [ ] Register and clean up the adapter; reuse existing task generation/cancellation checks, permission prompts, action outcomes, teaching routing, and shared visual publication. Return explicit unavailable results for missing capture/permissions. Audit all speaking paths including approvals, proactive updates, errors, and architecture narration so Live owns audible output.
- [ ] Rerun integration/lesson suites. Keep manual lesson navigation when Live lacks playback-aligned narration IDs; do not invent timed step highlighting.

## Task 5: Finish settings and notch presentation

**Files:** Modify `apps/web/src/components/SparkSettings.tsx`, `apps/web/src/lib/companion.ts`, `apps/web/src/components/LiveMode.tsx`, `apps/web/src/components/live-mode.css`, and `apps/web/src/screens/Buddy.tsx`; extend session tests; create `apps/web/src/lib/live-preferences.test.ts`.

**Interfaces:** `LiveAvailability = {mode: "live" | "classic"; reason?: string; retryAt?: number}` derives from saved preference and current connection state without overwriting the preference. Connection backoff lasts 10 minutes; explicit retry clears it. Usage samples expire after 5 minutes and never prevent explicit retry. The idle timer is 45 seconds, gated by actual listening, task count zero, no speech, and no approval.

- [ ] Add tests `modeChangeEndsWithoutRestart`, `oldUsageAllowsRetry`, `failedSetupDoesNotReplay`, `idleWaitsForTasks`, `duplicateResultAnnouncesOnce`, and `proactiveWaitsForUser`: assert media released, retry available, no duplicate request, no timeout while busy, and deferred single announcement.
- [ ] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-preferences.test.ts apps/web/src/lib/live-session.test.ts`; verify RED.
- [ ] Complete the engine selector and show preferred versus effective mode. Remove unsupported latency claims. Add honest connecting/listening/working/approval/error labels, elapsed work time, separate Stop work/End call controls, and one result preview. Preserve current notch styling, user settings, and keyboard focus.
- [ ] Separate audio-energy updates from graph/session rendering; respect reduced motion. Clear elapsed/idle timers and event subscriptions on teardown.
- [ ] Rerun tests and typecheck; inspect the native notch for readability and no duplicate controls before moving to acceptance testing.

## Task 6: End-to-end verification and handoff

**Files:** Create `docs/verification/unified-notch-call-2026-10-02.md`; update plan checkboxes as evidence is collected. No unrelated code cleanup.

- [ ] Add a repeated 100-cycle session/task teardown test asserting zero live tracks, pending timers, and subscribed callbacks after each cycle; run the targeted suites until GREEN.
- [x] Run `node node_modules/typescript/bin/tsc --noEmit -p apps/web`, `node node_modules/vitest/vitest.mjs run --maxWorkers=4`, and `git diff --check`. Record failures and retries separately; do not label unrelated failures as passing.
- [x] Run `node node_modules/vite/bin/vite.js build` from `apps/web`, plus `swift test` from `apps/mac`. If native bridge code changed, inspect and use the repository's existing native build/install procedure; preserve the current app until the new build succeeds.
- [x] Compare the served index against `apps/web/dist/index.html`, then reload only while idle and without a user draft. Verify the running app/gateway uses this checkout.
- [ ] In the native UI verify settings persistence, notch ownership with main window hidden, typed input routing, no duplicate Classic voice, microphone release on End, and recoverable connection failure. Obtain user confirmation of speaker quality; do not infer audibility from a UI state.
- [ ] With explicit screen-test permission, use a benign pointer/teaching task and confirm the observed action matches its report. Run a proposed Netflix-style lesson and verify connected diagram, follow-up context, manual navigation, and no duplicate announcements. Do not perform purchases, sends, destructive actions, or permission expansion as a test.
- [ ] Test AirPods switching only when available. Otherwise mark it pending. Record ready/audio/task/cancel timing measurements without guaranteed-speed claims, and distinguish unit simulations from physical tests.
- [ ] Review the final diff against every spec section; record remaining limitations and exact commands/results. Do not commit or push.

## Execution handoff

The user approved the specification and requested end-to-end delivery. Implementation method: local execution in this session, no subagents. This written plan still requires review before implementation under the design workflow. After that review, execute tasks in order without repeated scope approvals; only pause for genuinely missing information, consequential UI permissions, conflicting edits, or physical audio/device checks.
