# Windows Release Guide

This guide covers the baseline process for producing a Windows release artifact.

## Prerequisites

- Node.js 18+
- Windows build environment (or CI runner) for final installer validation
- Code signing certificate in environment variables:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
- `ffmpeg` available on PATH for Windows runtime audio capture fallback
- Signing template: `tools/windows-signing.env.example`

## Commands

- Validate Windows release readiness:
  - `npm run release:win:check`
- Validate in unsigned mode (CI/dev):
  - `ALLOW_UNSIGNED_WINDOWS_RELEASE=true npm run release:win:check`
- Build Windows artifacts (x64):
  - `npm run build:win`
- Build and publish Windows release:
  - `npm run build:win:release`

## Artifacts

Expected artifact pattern from electron-builder:

- `Jarvis - AI Assistant-<version>-x64-Setup.exe`

## Updater metadata

Use `tools/windows-update-metadata.example.json` as the template for publishing
Windows updater metadata to your release storage endpoint.

## Current limitations

- Native input/audio/typing modules are still macOS-first.
- Windows currently uses fallback hotkey behavior until native parity lands.
- Windows recording fallback currently depends on system `ffmpeg` availability.
- Installer signing trust and SmartScreen reputation still depend on certificate + distribution history.
