# Kiro Crew: parity research for ShuaCrew

> Historical research inventory, not a coverage score. See [the 2026-09-24 implementation status](parity-status-2026-09-24.md)
> for code-backed coverage and the 0.7.0 changelog comparison. In particular, the provider-lock-in
> characterization below is outdated: current Kiro Crew documents several alternative backends.

Researched 2026-09-23 from public sources only: the GitHub repo `kirodotdev/KiroCrew` (main branch, Apache-2.0, about 4.1k stars) and kiro.dev/crew. This is a behaviour and feature checklist. No code was copied.
`GH` = https://github.com/kirodotdev/KiroCrew/blob/main/ · `UD` = GH + src/kiro_crew/docs/ · `SS` = GH + docs/system-specs/modules/

Key sources:
- README: GH/README.md
- Architecture overview: GH/docs/architecture/overview.md
- Security deep dive: GH/docs/architecture/security-deep-dive.md
- MCP: GH/docs/architecture/mcp.md
- Memory, skills and hooks spec: SS/memory-skills-hooks.md
- Task runner: SS/taskrunner.md and UD/task-runner.md
- Heartbeat: SS/heartbeat.md
- CLI: SS/cli.md
- Governance: SS/governance.md
- Security: SS/security.md
- App Kit: GH/docs/app-kit/manifest-reference.md, api-reference.md, and GH/.kiro/specs/app-sdk-gateway-hooks/requirements.md
- User docs: UD/{skills,memory-and-learning,steering-and-hooks,cron-and-scheduling,inbound-webhooks,monitor-loops,subagents,dashboard,blocked-commands,slack-integration,channel-capabilities,secrets-vault,workflows,crew-members}.md
- Product page: https://kiro.dev/crew/

---

## 1. Parity checklist by area

### 1.1 Gateway and process model
- [ ] A single asyncio Python (aiohttp) "Gateway" process multiplexes all surfaces (dashboard, CLI, desktop Electron app, messaging channels) onto agent sessions. State, policy, approvals, schedules, memory and apps live on the gateway host.
- [ ] The agent runtime is an external ACP harness (Agent Client Protocol, JSON-RPC 2.0 over stdio). `agent.provider` is fixed to `acp`. `agent.acp_backend` selects the harness, default `kiro-cli`, spawned as `kiro-cli acp --agent <name>`. Codex and Claude Code adapters also exist.
- [ ] The coordinator is just an agent config (`kirocrew`) that holds the gateway MCP tools (`spawn_run`, `cron_add`, `task_run`). The gateway code itself is agent-agnostic.
- [ ] Each session is its own ACP connection, keyed by a `session_key` that encodes its origin:
  - `dashboard:chat-N`
  - `cron:{id}` (or `cron:{id}:{uuid}` for ephemeral runs)
  - `subagent:{id}`
  - `taskrunner:{task_id}:task{N}`, plus `:decompose` and `:review`
  - `hook:<id>`
  - `_hb` (heartbeat) and `_bg` (background)
- [ ] Warm pool: `session.pool_size` (default 0, off) and `session.pool_ttl_secs` (default 1800).
- [ ] Session timers and limits:
  - Idle timeout: `session.timeout_secs` = 3600.
  - Turn ceiling: `agent.chat_turn_timeout_secs` = 14400 (4h), clamped to 300..86400.
  - Tool-approval window: `agent.tool_approval_timeout_secs` = 600, and always kept inside the turn's remaining budget.
- [ ] Circuit breaker: 5 consecutive failures reset the session. Auto-compaction triggers at `session.autocompact_pct` = 70%.
- [ ] Ordered shutdown:
  1. Watchdog off.
  2. Save slots.
  3. Cancel handlers.
  4. Stop cron, then heartbeat.
  5. Stop the MCP broker.
  6. Close sessions and channels.
- [ ] Pooled MCP gateway daemon (`mcp_gateway.*`): one backend process serves many sessions, pooled by an env hash that excludes secrets.
- [ ] Data home is `~/.kiro/crew` (override with `KIROCREW_HOME`). Contents: `config.json` (+ `config.local.json` overlay), `.env`, `crons.json`, `crons/`, `hooks.json`, `sessions/*.jsonl`, `skills/`, `apps/`, `memory_stores/`, `workspace/{memory,knowledge,HEARTBEAT.md}`, `security_events.jsonl`, `snapshots/`, `artifacts/`, `gateway.log`.
- [ ] Runs locally, in Docker (`ghcr.io/kirodotdev/kirocrew:stable`, port 5476 on loopback), on a remote host over SSH or Tailscale (`kirocrew tailnet up`), or on EC2 (`kirocrew cloud launch`).
- [ ] Service mode: systemd unit or launchd LaunchAgent (`kirocrew service install|uninstall|status`), with auto-restart and start at boot.
- [ ] Snapshot and restore: `kirocrew snapshot [--keep N=7] [--list]`; `kirocrew restore <f> --mode replace|merge --components X,Y --dry-run`.
- [ ] Release channels are Stable, Insider and Nightly, with a signed wheel manifest and one-click self-update from the dashboard.
- [ ] Telemetry: one anonymous daily heartbeat with 5 fields. Turn off with `kirocrew telemetry disable` or `KIROCREW_TELEMETRY_DISABLED=1`.

### 1.2 Sessions and history
- [ ] Many concurrent chat tabs ("slots"), each with its own agent and project directory.
- [ ] Closed sessions go to a history sidebar and can be resumed with the full conversation after a gateway restart.
- [ ] Transcripts are JSONL (`sessions/`, rotated at about 10MB). Weighted full-text search over session content.
- [ ] Chat actions:
  - Fork a session into a new tab.
  - Edit and resend a message.
  - Regenerate with variant history.
  - Auto-titles.
  - Folders, tags and colours.
- [ ] Message queue: queue messages mid-turn, then edit, reorder, cancel or merge them. The Jev "decision" model decides whether a mid-turn message steers or queues.
- [ ] Cooperative stop: cancel first, hard-kill after a budget. `!stop` / `!cancel` on channels.
- [ ] Per-session memory mode:
  - `persistent` (default)
  - `incognito`: reads memory, no writes, no consolidation
  - `temporary`: no memory reads or writes, and bodies are kept in RAM only
  - Default comes from `dashboard.default_memory_mode`. Slack uses `!incognito` / `!temporary`; Telegram uses `/incognito`.
