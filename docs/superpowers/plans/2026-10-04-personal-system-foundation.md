# Personal System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship a resumable setup, evidence-based readiness, and accurate business monitoring foundations without resetting existing data.

**Architecture:** Add a small gateway-owned setup store and capability receipts. Reuse existing learning, settings, runtime, native permission, run, and venture services; fix their misleading completion/error paths. Keep real tests distinct from permissions and installed-component checks.

**Tech Stack:** TypeScript, Zod, Fastify, React, existing event projections, Vitest, AppKit/WebKit, Swift package build.

**Spec:** `docs/design/shua-obsidian/personal-product-system.md` (approved October 4, 2026).

## Global constraints

- Preserve existing sessions, courses, artifacts, projects, and recordings; no reset or deletion.
- Original Sable sessions remain running. No commits or pushes without the user's permission.
- Do not read, write, or run under `/Users/admin/Nectar-Work` or `/Users/admin/Developer/work`.
- OpenAI/Codex models only; no silent provider fallback.
- Both software products and automation services are selected; spending authority remains unset.
- No new dependency is needed for this release. Existing capability grants remain unchanged.
- Model success, external action success, and user-reported device success are separate evidence kinds.
- Never assert universal superiority or profit from estimates, tests, or incomplete data.

## Scope and later releases

This plan implements Release 1 and the prerequisite monitoring corrections discovered during the audit. The approved overall scope remains active. Subsequent independent plans will cover Release 2 (task receipts/recovery and workflow versions), Release 3 (skill evidence and applied learning), and Release 4 (product/service experiments and scheduled evidence reports). Do not represent this foundation as completion of those releases.

## Review focus

1. Old/corrupt/newer-version setup files: preserve the file and show a recoverable error; never overwrite silently (Task 1).
2. Two windows saving concurrently or late network responses: no lost updates or overwritten user input (Tasks 1–2).
3. Signed-in status and screen permission without a real test: remain untested for execution (Tasks 3–4).
4. Repeated launch/retry or an asynchronous rejection: retain one launch intent and an actionable failure (Task 5).
5. Mixed currencies, test accounts, manual numbers, and old events: never combine into verified live revenue (Task 6).

## Task 1: Gateway setup persistence

**Files:** create `apps/gateway/src/personal-setup.ts`, `personal-setup-routes.ts`, `personal-setup.test.ts`; modify `apps/gateway/src/server.ts`.

**Interfaces:** `SetupProfile` has `version:1`, `revision:number`, `step:0|1|2|3|4|5`, `incomePath:"products"|"services"|"both"`, `weeklyHours:number|null`, `goal:string`, `completedAt:number|null`. `PersonalSetup(file).get()` returns the profile; `.save(expectedRevision, patch)` returns the next profile. GET `/api/personal-setup`; POST same with `{expectedRevision, patch}`. Completion timestamp is server assigned, not arbitrary client input. New records default to both, unset hours, empty goal, incomplete.

- [ ] Write tests: absent file returns defaults without a write; saved profile survives new instance; stale revision returns 409; invalid hours (negative, >168, nonfinite) and goal >500 characters return 400; corrupt/newer-version file returns a visible error without changing bytes; failed rename leaves prior profile usable.
- [ ] Run `node node_modules/vitest/vitest.mjs run apps/gateway/src/personal-setup.test.ts` and verify the new tests fail before implementation.
- [ ] Implement validated atomic temp-file/rename persistence with mode 0600. Serialize writes and increment revision only after persistence succeeds. Store at the gateway data home, not browser localStorage.
- [ ] Mount routes using the existing same-origin mutation protection. Rerun tests and gateway typecheck; require pass/exit 0.

## Task 2: Resumable setup experience

**Files:** modify `apps/web/src/components/Welcome.tsx`, `welcome.css`, `SparkSettings.tsx`, `apps/web/src/shell/Shell.tsx`; create `apps/web/src/lib/personal-setup.ts`, `personal-setup.test.ts`, `apps/web/src/components/Welcome.test.tsx`.

