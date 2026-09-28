# True fresh start and recurring keyboard focus follow-up

This supersedes the preserve-history reset in onboarding-reset-2026-09-27.md. The user requested an empty workspace and reported doubled typing in Terminal again.

## Applied

- Stopped the native app and gateway before moving the previous gateway home and native preferences/WebKit/HTTP/cache state out of the active profile.
- Old state is in `/Users/admin/.shuacrew-archives/fresh-start-20260927-215532`; it is not loaded by the application. Installed speech model assets were retained. External Claude/Codex logins and source repositories were untouched.
- Restarted the gateway with an empty home and opened first-launch onboarding. Did not complete onboarding.
- Changed the interactive companion from a nonactivating NSPanel to ordinary activation on explicit open/summon. Passive presentation still does not request keyboard focus. Screen annotation panels remain nonactivating.
- Built, signed, and installed `/Applications/ShuaCrew.app`. No commit or push.

## Commands and results

```sh
swift test -c release --package-path apps/mac > /private/tmp/shua-focus-final-swift.log 2>&1
```

Exit 0. Build complete in 13.40s; XCTest 3 tests, 0 failures; Swift Testing 23 tests passed.

```sh
codesign --verify --deep --strict /Applications/ShuaCrew.app
git diff --check
```

Both exit 0, no output.

```python
import json, urllib.request, sqlite3
base = 'http://127.0.0.1:7420/api/'
s = json.load(urllib.request.urlopen(base + 'snapshot'))
print({k: len(s[k]) for k in ['runs', 'members', 'rooms', 'artifacts',
    'knowledge', 'playbooks', 'plays', 'ventures', 'sites', 'approvals']})
t = json.load(urllib.request.urlopen(base + 'teaching'))
print({k: t.get(k) for k in ['active', 'lessons', 'busy']})
print(json.load(urllib.request.urlopen(base + 'audit/verify')))
c = sqlite3.connect('file:/Users/admin/.shuacrew/shuacrew.db?mode=ro', uri=True)
print(c.execute('pragma integrity_check').fetchone()[0])
```

Output: every listed workspace count is 0; teaching active null, lessons [], busy false; audit ok true, count 2; database integrity `ok`. The two audit entries are fresh startup activity, not restored sessions.

## UI observations and limits

### Subsequent regression and follow-up (22:01)

The user reported doubled typing again after the focus update, and confirmed typing returned to normal with ShuaCrew closed. The focus-only update above did not resolve the issue.

Two separate changes followed:

1. Onboarding now holds an editable name draft and normalizes/saves on blur, matching the existing Settings editor. Previously parsing each keystroke immediately replaced an empty value with Spark and trimmed trailing spaces, preventing normal name replacement.
2. TeachingOverlay no longer installs local/global keyboard monitors in its initializer. It starts them only after an authorized capture or practice start, and removes them when neither capture nor practice remains active. This isolates onboarding from teaching observation; it is not proof of the underlying OS-level cause or of typing safety during active teaching.

Fresh verification commands:

```sh
pnpm --filter @shuacrew/web build > /private/tmp/shua-name-draft-build.log 2>&1
pnpm typecheck > /private/tmp/shua-name-draft-types.log 2>&1
pnpm exec vitest run apps/web/src/lib/companion.test.ts > /private/tmp/shua-name-draft-tests.log 2>&1
swift test -c release --package-path apps/mac > /private/tmp/shua-observer-lifecycle-swift.log 2>&1
codesign --verify --deep --strict /Applications/ShuaCrew.app
```

Results: build passed (existing large-chunk warning), typecheck passed, 8 companion tests passed, 3 XCTest + 23 Swift Testing tests passed, signature verification passed. The native unit tests do not exercise physical key delivery.

Native UI automation on the installed follow-up build: cleared the name to empty; nine individual key events produced exactly `shua crew`; Command-A then Backspace cleared it to empty. Restored Spark and blurred; the shared sidebar reflected Spark. Onboarding remains step 1. Physical typing on this latest build and typing during active teaching remain unverified.

- Visually inspected the installed native app showing Welcome to ShuaCrew at step 1, with the default robot and theme and no old workspace history.
- Automated individual x/y/z keys produced `Sparkxyz` in the name field, once each. This is a narrow automated check, not proof that intermittent physical-keyboard duplication across apps is resolved. No user confirmation of this second fix yet.
- An isolated real Claude teaching request produced a rendered lesson, but the full native screen-capture → retry → success assessment/annotation loop was interrupted to address the keyboard regression and fresh-start request. That end-to-end verification remains outstanding.
- Physical multi-display behavior remains untested. Prior broader test results are recorded in persistent-practice-2026-09-27.md and are not represented as rerun here.