- [ ] Session Ledger: a durable per-session record of goal, phase and next step that survives compaction.
- [ ] Work Ledger: a conductor dispatches one worker session per item and settles each completion claim against an acceptance condition.
- [ ] Session Control MCP server (`kirocrew-dashboard`, 14 tools): `session_create`, `session_send`, `session_read_message`, `session_stop`, `session_close`, plus `chat_folder_*` and `chat_tag_*`.
- [ ] Terminal tab: a real PTY per chat. "Send to chat" from a terminal selection is credential-redacted.
- [ ] Artifacts: saved generated UI and documents with versions and revert (`kirocrew artifact list|show|save|update|versions|delete`). Optional web deploy to your own S3 + CloudFront.
- [ ] Follow-up suggestions above the composer: new git worktree, add to this session, or skip. The `ask_question` tool renders clickable multiple choice.
- [ ] Remote Crew: one hub reaches other gateways, can run sessions there, and can search history across machines.

### 1.3 Memory and lessons
- [ ] Global V1 has six layers, highest precedence first:
  1. Lessons (`lesson.*`, `source=user_explicit`, confidence 1.0, framed "ALWAYS follow these")
  2. User-explicit semantic facts
  3. Automated semantic facts (confidence ≥ 0.8 required)
  4. `preferences.md` / `projects.md`
  5. Episodic fragments (vector + MMR + time decay)
  6. Daily history `history/{YYYY-MM-DD}.md`
- [ ] V2 ("member" memory): one SQLite database per crew member holding facts, rules, episodes, history, FTS, vectors and revisions. Consolidation publishes atomically with a source-span receipt so retries are idempotent.
- [ ] Two consolidation triggers:
  - Every 30 messages (`_CONSOLIDATION_THRESHOLD`): updates prefs, projects and semantic entries (max 20 per pass).
  - After 3h idle (`memory.history_idle_hours` = 3.0): appends daily history, episodic entries (max 10) and implicit lessons (max 10).
- [ ] Idle-session consolidation runs on every heartbeat tick (60s).
- [ ] History read decay:
  - 0–13 days: full
  - 14–60 days: first entry + count
  - 61–180 days: count only
  - 181–365 days: on disk but not returned
  - over `memory.history_max_days` = 365: pruned daily
- [ ] A new session gets only stable preferences, a 3-day heading index and applicable lessons. Everything else comes through the explicit `memory_recall` tool (FTS + vector).
- [ ] Lesson tools: `learn_add`, `learn_list`, `learn_remove` (CLI twins: `kirocrew learn add|list|remove`). Lesson value is `{rule, category, negative, repo_scope?}`.
- [ ] Lesson dedup (V1):
  - A new rule that is a substring of an existing one is declined.
  - A new rule that contains an existing one deletes it (longer wins).
  - Topic overlap ≥ 50% of the larger keyword set: the newer rule wins.
  - Embedding cosine > 0.85: the newer rule wins.
  - Deletions are deferred until the write commits.
  - Each write returns `inserted|enriched|unchanged|deduped|refused` plus `superseded[]`.
- [ ] `repo_scope`: a lesson or skill applies only when the session's active project (or an ancestor) contains that path.
- [ ] Embeddings run in-process: Qwen3-Embedding-0.6B GGUF (1024 dims, about 610MB) via llama.cpp, sha256-pinned download. Falls back to keyword/FTS search until the model is ready.
- [ ] Memory CLI: `kirocrew memory show [preferences|projects|history] --format json --since`, `memory export --include-markdown`, `memory backup`, `memory list`, `kirocrew consolidate [key] [--all]`.
- [ ] Dashboard: Memory tab (edit prefs/projects, settings via `PUT /api/memory/settings`, live reconfigure) and Lessons tab. Automatic memory backups.
- [ ] Foreign-agent memory import. Imported directives use set-if-absent so they cannot delete user lessons.
- [ ] Knowledge Library: `knowledge.db` with FTS5 + graph + vectors over your documents. Tools: `knowledge_list_sources`, `knowledge_dedup`.
- [ ] Crew Members (preview): a named crewmate = template + workspace + private memory store + model, with a standing thread per member. Delegate with `crew=`.

### 1.4 Skills (format, lifecycle, self-evolving)
- [ ] Layout: `~/.kiro/crew/skills/<name>/SKILL.md`. Nested names are allowed (`utils/tiny-url`). The directory may hold scripts and assets, and its `dir` path is shown to the model.
- [ ] Source precedence:
  1. Global `~/.kiro/crew/skills/`
  2. `skills.extra_paths` (read-only)
  3. `<project>/.kiro/skills/`, which needs an explicit per-directory trust grant stored in `trust/project-skills.json` (mode 0600, keyed by realpath)
  - Built-in and `$KIROCREW_PROJECT_DIR/skills` are copied into global on startup.
- [ ] Hard switch: `skills.project_skills_enabled` (default true). A malformed config fails closed.
- [ ] Loading modes:
  - `always: true` injects the full body. All pinned bodies share a 99,000-byte cap (`PINNED_SKILL_BODIES_CAP`) and overflow raises an error.
  - Everything else is on demand: a bounded, usage-ranked index (`skills.lazy_load` = true), and the agent reads the file.
  - Triggers: word-overlap ≥ 70% per phrase, with `!` negatives. Off by default (`skills.max_triggered` = 0).
  - `inject_on_trigger: false` reduces a match to a one-line pointer.
- [ ] Tools:
  - `skill_search(query, limit≤50; default 20)` with actions search, list and read (offset pagination).
  - `skill_discover` (public registry such as skills.sh, plus GitHub `owner/repo[@ref][:path]`).
  - `skill_fetch` (read without installing, 32 KiB cap, untrusted-content prefix).
