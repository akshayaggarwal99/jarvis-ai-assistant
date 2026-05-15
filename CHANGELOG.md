# Changelog

All notable changes to Jarvis AI Assistant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-05-15

### Fixed
- **Voice tutorial spinner stuck.** Renderer subscribed to `transcription-state-change` but main process sent `transcription-state`. Channel mismatch left the processing spinner pulsing forever. Aligned both ends.
- **No waveform during onboarding.** The floating waveform window was lazily created by `activateOverlaysAndShortcuts()` which only runs *after* onboarding, so the tutorial had no visual/audio cue. Now created on demand from `waveform:show` and the push-to-talk start path.
- **Double inline indicator in voice + email tutorials.** A red "Listening…" pill rendered inside the textbox on top of the floating waveform showing the same state. Pill removed (waveform owns the cue), and the textarea padding bump that made room for the now-gone pill restored.

## [1.2.0] - 2026-05-15

### Added
- **Dictation tab**: New view on the dashboard showing lifetime time saved, week-over-week hours, day streak, words dictated, and a paginated list of recent transcripts with copy + expand. All local — reads from the same on-device store the app has always written to.
- **Anonymous usage pulse**: Bound the existing Settings → Privacy "analytics" toggle (on by default) to a real backend so the project can be improved with data on actual usage. No transcription text, no personal data — only coarse counts (word count, audio length, model name). Users can turn it off in Settings. Open-source builds are no-ops by default.

### Removed
- **Analytics tab**: Replaced by the new Dictation tab, which covers the same headline stats plus the session history the old Analytics tab was missing.

### Fixed
- **Update notification popup**: long release notes no longer push the Install button off-screen. The notes container now scrolls (capped at 40% viewport height). Markdown syntax (`##`, `**`, `` ` ``) is stripped to plain text.
- **Parakeet/Sherpa-ONNX local transcription**: Long utterances no longer freeze the app and dictation no longer silently stops after a long session.
  - `recognizer.decode()` was synchronous and blocked the Electron main process for several seconds on multi-second audio, starving IPC and audio-capture callbacks. Switched to `decodeAsync()`.
  - The singleton recognizer was never reset after a native error; one bad decode poisoned every subsequent call. Failed transcriptions now recycle the recognizer.
  - Per-utterance ONNX stream handles relied on GC and could accumulate hundreds of MB of native memory across a session. Streams are now released explicitly after each transcription.

## [1.1.0] - 2025-12-01

### Added
- **Local Whisper Model Support**: On-device speech-to-text transcription using OpenAI's Whisper model for enhanced privacy and offline capability
- **Settings UI**: New settings panel to configure transcription provider (Deepgram, Groq, or Local Whisper)
- **Model Selection**: Choose between different Whisper model sizes (tiny, base, small, medium) based on speed vs accuracy needs

### Fixed
- **WPM (Words Per Minute) Calculation**: Fixed inaccurate WPM tracking and display
- **Nudge Handler**: Resolved issues with nudge notifications not triggering correctly

### Improved
- **DMG Build Process**: Enhanced macOS DMG creation with proper background image and code signing for macOS 15 compatibility
- **Performance**: Optimized transcription pipeline for faster response times

## [1.0.0] - 2025-11-15

### Added
- Initial release of Jarvis AI Assistant
- Voice-activated AI assistant with push-to-talk (Fn key)
- Real-time speech-to-text transcription
- AI-powered text generation and editing
- Context-aware suggestions based on active application
- Native macOS integration with accessibility features
- Support for both Intel and Apple Silicon Macs
