# Notch and chat usability closeout

## Scope

User explicitly narrowed this pass to notch design and usability. No permissions, policy rules, autonomous task routing, or native executable were changed for this release. The unfinished verified-Mac-task source remains unintegrated; its acceptance plan is paused.

## Changes

- Expanded notch has a dedicated measured voice waveform, a readable Listening/Speaking label, and a release-Fn instruction during push-to-talk.
- The listening panel disappears during preparation or idle instead of showing stale recording activity.
- Compact notch uses the correct call microphone/playback source and no longer renders a duplicate call waveform.
- Chat header uses real audio levels instead of a fixed speaking animation. End-call control uses a clear stop icon, not an artificial microphone floor.
- Chat composer now uses the same neutral focus treatment as the notch instead of the purple glow. Keyboard focus remains visible.
- Expanded notch rows keep intrinsic height; overflow has a subtle scrollbar rather than squeezing content or concealing that more content exists.
- Existing hover collapse, draft preservation, bounded height, anchored placement, Fn capture, captions, and reduced-motion behavior remain intact.

## Commands and outputs

`node node_modules/vitest/vitest.mjs run --maxWorkers=4`

```text
Test Files  214 passed (214)
Tests       994 passed (994)
```

`node node_modules/typescript/bin/tsc --noEmit -p apps/web`

```text
exit 0, no diagnostics
```

`cd apps/web && ../../node_modules/.bin/vite build`

```text
✓ built in 2.37s
```

Existing large-chunk and localstorage-file warnings remain. Full test log: `/private/tmp/shuacrew-notch-usability-tests.log`. Build log: `/private/tmp/shuacrew-notch-usability-build.log`.

`cd apps/mac && swift test --filter CompanionPlacementTests`

```text
Test run with 12 tests in 0 suites passed
```

`git diff --check`: exit 0.

`cmp apps/web/dist/index.html /private/tmp/shuacrew-usability-served.html` after fetching the local gateway root: exit 0; served index matches the build.

`codesign --verify --deep --strict /Applications/ShuaCrew.app`: exit 0. Existing installed native app was retained, not rebuilt with unfinished autonomy code.

Web rollback copy: `/private/tmp/shuacrew-web-before-usability.APUGQx/dist`.

## UI checks and limits

1. Before change: native app screenshot showed a prominent purple focus glow around the companion composer.
2. After build and idle restart: native app screenshot showed the focused composer with a neutral gray border; Talk was off before restart.
3. After closing main window: native screenshot showed the compact notch at the top of its canvas, with no old diagram or expanded chat.
4. Expanded-notch interaction could not be exercised through the available native automation surface: attempted interaction returned `noWindowsAvailable`. In-app browser and Chrome automation surfaces were unavailable. These are tooling limitations, not evidence that hover works or fails.

Component tests verify measured waveform rendering, silence, and listening-to-processing transitions. Existing hover/draft/Fn tests passed in the full suite. Real microphone smoothness, physical Fn release, keyboard navigation in the expanded notch, and leave/return draft preservation still require a user check. This is not a claim of full visual or accessibility acceptance.

## Final user check

Hover and type a draft; leave and return (the draft should remain). Hold Fn and speak quietly then normally; release Fn (Listening must end). Say “Explain a database index in two sentences.” Playback and its waveform should move together. Leave the notch: it should tuck away without moving with the cursor. Escape should cancel the current request.
