# Research & decisions

The full notes live in [`research/kirocrew-parity.md`](research/kirocrew-parity.md) (what Kiro Crew
does, from its public repo and docs — behaviour only, no code) and
[`research/runtime-apis.md`](research/runtime-apis.md) (current Claude Agent SDK, Codex app-server,
ACP and package facts, checked against npm tarballs and the installed CLIs on 2026-09-23).

## Where the real platform disagreed with the build prompt

| Prompt said | Reality | Decision |
|---|---|---|
| Drizzle + better-sqlite3 | better-sqlite3 13 has darwin-arm64 N-API prebuilds; Node 25's built-in `node:sqlite` is a release candidate, needs no native build, and did 100k inserts in 45ms here. Stable Drizzle has no `node:sqlite` driver (only 1.0.0-rc). | **`node:sqlite` behind a small `EventStore`**, hand-written schema, prepared statements. Nothing native to bundle into the desktop sidecar. Swapping drivers touches one file. |
| ACP client: verify package | `@zed-industries/agent-client-protocol` is deprecated → **`@agentclientprotocol/sdk` 1.5** | Use the new package. |
| Codex via app-server | Confirmed: newline-delimited JSON-RPC over stdio (no `"jsonrpc"` field), `thread/start`, `turn/start`, server→client `item/commandExecution/requestApproval` + `item/fileChange/requestApproval` → `{decision}`. `@openai/codex-sdk` has no approval callback. | app-server is the primary Codex path. |
| TypeScript | npm `typescript` is 7.0 (native rewrite). | Type-check with TS 7; transpile with Vite/tsx (esbuild). |

## Architecture decisions (one line each)

- **The event log is the only truth.** Runs, board, memory, usage and audit are projections; replay and time travel are folds, not features.
- **The log is the audit trail.** Each event carries the SHA-256 of its predecessor; `verify` walks the chain. No second record to drift.
- **Redact before storing.** Secrets an agent prints never reach disk, the UI, Slack or traces — they are redacted at `append`, then hashed.
- **One policy engine, tightest wins.** Layers global → project → app → run; deny › ask › allow across layers, so approve-all cannot override a deny. Every decision names its rule and layer.
- **Subscription first.** Runtimes launch the official binaries, which own their auth. In subscription mode the gateway strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`, `CODEX_API_KEY` from the agent's environment. ShuaCrew never reads `~/.claude*` or `~/.codex/auth.json`.
- **A usage window pauses, never fails.** Limited runs go to `paused`, resume when the window resets (or fail over), and new runs for that runtime wait in the queue.
- **Worktree per run**, outside the repo (`~/.shuacrew/worktrees/<repo>/<run>`); each checkpoint is a commit on `shua/<run>`.
- **Token deltas coalesced** at the source (one fact / 50ms) and again for slow WebSocket clients; state transitions are never merged or dropped.
- **Shutdown records nothing.** A stopping gateway leaves runs `running` in the log so the next boot re-queues and resumes them.
- **Loopback only**; token required for any other bind; CSRF = required `X-ShuaCrew` header + same-origin; strict CSP.
- **Kiro via ACP is built and tested against a fake agent only.** The user's day-job Kiro seat is sealed from this machine's automation; pointing the ACP runtime at it is the user's decision.

## Kiro Crew weaknesses ShuaCrew targets

Lock-in to kiro-cli and Kiro credits (every cron/heartbeat model call billed); poor cost visibility
(issues #10102, #6338, #8531, #11031); no default egress control or audit UI; app permissions mostly
advisory; heavy resource use. See the parity file §3.

## M5 — memory recall: keyword IDF instead of sqlite-vec (deviation)

The prompt suggests sqlite-vec with a keyword fallback. Lessons are one or two sentences and number in
the tens to low hundreds, so ShuaCrew ships the keyword path only: stemmed terms, IDF weighting, a
one-weak-word gate, and a relative cutoff at 60% of the best match. No embedding model, no network, no
native extension, deterministic. Measured on the recall eval (`pnpm eval`, 10 hand-labelled cases):
precision 89%, recall 89%. Two known misses — both need meaning, not words ("flaky test" ↔ "injected
Clock"; a `users.` column name ↔ "user-visible"). If lessons grow past a few hundred, or those misses
matter in practice, add embeddings behind the same `recall()` signature; the eval is the gate.
