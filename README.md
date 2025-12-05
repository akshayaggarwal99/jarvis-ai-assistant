<p align="center">
  <img src="assets/jarvis-logo.svg" alt="Jarvis" width="140"/>
</p>
<h1 align="center">Jarvis AI Assistant</h1>
<p align="center"><strong>Hold one key. Speak. Text appears — perfectly.</strong></p>
<p align="center">
  <em>100% open-source • 100% local-capable • 100% free forever</em>
</p>

<p align="center">
  <a href="https://jarvis.ceo"><img src="https://img.shields.io/badge/website-jarvis.ceo-0066FF?style=for-the-badge" /></a>
  <a href="https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/latest"><img src="https://img.shields.io/github/v/release/akshayaggarwal99/jarvis-ai-assistant?style=for-the-badge&logo=apple&label=Download&color=0066FF" /></a>
  <a href="https://github.com/akshayaggarwal99/jarvis-ai-assistant/stargazers"><img src="https://img.shields.io/github/stars/akshayaggarwal99/jarvis-ai-assistant?style=for-the-badge&color=FFD700" /></a>
</p>

<p align="center">

https://github.com/user-attachments/assets/763ea6aa-87d5-4e0a-9f05-a2bdaa82f40f

</p>

<p align="center"><a href="https://www.youtube.com/watch?v=TnNf300Bbxg">▶ Watch full 2-min demo on YouTube</a></p>

---

## The (short) story

Wispr Flow raised **$81 million** to build a voice dictation app.  
I got annoyed, spent 3 months of late nights building my own version, and open-sourced it.

That's it.  
No funding. No team. Just one stubborn developer who hates subscriptions.

This is what open source is supposed to be.

---

## Why people actually use it

- Hold **Fn** → speak → release → clean, punctuated text appears **anywhere**
- Removes "um", "like", all fillers automatically
- Fixes grammar, can rephrase, bullet-point, or even generate text
- Tiny actions already work ("open YouTube", "set 5-min timer")
- **Fully offline** with local Whisper (tiny/base/small)
- Or blazing fast + free forever using Deepgram ($200 credits) + Gemini (1M tokens/day free)

**Zero tracking. Zero telemetry. Zero bullshit.**

---

## Download

| Chip | Link |
|------|------|
| 🍎 Apple Silicon | [Download DMG (M1/M2/M3/M4)](https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/latest) |
| 💻 Intel Mac | [Download DMG (x64)](https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/latest) |

✅ Signed & notarized by Apple → no scary warnings.

---

## Jarvis vs $700M startups

| | **Jarvis** | The $700M one |
|---|:---:|:---:|
| 💰 Price | **Free forever** | $10–24/month |
| 🔇 Offline / Local | **Yes (Whisper)** | No |
| 🔓 Open Source | **Yes (MIT)** | No |
| 📡 Telemetry | **None** | ??? |
| 👨‍💻 Built by | **1 guy at 2am** | VC money |

---

## Quick setup (30 seconds)

1. Download & open the app
2. **Choose your transcription method:**
   - **Recommended for first-time users:** Enable **Local Whisper** (100% offline, no API keys needed)
   - **For faster transcription:** Add Deepgram API key ($200 free credits) or OpenAI API key
   - **For AI features:** Add Gemini API key (1M tokens/day free)
3. Grant microphone and accessibility permissions when prompted
4. Hold Fn and talk

That's literally it. Local Whisper downloads automatically (75MB) when you enable it.

---

## Keyboard shortcuts

| Shortcut | What it does |
|----------|--------------|
| `Fn` (hold) | Start/stop recording |
| `Fn` (double-tap) | Toggle hands-free mode |
| `Escape` | Cancel recording |

---

## Build from source

```bash
git clone https://github.com/akshayaggarwal99/jarvis-ai-assistant.git
cd jarvis-ai-assistant
npm install && npm run build && npm run dev
```

Requires Node.js 18+, macOS 10.13+, Xcode CLI tools.

---

## Troubleshooting

### App icon looks corrupted in Applications folder
This is a macOS icon cache issue that sometimes happens. To fix:
```bash
# Clear icon cache
sudo rm -rf /Library/Caches/com.apple.iconservices.store
killall Dock
killall Finder
```
Then restart your Mac. The icon should display correctly.

### Transcription not working after setup
1. **Check permissions**: Go to System Settings → Privacy & Security
   - Microphone: Ensure Jarvis has permission
   - Accessibility: Ensure Jarvis is enabled
2. **Local Whisper**: If using local transcription, the model downloads automatically on first use (75MB). Be patient during the first transcription.
3. **Cloud APIs**: If using Deepgram/OpenAI, verify your API keys are correct in Settings → Transcription.

### "Model not found" error with Local Whisper
The app should download the model automatically. If it fails:
1. Open Settings → Transcription
2. Click "Download" next to the Tiny English model
3. Wait for the download to complete (75MB)

---

## Roadmap (help me choose!)

- [x] Proper "local-only" onboarding (no fake keys needed)
- [x] AWS Bedrock support
- [ ] Custom voice commands & prompts
- [ ] Windows version
- [ ] Clipboard magic & multi-step actions
- [ ] iOS (yes, I dream big)

Open issues, vote, or drop crazy ideas → [github.com/.../issues](https://github.com/akshayaggarwal99/jarvis-ai-assistant/issues)

---

## Wanna help?

Every star pushes this higher so more people discover they don't need another subscription.

<p align="center">
  <a href="https://github.com/akshayaggarwal99/jarvis-ai-assistant/stargazers">
    <img src="https://img.shields.io/github/stars/akshayaggarwal99/jarvis-ai-assistant?style=social" />
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/akshayaggarwal99/jarvis-ai-assistant/fork">
    <img src="https://img.shields.io/github/forks/akshayaggarwal99/jarvis-ai-assistant?style=social" />
  </a>
  &nbsp;&nbsp;
  <a href="https://twitter.com/intent/tweet?text=Found%20this%20free%20open-source%20voice%20dictation%20app%20for%20Mac.%20No%20subscriptions%2C%20works%20offline.&url=https://github.com/akshayaggarwal99/jarvis-ai-assistant">
    <img src="https://img.shields.io/twitter/url?style=social&url=https://github.com/akshayaggarwal99/jarvis-ai-assistant" />
  </a>
</p>

Or just use it and tell one friend. That's enough.

---

## ⭐ Star History

<p align="center">
  <a href="https://star-history.com/#akshayaggarwal99/jarvis-ai-assistant&Date">
    <img src="https://api.star-history.com/svg?repos=akshayaggarwal99/jarvis-ai-assistant&type=Date" width="600" />
  </a>
</p>

---

<p align="center">
  Built with caffeine and spite by <strong><a href="https://github.com/akshayaggarwal99">Akshay</a></strong>
</p>

<p align="center">
  <em>Open source isn't about beating giants.<br/>It's about making sure no one ever has to pay them.</em>
</p>

<p align="center">
  <sub>MIT License — do whatever you want with it.</sub>
</p>
