# Jarvis AI Assistant

A powerful, privacy-first voice dictation and AI assistant for macOS. Press a hotkey, speak, and your words are transcribed and pasted instantly. No cloud accounts required—your API keys stay on your machine.

## Features

- 🎙️ **Voice Dictation** - Press Fn key, speak, release to transcribe and paste
- ⚡ **Fast Transcription** - Uses Deepgram Nova-3 or OpenAI Whisper for accurate, fast transcription
- 🔒 **Privacy First** - All API keys stored locally, no cloud accounts or sign-ups required
- 🎨 **Minimal UI** - Unobtrusive waveform overlay while recording
- 📊 **Local Analytics** - Track your usage stats locally (time saved, words dictated)
- 🖥️ **macOS Native** - Built with Electron, optimized for macOS

## Quick Start

### Prerequisites

- **macOS** (Intel or Apple Silicon)
- **Node.js** v18 or higher
- **API Keys** (at least one):
  - [OpenAI API Key](https://platform.openai.com/api-keys) - For AI features and Whisper transcription
  - [Deepgram API Key](https://console.deepgram.com/) - For fast voice transcription (recommended)

### Installation

1. **Clone and navigate to the package:**
   ```bash
   git clone https://github.com/akshayaggarwal99/jarvis.git
   cd jarvis/packages/jarvis-ai-assistant
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure your API keys:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```env
   OPENAI_API_KEY=sk-your-openai-key-here
   DEEPGRAM_API_KEY=your-deepgram-key-here
   ```

4. **Build native modules:**
   ```bash
   npm run build:native
   ```

5. **Run the app:**
   ```bash
   npm run dev
   ```

## Usage

### Voice Dictation

1. **Press and hold the `Fn` key** - Recording starts, waveform appears
2. **Speak clearly** - Your voice is captured
3. **Release the `Fn` key** - Audio is transcribed and pasted at your cursor

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Fn` (hold) | Start/stop voice recording |
| `Cmd+Shift+J` | Show/hide dashboard |
| `Escape` | Cancel current recording |

## Configuration

### Environment Variables

Create a `.env` file in the package root with these options:

```env
# Required: At least one AI provider key
OPENAI_API_KEY=           # For AI features and Whisper transcription
DEEPGRAM_API_KEY=         # For fast Deepgram Nova-3 transcription (recommended)
ANTHROPIC_API_KEY=        # Optional: For Claude-based features
GEMINI_API_KEY=           # Optional: For Gemini-based features

# Optional: Local server settings
JARVIS_SERVER_PORT=34115  # Port for local API server
ENABLE_LOCAL_PROXY=true   # Route API calls through local server

# Optional: Feature flags
ENABLE_TELEMETRY=false    # Disable telemetry (default: false)
ENABLE_REMOTE_UPDATES=false  # Disable auto-updates (default: false)
```

### Permissions

On first run, macOS will ask for:
- **Microphone Access** - Required for voice recording
- **Accessibility Access** - Required for Fn key detection and text pasting

Grant these permissions in System Preferences → Security & Privacy.

## Building for Distribution

### Development Build
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Create DMG Installer
```bash
npm run build:dmg
```

## Project Structure

```
src/
├── main.ts              # Electron main process
├── index.tsx            # React renderer entry
├── App.tsx              # Main React component
├── auth/                # Authentication (local-only stubs)
├── config/              # Environment configuration
├── core/                # Core utilities (logger, etc.)
├── services/            # Business logic services
├── transcription/       # Audio transcription services
├── storage/             # Local data persistence
└── components/          # React UI components
```

## Troubleshooting

### "Fn key not working"
- Grant Accessibility permissions in System Preferences
- Restart the app after granting permissions

### "Transcription not working"
- Verify your API keys in `.env`
- Check that at least `OPENAI_API_KEY` or `DEEPGRAM_API_KEY` is set
- Ensure microphone permissions are granted

### "App shows white screen"
- Run `npm run build` to rebuild
- Check console for errors: `npm run dev`

## Privacy

- **No cloud accounts** - Works entirely with your own API keys
- **Local storage only** - Analytics and settings stored in `~/.jarvis/`
- **No telemetry** - Telemetry is disabled by default
- **Your keys, your data** - API keys never leave your machine

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Contributing

Contributions welcome! Please read the contributing guidelines before submitting PRs.
