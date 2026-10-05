# Shua rebuild — revised design brief

Status: core workspace implementation delivered; see ../../verification/obsidian-workspace-2026-10-04.md for evidence and exact boundaries. This supersedes the earlier decision to hide Crew in secondary navigation. Remaining aspirational behavior below is not a claim of verified capability.

## Outcome

A premium personal workspace that helps one developer decide, build, supervise agents, learn and reuse results. Preserve saved sessions, projects, lessons, workflows, permissions and history. Rebuild the product experience on top of trustworthy runtime and persistence primitives; no deletion/reset of user data implied by “from start.” ChatGPT/Codex only, including model-policy validation rather than copy-only promises.

## Product map

- **Today:** one prioritized next action, actual running work, decisions needing the user, scheduled work and resumable learning.
- **Projects:** real project outcomes, milestones, tasks, agent runs, files and evidence. Recommended learning projects are a clearly separate section with prerequisites, skills, expected effort and deliverable.
- **Crew:** a primary destination combining an interactive agent world and an accessible operational list. Select an agent to inspect its actual task, tools, output, dependencies and approval state. Delegate work through the existing runtime, then display recorded events.
- **Learning:** goal and assessment → ordered roadmap → dedicated lesson → exercise → feedback → review. Lessons hold text, visual explanation and practice together. Existing courses and review schedules remain accessible.
- **Automations:** teach/record, inspect, validate, schedule and review routines. Distinguish a demonstration from an executable verified workflow.
- **Library:** saved artifacts, diagrams, explanations and notes with source links; inspectable and correctable memory.

The contextual Shua assistant connects these destinations. Global search, Settings and All tools preserve access to existing functions. The notch is a compact companion to the platform, not another whole dashboard.

## Crew world

Detailed selected-direction specification: [Crew Studio](crew-studio.md).

User-selected visual direction: a premium isometric studio with readable workstations, restrained black/graphite materials, blue/violet highlights and intentional camera presets. Avoid a dense pixel-office reskin. Build a representative visual slice before expanding the world. The user explicitly selected detailed agent stations, smooth movement and easy readability.

World zones: briefing area for queued work; workstations for active agents; review area for decisions; output area for completed artifacts. Moving between zones is a visualization of recorded lifecycle transitions, not a claim of physical agent behavior. Station identity remains stable across updates. Hover reveals a short status; select opens a docked inspector; double navigation is unnecessary for common review actions. Pan/zoom and fit-to-floor are optional aids; ordinary tasks remain available through a keyboard-operable list.

State contract: queued, working, waiting for user, blocked/failed, completed and idle. Display the underlying run ID, source event time and connection state in the inspector. A lost connection freezes the last known picture, labels it stale and stops implying live work. Handoff lines exist only for recorded assignments/delegations. Idle agents do not fake typing; decorative ambient motion must not masquerade as tool use. An agent can own several runs; show their actual list and prioritize decisions without losing active work.

Actions: inspect task, open conversation, inspect files/output, cancel supported work, review an actual approval, create a scoped assignment. No blanket approval expansion as part of a design change. Starting a new task must have a real result/error path and preserve its context.

Implementation grounding: current `CrewFloor.tsx`, `FloorStage.tsx` and `floor-graph.ts` already consume runs, tool events, room assignments, approvals and connection status. Reuse/refine the projection; replace the visual presentation. Choose SVG/CSS or a rendering engine after the approved visual slice and a performance prototype; do not add WebGL just for a technology label.

## Learning and visual teaching

Learning home shows one active path, next lesson and due practice. Course outline is structured; lesson content lives in a dedicated workspace rather than dropping the user into general chat. The lesson workspace has readable explanation, interactive diagram, exercise and feedback, with a contextual tutor. The learner can ask for simpler/deeper/examples without losing their place.

Completion is separate from understanding. Persist exercise attempt, feedback and review state; do not infer mastery from opening a lesson. Adaptive recommendations cite observed difficulties or stated goals. Lesson generation is asynchronous, recoverable and validated before display. Visual content uses structured diagram primitives with text alternatives and source/context references; malformed output remains a recoverable error.

Recommended projects live in Projects and link to the relevant path. They never interrupt a lesson or silently launch agents. Finishing a project can generate a review exercise using an explicit action. Preserve original lessons and histories before any additive schema migration.

## Shared premium design

Use the approved black/graphite palette and restrained blue-violet gradients. One icon grammar, consistent spacing, typographic hierarchy and button treatment across all sections. Present dense evidence in lists/tables, summaries in cards, and the Crew world as the intentional visual centerpiece. Status colors always include text/icon meaning. No green brand treatment. Fixed spatial anchors and restrained transitions; reduced-motion and keyboard alternatives are first-class.

## Delivery sequence

1. Validate model-policy constraints and snapshot/back up persisted data before migrations; map old routes.
2. Implement shared visual system and six-destination shell; preserve old routes and All tools.
3. Build and review Crew world slice against real event fixtures, then wire real interactions and disconnected/error states.
4. Build dedicated Learning/Visual lesson flow and separate project recommendations.
5. Connect Today, project tasks, agents, automations and Library through source-linked records.
6. Validate full user journeys, install signed build, then deliver voice prompts matched to supported features.

The earlier foundation plan must be revised from five to six destinations and give Crew its own implementation plan. Do not execute it unchanged. Plans for the Crew event/rendering contract and learning migration need exact interfaces before implementation.

## Full-time readiness gates

- Existing data and deep links survive; rollback exists for migrations.
- One real task can be launched, observed on Crew, reviewed, and traced to its output.
- Awaiting permission, failed, cancelled and disconnected states are distinguishable; no false success.
- A learner can resume a lesson, manipulate a visual, submit an exercise, receive feedback and revisit saved progress.
- A recommendation can become a project through explicit action and retain its lesson link.
- Notch/Fn drafts and voice interruption survive app navigation; tests include stop/cancel and failed permissions.
- Normal, reduced-motion, narrow window and long-content layouts are checked with keyboard navigation.
- Inference routing is actually restricted to the requested ChatGPT/Codex models; current conflicting Claude + Codex UI copy is an audit signal, not proof of either routing state.
- Voice test cards are delivered after verification, each with prompt, expected visible behavior, pass/fail check, required permission and known limit. Features that fail remain marked incomplete.

No promise of revenue, zero latency, perfect automation or readiness is justified by a visual redesign alone.
