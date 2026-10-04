# Obsidian Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this tightly coupled foundation) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved black-gradient visual foundation and five-destination navigation while preserving every existing feature and saved record.

**Architecture:** Keep current routes and persistence, introducing a shared workspace-navigation model consumed by the sidebar, compact rail, section navigation and command palette. Implement an explicit Obsidian appearance preset and scoped shared surfaces; preserve existing alternative themes. This is the first independently shippable part of the full approved design, not a claim that learning/project workflows are already rebuilt.

**Tech Stack:** React, TypeScript, TanStack Router, existing Lucide icons and Motion, CSS, AppKit/WebKit host. No new dependencies.

**Spec:** `docs/design/shua-obsidian/README.md` and `docs/design/shua-obsidian/index.html` (approved direction).

## Global Constraints

- Canvas #07080B; resting surfaces #0E1017; raised surfaces #181C27.
- Primary text #F1F3FA; supporting text #AEB6C8.
- ChatGPT/Codex only.
- Keep learning and recommended projects distinct.
- Keep all Sable sessions running.
- Preserve existing user data and links; no commits or pushes without permission.
- Never show a guessed successful result or fabricated progress percentage.
- Never access `/Users/admin/Nectar-Work` or `/Users/admin/Developer/work`.
- Preserve unrelated uncommitted work in both repositories. No destructive git operations.

## Review Focus

- Old deep links, including nested sessions/runs/plays, remain accessible and highlight a sensible location.
- Malformed or outdated remembered navigation cannot hide a destination or navigate to an unrelated page.
- Light themes, user-selected accents and exported theme codes remain usable after adding Obsidian.
- A long sidebar, narrow window and 200% text do not conceal Settings, All tools or the focused control.
- Reduced motion and active typing do not lose focus, animate typed text repeatedly or delay a command.

## Scope and subsequent deliverables

This plan implements shared tokens, icon treatment, navigation and consistent screen framing. Subsequent plans, derived from the approved design, separately implement: (1) Today and Projects with linked tasks/results, (2) structured Learning and the separate project recommendation flow, (3) Automations/Library/context integration. They must use the foundation interfaces below and must not substitute decorative cards for functioning workflows. Each requires its own exact data/route contracts before implementation; no speculative persistence migration in this foundation.

## Task 1: One workspace navigation model

**Files:** Modify `apps/web/src/lib/hubs.ts`, `apps/web/src/lib/hubs.test.ts`; add `apps/web/src/lib/workspace-navigation.ts` and `apps/web/src/lib/workspace-navigation.test.ts`.

**Interfaces:** Export `WorkspaceSectionId = 'today' | 'projects' | 'learning' | 'automations' | 'library'`; `WorkspaceDestination { to: string; label: string; also?: string[] }`; `WorkspaceSection { id: WorkspaceSectionId; label: string; entry: string; destinations: WorkspaceDestination[] }`; `WORKSPACE_SECTIONS: WorkspaceSection[]`; `AUXILIARY_DESTINATIONS: WorkspaceDestination[]`; `workspaceLocation(path: string): WorkspaceSectionId | null`; `workspaceEntry(id: WorkspaceSectionId, remembered: Record<string,string>): string`. Retain existing hub functions until all consumers migrate; avoid two disagreeing visible navigation models.

