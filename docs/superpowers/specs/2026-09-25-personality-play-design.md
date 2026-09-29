# Personality and Play

Status: concept approved; written design awaiting review. Not implemented.

## Outcome and approach

Give the solo user optional, useful delight while preserving ShuaCrew's existing
palette, density, typography and serious approval UI. Use an original small robot
named Spark as the initial direction (working name, user-renamable). Prefer a
lightweight local vector character over a continuously generated avatar or a
separate desktop overlay. No new AI calls are needed to animate or interact.

## Experience

Settings gains a searchable Personality & Play section with an isolated live
preview, reset-section control and master off switch. Defaults: companion off,
sounds off, celebrations subtle, motion follows the system. Presets Quiet,
Balanced and Playful configure only presentation, never agent permissions.

Controls: Spark or Mini Crew, nickname (40 characters), accent inherited from the
app, three face styles, six bundled accessories, presence on-interaction/subtle/
playful, docked corner/room header placement, celebration level, sound volume and
hide/still during focus. Appearance previews are clearly labeled previews and
never enter activity history. Accessories are available immediately, not earned
through tokens, streaks or spending. Conversation tone remains in existing crew
personality controls rather than creating conflicting instruction settings.

Tap/click opens a small card with actual pending decisions, current room and
Open crew/Start focus actions; optional wave interaction is decorative. Keyboard
and VoiceOver expose the same actions. Dragging snaps to approved in-app anchors
with a reset-placement command; it cannot obstruct composer or approval controls.
Mini Crew uses existing member identities, capped at four visible plus overflow.
Selecting a member opens their actual work. No animated nonexistent delegation.

A local focus timer offers 15/25/50-minute durations, pause/reset and optional
break notification; notifications request OS permission explicitly. App relaunch
computes elapsed time from persisted timestamps rather than claiming background
execution. No punitive streaks, emotional dependency messages or attention nagging.

## Data and safety

Character state derives from shared observed activity: idle, active, needs-review,
completed, failed and disconnected. Unknown/stale state is labeled, not celebrated.
Completion celebrations deduplicate by event ID, are rate-limited to one per ten
seconds, and do not replay on historical hydration. Approval/failure presentation
takes precedence over celebration. Reduced motion uses static poses. Offscreen,
background and focus-hidden characters stop animation; no continuous render loop.

Store validated versioned preferences locally using existing appearance patterns;
corrupt values fall back safely. Nicknames and decoration are not model instructions.
iPhone receives equivalent local controls with SwiftUI presentation; settings do
not silently sync across devices. Watch stays unchanged. No mascot interaction
starts microphone capture, sends a message, grants permission or executes tools.

## Boundaries and acceptance

Separate pure preference/state reducers, visual character component, settings
preview and focus timer. Integrate with existing appearance/motion and event stores.
Test defaults, migration, invalid values, persistence, event deduplication, offline
state, no-network decorative interactions and stop-animation behavior. Verify
native Mac and iPhone navigation, keyboard access, VoiceOver labels, large text,
reduced motion, contrast and no overlap with safety controls. No claims about
retention or user demand until observed with real users.

No assets have been generated, no code changed and no commit/push authorized.
