#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Focusin — Build & Package Script
# Produces Focusin.app and a drag-to-Applications Focusin.dmg
# Usage:  bash build.sh          → builds .app only
#         bash build.sh --dmg    → builds .app and .dmg
# ──────────────────────────────────────────────────────────────────
set -e

PRODUCT="Focusin"
BUNDLE_ID="com.focusin.app"
VERSION="1.0"
MIN_OS="12.0"
BUILD_DIR="$(pwd)/.build"
APP_BUNDLE="$BUILD_DIR/$PRODUCT.app"
CONTENTS="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS/MacOS"

SDK="$(xcrun --sdk macosx --show-sdk-path 2>/dev/null)"
ARCH="$(uname -m)"

echo "▶  Building $PRODUCT $VERSION ($ARCH)"

# ── Icon ───────────────────────────────────────────────────────────
ICONSET="$BUILD_DIR/AppIcon.iconset"
ICNS="$BUILD_DIR/AppIcon.icns"
mkdir -p "$BUILD_DIR"
echo "   Generating icon…"
swift generate_icon.swift "$ICONSET" 2>/dev/null
iconutil -c icns "$ICONSET" -o "$ICNS"
echo "   ✓ Icon (AppIcon.icns)"

# ── Collect main-app sources ───────────────────────────────────────
SOURCES=(
  Focusin/FocusinApp.swift
  Focusin/AppDelegate.swift
  Focusin/ContentView.swift
  Focusin/Theme.swift
  Focusin/Models/BlockSession.swift
  Focusin/Models/SessionRecord.swift
  Focusin/Services/HistoryManager.swift
  Focusin/Services/SessionManager.swift
  Focusin/Services/HostsFileManager.swift
  Focusin/Services/AppWatcherService.swift
  Focusin/Services/LaunchAgentManager.swift
  Focusin/Services/InstalledAppsProvider.swift
  Focusin/Views/HomeView.swift
  Focusin/Views/SetupView.swift
  Focusin/Views/CommitmentView.swift
  Focusin/Views/ActiveSessionView.swift
  Focusin/Views/AddMoreView.swift
  Focusin/Views/MenuBarPopoverView.swift
  Focusin/Views/SessionEndOverlayView.swift
)

# ── Compile main app ───────────────────────────────────────────────
mkdir -p "$MACOS_DIR" "$CONTENTS/Resources"
cp "$ICNS" "$CONTENTS/Resources/AppIcon.icns"

swiftc \
  -target "${ARCH}-apple-macosx${MIN_OS}" \
  -sdk "$SDK" \
  -framework SwiftUI \
  -framework AppKit \
  -framework Foundation \
  -framework Combine \
  -framework UserNotifications \
  -O \
  "${SOURCES[@]}" \
  -o "$MACOS_DIR/$PRODUCT"

echo "   ✓ Main app compiled"

# ── Compile watcher (separate lightweight executable, no SwiftUI) ──
swiftc \
  -target "${ARCH}-apple-macosx${MIN_OS}" \
  -sdk "$SDK" \
  -framework AppKit \
  -framework Foundation \
  -O \
  FocusinWatcher/main.swift \
  -o "$MACOS_DIR/FocusinWatcher"

echo "   ✓ Watcher compiled → Contents/MacOS/FocusinWatcher"

# ── Info.plist ─────────────────────────────────────────────────────
/usr/libexec/PlistBuddy -c "Add :CFBundleExecutable        string $PRODUCT"    "$CONTENTS/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier        string $BUNDLE_ID"  "$CONTENTS/Info.plist" 2>/dev/null || true
cat > "$CONTENTS/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>        <string>$PRODUCT</string>
  <key>CFBundleIdentifier</key>        <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>              <string>$PRODUCT</string>
  <key>CFBundleDisplayName</key>       <string>$PRODUCT</string>
  <key>CFBundleVersion</key>           <string>1</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundlePackageType</key>       <string>APPL</string>
  <key>LSMinimumSystemVersion</key>    <string>$MIN_OS</string>
  <key>NSPrincipalClass</key>          <string>NSApplication</string>
  <key>NSAppleScriptEnabled</key>      <true/>
  <key>NSAppleEventsUsageDescription</key>
    <string>Focusin uses administrator privileges to block websites by editing your system hosts file.</string>
  <key>NSHighResolutionCapable</key>   <true/>
  <key>CFBundleIconFile</key>         <string>AppIcon</string>
