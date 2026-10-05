# Wallpaper click and workspace awareness — 2026-10-05

## Evidence

User identified System Settings wallpaper selection. Run `r_5d4db3c3` received fresh screenshots and OCR/Accessibility context for System Settings / Wallpaper, including the Golden Gate Sunset button. It emitted native press actions, received `Pressed Golden Gate Sunset`, then claimed application/verification despite the user's report that no click applied it.

Source: SparkPress.press returns true immediately when AXPress reports success, without verifying the requested application state. The follow-up prompt called this `Step ... done`, encouraging the model to confuse dispatch with completion. Screen evidence was available; this was not demonstrated to be a screen-permission failure.

## Changes

- Fresh-action preparation now resolves named press requests to a unique current Accessibility/OCR target and returns an actual click payload at its current position. It does not use the global fuzzy press search for this observed desktop-step route.
- Existing app/window/display checks remain. Missing and ambiguous targets fail before dispatch.
- Action follow-ups label an accepted action as dispatched with an unverified outcome. They require a visible result change and explicitly reject cursor arrival, target-label visibility, or accepted press as proof of completion.
- Workspace context additionally reads local MCP configuration in parallel with Learning and Visual data. It includes names, assistant enablement, auth type and sign-in state, not connection URLs, arguments, headers or credentials. Configuration is explicitly distinguished from live tool health.
- Other native press callers and physical input verification are outside this bounded fix. Not all third-party controls or workflows have been verified.

## Verification

```text
node node_modules/vitest/vitest.mjs run
Test Files 248 passed (248)
Tests 1161 passed (1161)
Duration 19.43s

node node_modules/typescript/bin/tsc --noEmit -p apps/web
git diff --check
Both exit 0

# apps/web:
node node_modules/vite/bin/vite.js build
built in 1.53s; exit 0
```

Tests cover converting a named press into an actual click on a moved control, rejecting absent/ambiguous controls, retaining app/window/display restrictions, honest dispatch wording, and excluding connector secrets from context.

Local endpoint probe (HTTP 200 for all): Learning 88ms, Teaching 16ms, MCP inventory 16ms. These are data-read timings, not model-response latency.

Logs: `/private/tmp/shua-wallpaper-fix-tests.log`, `/private/tmp/shua-wallpaper-fix-build.log`.

## Deployment and limits

Frontend bundle rebuilt; quit/reopen ShuaCrew to refresh its WebViews. Native binary and gateway unchanged. CUA inspection of System Settings failed with `Sky Computer Use native pipe startup failed`, so the actual wallpaper application is not claimed verified. No UI-control fallback was attempted.

Physical test after reopening: ask Shua to select Golden Gate Sunset in System Settings and verify the wallpaper itself changed. A dispatched click alone must not be reported as a completed wallpaper change.
