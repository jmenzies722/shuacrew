# ShuaCrew: Spark throughout the workspace

Status: direction refined with user feedback; implementation plan awaiting review.
Date: 2026-09-27

## Intended outcome

Make the personal macOS workspace feel finished and coherent. Shua/Spark should
help with the screen the user is on, explain architecture visually, guide real
tasks, and clearly show which model and capabilities are available. Claude and
Codex recovery must preserve work and report evidence, not merely elapsed time.

The user explicitly prioritizes Settings, polish across the Mac app, a notch
presence, screen diagrams, guidance, and better orchestration. The user confirmed
both MacBook notch and iPhone Dynamic Island, starting with the MacBook.

## User clarification: one connected platform

The user wants Spark Auto connected to the whole platform's subscriptions and
orchestration, with ShuaCrew supporting excellent engineering and a better daily
life. This is the product direction, not a claim that these capabilities exist.

The central loop is: choose a meaningful priority → do focused work with the crew
→ verify the result → retain a useful lesson → use it in the next session.
Projects, Learning, Today, routines, and Spark should contribute to this loop
through explicit links and shared context rather than accumulating separate
dashboards. Daily progress should emphasize useful outcomes and next steps,
not token consumption or activity for its own sake.

Spark is the conversational entry point. The gateway owns provider selection,
availability, policy, and execution. Settings exposes those same decisions;
it must not invent a second meaning of Auto. Separate provider subscriptions
remain separate accounts and quotas; connection means coordinated use, not
pooled credits or unlimited access. Local-only remains an explicit private mode.

The first implementation plan covers shared intelligence and recovery. Visual
polish, notch placement, the architecture canvas, and the daily learning loop
remain subsequent slices of this same product direction.

## Evidence from this checkout and running app

- The Mac window hosts the React interface in WKWebView. Keep this architecture;
  a SwiftUI rewrite would duplicate substantial working behavior.
- Settings has fourteen sections, a separate overview, search, modes, history,
  and a long Spark page. The running page has three navigation/content columns
  plus the Spark sidebar; its explanatory text competes for limited width.
- Spark already has a native desktop panel, screen pointers, guided walking,
  screen capture, mouse/keyboard controls, and a 940 × 720 diagram presentation.
- Spark's automatic brain selector currently chooses Claude or local. Codex
  availability does not affect that selector.
- The local runtime declares no image capability or tools of its own. Spark
  action blocks can still be handled separately on the Mac.
- The visible local conversation contains unsupported completion claims. This
  is evidence of a trust problem, not proof that every action failed.
- Settings says both that Spark can click/type and that it never clicks/types.
  Capture descriptions also need to distinguish one-shot capture, live viewing,
  and optional screen memory.
- Supervisor.restore records runtime.restored and queues paused runs for the
  runtime when a reset timer fires. A timer is not provider confirmation; a
  model-scoped restore also needs to respect other model/account limits.
- The initial `git status --short` returned no output. No product files were
  changed during this investigation.

## Approaches

1. **Integrated refinement (recommended).** Keep the existing web/native split,
   unify the design tokens and navigation, connect Spark to page context, and
   strengthen provider recovery. Delivers useful improvements incrementally.
2. **Visual refresh only.** Faster, but leaves misleading action outcomes and
   recovery semantics untouched. Insufficient for the requested experience.
3. **Native rewrite.** Maximum platform control, but duplicates the existing
   feature set and delays improvements. Not justified for this solo project.

## Visual and interaction direction

Use the user's existing dark theme and Lagoon Spark finish as the initial
reference, preserving user-selected themes and character customization.
Keep surface levels distinct: quiet app chrome, readable working surface,
slightly elevated interactive panels. Reserve saturated accent for selection,
Spark identity, and primary actions. Consolidate competing CSS overrides.

Use a consistent spacing scale, clear 13–14 px secondary text, generous section
headings, visible keyboard focus, and reduced-motion support. Avoid adding
animated decoration to every surface. At compact widths, Spark overlays or
collapses rather than squeezing Settings into an unreadable middle column.

### Settings

- A useful home: Spark presence preview, provider status, and direct links to
  Appearance, Spark, Voice, Agents, and Privacy. Status comes from real data.
- Searchable, grouped navigation with reliable hash links and back navigation.
- Split Spark settings into Appearance, Presence, Voice, and Guidance, with
  a persistent character preview where space permits.
