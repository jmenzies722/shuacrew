# Assistant response delay — 2026-10-05

## Observed cause

Both voice and typed requests route through the assistant Codex runtime. Gateway health and snapshot reads took 46ms and 17ms. The affected learning turn, r_0221b9e7 turn 2, began at 04:47:30Z, issued four CUA MCP calls, and was cancelled at 04:48:46Z. One click/state call ran for 50,771ms before returning a changed-app error. Fresh learning data was already supplied in the request. A later greeting completed in 5,631ms.

The gateway set RunSpec.lean for assistant conversations, but the Codex adapter did not apply that setting to its instructions/tools. The assistant inherited a coding/desktop tool path instead of answering or using Shua's own native action protocol.

## Fix

- Apply lean conversational base/developer instructions on both Codex thread start and resume.
- Disable the separate bundled computer-use plugins and coding shell tool for these conversation threads only. Preserve explicitly connected resource MCPs. Full Crew work retains its normal configuration.
- Restore instant-response brief messages in the expanded notch transcript; the preceding full-transcript change omitted them.
- No permissions, account config, content, or sign-ins were changed. No commit or push.

Configuration verified against installed Codex-generated ThreadStartParams/ThreadResumeParams and [official Codex configuration reference](https://developers.openai.com/codex/config-reference/) (thread config, plugin enablement, shell tool feature).

## Verification

```text
node node_modules/vitest/vitest.mjs run
Test Files 247 passed (247)
Tests 1150 passed (1150)

node node_modules/typescript/bin/tsc --noEmit -p packages/runtimes
node node_modules/typescript/bin/tsc --noEmit -p apps/gateway
node node_modules/typescript/bin/tsc --noEmit -p apps/web
git diff --check
All exit 0

# apps/web:
node node_modules/vite/bin/vite.js build
built in 909ms; exit 0
```

Read-only real Codex probe using a small representative lesson context:

```json
{"firstTextMs":3874,"totalMs":4545,"tools":[]}
```

Resumed-thread routing probe requesting the native Learning navigation block:

```json
{"firstTextMs":4984,"totalMs":5245,"tools":[],"text":"```do\n[{\"type\":\"go\",\"path\":\"/learn\"}]\n```"}
```

The second probe verifies protocol output, not actual navigation. No UI actions were executed by either probe. These two measurements are not a latency SLA or a physical microphone/playback test.

Deployment: checked zero active runs and zero approvals; restarted `gui/$(id -u)/com.shuacrew.gateway`. The frontend bundle is rebuilt. Existing app WebViews need quit/reopen to load the instant-reply display fix. Native binary unchanged.

CUA still reports `Sky Computer Use native pipe startup failed`, preventing physical UI verification/reopening here.

Fn remains: quick tap starts/stops live voice; hold starts rectangular screen selection. Holding Fn is not push-to-talk.
