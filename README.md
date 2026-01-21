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
- **Full Prompt Engineering:** Every behavior is customizable. Tweak how Jarvis formats mail, cleans dictation, or behaves as an assistant.
- **Fully offline** with local Whisper (tiny/base/small)
- **100% Private, Blazingly Fast** support for local LLMs via [Ollama](https://ollama.com)
- Or use cloud speed with Deepgram + Gemini (1M tokens/day free) — Deepgram requests default to `mip_opt_out=true`

**Zero tracking. Zero telemetry. Zero bullshit.**

---

## Download

| Platform | Link |
|----------|------|
| 🍎 **Mac** (Apple Silicon) | [Download DMG (M1/M2/M3/M4)](https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/latest) |
| 💻 **Mac** (Intel) | [Download DMG (x64)](https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/latest) |
| 📱 **iOS** (iPhone/iPad) | [TestFlight](./ios/README.md) *(NEW!)* |

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
2. **Go Local (Recommended for privacy):**  
   - Settings → Transcription → Enable **Local Whisper**
   - Settings → AI Models → Enable **Ollama** (requires [Ollama](https://ollama.com) installed)
3. **Or Go Cloud (Recommended for speed/accuracy):**
   - Paste free Deepgram + Gemini keys
4. Hold Fn and talk

That's literally it.

---

## 🦙 Ollama (Local LLM) Support

Jarvis now supports running any LLM locally via Ollama. It's fast, private, and free.

1.  **Install Ollama:** [Download here](https://ollama.com)
2.  **Pull a model:**
    ```bash
    # LFM2 (optimized for speed)
    ollama pull sam860/LFM2:1.2b

    # Llama 3 (standard)
    ollama pull llama3
    ```
3.  **Enable in Jarvis:**
    - Settings → AI Models → Enable **Use Ollama**
    - Select your model from the dropdown (Jarvis auto-detects them!)

### ⚡ Performance Note

Running models locally depends heavily on your hardware.
- **Enabled AI Post-Processing:** Adds ~1-3s latency on typical M1/M2 chips.
- **Disabled AI Post-Processing:** Instant transcription.
- **High-End Hardware:** M1/M2/M3 Max/Ultra chips are nearly instant.

**For Lightning Fast Performance:**
If speed is critical, use **Deepgram + Gemini** (Cloud) or **Local Whisper + Gemini Flash**, which are significantly faster than local LLMs on standard hardware.

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

## Roadmap (help me choose!)

- [x] Proper "local-only" onboarding (no fake keys needed)
- [x] AWS Bedrock support
- [x] Ollama support
- [x] Custom voice commands & prompts
- [ ] Windows version
- [ ] Clipboard magic & multi-step actions
- [ ] iOS (yes, I dream big)

Open issues, vote, or drop crazy ideas → [github.com/.../issues](https://github.com/akshayaggarwal99/jarvis-ai-assistant/issues)

---

## Wanna contribute?

Jarvis is a community project. If you're a developer and want to help build the future of local-first AI, check out our [Contributing Guidelines](CONTRIBUTING.md).

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
