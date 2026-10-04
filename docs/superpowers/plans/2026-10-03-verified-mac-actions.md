# Verified Mac Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution recommendation: native, in this session. Await user review before implementation.

**Goal:** Complete scoped Mac tasks through observe → target → act → verify, with truthful receipts, human takeover, and an initial Calculator acceptance test.

**Architecture:** Extend the existing `perform` action path, native Buddy bridge, and SparkHands accessibility implementation; do not introduce a parallel desktop controller. A bounded task coordinator supplies scoped, typed steps and treats native dispatch and subsequent verification as separate events. A native observation registry retains AX handles locally; web messages carry opaque identities rather than reusable screen coordinates.

**Tech Stack:** Existing TypeScript/React, Vitest, Swift/AppKit/ApplicationServices, Swift Testing, local gateway receipt storage. No new third-party dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-autonomous-mac-reliability.md`

## Global Constraints

- Default budgets: 12 steps, 120 seconds, and two re-observation attempts per unresolved step.
- Do not repeat a mutation with an unknown outcome; reconcile using receipts and read-back first.
- Serialize UI mutations, preserve action IDs across retries, and check cancellation immediately before dispatch and after asynchronous waits.
- Deny actions under `/Users/admin/Nectar-Work` and `/Users/admin/Developer/work`, including resolved symlink destinations. Never inspect the real sealed directories, including during testing.
- Keep receipts local and minimal; do not persist screenshot contents or sensitive field values by default.
- Preserve existing approvals and permission boundaries. Missing permissions block; the benchmark must not request more access.
- Keep the notch anchored. Execution feedback belongs to a separate cursor/task channel; it must not change Fn recording or introduce another voice.
- Work in `shuacrew-live`; preserve existing uncommitted work. No commits, pushes, branch changes, dependency installation, or destructive git operations without separate user authorization.

## Delivery Boundary

The first release supports a deterministic local fixture and Calculator (`com.apple.calculator`), using accessible named controls and read-back. It supports opening the scoped app and activating uniquely identified controls. General document editing, arbitrary browser navigation, generic typing, coordinate fallback, and scheduled unattended desktop execution remain unavailable in this slice. Unsupported requests must report that limit, not fall through to the legacy unverified action loop.

Calculator acceptance: open Calculator and calculate `128 × 47`; read the result from the app as `6016`, allowing locale grouping separators. Do not manufacture evidence by evaluating the expression in JavaScript or Swift. AX semantics vary by macOS version: unsupported controls/display read-back must block honestly, not trigger guessed clicks.

## Review Focus

1. Two windows with identical control names: bind to one observed PID/window, never pick the first global match (Task 2).
2. Native timeout after an action took effect: record an uncertain dispatch and reconcile without a second mutation (Tasks 1, 3).
3. Real user input during asynchronous activation: invalidate pending work before the next mutation; no automatic resume (Task 4).
4. Locale differences in Calculator display/control names: explicit supported mappings and normalization; unsupported layouts stop (Task 5).
5. Restart, stale observation, or symlinked resource: no recovered action replay and no observation outside permitted context (Tasks 1–3).

---

### Task 1: Typed contracts, scope policy, and truthful receipts

**Files:**
- Create `apps/web/src/lib/mac-task-contract.ts` and `mac-task-contract.test.ts`.
- Create `apps/mac/Sources/ShuaCrewCore/MacTaskContract.swift` and `apps/mac/Tests/ShuaCrewCoreTests/MacTaskContractTests.swift`.
- Modify `apps/web/src/screens/spark/actions.ts`, `apps/gateway/src/server.ts`, and `apps/gateway/src/gateway.test.ts` only where needed to carry verification metadata through the existing claim/finish endpoints.

**Interfaces:**
- `MacTaskScope`: `{ taskId, generation, request, allowedBundleIds, allowedResourceRoots, startedAt, deadline, maxSteps }`.
- `MacObservation`: `{ id, taskId, generation, observedAt, bundleId, pid, windowId, displayId, geometryRevision, targets }`; targets expose opaque ID, role, safe label, and bounds. AX references stay native.
- `MacStep`: `{ actionId, observationId, targetId, expected, risk }`. Risk is `routine | consequential | forbidden`; only routine adapter-defined operations can run in this slice.
- `MacPredicate`: app/window identity or a named observable value equality. Predicates are bound before dispatch and evaluated by native adapters, not model prose.
- `MacReceipt`: `{ taskId, actionId, dispatch: not-sent | sent | unknown, status: verified | failed | unverified | cancelled | needs-approval, message, evidence? }`. Evidence includes observation ID/time and predicate result, without screenshots or arbitrary field contents.
- `classifyMacStep(scope, step)` returns `allow | needs-approval | deny`. Swift equivalent independently validates decoded requests.

- [ ] Write failing tests: missing evidence cannot produce `verified`; IDs cannot be reused with different payloads; expired tasks and unknown operation types are denied; consequential operations return needs-approval; forbidden paths remain denied through synthetic symlink resolution. Use injected path-resolution fixtures, not actual sealed paths.
- [ ] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/mac-task-contract.test.ts apps/gateway/src/gateway.test.ts` and `cd apps/mac && swift test --filter MacTaskContractTests`; confirm new assertions fail for the intended reason.
- [ ] Implement wire validation and policy, with the same versioned fixture JSON decoded by web and Swift tests. Keep existing non-desktop `ActionResult.ok` behavior intact; new verified steps derive their user-facing `ok` only from `status === verified`.
- [ ] Rerun these tests; require zero failures and preservation of existing receipt deduplication tests.

