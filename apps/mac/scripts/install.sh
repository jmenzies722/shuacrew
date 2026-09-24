#!/bin/bash
# Build ShuaCrew for Mac and install it as /Applications/ShuaCrew.app (ad-hoc signed).
# The app is a window onto the gateway: it starts it when nothing answers on 7420.
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}"
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
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --sign "${SHUACREW_SIGN_IDENTITY:--}" "$STAGE"
# If it's open, quit it politely (a normal Quit — agents keep running in the gateway), install,
# and open it again where it was.
WAS_RUNNING=0
if pgrep -xq ShuaCrew; then
  WAS_RUNNING=1
  osascript -e 'quit app id "dev.shuacrew.mac"' >/dev/null 2>&1 || true
  for _ in $(seq 50); do pgrep -xq ShuaCrew || break; sleep 0.1; done
  if pgrep -xq ShuaCrew; then echo "ShuaCrew didn't quit — close it and run this again." >&2; exit 1; fi
fi
rm -rf /Applications/ShuaCrew.app
cp -R "$STAGE" /Applications/ShuaCrew.app
echo "installed /Applications/ShuaCrew.app"
if [ "$WAS_RUNNING" = 1 ]; then open -a /Applications/ShuaCrew.app && echo "reopened"; fi
