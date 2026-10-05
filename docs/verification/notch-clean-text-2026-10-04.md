# Clean text and Fn lifecycle — 2026-10-04

The notch reading area now contains conversation text. Working/listening state stays in the hardware-height header. Removed the duplicate presence header, listening card, processing card, duplicate header status, and tool-step text from the compact Live view. Non-blocking pointer feedback remains in More; errors, permissions and pending action controls remain visible. Transcript appears ahead of utility controls. The equalizer, theme colors, rounded bottom and hidden scrollbar remain.

Fn lifecycle changes:
- Initial key-down does not open a Classic mic or Live call, alter Classic mic mode, stop speech, or disable hands-free voice. Capture begins only on an accepted hold.
- Live readiness callbacks are guarded by the current hold generation. Release/cancel invalidates a pending start.
- Repeated taps cannot create a call; explicit Talk retains its ownership.
- macOS Keyboard → Press Globe key to changed through System Settings from Show Emoji & Symbols to Do Nothing. Dictation remains enabled with its existing microphone-key shortcut.
- Previous cue log showed one native listen event for each recorded hold, but this alone does not identify the second sound the user hears. Audible rapid-press verification is pending.

Verification:

```text
node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0

node node_modules/vitest/vitest.mjs run apps/web/src/lib/fn-capture.test.ts apps/web/src/lib/live-session.test.ts apps/web/src/lib/live-voice.test.ts apps/web/src/lib/handsfree.test.ts apps/web/src/lib/mic-recovery.test.ts apps/web/src/lib/live-transcript.test.ts apps/web/src/lib/notch-presentation.test.ts apps/web/src/lib/notch-activity.test.ts apps/web/src/lib/notch-hover.test.ts
Test Files 9 passed (9)
Tests 70 passed (70)

(cd apps/web && node node_modules/vite/bin/vite.js build)
✓ built in 907ms

defaults read com.apple.HIToolbox AppleFnUsageType
0

git diff --check
exit 0
```

Shua reopened with the built frontend. Native `notch:shot` probe captured at 17:53:12: inspected the cleaner text area, intact rounded lower corners, and no scrollbar. Screenshot: `assets/notch-clean-text/hover.png`. No Sable/gateway restart; no commits or pushes.

Follow-up: the user reports the remaining on/off tones are not Shua's sound. macOS Dictation's separate shortcut was still `Press microphone key`. Changed through System Settings to `Control–Option–Command–D`; the UI verified `⌃⌥⌘D`. Dictation itself stays on. Globe remains Do Nothing. This removes both observed macOS key assignments from Fn/microphone-key use; physical confirmation is still pending. Also refined notch-mode taps to leave an already-open conversation unchanged, preventing a tap from closing an open-mic UI. Frontend rebuilt and Shua reopened normally (without the screenshot probe environment).