- [ ] `$skill` token expansion and `@name` mention to load a skill.
- [ ] Usage ledger in `skill-usage.json` (30-day TTL) plus a SQLite term index.
- [ ] GitHub import is a copy pinned to a commit (`.skill-import-source.json`). All-or-nothing; filenames limited to ASCII, under 64 chars, at most 4 levels deep. Installed only by a human from the dashboard.
- [ ] Self-evolving auto-skills. Off by default: `skills.auto_create_from_sessions=false`.
  - Runs on the 3h-idle consolidation pass.
  - Eligibility: at least 5 tool-call messages, and no tool touched `~/.aws`, `~/.ssh`, IMDS, `.env` and similar.
  - Output is redacted (credentials + exfiltration URLs) and capped at 10,240 chars.
  - Jaccard dedup at 0.85.
  - Candidates are staged to `auto/.pending/<slug>/` (`approval_required=true`). Approval promotes them to `auto/<slug>/`.
- [ ] Auto-skill lifecycle:
  - Stages: active → stale after 30 days → archived after 90 days.
  - `max_auto_skills` = 100. Pending TTL is 30 days.
  - Optional validated Python helper scripts: AST/regex policy, no exec, network or process spawning, at most 4KB. A script-bearing candidate never auto-publishes.
  - `auto_refine_on_deviation` (opt-in) rewrites only `auto/` skills. Refinement uses the `judge_model` config key (default value `"claude-haiku-4.5"` per the spec).
  - The `crystallize` built-in skill creates a candidate on demand.
  - Every create, refine or reject writes a SEL audit event.

### 1.5 Hooks (event names and semantics)
- [ ] Five chat lifecycle events (kiro-cli compatible): `AgentSpawn`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`. `SessionLaneChanged` is specified but still pending.
- [ ] Stored in `~/.kiro/crew/hooks.json`. Hook fields:
  - `event`
  - `matcher`
  - `matcher_mode` (`glob` default, `regex`, `contains`; message events only)
  - `command`
  - `skills` (inject skills instead of running a command; only on AgentSpawn and UserPromptSubmit)
  - `timeout` (1–300s, default 30)
  - `enabled`
- [ ] Exit semantics:
  - AgentSpawn and UserPromptSubmit: exit 0 appends stdout to context. UserPromptSubmit exit 2 blocks the prompt.
  - PreToolUse: 0 = allow; 2 = deny, and stderr goes to the model; **anything else, including timeout or crash, = deny (fail-closed)**.
  - PostToolUse: informational.
  - Stop: stdout `{"decision":"block","reason":"..."}` injects the reason and forces another turn.
  - Non-gating events are warn-only on a non-zero exit.
- [ ] A PreToolUse hook is only informational where the harness already approved the call.
- [ ] Tool matchers: exact, `prefix*`, `*suffix`, `*contains*`, `*`; kiro-cli also has `@server`, `@server/tool`, `@builtin`. Aliases: `fs_write|write`, `fs_read|read`, `execute_bash|shell`, `use_aws|aws`.
- [ ] Execution: `/bin/sh -c`, or `%ComSpec% /c` on Windows. Env is `KIROCREW_HOOK_EVENT` + `KIROCREW_HOOK_CONTEXT`, and stdin carries the event JSON (`hook_event_name, cwd, session_id, tool_name, tool_input[, tool_response|prompt]`).
- [ ] Hook env is an allowlist only: PATH, home, temp, locale, TLS trust, `KIROCREW_HOME`. `HTTP(S)_PROXY` is dropped.
- [ ] Dashboard `/hooks`: create, save (enabled on save), toggle, Test (a real run showing exit, duration, stdout, stderr), two-click delete, per-row run history. Provider hooks are shown read-only.
- [ ] Config-level "hooks" in `config.json` → `hooks`:
  - `auto_approve_tools` / `auto_deny_tools` (deny beats approve)
  - `auto_replies` (pattern → reply that skips the LLM)
  - `transforms` (prefix)
  - `context_rules` (keyword → injected context)
  - Order: deny > approve, then auto-reply → transform → context.
- [ ] `agent.kiro_hooks`: user kiro-cli hooks merged after bundled ones and deduped on (command, matcher). The command must be an absolute path outside sensitive paths.
- [ ] Steering files: `~/.kiro/steering/**/*.md` and `<project>/.kiro/steering/**/*.md`. Frontmatter `inclusion: always|fileMatch|manual|auto`, `fileMatchPattern`, `name`, `description`. Limits: 500 files, 256KiB each, 10% of the context budget.
- [ ] Saved prompts: `~/.kiro/prompts` and `<project>/.kiro/prompts`, invoked as `@name`.

### 1.6 Task runner (TASK.md)
- [ ] Input is any non-empty text or Markdown spec, or inline via `task_run(spec="__inline__: Step 1 ... Step 2 ...")`. Headings and numbered steps are a convention, not a schema.
- [ ] An LLM decomposer returns `{"steps":[...],"acceptance_criteria":[...]}`. Each Task has:
  - `index`, `title`, `description`
  - `status` (PENDING, IN_PROGRESS, REVIEWING, PASSED, FAILED, SKIPPED, CANCELLED)
  - `attempts`, `depends_on[]`
  - `requires_approval`, `force_approval` (blocks even in YOLO and fails closed when headless)
- [ ] Project status values: pending, planning, planned, running, pausing, cancelling, paused, completed, failed, cancelled.
- [ ] Each step gets a fresh session with full memory and skill injection. The step prompt contains:
  1. Role
  2. Git log and diff stat
  3. Completed steps
  4. The current step with the spec
  5. The previous error, on retry
- [ ] Git coordination: a `git worktree` on branch `kirocrew/task/{task_id}`, a commit per passed step, `reset --hard HEAD~1` when review fails, and independent self-review of `git diff HEAD~1` in a separate session. A non-git folder runs in place.
- [ ] Parallel groups from `depends_on`, bounded by a semaphore (`taskrunner.max_parallel_steps`, memory-sized by default).
- [ ] Reliability:
  - Retries, replan budget and cycle detection (2nd identical error warns, 3rd fails the step as "Loop detected").
  - Activity-aware watchdog that resets a stalled session.
  - Checkpoint file `TASK_PROGRESS.md` and `runs.json` persistence.
  - After a crash, running tasks become paused; resume with `POST /api/taskrunner/{id}/execute`.
- [ ] Approval: interactive through the dashboard or chat. `kirocrew run TASK.md` is headless and deny-by-default: only `hooks.auto_approve_tools` matches run, and shell auto-approvals are re-verified against PATH shadowing. Optional per-run `auto_approve` trust flag.
- [ ] CLI: `kirocrew run TASK.md [--fresh] [--no-test] [--timeout N]`. Slack: `run <path>`, `run status`, `run cancel`.
- [ ] REST: `/api/taskrunner` (GET/POST), `/cancel`, `/plan`, `/from-chat`, `/{id}/retry {from_step}`, `/{id}/pause`, `/{id}/execute`, `/{id}/to-chat`, `/{id}/plan.yaml`, `/refine`.
- [ ] Dashboard Compose tab rewrites rough input into Goal / Requirements / Acceptance Criteria with no tools, then offers "Run This Spec".
- [ ] Notifications: 🚀 started, 📋 plan ready, ✅/❌ per step, ⚠️ stall, 💀 process died, 📝 lesson learned. Failures become lessons.
- [ ] Dynamic Workflows (separate feature): the agent authors a multi-phase orchestration script, runs it in the background, and supports a live panel, partial restart from cache, and a saved library.

### 1.7 Schedules, cron, webhooks, heartbeats, script-only jobs
- [ ] Cron tools: `cron_add`, `cron_list`, `cron_update`, `cron_remove`, `cron_remove_all`, `cron_pause`, `cron_resume`, `cron_trigger`, `cron_secret_request` (server `kirocrew-cron`). Store is `crons.json` with cross-process file locking.
- [ ] Schedule types:
  - `every=<sec>` (minimum 60)
  - One-shot `at=<unix>` / `delay=<sec>` / `at_time="tomorrow 9am"`
  - `cron_expr` (5-field, dow 0=Sun)
- [ ] Job fields:
  - `name`, `message`, `agent` (or `agent_sequence`)
  - `approval_mode` (`auto` or "")
  - `silent` (agent must notify via `send_message`)
  - `persistent_session` (default true: session `cron:{id}`, `last_result` prepended; false: fresh `cron:{id}:{uuid}`)
  - `skip_dates[]`, `timezone` (IANA)
  - `strict_schedule` (no jitter)
  - `hide_in_chat`, `env`
- [ ] Jitter: hourly jobs 0–5 min, daily or weekly jobs 0–59 min, sub-hourly and one-shot jobs none.
- [ ] Budgets: 30 min per agent wake, 30s for script jobs, 300s for command jobs. A zombie reaper sweeps every 60s with a 30 min deadline.
- [ ] Failure alerts go to the bell and Slack DM, deduped by reason (the DM re-sends after 1h), then the job auto-pauses.
- [ ] A persistent job owns one chat tab, `Cron: <name>`, with paired rows `# Cron Run: <name> | <ts tz>` / `# Cron Job Result: ...` and a hidden marker `<!-- cron-run:<id>:<epoch> -->`.
- [ ] Ownership and delivery: `session_key` sets both. `kirocrew cron adopt <id> --session-of <slot> | --release` is CLI-only and guarded by a deny rule.
- [ ] Script-only jobs (no LLM):
  - `script="~/.kiro/crew/crons/file.py:function"` receives a `ctx` with `ctx.message`, `ctx.notify()`, `ctx.call_tool(server, tool, args)`. Flow control via `raise Skip()`, `Done()` (removes the job) or `Report(msg)`.
  - `command="<shell>"` runs a shell command.
  - Preview with `kirocrew cron preview file.py:run --message ...`.
