# Visual teaching verification — 2026-09-27

## Delivered increment

Native Mac workspace `/teach` and the floating/embedded companion share one gateway-owned lesson, revision, selected objects and explanation step. Vector diagrams support measured/wrapped labels, layered graph layout, folded long chains, labeled orthogonal connectors, groups, pan/zoom/fit, label/position editing, protected user edits, undo/redo, persistent saved sessions and JSON import/export.

The companion has an explicit provider/model picker. A pinned unavailable model reports a reason instead of silently switching providers. Visual teaching currently uses Claude; ordinary companion chat retains Claude, Codex and local choices.

Guided practice retains the current goal after mistakes. Explicit Start enables debounced click observations on one chosen display. A fresh screenshot and abstract click coordinates go to the selected Claude model. Separate validated assessments return verified/retry/uncertain, evidence, feedback and optional capture-bound visual hints. A hit inside a rectangle is not treated as success. New attempts cancel superseded checks; pause/cancellation/revision checks reject late results. Restart preserves the lesson and feedback, but observing resumes only after an explicit Start. No typed text is recorded by this observer. Checks have model latency, not instantaneous local verification.

## Actual capabilities inspected

- `@anthropic-ai/claude-agent-sdk` **0.3.281**, installed `sdk.d.ts`: `query`, `outputFormat` JSON schema, final `structured_output`, typed image input, `tools: []`, abort controller. The new adapter uses existing Claude Code subscription authentication and `agentEnv`; no API key or new authentication flow.
- Native structured output needed Draft 7 JSON Schema. The initial Draft 2020-12 integration attempt failed; the corrected Draft 7 run passed.
- Installed `codex app-server generate-json-schema --out /private/tmp/shua-teaching-codex-schema` confirmed `TurnStartParams.outputSchema` and typed image input. A tool-free Codex teaching adapter is **not wired** in this increment. The UI says so explicitly.
- No separate image-generation or speech API was assumed or added. Teaching narration is text.
- Native ScreenCaptureKit captures; PDFKit extracts text from PDFs (up to 2 MB, 200 pages, 100,000 characters). PNG/JPEG/WebP and text/code input are supported. Scanned PDFs need page images or pasted text. Other document formats need export to text/PDF.

## Automated checks

Working directory: `/Users/admin/Developer/projects/shuacrew`.

```text
$ pnpm test
Test Files  126 passed (126)
     Tests  556 passed (556)
exit 0

$ pnpm typecheck
$ pnpm -r --parallel exec tsc --noEmit -p .
exit 0

$ pnpm --filter @shuacrew/web build
✓ built in 1.12s
exit 0

$ swift test -c release --package-path apps/mac
Build complete! (14.03s)
Executed 3 tests, with 0 failures (0 unexpected)
✔ Test run with 23 tests in 0 suites passed
exit 0

$ git diff --check
(no output)
exit 0
```

Coverage includes malformed/incomplete output, bounded repair, atomic application, dangling references, user-edit protection, stale revisions, cancellation, persistence, monotonic undo/redo, wrong-attempt persistence, mismatched events/displays, exact capture-bound hints, long labels, crowded graphs, chain folding, crop/resize/Retina transforms and negative display origins.

Build warnings: existing large web chunks (>600 kB); existing Swift synchronous API warning in Buddy.swift. Tests also emit a Node localStorage option warning. No failing checks.

## Real subscription integration checks

These are explicit integration scripts; they are not mocked and not part of the unit suite.

```text
$ pnpm exec tsx scripts/verify-teaching-live.ts
provider: Claude Agent SDK / existing subscription
firstRevision: 1
followupRevision: 2
originalObjects: 7
finalObjects: 8
preservedIds: true
exit 0
```

Artifact: `/var/folders/y0/kbg6hmc949vfgwftcptn_3hw0000gn/T/shua-teaching-live-7EY9A3/verified.json`.
The model-generated first step contained a duplicated `factorial(2)` phrase. Schema validation checks structure and provenance, not universal factual correctness; model explanations still require judgment. The fixture was used to verify rendering and identity preservation, not presented as proof of factual perfection.

```text
$ pnpm exec tsx scripts/verify-teaching-vision.ts /private/tmp/shua-teaching-vision-fixture.jpg
provider: Claude Agent SDK / existing subscription
input: JPEG test fixture (not live screen)
visionResult: verified
sameStep: true
guidanceActive: true
exit 0
```

