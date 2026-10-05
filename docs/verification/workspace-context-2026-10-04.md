# Notch workspace context — 2026-10-04

Implemented fresh application context on every assistant model turn, including follow-ups in existing conversations. Includes actual Learning courses and progress, selected lesson content, active Visual document/step and last reported app route. Read failures are distinguished from empty content; app context does not grant screen access. Live voice delegates ShuaCrew questions to the existing assistant executor for fresh context.

Added an existing-course lesson action. It validates the current course, reuses the lesson's existing run, selects the lesson across app windows and requests navigation to Learning. Navigation receipts say requested, not visually verified. Removed/invalid lessons fail without creating replacements.

Verification commands and observed output:

```text
node node_modules/vitest/vitest.mjs run apps/web/src/lib/workspace-context.test.ts apps/web/src/lib/buddy-map.test.ts apps/web/src/screens/spark/crew-actions.test.ts apps/web/src/lib/live-session.test.ts apps/gateway/src/live.test.ts
Test Files 5 passed (5)
Tests 52 passed (52)

node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0
node node_modules/typescript/bin/tsc --noEmit -p apps/gateway
exit 0

(cd apps/web && node node_modules/vite/bin/vite.js build)
✓ built in 773ms
```

Read-only runtime probe imported `workspaceContext` with `node --import tsx --input-type=module` and supplied fetches to the running localhost gateway:

```json
{"courses":2,"everyCourseIncluded":true,"visualContextIncluded":true,"milliseconds":3}
{"existingLessonFound":true,"selectedLessonIncluded":true,"lessonContentIncluded":true}
```

Limitations: the Mac UI tool failed with `Sky Computer Use native pipe startup failed`, including after reconnect. The built frontend is included in the signed app installed at 18:17:38 with Fn box selection. App reopen and visible end-to-end verification remain pending. Gateway reloaded after checking zero active runs and approvals (`launchctl kickstart -k gui/<uid>/com.shuacrew.gateway`); health probe returned HTTP 200. No commits, pushes, content resets or Sable restarts.

Microphone issue remains unresolved: user reports an intermittent separate toggle/sound. macOS Globe and Dictation shortcut changes did not establish the cause. ChatGPT is a suspected source, not confirmed; UI tool explicitly disallows inspecting ChatGPT. Pending isolation: quit only ShuaCrew and test Fn while other apps remain running.
