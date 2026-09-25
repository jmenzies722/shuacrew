# Companion Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional original Spark/Mini Crew interactions and enjoyable settings without noise, extra AI calls or permission changes.
**Architecture:** Pure versioned local preferences/state feed lightweight presentation and a local focus timer; real work state comes from existing projections. Reuse common appearance controls, with equivalent native phone preferences stored locally.
**Tech Stack:** TypeScript/React, existing motion preferences, SwiftUI, bundled original assets.
**Spec:** `docs/superpowers/specs/2026-09-25-personality-play-design.md`.

## Global Constraints

Inherit master constraints. Companion/sounds off by default; celebrations subtle; motion follows system. Nickname40 characters,three face styles,six accessories,four visible crew members plus overflow. No AI calls for decoration, no token unlocks, no implicit microphone, no cross-device settings sync.

## Review Focus

- Replay/hydration must not celebrate old work: C1.
- Failed/stale work must not appear happy/completed: C1.
- Offscreen/reduced-motion modes stop animation: C2.
- Decorations must not obscure approvals/composer: C2.
- Focus timing across sleep/relaunch/storage failure: C1/C2.

### C1: Versioned preferences, truthful state and focus timer

**Files:** Create `apps/web/src/lib/companion.ts`, `companion.test.ts`, `focus-timer.ts`, `focus-timer.test.ts`; modify appearance persistence integration without changing unrelated settings.

**Interfaces:** `parseCompanion(value:unknown):CompanionPreferences` supplies validated defaults. `companionPose({connected:boolean,needsApproval:boolean,failed:boolean,active:boolean}):'offline'|'review'|'failed'|'working'|'idle'` has that priority order. `remainingFocusMs({startedAt:number,durationMs:number,pausedRemainingMs:number|null},now:number):number` uses bounded wall time, not background ticks.

```ts
interface CompanionPreferences {
  version: 1; enabled: boolean; kind: 'spark'|'crew'; nickname: string;
  face: 'calm'|'curious'|'bright'; accessory: 'none'|'cap'|'headphones'|'scarf'|'glasses'|'antenna'|'badge';
  presence: 'interaction'|'subtle'|'playful'; placement: 'corner'|'room-header';
  celebration: 'off'|'subtle'|'expressive'; sound: boolean; volume: number;
  focus: 'hide'|'still';
}
```

- [ ] Write RED tests:

```ts
expect(parseCompanion(null).enabled).toBe(false);
expect(companionPose({connected:false,needsApproval:false,failed:false,active:true})).toBe('offline');
expect(companionPose({connected:true,needsApproval:true,failed:false,active:true})).toBe('review');
expect(remainingFocusMs({startedAt:1000,durationMs:1500000,pausedRemainingMs:null},1501000)).toBe(0);
```

- [ ] Run `pnpm exec vitest run apps/web/src/lib/companion.test.ts apps/web/src/lib/focus-timer.test.ts`, then implement validated immutable defaults, timestamp arithmetic and local storage boundaries.
- [ ] Add a completion-event reducer with seen event IDs capped200, hydration watermark and ten-second celebration throttle. Test history replay, duplicate IDs, error precedence, no-network interaction and corrupted/future timer timestamps.
- [ ] Test40-character nickname cap, invalid enum reset, missing storage, section-only reset and all15/25/50-minute timer choices. Keep nickname/accessories out of model instructions.

### C2: Original assets, settings previews and native presentation

**Files:** Create `apps/web/src/components/Companion.tsx`, `CompanionSettings.tsx`, `companion.css`, `apps/web/public/companion/` assets and provenance manifest; modify Shell.tsx, Settings.tsx and room header; create `apps/ios/Sources/CompanionPreferences.swift`, `CompanionView.swift` and test files.

**Interfaces:** `Companion` consumes C1 preferences/pose and callbacks `openDecisions`, `openCrew`, `startFocus`; callbacks navigate/open controls only. `CompanionSettings` previews isolated state, never publishes preview events into production history. Native Swift preference keys are device-local and versioned.

- [ ] Add component tests proving master-off renders no interactive mascot, preview emits no real work event, and click opens a control rather than sending a message. Run them RED before UI implementation.
- [ ] Read the image-generation skill before asset creation. Produce an original robot design fitting measured in-app slots, not copied company/competitor art. Use a small consistent pose/accessory set, not generated per-frame images or CSS approximations. Review assets at actual size, light/dark and reduced-motion poses.
- [ ] Implement docked anchors with snap/reset; keep pointer hit area clear of composer and approval surfaces. Add keyboard/VoiceOver alternative to drag, visibility-aware animation cleanup, explicit quiet focus and optional sound previews at user-selected volume.
- [ ] Build settings with live preview and Quiet/Balanced/Playful presentation presets. Add optional focus reminder through existing explicit notification permission flow. Never request permission on panel entry.
- [ ] Add matching local SwiftUI settings/character presentation without cloud preference sync, write persistence and migration tests, and inspect large text/reduced motion. Verify four-member overflow, selected real task navigation, relaunch, no repeated completion effects and one-switch off on Mac/iPhone.
