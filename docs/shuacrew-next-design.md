# ShuaCrew: personal AI workspace

Status: implementation in progress, 2026-09-24. User directed implementation.

Implemented: dedicated searchable Settings screen; appearance/workspace preference controls;
validated, versioned local persistence; density, reading size, motion, navigation, and start
screen behavior; existing runtime/service/backup panels retained. Claude crew members now
have an opt-in native delegation setting, wired through the supervisor to runtime definitions.
This is not cross-provider gateway orchestration. Notifications, the broader screen redesign,
and stages 2–3 remain future work.

## Intent

Build a personal workspace that makes AI useful for developing, designing, researching,
and running side projects. The user wants useful capabilities throughout, a striking and
coherent design, and settings to customize the experience. Optimize for one person
directing their own agents. Kiro Crew's public feature research is a reference; parity
claims require checking the implementation and evidence for each behavior.

## Current evidence

- Crew members, runtime adapters, sessions, a live crew floor, playbooks, schedules,
  memory, skills, integrations, a library, and a macOS shell already exist.
- Appearance supports nine palettes, five accents, and automatic system appearance.
- `RunSpec.agents` exists and the Claude adapter accepts it, but the supervisor does
  not currently populate it. Provider subagents and gateway child runs are distinct.
- The gateway MCP server currently exposes four library tools, not crew delegation.
- Existing terminal work is uncommitted and must be preserved.
- Baseline `pnpm test`, rerun outside the filesystem/network sandbox: 24 files and
  167 tests passed. This is not proof of live provider behavior or complete parity.

## Product direction

Use the existing Frost, Graphite, and light palettes as the foundation. Refine typography,
spacing, surface contrast, controls, and motion as one system across the app. Agent colors
identify people; status colors identify state. Live activity should reflect real events.
Default to a calm workspace with rich detail available when requested.

The central journey is: choose a project, describe the outcome, choose a crew or playbook,
watch progress, answer questions, review evidence and artifacts, then continue the work.
Sessions, crew activity, artifacts, and review should link directly to each other.

## Delivery stages

### 1. Workspace design and customization — first implementation scope

Move Settings out of the mixed `Pages.tsx` module into a dedicated screen, retaining its
existing provider, service, and backup functionality. Add a searchable settings navigation
with Appearance, Workspace, Agents, Notifications, and Data sections. Search shows matching
controls and their section, with a clear empty state. Only expose controls whose behavior
is implemented; later-stage settings are not disabled placeholder switches.

Extend the existing appearance preferences with comfortable/compact density, small/default/
large reading text, and system/reduced/full motion. Keep existing palette and accent choices.
Use shared CSS variables and motion configuration so the controls affect the whole workspace.
System motion follows `prefers-reduced-motion`; reduced mode disables decorative transitions.
Preserve readable code and usable controls at every density.

Add an optional labeled navigation rail, a configurable start screen, and visible keyboard
shortcut help. Start-screen preference applies only at a fresh root entry; explicit session
and artifact URLs must continue opening their target. Navigation keeps Settings reachable.
Appearance and workspace preferences save locally and apply immediately. Version and validate
stored values, migrate existing preferences without replacing deliberate choices, and recover
from malformed storage. Reset applies only to the selected preference section.

Apply the shared system to the shell, settings, session chrome, crew cards, and crew floor.
Continue screen-by-screen through the remaining routes without changing their core workflows.
Keep terminal edits intact; integrate shared styling without replacing terminal behavior.

Acceptance: existing preferences survive an upgrade; changed preferences survive reload;
light and dark modes remain legible; reduced motion is respected; keyboard navigation works;
controls have labels, visible focus, and clear saved/error feedback where applicable. Inspect
the running UI at desktop and narrow widths, including the macOS title-bar inset.

### 2. Agent coordination — separate subsystem design after stage 1

Give a coordinator gateway tools to list crew members, delegate a bounded task, inspect its
status/result, and cancel its own child task. Reuse the supervisor's run lifecycle and event
log. Store parent/child relationships and expose them in sessions and the crew floor.
Do not represent provider-native subagents as interchangeable with gateway-managed crew runs.

Carry project context and explicit task instructions into children. Apply effective policy
and existing runtime concurrency limits to every child. Bound delegation depth and fan-out.
Use asynchronous dispatch/status retrieval so parents cannot occupy all runtime slots while
waiting synchronously for children. Define cancellation, recovery, and result delivery before
implementation; retries must not create duplicate tasks after restart.

Expose genuine provider/model availability, crew defaults, concurrency, and delegation limits
in Agents settings when the gateway supports them. Persist operational settings through a
validated gateway API, distinct from browser-local appearance preferences. Clearly identify
changes that affect new runs versus active runs. Never imply a provider supports a capability
merely because the common interface contains it.

Acceptance: delegation works with deterministic runtimes; restart preserves task relationships;
cancellation settles children; failures are visible; limits and approvals are enforced; live
Claude/Codex verification is separately reported with commands and results.

### 3. Useful workflows and automation — subsequent focused slices

Improve existing playbooks for research → design → implementation → review with editable roles,
deliverables, and review gates. Add an evidence checklist to completion reviews so generated
claims are distinguishable from executed checks. Preserve resumable progress and artifacts.

Make project memory and selected skills inspectable from the work that used them. Improve
automation visibility with next-run time, recent outcomes, pause/resume, and failure details.
Surface provider-reported usage honestly; unknown costs stay unknown. Add notification and
quiet-hour controls only alongside actual delivery behavior.

Track additional Kiro Crew capabilities in a matrix of implemented, partial, missing, and
verified, linking code and tests. Prioritize capabilities that shorten this user's real
workflow. Remote hosting, channel integrations, and an app marketplace need separate scope.

## Verification and boundaries

Run focused behavioral tests for preferences and coordination, TypeScript checks, production
builds, and browser checks proportional to each stage. Record exact commands and results.
Use temporary data and mock runtimes for repeatable UI checks. No day-job paths or Kiro
credentials are needed. Never commit or push without the user's permission.

## Review decision

Implementation authorized by the user's “just implement” instruction. Stages 2 and 3 describe
the remaining roadmap; they are not claims of completed functionality.
