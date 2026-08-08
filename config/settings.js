/**
 * ManhwaForge v3.0 — Global Configuration
 * 250 scenes/episode, 45+ min videos, all free APIs integrated
 */
window.ManhwaConfig = {
  keys: {
    groq:       'YOUR_GROQ_API_KEY_HERE',
    openrouter: 'YOUR_OPENROUTER_API_KEY_HERE',
    deepgram:   'YOUR_DEEPGRAM_API_KEY_HERE',
  },

  // Google YouTube OAuth2 credentials
  youtube: {
    clientId:     'YOUR_YOUTUBE_CLIENT_ID_HERE',
    clientSecret: 'YOUR_YOUTUBE_CLIENT_SECRET_HERE',
    redirectUri:  'http://localhost:3333/oauth2callback',
    scopes:       ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
  },

  endpoints: {
    // Text generation
    groq:             'https://api.groq.com/openai/v1/chat/completions',
    openrouter:       'https://openrouter.ai/api/v1/chat/completions',
    pollinationsText: 'https://text.pollinations.ai',
    apifreellm:       'https://apifreellm.com/v1/chat/completions',
    enallyAI:         'https://ai.enally.in/api.php',
    aimlapi:          'https://api.aimlapi.com/v1/chat/completions',

    // Image generation
    pollinationsImage: 'https://image.pollinations.ai/prompt',

    // TTS
    deepgramTTS: 'https://api.deepgram.com/v1/speak',

    // Backend
    pythonServer: 'http://localhost:8000',
  },

  models: {

    textGroq:       'llama-3.3-70b-versatile',
    textOpenRouter: 'google/gemma-2-9b-it:free',
    textPollinations:'openai-large',
    imagePrimary:   'flux',
    ttsPrimary:     'aura-asteria-en',
    ttsGroq:        'playai-tts',
  },

  rateLimits: {
    groq:         30,
    openrouter:   20,
    pollinations: 10,
    deepgram:     5,

    apifreellm:   60,
    enally:       30,
    aimlapi:      20,
  },

  pipeline: {
    episodeCount:       3,
    scenesPerEpisode:   250,
    panelsPerScene:     1,
    sceneBatchSize:     25,
    imageBatchSize:     5,
    audioBatchSize:     10,
    targetVideoMinutes: 45,
    secondsPerScene:    12,
    videoResolution:    '1920x1080',
    videoFPS:           24,
    imageDimensions:    { w: 800, h: 1200 },
    audioBitrate:       '192k',
    targetGenres:       ['system', 'hunter', 'regression', 'revenge', 'romance', 'martial-arts', 'isekai'],
    sourceGenre:        'random',
  },

  schedule: {
    intervalDays:     3,
    publishHourUTC:   23,
    publishMinuteUTC: 0,
    autoUpload:       false,
  },

  scraping: {
    sites: [
      { name: 'Webtoons',  url: 'https://www.webtoons.com/en/' },
      { name: 'Tapas',     url: 'https://tapas.io/' },
      { name: 'Manta',     url: 'https://manta.net/en' },
      { name: 'Toonmics',  url: 'https://toonmics.com/' },
    ]
  },

  // API rotation order for text generation
  apiRotationOrder: ['groq', 'apifreellm', 'pollinations', 'openrouter', 'enally', 'aimlapi'],
};

// Allow localStorage overrides (user can change keys in Settings UI without editing code)
(function loadKeyOverrides() {
  const keyMap = {
    groq:      'mf_groq_key',
    openrouter:'mf_or_key',
    deepgram:  'mf_dg_key',
  };
  for (const [k, lsKey] of Object.entries(keyMap)) {
    const val = localStorage.getItem(lsKey);
    if (val) window.ManhwaConfig.keys[k] = val;
  }
  // YouTube overrides
  const ytClientId = localStorage.getItem('mf_yt_client_id');
  const ytSecret   = localStorage.getItem('mf_yt_client_secret');
  if (ytClientId) window.ManhwaConfig.youtube.clientId = ytClientId;
  if (ytSecret)   window.ManhwaConfig.youtube.clientSecret = ytSecret;
})();
