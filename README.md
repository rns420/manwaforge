# ManhwaForge 🎭

**Full-Stack Automated Manhwa/Webtoon Video Pipeline**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/new?template=https://github.com/rns420/manwaforge)

---

## 🚀 1-Click Railway Deployment

Deploy the **entire project (both Frontend Dashboard & Backend FFmpeg Video Engine)** in 1-click on Railway:

1. Click the **[Deploy on Railway](https://railway.app/template/new?template=https://github.com/rns420/manwaforge)** button above.
2. Link your GitHub repository `rns420/manwaforge`.
3. Railway automatically builds and deploys both the full-stack server and the dark glassmorphism dashboard UI.
4. Open your Railway generated `.up.railway.app` URL to access the live dashboard!

---

## 🛠️ Features

* **Agent 1 (StoryForge)**: Scrapes webtoon premises, analyzes them, and rebuilds 100% original, copyright-free multi-episode manhwa scripts.
* **Agent 2 (PanelArtist)**: Generates 1080x1920 vertical manhwa comic panel artwork using Pollinations.ai Flux.
* **Agent 3 (VoiceCraft)**: Synthesizes voice narration using Deepgram TTS (`aura-asteria-en`).
* **Agent 4 (VideoForge)**: Assembles 1080p videos with dynamic Ken Burns zoom/pan camera movements, title cards, subtitle text overlays, and outro cards via `ffmpeg-static`.
* **Agent 5 (BossAgent)**: Orchestrates the pipeline, handles checkpoint persistence, auto-resumes interrupted runs, and manages 429 rate limit backoff.

---

## 📁 Repository Structure

```text
manhwaforge/
├── index.html            # Dark glassmorphism single-page app dashboard
├── styles.css            # Custom glassmorphism design tokens & animations
├── app.js                # Main application controller
├── package.json          # Root npm config for 1-click Railway deploy
├── Procfile              # Web process runner definition
├── railway.json          # Railway build & deploy configuration
├── config/               # Settings & gitignored local keys
├── agents/               # 5 AI Agents (Boss, Story, Images, Audio, Video)
├── api/                  # API wrappers (Groq, Deepgram, OpenRouter, Pollinations)
└── server/               # Full-stack Node.js server with ffmpeg-static
```