- Offer explicit desktop placement choices: free placement and notch dock.
  Preserve the saved free-placement position when switching modes.
- Make settings scope and save failures visible. Avoid labeling failed writes
  as saved. Preserve working mode/history controls without arbitrary grading
  that implies every optional feature must be enabled.
- Rewrite capability/privacy copy to match the actual selected mode.

### Spark in context

One companion identity and conversation across the desktop panel and app panel.
Each major screen offers a relevant entry point: explain this setting, summarize
this session, inspect this architecture, or guide the next step. Context includes
the current route and explicitly selected item, not silently collected files.

Keep the active provider/model visible. Distinguish proposed, running, completed,
failed, and awaiting-confirmation actions. Completion receipts must originate
from the action executor; model prose is not an execution receipt. Unsupported
local actions offer an honest explanation and an explicit crew handoff.

### Architecture and guidance

Expand the existing diagram presentation into a spacious, resizable canvas with
fit, zoom, pan, copy/export, and a clear return to conversation. A diagram failure
shows a useful error and preserves the source. Do not hide errors behind an empty
canvas. For step guidance, retain stop/Escape and re-observe after each action.

Native placement uses the selected display's coordinates and safe areas.
Diagrams must remain reachable on small displays and after monitor removal.
The companion returns to its selected dock after guidance, without moving the
user's working windows.

### Notch presence

MacBook: an opt-in compact presence near the notch, expanding downward into the
existing companion. Determine placement from NSScreen safeAreaInsets and
auxiliary areas; do not hard-code one laptop's geometry. Provide a top-center
fallback on displays without a notch. Reposition on display configuration changes.

iPhone, after MacBook: a separate ActivityKit/WidgetKit Live Activity showing the
current crew task, progress state, and a deep link into the companion. Use
system-managed compact/expanded layouts. Do not promise a free-floating
cross-app assistant or Mac-style drawing over unrelated iPhone apps. Keep real
device delivery and provisioning verification separate from simulator builds.

## Recovery and orchestration

Represent availability per provider and model, with account-wide limits taking
precedence. Persist the latest evidence, reset estimate, attempt count, and last
successful response. Separate ready-to-retry from confirmed recovery.

At a reset estimate, queue eligible paused work once. Use the next real attempt
as evidence where possible; avoid continuous billable probe conversations.
Authentication/installation checks alone do not establish remaining quota.
Apply bounded retry/backoff when the provider still refuses the request.

Expired or replaced timers must not clear a newer limit. A successful model
attempt must not clear another model's restriction or an account-wide limit.
Handle suspend/wake and gateway restarts without duplicate work. Preserve the
existing explicit-retry behavior for interrupted crew-room operations.

Spark Auto should consider configured capable cloud providers before local,
respecting the user's routing preferences. Screen tasks require image capability;
crew coding work must not silently move to the conversational local runtime.
Return to a preferred recovered model at a safe turn boundary, carrying a concise
conversation recap and displaying the change. Never restart an in-flight action
just to change providers.

## Delivery slices and verification

1. **Truth and recovery:** regression tests for overlapping model/account limits,
   stale timers, reset while asleep, gateway restart, persistent refusal,
   single resumption, and action receipts. Verify adapters with controlled
   fixtures before optional real-provider checks.
2. **Settings and shared surfaces:** consolidate tokens, improve Settings home
   and Spark grouping, fix deep-link behavior and inaccurate copy. Build and
   typecheck; inspect the actual Mac app at wide and minimum window sizes,
   keyboard-only navigation, and reduced motion.
3. **Context and canvas:** exercise page-to-Spark handoff, diagram parsing errors,
   fit/zoom/export, stopping guidance, and constrained display layouts.
4. **Mac notch:** unit-test geometry on synthetic display layouts; build Swift
   and visually verify on real notch/non-notch hardware where available.
5. **iPhone:** add the Live Activity target, test lifecycle and stale
   state handling, build the simulator target, then document the distinct device
   delivery checks. Existing CloudKit/device gates remain explicit.

For each slice, record exact verification commands and outputs and identify
unverified hardware/provider behavior. Do not commit, push, change provisioning,
or publish without the user's authorization.

## Primary platform references

- [Apple NSScreen auxiliaryTopLeftArea](https://developer.apple.com/documentation/appkit/nsscreen/auxiliarytopleftarea-uglc)
- [Apple: displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)

These establish supported placement/status surfaces; they do not validate the
proposed implementation or promise unrestricted cross-app control.
