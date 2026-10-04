# Shua assistant verification — 2026-10-03

Implemented a flush black/monochrome notch control center, immediate native Fn preparation indicator, event-driven live task completion, focus/music/day-planning shortcuts, explicit MCP and Mac access controls, and background mission delegation to existing Codex sessions. No commits or pushes.

## Evidence

- `node node_modules/vitest/vitest.mjs run`: **228 files, 1050 tests passed**. Final log `/private/tmp/shua-assistant-final-tests.log`.
- `swift test --package-path apps/mac`: **96 tests in 13 suites passed**. Log `/private/tmp/shua-assistant-swift.log`.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web` (also `apps/gateway`, `packages/runtimes`): exit 0, no diagnostics.
- `swift build --package-path apps/mac -c release --product ShuaCrew`: build complete, 34.01 seconds. Existing concurrency/unsafe-pointer warnings remain.
- `node node_modules/vite/bin/vite.js build` from apps/web: built in 830ms; bundle-size warning remains.
- Production browser preview at `http://127.0.0.1:7420/buddy`: opened notch, visually inspected monochrome layout, inspected permissions and mission form. No mission submitted or permission changed. Screenshot: `assets/shua-flush-notch-2026-10-03.png`.
- Gateway was restarted only after active runs and pending approvals were both empty. `/api/runtimes` returned only `codex`, `authMode: subscription`, `signedIn: true`, `account: ChatGPT plan`, four models.
- Read-only reviewer rechecked cancellation during capture, secondary-display mismatch, truthful automatic-approval label, live-task error ownership, and recovery from failed presentation. No remaining findings from that bounded recheck.
- Installed test runners used directly: pnpm's automatic dependency install attempted an interactive purge, which was not performed.

## Screen/action guarantees added

Explicit capture request IDs prevent a previous response satisfying a new request. Native captures use new screenshots and matching app/window identity; slow or changed captures are rejected. Cached DOM is no longer merged into a new screenshot. Desktop steps reacquire click targets, check permission and cancellation after capture, and stop on ambiguous targets/display changes. Secondary-display act commands fail closed pending verified per-display identity. A desktop chain has a 12-step window. Observation age is visible independently of screen permission.

## Practical limits

Physical Fn-to-paint, end-to-end first-audio latency, and subscription realtime interruption have not been measured. No claim of sub-50ms hardware performance or instant model inference. No real desktop screenshots/actions were performed during this verification; protected work must remain untouched. Multi-app and music workflows need real permitted application trials. The production browser emitted an existing `/api/radio/command` 409 when mounting; audio playback was not tested.

Background delegation uses the existing persistent session system and a planning/checkpoint contract, not a new durable task graph or universal desktop scheduler. Existing user-enabled proactive behavior remains; no new unattended permission grants. Approval mode is persistent and visibly labeled as applying to all tasks. MCP opt-in changes apply to new turns; stop ongoing work before revoking. Unsupported MCP rich forms/device proof are declined, not fabricated.

## Installed delivery

`bash apps/mac/scripts/install.sh` exited 0: `Build complete! (47.99 sec)` and `installed /Applications/ShuaCrew.app`. Previous app retained at `~/.shuacrew/app-backups/ShuaCrew-20261003-170338.app`. Installer now retains all backups and uses the installed Vite runner without dependency installation. `codesign --verify --strict` exited 0. App relaunched with `open /Applications/ShuaCrew.app`; running binary verified under `/Applications/ShuaCrew.app/Contents/MacOS/ShuaCrew`. Gateway health remained available with no active runs or pending approvals.

## Compact Apple-style revision

User requested smaller, rounded, dynamic chat and Apple design APIs. The idle browser preview now measures **460 × 184 px**, previously 640 × approximately 502 px (real Mac width follows its physical camera housing). All four corners are 24 px. Composer appears first and remains sticky when tools expand. Shortcuts collapse behind an explicit button; expanded preview measured 460 × 359 px. Access retains its close button. Browser testing preserved draft text and INPUT focus after pointer leave. Escape dismisses the notch; collapse timers are canceled when dismissed.

AppKit `NSView` with Core Animation `cornerCurve = .continuous` now draws the installed notch backdrop. `NSAnimationContext` animates its measured dimensions with Reduce Motion respected. Existing `NSPanel` keyboard activation remains. Browser preview uses rounded CSS as a fallback; it does not prove native animation frame timing. Apple reference: https://developer.apple.com/documentation/appkit/nspanel/becomeskeyonlyifneeded

`DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift build --package-path apps/mac -c release --product ShuaCrew`: **Build complete! (26.21 sec)** after correcting an NSView Swift property spelling. Installer exited 0, retained previous app at `~/.shuacrew/app-backups/ShuaCrew-20261003-170851.app`, and signature verification reported **valid on disk / satisfies its Designated Requirement**. Installed app relaunched.

Focused notch/draft tests: **5 files, 21 passed**. Voice and hover tests after the follow-up fix: **5 files, 39 passed**. Web typecheck exit 0. Latest production web build: **648ms**, existing bundle-size warning.

Voice regression reproduced with a failing test: pressing Fn on an idle connected call unnecessarily injected a Stop text request and muted the next reply. The press handler now interrupts only speaking/working/announcement activity. A second test preserves immediate mute during audible interruption. Native voice mode no longer warms the unused local TTS service. Web Audio requests interactive latency. Existing transport remains subscription-backed; no reconnect workaround or billing change. These tests do not establish real microphone-to-speaker latency or flawless network/model response times.

Bottom-only corner correction: native `maskedCorners` now selects the two minimum-Y corners of the unflipped AppKit backdrop. CSS fallback uses `border-radius: 0 0 24px 24px`. Browser computed-style check returned topLeft/topRight **0px** and bottomLeft/bottomRight **24px**; screenshot visually inspected (`assets/shua-bottom-rounded-2026-10-03.png`).
