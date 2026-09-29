# Premium Panes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every pane readable, purposeful and connected through real work identities.
**Architecture:** Shared presentation primitives and context selectors, applied incrementally to existing routes. Do not create a second task database or change gateway authority from view code.
**Tech Stack:** React, TypeScript, existing UI tokens, Vitest and SwiftUI for companion consistency.
**Spec:** `docs/superpowers/specs/2026-09-25-whole-product-experience-map.md`.

## Global Constraints

Inherit `2026-09-25-product-closure.md`. Preserve palette/accent, compact navigation and existing IDs. No production fixture data. Keep unknown metrics unknown. No pane is complete from a screenshot alone.

## Review Focus

- IME/Shift+Enter must never submit accidentally: P1.
- Filtered-out/archived source must not create a dead action link: P2.
- Large text and reduced motion must work in all shared components: P1/P3.
- Manual business metrics must not appear provider-measured: P2.
- Network/storage errors must preserve unsent edits and explain recovery: P2/P3.

### P1: Shared pane and composer controls

**Files:** Create `apps/web/src/components/Pane.tsx`, `apps/web/src/components/pane.css`, `apps/web/src/lib/pane-model.ts`, `apps/web/src/lib/pane-model.test.ts`; modify `styles.css`, `lib/appearance.ts`, `lib/appearance.test.ts`, `lib/composer-keys.ts`, `lib/composer-keys.test.ts`, `screens/Settings.tsx`, `screens/Sessions.tsx`, `screens/Rooms.tsx`.

**Interfaces:** Produce `PaneHeader({title,description,actions})`, `PaneState({kind,title,detail,action})` where kind is loading/empty/error/offline; `SourceLink({to,label})` receives validated app routes only. Extend `Appearance.sendShortcut` with `button-only`.

- [ ] Add the keyboard regression before changing behavior:

```ts
it('never submits by keyboard in button-only mode', () => {
  const e = {key:'Enter',shiftKey:false,altKey:false,ctrlKey:false,metaKey:false,isComposing:false};
  expect(shouldSend(e, 'button-only')).toBe(false);
  expect(shouldSend({...e,metaKey:true}, 'button-only')).toBe(false);
  expect(shouldSend({...e,shiftKey:true}, 'button-only')).toBe(false);
  expect(shouldSend({...e,isComposing:true}, 'enter')).toBe(false);
});
```

- [ ] Run `pnpm exec vitest run apps/web/src/lib/composer-keys.test.ts apps/web/src/lib/appearance.test.ts`; observe the new regression fail.
- [ ] Add the early return `if (shortcut === 'button-only') return false;`, persist/validate the enum, expose all three modes in Settings, and remove misleading keyboard hints for button-only. Do not modify the saved user preference without explicit selection. Arrow buttons retain ordinary form submission. Prevent slash-picker handling from bypassing the no-send mode.
- [ ] Implement token-based shared header/state components without arbitrary new palettes. Preserve semantic heading order, labeled actions, focus rings and inline errors. Use status role only for changing state text, not entire frequently updating screens.
- [ ] Test invalid stored preferences, storage-denied behavior and section reset; run targeted suites and `pnpm typecheck`.
- [ ] Verify keyboard entry/IME, empty send, arrow send, focus return, compact viewport, large reading size and reduced motion in installed UI using harmless isolated work.

### P2: Apply the framework and connect each pane

**Files:** Modify the exact `apps/web/src/screens/` files listed below; create `apps/web/src/lib/work-links.ts` and `work-links.test.ts`. Preserve specialized logic in each screen.

**Interfaces:** Produce `workLinks(input: {runId?:string;roomId?:string;ventureId?:string;artifactId?:string}, exists: (kind:string,id:string)=>boolean): Array<{kind:string;id:string}>`; only existing, authorized entities yield links. UI maps these to existing routes/viewers; artifact IDs open Library's existing viewer rather than invented routes.

- [ ] Pin identity behavior first:

```ts
expect(workLinks({runId:'archived',roomId:'room-a'}, (kind,id)=>kind==='room'&&id==='room-a'))
  .toEqual([{kind:'room',id:'room-a'}]);
expect(workLinks({},()=>true)).toEqual([]);
```

- [ ] Run `pnpm exec vitest run apps/web/src/lib/work-links.test.ts`, confirm failure, then implement allowlisted identity filtering with no guessed relationships.
- [ ] Process the following rows in order. For each row add or extend a focused render/selector test in `apps/web/src/lib/pane-coverage.test.tsx`, capture its failing assertion, implement the listed change, then rerun that test. Tests use imported real components with isolated adapters, never production fixture toggles.

