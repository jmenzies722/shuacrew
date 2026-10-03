# Night checkpoint: notch Concept Studio

## Scope completed in source

- Architecture visual blocks validate unique component IDs, real edge references, explanations and quiz answer bounds.
- Compact notch preview exposes a title, takeaway and component names without automatically taking keyboard focus.
- Expanded Concept Studio presents dimensional component tiles, explicit connections, overview, user-paced steps, a concrete example and an optional check.
- Component emphasis follows names in actual speech captions; selected lesson steps supply focus when no matching caption is playing. Steps never advance on a guessed timer.
- Replay is explicit, blocked during a user turn, and respects voice settings. Lessons do not expire mid-reading or get replaced by a delayed standalone quiz.
- Pin saves the current lesson on this Mac and opens Visual teaching in the main window. The pin survives reload; another pin replaces that slot.
- Notch aura reads actual playback/microphone energy, smooths attack/release and stops polling when inactive. Thinking has a separate subtle animation. Reduced-motion styles suppress movement.
- Automatic prompt routing now requests frontier for architecture, root-cause/race-condition work, proofs and build-and-test tasks; teaching requests use balanced and simple controls remain fast. Reasoning effort follows that tier on both new and resumed turns. Explicit model choices, provider order, routing rules and availability checks remain authoritative. This is routing policy, not a benchmark proving any model is universally best.

## Verification

New lesson tests first failed because the new modules were absent; prompt-routing cases first failed with fast/balanced instead of frontier and teaching fell into fast. After implementation:

| Command | Observed output |
| --- | --- |
| `pnpm exec vitest run` | `173 passed` files, `845 passed` tests; exit 0 |
| `pnpm --filter @shuacrew/web exec tsc --noEmit -p .` | No diagnostics; exit 0 |
| `pnpm --filter @shuacrew/web build` | `built in 1.07s`; exit 0 |
| `git diff --check` | No output; exit 0 |

Logs: `/private/tmp/shuacrew-notch-final-tests.log`, `/private/tmp/shuacrew-notch-final-build.log`. Existing build warnings include large chunks. The earlier whole-workspace typecheck limitation in `packages/core/src/session-title.test.ts` is not addressed by this change.

A temporary isolated interactive preview was prepared, but Computer Use reported `Browser is not available: iab` and an empty browser inventory. The preview files were removed and its local server stopped. The Mac app was not opened or driven with synthetic keystrokes. Consequently screenshot inspection, live controls, physical notch alignment, actual acoustic playback and provider response quality are NOT verified by this checkpoint. Component markup and routing/parser behavior are covered by automated tests; they are not substitutes for those manual checks.

## Resume here

1. Reopen the installed Mac app to load the rebuilt web interface; no native source changed in this checkpoint.
2. Ask “Explain a cache-aside architecture with a Concept Studio card.” Verify compact preview, expand, next/previous, replay, optional quiz and pin in Visual teaching.
3. Speak with AirPods and built-in audio; check energy response, quiet gaps and reduced-motion behavior. Confirm normal typing remains normal.
4. Check automatic model selection on a simple command versus an architecture/build-and-test prompt; explicit selected models must remain respected.

Broader proactive screen coaching and complex autonomous missions are deferred. No commit, push, app reinstall or gateway restart was performed in this checkpoint. Existing unrelated working-tree changes were preserved.
