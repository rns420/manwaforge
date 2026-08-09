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

## 🔑 Adding API Keys on Railway

You can provide your API keys directly in Railway under your service's **Variables** tab:

| Environment Variable | Description |
| :--- | :--- |
| `GROQ_API_KEY` | Groq Llama 3.3 70B key (`gsk_...`) |
| `DEEPGRAM_API_KEY` | Deepgram TTS key (`79f...`) |
| `OPENROUTER_API_KEY` | OpenRouter key (`sk-or-v1-...`) |
| `YOUTUBE_CLIENT_ID` | Google OAuth Client ID |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth Client Secret |

*(Note: You can also enter API keys directly in the dashboard **Settings Modal** on your live site!)*

---

## 🔴 YouTube OAuth Setup (Google Cloud Console)

To enable 1-click YouTube upload on Railway (`manwaforge-production.up.railway.app`):

1. Open **[Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)**.
2. Click on your OAuth 2.0 Client ID (`955369702286-3dkhviua9g3d53dm818a4qifd0s1i4k3.apps.googleusercontent.com`).
3. Under **Authorised JavaScript origins**, add:
   * `https://manwaforge-production.up.railway.app`
4. Under **Authorised redirect URIs**, add:
   * `https://manwaforge-production.up.railway.app/oauth-callback.html`
   * `https://manwaforge-production.up.railway.app/oauth2callback`
5. Save changes!

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