### Task 2: Scoped observations and native target registry

**Files:**
- Create `apps/mac/Sources/ShuaCrew/MacTaskRuntime.swift` and `apps/mac/Sources/ShuaCrewCore/MacObservationRegistry.swift`.
- Create `apps/mac/Tests/ShuaCrewCoreTests/MacObservationRegistryTests.swift`.
- Modify `apps/mac/Sources/ShuaCrew/Buddy.swift`, `apps/mac/Sources/ShuaCrew/SparkHands.swift`, and `apps/web/src/screens/spark/bridge.ts`.

**Interfaces:**
- `observeMacTask(scope, signal): Promise<MacObservation>`; bridge correlates each native request and rejects late generations.
- `MacTaskRuntime.observe(scope:)` verifies the allowed app and window metadata before enumerating scoped AX controls. It does not call the existing whole-desktop screenshot capture path.
- Registry resolves `(taskId, generation, observationId, targetId)` to a current native target or a structured stale/ambiguous/forbidden result. Use a 2-second observation validity ceiling plus immediate identity/geometry checks; timestamp alone never authorizes dispatch.

- [ ] Write failing registry tests for moved/disappeared controls, duplicate labels, app switch, same labels in a different window, expired observation, geometry changes, missing accessibility permission, and process restart. Assert no target is returned on these failures.
- [ ] Run `cd apps/mac && swift test --filter MacObservationRegistryTests`; confirm failing cases before implementation.
- [ ] Implement app-scoped accessibility traversal by extending `SparkPress` in `SparkHands.swift`. Do not use its existing cross-app fallback for verified tasks. Observe only fixture/Calculator windows; deny password managers, unknown apps, and document-bearing contexts whose permitted resource cannot be established.
- [ ] Add web bridge tests in `apps/web/src/screens/spark/mac-task-bridge.test.ts` for request correlation, cancellation, and structured native failures; run those plus the registry suite to green.

### Task 3: Bounded observe–act–verify coordination

**Files:**
- Create `apps/web/src/lib/mac-task.ts` and `mac-task.test.ts`.
- Modify `apps/web/src/screens/spark/actions.ts`, `apps/web/src/lib/live-task.ts`, `apps/web/src/lib/live-turn.ts`, and `apps/mac/Sources/ShuaCrew/MacTaskRuntime.swift`.
- Extend existing live-task/live-turn tests rather than replacing them.

**Interfaces:**
- `runMacTask(scope, adapter, signal, onProgress): Promise<MacTaskResult>`.
- Adapter exposes `observe`, `planNext`, `dispatch`, and `verify`; `planNext` supplies a prebound predicate or a terminal result, never an unrestricted command string.
- `MacTaskResult`: `{ status: completed | blocked | paused | cancelled, receipts, summary }`; completed requires the final requested predicate to have verified evidence.
- `perform` gains optional verified-step context; existing claim IDs wrap dispatch. Native verified dispatch must revalidate scope, generation, app/window identity, and target immediately before AX activation. Re-observation and read-back remain separate from mutation.