- [ ] Add tests: five primary IDs in exact order above; default entries `/activity`, `/ventures`, `/learn`, `/playbooks`, `/library`; nested `/plays/p1` → automations; `/sessions/r1` remains accessible via auxiliary Sessions; `/studio-x` never matches `/studio`; mismatched remembered destinations use section default.
- [ ] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/workspace-navigation.test.ts` and confirm missing exports fail before implementation.
- [ ] Implement metadata. Projects includes Ventures, Board, Specs, Studio and Terminal; Learning includes Learning and Visual teaching; Automations includes Playbooks and Schedules; Library includes Library and Memory. Auxiliary navigation retains Sessions, Team, Rooms, Crew HQ, Tools & Skills, Policy & Audit, Insights/Usage/Developer aliases, Guide and Settings. All existing routes remain unchanged.
- [ ] Test every existing `HUBS` destination/alias is represented once in the new registry or explicitly identified as a secondary route; test no prefix collision.
- [ ] Run both navigation suites; inspect failures before replacing any old expectation.

## Task 2: Black-gradient appearance preset and shared surface rules

**Files:** Modify `apps/web/src/lib/appearance.ts`, `apps/web/src/themes.css`, `apps/web/src/lib/theme-code.ts`, `apps/web/src/lib/modes-themes.test.ts` and the existing Appearance component found through `Settings.tsx`; add `apps/web/src/obsidian.css`.

**Interfaces:** Add `obsidian` as a valid dark palette using the existing appearance validation/persistence contract. CSS applies through `:root[data-theme="dark"][data-palette="obsidian"]`; existing themes are not globally overridden. Use shared named surface/status/motion tokens consumed by Task 3.

- [ ] Add theme validation/round-trip tests proving `obsidian` survives encode/decode; unknown palettes still fall back; existing palette values remain accepted.
- [ ] Run the focused theme tests and confirm only the new palette case fails.
- [ ] Register Obsidian in Appearance and define the exact approved base colors, blue/violet primary action gradient, restrained hairlines, layered elevation, system typography and spacing. Keep native/notch black cap unchanged. Existing Lucide icons use consistent optical size/stroke; no icon dependency replacement.
- [ ] Add scoped high-contrast focus, hover, pressed, disabled and error states. Use 150–200ms feedback and 250–360ms panel transitions; honor app/system reduced motion. Avoid continuous page-background animation and blur-heavy reading surfaces.
- [ ] Verify theme code tests plus `node node_modules/typescript/bin/tsc --noEmit -p apps/web`. Do not write snapshot tests that merely mirror CSS text; visually inspect actual composition in Task 4.

## Task 3: Five primary destinations with discoverable secondary tools

**Files:** Modify `apps/web/src/shell/HubNav.tsx`, `apps/web/src/shell/hub-nav.css`, `apps/web/src/shell/Shell.tsx`, `apps/web/src/shell/CommandPalette.tsx`; add `apps/web/src/shell/WorkspaceNav.test.tsx`.

**Interfaces:** Both wide and compact navigation consume `WORKSPACE_SECTIONS`; current route determines selected section via `workspaceLocation`. Existing assistant opener, compose event, route links and connection state remain the source of behavior. No fake task counts.

- [ ] Add interaction tests: five main destinations; opening All tools exposes all secondary routes; route changes update current selection; old session links still open; keyboard shortcuts do not fire while typing in inputs/editable text or terminals; invalid remembered route cannot escape its section.
- [ ] Run focused test and confirm failures before changing rendering.
- [ ] Replace the permanently expanded feature list with five primary rows and contextual child navigation. Keep Ask Shua and conversation history immediately accessible; provide expandable Crew and All tools. Keep Settings visible. Preserve collapse preference and direct deep links.
- [ ] Use the same registry for command palette labels and section keyboard navigation; preserve existing page shortcuts. Make disclosure controls real buttons with `aria-expanded`; real navigation links use `aria-current` rather than unsupported tab semantics.
- [ ] Apply shared layout/surface/icon rules through `obsidian.css`, imported in the shell after older polish styles. Scope legacy-glow suppression to Obsidian. Do not add an ever-growing sequence of unscoped overrides.
- [ ] Run navigation/component tests, theme tests and typecheck. Exercise populated, empty and offline states; no loading placeholder may report success.

## Task 4: Native verification and install

**Files:** Add `docs/verification/obsidian-foundation-2026-10-04.md`; use existing `apps/mac/scripts/install.sh` and native app verification facilities without changing their safety contract.

- [ ] Run `node node_modules/vitest/vitest.mjs run` and web/gateway TypeScript checks. Record commands, exit status and actual output. Fix failures attributable to this change; identify unrelated failures without hiding them.
- [ ] Inspect Today, populated Sessions, Learning, Projects/Ventures, Automations/Playbooks, Library and Settings in the running app. Check old deep links and all secondary routes are reachable.
- [ ] Verify at narrow window widths and enlarged text; visible focus and keyboard traversal; system/app reduced motion; returning to a typed assistant draft. Check actual rendered text contrast, not only opaque token pairs. Record unresolved visual automation blockers plainly.
- [ ] Confirm gateway has no active work before any required service restart. Do not restart it if only static/native resources changed.
- [ ] Quit/reinstall only Shua through its existing installer, which retains the previous app. Preserve Sable process and running jobs. Activate the requested Obsidian preset through the normal appearance-setting contract; do not erase other saved appearance values or theme options.
- [ ] Verify installed code signature, actual app launch, primary navigation, input focus and representative screen screenshots. Restore normal mode after probes. Record limitations; do not claim frame-rate or model correctness from a screenshot.
- [ ] Leave changes uncommitted. Report installed result, evidence and the remaining connected-workspace phases.

## Self-review

Foundation covers palette/tokens, icon consistency, coherent navigation, secondary-feature reachability and native/notch compatibility. The full design's lesson workspace, project recommendations, richer linking and unified automation lifecycle are intentionally separate deliverables; retain them in the rollout rather than claiming completion here. There is no persistent-data migration in this phase. Exact routes and helper signatures agree across tasks. Review-focus cases are assigned to Tasks 1–4. UI rendering remains a real verification requirement: prior browser-provider failures do not waive it.
