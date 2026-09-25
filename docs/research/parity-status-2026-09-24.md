# ShuaCrew / Kiro Crew: implementation status

Checked 2026-09-24. This is a code-backed status report, not a claim of full parity or superiority.

## Comparison baseline

The latest published section of the [official changelog](https://github.com/kirodotdev/KiroCrew/blob/main/CHANGELOG.md)
is **0.7.0, dated 2026-09-15**. It includes live configuration changes, chat customization,
desktop completion alerts, durable orchestration queues, additional preview backends,
and wider integrations. This supersedes the older research's blanket provider-lock-in claim:
Kiro Crew documents Claude Code, Codex, OpenCode, KAS, and Pi paths, with differing capabilities.

The old `kirocrew-parity.md` is a research inventory; its unchecked boxes are NOT a measured
coverage score. Neither app has been benchmarked against the other on quality, latency, cost,
or resource use. “Better overall” is not established.

## What ShuaCrew actually has

“Implemented” below means code exists, not that every live integration was exercised today.

| Area | ShuaCrew status | Evidence / limitation |
| --- | --- | --- |
| Native Mac workspace | Implemented; live checked | Swift/AppKit shell, WebKit interface, menu bar, native menus, fullscreen, theme bridge. `apps/mac/Sources/ShuaCrew/` |
| Claude / Codex sessions | Implemented; live checked in previous pass | `packages/runtimes/src/claude.ts`, `codex.ts`; see `../mac-verification-2026-09-24.md`. ACP exists but was not tested with a live Kiro account. |
| Crew identities / standing threads | Implemented | `apps/gateway/src/crew.ts`; roles, personas, model defaults, routing, member-scoped lessons. |
| Autonomous crew delegation | Bounded gateway coordinator implemented; live Claude → Codex checked | Crew rooms have run-authenticated delegation/status/messages, opt-in, isolated worktrees, stop/pause, explicit retry and attributed summaries. One real cross-provider workflow, follow-up and cancellation verified; see `../crew-rooms-verification.md`. Not unbounded autonomous teams or complete Kiro parity. |
| Conversation workflow | Implemented, with gaps | Search, resume, fork/checkpoints, replay, tool activity, turn minimap, follow-up queue. No full steer/queue decision router or all privacy-mode semantics. |
| Queue editing / ordering | Implemented this pass; live + automated checks | Shared `packages/core/src/queue.ts` projection, durable edit/reorder events, conflict checks, inline editor, recovery of consumed edits. Next turn receives the saved order. |
| Terminal | Implemented; live checked in previous pass | Real PTY, command blocks/history, split panes, search, English-to-command. `apps/gateway/src/terminals.ts`, `apps/web/src/terminal/` |
| Plans / playbooks / review | Implemented; deterministic tests | `autonomy.ts`, `plays.ts`, `specs.ts`, `merge.ts`. Not proof of every unattended real-provider run succeeding. |
| Schedules / webhooks / heartbeats | Implemented; deterministic tests | `autonomy.ts`: cron, script jobs, signed webhooks, script checks that wake agents. No broad messaging-channel or forge-watch parity claim. |
| Memory / self-improvement | Partial | Scoped lessons, keyword recall, correction learning, confidence/retirement and proposed skills. No semantic embedding store or full multi-layer/session consolidation equivalent. |
| Skills / MCP | Implemented, narrower | `skills.ts`, `mcp.ts`, `mcp-client.ts`, `toolserver.ts`. Not an app marketplace or full hook-system equivalent. |
| Library / artifacts | Implemented; save/open live checked | `library.ts`; generated deliverables, versions and knowledge sources/search. |
| Personal business workspace | Implemented, live external services unverified | Ventures, briefs, outreach drafts, publishing and revenue surfaces. External accounts/actions require separate setup/verification. |
| Appearance / customization | Implemented; native checked | Palettes, accents, density, reading size, motion, navigation labels, start screen, searchable Settings. |
| Observability / usage / Developer settings | Implemented; native and source reconciliation checked | Operational states, latency samples, token history/filtering, nullable reported cost, accounting coverage, health and audit verification. `../observability-verification.md` records263 passing tests, actual provider evidence and remaining minor/manual gaps. Not a subscription billing or remaining-quota estimator. |
| Chat controls | Implemented this pass | Send shortcut, spell check, turn navigator visibility; old preferences migrate with defaults. |
| Native notifications | Implemented this pass; delivery blocked by current OS permission | Opt-in, categories, sound control, local quiet hours, native persistence. macOS currently reports denied; no permission was changed. |
| Policy / audit / backups | Implemented, not a security-parity certification | Layered policy, approvals, redaction, event-chain verification, encrypted backups and launchd service. Not equivalent to all Kiro governance/isolation guarantees. |
| Remote gateways / channels / managed updates | Missing or not established | No claim of fleet management, Slack/Discord/etc integration, app SDK marketplace, or signed self-update channels. |

## Changes made in this pass

- Queued messages can be edited in place and reordered without replacing the composer draft.
- Edits carry original text for conflict detection. Started/withdrawn messages cannot be resurrected.
- Gateway and UI use the same queue projection; ordering and edits survive SQLite reopen/recovery.
- Automatic memory learns the final consumed queue text, not withdrawn or superseded drafts.
  Automated follow-ups and incognito corrections do not become user lessons.
- Chat settings apply immediately and survive relaunch. IME composition and Shift+Enter never send.
- Existing turn navigation can be hidden and is suppressed on narrow/touch layouts.
- Native notification categories, sounds and quiet hours persist in Mac preferences. No permission
  prompt at launch. Only explicit enablement requests OS authorization. No critical/time-sensitive
  override. Existing permission denial is shown honestly.
- Notification bridge acknowledgements correlate to writes, so focus refresh cannot prematurely
  unlock controls during an OS permission request. Independently reviewed and regression tested.

## Verification

| Command | Observed result |
| --- | --- |
| `pnpm test` (outside sandbox for sockets/PTY/media) | 27 files, **184 tests passed** |
| `pnpm typecheck` | Exit 0 |
| `swift test` in `apps/mac` | **9 Swift Testing tests passed** |
| `bash apps/mac/scripts/install.sh` | Release build/install succeeded |
| `codesign --verify --strict --verbose=2 /Applications/ShuaCrew.app` | `valid on disk`; `satisfies its Designated Requirement` |
| `/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' /Applications/ShuaCrew.app/Contents/Info.plist` | `202609242116` |
| `git diff --check` | Exit 0 |

The first sandboxed full-suite attempt had three environment failures (local socket/PTY access and
macOS media); rerunning with the necessary permission passed. The production UI build retains the
existing CSS optimizer warning about `::highlight(find)`; it exits successfully.

Native verification used `/Applications/ShuaCrew.app`, not a browser mock:

- Notification settings displayed the actual denied OS permission and saved category/sound/quiet
  choices. Sound-off and quiet-hours-on survived quit/relaunch; both test changes were restored.
- Modified-Enter send preference survived relaunch. Enter inserted a newline without submitting;
  Command+Enter started a real Claude session.
- Session `r_3df74b2e`: two follow-ups were reordered in the UI and appeared in that order in turn 2.
- Editing while the turn started preserved the edit with an explicit consumed-message notice;
  “Add edit to composer” appended to the existing draft instead of overwriting it.
- A second in-place edit changed `ORIGINAL_QUEUE` to `EDIT_SAVED_READY`. Turn 4 displayed the edited
  request and returned **EDIT_SAVED_READY**. No files or network access requested for that text-only test.
- Initial test used a sleep request to hold a turn; the provider refused foreground sleep, then
  stopped its background task at turn end. It did NOT complete the intended sleep. Queue assertions
  above are based on observed UI/events, not on that command succeeding.

The smoke session remains in history. No commits or pushes. Prior app retained at
`/Applications/ShuaCrew.backup-20260924-211624.app` (earlier backups also remain).

## Next substantial work

The bounded permissioned coordinator now exists, with live evidence recorded in
`../crew-rooms-verification.md`. Source-backed observability/usage and Developer settings now
exist with evidence in `../observability-verification.md`. Next work is phone approvals and
distribution readiness. **Shua voice** currently combines local
transcription, subscription-backed text and local neural speech; it is not full-duplex realtime audio.

Other independent projects: richer memory consolidation and privacy modes, remote/channel
integrations, managed updates, and deeper workflow evidence/usage reporting. They are not hidden
behind nonfunctional switches or marked complete here.
