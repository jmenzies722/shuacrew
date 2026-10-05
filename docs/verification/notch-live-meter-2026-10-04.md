# Notch meter, geometry and cursor — 2026-10-04

Implemented:
- Persistent five-bar collapsed instrument and larger hover instrument. Audio uses measured mic/voice levels; idle is static and work uses a separate travelling light. Reduced-motion support.
- Crew appearance storage changes propagate into the separate notch WebView. Native cursor receives refreshed theme colors. The black hardware housing remains black; accents and controls follow the selected theme.
- Native canvas previously allowed a 300px drop while web content allowed 340/420px. Raised native bounds to its accepted 500px drop, sharing constants with the message handler. This prevents cutting off the bottom radius.
- Hidden scrollbars, retained wheel/trackpad scrolling and bottom padding.
- Fn no longer opens the hover conversation on hold or tap in notch mode. Hover/click still opens chat.
- Capture sounds have native Fn ownership across both WebViews; existing capture nodes are stopped before a new Fn start cue. Local `spark-selftest.log` records Fn signals and web/native cue sources, without audio or transcript content. The user's reported second startup sound still needs a physical Fn retest; source is not proven by unit tests.
- Freshly acquired pointer bounds now reach the native renderer instead of becoming a generic circle. Controls receive fitted translucent highlights; text targets receive underlines. The separate native cursor travels to the target; its label supports requesting an explanation. Existing draw tools support arrows, paths, numbered guides and cards.
- Model instructions select marks by purpose and limit proactive marks to the active task with screen watching enabled. No new always-on observation or permission grants.

Research:
- [Apple focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection/): fitted focus effects and readable highlights.
- [Apple pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices/): subtle feedback rather than distraction.
- [Apple shared-screen remote control](https://support.apple.com/en-lamr/guide/facetime/fctmebd8481a/mac): user input takes priority. Shua uses its existing separate overlay; this does not create two independent OS input streams.

Verification commands and outputs:

```text
node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0, no diagnostics

node node_modules/vitest/vitest.mjs run apps/web/src/components/NotchEqualizer.test.tsx apps/web/src/components/NotchPresence.test.tsx apps/web/src/lib/notch-hover.test.ts apps/web/src/lib/notch-layout.test.ts apps/web/src/lib/spark-color.test.ts apps/web/src/lib/fn-capture.test.ts apps/web/src/lib/buddy.test.ts apps/web/src/lib/snap.test.ts apps/web/src/lib/pointer-feedback.test.ts
Test Files 9 passed (9)
Tests 82 passed (82)

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter 'fnOwns|cancellingFn|expandedNotch|notchIsland|fnGesture'
Test run with 5 tests passed

bash apps/mac/scripts/install.sh
Build complete! (36.61 sec)
installed /Applications/ShuaCrew.app

codesign --verify --deep --strict /Applications/ShuaCrew.app
exit 0

git diff --check
exit 0
```

Previous signed app retained at `~/.shuacrew/app-backups/ShuaCrew-20261004-174442.app`.
Sable and gateway sessions were not restarted. No commit or push.

Installed app's `notch:shot` probe ran at 17:44:55. Inspected hover screenshot: the complete rounded lower silhouette is visible (previous canvas clipped it), the scrollbar is absent, and meter/Watch me/mic controls follow the coral accent. Compact and expanded screenshots saved in `assets/notch-live-meter/`. This visual check does not establish real microphone levels, audible cue count, or end-to-end model target accuracy.

User verification after installation: held Fn and released; confirmed “One startup cue now.” This closes the reported duplicate startup-cue symptom on this Mac. Broad audio-route coverage and live model-driven cursor accuracy are not implied by that check.
