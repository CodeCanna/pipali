#!/bin/bash
# Create a properly formatted DMG for macOS distribution
# Usage: ./scripts/create-dmg.sh [--debug]
#
# Prerequisites: brew install create-dmg

set -euo pipefail

# Parse arguments
BUILD_TYPE="release"
if [[ "${1:-}" == "--debug" ]]; then
    BUILD_TYPE="debug"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

APP_PATH="$ROOT_DIR/src-tauri/target/${BUILD_TYPE}/bundle/macos/Pipali.app"
DMG_DIR="$ROOT_DIR/src-tauri/target/${BUILD_TYPE}/bundle/dmg"
DMG_PATH="${DMG_DIR}/Pipali-macos-arm64.dmg"

# Check if app exists
if [[ ! -d "$APP_PATH" ]]; then
    echo "Error: App not found at $APP_PATH"
    echo "Run 'bun run tauri:build' first"
    exit 1
fi

# Check if create-dmg is installed
if ! command -v create-dmg &> /dev/null; then
    echo "Installing create-dmg..."
    brew install create-dmg
fi

# Create output directory
mkdir -p "$DMG_DIR"

# Remove existing DMG if present (create-dmg won't overwrite)
rm -f "$DMG_PATH"

echo "Creating DMG..."
create-dmg \
    --volname "Pipali" \
    --volicon "$ROOT_DIR/src-tauri/icons/icon.icns" \
    --window-pos 200 120 \
    --window-size 660 400 \
    --icon-size 80 \
    --icon "Pipali.app" 180 170 \
    --hide-extension "Pipali.app" \
    --app-drop-link 480 170 \
    "$DMG_PATH" \
    "$APP_PATH"

echo ""
echo "DMG created at: $DMG_PATH"
ls -lh "$DMG_PATH"
