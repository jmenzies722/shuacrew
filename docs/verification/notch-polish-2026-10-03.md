# Quiet notch polish

Implemented the approved restrained design without changing voice providers or permissions:

- Passive lessons and completed work no longer trigger the resting preview. Active status is suppressed after hover exit until another deliberate interaction.
- Only one visible call waveform: compact in the resting ear, full in the live/expanded row. Removed decorative call aura and duplicate End-button bars.
- Open chat remains reachable during a call. End has a restrained red treatment; screen-watch controls retain state indication.
- Near-black surfaces, neutral borders, no spectrum outline in the notch, 280 ms non-overshooting transitions, and keyboard-focus outlines. System and app reduced-motion settings disable shape transitions.
- Limit quick suggestions to two and resting reply height to three lines. Full content remains in chat.
- Diagram nodes and connectors are neutral, with a single lavender highlight for the active path and no animated node lift.

Verification:

- Red: `vitest run apps/web/src/lib/notch-presentation.test.ts --maxWorkers=4` failed for the missing policy module before implementation.
- Green: focused notch/architecture/waveform suite — 5 files, 14 tests passed.
- `node node_modules/vitest/vitest.mjs run apps/web/src --maxWorkers=4` — 127 files, 520 tests passed.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web` — passed.
- Vite build — succeeded; chunk-size warning remains. `git diff --check` — passed.
- Gateway HTML matches dist index via curl/cmp. Restarted the idle app to load this build.
- Native screenshot confirms compact call layout, one visible waveform, neutral border, Open chat and End controls. Accessibility confirmed Listening. Ended test call and verified Talk returned to off.
- Physical Fn and a full native pointer hover-exit cycle remain unverified by automation. Hover timing, cancellation, and drag deferral have unit coverage.

No commit or push performed.
