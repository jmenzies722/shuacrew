# Notch interaction research and depth update — 2026-10-04

## Sources and application to Shua

1. [Apple Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities): compact presentations should communicate essential live information; expanded presentations preserve relative placement and add relevant controls. Apply this as a design principle, not a claim that Shua's custom macOS panel is an ActivityKit Dynamic Island.
2. [Apple: Design dynamic Live Activities](https://developer.apple.com/videos/play/wwdc2023/10194/): keep expanded controls focused on the activity and preserve a coherent transition. In Shua, the notch handles quick questions/current work; full conversation and workspace detail use an explicit expand action.
3. [Apple reduced-motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria): adapt depth simulation, scaling and related motion to the user's settings. Both system and application reduced-motion selectors disable the new notch animations.
4. [WebKit: Responsive Design for Motion](https://webkit.org/blog/7551/responsive-design-for-motion/): use prefers-reduced-motion to adapt web animation. Relevant because Shua's content is WebKit within an AppKit panel.
5. [OneNotch official features](https://www.tryonenotch.com/features): the vendor describes hover/gesture activation, contextual pages, real-audio visualization, and privacy controls. These are published product claims, not independent performance measurements. For Shua, separate observation from control and use real signal data for any waveform. NotchNook's official page failed to load; no conclusions depend on it.

## Feature behavior assessment

| Feature | Expected behavior | Existing source / remaining check |
| --- | --- | --- |
| Hover | Open predictably without stealing typing focus; tolerate moving across the edge | Native pointer polling; web delayed close with focus/draft/drag guards. Verify on hardware and multiple displays. |
| Expanded conversation | Stable input, readable response, explicit full-chat affordance | New fixed-height presence row and expand button; existing composer/sticky input retained. Large responses remain scrollable; all long-content states need a broader layout audit. |
| Voice | Waveform reflects real mic/playback levels; distinguish connecting, listening, speaking and errors | Existing VoiceWaveform takes readVoiceLevel; new orb is a state illustration, not a measured waveform. Continuous voice latency/interruption not verified in this pass. |
| Demonstration | Explicit start/stop; show actual captured steps; excluded contexts stay excluded | Watch me path and recent-action timeline from prior verified update. No replay form reintroduced. |
| Agent work | Show actual work/approval/failure; no invented percent complete | Presence uses assistant phase, with attention taking priority. Existing task controls remain. |
| Music | Controls reflect actual Now Playing; visual spectrum requires real audio signal | Existing Now Playing polling; collapsed fixed-level VoiceBars is decorative and should not be described as an audio measurement. Real system-audio visualization is separate work. |
| Permissions | Surface actual capability failures and decisions in context | Existing Access & tools and approval cards retained; no new OS grants. |
| Accessibility | Keyboard focus, text status, reduced motion and readable contrast | New expand control named; focused tests cover status labels. Full VoiceOver/contrast/multi-display audit remains. |

## Installed changes

- New fixed-height NotchPresence row: dimensional orb, actual-state label, explicit expand-conversation button.
- Idle orb rests; working/listening/watching have restrained state animation. Attention stays distinct and still. The orb does not imply a measured audio level or completed work.
- Layered graphite input and controls; tactile hover/press feedback; separate readable response surface.
- Square flush top and bottom-rounded native surface retained. Chat input does not bounce with changing state labels.

## Verification

```text
node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0
node node_modules/vitest/vitest.mjs run apps/web/src/components/NotchPresence.test.tsx apps/web/src/lib/notch-layout.test.ts apps/web/src/lib/notch-hover.test.ts apps/web/src/lib/notch-presentation.test.ts apps/web/src/components/AssistantDeck.test.tsx
5 files, 14 tests passed
bash apps/mac/scripts/install.sh
Build complete! (7.37 sec)
installed /Applications/ShuaCrew.app
codesign --verify --deep --strict /Applications/ShuaCrew.app
exit 0
```

Installed notch:shot screenshot inspected: presence, composer, Teach Shua and Access controls visible; rectangular screen-edge attachment and rounded bottom retained. This screenshot does not establish frame pacing, typing success or voice correctness. Original Sable PID 8596 remained running. No commit/push.

Concurrent-source note: current AssistantDeck copy now says Claude + Codex, whereas the requested product design is ChatGPT/Codex only. This was not changed by the depth pass and needs a model-policy audit before the full redesign is called compliant. Do not infer active model routing from this label alone.