- [ ] CLI: `kirocrew cron add NAME MSG --every N | --cron EXPR --approval-mode auto`, `cron update|list|remove|pause|resume|trigger|adopt|preview`. The dashboard `/schedule` page has list, calendar and execution views plus folders.
- [ ] Heartbeat:
  - Every 60s the gateway reads `workspace/HEARTBEAT.md`: one task per line; `#`, blank lines and HTML comments are ignored; list markers are stripped.
  - The agent includes the sentinel `HEARTBEAT_KEEP` (case-insensitive) to keep a task. Tasks without it are removed. Tasks that raise stay for retry.
  - Runs as agent `kirocrew-heartbeat` in session `_hb`, with a 1800s timeout per task.
  - Tool approval is only an exact-name `HEARTBEAT_SAFE_TOOLS` read-only allowlist; user auto-approve rules are dropped.
  - The session is recycled at 70% context or 40 prompts.
  - The same tick also rebuilds FTS every 15 ticks and runs retention prune every 1440 ticks.
- [ ] Heartbeat delivery tags:
  - `<!-- deliver:prompt:dashboard:<slot> -->`
  - `<!-- deliver:dashboard[:<slot>] -->`
  - `<!-- deliver:slack[:<chan>[:<thread_ts>]] -->` (channel must be allowlisted, otherwise falls back to the owner DM)
  - `<!-- deliver:silent -->`
  - Default is set by `heartbeat.default_deliver`.
- [ ] Inbound webhooks:
  - `POST /api/hooks/agent` with `Authorization: Bearer` or `X-KiroCrew-Token`.
  - Body: `{message (≤49,999), sessionKey "hook:<id>", name, agent, deliver=true, timeoutSeconds (default 599, clamp 60–3593)}`.
  - Fire-and-forget: the response is `{"status":"accepted","sessionKey":...}`, and the result goes to notifications (dashboard 2,000 chars, Slack DM 3,000 chars).
  - Sessions are ephemeral.
- [ ] Webhook checks, in order:
  1. Global switch (503)
  2. Token (401)
  3. Source paused (503)
  4. Body ≤ 256KiB (413)
  5. HMAC
  6. Payload validation (400)
  7. Agent conflict (409)
  8. `session_busy` (409)
  9. Concurrency, max 6 (429)
  - Auth failures: 10 per 60s triggers a 429 lockout for 300s.
- [ ] HMAC signing:
  - Headers `X-KiroCrew-Timestamp` and `X-KiroCrew-Signature: sha256=<hex>`.
  - Signed string is `{ts}.{raw body}`, with a ±300s window.
  - New tokens require a signature. The secret is shown once, then stored hashed.
