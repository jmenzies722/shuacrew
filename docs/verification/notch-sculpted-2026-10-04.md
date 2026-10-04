# Sculpted notch — 2026-10-04

Installed a compact black surface with subtle silver-blue depth, coordinated 360ms AppKit/WebKit easing, pressed-button feedback and steady focused composer. Existing bottom-only continuous AppKit corners remain. Removed inherited spectrum mask from the new surface overlay. Listening aura is blue, not green. Both system Reduce Motion and the in-app reduced-motion selector disable notch transitions/animations.

Validation commands and results:

- `node node_modules/typescript/bin/tsc --noEmit -p apps/web`: exit 0.
- `node node_modules/vitest/vitest.mjs run apps/web/src/lib/notch-layout.test.ts apps/web/src/lib/notch-hover.test.ts apps/web/src/lib/notch-presentation.test.ts apps/web/src/components/NotchThinking.test.tsx`: 4 files, 11 tests passed.
- `bash apps/mac/scripts/install.sh`: exit 0; installed `/Applications/ShuaCrew.app`; previous signed bundle retained by installer.
- `codesign --verify --deep --strict /Applications/ShuaCrew.app`: exit 0.
- Installed `notch:shot` visual probe: inspected fresh expanded screenshot, flush square top, rounded bottom, composer and content visible. Removed competing spectrum edge following first screenshot.
- `ps -p 8596 -o pid=,etime=,comm=`: original Sable process still running, over six days uptime.

Limitations: screenshots verify geometry/appearance, not animation frame pacing. The synthetic typed screenshot showed the placeholder, so it is not evidence of successful typing; input implementation was unchanged. Reduced-motion CSS reviewed, not exercised through a system-settings change. No claim of full voice/workflow regression coverage.

Apple motion guidance: https://developer.apple.com/design/human-interface-guidelines/motion . Native surface uses NSAnimationContext and Core Animation timing; WebKit content uses CSS transitions. This is not a SwiftUI or Liquid Glass rewrite.

No commit or push. Learning redesign discussed separately; no learning code modified by this pass.
