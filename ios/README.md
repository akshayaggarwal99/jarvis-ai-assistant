# Jarvis AI - iOS Keyboard

<p align="center">
  <strong>Your voice, supercharged — now on iOS.</strong>
</p>

A custom iOS keyboard that lets you speak naturally and inserts clean, formatted text anywhere on your iPhone or iPad.

---

## Features

- 🎤 **Tap to speak** — Real-time transcription with Deepgram
- ✨ **AI formatting** — Gemini 2.5 Flash cleans up grammar, punctuation, filler words
- 📝 **Prompt Editor** — View and customize the AI's system prompt on the fly
- 🔒 **Privacy-first** — Your API keys stay on your device
- 🌙 **Dark mode** — Matches iOS system keyboard appearance
- ❌ **Cancel anytime** — Tap X to discard and start over

---

## Quick Start (Build from Source)

Since this is a developer build, you'll need to build it using Xcode.

### Requirements

- Xcode 15+
- iOS 16+ device (or Simulator)
- Apple Developer Account (free is fine for local testing)

### 1. Clone & Open

```bash
git clone https://github.com/akshayaggarwal99/jarvis-ai-assistant.git
cd jarvis-ai-assistant/ios/JarvisAI
open JarvisAI.xcodeproj
```

### 2. Configure Signing & App Groups (CRITICAL)

For the keyboard to access your API keys, both the App and the Extension must share an **App Group**.

1. Select the `JarvisAI` target -> **Signing & Capabilities**.
   - Set your **Team**.
   - Ensure **App Groups** is enabled and `group.ceo.jarvis.ios` (or your own ID) is checked.
2. Select the `JarvisKeyboard` target -> **Signing & Capabilities**.
   - Set the **SAME Team**.
   - Ensure the **SAME App Group** is checked.

### 3. Build & Run

1. Select **JarvisAI** scheme and your device/simulator.
2. Press `Cmd + R` to run.

---

## Setup Guide

### 1. Get Your API Keys (Free)

| Service | Purpose | Get Key |
|---------|---------|---------|
| **Gemini** | Text formatting & commands | [Google AI Studio](https://aistudio.google.com/app/apikey) (Free tier available) |
| **Deepgram** | Speech-to-text | [Deepgram Console](https://console.deepgram.com) (Free credit available) |

### 2. Configure the App

1. Open **Jarvis AI** app on your device.
2. Enter your **Gemini API Key** (required).
3. Enter your **Deepgram API Key** (optional, but recommended for speed).
4. (Optional) Tap **Customize** under Dictation Prompt to tweak how the AI formats your text.

### 3. Enable the Keyboard

1. Go to **Settings → General → Keyboard → Keyboards**
2. Tap **Add New Keyboard...**
3. Select **JarvisKeyboard**
4. Tap **JarvisKeyboard** → Enable **Allow Full Access**

> ⚠️ **IMPORTANT:** You MUST enable "Allow Full Access". Without this, the keyboard cannot connect to the internet to transcribe your speech.

---

## Usage

1. Open any app (Messages, Notes, Slack, etc.)
2. Switch to **Jarvis Keyboard** (long-press 🌐 globe icon)
3. **Tap the mic** and speak naturally.
4. **Tap ✓** when done — formatted text appears!
5. **Tap ✗** to cancel.

### Pro Tips

- **Dictation**: Just speak. "Meeting at 4pm, sorry, 6pm" → "Meeting at 6pm"
- **Commands**: Say *"Hey Jarvis, write a haiku about code"* to switch to Assistant Mode.
- **Custom Prompt**: Open the main app to change the AI's behavior (e.g., "Make me sound like a pirate").

---

## Architecture

```
ios/JarvisAI/
├── JarvisAI/              # Main app (settings, prompt editor)
│   ├── ContentView.swift  # Main UI with API key setup
│   └── JarvisApp.swift    # Entry point
├── JarvisKeyboard/        # Keyboard extension
│   ├── KeyboardView.swift # SwiftUI Interface (Waveform, Buttons)
│   └── KeyboardViewController.swift  # Logic (Recorder, API calls)
└── Shared/                # Shared Code (App Group)
    ├── JarvisCore.swift   # Gemini API Logic
    ├── DeepgramService.swift  # WebSocket Transcription
    └── AudioRecorder.swift    # Microphone Handling
```

---

## Troubleshooting

**Keyboard not appearing?**
- Remove and re-add the keyboard in iOS Settings.
- Ensure the deployment target matches your device iOS version.

**"Allow Full Access" not showing?**
- Restart the Settings app (force quit).
- Sometimes it takes a moment to appear after installing a new build.

**Recording but no text?**
- Check your API keys in the main app.
- Ensure you have internet connection.
- Check Xcode console for "Socket is not connected" or permission errors.

---

## License

MIT — Free forever, just like the Mac app.

---

<p align="center">
  <strong>Built with ❤️ by <a href="https://github.com/akshayaggarwal99">Akshay</a></strong>
</p>