- [ ] Webhook sources: each source maps to an operator-chosen agent.
  - Management API: `/api/webhooks` (`tokens` CRUD, `switch`, `test`, `contexts`).
  - `register_hook(hook_id, context_summary≤5000)` stores resume context in `hooks.json`. Context under 1h is injected verbatim, 1–24h with an "outdated" prefix, and after 24h it is dropped.
- [ ] Monitor loops:
  - `monitor_start`, `monitor_watch`, `monitor_update`, `monitor_stop` run in the same conversation.
  - Default cap is 24 cycles when the agent arms a loop; the 🎯 goal control's field starts at 0 = unlimited. Optional wall-clock budget.
  - Deadline-preserving interval. One loop per session. Survives restarts.
  - PR watch probes the provider directly and costs zero turns when nothing changed.
  - `kiro_crew.irq` lets apps watch without model calls.

### 1.8 Subagents and delegation
- [ ] `spawn_run` parameters:
  - `task` / `tasks[]`, `agent` / `agents[]`
  - `solo_reason` (`parent_parallel|bulk_data|fresh_context|specialist|user_requested`) + `solo_details`. The gate refuses an unexplained single child.
  - `include_memory`, `include_lessons`, `include_project`
  - `max_turns` (≤1000), `model`, `reasoning_effort` (`low…max`)
  - `keep` (continuable), `cwd` (must be under `subagent_cwd_allowed_roots`)
- [ ] Other spawn tools: `spawn_sub_agents` (blocking), `spawn_continue`, `spawn_steer` (`interrupt|follow_up`), `spawn_release`, `spawn_list`, `spawn_status(agent_id, offset, limit, grep)`, `wait`, `resource_status`.
- [ ] Results arrive as a `[Subagent completion event]` injected into the parent. Truncation settings:
  - `agent.completion_keep`: head (default), tail or both.
  - `completion_keep_chars` = 3000.
  - The full transcript is kept at `subagents/<id>/result.txt` for `subagent_result_ttl_secs` = 3600.
- [ ] Limits:
  - Concurrency auto-sized (`agent.max_subagents=0`; floor 3, ceiling `subagent_auto_max`=32).
  - Timeout 3h (`subagent_timeout_secs`).
  - Keeps a 4GB free-memory floor.
  - Nesting allowed.
  - Task strings are redacted.
- [ ] Slack: `spawn <task>` / `bg <task>`, `spawn list`, `spawn status`. Results also go to the dashboard over WS and to a Slack DM with an ack button.

### 1.9 Surfaces
- [ ] Dashboard (React SPA, `http://localhost:5476`, loopback only, token auth even on loopback). Routes:
  - `/chat`
  - `/settings/*` with tabs Overview, Imports, Chat, Display, Voice, Notifications, Shortcuts, Skills, Channels, Browser, Computer Use, Webhooks, Remote Crew, Privacy, Security, Connections, Secrets, Developer, Releases, About
  - `/capabilities` (crews, agents, MCP, skills, knowledge, steering, hooks, prompts, workflows)
  - `/schedule`, `/developer` (logs, metrics, storage, MCP pooling, debug), `/logs`, `/hooks`, `/apps`, `/artifacts`, `/deploy`, `/notifications`, `/members` (preview)
- [ ] One WebSocket carries all realtime events: `chat_chunk`, `chat_done`, `chat_message`, `chat_error`, `tool_call`, `notification`, `slots`, `slot_title`, `approval`, `subagent_done`, `task_update`, `task_complete`, `proactive_notification`, `app_reload`, `log`, `refresh`, `error`.
- [ ] Dashboard extras: 14 themes, voice STT/TTS, command bar, Browser panel (Playwright), computer use (AX layer, opt-in), feature tips and videos, a settings deep-link registry, and a Remote Crew hub.
- [ ] CLI commands:
  - Start here: `gateway [--port --slack-only --no-crons --no-tunnel]`, `service install|uninstall|status`, `doctor`
  - Chat: `chat [-m msg] [--model]`
  - Setup and lifecycle: `setup [--agent-only --slack --whatsapp]`, `status`, `stop`, `restart`, `logs [-f]`, `update`, `token`, `logout`
  - Config and secrets: `config get|set|edit|defaults`, `secrets import`
  - Work: `cron …`, `spawn run|list`, `run TASK.md`, `learn add|list|remove`, `memory show|export|backup|list`, `consolidate`, `knowledge stats|dedup`
  - Agents and apps: `agent list|create|update|delete|reset-model`, `app install|list|info|enable|disable|uninstall [--purge-data]|dev|import`, `artifact …`
  - State: `snapshot`, `restore`, `ledger-sweep [--purge]`
  - Security and policy: `security events [-n]|verify|audit`, `policy show|explain`, `sandbox install-profile|status|remove-profile`, `yolo`
  - Remote and ops: `cloud launch|list|connect|tunnel|…|destroy`, `tailnet status|up|down`, `telemetry status|disable|enable`
  - Other: `computer apps|state|call|doctor`, `eval`, `manifest`, `pod …`
  - Internal: `mcp-core|mcp-cron|mcp-computer|mcp-dashboard|…`
  - Every CLI command has an MCP twin (the "MCP-first rule").
- [ ] Messaging channels: Slack, Discord, Telegram, Teams, Webex, WeCom, Weixin, iMessage, WhatsApp, Feishu. They share one channel-neutral core, and a capability matrix covers streaming, edits, reactions, files, widgets, threads, split length and approval wait.
- [ ] Slack:
  - Owner-only (`/kirocrew users` always refuses).
  - Channel modes: `always|mention|observe|review|off`.
  - Commands: `!yolo [on|off|renew]`, `!agent <name>|off`, `!ta` (thread agent), `!channel …`, `!voice`, `!link-to-dashboard`, `!dashboard [2h]` (HMAC-signed, IP-pinned, single-use link, 5 min to use, up to 20h session), `!stop`, `!compact`, `!incognito`, `!temporary`, `status`, `ping`, `cron …`, `spawn …`, `run …`, `sessions`.
  - Slash commands: `/kirocrew dashboard|agent|voice|yolo|config|channels`.
