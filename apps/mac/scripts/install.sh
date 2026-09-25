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
  <key>NSMicrophoneUsageDescription</key><string>So you can talk to your crew instead of typing. Speech is transcribed on this Mac.</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --sign "${SHUACREW_SIGN_IDENTITY:--}" "$STAGE"
# Quit through the app before installing. Running agents belong to the gateway and continue.
if pgrep -xq ShuaCrew; then
  echo "Quit ShuaCrew before installing. Agents keep running in the gateway." >&2
  exit 1
fi
INSTALL_STAGE=$(mktemp -d /Applications/.shuacrew-install.XXXXXX)
ditto "$STAGE" "$INSTALL_STAGE/ShuaCrew.app"
codesign --verify --strict "$INSTALL_STAGE/ShuaCrew.app"
BACKUP="/Applications/ShuaCrew.backup-$(date +%Y%m%d-%H%M%S).app"
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
echo "installed /Applications/ShuaCrew.app"
codesign --verify --strict /Applications/ShuaCrew.app
