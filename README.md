# ManhwaForge 🎭

**Automated manhwa/webtoon story pipeline: Scrape → Rebuild → Generate Images → Create Video → Upload to YouTube**

## Quick Start

### 1. Install Python Backend
```bash
cd server
pip install -r ../requirements.txt
python server.py
```

### 2. Get Free API Keys (Optional but recommended)
- **Groq** (free): https://console.groq.com — 30 req/min, Llama 3.3 70B
- **Deepgram** (free $200 credit): https://console.deepgram.com — TTS audio
- **OpenRouter** (free): https://openrouter.ai — 20+ free LLMs
- **YouTube API**: https://console.cloud.google.com — for auto-upload
- **Puter.js**: No key needed! Works automatically in browser.

### 3. Open Dashboard
Open `index.html` in your browser. The app works with ZERO API keys via Puter.js.

### 4. YouTube Upload Setup
1. Go to https://console.cloud.google.com
2. Create project → Enable YouTube Data API v3
3. Create OAuth 2.0 credentials (Desktop app)
4. Download `client_secrets.json` → place in `server/` folder
5. Click ‘Connect YouTube’ in the dashboard

## How It Works

### Agent Pipeline
1. **StoryForge (Agent 1)**: Scrapes story ideas from Webtoons/Tapas/Manta/Toonmics, analyzes them with AI, rebuilds as 100% original copyright-free manhwa (different names, dialogue, plot details)
2. **PanelArtist (Agent 2)**: Generates comic panel images for each scene using AI (Pollinations.ai Flux model + DALL-E 3 via Puter.js)
3. **VoiceCraft (Agent 3)**: Creates dramatic English narration audio for each scene (Deepgram TTS / Groq TTS / Browser TTS)
4. **VideoForge (Agent 4)**: Assembles panels + audio into 1080p YouTube video with Ken Burns effects and professional editing
5. **SEOMaster (Agent 1b)**: Generates AI-powered YouTube SEO (title, description, tags, thumbnail), schedules upload every 3 days at 6 PM ET
6. **BossAgent (Agent 5)**: Oversees all agents, reviews quality, handles rate limits, resumes from checkpoint if interrupted

### Checkpoint/Resume
If any agent hits a rate limit or error, BossAgent pauses it and saves progress. When limits reset, it automatically resumes from where it stopped.

### Schedule
Videos upload every 3 days at 6 PM Eastern Time (23:00 UTC). Configurable in Settings.

## FFmpeg Requirement
Download FFmpeg and add to PATH: https://ffmpeg.org/download.html

## Folder Structure
```
manhwaforge/
├── index.html          # Dashboard
├── styles.css          # Dark glassmorphism UI
├── app.js              # Main controller
├── agents/             # 6 AI agents
├── api/                # API wrappers (Puter, Groq, etc.)
├── pipeline/           # State management, rate limiting
├── server/             # Python backend (FastAPI + FFmpeg)
├── config/             # App configuration
└── assets/             # Music, fonts
```
