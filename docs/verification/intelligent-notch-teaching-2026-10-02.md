# Intelligent notch teaching — October 2, 2026

## Implemented

- Versioned, validated architecture lessons with connected graphs, path filters, teaching steps, assumptions, trade-offs, failure modes, sources, and contextual follow-ups.
- Bounded revision/history state; reset/dismiss handling; narration keyed by lesson/revision/step rather than matching words alone.
- Architecture rendering in both companion surfaces without duplicating computer actions. The native notch opens the lesson, fits the diagram, and offers full-size exploration.
- Local voice comparison with owned playback resources, cancellation, readiness checks, explicit voice selection, and no cloud provider configuration.
- Removed keyword/gesture-triggered screen enabling when the screen toggle is off.

## Commands and observed output

```text
pnpm test
Test Files  188 passed (188)
Tests       878 passed (878)
Start at    12:07:56
Duration    12.00s

pnpm --filter @shuacrew/web exec tsc --noEmit
[no output, exit 0]

pnpm --filter @shuacrew/web build
✓ built in 935ms

git diff --check
[no output, exit 0]
```

Build reports existing large-chunk advisory warnings. Tests report Node localStorage-path warnings. Neither command failed.

## Native observations

Used the installed macOS application, not a browser substitute. Reloaded the main window and restarted the application for the separate notch webview. Verified the process was absent after Quit before relaunching.

The initial text-only test unexpectedly entered the screenshot path despite Screen off: the keyword heuristic matched negated screen/action language. Stop was attempted, but the response still completed, so the initial attempt cannot be represented as screen-free. Removed the auto-enable heuristic. Subsequent submitted prompts visibly retained Screen off and showed Designing rather than Reading your screen.

A six-component proposed streaming MVP generated a valid Concept Studio lesson. The native `/buddy` notch displayed all six nodes and their connections, not just text or a main-window diagram. Compact layout puts the complete overview above the fold; explanations and controls remain scrollable. Selecting Playback delivery visibly reduced the graph to viewer, CDN, and private storage. Full-size exploration remains available for labels. A prior observation showed Follow voice at step 3/3; this is evidence of playback-state progression, not proof of acoustic quality.

Generated examples were labeled proposed designs rather than Netflix's actual infrastructure. The response distinguished API authorization from CDN media delivery, direct source uploads from background processing, and publication from unvalidated output. No external factual research was requested or performed for these proposed examples. This is not a certification of every generated statement.

## Remaining acceptance gaps

- Physical listening, AirPods/device-switch recovery, voice preference comparison, and interruption behavior need hands-on hardware validation. Saved voice selection was not changed; cloud voice remains unconfigured.
- No measured p95 Enter latency or long-running native memory soak. Unit tests exercise 100 queue disposal cycles and 100 bounded revisions; those do not substitute for hardware measurements.
- Theme/reduced-motion variants, all follow-up cases, and invalid-diagram regeneration controls need further native acceptance work. Invalid diagrams currently retain the written answer and show retry guidance, not a dedicated retry button.
- Main-window pinning and prior-revision controls exist, but this pass does not claim comprehensive native verification of every control.
- No commits or pushes were made. Unrelated preexisting work was preserved.
