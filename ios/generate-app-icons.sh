#!/bin/bash

# Generate iOS app icons from the Jarvis icon
# Usage: ./generate-app-icons.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ICON_SOURCE="$PROJECT_ROOT/assets/icon.png"
OUTPUT_DIR="$SCRIPT_DIR/JarvisAI/JarvisAI/Assets.xcassets/AppIcon.appiconset"

# Check if source icon exists
if [ ! -f "$ICON_SOURCE" ]; then
    echo "❌ Source icon not found: $ICON_SOURCE"
    exit 1
fi

# Check if sips is available (macOS built-in)
if ! command -v sips &> /dev/null; then
    echo "❌ sips command not found (required for image processing)"
    exit 1
fi

echo "🎨 Generating iOS app icons from Jarvis icon..."

# iOS App Store icon (1024x1024)
echo "  → Creating 1024x1024 (App Store)"
sips -z 1024 1024 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-1024.png" 2>/dev/null

# Mac icons
echo "  → Creating Mac icons"
sips -z 16 16 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-16.png" 2>/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-16@2x.png" 2>/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-32.png" 2>/dev/null
sips -z 64 64 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-32@2x.png" 2>/dev/null
sips -z 128 128 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-128.png" 2>/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-128@2x.png" 2>/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-256.png" 2>/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-256@2x.png" 2>/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-512.png" 2>/dev/null
sips -z 1024 1024 "$ICON_SOURCE" --out "$OUTPUT_DIR/AppIcon-512@2x.png" 2>/dev/null

# Update Contents.json with filenames
cat > "$OUTPUT_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "AppIcon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "dark"
        }
      ],
      "filename" : "AppIcon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "tinted"
        }
      ],
      "filename" : "AppIcon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "filename" : "AppIcon-16.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "16x16"
    },
    {
      "filename" : "AppIcon-16@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "16x16"
    },
    {
      "filename" : "AppIcon-32.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "32x32"
    },
    {
      "filename" : "AppIcon-32@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "32x32"
    },
    {
      "filename" : "AppIcon-128.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "128x128"
    },
    {
      "filename" : "AppIcon-128@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "128x128"
    },
    {
      "filename" : "AppIcon-256.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "256x256"
    },
    {
      "filename" : "AppIcon-256@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "256x256"
    },
    {
      "filename" : "AppIcon-512.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "512x512"
    },
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "512x512"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF

echo ""
echo "✅ iOS app icons generated successfully!"
echo "   Output: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"/*.png 2>/dev/null | head -5
echo "   ..."
