# Learning and Visual Teaching model repair — 2026-10-04

## Causes and changes

Learning hard-coded Claude Haiku/Sonnet even though the gateway's enabled runtime is Codex. Visual Teaching also defaulted to Claude in UI, requests and guided-practice setup. Learning now launches through Codex's current catalogue with no legacy Claude model IDs. Visual Teaching and practice accept/default to Codex, the provider toggle is removed, and the existing model picker controls the requested Codex model.

A real visual request then exposed a separate server rejection: `schema.properties.operations.items.oneOf is not permitted when strict is true`. Changed the mutually exclusive operation union to produce supported `anyOf`; distinct literal operation tags and local validation are preserved. Removed the stale suggestion to switch to Claude when Codex is rate-limited.

## Evidence

Regression tests reproduced provider defaults and unsupported schema before their fixes. Final commands:

```text
node node_modules/vitest/vitest.mjs run
232 files, 1068 tests passed; exit 0
node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0, no diagnostics
node node_modules/typescript/bin/tsc --noEmit -p apps/gateway
exit 0, no diagnostics
sh scripts/service.sh restart
Restarted.
codesign --verify --deep --strict --verbose=2 /Applications/ShuaCrew.app
valid on disk; satisfies its Designated Requirement; exit 0
```

Stopped the stalled queued Claude Learning request `r_9baea122`, then retried the same Analyze mode through the fixed route. [Receipt](assets/learning-model-2026-10-04.json): `r_0629bcfa`, runtime Codex, real agent response, done.

A live visual request using `gpt-5.6-terra` returned a saved queue lesson: revision 1, 7 objects, 2 steps. [Receipt](assets/visual-teaching-2026-10-04.json). Native UI read confirmed title “Queue: first in, first out”, saved revision 1, explanatory answer, labeled Ana/Ben/Chen rectangles, step 1/2, and Codex subscription controls. A next-step click was rejected because the user changed the app; that interaction is not counted as verified.

This verifies model inference, lesson application and initial rendering. Guided screen-practice capture/checking was not exercised in this pass. User activity continued during final verification; the newly running Learning course was left untouched. No commit or push.
