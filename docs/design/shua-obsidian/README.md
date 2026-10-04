# Shua — Obsidian design proposal

Status: design direction approved by the user; implementation pending plan review, not a deployed redesign. Open `index.html` locally or use http://127.0.0.1:8766 while the preview server runs. The preview contains illustrative data and explained placeholder actions; it does not execute tasks, contact models or change stored application data.

## Brief

A personal workspace for one developer: direct Shua, build and run projects, learn in a structured sequence, and turn useful work into reusable knowledge. Black gradient design, stronger hierarchy, coherent icons and fluid interactions across the desktop app and notch. ChatGPT/Codex only. Keep learning and recommended projects distinct. Keep all Sable sessions running. Preserve existing user data and links; no commits or pushes without permission.

## Recommended direction and alternatives

Recommend restrained obsidian: near-black canvas, graphite surfaces, pale blue-to-violet primary actions, faint directional lighting. It gives sustained reading and dense tools a consistent foundation.

A more luminous glass treatment would emphasize gradients and blur but reduce separation on busy backgrounds and cost more rendering work. A plain monochrome utility treatment would maximize density but underdeliver on the requested depth and character. The concept balances the two.

## Structure and existing feature destinations

| Primary destination | Its job | Existing features it contains |
| --- | --- | --- |
| Today | Choose the next action, inspect exceptions, resume work | Today, recent activity, decisions/approvals, current runs, compact schedule |
| Projects | Build toward a defined outcome | Ventures, project Board, Specs, Studio, project Sessions and files; separate Recommended projects section |
| Learning | Follow a structured learning path | Goal/profile, Roadmap, courses, lessons, practice/review, contextual coach, visual teaching, learning from completed work, career material |
| Automations | Make useful work repeatable | Recorded workflows, Playbooks, Schedules, triggers, run history and verification |
| Library | Retrieve and reuse knowledge | Artifacts, notes, visual explanations, saved learning material, inspectable/correctable Memory |

A persistent Shua assistant opens in context rather than becoming a competing destination. All conversations remain available through assistant history/global search, including unassigned sessions. Optional Crew views (Team, Rooms, Crew HQ) belong in an expandable Crew workspace under the assistant: the user is a solo developer, so agents should support projects rather than dominate navigation. Tools, MCP, connections, permission policy, usage/insights, model configuration and appearance belong in Settings; active permissions and failures remain visible in the relevant task and Today. Terminal belongs to project tools, with a global launcher retained.

No feature/data deletion is implied by regrouping. Preserve existing route aliases/deep links, or redirect them to the corresponding focused view. Provide a discoverable All tools index during the transition.

## Connected behavior

Every new task has an outcome and optional project context. Its run retains tools used, permission decisions, outputs and verification evidence. Outputs appear once in the Library with links back to their run/project. A useful task can become an Automation through explicit review. A lesson can recommend a Project; a completed Project can supply a lesson or review exercise. Existing unlinked records stay accessible and can be assigned; do not invent historical relationships.

Learning is goal → roadmap → lesson → exercise → feedback → review. A dedicated lesson workspace combines explanation, visual example and practice, keeping general chat optional. Completion and demonstrated understanding are distinct. Project recommendations show why they fit, prerequisites, rough effort, milestones, and a verifiable deliverable. Starting a recommendation is explicit. Existing completed lessons and review schedules must survive migration.

Shua uses connected ChatGPT/Codex models to explain, propose, tutor and review; deterministic application state owns navigation, persistence, permissions and recorded evidence. Streaming states distinguish preparing, working, awaiting input, completed and failed. Never show a guessed successful result or fabricated progress percentage. Model availability and errors are recoverable without losing drafts.

## Shared visual system

- Canvas #07080B; resting surfaces #0E1017; raised surfaces #181C27. Gradients use restrained blue/violet lighting, not green or rainbow borders.
- Primary text #F1F3FA; supporting text #AEB6C8. Measure final contrast on composited surfaces; do not assume translucent token contrast.
- One consistent 20/24px vector icon family with matching stroke weight and optical size; labels on main navigation, tooltips and accessible names on compact controls. Use SF Symbols for native macOS controls and a consistent licensed web icon family for WebKit content. The prototype uses inline SVG examples.
- System font, clear type hierarchy, restrained weights, tabular numerals for timing. A small set of spacing/radius tokens, not per-screen styling.
- Primary action per surface; quiet secondary actions; visible destructive-action semantics. Use table/list layouts for dense work and cards for meaningful summaries.
- Amber is reserved for decisions requiring attention; failure and success include text/icons, not color alone.
- The notch keeps its flush top and bottom-only continuous corners, shares status vocabulary and accent tokens, and preserves input focus.

## Motion and interaction

Immediate pressed/hover/focus response. Approximately 150–200ms feedback and 250–360ms panel transitions, tuned against actual hardware. Preserve spatial context and scroll position. Animation never gates dispatch or input. Avoid animating text containers while typing or repeatedly animating streaming text. Use native AppKit/Core Animation for native surfaces, WebKit animations for web content. This is not a claim that every web element uses a native Apple control.

Respect system and application Reduce Motion, increase-contrast/readability needs, keyboard navigation and visible focus. Avoid broad idle animation and repeated blur. Test narrow windows, large text, long titles, empty/loading/error states and populated data, not only ideal demo cards.

## Delivery and acceptance, after design approval

1. Shared tokens, typography, icons and UI primitives; preview representative dense and sparse screens.
2. Simplified shell/navigation with route compatibility and contextual assistant.
3. Today and project workspace; verify tasks, decisions and outputs link correctly.
4. Structured Learning with dedicated lesson flow and separate project recommendations; migrate existing records without loss.
5. Automations, Library, settings and optional Crew views; unify states and interactions.
6. Native/notch integration and complete visual/interaction verification.

Acceptance: existing saved data/deep links remain reachable; essential actions work with keyboard; primary next action clear on each screen; no false success; drafts survive navigation/errors; reduced motion works; no clipping at supported sizes; model calls remain ChatGPT/Codex; tasks and outputs have traceable context. Validate with actual user journeys, not CSS-only tests. Any migration needs a backup and rollback path before changing persisted data.

## Preview verification and limits

Static HTML parsing and JavaScript syntax verification are recorded separately in the task output. The browser-control provider exposed no browser sessions; both dedicated browser creation and native Chrome access failed, so rendered mockup screenshots and live interaction tests were not obtained. The current Shua Today screenshot was inspected directly, but this is not a full visual/accessibility audit of every screen. Rendering and all five preview destinations must be checked before treating the concept as implementation-ready. No production app code changed in this design turn.
