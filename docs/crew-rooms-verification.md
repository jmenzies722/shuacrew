# Crew rooms verification — 2026-09-24

## Installed result

The existing `/Applications/ShuaCrew.app` now exposes Crew rooms, shared conversations, bounded Claude/Codex delegation, and an event-driven workspace. This is not a separate web product. The gateway was restarted only after `/api/snapshot` reported no queued, running, planning, approval-waiting, or paused runs. No native binary replacement was needed for this slice.

## Actual provider evidence

Command: `pnpm exec tsx apps/gateway/src/fixtures/verify-room.ts`.

After the review fixes, this returned `verified: true` for room `room_3a3d0685-8a54-417f-849f-3533b984b370`, Claude root `r_36bedbd6-34cd-4a5d-9fdd-878029677810`, and Codex child `r_98d67e81-30bb-4933-b9b0-9e0a473743d6`. Repeating the same HTTP request ID returned the original root. The transcript contained You, coordinator, reviewer, and one coordinator summary. Child output: “A calm app for planning your side project.” The summary attributed the reviewer and reported no failures. This used existing authenticated subscriptions and public text; no repository edits, shell commands, publishing, or additional credentials were requested.

An earlier live verification room, `room_d8a9c49f-9167-4904-8ff0-bffaed60bcdc`, was inspected in the installed Mac application:

- Pause changed the UI to Resume and disabled sending; Resume restored it.
- Inspect work opened the actual Codex source conversation, with its recorded answer and a link back to the crew room. Room source sessions no longer expose the ordinary composer.
- A new same-room request, `r_90bac1f8-7419-4873-84f4-4506586b3529`, recalled the previous review and returned the correct public sentence. The UI displayed the completed result and recorded four-second elapsed time.
- A harmless text-generation cancellation check, `r_b71be1df-cdb9-4bac-aa2f-f8edff6e3337`, changed from working to cancelled after Stop, with “Room stopped by you” and zero running work. That verification room remains paused intentionally.
- The room interface was visually inspected in the installed app in both light and dark appearances during this pass. Reconnection after gateway restart restored the room without losing its transcript.

Dedicated verification rooms/members remain in history for inspection. No production records were deleted.

## Independent review and regression fixes

One read-only independent review found five Important issues. All were reproduced before their fixes:

1. Stop/Pause during worktree preparation could still start the runtime. Post-await launch checks now prevent this; both variants failed before and passed after.
2. Ordinary session/voice follow-ups could restart stale roots or strand completed children. They now reject room-run follow-ups before persistence; only an explicitly authorized coordinator summary can resume that run. HTTP and VoiceSessions tests cover rejection.
3. Failed summary turns could repeat an earlier answer. Final prose extraction is now bounded to the current persisted turn.
4. A crash between summary persistence and enqueue lost the summary. Recovery now queues only a persisted, unconsumed summary; interrupted work is not replayed.
5. HTTP 400/409 errors froze the room draft. Definitive rejection now unlocks it; transport uncertainty retains the original immutable request envelope. Oversized drafts fail before network submission.

## Verification commands

At 23:37 EDT:

| Command | Observed output |
| --- | --- |
| `pnpm test` | 38 files, 245 tests passed |
| `pnpm typecheck` | Exit 0, no TypeScript errors |
| `pnpm --filter @shuacrew/web build` | Built successfully; existing `::highlight(find)` optimizer warning |
| `swift test --package-path apps/mac` | 12 Swift Testing tests passed |
| `git diff --check` | Exit 0, no output |
| `codesign --verify --deep --strict --verbose=2 /Applications/ShuaCrew.app` | valid on disk; satisfies its Designated Requirement |

Gateway health after restart: `ok: true`, service enabled, zero pending approvals. Additional controlled tests cover retry as a new supervised request and pause during provider readiness; see the latest test output/ledger for the current count.

## Remaining verification and product work

Real-provider approval/retry UI, a narrow window, and every disconnect timing have not all been manually exercised. Controlled tests cover authorization, approval gating, retry, disconnect view state, recovery, provider limits, and cancellation races; that is not equivalent to full live UI coverage.

Voice still uses transcription → subscription text agent → local speech, not full-duplex realtime audio. Live microphone/interrupt quality needs user participation and existing OS permissions. Observability/usage dashboards and Developer settings are a separate next slice; old token totals are not yet certified accurate. Phone approvals, public signing/notarization, onboarding, updates, and provider-policy review remain open. No general Kiro parity or public-release claim is made.

No commits or pushes were performed; the uncommitted checkout is not a backup.
