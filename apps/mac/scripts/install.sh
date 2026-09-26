#!/bin/bash
# Build ShuaCrew for Mac and install it as /Applications/ShuaCrew.app (ad-hoc signed).
# The app is a window onto the gateway: it starts it when nothing answers on 7420.
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}"
# The installed window and the gateway must use the same current interface.
pnpm --dir ../.. --filter @shuacrew/web build
if [ ! -f Resources/AppIcon.icns ]; then
  ICON=$(mktemp -d)
  swift scripts/make-icon.swift "$ICON/icon.png"
  mkdir -p "$ICON/AppIcon.iconset"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$ICON/icon.png" --out "$ICON/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
    sips -z $((s * 2)) $((s * 2)) "$ICON/icon.png" --out "$ICON/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICON/AppIcon.iconset" -o Resources/AppIcon.icns
fi
swift build -c release --product ShuaCrew
BIN=$(swift build -c release --show-bin-path)/ShuaCrew
STAGE=$(mktemp -d)/ShuaCrew.app
mkdir -p "$STAGE/Contents/MacOS" "$STAGE/Contents/Resources"
cp "$BIN" "$STAGE/Contents/MacOS/ShuaCrew"
cp Resources/AppIcon.icns "$STAGE/Contents/Resources/"
cat > "$STAGE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>ShuaCrew</string>
  <key>CFBundleDisplayName</key><string>ShuaCrew</string>
  <key>CFBundleIdentifier</key><string>dev.shuacrew.mac</string>
  <key>CFBundleExecutable</key><string>ShuaCrew</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>$(date +%Y%m%d%H%M)</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>15.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSLocationUsageDescription</key><string>Only for the weather in the top bar, and only if you turn it on. Rounded to about a kilometre.</string>
  <key>NSLocationWhenInUseUsageDescription</key><string>Only for the weather in the top bar, and only if you turn it on. Rounded to about a kilometre.</string>
  <key>NSAppleEventsUsageDescription</key><string>So Spark can play and pause your music, change appearance and run tasks you ask for. Only when you ask.</string>
  <key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>ShuaCrew link</string><key>CFBundleURLSchemes</key><array><string>shuacrew</string></array></dict></array>
  <key>NSCalendarsFullAccessUsageDescription</key><string>So Today can plan around your meetings. Read on this Mac only — titles and times, never sent anywhere.</string>
  <key>NSSpeechRecognitionUsageDescription</key><string>Only for the "Hey Spark" wake word, and only if you turn it on. Recognised on this Mac; nothing is sent anywhere.</string>
  <key>NSMicrophoneUsageDescription</key><string>So you can talk to your crew instead of typing. Speech is transcribed on this Mac.</string>
  <key>NSScreenCaptureUsageDescription</key><string>Spark looks at the display it's on only when you ask with the eye on. One screenshot, never recorded, never in the background.</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
# Sign with your Apple Development identity when there is one: macOS privacy permissions (Screen Recording,
# Microphone, Location) then belong to "ShuaCrew by you" and survive quit/rebuild. Ad-hoc signing ("-") has
# no Team ID, so Settings can show the toggle on while the grant is ignored after every quit.
if [ -z "${SHUACREW_SIGN_IDENTITY:-}" ]; then
  SHUACREW_SIGN_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/^[[:space:]]*[0-9]*)[[:space:]]*\([A-F0-9]\{40\}\) "Apple Development:.*$/\1/p' | /usr/bin/head -1)
fi
if [ -z "${SHUACREW_SIGN_IDENTITY:-}" ]; then
  echo "No Apple Development identity. Refusing ad-hoc install — Screen Recording would not stick across quit. Set SHUACREW_SIGN_IDENTITY only if you mean it." >&2
  exit 1
fi
echo "signing as: $SHUACREW_SIGN_IDENTITY"
codesign --force --sign "$SHUACREW_SIGN_IDENTITY" "$STAGE"
if [ "$SHUACREW_SIGN_IDENTITY" != "-" ]; then
  SIGN_INFO=$(codesign -dv "$STAGE" 2>&1)
  echo "$SIGN_INFO" | \grep -q 'Signature=adhoc' && { echo "Signing failed: still ad-hoc. Screen Recording will not persist." >&2; exit 1; }
  echo "$SIGN_INFO" | \grep -q 'TeamIdentifier=not set' && { echo "Signing failed: no Team ID. Screen Recording will not persist." >&2; exit 1; }
fi
# Quit through the app before installing. Running agents belong to the gateway and continue.
if pgrep -xq ShuaCrew; then
  echo "Quit ShuaCrew before installing. Agents keep running in the gateway." >&2
  exit 1
fi
INSTALL_STAGE=$(mktemp -d /Applications/.shuacrew-install.XXXXXX)
ditto "$STAGE" "$INSTALL_STAGE/ShuaCrew.app"
codesign --verify --strict "$INSTALL_STAGE/ShuaCrew.app"
# Backups live outside /Applications: copies there share the bundle id, and macOS may launch a stale one.
BACKUPS="$HOME/.shuacrew/app-backups"
mkdir -p "$BACKUPS"
BACKUP="$BACKUPS/ShuaCrew-$(date +%Y%m%d-%H%M%S).app"
if [ -e "$BACKUP" ]; then echo "Backup destination already exists: $BACKUP" >&2; exit 1; fi
if [ -d /Applications/ShuaCrew.app ]; then
  mv /Applications/ShuaCrew.app "$BACKUP"
  echo "Previous app retained at $BACKUP"
fi
if ! mv "$INSTALL_STAGE/ShuaCrew.app" /Applications/ShuaCrew.app; then
  [ ! -e /Applications/ShuaCrew.app ] && [ -d "$BACKUP" ] && mv "$BACKUP" /Applications/ShuaCrew.app
  exit 1
fi
rmdir "$INSTALL_STAGE"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
# Only the installed app answers to dev.shuacrew.mac; keep the two newest backups, unregistered.
for old in "$BACKUPS"/ShuaCrew-*.app; do [ -d "$old" ] && "$LSREGISTER" -u "$old" 2>/dev/null || true; done
ls -dt "$BACKUPS"/ShuaCrew-*.app 2>/dev/null | tail -n +3 | while read -r old; do rm -rf "$old"; done
"$LSREGISTER" -f /Applications/ShuaCrew.app 2>/dev/null || true
echo "installed /Applications/ShuaCrew.app"
codesign --verify --strict /Applications/ShuaCrew.app
