# Crew voice controls and Codex recovery — 2026-09-30

Continued the five uncommitted voice-control files already in this checkout.
No commit or push was performed.

## Codex connection

- `codex login status`: `Logged in using ChatGPT`.
- Local Codex config selects `gpt-6-astra` with medium reasoning.
- ShuaCrew initially retained model usage restrictions through Sunday despite the user's reset.
- Used `POST /api/runtimes/codex/restore` to permit retries. No paused Codex work was present; the existing paused Claude companion run was left alone.
- Created one tool-free verification run through `POST /api/runs`, explicitly selecting `codex` / `gpt-6-astra`.
- `GET /api/runs/r_9264296f/events` recorded final text `SHUACREW_CODEX_CONNECTED`, `turn.completed` with that route, and status `done`. This verifies an actual response, not just sign-in or a session ID.
- Set gateway `failoverOrder` to `["codex", "claude"]`. Other settings were preserved through the settings API.
- Installed ShuaCrew UI showed Codex first in Agents and `Ready · Codex` in the companion.

## Voice-control changes

Spark can message a session, archive finished work, approve/reject reviews, and request a PR, in addition to opening/stopping sessions and answering tool approvals.

- Stable references never get reassigned to different work as session statuses reorder.
- Unknown, expired, and wrong-kind references fail before a request is sent.
- Stopping, archiving, merging and PR creation retain confirmation; prompts include the session title.
- Review actions require the session to be awaiting review. Active sessions cannot be archived.
- Merge acknowledgment says `Queued for merge`, matching the gateway contract.
- A completion batch offers only one merge question, with its exact session ID. Questions are remembered only when speech is enabled and the line is accepted for speech; offers expire after 90 seconds or when the review/approval is no longer available.
- A bare no to a merge offer is instructed to leave the work alone, rather than reject it.

## Verification

Commands run from `/Users/admin/Developer/projects/shuacrew`:

```text
pnpm exec vitest run apps/web/src/lib/crew-voice.test.ts apps/web/src/screens/spark/crew-actions.test.ts apps/web/src/lib/buddy.test.ts
Test Files  3 passed (3)
Tests       66 passed (66)

pnpm typecheck
$ pnpm -r --parallel exec tsc --noEmit -p .
exit 0

pnpm test > /private/tmp/shuacrew-voice-tests-final.log 2>&1
Test Files  155 passed (155)
Tests       759 passed (759)
exit 0

pnpm --filter @shuacrew/web build
✓ built in 789ms
exit 0

git diff --check
(no output; exit 0)
```

Initial full-suite sandbox run: 753 passed, four failures in media, system widget and terminal integration tests. The terminal failures explicitly reported loopback `listen EPERM`. All passed outside the sandbox with approval, including the final full-suite run after the last changes.

Build retains a large-chunk warning; test output includes Node's local-storage warning. Neither prevented completion.

The built web interface is served by the running gateway; it checks for new builds every 30 seconds and reloads when no text is being composed. Native app code was unchanged.

Not claimed: live microphone recognition, audible playback, or actual merge/push/archive operations on the user's work. Action tests use mocked HTTP boundaries to verify routing, confirmation and failure behavior without performing those operations.
