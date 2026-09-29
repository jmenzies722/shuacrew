# Installed Mac app verification — 2026-09-24

Installed `/Applications/ShuaCrew.app`, bundle build `202609242044`.
Previous bundle retained at `/Applications/ShuaCrew.backup-20260924-204403.app`.
Gateway service restarted with current source. No commit or push performed.

## Fixes found through native verification

- The main screen started at opacity zero and remained invisible in the native WebKit
  window even though its accessibility content loaded. Removed the entrance animation's
  hidden initial state; the same installed window visibly rendered after rebuilding.
- Fixed native Ask the Crew, keyboard-help, and full-screen JavaScript bridge calls.
- Added an explicit Close control and captured Escape for keyboard help, including when
  the terminal previously held keyboard focus.
- Final agent replies were duplicated when a checkpoint separated streamed prose from
  its final copy. A regression test reproduced two prose items, then passed with one.
- Retained immutable, content-hashed build assets so an already-open window can still
  load its terminal and other lazy screens after a rebuild. Verified both consecutive
  entry assets remain on disk. Previously the terminal failed with an import error.
- The Mac installer now builds the interface, verifies signing, and keeps the previous
  installed bundle instead of deleting it. Quit the app before running the installer.
- Scoped the suggested repository-review prompt to personal projects.

## Command evidence

| Command | Result |
| --- | --- |
| `pnpm test` | 25 files, 175 tests passed |
| `pnpm typecheck` | Exit 0 |
| `swift test` in `apps/mac` | 6 Swift Testing tests passed |
| `bash apps/mac/scripts/install.sh` | Release build completed; installed app; previous bundle retained |
| `pnpm service restart` | `Restarted.` |
| `codesign --verify --strict --verbose=2 /Applications/ShuaCrew.app` | `valid on disk`; `satisfies its Designated Requirement` |
| `pnpm --filter @shuacrew/web build` | Exit 0; existing CSS optimizer warning for `::highlight(find)` |
| `git diff --check` | Exit 0, no output |

## Actual native UI checks

All checks below used `/Applications/ShuaCrew.app`, not a browser preview or mock runtime.

- Claude session `r_8393f45b`: completed with `SHUACREW_READY`.
- Codex session `r_9faa551b`: completed with `CODEX_READY`.
- Named specialist session `r_6ced97a7`: recorded an Agent call with
  `subagent_type: crew-researcher`, completed with Rhea's `RHEA_READY` result.
  Rhea's existing member configuration was enabled for native Claude delegation.
- Integrated shell command `printf 'SHUACREW_TERMINAL_READY\n'` visibly returned
  `SHUACREW_TERMINAL_READY` with successful command status.
- Saved the specialist response to Library and opened artifact `a_d47c1005-e`.
- Changed navigation to labels, quit/relaunched, and confirmed it persisted. Restored
  the user's original Icons preference afterward; preserved their Cursor Black/Mono theme.
- Native Settings, New Session, keyboard-help opening/dismissal, and full-screen entry/exit.
- App left open on a fresh composer with Gateway online. Smoke-test sessions and the
  saved artifact remain in history as verification evidence.

## Scope

This verifies the core installed-app workflow and the shipped customization work. It does
not claim complete Kiro Crew parity. Cross-provider gateway delegation remains roadmap work;
the verified named-specialist path is Claude-native. Microphone permission, remote services,
publishing, payments, and unattended scheduling were not exercised in this verification.
