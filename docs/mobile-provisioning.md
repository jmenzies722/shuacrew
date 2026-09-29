# Mobile provisioning boundary

No Apple account resources, certificates, profiles, schema deployments or paid
services have been created by this implementation. The current iPhone app is an
unsigned simulator build. The installed Mac app is ad-hoc signed and shows
**Setup required**; opening its Mobile settings does not create keys or cloud resources.

## Local builds

The checked-in Xcode project uses only the local `packages/apple` package.
`apps/ios/project.yml` is its reproducible source; the locally installed XcodeGen
can regenerate it with `xcodegen generate --spec apps/ios/project.yml`. Building
the generated project does not require XcodeGen or a remote generator dependency.

```sh
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild \
  -project apps/ios/ShuaCrew.xcodeproj -scheme ShuaCrew \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

The ordinary configuration deliberately has no `SHUACREW_CLOUDKIT` Swift flag,
container Info key, or CloudKit entitlement. It cannot construct a cloud container
or claim a connection. Local pairing requires an explicit button press and stores
its private key only on that device. Automated UI checks do not press that button.

## Requires explicit account authorization

Before creating anything, confirm the actual owning Apple team and proposed IDs:

- Mac: existing `dev.shuacrew.mac`.
- iPhone: `dev.shuacrew.ios`.
- Watch: proposed `dev.shuacrew.ios.watchkitapp` (target/relay still pending).
- Private container: proposed `iCloud.dev.shuacrew`.

A provisioned configuration must use the **same authorized private container** on
Mac and phone, with matching signed iCloud container and CloudKit service
entitlements. Only that configuration may define `SHUACREW_CLOUDKIT` and the
`ShuaCrewCloudContainer` Info key. Do not add the flag to the ordinary configuration
or guess a team/profile to bypass the setup state. Distribution and production
schema publication are separate approvals, not implied by development permission.

The Mac creates its private zone only after the user enables sync in a properly
signed build. The phone does not create zones or silently pair. Compare the entire
five-minute fingerprint and confirm the device on the Mac first. Room scope is
controlled on Mac; stop-sync on phone is not revocation. Revocation is local Mac
authority even when cloud access is unavailable.

## Still required before real-device acceptance

- Signed revocation/expiration tombstone publication and client handling.
- Provisioned account-change, cancellation, quota and recovery checks.
- Watch target, original-identity relay and its acceptance suite.
- Notification delivery (current phone UI only reports permission status).
- Real Mac/phone/watch pairing, harmless Allow/Deny, message, pause/stop, offline,
  expiry and revocation, tied to actual command IDs and audit acknowledgments.
- Final independent integration review and cloud-field privacy inspection.

No simulator test substitutes for these checks. No live microphone test has been
performed; the user deferred it. Voice duplex and public-release distribution are
separate outstanding requirements.
