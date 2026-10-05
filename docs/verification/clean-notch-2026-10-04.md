# Clean notch — installed 2026-10-04

One primary Watch me button starts foreground-app recording. It becomes Finish recording; stopping opens the existing review. Unsaved review remains reachable without starting a new capture. Secondary controls are collapsed under More. The separate screen-watch toggle and idle starter suggestions no longer occupy the primary notch. Blue/violet lighting reflects activity, with reduced-motion support. Top corners remain square and bottom corners remain 28px.

## Verification

`node node_modules/vitest/vitest.mjs run apps/web/src/components/NotchTeachingBar.test.tsx apps/web/src/components/NotchPresence.test.tsx apps/web/src/lib/demonstration-intent.test.ts apps/web/src/lib/workflow-memory.test.ts`

```text
Test Files 4 passed (4)
Tests 10 passed (10)
```

`node node_modules/typescript/bin/tsc --noEmit -p apps/web`: exit 0.

`DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter Workflow`

```text
Test run with 12 tests in 2 suites passed
```

`bash apps/mac/scripts/install.sh`

```text
Build complete! (6.96 sec)
installed /Applications/ShuaCrew.app
```

`codesign --verify --deep --strict /Applications/ShuaCrew.app`: exit 0.

Installed `SHUACREW_SPARK_SELFTEST=notch:shot`: fresh expanded screenshot visually inspected, [image](assets/clean-notch/expanded.png). Both expanded surfaces report square tops and 28px bottom clipping.

Installed `SHUACREW_SPARK_SELFTEST=workflowterminalprobe`, with only disposable SableInputFixture open:

```json
{"followingForeground":true,"keyboardOnly":true,"ok":true,"recordedSteps":["input"],"verifiedRuns":2,"replayMilliseconds":[220.89004516601562,135.03003120422363]}
```

The fixture uses the updated Sable terminal component and /bin/cat, not a real shell session. Exact output observed: `demo test one cafe`. Original Sable PID 8596 remains running; its staged accessibility update still awaits a future restart. These checks do not guarantee arbitrary app/task replay or benchmark model improvement. The full Crew Studio redesign remains pending.