</dict>
</plist>
PLIST

echo "   ✓ Info.plist"

# ── Ad-hoc code sign (signs all executables inside the bundle) ────
# --deep signs Focusin + FocusinWatcher in one pass
codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null \
  && echo "   ✓ Ad-hoc signed (Focusin + FocusinWatcher)" \
  || echo "   ⚠  codesign skipped (install Xcode Command Line Tools to fix)"

echo ""
echo "✅  App: $APP_BUNDLE"

# ── DMG ───────────────────────────────────────────────────────────
[[ "$1" != "--dmg" ]] && { echo "   Run with --dmg to also create a distributable DMG."; exit 0; }

echo ""
echo "▶  Creating DMG…"

DMG_FINAL="$(pwd)/$PRODUCT.dmg"   # output to project root for easy access
DMG_TEMP="$BUILD_DIR/${PRODUCT}_temp.dmg"
STAGING="$BUILD_DIR/dmg_staging"
MOUNT_PT="/Volumes/$PRODUCT"
VOL_SIZE="200m"

# Clean up any previous build artefacts
rm -rf  "$STAGING" "$DMG_TEMP" "$DMG_FINAL"
umount  "$MOUNT_PT" 2>/dev/null || true

mkdir -p "$STAGING"
cp -R "$APP_BUNDLE" "$STAGING/$PRODUCT.app"
ln -s /Applications "$STAGING/Applications"

# 1. Create a writable DMG from the staging folder
hdiutil create \
  -volname   "$PRODUCT" \
  -srcfolder "$STAGING" \
  -fs        HFS+ \
  -fsargs    "-c c=64,a=16,b=16" \
  -format    UDRW \
  -size      "$VOL_SIZE" \
  "$DMG_TEMP" >/dev/null

# 2. Mount it (no auto-open, no browse)
hdiutil attach "$DMG_TEMP" \
  -mountpoint "$MOUNT_PT" \
  -nobrowse -noautoopen >/dev/null

# 3. Use Finder via AppleScript to set the window layout
osascript << APPLESCRIPT
tell application "Finder"
  tell disk "$PRODUCT"
    open
    set current view of container window to icon view
    set toolbar visible  of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 780, 460}
    set viewOptions to the icon view options of container window
    set arrangement   of viewOptions to not arranged
    set icon size     of viewOptions to 96
    set text size     of viewOptions to 12
    -- Position: app on left, Applications folder on right
    set position of item "$PRODUCT.app"   of container window to {160, 160}
    set position of item "Applications"   of container window to {420, 160}
    close
    open
    update without registering applications
    delay 1
  end tell
end tell
APPLESCRIPT

# Give Finder a moment to write .DS_Store
sleep 2

# Hide .DS_Store from users
SetFile -a V "$MOUNT_PT/.DS_Store" 2>/dev/null || true

# 4. Detach
hdiutil detach "$MOUNT_PT" >/dev/null

# 5. Convert to compressed read-only DMG
hdiutil convert "$DMG_TEMP" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "$DMG_FINAL" >/dev/null

rm -rf "$STAGING" "$DMG_TEMP"

echo "   ✓ Window layout set"
echo ""
echo "✅  DMG: $DMG_FINAL"
echo ""
echo "Distribute $DMG_FINAL — users:"
echo "  1. Open the DMG"
echo "  2. Drag Focusin → Applications"
echo "  3. Right-click Focusin.app → Open  (first launch only, to bypass Gatekeeper)"