**Interfaces:** use Task 1 endpoints through the existing `api()` wrapper. `saveSetup(patch)` includes the last observed revision. The learning goal continues using `/api/learning/profile`; a failed goal sync leaves setup incomplete and retains the draft. Repeating an identical sync is safe. Existing goal is prefilled only before user editing. The server setup record controls completion; the old welcome flag remains migration input, not proof of completed setup.

- [ ] Write tests for load failure/retry, draft retained after save failure, completion only after both saves succeed, double-click submission guard, stale-save conflict, late prefill not overwriting typed input, and resume at saved step.
- [ ] Run the two new test files and observe failures.
- [ ] Implement six steps: Outcomes, Codex, Mac & tools, Voice & control, Work defaults, First outcome. Keep avatar/name preferences in their existing store. Products/services/both and hours save to Task 1. “Later” exits without falsely completing setup. Show saving/error states inline with retry.
- [ ] Work defaults display existing gateway caps/quiet hours/protected roots and link to their real settings; do not add unenforced controls. First outcome offers existing lesson, workflow, or research entry points, with progress/evidence shown by Task 4.
- [ ] Add clear reopen/resume entry from Settings and a compact Today entry. Update native shortcut help to Command-1 through Command-6. Preserve keyboard navigation, focus, reduced motion, narrow layouts, and the Obsidian theme.
- [ ] Rerun tests and web typecheck; require pass/exit 0.

## Task 3: Truthful service checks

**Files:** modify `apps/gateway/src/health.ts`, `health.test.ts`, `apps/web/src/components/HealthCheck.tsx`, `Welcome.tsx`; create `apps/web/src/lib/readiness.ts`, `readiness.test.ts`.

**Interfaces:** `ReadinessState = "untested"|"checking"|"verified"|"blocked"|"stale"`. `CapabilityReceipt` includes `capability`, `state`, `scope`, `checkedAt`, `evidenceKind:"service"|"model-run"|"native-action"|"user-observed"`, optional `runId`, `detail`, and `fixPath`. Existing health statuses remain API compatible; an adapter gives them scoped readiness labels.

- [ ] Add tests: no runtime is a failure; unknown authentication is a warning; unknown runtime is not counted as a usable fallback; successful synthesis says generated audio, not playback; missing local transcription does not assert that every live voice mode is broken.
- [ ] Run changed test suites, verifying failure before implementation.
- [ ] Remove unconditional “Everything's working” and “read it exactly” claims. Show what was checked and when. Remove retired Claude copy from active setup/health. Explain local versus OpenAI live audio paths accurately. Permission receipt never promotes action readiness to verified.
- [ ] Test the pure adapter: timestamp absent gives untested; disconnected current check gives stale; permission-only evidence is service scoped; model-run evidence does not verify Mac control.
- [ ] Rerun tests and both typechecks.

## Task 4: First outcome and capability receipts

**Files:** create `apps/gateway/src/capability-receipts.ts`, `capability-receipts.test.ts`, `apps/web/src/components/SetupChecks.tsx`, `SetupChecks.test.tsx`; modify Task 1 routes/store and setup view.

**Interfaces:** store the Task 3 receipt shape in a separate versioned gateway file, keyed by capability and evidence kind. GET `/api/personal-setup/checks`; POST `/api/personal-setup/model-check` starts or returns one existing in-flight Codex check run. Server observes its completed output; browser cannot label it verified. User observations use a separately labeled POST endpoint limited to audio/input check IDs, never model/native proof.

- [ ] Test unavailable Codex, successful exact check response, provider failure, duplicate clicks returning one run, aborted check, and restart with an unfinished run. Timeout is 60 seconds; no automatic retry. Label these runs `setup-check` and keep them inspectable.
- [ ] Implement a read-only prompt asking for a fixed short response using the current Codex catalog; no arbitrary project repository and no provider fallback. Save run-linked verified/blocked receipt from observed events.
- [ ] Add UI for a short voice check, interruption, and harmless TextEdit check using existing native controls. Show unsupported/unavailable explicitly. Device checks that require the user's voice remain user-observed until native evidence exists. Never synthesize a microphone success.
- [ ] Rerun tests and verify one real Codex check in the installed app during Task 7.