- [ ] Discord: `!new|!start`, `!compact`, `!model[s]` (button picker), `!status`, `!sessions`, `!link|!unlink` (mirror dashboard), `!stop|!cancel`, `!help`.
- [ ] Telegram:
  - Slash-style commands (`/compact`, `/incognito`, `/temporary`).
  - Config keys: `allowed_user_ids` (empty = nobody), `soft_threshold_pct` = 80, `show_thinking`, `voice_replies`, `allow_forum` + `allowed_forum_chat_ids`, `forum_activation` (`always|mention`), `session_folder`.
- [ ] Approval prompt waits: Slack 120s, most other channels 300s.

### 1.10 MCP
- [ ] Config files:
  - User-owned global `~/.kiro/settings/mcp.json`: read-only, never written.
  - Crew additions and per-tool disables in `~/.kiro/crew/mcp.json`.
  - Everything is rendered into one `~/.kiro/agents/kirocrew.json`.
  - `includeMcpJson` is pinned false.
- [ ] Managed servers:
  - `kirocrew-core`: spawn, learn, task, messaging (`send_message`, `send_notification`, `file_send`, `update_message`…), artifacts, workflows, knowledge, `memory_recall`, `skill_*`, directives (`ask_question`, `suggest_followup`, `monitor_*`, `set_project`, `reset_conversation`, `chat_tag`)
  - `kirocrew-cron`
  - `kirocrew-computer`
  - `kirocrew-dashboard`
  - `kirocrew-work`
  - `kirocrew-crew-log`
  - `kirocrew-debug`
  - `kirocrew-panel`
- [ ] Invariants: every capability ships as an MCP tool (not just a CLI command), and MCP tools must be stateless per caller so a pooled backend can serve many sessions.
- [ ] Connections page: a catalogue of 28 providers, custom stdio or remote servers, OAuth (per-provider app-registration guides), health badges, probe quarantine, live reconcile without restart.
- [ ] MCP Apps: interactive MCP tool output rendered in chat, behind 2 gates. Enterprise MCP governance guide available. Auto-approve by `@server` / `@server/tool`.

### 1.11 Apps kit
- [ ] Manifest `app.json`:
  - Required: `name` (kebab-case; reserved names include system, library, registry, registries, blob, install, register and Windows device names), `version` (semver), `displayName`, `description`.
  - Recommended: `author`, `license`, `minKiroCrewVersion`, `tags`, `jobFamilies`, `highlights`, `useCases`, `configuration`, `screenshots[Dark]`.
  - Admission: `signer`, `signature`.
  - Resources: `agents[]`, `skills[]`, `sops[]`, `mcpServers{}`.
- [ ] Manifest behaviour:
  - `crons[]` entries each need `every` or `cron_expr`.
  - `ui`: `entry`, `pages[]` (`route`, `label`, `icon`, `entryPoint`, `mountFunction`), `sidebar` (`section`, `order`), `overlays[]` (`id`, `replaces`).
  - `contributes`: `commands` (command bar), `sessionControls` (composer), `fileMenuItems`, `panelTabs` (chat side panel).
- [ ] Manifest backend and lifecycle:
  - `backend`: `entryPoint`, `port` (default auto), `healthCheck` (default /health), `routes`, `type` (`python|asgi|node|exec|""`). Proxied at `/apps/{name}/api/*`.
  - `backend.hooks`: `routes`, `on_startup`, `on_shutdown` (`module:callable`, run in the gateway, ordered by app name, exceptions logged).
  - `setup`: `onInstall`, `onUninstall`, `onEnable` (rollback on failure), `onDisable`, `on*Timeout` (default 30), `configSchema`.
  - Also: `dependencies`, `lifecycle`, `resources`, `platform` (`os[]`, `installMode: client`, `requiresDesktopApp`), `openCommand`, notification channels, artifact publish provider.
  - Unknown fields are preserved (forward compatibility).
