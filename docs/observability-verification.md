# Observability verification — 2026-09-24

## Delivered inside the Mac app

- **Observability:** current states of runs observed in a selected UTC window, recorded timeline, provider availability/limits, first-text and turn-duration averages with sample counts, and source conversation links.
- **Usage:** recorded input/output/cache tokens, daily chart plus accessible exact-value table, provider/venture breakdowns, shared 7/30-day/all-history filters, run drill-down and pagination. Search/sort are explicitly scoped to the visible page.
- **Settings → Developer:** gateway version/build/uptime/memory, event sequence, provider state, read-only audit-chain verification, refresh cadence and default usage window.

This is the existing AppKit/WKWebView application. No external dashboard, telemetry service, paid API dependency or new credential was added.

## Accounting and provenance

New Codex observations deduplicate repeated cumulative notifications, subtract a known cumulative baseline, do not add reasoning tokens twice, and distinguish cumulative deltas from last-observation fallback. Pre-turn resumed-thread counters do not become new usage. Counter resets use explicitly labelled fallback coverage. Unsupported context-occupancy inference from lifetime totals was removed. Historical events are not rewritten; legacy records remain prominently labelled as potentially affected by earlier accounting errors.

The installed Codex JSON schema was generated with `codex app-server generate-json-schema --out <temporary directory>` to verify actual field names. Official [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server) identifies thread usage notifications, and [OpenAI token-counting documentation](https://developers.openai.com/api/docs/guides/token-counting) explains that reported generated output includes non-visible tokens. App-server ordering and reset behavior are covered with controlled fixtures; a single real provider smoke test is not proof of all future protocol variants.

Context-only ACP updates with zero placeholders are excluded from measured consumption coverage. Missing per-run usage displays Unknown. Cache stays separate because provider semantics differ. Reported API cost is nullable and its record coverage is shown. Subscription billing, remaining quota and unreported reset times are not invented.

Provider filters select events observed under that provider. A run that later switched provider can therefore appear with a different **Current provider** in its row; this is intentional, not reassignment of the earlier usage. Operational cards show the current status of runs observed within the selected population, not historical point-in-time status.

## Tests and independent review

Fresh verification at 23:52 EDT:

| Command | Output |
| --- | --- |
| `pnpm test` | 42 files, **263 tests passed** |
| `pnpm typecheck` | Exit 0 |
| `pnpm --filter @shuacrew/web build` | Successful production build |
| `git diff --check` | Exit 0, no output |
| `swift test --package-path apps/mac` | 12 Swift Testing tests passed |

Warnings: existing CSS optimizer warning for `::highlight(find)`; Node's test-only local-storage-file warning from the server-render test environment. Neither was hidden as a passing assertion.

The independent read-only reviewer found three Important issues. Each received a failing-first regression and fix:

1. Provider status now refreshes on the same cadence as metrics; failures preserve evidence and show an explicit stale-provider warning.
2. Manual refresh failure preserves the last successful report; query changes create a separate polling lifetime so late responses cannot replace the new selection.
3. Context-only ACP observations no longer claim measured zero consumption.

Visual inspection also exposed an undefined accent CSS token that hid input bars. A failing CSS-token regression preceded the fix to the existing configurable `--amber` token. Final native screenshot showed the input bars and provider bars correctly.

## Installed evidence

Gateway restart was preceded by `/api/snapshot` returning no active/queued/planning/approval-waiting/paused runs. The native binary did not need replacement.

- Opened both new panes in `/Applications/ShuaCrew.app`; verified dark-theme rendering and scrolling.
- Selected Codex: input336,311/output273 from10 historical records. Restored All: input343,139/output31,267 from48 records, matching the endpoint and run-row sums at that moment.
- Opened Developer directly via its deep link. Gateway health was real, and Verify audit chain returned **Chain verified ·1788 events** with the check timestamp.
- Changed the default window from7 to30 days, opened Usage and observed **Last30 UTC days**. Restored7 days and observed the saved confirmation and restored Usage default. Refresh cadence remained15 seconds.
- Native Window → Move & Resize → Left produced a narrow presentation with two-column metric cards and vertically stacked chart/provider panels. Text and controls remained accessible. Return to Previous Size restored the original window; both presentations were visually inspected.
- Ran a public text-only Codex request in a dedicated verification room, asking only for “ready,” with no tools/files/delegation. Run `r_39d0b06e-0a96-4bfc-ae27-64a2182f6450` completed and produced one newly tagged usage record: input33,718/output5/cache11,008, cost null. UI automatically reflected one last-observation fallback alongside48 legacy records.
- Independently fetched each selected run's events and summed only window-matching usage facts. At head1802, all49 usage records summed to input376,857/output31,272/cache3,839,904, exactly matching the analytics endpoint (`reconciled: true`). No transcript bodies were printed by this check.
- An unknown venture filter returned zero runs, cost null and first-response `{meanMs:null,samples:0}`. Existing-data native venture/empty-state switching could not be demonstrated because no populated venture set was available; literal fixtures cover both.

## Deferred minor findings / limitations

- A limited but authenticated provider still has a green connection dot; the adjacent text states the limit/reset.
- Initial Developer diagnostic failure shows its error but retains loading copy beneath it.
- Run rows and timeline are capped, but all-history day/provider/venture bucket arrays do not have a hard count cap. Large-history performance remains unbenchmarked.
- Live failed-network UI checks remain incomplete; deterministic polling tests cover cadence, stale preservation and late-response cancellation.

Rulings: kept the existing dirty checkout because this slice depends on room integration; kept ignored execution ledgers because there are no authorized commits as a replacement record; did not modify old events or claim historical measurement accuracy; did not expand provider credentials/permissions. Cost of those choices: local-only work needs backup authorization, and historical/provider completeness remains visible rather than reconstructed speculatively.

Voice full-duplex behavior, phone approvals, signed distribution, onboarding and auto-update readiness are separate unfinished work. No claim that every user request or overall product release is complete. No commits or pushes performed.
