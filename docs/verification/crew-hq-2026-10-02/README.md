# Crew HQ and Mac companion verification — 2026-10-02

## Delivered

- Crew HQ naming/navigation, dimensional agent workstations, real queued/failed/working states, scoped room handoffs and connection freshness.
- Exact obsolete standup failure report filtered from saved companion reports; dismissible reports; invalid runtime duration values omitted rather than rejecting events.
- Speech queue cancellation and partial-playback retry protection, per-turn duplicate suppression, deferred and expiring proactive announcements.
- System-default or explicit microphone selection, disconnected-track/device-change recovery, and stale microphone acquisition cleanup.
- Compact notch thinking timer, listening/speaking states and actionable completion/decision updates; cursor captions follow spoken updates without restarting duplicate captions.
- Passive companion panels no longer accept keyboard focus; closing releases focus only when the panel actually owns it.

## Commands and observed output

| Command | Output |
| --- | --- |
| `pnpm exec vitest run` | `170 passed` files, `831 passed` tests |
| `pnpm exec vitest run apps/web/src/lib/quiet-announcements.test.ts` after adding decision acknowledgment coverage | `3 passed` tests |
| `pnpm --filter @shuacrew/web exec tsc --noEmit -p .` | Exit 0 |
| `pnpm --filter @shuacrew/web build` | `built in 725ms` |
| `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test` from apps/mac | `84 tests in 9 suites passed` |
| `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift build -c release --product ShuaCrew` from apps/mac | `Build complete! (31.58 sec)` |
| `git diff --check` | Exit 0, no output |
| `codesign --verify --strict /Applications/ShuaCrew.app` | Exit 0, no output |
| Installed `CFBundleVersion` | `202610020543` |
| `curl -fsS http://127.0.0.1:7420/api/health` after gateway restart | `ok:true`, `pendingApprovals:0`, `pid:32499`, `uptimeS:24` |

Full-suite and native commands ran outside the filesystem sandbox because socket and Swift manifest tests were blocked inside it. Build warnings remain; whole-workspace `pnpm typecheck` is blocked by a pre-existing missing `.js` import extension in `packages/core/src/session-title.test.ts:2` (TS2835).

The previous installed bundle is retained at `~/.shuacrew/app-backups/ShuaCrew-20261002-054332.app`. No backups were deleted. Gateway restart was gated on an empty active/waiting/queued run list. Its first three-second check was too early; the follow-up confirmed healthy service.

## Manual evidence and limits

Crew HQ was rendered and inspected in the Mac app, showing five idle agents without fabricated work. During UI verification the user reported doubled typing; after the app was closed the user confirmed normal typing. The focus regression tests now pass, but that does not prove the original doubled-key cause. The updated app is deliberately left closed, with no post-install keyboard injection or audio test.

AirPods/Bluetooth acoustic quality, live microphone switching, voice latency and the final notch appearance still require a physical-device session. Automated checks cannot establish perfect audio or all-device compatibility. The obsolete saved report is pruned when the companion next mounts; unrelated session history is retained.
