# Dynamic notch and full transcript — 2026-10-04

## Delivered

- Expanded notch shows the current typed conversation as complete selectable messages, including streamed text while voice plays. Internal action blocks stay separate from readable conversation.
- The live transcript no longer discards messages after eight lines or fourteen feed entries. Transient tool progress remains bounded; current-call conversation is retained in memory. Starting a new call still begins a new transcript.
- Separate assistant messages remain separate. An authoritative tool result still replaces its spoken paraphrase to avoid duplicate/corrected claims.
- Preview grows with live text up to 170px. Expanded reading area grows to 240px, with overall expanded notch bounded at 420px. Long conversations scroll without line clamps; the input and work status remain separate.
- Automatic following pauses when the reader scrolls up. Latest returns to new content; resize following handles reopening the notch. Copy conversation reports clipboard failure honestly and leaves selectable text available.
- Last voice conversation is accessible after ending a call until the next call starts.

## Commands and results

```text
node node_modules/vitest/vitest.mjs run
Test Files 246 passed (246)
Tests 1148 passed (1148)
Duration 12.28s

node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-transcript.test.ts apps/web/src/lib/notch-presentation.test.ts apps/web/src/components/LiveMode.test.tsx apps/web/src/lib/live-session.test.ts
Test Files 4 passed (4)
Tests 37 passed (37)
# Rerun after final resize-follow adjustment.

node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0

git diff --check
exit 0

bash apps/mac/scripts/install.sh
installed /Applications/ShuaCrew.app
exit 0
# Backup: /Users/admin/.shuacrew/app-backups/ShuaCrew-20261004-183148.app

# Final frontend rebuild after resize-follow adjustment, cwd apps/web:
node node_modules/vite/bin/vite.js build
exit 0
```

Logs: `/private/tmp/shua-full-transcript-tests.log`, `/private/tmp/shua-full-transcript-install.log`, `/private/tmp/shua-full-transcript-build.log`. Existing build chunk-size warning remains.

## Physical verification outstanding

CUA open attempt failed: `Sky Computer Use native pipe startup failed`. Visual sizing, clipboard access in WKWebView, and real pointer/scroll interaction have not been visually verified. No change to permissions or data.

Open ShuaCrew, ask for a ten-step explanation, hover the notch, scroll upward while new text arrives, then use Latest and Copy conversation. End a voice call and open Last voice conversation. Confirm the text remains readable and selectable with the selected theme.