## Task 5: Visible business launch failures

**Files:** modify `apps/gateway/src/ventures.ts`, `ventures.test.ts`, `packages/core/src/events.ts`, `projections.ts`, `apps/web/src/screens/Ventures.tsx`; add core projection tests alongside existing projection tests.

**Interfaces:** event `venture.automation` records `{id, playbook, state:"starting"|"started"|"failed", attemptId, error?}`; `VentureView.automation` preserves the latest event and timestamp. `startPlay` permits a synchronous return or Promise. A per-venture/playbook in-flight guard prevents duplicate calls; existing live play checks remain.

- [ ] Write tests for synchronous throw, rejected Promise, duplicate start during pending launch, success clearing old failure, restart projection preserving failure, and readable retry without erasing previous run history.
- [ ] Run gateway/core tests and verify the failures before implementing.
- [ ] Replace the swallowed catch with sanitized persisted failure. Display failed task, timestamp, and retry in the project view. Retry passes existing policy and launch prerequisites, not an approve-all path. After restart an unresolved starting intent requires reconciliation against actual plays before retry.
- [ ] Rerun targeted tests and typechecks.

## Task 6: Revenue provenance and currency correctness

**Files:** modify `apps/gateway/src/ventures.ts`, `ventures.test.ts`, `packages/core/src/events.ts`, `projections.ts`, `apps/web/src/screens/Ventures.tsx`; create `apps/web/src/lib/venture-metrics.ts`, `venture-metrics.test.ts`.

**Interfaces:** additive optional `mode:"live"|"test"` on `venture.metrics` and projected metrics; existing `source` remains. `metricProvenance(v)` returns live-provider, test-provider, manual, or unknown. Legacy provider events without a mode are unknown, not retroactively inferred from today's connected account. `totalsByCurrency(ventures)` groups live-provider MRR by uppercase currency, excluding errored/test/manual/unknown metrics.

- [ ] Write tests: test Stripe revenue never automatically marks earning; manual revenue remains reported; live positive revenue can advance once; error sync never advances; old events still replay; switching accounts does not relabel old receipts; USD and EUR are separate totals; unknown values remain unknown rather than zero.
- [ ] Run suites and verify expected failures.
- [ ] Include mode at successful provider sync. Require live-provider evidence in automatic revenue-stage transition. Preserve historical explicit stages but label evidence accurately. Update project cards, briefs, and totals to expose source, mode, currency, timestamp, and errors. No “profit” without cost/refund coverage.
- [ ] Rerun gateway/core/web tests and typechecks.

## Task 7: Installed release and handoff

**Files:** create `docs/verification/personal-system-foundation-2026-10-04.md`; update existing test-drive guide with setup checks.

- [ ] Run the full existing Vitest suite plus new gateway/core suites. Run web/gateway TypeScript checks and `git diff --check`. Record exact commands and results; resolve failures introduced by the changes.
- [ ] Inspect existing active runs before any required gateway restart. Do not interrupt user tasks. Quit only Shua through UI, run `bash apps/mac/scripts/install.sh`, then `codesign --verify --deep --strict /Applications/ShuaCrew.app`.
- [ ] Use CUA to reopen the signed app and verify resume/save/error paths, six-section navigation, model check, blocked-state details, both income paths, and retained existing courses/artifacts. Test narrow layout and keyboard focus. Do not grant new permissions silently.
- [ ] Preserve Sable PID/session continuity; document that its input update still awaits a user-chosen restart. Record unresolved live microphone checks honestly.
- [ ] Leave setup open at the next genuinely user-dependent step. Report implemented features, evidence, and exact limits. No commit/push.

## Plan self-review

All Release 1 requirements map to Tasks 1–4 and 7. The audited business correctness prerequisites map to Tasks 5–6. The five review-focus conditions have explicit tests. Tasks consume the receipt and profile interfaces defined above; no new dependency or data reset is planned. Releases 2–4 remain separate planned work, not silently omitted or declared complete.
