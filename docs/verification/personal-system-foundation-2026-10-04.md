# Personal system foundation — October 4, 2026

## Installed result

Installed signed `/Applications/ShuaCrew.app`, rebuilt web assets, and restarted launchd gateway from `shuacrew-live`. No commit or push. Existing Sable PID 8596 is still running: this Codex implementation process (72470) and a separate Claude session (67388) are descendants. The requested Sable restart is authorized but cannot safely finish within the session it would terminate. Signed update remains at `/Users/admin/Developer/projects/sable/dist/Sable-Recording-20261004.app`; do not launch both copies together.

Implemented resumable six-step onboarding; revision-conflict protection; real Codex check with source receipt, cancellation and restart recovery; scoped health wording; visible venture launch failures and reconciliation; revenue provenance and currency separation. Crew accepts Claude/Codex; personal assistant is Codex-only, including follow-ups and failover. Live calls are no longer automatically archived. Recorded text is reviewable, saved locally on Save, editable before replay, and usable through “Replay my last workflow.” Fresh defaults use Shua, compact notch placement.

## Verification commands and outputs

```text
node node_modules/vitest/vitest.mjs run
Test Files 244 passed (244)
Tests 1121 passed (1121)

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --filter Workflow
Test run with 14 tests in 3 suites passed

node node_modules/typescript/bin/tsc --noEmit -p apps/web
node node_modules/typescript/bin/tsc --noEmit -p apps/gateway
exit 0

git diff --check
exit 0

bash apps/mac/scripts/install.sh
Build complete! (29.55 sec)
installed /Applications/ShuaCrew.app

codesign --verify --deep --strict /Applications/ShuaCrew.app
exit 0
```

Final presentation-only default changes were followed by a successful Vite build (817 ms), web typecheck (exit 0), and companion tests (2 files / 15 tests passed).

Native application self-tests (isolated temporary workflow libraries):

```text
SHUACREW_SPARK_SELFTEST=workflowterminalprobe /Applications/ShuaCrew.app/Contents/MacOS/ShuaCrew
capturedInputs: {input_1: demo}
keyboardOnly: true; verifiedRuns: 2; ok: true
replayMilliseconds: [231.783, 142.258]

SHUACREW_SPARK_SELFTEST=workflowkeyboardprobe /Applications/ShuaCrew.app/Contents/MacOS/ShuaCrew
recordedSteps: [shortcut, input]; reviewedTextPersisted: true
verifiedRuns: 2; ok: true
replayMilliseconds: [789.941, 755.688]
```

Terminal check uses Sable's actual updated TerminalMac implementation in `dev.shua.sable-input-fixture`, with `/bin/cat`. This is not proof that the old running Sable has loaded the new accessibility code. TextEdit creates disposable documents and verifies multiline and Unicode values. The initial first-document test exposed missing no-window observation; patched it before rerunning successfully. Captured text uses observed final field value, including the app's own capitalization, rather than assuming raw keystrokes equal final text.

Real Codex model check: `r_408e2ab9`, exact `SHUA_READY`, receipt state `verified`. Archived with old history after testing. Real Claude check: `r_7fe00e46`, failed with “Your organization has disabled Claude subscription access for Claude Code”. Authentication remains present; Claude execution is blocked by provider policy. No API credential or permission was substituted.

CUA verified setup save/advance, Later, resume at saved Models step, a visible 409 conflict, and recovery to saved Outcomes. Screen and Accessibility remained Granted. No microphone success asserted. Fresh onboarding left open with blank goal and Both paths selected.

## Fresh start and recovery

User authorized empty content while keeping connections. Gateway and Shua were stopped after confirming zero active runs. Existing log hash chain verified; a consistent SQLite snapshot was made. Content was moved, not deleted.

- Backup: `/Users/admin/.shuacrew/backups/fresh-start-2026-10-04T21-09-59-942Z`
- 44 content entries archived; complete manifest and `RESTORE.md` in that folder.
- Snapshot `PRAGMA quick_check`: `ok`.
- Three MCP configurations restored into a new hash-chained event store; OAuth file preserved.
- Four retained settings/auth files compared by SHA-256 and unchanged. Claude account directories, Codex sign-in, model downloads, and macOS privacy grants retained.
- Browser content backed up before clearing: two origin/window archives, 106 keys total, in `/Users/admin/.shuacrew/backups/browser-a17a0e9f-3bbb-4171-be4b-20f0355a0d70/`.
- Verified zero runs, plays, artifacts, knowledge, ventures, schedules, learning cards, courses, roadmaps, studied items, and reviews. Setup incomplete with blank goal.
- Browser epoch prevents old cached history returning and does not clear new content on later loads.

## Limits and remaining work

Sable restart remains pending due to the live sessions above. Return in terminal inputs still records a checkpoint; arbitrary shell-command submission is not represented as verified executable input. Unsupported/ambiguous targets stop visibly. Text entry, target verification, protected context exclusion, and takeover cancellation are bounded capabilities, not universal automation. Replay timing improves only following successful verified runs; there is no unconditional speed guarantee.

Claude organization access needs account/admin correction. Live microphone/playback/interrupt experience needs a user voice test; permissions and generated audio are separate evidence. Broad product superiority, autonomous income generation, and all complex workflows are not verified claims. Releases 2–4 of the approved broader specification remain future implementation; this report covers the foundation plus recording and reset fixes.

Rulings: continued in the existing isolated dirty worktree with no commits; setup completion syncs Learning after revision validation; held read-only Codex run supplies capability evidence; latest user instructions supersede old no-reset, no-restart, and global-Codex-only plan clauses. Reviewer defects fixed: edits during save, stale goal overwrite, final captured input flush, duplicate automation after restart, absent brief provenance, and orphaned setup-check runs.

## Later correction: Claude recovered

Subsequent account-by-account investigation found the additional saved Claude account works. Shua was selecting the blocked default account first. Explicit Shua-only selection now uses account `2`; real Sonnet 5 gateway run `r_7ced495e` finished `done` with `SHUA_READY`. See [account diagnosis and recovery](claude-account-recovery-2026-10-04.md). The earlier organization-wide wording was too definitive; the default account's underlying rejection remains unexplained.
