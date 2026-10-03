# Cursor and home-flow refinement — 2026-09-30

Approved scope: calmer cursor, distinct voice states, screen-safe captions, reduced motion, and a compact home flow for starting/resuming work.

## Delivered

- Cursor: smaller idle presence; subtle opacity breathing instead of floating; faster, smooth following; restrained flight scale/tail; no landing or reappearance bounce.
- Listening uses five voice bars, thinking a partial ring, speaking a full ring plus a gentle pulse. macOS Reduce Motion removes decorative travel, spinning, breathing, spring effects and progressive caption reveal. The system preference is observed without changing it.
- Caption placement clamps to the visible display rectangle, including offset displays and edge targets. The full companion footprint is kept visible when the pointer enters menu-bar/dock areas.
- Sessions home: compact left-aligned heading, four short starters, recent work links, then the daily briefing. Removed the duplicate companion heading on this home surface; global Shua access remains.
- Recent work respects project scope, excludes archived/internal/child sessions, and sorts newest first. Links reopen existing sessions. Starter buttons fill a draft without sending it.
- Top-bar provider wording says “ready to retry” for eligible retries rather than claiming a request is running.

## Verification

```text
pnpm test
Test Files 155 passed (155)
Tests      760 passed (760)

pnpm typecheck
$ pnpm -r --parallel exec tsc --noEmit -p .
exit 0

pnpm --filter @shuacrew/web build
exit 0

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test
Test run with 76 tests in 7 suites passed

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift build -c release --product ShuaCrew
Build complete! (24.38 sec)

codesign --verify --strict /Applications/ShuaCrew.app
(no output; exit 0)

git diff --check
(no output; exit 0)
```

Regression checks were first run failing: cursor containment outside visible screen bounds, caption geometry (missing helper), and recent-session selection. All pass with the implementation.

The four PNGs here are offscreen renders of the production cursor layers on white and dark backgrounds, inspected individually. They demonstrate appearance, not live microphone or motion behavior.

Live installed-app checks:

1. Home displays “What’s next?” with starter actions and “Pick up where you left off.”
2. “Review changes” fills the draft without sending; the verification draft was then cleared.
3. A recent-session link opens its existing conversation without creating a new run.
4. After installing/relaunching, the prior conversation was preserved; final verification left the app on the redesigned Sessions home.
5. A previously generated entry file reappeared on disk during the session. Rebuilt the current source and verified the served entry `/assets/index-CeuMhZXZ.js` contains the new home. Refreshed the installed app and visually confirmed the new layout again.

## Installation

Installed native build `20260930183359` at `/Applications/ShuaCrew.app`, signed by the same development team as the prior install. Signature verified before and after installation. The gateway stayed running (health `ok: true`).

Previous app retained at:
`/Users/admin/.shuacrew/app-backups/ShuaCrew-before-design-20260930-183417.app`

No older app backups were removed. This design pass was not committed or pushed by this session. The earlier voice-control changes became commit `a8da01f` during the work through another process; those changes were preserved.

Limits: no claim of live microphone/acoustic testing, physical multi-monitor testing, or full-app release certification. Existing build output includes large web-chunk and native compiler warnings. No new paid services or permissions were introduced.
