# Jarvis AI Assistant

<p align="center">
  <img src="assets/jarvis-logo.svg" alt="Jarvis AI Assistant" width="128"/>
</p>

<p align="center">
  <strong>A powerful, privacy-first voice dictation and AI assistant for macOS</strong>
</p>

<p align="center">
  <a href="https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/tag/v1.0.0">
    <img src="https://img.shields.io/badge/Download-v1.0.0-blue?style=for-the-badge" alt="Download"/>
  </a>
  <a href="https://github.com/akshayaggarwal99/jarvis-ai-assistant/stargazers">
    <img src="https://img.shields.io/github/stars/akshayaggarwal99/jarvis-ai-assistant?style=for-the-badge" alt="Stars"/>
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License"/>
  </a>
</p>

---

## 🚀 What is Jarvis?

Press a hotkey, speak, and your words are transcribed and pasted instantly. No cloud accounts required—your API keys stay on your machine.

**Fun fact:** Wispr Flow recently raised **$81 million USD** to build something similar. I built Jarvis in my spare time over 3 months and decided to open-source it for everyone. 🎉

---

## 📥 Download

Download the pre-built, signed & notarized DMG for your Mac:

| Platform | Download |
|----------|----------|
| **Apple Silicon (M1/M2/M3/M4)** | [Jarvis-1.0.0-arm64.dmg](https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/download/v1.0.0/Jarvis.-.AI.Assistant-1.0.0-arm64.dmg) |
| **Intel Mac** | [Jarvis-1.0.0.dmg](https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/download/v1.0.0/Jarvis.-.AI.Assistant-1.0.0.dmg) |

---

## 🎬 Demo

[![Jarvis AI Assistant Demo](https://img.youtube.com/vi/TnNf300Bbxg/maxresdefault.jpg)](https://www.youtube.com/watch?v=TnNf300Bbxg)

*Click to watch the demo video*

---

## ✨ Features

- 🎙️ **Voice Dictation** - Press Fn key, speak, release to transcribe and paste
- ⚡ **Fast Transcription** - Uses Deepgram Nova-3 or OpenAI Whisper
- 🤖 **AI Formatting** - Automatically formats your text with proper punctuation
- 🔒 **Privacy First** - All API keys stored locally, no cloud accounts required
- 🎨 **Minimal UI** - Unobtrusive waveform overlay while recording
- 📊 **Local Analytics** - Track your usage stats locally
- 🖥️ **macOS Native** - Built with Electron, optimized for macOS

---

## 🛠️ Installation

### Option 1: Download DMG (Recommended)

1. Download the DMG for your Mac from the [Releases page](https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/tag/v1.0.0)
2. Open the DMG and drag Jarvis to Applications
3. Launch Jarvis and enter your API keys during onboarding

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/akshayaggarwal99/jarvis-ai-assistant.git
cd jarvis-ai-assistant

# Install dependencies
npm install

# Build and run
npm run build
npm run dev
```

---

## 🔑 API Keys Required

You'll need at least one of these API keys (entered during onboarding):

| Provider | Purpose | Get Key |
|----------|---------|---------|
| **OpenAI** | Whisper transcription + AI features | [Get API Key](https://platform.openai.com/api-keys) |
| **Deepgram** | Fast real-time transcription | [Get API Key](https://console.deepgram.com/) |
| **Google Gemini** | AI formatting (free tier available) | [Get API Key](https://makersuite.google.com/app/apikey) |

---

## 🎯 Usage

### Voice Dictation

1. **Press and hold the `Fn` key** - Recording starts
2. **Speak clearly** - Your voice is captured
3. **Release the `Fn` key** - Audio is transcribed and pasted

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Fn` (hold) | Start/stop voice recording |
| `Cmd+Shift+J` | Show/hide dashboard |
| `Escape` | Cancel current recording |

---

## 🔒 Privacy

- **No cloud accounts** - Works entirely with your own API keys
- **Local storage only** - All data stored in `~/.jarvis/`
- **No telemetry** - Zero tracking or analytics sent anywhere
- **Your keys, your data** - API keys never leave your machine

---

## 📋 Requirements

- **macOS** 10.13 or later
- **Microphone permission** - For voice recording
- **Accessibility permission** - For Fn key detection and text pasting

---

## ⭐ Support the Project

If you find Jarvis useful, please consider giving it a star! It helps others discover the project and motivates continued development.

<p align="center">
  <a href="https://github.com/akshayaggarwal99/jarvis-ai-assistant">
    <img src="https://img.shields.io/badge/⭐_Star_on_GitHub-000000?style=for-the-badge&logo=github" alt="Star on GitHub"/>
  </a>
</p>

---

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/akshayaggarwal99">Akshay Aggarwal</a>
</p>