The controlled JPEG shows “Upload complete”, `report.pdf • 100%` and a filled progress bar. The actual model cited these visible indicators. Artifact: `/var/folders/y0/kbg6hmc949vfgwftcptn_3hw0000gn/T/shua-teaching-vision-IkLKXD`.

## Native manual checks

Using the signed isolated Mac preview and native UI automation, not Safari:

- Main app and embedded companion showed the same saved lesson, selected object and revision 6. Next in the companion advanced both to step 3/3 and revision 7.
- Edited a label, observed wrapping and saved revision changes; Undo restored the previous label and Redo restored the edit.
- Pan, zoom and fit inspected with short labels, long labels and a controlled nine-node pipeline fixture. Long chains now fold into three rows instead of a tiny horizontal strip; labels, connector captions and group boundary were visually inspected.
- Light Daylight and dark Pristine appearances inspected. Fixed a companion CSS variable cycle that made highlights black; removed the duplicate chat composer from teaching mode and corrected cramped header buttons.
- Actual floating `/buddy` window loaded the shared lesson and selected model. Inspection exposed a missing native-shell marker; it was added to the native companion bridge so native teaching controls are available there too.
- Screen-access failure returned an explicit error and left guidance paused with the lesson intact.

## Untested or limited

- The isolated preview had no Screen Recording permission. Live desktop capture → click → model assessment → overlay rendering was **not manually verified**. No OS permission was granted during testing. Native overlay rendering, Escape/dismiss under live guidance, screen-change invalidation and collapsed practice feedback need a live permission-enabled check.
- Only the built-in Retina display was available. Multi-display, hot-plug and rotated-display behavior are covered only by geometry tests/code review, not physical hardware checks.
- Native PDF picker/extraction and export acknowledgement are implemented but not manually exercised with every supported file type.
- Complex graph routing uses deterministic heuristics, not globally optimal crossing minimization. Dense diagrams can still require zoom/pan or smaller explanation steps.

## Activation

Installed `/Applications/ShuaCrew.app`, bundle `dev.shuacrew.mac`, using the existing Apple Development identity. Prior app retained at `/Users/admin/.shuacrew/app-backups/ShuaCrew-before-teaching-20260927-210135.app`.

```text
$ codesign --verify --deep --strict /Applications/ShuaCrew.app
(no output)
exit 0

$ shasum -a 256 /Applications/ShuaCrew.app/Contents/MacOS/ShuaCrew /private/tmp/ShuaCrew-teaching-release/ShuaCrew.app/Contents/MacOS/ShuaCrew
33f8b147c87dbc5bc035304581e63a497745ab69d684af6d5b02e310ecfb06a4  /Applications/ShuaCrew.app/Contents/MacOS/ShuaCrew
33f8b147c87dbc5bc035304581e63a497745ab69d684af6d5b02e310ecfb06a4  /private/tmp/ShuaCrew-teaching-release/ShuaCrew.app/Contents/MacOS/ShuaCrew

$ launchctl kill SIGTERM gui/501/com.shuacrew.gateway
exit 0

$ curl -fsS http://127.0.0.1:7420/api/teaching/check
{"active":"teach_2d45f456-e1da-4ec0-99ce-edeca5164d8c","revision":5,"busy":false}
```

The gateway restarted using the user's earlier authorization. One waiting session was requeued; no approval was accepted or denied. The installed app was reopened and `/teach` loaded successfully. No commits or pushes.

## Installed native end-to-end verification

In `/Applications/ShuaCrew.app`, entered a recursion question and pressed Explain using Auto. The live gateway and actual SDK produced 8 vector objects and 3 explanation steps. After step navigation reached revision 4, explicitly selected Haiku and asked for a concise overview and one additional base-case callout while preserving IDs. The response was rendered and saved at revision 5.

```text
busy: false
revision: 5
originalObjects: 8
objects: 9
preservedIds: true
literalNewlines: 0
```

Verified by comparing `/private/tmp/shua-installed-first-lesson.json` with `/private/tmp/shua-installed-followup.json` and reading the native accessibility tree. The first installed response contained literal escaped paragraph breaks; the real follow-up corrected those. Auto was restored in the model picker afterward. The app was reopened once more to load the final assets, without another gateway restart. The sample lesson remains saved for review.

The older companion chat walkthrough also retains its current step while checking an attempt or after a capture/model error. Its button now says **Check result**, and the follow-up prompt explicitly says success is unverified and asks for visible evidence before advancing. This does not retrofit the older guide into the new shared document format; automatic checking of clicks away from the highlighted target is provided by the new explicit guided-practice mode.

The isolated preview app was closed and its port-7442 gateway stopped after testing. No production approval was answered.
