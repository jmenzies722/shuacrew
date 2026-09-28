# Persistent practice follow-up — 2026-09-27

## Delivered

- A stale screen assessment no longer leaves guidance stuck in `checking` after a concurrent lesson edit. The stale result is rejected; the latest document and current goal remain, with an explicit request for a fresh attempt. Pauses, newer events, and changed steps are not overwritten.
- Active guided practice temporarily keeps the desktop companion above the application being practiced. Pausing restores the saved pin preference. Native raising uses `orderFrontRegardless`, not keyboard focus acquisition.
- `Check now` requests a fresh screen observation during active guidance, including after typing or keyboard-only actions. The contract distinguishes `check` from `click`; display-center coordinates are explicitly not click evidence. Both main app and companion use the same native bridge and lesson.

## Regression verification

Observed failures before the corresponding fixes:

```text
pnpm exec vitest run apps/gateway/src/teaching.test.ts
1 failed | 8 passed: expected uncertain, received checking

pnpm exec vitest run apps/gateway/src/teaching.test.ts
1 failed | 9 passed: TeachingObservationSchema rejected kind=check
```

Final commands/results:

```text
$ pnpm exec vitest run apps/gateway/src/teaching.test.ts
Test Files 1 passed (1)
Tests 10 passed (10)
exit 0

$ pnpm test
Test Files 126 passed (126)
Tests 558 passed (558)
exit 0

$ pnpm typecheck
pnpm -r --parallel exec tsc --noEmit -p .
exit 0

$ pnpm --filter @shuacrew/web build
built in 2.09s
exit 0; existing large-chunk warning remains

$ swift test -c release --package-path apps/mac
Build complete! (13.69s)
Executed 3 tests, with 0 failures
Test run with 23 tests in 0 suites passed
exit 0

$ git diff --check
no output; exit 0

$ codesign --verify --deep --strict /Applications/ShuaCrew.app
no output; exit 0

$ cmp /private/tmp/ShuaCrew-practice-release/ShuaCrew.app/Contents/MacOS/ShuaCrew /Applications/ShuaCrew.app/Contents/MacOS/ShuaCrew
no output; exit 0

$ curl -fsS http://127.0.0.1:7420/api/teaching/check
{"active":"teach_2d45f456-e1da-4ec0-99ce-edeca5164d8c","revision":6,"busy":false}
```

Logs: `/private/tmp/shua-practice-{tests,types,build,swift}.log` and pre-fix failures `/private/tmp/shua-practice-red.log`, `/private/tmp/shua-checknow-red.log`.

Focused independent review found a missing `buddyTeachPracticeCheck` bridge case. Fixed before the final Swift build/install. No other scoped findings.

## Real integration and limits

Created a lesson through the existing subscription SDK and live gateway, not a mocked model. Lesson `teach_96121e47-e5c6-4690-9912-201452f3383b` retained stable step `step_1_upload_complete` with a pending-to-complete diagram. Artifacts: `/private/tmp/shua-practice-created.json`, `/private/tmp/shua-practice-session.json`.

Displayed a controlled, local native practice window with failure/success buttons and no actual uploads. Automated button activation did not reliably produce global mouse events; a physical click did reach native capture and the gateway's checking state. Concurrent canvas edits then invalidated the assessment and exposed the stuck-status regression above. This does **not** establish a completed live retry → verified → overlay cycle.

The user asked why manual test clicks were needed. Removed that burden: closed the temporary native test app, paused observation, restored the previous recursion lesson. Full physical click-to-overlay behavior and the new Check now control's end-to-end model assessment remain unverified. Automated gateway tests use controlled model responses; earlier real SDK image verification is documented separately in visual-teaching-2026-09-27.md. Multi-display hardware checks remain outstanding.

## Activation

Installed signed update using `/private/tmp/install-shua-practice.sh`, with previous app preserved at `/Users/admin/.shuacrew/app-backups/ShuaCrew-before-practice-20260927-213709.app`.

Restarted the gateway gracefully under existing activation authorization, then reopened `/Applications/ShuaCrew.app`. The existing architecture session was visibly running again after requeue. No approval was accepted or denied by this agent. Observation remains paused. No commit or push.
