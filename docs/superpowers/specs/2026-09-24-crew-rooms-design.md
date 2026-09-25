# Crew rooms and live workspace

## Intent

An addition to the existing ShuaCrew Mac app: the user talks to a customizable
crew in one room, sees real delegation, and can understand and control the work.
The user approved the recommended shared-room and visual-workspace direction.
This written specification is awaiting review; it does not claim implementation.

## Approach

Extend the existing event store and Supervisor, rather than introduce another
agent framework. A decorative virtual office would add animation without useful
control; a transcript-only room would hide dependencies. Combine a readable room
conversation with a compact live task graph and an inspectable work feed.

## Room model

A room has a title, coordinator member, explicit member list, optional project
scope, and supervised permission policy. Durable events record room creation,
messages, assignment requests, accepted assignments, results, and pause/resume.
Each message identifies its real author, source run, and related assignment.
Assistant prose or tool output cannot impersonate another member or execute an
assignment merely by containing an @mention. User @mentions select recipients;
agent delegation requires a validated tool call.

## Delegation

The coordinator can invoke a room-scoped delegation tool available only to that
room's authorized run. It selects an opted-in member and a concrete task. The
gateway creates a supervised child run through the existing runtime adapters,
with immutable parent/room links. Cross-provider work uses each installed,
authenticated subscription runtime; unavailable providers show a real error.

Initial limits: one coordinator turn, up to three active children, eight child
assignments per user request, and depth one. Specialists return results and may
request help through the coordinator but cannot recursively spawn colleagues.
Repeated tool request IDs return the same assignment; limits survive restart.
No agent-to-agent endless chatter, fabricated progress, or automatic retry of an
uncertain external action. Failed tasks remain visible and require an explicit
retry. A coordinator summary cites which assignments succeeded or failed.

Rooms inherit existing deny rules and approval UI. Delegation never loosens
policy, approves pending requests, grants OS access, or adds credentials. Work
that edits one project must use isolated worktrees or explicit serialization;
children must not concurrently mutate a shared checkout by default.

## Live workspace

The room has a central conversation, a compact crew strip, and an adjacent live
workspace. Agent cards show portrait/glyph, role, provider, task, elapsed time,
current observed tool, and explicit queued/working/needs-approval/done/failed
states. Directed connections correspond to actual parent-child assignments.
Selecting an agent opens its real transcript, files, checks, and tool trail.
Never display percent complete unless based on a finite task list.

The existing Crew floor receives the same hierarchy and activity presentation,
with room/project filtering. Idle crew members remain discoverable but are
labelled idle. Empty, disconnected, stale, failed, and interrupted states get
clear explanations. Reduced motion disables decorative movement. Keyboard focus,
semantic labels, light/dark themes, and small Mac windows are acceptance criteria.

## User control

Pause room prevents new work; Stop work cancels its active runs and shows any
completed side effects. Per-task retry is explicit. Settings expose members,
roles, voice/personality, delegation opt-in, and concurrency within hard limits.
Shua is a starter coordinator, not a locked identity. Voice normally uses Shua
to summarize; only explicit user selection changes the active speaker.

## Verification

Test durable room history and request deduplication; author/run ownership;
out-of-room and revoked member rejection; depth, assignment and concurrency
limits; inherited deny/approval policy; restart reconciliation; cancellation
races; failed child aggregation; and checkout isolation. Exercise a real room
with Claude and Codex without private test content, followed by native UI
verification of assignment, work inspection, approvals, stop, retry and reconnect.
Keep tests using controlled runtime fixtures distinct from real-provider proof.

## Non-goals for this slice

No social network, multi-user accounts, billing system, always-on microphone,
unrestricted computer access, or claim of general Kiro Crew parity. Existing
flows remain usable while room capabilities are added and verified.
