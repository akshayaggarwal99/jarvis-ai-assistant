#!/bin/bash

# Clean up any existing temp directory
rm -rf dmg-temp

# Create temp directory and copy app from correct location
mkdir -p dmg-temp
cp -R "release/mac-arm64/Jarvis - AI Assistant.app" dmg-temp/

# Create DMG with custom background
create-dmg \
  --volname "Jarvis - AI Assistant" \
  --background "dmg-assets/background.png" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "Jarvis - AI Assistant.app" 175 190 \
  --app-drop-link 425 190 \
  "release/Jarvis - AI Assistant-0.1.4-arm64-custom.dmg" \
  dmg-temp

echo "DMG created with custom SVG background"
