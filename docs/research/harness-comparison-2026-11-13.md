# Harness comparison: Claude Code, Codex, ShuaCrew

Researched 2026-11-13. Claude Code facts are from code.claude.com/docs; Codex facts from learn.chatgpt.com/docs
(developers.openai.com/codex redirects there; latest CLI in the changelog was 0.169.0); ShuaCrew facts are from reading
`apps/gateway/src`, `packages/runtimes/src`, `packages/core/src` and `packages/memory/src` with file references.
Anything marked *unconfirmed* was not found in official docs.

## What each harness has

| Capability | Claude Code | Codex | ShuaCrew today |
|---|---|---|---|
| Permission modes | `default`, `acceptEdits`, `plan`, `auto` (a classifier reviews actions), `dontAsk`, `bypassPermissions`; allow/deny/ask rules | `approval_policy` (`on-request`, `never`, granular) separate from the sandbox; Starlark command rules; permission profiles with per-path and per-domain rules | One policy engine for Claude, Codex and Live; `autonomous` and `supervised`; standing "always allow" rules; unanswered approvals denied after 30 min (`core/policy.ts:64`, `runs.ts:1025`) |
| Approval without a human | `auto` mode classifier | Auto-review: a reviewer agent answers prompts; the turn stops after 3 denials in a row | Rules only; nothing reviews an "ask" when you are away |
| OS sandbox | Seatbelt/bubblewrap, Bash only | `read-only`, `workspace-write`, `danger-full-access`; network off by default | None of its own; Codex runs in `workspace-write` (`runtimes/codex.ts:22-40`) |
| Worktree per task | `--worktree`, subagent `isolation: worktree` | Worktrees with setup script and snapshot on cleanup | Yes: `~/.shuacrew/worktrees/<repo>/<run>` on `shua/<run>` (`worktrees.ts:43`) |
| Checkpoints and rewind | Snapshot per turn, `/rewind` restores code, conversation or both | `/undo` appears removed (*unconfirmed*) | A checkpoint commit per turn and `fork`, but **no rewind**: `Worktrees.rollback` is never called (`worktrees.ts:78`) |
| Plan | Plan mode blocks edits until approved | `/plan`, `/goal` as completion criteria | Plans are captured as events (`runtimes/plan.ts`); not enforced |
| Verification | `/verify`, `/code-review`, `/security-review`; Stop hooks can block | No built-in "tests must pass" gate; Stop hooks can force continuation | Enforced only in the TASK.md runner and the merge re-check (`autonomy.ts:473`, `merge.ts:64`); elsewhere it is prompt text (`work-habits.ts`) |
| Subagents | Markdown definitions with tools, model, permissions, isolation; up to 20 at once | TOML definitions; built-ins `default`, `worker`, `explorer` | Claude members only, opt-in (`crew.ts:135`); Codex gets none |
| Multi-agent workflows | Workflows (a script calling `agent()`, `pipeline()`, `parallel()`); agent teams (experimental) | Subagents only | Crew rooms (depth 1, 8 tasks), plays, TASK.md runner |
| Several attempts at one task | Via workflows | `codex cloud exec --attempts 1-4` | **Missing** in the gateway |
| Hooks | About 30 events; can block, rewrite tool input, inject context | 14 events; exit 2 blocks | None for the user; internal SubagentStart/Stop only |
| Skills, plugins, MCP | All three; MCP tool search | All three; MCP client only | Skills as a Claude plugin, skill text in Codex prompts; MCP manager; 7 gateway tools (`toolserver.ts:30-85`) |
| Instructions and memory | CLAUDE.md layers plus auto memory | AGENTS.md layers; Memories (a background pass over idle chats, off by default) | Lessons with confidence, recalled by keyword into fresh runs (`memory/recall.ts:64`); per-project instructions in settings |
| Headless and SDK | `claude -p`, Agent SDK | `codex exec`, SDK, `app-server` protocol | Uses both underneath |
| Schedules | Cloud scheduled tasks; local `/loop` | Scheduled tasks; the desktop app must be running | Cron, script-only jobs that wake an agent only on failure, webhooks, heartbeats (`autonomy.ts`); no retry or catch-up |
| Provider limits | `--fallback-model` on overload | `/status` shows limits | Rotates Claude accounts, then a sibling model, then the other provider, then a timed resume (`runs.ts:733-791`) |
| Record of what happened | Transcripts, OpenTelemetry | `history.jsonl`, OpenTelemetry | Hash-chained event log that every subsystem rebuilds from after a restart (`store.ts`, `core/chain.ts`) |
| Personal layer | None | None | Shua: voice, notch, phone approvals. But Shua's turns get no lessons or memory (`runs.ts:509`) and personal setup feeds nothing (`server.ts:204`) |

## Where ShuaCrew is already ahead

- It runs Claude and Codex under one policy and falls back between them when a plan hits its limit.
- Its log is tamper-evident and survives restarts; neither tool offers that.
- Schedules run locally without a desktop app open, and can run a script first so a model is used only when needed.
- Approvals reach the phone and watch.

## Gaps worth closing, in build order

1. **Done means verified.** *Built 2026-11-13* (`packages/core/src/verification.ts`, the `done` case in
   `apps/gateway/src/runs.ts`, `verify-gate.test.ts`): a repo session that changed code must have run a check after its
   last edit; if not, the gateway asks the agent once for proof, and the verdict after that turn (verified, failing or
   unverified) is recorded as `verify.decided` and shown in place of "Done". Not yet: a setting to turn it off.
2. **Personal knowledge store.** Plain files (`me`, `projects`, `people`, `commitments`, `style`) fed by personal setup,
   lessons and session summaries, and injected into every Shua turn and summarised into crew runs.
3. **Rewind.** Wire the existing per-turn checkpoint commits to a "rewind to here" action.
4. **Roles and one workflow.** Replace personas with roles (Builder, Reviewer, Researcher, Operator), each a file with
   model, tools, permissions and a verify rule, usable by both runtimes. First workflow: Build, Review, Verify, Merge.
5. **Race across providers.** The same task to Claude and Codex in two worktrees; the merge check and a reviewer pick.
6. **Nightly consolidation and an Inbox.** A scheduled pass updates the knowledge files and proposes actions; each
   proposal is approved into a session.
7. **A reviewer for approvals** on unattended runs, stopping after repeated denials.
8. **Reliability:** persist the merge queue (`merge.ts:15`), retry and catch up missed schedules.

## To check before building

- The Codex adapter passes `approvalPolicy: untrusted` (`runtimes/codex.ts`), and the Codex docs now list that value
  as retired. Confirm against the installed Codex version before relying on it.
