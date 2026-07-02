#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$REPO_ROOT/apps/macos/dist"
APP_PATH="$DIST_DIR/KeyFlow.app"
DMG_PATH="$DIST_DIR/KeyFlow.dmg"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: KeyFlow.app not found. Build the app first using scripts/build-keyflow-app.sh" >&2
  exit 1
fi

echo "Creating DMG package..."
rm -f "$DMG_PATH"

hdiutil create \
  -volname "KeyFlow Installer" \
  -srcfolder "$APP_PATH" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo "DMG package successfully created at:"
echo "$DMG_PATH"
