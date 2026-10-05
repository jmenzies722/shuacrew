# Notch corners and Codex routing — 2026-10-04

Installed `/Applications/ShuaCrew.app`; preserved Sable PID 8596 and all chat history.

- Both hover expansion and full chat: square top corners, 28px bottom corners, explicit clipping for composited children. Native backdrop matches.
- Production runtime registration now permits only Codex (mock only in demo). Old Claude enable settings cannot register Claude. Companion label corrected.
- Existing Claude error messages remain in history; they are previous responses, not new routing results.

## Verification

`node node_modules/vitest/vitest.mjs run apps/gateway/src/openai-policy.test.ts apps/web/src/components/AssistantDeck.test.tsx apps/web/src/components/NotchPresence.test.tsx`

```text
Test Files 3 passed (3)
Tests 6 passed (6)
```

Both `node node_modules/typescript/bin/tsc --noEmit -p apps/web` and `-p apps/gateway`: exit 0.

`bash apps/mac/scripts/install.sh`

```text
Build complete! (30.60 sec)
installed /Applications/ShuaCrew.app
```

`codesign --verify --deep --strict /Applications/ShuaCrew.app`: exit 0.

Live `GET /api/runtimes`: `["codex"]`. Live `/api/intelligence/select`: runtime `codex`, model `gpt-reserve`.
Real `/api/runs` request r_d1885ee7 completed: runtime codex, status done, ticker SHUA_CODEX_OK, toolCalls 0.

`open --env SHUACREW_SPARK_SELFTEST=notch:shot /Applications/ShuaCrew.app`

`cat /private/tmp/shua-notch-corners.json`: both nook and chat topLeft/topRight `0px`, bottomLeft/bottomRight `28px`, clip `inset(0px round 0px 0px 28px 28px)`, nativeBottomRadius 28.
Fresh screenshots visually inspected: `~/.shuacrew/selftest-notch-open.png` and `selftest-notch-chat.png`; both show rounded bottoms.

This verifies production agent routing and notch geometry, not every separate helper feature or voice workflow. The approved Crew Studio concept remains a design, not an implemented rebuild.
