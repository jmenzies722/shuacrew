# Obsidian workspace implementation and verification

## Implemented

- Six primary destinations with contextual child navigation and secondary All tools; existing deep links remain intact.
- Obsidian appearance preset, selected through the installed app's Settings, blue accent, shared dark surfaces, visible focus and reduced-motion rules.
- Isometric SVG Crew Studio: stable stations, real status, zoom/fit, accessible list, source-linked inspector, keyboard selection/Escape focus restoration, actual delegation paths only. Queued and offline work does not animate. Fixed legacy clipping and completed-task elapsed display.
- Learning: focused path/courses/practice/review hierarchy; dedicated persisted lesson selection; saved exercise draft; Codex follow-up feedback; manual completion; lesson-associated visual documents with lesson text context.
- Projects: roadmap-backed recommendations separate from lessons, reviewable project draft with source roadmap ID preserved in its goal.
- Automations: clear demonstration/playbook/schedule roles; existing run/review/schedule actions retained. Library artifacts and knowledge retained under the shared theme.
- Codex-only production registry, legacy member model fallback fix, command/web helper moved from Claude CLI to the existing Codex structured-answer transport. Existing four Claude-configured crew members changed to Codex, retaining their roles/personas and history. Prior configuration backed up privately at ~/.shuacrew/backups/crew-before-codex-20261004.json.

## Research applied

Apple [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars): grouped hierarchy and disclosure instead of an always-expanded feature inventory.
Apple [Motion](https://developer.apple.com/design/human-interface-guidelines/motion): movement conveys state and feedback. Active effects follow actual recorded state; reduced motion removes them.
Apple [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback): status is part of the interface. Errors, waiting decisions, and disconnected last-known states remain explicit.
Apple [Layout](https://developer.apple.com/design/human-interface-guidelines/layout): readable hierarchy and space for content drove the separate inspector and lesson reading/practice columns.
This React/WebKit presentation uses the existing AppKit host; it does not claim to be a native SwiftUI implementation.

## Executed checks

`node node_modules/vitest/vitest.mjs run`

```text
Test Files 237 passed (237)
Tests 1086 passed (1086)
```

`node node_modules/typescript/bin/tsc --noEmit -p apps/web`
`node node_modules/typescript/bin/tsc --noEmit -p apps/gateway`

Both exit 0.

Gateway targeted policy, crew, intelligence routing/recovery, shell integration and teaching-engine checks: 31 tests passed. Additional legacy-member routing regression: crew suite 5 tests passed. Final layout/lesson changes: 14 focused web tests passed and web typecheck exit 0.

Actual model checks:
- Read-only Codex helper returned `SHUA_HELPER_OK`.
- Existing course r_70d607a5 received exercise feedback through Codex, completed, zero tool calls. Complete input and model feedback observed in native UI. Initial synthetic typing produced an incomplete draft; the full draft was then explicitly set and verified before submitting again.
- Visual Teaching produced saved Request Journey, revision 1, two steps. Prior active visual document restored. [Receipt](assets/obsidian/visual-model.json).
- Rhea's real crew request r_d39fa822 completed through Codex. Native floor showed Recently active and inspector linked the completed source session. Hover alone creates no tasks. Escape returned keyboard focus to the selected station.

Native UI checks: six navigation links; theme selection; agent inspector; lesson resumption; full exercise input and feedback; project recommendation opens populated unsaved editor with roadmap source; cancellation leaves project uncreated; Automations retains the user's waiting playbook; Library retains 38 existing artifacts.

## Practical boundaries

Final installed-app pass: all five isometric stations and labels are visible without the previous scene clipping. Opening a lesson's Visual explanation created its associated saved document and showed the correct prefilled course/lesson question. The native View menu still had the old five-hub shortcuts; it was updated to match the six destinations, rebuilt, installed, and verified with Command-3 opening `/floor`.

`bash apps/mac/scripts/install.sh` → `Build complete! (28.04 sec)` and `installed /Applications/ShuaCrew.app`.
`codesign --verify --deep --strict /Applications/ShuaCrew.app` → exit 0.
`git diff --check` → exit 0. Original Sable PID 8596 remains running. Final focused web/gateway regression selection: 6 files, 19 tests passed.

This delivers the redesigned core workspace and connected learning/crew paths, not a promise of arbitrary perfect Mac automation, measured universal latency, revenue, or parity with every capability of another harness. The studio is an interactive SVG isometric world, not the photoreal generated concept or a freely roaming simulation. No existing data was deleted; no commits or pushes were made. Sable sessions remain running and their staged input-accessibility update awaits restart. Microphone-specific voice acceptance remains for the user's test drive.

[Test drive](shua-voice-test-drive.md).