- [ ] Write failing tests using deterministic stateful adapters: 12th step allowed/13th forbidden; 120-second deadline; two re-observations then blocked; missing target never dispatches; duplicate action ID dispatches once; cancellation during each await prevents later dispatch; timeout after mutation performs read-back but never repeats mutation; changing model text to “done” does not change receipt status.
- [ ] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/mac-task.test.ts`; confirm intended failures.
- [ ] Implement the coordinator on the existing serialized action path. Persist action claim/uncertain outcome before allowing another mutation. On restart, unreconciled tasks stop; do not automatically replay them. Check deadlines natively as well as in web code.
- [ ] Integrate verified desktop results into live completion reporting without altering ordinary conversational answers. Run the task, action, live-task, and live-turn test suites; all must pass.

### Task 4: Human takeover and execution-driven feedback

**Files:**
- Create `apps/mac/Sources/ShuaCrewCore/MacInputOrigin.swift` and `apps/mac/Tests/ShuaCrewCoreTests/MacInputOriginTests.swift`.
- Create `apps/web/src/components/MacTaskStatus.tsx` and `MacTaskStatus.test.tsx`.
- Modify `apps/mac/Sources/ShuaCrew/{SparkHands,MacTaskRuntime,Buddy,CursorBuddy}.swift` and `apps/web/src/screens/Buddy.tsx`.

**Interfaces:**
- `MacTaskProgress`: `{ taskId, generation, phase, label, reason? }`; phases are observing, targeting, acting, verifying, verified, needs-approval, blocked, paused, cancelled.
- `cancelMacTask(taskId, generation)` invalidates native queued work and removes only that task's overlays.
- `resumeMacTask(taskId)` requires a user Resume action, a new generation, and a fresh observation; no timed auto-resume.
- Synthetic events from SparkHands carry a per-process origin marker. Event origin and process identity distinguish controller events; absent/unrecognized origin is treated as takeover. AX-only operations do not inject mouse events for animation.

- [ ] Write failing tests for own tagged input, real mouse movement/click/keyboard, unknown synthetic input, Escape during an await, late generation feedback, and explicit resume. Assert paused/cancelled tasks inject no further input.
- [ ] Run `swift test --filter MacInputOriginTests` in `apps/mac` and the component tests; confirm failures before implementation.
- [ ] Wire native event monitoring to pause/cancel the controller; preserve existing Escape cancellation. Render truthful progress and Resume/Cancel controls from controller events, not assistant text. Reduced motion retains target visibility without travel. Never invoke notch-window walking.
- [ ] Verify component tests distinguish “Verifying” from “Done”; only verified receipts show completion. Rerun voice/Fn, pointer feedback, notch hover/layout, and native placement tests to green.

### Task 5: Fixture and Calculator adapters

**Files:**
- Create `apps/mac/Sources/MacTaskFixture/main.swift`; add an explicit development executable target in `apps/mac/Package.swift`, not a packaged production app resource.
- Create `apps/mac/Sources/ShuaCrew/MacCalculatorTask.swift` and `apps/mac/Sources/ShuaCrewCore/CalculatorReadback.swift`.
- Create `apps/mac/Tests/ShuaCrewCoreTests/CalculatorReadbackTests.swift` and `apps/web/src/lib/mac-task-integration.test.ts`.
- Modify `apps/web/src/screens/Buddy.tsx` only to route supported user requests to the coordinator, reusing the same route for typed and live requests.

**Interfaces:**
- Fixture exposes named controls with observable counters, movable/duplicate controls, delayed acknowledgments, and permission/identity fault injection through test adapters. It emits minimal local benchmark results.
- Calculator adapter supplies `planNext` for open, clear, digit/operator activation, and equals, with each result verified through app AX state. Intermediate operator state must have an observable predicate; if unavailable, stop rather than pretending it verified.
- `normalizeCalculatorResult(text, locale): string | null` permits explicitly tested grouping/decimal forms and rejects unexpected text. It normalizes read-back only, never computes the answer.

- [ ] Write failing integration tests: fixture sequence produces one verified final receipt; repeated controls never duplicate mutations; Calculator task cannot finish from dispatch messages alone; `6,016` and the configured locale's grouping normalize to `6016`; unrelated/malformed displays and unsupported layouts block.
- [ ] Run the new Vitest and Swift tests and confirm failures.
- [ ] Implement minimal fixture and Calculator adapters. Before opening Calculator, preserve scope and task ownership; never widen to another app. Legacy action routes must not become a fallback for a failed verified task. No approval is required for each routine calculator step, but existing consequential gates remain intact.
- [ ] Run both suites to green; manually inspect Calculator accessibility semantics through approved UI tooling before enabling its real-app benchmark. Stop if permissions are missing; do not grant them automatically.

### Task 6: End-to-end acceptance and release

**Files:**
- Create `docs/verification/verified-mac-actions-2026-10-03.md` with command outputs, benchmark receipts, build identity, limitations, and rollback location.

- [ ] Execute 20 fixture locate/highlight/activate/verify tasks. Require 20 correct observed outcomes, zero duplicate mutations, and zero false completions. Inject delayed response, missing target/permission, changed window/geometry, and human takeover; each must block/pause without further mutation.
- [ ] Run Calculator acceptance using the app's ordinary task entry: “Open Calculator and calculate 128 × 47.” Observe the displayed `6,016` and the verified receipt. Repeat cancellation/takeover once; no continuation until explicit resume. Use only permitted computer-use tooling for agent-driven UI testing, never shell input injection.
- [ ] Run `node node_modules/vitest/vitest.mjs run --maxWorkers=4`, `node node_modules/typescript/bin/tsc --noEmit -p apps/web`, `cd apps/web && ../../node_modules/.bin/vite build`, `cd apps/mac && swift test`, `cd apps/mac && swift build -c release --product ShuaCrew`, and `git diff --check`. Record all failures/warnings without fixing unrelated bugs.
- [ ] Stage and sign using the established non-pruning install method. Preserve the installed bundle before replacement; restart only while idle or with explicit permission to interrupt. Verify signature, installed binary, served web index, and reopened UI.
- [ ] Report the bounded result honestly. Failure to obtain Calculator read-back is a blocked acceptance test, not task completion. Do not claim general autonomous Mac reliability from this benchmark.

## Self-review and handoff

Contracts/policy map to Task 1; observation and sealed-context boundaries to Task 2; budgets, deduplication, and verification to Task 3; takeover/cursor/notch semantics to Task 4; first working vertical slice to Task 5; benchmarks and voice/notch regressions to Task 6. General typing/navigation beyond these adapters is intentionally deferred under the spec's initial delivery boundary.

Plan review is pending. Recommended execution: native in this session, with no subagents or commits unless separately authorized. The user must approve this written plan before product code changes begin.
