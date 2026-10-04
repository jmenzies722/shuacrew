# Anchored notch and listening polish

## Changes

- Native guided pointing no longer relocates a docked notch window. Free desktop companions can still walk beside a guide; the separate cursor companion remains available.
- Microphone samples retain quiet speech and small changes instead of being rounded to twelve levels. Non-finite samples are treated as silence; capture shutdown publishes zero.
- Fn listening uses the same frame-smoothed audio waveform as playback, with microphone gain accounted for. Stale samples do not animate inactive states. Duplicate listening meters and artificial minimum levels were removed from the notch preview.
- Listening has a release-Fn hint, readable transcript space, and a clear transition to preparing the reply. Suggestions are hidden during listening, speaking, processing, calls, and pointer feedback.
- Composer styling is neutral charcoal with a gray focus border and neutral send button. Keyboard focus remains visible; the input avoids a duplicate purple outline.
- Non-pointer errors are visible in the notch with dismiss controls rather than requiring full chat.
- Existing draft preservation, hover collapse, single Fenrir playback, playback captions, reduced motion, pointer receipts, and stale-lesson retirement remain in place. No broader autonomy or permissions were added.

## Verification

Watched regressions fail before fixing: docked guide movement was allowed; quiet mic input became zero; capture shutdown retained the previous level; inactive waveform displayed stale input energy.

- `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: 208 files, 976 tests passed.
- `swift test`: 90 tests passed.
- `swift build -c release --product ShuaCrew`: completed successfully.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web`: passed.
- `cd apps/web && ../../node_modules/.bin/vite build`: passed.
- `git diff --check`: passed.
- Existing localstorage, bundle-size, and Swift compiler warnings remain.

Signed build staged at `/private/tmp/shuacrew-notch-upgrade.fl0aaY/ShuaCrew.app`. Installed app passes `codesign --verify --deep --strict` and its executable matches staging. Served web index matches the built index. Backup: `~/.shuacrew/app-backups/ShuaCrew-before-notch-upgrade-20261003-024219.app`.

Restarted while idle. Closed the main window and visually observed the compact notch at the top of its canvas, with no stale lesson or error card. Physical Fn hold/release, real microphone smoothness, hover/focused-composer appearance, and on-screen guided-pointer movement still require user-observed testing; automated tests are not a substitute for those checks.

## User check

1. Hover the notch and type a short draft: charcoal input, gray focus border, no purple focus box. Leave and return: draft remains.
2. Hold Fn and speak quietly, then normally. The mic waveform should respond smoothly; release Fn to leave listening.
3. Ask to point out a visible control without clicking. Only the cursor/highlight should travel; the notch stays at the top.
4. Ask an unrelated question. No Netflix lesson should reappear.
