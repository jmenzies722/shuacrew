# Crew Studio — selected isometric direction

Status: visual concept approved by the user. An interactive SVG studio is implemented; see the workspace verification report for shipped behavior and differences from the illustrative concept. User selected “Premium isometric studio: detailed agent stations, smooth movement, easy to read.” The generated visual is a concept with sample activity, not a running build.

Concept image: [Crew Studio visual](crew-studio-concept.png). Illustrative counters/text are not runtime evidence; the implemented screen must derive all counts and labels from actual state.

## Purpose

Understand what each of your agents is doing, inspect its evidence and intervene without leaving the current project context. The studio is a working surface; atmosphere supports clarity. It does not simulate completed work or replace the operational task record.

## Layout

Keep the six-destination application shell from the revised rebuild brief: Today, Projects, Crew, Learning, Automations, Library. Crew opens the studio with a compact page header, project scope control, connection indicator, and actual working/waiting counts.

The world occupies the main area; a docked inspector appears to its right on selection without covering nearby stations. At narrow widths the inspector becomes a panel below the world and the list view is directly accessible. A compact activity strip sits below the scene. Fit view, zoom in/out and List view are explicit controls with accessible names. Decorative architecture never captures input or hides labels.

Use a charcoal raised floor slab, geometric desks and restrained blue/violet accent light. Materials should have depth through light/shadow, not busy textures. Labels remain flat, crisp and horizontal over the scene. A small consistent agent avatar marks each station. The native/macOS shell retains platform affordances rather than adding fictional window controls.

## Stations and interactions

- Station identity and placement remain stable across event updates. Do not reorder all agents whenever one receives a task.
- Hover/focus: highlight the station and show its current short status, without moving the camera.
- Click/Enter: select the agent, show the inspector, and preserve the current viewport.
- Inspector: identity/role, real connection state, current run(s), project association if present, latest recorded action with timestamp, actual approval requests, outputs/changes links, and existing supported stop/open actions.
- Escape: dismiss the inspector; restore focus to the selected station.
- Empty agent: clearly idle, with an explicit assignment action. Its monitor must not fake typing.
- Several simultaneous runs: show a real count and selectable run list. Waiting decisions receive priority, but active work remains discoverable.
- Artifacts area: summarize recently created outputs with links to their source runs. Add this only when outputs are actually associated in the data; an empty shelf is honest.
- Assignment entry: record the intended outcome and project context through the existing task-launch path. Display launch failure without creating a phantom working agent.

## Lifecycle and motion

| Recorded state | Station treatment | Allowed motion |
| --- | --- | --- |
| Idle | Resting monitor, clear available label | No fake work animation |
| Queued | Task queued label, subdued station | No active-work pulse or moving handoff |
| Running/planning | Work light and current operation label | Restrained monitor/agent motion while connection is live |
| Awaiting approval | Amber decision marker with text | Still emphasis, no work pulse |
| Failed/blocked | Distinct error marker and last evidence | Still, explicit recovery/open action |
| Completed | Result marker and artifact link when available | One brief settle transition, then rest |
| Offline/reconnecting | Last known state and timestamp | Freeze activity motion; never imply fresh progress |

Agent movement or a handoff animation occurs once per recorded state/assignment transition. It is an illustration of that event, not evidence itself. Do not draw a real-time path for merely queued work. Do not repeatedly replay motion on reconnect or component rerender. Respect both OS Reduce Motion and the application's setting; use still emphasis and text instead.

## Implementation grounding

`apps/web/src/lib/floor-graph.ts` already projects run/member/room/approval/activity data to StageNode and StageEdge. Keep this pure projection boundary, fix any queued/stale semantics before presenting new animation, and test representative concurrent states. `apps/web/src/components/FloorStage.tsx` currently combines scenery, position, hover and inspector rendering; split those responsibilities during replacement. `CrewFloor.tsx` remains responsible for scope/event selection, with duplicated visual feeds reduced after the replacement is proven.

Start with SVG/CSS layered isometric rendering because the existing stage is SVG/HTML, interactions stay accessible and no rendering dependency is required. Validate the approved visual slice at target scale before deciding whether a heavier rendering engine is justified. This is a chosen starting approach, not a claim that it will match every lighting detail in the concept image.

Use existing supported APIs for run/approval actions. No new model, autonomous task creation or broad permission policy is introduced by the world UI. Preserve historical runs; the user's ChatGPT/Codex-only constraint applies to new inference, not rewriting the provenance of old records.

## Verification gates

1. Deterministic fixtures: empty crew; idle members; working run; queued child; decision waiting; failed run; recently completed run; multiple runs/member; out-of-scope assignment; disconnected/stale feed.
2. Station selection, keyboard traversal, Escape return focus, fit/zoom and list-mode parity.
3. Real task launch → tool event → result/failure → output inspection. Check the agent world against the actual run record at each step.
4. No action changes from mere hover, decorative animation or stale inspector data. Review/cancel requests reference the current actual run/approval ID.
5. Narrow layout, long agent names, 200% text, dense crews and reduced motion. Maintain label readability and a usable list fallback.
6. Preserve selected agent and viewport during real-time updates; stable frame pacing assessed on the actual Mac, not inferred from still screenshots.

## Voice-test contract, delivered after implementation

Each final prompt includes the supported intent, required scope/permissions, expected visible transition and verification artifact. Candidate intents are show crew; inspect a named agent; open its current task; summarize pending decisions; stop a specified running task; show an output. These are candidate tests, not statements that all commands currently exist. Write runnable prompts only after the routing and outcomes pass.
