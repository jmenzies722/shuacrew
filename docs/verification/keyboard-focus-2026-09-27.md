# Companion keyboard focus — 2026-09-27

## Reproduction and diagnosis

User reported blocked ShuaCrew input, a ding on typing, and doubled letters in other apps. Individual synthetic `a`, `b`, `c` presses entered `abc` in the main composer, so that test alone did not reproduce the physical-keyboard problem. Test text was removed without submitting it.

Quit only the native interface through its UI. User confirmed typing outside ShuaCrew returned to normal. Gateway remained online.

Found a direct `panel.resignKey()` call on collapsed companion updates. The installed AppKit NSWindow.h explicitly documents this as an override notification: “Do not invoke directly.” It does not represent a supported focus transfer. See also [Apple's resignKey documentation](https://developer.apple.com/documentation/appkit/nswindow/resignkey()). The nonactivating panel can otherwise retain inconsistent keyboard ownership.

## Change

- Collapse a key companion using `orderOut`, then restore the character using `orderFrontRegardless`, which does not request keyboard focus.
- Let clicks in the card acquire keyboard focus without depending on WebKit internal hit views reporting `needsPanelToBecomeKey`.
- Ignore desktop expansion messages from the embedded main-window surface.
- No keyboard forwarding, event synthesis, global audio muting, or gateway restart added.

## Automated verification

```text
$ swift test -c release --package-path apps/mac
Build complete! (13.36s)
Executed 3 tests, with 0 failures
Test run with 23 tests in 0 suites passed
exit 0

$ git diff --check
(no output, exit 0)

$ codesign --verify --deep --strict /Applications/ShuaCrew.app
(no output, exit 0)

$ cmp /private/tmp/ShuaCrew-keyboard-release/ShuaCrew.app/Contents/MacOS/ShuaCrew /Applications/ShuaCrew.app/Contents/MacOS/ShuaCrew
(no output, exit 0)

$ curl -fsS http://127.0.0.1:7420/api/teaching/check
{"active":"teach_2d45f456-e1da-4ec0-99ce-edeca5164d8c","revision":6,"busy":false}
```

Full build/test log: `/private/tmp/shua-keyboard-swift.log`. Existing tests verify native functionality; they do not simulate WindowServer keyboard-focus ownership or prove the reported sound is gone.

## Activation and manual verification

Signed using the existing Apple Development identity. Installed via `/private/tmp/install-shua-keyboard.sh`; previous app retained at `/Users/admin/.shuacrew/app-backups/ShuaCrew-before-keyboard-20260927-212236.app`.

Opened the installed app and observed both its main window and floating companion. Automated companion typing verification was interrupted by live user interaction; no automated UI pass is claimed. For the final physical-keyboard check after opening/closing the companion, the user confirmed: **“Both are normal now.”** This confirms normal typing in ShuaCrew and outside it after activation. Audible behavior was user-verified, not measured by an automated audio test.

No commit or push.