| File / pane | Change and concrete acceptance |
| --- | --- |
| `Sessions.tsx` | Shared tool cards, saved drafts, stable scroll and source links; a follow-up edit during submission survives |
| `Ventures.tsx` | One primary empty-state CTA, readable next action, project-linked work/results; manual metrics explicitly labeled and failed sync visible |
| `CrewPage.tsx` | Member role/provider/delegation summary and preview-before-save; cancel edit leaves original preferences intact |
| `Rooms.tsx` | Integrate R2/R4 Chat/Work/Results; queued acknowledgment never displayed as task completion |
| `CrewFloor.tsx` | Actual member/run links and unknown/offline states; no active animation for stale observations |
| `TerminalPage.tsx` | Clear selected session and copy/search affordances; no terminal command fired by focus/navigation |
| `Playbooks.tsx` | Input/permission preview, phase evidence and recovery; retry/restart effects explained before submission |
| `Specs.tsx` | Distinct draft/review/approved state with linked execution; disabled action explains its prerequisite |
| `Board.tsx` | Owner/blocker/next action and useful empty columns; priority moves do not falsify run status |
| `MissionControl.tsx` | Decisions, outcomes, active work and scheduled next steps; each item opens its source and retains return position |
| `Library.tsx` | Readable version/source/context previews; missing artifacts show unavailable, no dead download links |
| `Memory.tsx` | Source/scope/edit/forget clarity; historical lesson display does not imply current application |
| `Schedules.tsx` | Human schedule/timezone/next run and last result; pause errors visible and Mac availability explained |
| `Integrations.tsx` | M1/M2 identities/cards; connection freshness distinct from authorization; no sign-in from mere view |
| `Pages.tsx` Policy export | Clear permission and audit source links; no visual switch silently broadens access |
| `Observability.tsx` | Operational drill-through and source filters; missing samples are gaps, not interpolated activity |
| `Observability.tsx` Usage | Recorded coverage and nullable cost; filtered totals reconcile with contributing records |
| `Developer.tsx`, `components/DeveloperSettings.tsx` | Bounded diagnostics, V3 stage timings and recovery links; exported data excludes secrets |
| `Settings.tsx` | Searchable consistent controls, C2 previews, voice/MCP controls; reload preserves values and reset is scoped |
| `RunDetail.tsx` | Source context, actual evidence and clear stop/fork semantics; removed source does not crash |
| `Review.tsx` | Changes/checks precede decisions; dirty feedback survives request failure and approval effects are explicit |

- [ ] Add one render assertion per row for its listed negative condition and one for its source/primary action; run `pnpm exec vitest run apps/web/src/lib/pane-coverage.test.tsx` after each pane. If dependencies require a narrower test file, name it by pane and add it to the evidence ledger.
- [ ] Run the complete suite/typecheck and inspect every pane at normal/compact sizes; do not call implementation complete while any row lacks the functional and visual checks.

### P3: Native companion consistency and complete journey

**Files:** Modify `apps/ios/Sources/TodayView.swift`, `CrewView.swift`, `SettingsView.swift`, `ApprovalView.swift`; extend `apps/ios/UITests/CompanionUITests.swift` and `apps/watch/Tests/WatchModelTests.swift`.

**Interfaces:** Consume R3 signed normalized views and C2 local preferences. Retain native navigation, authentication and Watch compact projection.

- [ ] Add XCTest checks that an unpaired app has no working remote controls and no invented results; keep existing labels or update both tests and intentional copy together:

```swift
let app = XCUIApplication()
app.launch()
XCTAssertTrue(app.staticTexts["Pair with your Mac"].waitForExistence(timeout: 10))
XCTAssertEqual(app.alerts.count, 0)
```

- [ ] Add populated view tests through test-target injection only: stale offers cannot allow, pending messages say Waiting for Mac, large text keeps controls reachable, room drafts survive navigation. Run the corresponding scheme and record expected regression before implementation.
- [ ] Apply shared hierarchy/spacing/status language through native components; do not import a webpage as the phone UI. Exercise Today→Room→Result→Approval→return and Settings→preview→relaunch.
- [ ] Run native tests and G2 scenarios; record physical/cloud/acoustic gates separately from simulator evidence.

### P4: Clean installation, onboarding and distribution gate

**Files:** Inspect/modify `apps/mac/scripts/install.sh`, `apps/mac/Sources/ShuaCrew/main.swift` and `MainWindow.swift`; create `apps/mac/Sources/ShuaCrewCore/InstallationReadiness.swift`, `apps/mac/Tests/ShuaCrewCoreTests/InstallationReadinessTests.swift`, `apps/mac/Sources/ShuaCrew/OnboardingView.swift`, `scripts/package-gateway.mjs`, `docs/distribution-verification.md`.

**Interfaces:** Produce `InstallationReadiness` with `gatewayPresent`, `providerAvailable`, `speechReady`, and derived `canStartText`/`canStartVoice`. Bundled gateway manifest defines version, relative entrypoint and SHA-256 of included executables/resources. Paths resolve relative to application resources, never a developer checkout.

- [ ] Add RED Swift test:

```swift
@Test func speechFailureDoesNotBlockTextSetup() {
    let state = InstallationReadiness(gatewayPresent: true, providerAvailable: true, speechReady: false)
    #expect(state.canStartText)
    #expect(!state.canStartVoice)
}
```

- [ ] Run the Mac suite, then implement read-only readiness checks and a native first-run flow explaining providers, microphone, local speech downloads and optional mobile sync. Explicit actions trigger setup; merely opening onboarding never signs in or grants permission. Existing installations can reopen onboarding without losing preferences.
- [ ] Build a reproducible gateway resource bundle from pinned package-manager dependencies. Include the required runtime and native modules for the target architecture, verify dependency licenses and checksum contents. Test from a temporary path with spaces and without repo-relative PATH/modules; missing/corrupt resources produce a recovery screen rather than shell fallback.
- [ ] Replace developer-checkout assumptions in installed startup with the validated bundle path, while keeping explicit development mode separate. Preserve the user's data directory and existing gateway work. Installer makes a recoverable app backup and refuses to overwrite an active incompatible installation without coordination.
- [ ] Define signed update verification before any updater UI: manifest/package authenticity, target version/architecture, interrupted-download cleanup and rollback. With no Developer ID/release signing credentials, test the mechanism using isolated test keys and mark distribution unavailable; never ship those keys or treat ad-hoc signatures as public-release signing.
- [ ] Verify clean-account setup, repair, upgrade and rollback in an isolated environment; record actual provider availability and local speech installation results. Verify current provider subscription/automation terms from official sources before inviting external users; do not infer permission from a CLI working locally. Paid enrollment, real signing assets, CloudKit provisioning, publication and final public-update delivery remain user-authorized gates.