- [ ] Permissions (`permissions`):
  - `api[]` (path prefixes; `/x`, `/x/*`, `/x*` semantics)
  - `events[]` (WS event types; publishing is limited to the declared list)
  - `mcpTools[]`, `storage` (KV, keys may not contain `..`, `/`, `\`)
  - `cron` (app-owned jobs: add, list, update, remove only its own; purged on disable)
  - `memory` (`""|app-scoped|shared`), `network`, `sessionApproval`
  - `spawn` (gates `ctx.spawn`), `jobs` (durable `ctx.jobs`), `exposeToApps[]`
  - Most fields are advisory in-process; `spawn`, `jobs` and `sessionApproval` are enforced.
- [ ] Frontend SDK `@kirocrew/app-sdk`, provided by the host import map: `useAppApi` (`raw`, `request`, `get`, `post`, `put`, `patch`, `del`; the host owns `X-Session-Key`), `useAppEvents`, `useAppInfo`, `useCron`, `useNotify`, `useNavigate`, `useNavBadge`, `useTheme`, `useChatLauncher`. Embedded and native chat panels plus a chat marker protocol.
- [ ] Backend `ctx`: `ctx.cron.*`, `ctx.spawn`, `ctx.jobs`, `ctx.scrub.outbound`, `ctx.audit.record`, `ctx.logger`, storage, events. Python client `kirocrew-client` (unpublished). App secret in `apps/<name>/.app_secret`, exchanged for a token.
- [ ] App store: 24 built-in apps, registries, signed admission, third-party execution deny-by-default, every load audited, `app dev` live reload, `app import` from plugin packages. Uninstall keeps `apps/<name>/data/` unless `--purge-data`.

### 1.12 Security
- [ ] Layers (deep dive):
  - L0: OS sandbox. Linux namespaces with bind mounts; macOS Seatbelt; Windows delegates to kiro-cli's own sandbox.
  - L1: resolved-path filesystem gate.
  - L2: command gate.
  - L3: input validation.
  - L4: output redaction.
  - L5: HMAC-chained audit log (SEL).
  - Plus the governance ceiling and request auth. The marketing page calls this "8 layers".
- [ ] Sandbox config:
  - `agent.sandbox` = `auto` (default) or `off`. Internal tiers are off < standard < cc < strict.
  - Standard hides `.gnupg`, `.gpg`, `.config/gcloud`, `.azure`, `.docker`. Strict also hides `.aws`, `.ssh` (except known_hosts) and `.kube`.
  - If no sandbox backend is available, spawning fails closed unless `agent.sandbox_allow_unsandboxed_exec=true` (the platform default is allow on Windows).
- [ ] Env stripping:
  - Removed: `AWS_SECRET*`, `AWS_SESSION*`, `AWS_ACCESS*`, `OAUTH*`, `SSH_AUTH_SOCK` (unless consent is recorded in `ssh_auth_sock_consent.json`), `GNUPGHOME`, `GIT_ASKPASS`.
  - `PYTHONPATH`, `PYTHONHOME` and `PYTHONPYCACHEPREFIX` are stripped for agent children.
  - Hooks and install scripts get an allowlisted env.
- [ ] Sensitive paths (read+write blocked, symlink-resolved, `O_NOFOLLOW`):
  - `~/.aws`, `~/.ssh`, `~/.gnupg`, `~/.netrc`, `~/.npmrc`, `~/.git-credentials`, `~/.config/gcloud`, `~/.azure`, `~/.docker/config.json`, `~/.kube/config`
  - SSO cookie store, `.env`, `.vault`
  - Keystone files: `security_policy.json`, `profiles/`, `admission_policy.json`, `denied_commands.json`, SEL key and log, dashboard token key
  - Write-only block: `config.json` and `config.local.json`.
  - Shell startup files are NOT protected (a documented gap).
- [ ] Denied-command rules (`BUILTIN_DENIED_RULES`, each `{id, pattern, category, description}`; default ON; toggle per rule, disable all, or add user rules with a `note` shown to the agent):
  - Categories: credential exfiltration, destructive, git-publish or protected-branch, self-protection, reverse-shell, pipe-to-shell.
  - Enforced only at the gateway's own PreToolUse gate, never written into the agent JSON.
  - Deny and governance checks run before trust or YOLO.
- [ ] Other command-level checks:
  - `is_sensitive_bash_command` tokenizes quoting, `$HOME` and `~`, and catches IMDS under any IP encoding plus env dumps.
  - Exfiltration shapes: `curl -d @file`, `--upload-file`, `wget --post-file`, `/dev/tcp/`.
  - Structured params for `use_aws` are converted to a command (`DeleteStack` → `delete-stack`) before matching.
- [ ] Redaction:
  - `redact_credentials` covers plaintext and base64 forms: AWS keys, private keys, Slack and forge tokens, registry tokens, DB URIs.
  - `redact_exfiltration_urls` is domain-agnostic.
  - `StreamRedactor` handles secrets split across stream chunks.
  - Rules: decode before screening; redact before truncating. Applied at every egress point, including the SEL.
- [ ] Input validation: NFC normalization and hidden-character stripping. Length caps: tool name 256, short 500, medium 5,000, long 50,000. Responses truncated at 100,000.
- [ ] Approvals:
  - Decisions: `trust_command`, `trust_base` (e.g. `ls *`), `trust_reads`, `trust` (slot), `yolo`. Patterns are derived from the real `tool_input`, not the display title.
  - Modes: `normal|trust_reads|trust|yolo`.
  - `agent.yolo_duration` = 6h (max 24h, or `until_shutdown`), with a 5 min renewal grace.
  - `agent.dangerously_skip_permissions` can only be set in the config file.
  - YOLO grants are audited fail-closed.
  - Batch reject is available in the UI.
- [ ] Audit (SEL): append-only and HMAC-chained in `security_events.jsonl`. Access via `/api/sel/events`, `/api/sel/verify`, `kirocrew security events|verify`. The daily prune runs from the heartbeat.
- [ ] Other controls:
  - Secrets vault: AES-256-GCM, a `secret://` reference is left in `.env`, and the panel lists names only.
  - Dashboard auth: HMAC tokens, CSRF Origin check, Host allowlist.
  - Slack owner lock.
  - Observe-mode history recorded only from authorized senders.
  - Thread roots are injection-screened.
  - Resource ceilings: cgroup v2 on Linux, Job Objects on Windows.

## 2. Specifics worth mirroring exactly

**SKILL.md (Crew superset of the agentskills.io standard):**
```markdown
---
name: my-skill                 # optional in Crew; std: required, =folder, [a-z0-9-], ≤64
description: When to use it    # std: required ≤1024; drives on-demand activation
always: false                  # true = full body every session (shared 99KB cap)
triggers: kw1, multi word, !neg  # ≥70% word overlap; ! = exclude (needs max_triggered>0)
inject_on_trigger: true        # false = one-line pointer
repo_scope: path/fragment      # only in matching project trees
tags: a, b                     # dashboard editor field
# std optional: license, compatibility, metadata
# auto skills add: source: auto, session_key, created_at, refined_at, reuse_count
---
```
Directory layout is `SKILL.md` plus optional `scripts/`, `references/`, `assets/`. In kiro-cli, each skill is also a `/slash-command` with `$ARGUMENTS` substitution.

**TASK.md:** free-form Markdown. The convention is `# Task: X` / `## Steps` / a numbered list, and optional Goal / Requirements / Acceptance Criteria (what Compose outputs). The planner output is `{steps[{title,description,depends_on,requires_approval,force_approval}], acceptance_criteria[]}`. The checkpoint file is `TASK_PROGRESS.md`.

**HEARTBEAT.md:**
```md
# Heartbeat Tasks
- check my pipeline status <!-- deliver:slack:C0123 -->
- [ ] summarize open PRs <!-- deliver:prompt:dashboard:chat-0 -->
```
Put `HEARTBEAT_KEEP` in the response to keep the task.

**Hook file (Crew hooks.json entry):** `{event, matcher, matcher_mode, command, skills[], timeout, enabled}`.
kiro-cli standalone form in `.kiro/hooks/<id>.json`:
`{"version":"v1","hooks":[{"name","trigger":"PreToolUse","matcher":"fs_write","action":{"type":"command|agent","command":"./guard.sh"},"enabled":true,"timeout_ms":30000,"cache_ttl_seconds":0}]}`.
Stdin payload: `{"hook_event_name","cwd","session_id","tool_name","tool_input","tool_response"?, "prompt"?}`.
Stop-hook continuation: `{"decision":"block","reason":"..."}`.

**App manifest skeleton:** see section 1.11. Minimal example:
`{name, version, displayName, description, agents[], skills[], crons[{name,every|cron_expr,message,agent?}], ui{entry,pages[{route,label,icon}]}, permissions{api[],events[]}, platform{os[]}}`.

**CLI:** see section 1.9. Note the `kirocrew --help` taxonomy: a "Start here" section containing exactly `gateway`, `service`, `doctor`, and a registration helper that refuses any command not assigned to a help section.

**Default deny patterns (examples, SS/security.md):**
- Credential exfiltration:
  - `.*echo.*\$AWS_(SECRET|ACCESS|SESSION).*`
  - `printenv AWS_SECRET*`
  - `env | grep AWS_*`
  - `.*python.*boto3.*get_credentials.*`
  - `.*(curl|wget).*169\.254\.169\.254.*`
  - `.*curl.*\$AWS_(SECRET|ACCESS).*`
  - `aws s3 (cp|mv|sync) .* s3://.*`
- Destructive:
  - `rm -rf`
  - `git push` to protected or ambiguous targets, including force pushes (force-pushing an explicit feature branch is allowed)
  - `aws * delete-*`, `aws ec2 terminate-instances`, `cdk destroy`, `terraform destroy`, `TRUNCATE TABLE`
- Self-protection: an argv-structural check covering `kirocrew restart|update|cloud`, `gateway restart`, minting a dashboard token, killing the gateway, inline interpreters that import kiro_crew, and `self-protection-cron-adopt`.
- Explicitly allowed: `aws sts assume-role` and read-only AWS commands such as `describe-*`, `list-*`, `get-*` (via `credential_process`).

**Governance precedence (SS/governance.md):**
- `effective = POLICY ∩ PROFILE`, tightest wins.
- The four archetypes compose differently:

| Archetype | Rule within a level | Rule across levels |
|---|---|---|
| `ScopedRuleset {mode, allow[], deny[]}` | allow beats deny | allow = ∩, deny = ∪ |
| `OrdinalControl` | n/a | strictest wins. Scales: approval yolo < auto < interactive; sandbox off < standard < cc < strict |
| `CapabilityGate {enabled, scopes}` | n/a | AND |
| `ScopedMap` | n/a | members use ScopedRuleset; posture is policy-only |

- Matchers: `identifier`, `command`, `path` (lexical, no realpath), `host`, `mcp`.
- Policy tiers, highest first:
  1. Centrally distributed document (`KIROCREW_POLICY_URL`, last-known-good cache)
  2. `KIROCREW_SECURITY_POLICY` env path
  3. Bundled edition resource
  4. `~/.kiro/crew/security_policy.json`
  5. None (ungoverned)
  - Tiers 2–4 are mutually exclusive. A lower tier can only tighten.
  - An invalid present policy fails closed.
- Scopes: `commands`, `tools`, `mcp`, `filesystem.read|write`, `network.egress`, `channels`, `approval_mode`, `approval_modes`, `sandbox.min_level`, `agent_backend`, `yolo_duration`, `updates`, `distribution`, and `capabilities.{spawn,messaging,cron,memory_writes,script_hooks,telemetry,publish,browse,decisions,…}`.
- Example: `{"version":1,"boot":{"fail_closed":true},"capabilities":{"telemetry":{"enabled":false}}}`.
- Inspect with `kirocrew policy show|explain` (CLI only).

## 3. Known weaknesses and complaints (documented)
- **Lock-in to kiro-cli and a Kiro plan.**
  - kiro.dev/crew states a Kiro account and plan are required, and every model call counts against the plan, including cron, heartbeat and background reasoning. Plain scripts are free.
  - Open issues: #5155 "Make Kiro CLI an optional provider prerequisite" and #1693 "pluggable model providers: Ollama/Bedrock/OpenAI-compatible" (one of the most-upvoted issues).
  - Codex and Claude Code backends exist but have per-harness gaps: #12451, #12215, and `resources` not honoured on the CC backend.
- **Cost visibility is weak.** Examples:
  - #10102: no running credit total or per-session breakdown.
  - #6338: no spend limit per session.
  - #4721: no credit usage in subagent completion events.
  - #11031: no credit usage on cron results.
  - #11523: no usage shown after a stop.
  - #8531: about 33% of spend is attributed to "unknown" model.
  - #3296 / #7623: the credit indicator regressed.
  - Apps must bound their own spawn cost because there is no per-app rate limit.
- **Security gaps (self-documented):**
  - No default network egress control.
  - The regex command gate is "friction, not a boundary".
  - No SEL audit UI (API only).
  - No in-agent sandbox-escape canary.
  - A short base64 fragment can evade redaction.
  - `~/.bashrc` persistence is possible.
  - Launcher self-poisoning is accepted.
  - Crew's own masks are skipped when isolation is delegated to kiro-cli's sandbox (macOS internal sandbox and Windows).
  - No cgroup limits on macOS.
  - App permissions are mostly advisory because apps run in-process with gateway privileges.
- **Heavy and complex:**
  - Idle CPU spike of about 3250% on WSL2 (#4707).
  - Unbounded gateway memory with in-process embeddings (#6216).
  - N×M MCP processes from task exec (#3259).
  - Windows loop-stalls and missing MCP tools (#9559).
  - Blank dashboard in WebKit over Tailscale (#9399).
  - OAuth MCP stuck on 401 (#3310).
  - Custom agents lose native tools (#9602).
  - Very large specs (memory spec about 5k lines) and many preview-gated features (Webhooks, Crew Members).
  - Getting Started is unclear for tasks (#2427).
- **Single-user only.** Slack multi-user is refused. Team, SSO and shared memory are open requests (#12673, #12942).
- **Heartbeat limits:** one line per task, edits made during processing can be lost, retry has no maximum, and the tool allowlist is hand-curated.
- **Other:** no Stop-hook opt-out for PreToolUse fail-closed (#7547). The skill trigger default is off, so skills mostly depend on model self-selection.
