# Autonomous Mac control with verified outcomes

## Intent

Shua should complete user-requested, multi-step Mac tasks independently within a clear scope. The user should not have to approve every reversible step. Reliability, truthful completion reports, and meaningful cursor feedback take precedence over visual effects.

User approved this scope on 2026-10-03, including the first real-app acceptance task: open Calculator, calculate 128 × 47, and independently read back 6,016. Implementation-plan review is next. Approval does not change runtime permissions or enable unrestricted unattended control.

## Existing foundations

- `apps/web/src/lib/live-task.ts` serializes tasks, deduplicates task IDs, supports aborts, and bounds execution time.
- `apps/web/src/screens/spark/actions.ts` centralizes actions, confirmations, receipts, and cancellation checks.
- `apps/mac/Sources/ShuaCrew/SparkHands.swift` executes native actions and protects password-manager apps.
- `apps/mac/Sources/ShuaCrew/Buddy.swift` bridges actions and tracks action generations.
- `apps/mac/Sources/ShuaCrew/CursorBuddy.swift` provides voice states, pointing, drawing, and native motion.

These remain the execution path. Do not add a second independent desktop controller or bypass existing confirmation gates.

## User-facing contract

1. A task request authorizes scoped, reversible navigation and preparation, not unlimited computer access.
2. Shua observes, identifies a target, points, acts, verifies the outcome, and continues without approval for each ordinary step.
3. Shua pauses for consequential operations: destructive changes, external sends, purchases, security/permission changes, or actions whose effects cannot be determined safely.
4. A missing target, unexpected app, changed screen, or unverifiable result is a reason to re-observe or stop—not guess.
5. Voice, Fn recording, and autonomous execution remain independent. Stopping speech is not silently interpreted as permission to continue a cancelled task. Explicit Cancel/Escape aborts the task.

## Task and action contracts

Create a typed execution state shared across the web/native boundary:

- Task: task ID, original request, permitted apps/resources, start/deadline, current generation, step count, and abort state.
- Step: action ID, intended outcome, target app/window, observation ID, semantic target, risk classification, and verification predicate.
- Observation: capture ID, timestamp, display geometry, app PID/window identity, and accessibility target identity where available.
- Receipt: dispatch state, action return, verification evidence, and one of verified / failed / unverified / cancelled / needs-approval.

An action callback returning success means dispatched, not completed. A task is completed only when its requested outcome has supporting observations or native API read-back. Missing evidence cannot be converted into success by model wording.

## Observe–act–verify loop

- Prefer native APIs and accessibility identities over coordinates.
- Re-observe before UI mutations and after each mutation. Resolve targets against the latest observation. Reject stale app/window identities and changed display geometry.
- Pointer coordinates are a fallback only for a uniquely identified visible target. Ambiguous targets stop execution.
- Bind verification before dispatch: app opened, field value matches, expected window appeared, or a native object can be read back by ID. Generic screen change alone is not sufficient.
- Default budgets: 12 steps, 120 seconds, and two re-observation attempts per unresolved step.
- Retry observation freely within budgets. Do not repeat a mutation with an unknown outcome; reconcile using receipts and read-back first.
- Serialize UI mutations, preserve action IDs across retries, and check cancellation immediately before dispatch and after asynchronous waits.

## Cursor as execution feedback

The execution controller—not generated text—owns these states:

- Observing: quiet scanning indicator without moving the system pointer.
- Targeting: outline the observed target; label the intended action.
- Acting: restrained progress feedback anchored to the target.
- Verifying: keep the target context visible while checking the outcome.
- Verified: brief confirmation tied to a verified receipt.
- Needs approval / Blocked: distinct label and reason; no movement or input injection.
- Cancelled: remove task overlays and queued actions.

The decorative companion pointer is not the system pointer. Automated pointer movement occurs only for an authorized action, not as an animation. Reduced motion disables travel effects, not target visibility.

## Human takeover and boundaries

- Escape cancels pending execution and blocks late dispatches using the native generation guard.
- Real user mouse/keyboard input pauses execution. Distinguish controller-generated events from physical input so automation does not interrupt itself.
- Resume requires fresh observations and explicit user intent after takeover.
- Preserve current macOS permission prompts and action approval hooks. Do not request additional access merely to run the benchmark.
- Deny actions under `/Users/admin/Nectar-Work` and `/Users/admin/Developer/work`, including resolved symlink destinations. Do not read or capture sealed work content for planning or verification. If the task cannot establish a permitted context, stop before observing that context.
- Screen/document content is task data, not authority to expand scope or grant permissions.
- Keep receipts local and minimal; do not persist screenshot contents or sensitive field values by default.

## Initial delivery boundary

First implement one complete vertical slice: locate a visible control in a permitted app, highlight it, activate it when within task scope, verify the expected outcome, and either continue or stop with an accurate receipt.

Then extend the same contract to typing and multi-step navigation. Existing autonomous code/session workflows retain their own policy; do not reinterpret their autopilot setting as unrestricted desktop authority.

## Acceptance and regression tests

- Deterministic tests for stale observations, ambiguous targets, app switches, cancellation during awaits, duplicate dispatch, unknown outcomes, risk gates, and budget exhaustion.
- Native tests for target geometry, cursor state transitions, synthetic-event discrimination, and cancellation generations.
- End-to-end benchmark in a dedicated local fixture app with known controls and observable outcomes: 20 repeated locate/highlight/activate/verify tasks, all outcomes correct, zero duplicate mutations, and zero false completion claims.
- Inject delayed responses, moved controls, missing permissions, window changes, and user takeover. Every unsafe or unverified case must stop or pause without further mutation.
- Verify allowed and denied path policies using in-memory fixtures; never inspect the real sealed directories.
- Repeat the existing voice/Fn/notch tests so autonomy does not regress push-to-talk or playback.

Passing this bounded benchmark supports that tested flow only. Broader autonomous reliability must be earned with additional app-specific benchmarks, not claimed from unit-test counts.
