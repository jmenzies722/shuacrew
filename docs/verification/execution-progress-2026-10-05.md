# Execution progress and dependent commands — 2026-10-05

## Findings

LiveTaskQueue aborted every request after 120 seconds regardless of progress. This could terminate long tasks that were still receiving model/tool events. Separately, the model's do-action loop continued after failed receipts, and declined actions returned ok:true. Those behaviors could advance dependent commands in the wrong state.

## Changes

- Live tasks now have a two-minute inactivity deadline refreshed by changed evidence from their own run (event sequence, summary, or action outcomes). Unchanged UI renders cannot refresh it.
- A 20-minute absolute live-task limit remains. Explicit cancellation is immediate. Timeout failure and user cancellation have different messages; neither is called successful.
- Timer cleanup also rejects late progress callbacks after completion.
- Dependent do-actions execute in order and stop after a failed, unconfirmed, or declined receipt. Later do blocks in the same failed reply are skipped. No follow-through is scheduled from a partly failed action sequence.
- Failed sequences show the blocker and preserve actual outcomes for voice completion. Declining permission does not count as executing the requested action.
- Exact action payloads, deduplication receipts, fresh-observation desktop checks, permissions, and the existing 12-step desktop limit remain. This change does not guarantee arbitrary tasks, make model inference instant, or establish end-to-end verification for every native operation.

## Verification

```text
node node_modules/vitest/vitest.mjs run
Test Files 248 passed (248)
Tests 1156 passed (1156)
Duration 14.31s

# After final late-progress cleanup and same-reply failure guard:
node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-task.test.ts apps/web/src/lib/live-task-integration.test.ts apps/web/src/lib/action-sequence.test.ts apps/web/src/screens/spark/crew-actions.test.ts
Test Files 4 passed (4)
Tests 27 passed (27)

node node_modules/typescript/bin/tsc --noEmit -p apps/web
git diff --check
Both exit 0

# apps/web:
node node_modules/vite/bin/vite.js build
exit 0
```

Tests simulate advancing progress past two minutes, a stalled task, the absolute limit, user cancellation, late completion, duplicate task IDs, timer cleanup, unchanged UI events, exact command ordering, failed prerequisites, and denied actions.

Deployment: final frontend bundle rebuilt. ShuaCrew process 71307 was still running; its existing WebViews must reload through quit/reopen to load these changes. No native binary or gateway changes in this pass. CUA connection remains unavailable, so real desktop execution and physical microphone behavior have not been reverified.
