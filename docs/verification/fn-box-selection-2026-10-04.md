# Fn box selection — 2026-10-04

Approved interaction: hold Fn to select a box; use the notch mic to speak.

Implemented:
- Native Fn hold opens the existing frozen-screen region selector. Fn taps and release do nothing. No Fn audio warmup, microphone request, capture cue or freehand drawing remains in that handler.
- Drag a rectangle and release the mouse to read the crop automatically. Escape cancels. Selection panels intercept clicks so selection cannot click the application underneath.
- Cropped image only is uploaded, with an explicit no-screen-action coordinate contract. Preview with dimensions appears in the notch and chat; Clear removes it. An active Talk session ends when a crop is accepted, so analysis is routed to the image-capable assistant rather than the voice-only text queue.
- Fn labels updated in Settings and Guide. Microphone remains on the notch Talk control.
- Fixed a separately reproduced microphone-startup race: rapid release/repress during device acquisition issued two getUserMedia requests. Pending acquisition is now shared, and late streams are discarded if capture is no longer wanted.

Verification:

```text
node node_modules/vitest/vitest.mjs run apps/web/src/screens/spark/bridge.test.ts apps/web/src/lib/live-voice.test.ts apps/web/src/lib/live-session.test.ts apps/web/src/lib/workspace-context.test.ts apps/web/src/lib/buddy-map.test.ts apps/web/src/screens/spark/crew-actions.test.ts
Test Files 6 passed (6)
Tests 57 passed (57)

node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter RegionBoxTests
Test run with 2 tests in 1 suite passed

bash apps/mac/scripts/install.sh
Web build: built in 869ms
Native release: Build complete! (37.57 sec)
Initial install stopped: Quit ShuaCrew before installing. Agents keep running in the gateway.

git diff --check
exit 0
```

The new microphone-race regression failed before the fix (`expected getUserMedia 1 time, got 2`) and passed after. Crop tests cover request correlation, crop bytes/dimensions, cancellation, reversed drags and Retina coordinate conversion.

Installed successfully at 18:17:38. `codesign --verify --strict /Applications/ShuaCrew.app` returned exit 0. Previous app retained at `/Users/admin/.shuacrew/app-backups/ShuaCrew-20261004-181738.app`. Pending: physical Fn/drag verification and audible verification. CUA cannot reconnect (`Sky Computer Use native pipe startup failed`). User reports the unwanted microphone stops when Shua is closed; the exact audible source is not independently confirmed.

## Follow-up: tap for live voice and spoken crop answers

User revised the mapping: a quick Fn tap toggles the same voice control as the notch Talk button; holding Fn still selects a box. Neither initial key-down nor release after a hold toggles voice. The tap cutoff now matches the hold threshold, so a delayed timer cannot misclassify a selection hold as a voice tap.

Crop answers previously flowed to the older SpeechQueue, while the native/live voice path bypassed it. Completed crop analysis now queues a grounded readout through the live connection in silent-input mode. It waits for connection readiness, does not re-run the analysis, and does not open a microphone. Cancel clears a readout pending readiness. The visible crop/result remain available. Text readout is capped at 4,000 characters by the existing native command transport.

```text
node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-session.test.ts apps/web/src/lib/live-voice.test.ts apps/web/src/screens/spark/bridge.test.ts
Test Files 3 passed (3)
Tests 40 passed (40)

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter 'quickCleanPressIsATap|holdingStartsAfterTheThresholdAndEndsOnRelease|fnUsedAsAModifierNeverFires|delayedHoldTimerCannotTurnASelectionHoldIntoVoiceTap'
Test run with 4 tests passed

node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0

git diff --check
exit 0
```

Physical voice playback remains unverified because the Mac UI tool is unavailable.

Combined update installed at 18:21:38. Native release built in 33.69 seconds; installer exited 0; `codesign --verify --strict /Applications/ShuaCrew.app` exited 0. Backup: `/Users/admin/.shuacrew/app-backups/ShuaCrew-20261004-182138.app`. App remains closed for user launch.
