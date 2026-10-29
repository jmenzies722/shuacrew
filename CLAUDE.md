# ShuaCrew

ShuaCrew is the owner's private workspace: a crew of AI agents (Claude, Codex) with Shua on the Mac (notch, cursor,
voice) that builds, tests, ships and runs the owner's products and ventures. It is not a product for other people.

**NetShua is the product** (decided 2026-10-29; ~/Developer/projects/netshua-chromium, docs/adr/0012). Anything a
customer would use — the assistant, voice, money back and savings, study and the job hunt, missions, interactive pages —
is built in NetShua, not here. ShuaCrew's job for NetShua:
- the nightly build and check: schedules `netshua-nightly-build` (2:00, NetShua's scripts/nightly.sh) and
  `netshua-nightly-report` (7:30, scripts/nightly-report.sh; on a failure a crew agent diagnoses — no code changes);
- triaging testers' feedback into fixes, launch and marketing work, and income per venture;
- using the real browser through NetShua's MCP connector (off until NetShua → Settings → "Let other AIs use NetShua").

Don't remove existing ShuaCrew features for this; just don't grow customer-facing ones here.

Working here: `pnpm typecheck` per package (vite build and vitest don't typecheck), `npx vitest run` for tests. The live
gateway is launchd `com.shuacrew.gateway`, running this checkout's main and serving apps/web/dist (rebuild the web app
after UI changes; restart the gateway for gateway code). Test against a scratch gateway (copied data, SHUACREW_DEMO=1,
another port), never the live one.
