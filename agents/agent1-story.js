class StoryForgeAgent {
  constructor(app) {
    this.app = app;
    this.progress = 0;
  }

  log(msg) {
    if (this.app && this.app.appendLog) {
      this.app.appendLog('StoryForge', msg, 'info');
    } else {
      console.log(`[StoryForge] ${msg}`);
    }
  }

  updateProgress(pct, msg) {
    this.progress = pct;
    this.log(`${pct}% - ${msg}`);
    if (this.app && this.app.updateAgentUI) {
      this.app.updateAgentUI('story', 'running', pct, msg);
    }
  }

  async getApiKey(service) {
    let key = '';
    if (window.ManhwaConfig && window.ManhwaConfig.keys && window.ManhwaConfig.keys[service]) {
      key = window.ManhwaConfig.keys[service];
    }
    if (!key) {
      key = localStorage.getItem(`mf_${service}_key`);
    }
    return key;
  }

  async callAI(systemPrompt, userPrompt, options = {}) {
    const requireJSON = options.requireJSON !== false;
    this.log('Calling AI with multi-provider failover pool...');

    const providers = [
      { name: 'Groq (Llama 3.3 70B)', type: 'groq', model: 'llama-3.3-70b-versatile' },
      { name: 'OpenRouter (Llama 3.1 8B)', type: 'openrouter', model: 'meta-llama/llama-3.1-8b-instruct:free' },
      { name: 'OpenRouter (Mistral 7B)', type: 'openrouter', model: 'mistralai/mistral-7b-instruct:free' },
      { name: 'OpenRouter (Qwen 2.5 72B)', type: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct:free' },
      { name: 'Pollinations (OpenAI Large)', type: 'pollinations', model: 'openai-large' },
      { name: 'APIFreeLLM (GPT-3.5)', type: 'apifreellm', model: 'gpt-3.5-turbo' },
      { name: 'Enally AI', type: 'enally', model: 'default' }
    ];

    let lastError = null;

    for (const p of providers) {
      try {
        this.log(`Trying provider: ${p.name}...`);
        let responseText = null;

        if (p.type === 'groq') {
          const apiKey = await this.getApiKey('groq');
          if (!apiKey) {
            this.log('Groq API key missing. Skipping...');
            continue;
          }
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: p.model,
              messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
              temperature: 0.7,
              max_tokens: 4096
            })
          });
          if (res.ok) {
            const data = await res.json();
            responseText = data.choices?.[0]?.message?.content;
          } else {
            this.log(`Groq returned HTTP ${res.status}. Switching to next provider...`);
            if (res.status === 429) {
              await new Promise(r => setTimeout(r, 2000));
            }
            continue;
          }
        } else if (p.type === 'openrouter') {
          const apiKey = await this.getApiKey('openrouter');
          if (!apiKey) {
            this.log('OpenRouter API key missing. Skipping...');
            continue;
          }
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': window.location.origin,
              'X-Title': 'ManhwaForge'
            },
            body: JSON.stringify({
              model: p.model,
              messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
              max_tokens: 4096
            })
          });
          if (res.ok) {
            const data = await res.json();
            responseText = data.choices?.[0]?.message?.content;
          } else {
            this.log(`OpenRouter returned HTTP ${res.status}. Switching to next provider...`);
            continue;
          }
        } else if (p.type === 'pollinations') {
          const pollUrl = `https://text.pollinations.ai/${encodeURIComponent(userPrompt.substring(0, 1500))}?model=${p.model}&system=${encodeURIComponent(systemPrompt.substring(0, 500))}`;
          const res = await fetch(pollUrl);
          if (res.ok) {
            responseText = await res.text();
          } else {
            this.log(`Pollinations returned HTTP ${res.status}. Switching to next provider...`);
            continue;
          }
        } else if (p.type === 'apifreellm') {
          const res = await fetch('https://apifreellm.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: p.model,
              messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
            })
          });
          if (res.ok) {
            const data = await res.json();
            responseText = data.choices?.[0]?.message?.content;
          } else {
            this.log(`APIFreeLLM returned HTTP ${res.status}. Switching to next provider...`);
            continue;
          }
        } else if (p.type === 'enally') {
          const res = await fetch('https://ai.enally.in/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ system: systemPrompt, prompt: userPrompt })
          });
          if (res.ok) {
            responseText = await res.text();
          } else {
            this.log(`Enally AI returned HTTP ${res.status}. Switching to next provider...`);
            continue;
          }
        }

        if (!responseText || !responseText.trim()) {
          this.log(`Empty response from ${p.name}. Switching to next provider...`);
          continue;
        }

        if (requireJSON) {
          try {
            this.parseAIJSON(responseText);
          } catch (jsonErr) {
            this.log(`Provider ${p.name} response failed JSON parsing (${jsonErr.message}). Switching to next provider...`);
            continue;
          }
        }

        this.log(`✅ Success from provider: ${p.name}`);
        return responseText;
      } catch (err) {
        this.log(`Provider ${p.name} error: ${err.message}. Switching to next provider...`);
        lastError = err;
      }
    }

    throw new Error(`All AI providers in failover pool failed. Last error: ${lastError ? lastError.message : 'No valid response'}`);
  }

  repairTruncatedJSON(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') return jsonStr;
    let s = jsonStr.trim();
    
    // 1. Remove trailing commas before } or ]
    s = s.replace(/,\s*([\}\]])/g, '$1');

    // 2. Fix unclosed strings
    let inString = false;
    let lastUnescapedQuote = -1;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '"' && (i === 0 || s[i-1] !== '\\')) {
        inString = !inString;
        lastUnescapedQuote = i;
      }
    }
    
    if (inString && lastUnescapedQuote !== -1) {
      s += '"';
    }

    // 3. Remove trailing dangling commas or colons at end of string
    s = s.replace(/,\s*$/, '').replace(/:\s*"?$/, '');

    // 4. Balance open brackets { and [
    const stack = [];
    inString = false;
    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      if (char === '"' && (i === 0 || s[i-1] !== '\\')) {
        inString = !inString;
      } else if (!inString) {
        if (char === '{' || char === '[') stack.push(char);
        else if (char === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
        else if (char === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
      }
    }

    while (stack.length > 0) {
      const top = stack.pop();
      s += (top === '{' ? '}' : ']');
    }

    return s;
  }

  parseAIJSON(text) {
    if (!text || typeof text !== 'string') {
      throw new Error("Invalid or empty text response from AI");
    }

    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```[a-z]*\n?/gi, '').replace(/\n?```$/gi, '').trim();

    const firstBrace = cleaned.search(/[\{\[]/);
    const lastCurly = cleaned.lastIndexOf('}');
    const lastSquare = cleaned.lastIndexOf(']');
    const lastBrace = Math.max(lastCurly, lastSquare);

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    // Attempt 1: Direct JSON parse
    try {
      return JSON.parse(cleaned);
    } catch (e1) {
      // Attempt 2: Auto-repair truncation & quotes
      try {
        const repaired = this.repairTruncatedJSON(cleaned);
        return JSON.parse(repaired);
      } catch (e2) {
        // Attempt 3: Regex match arrays or objects
        const arrMatch = text.match(/\[[\s\S]*\]/);
        const objMatch = text.match(/\{[\s\S]*\}/);

        if (arrMatch) {
          try {
            return JSON.parse(this.repairTruncatedJSON(arrMatch[0]));
          } catch (e3) {}
        }
        if (objMatch) {
          try {
            return JSON.parse(this.repairTruncatedJSON(objMatch[0]));
          } catch (e4) {}
        }

        this.log(`JSON parse error: ${e1.message}. Response preview: ${text.substring(0, 120)}...`);
        throw new Error(`Failed to parse AI response as JSON: ${e1.message}`);
      }
    }
  }

  async pickRandomSite() {
    this.log("Picking random site...");
    const sites = [
      { name: "Asura Scans", url: "https://asuratoon.com" },
      { name: "Reaper Scans", url: "https://reaperscans.com" },
      { name: "Flame Comics", url: "https://flamecomics.com" }
    ];
    return sites[Math.floor(Math.random() * sites.length)];
  }

  async fetchStoryList(site) {
    this.log(`Fetching story list from ${site.name}...`);
    const prompt = `Act as a web scraper for manhwa site ${site.name}. Generate a JSON list of 10 currently popular action/fantasy manhwa titles and their synopsis. Return ONLY a JSON array like: [{"title": "Title", "synopsis": "Synopsis"}]. Do NOT include conversational text.`;
    const response = await this.callAI("You are a helpful JSON data generator.", prompt);
    const list = await this.parseAIJSON(response);
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("Failed to generate story list from AI.");
    }
    return list;
  }

  async pickRandomStory(list) {
    this.log("Picking random story from list...");
    return list[Math.floor(Math.random() * list.length)];
  }

  async analyzeStory(story) {
    this.log(`Analyzing story: ${story.title}...`);
    const prompt = `Analyze the following manhwa synopsis and extract the core premise, character archetypes, and power system.
Synopsis: ${story.synopsis}

Respond strictly in JSON format:
{
  "corePremise": "...",
  "mainCharacterArchetype": "...",
  "powerSystem": "...",
  "tone": "..."
}`;
    const response = await this.callAI("You are an expert story analyst.", prompt);
    return await this.parseAIJSON(response);
  }

  async generateStoryOutline(analysis) {
    this.log("Generating story outline...");
    const prompt = `Create a completely new original manhwa story based on this analysis:
${JSON.stringify(analysis)}

REQUIREMENTS:
- Change ALL character names to new Korean/Asian names.
- Make it copyright-free, entirely original dialog and events.
- Keep the core premise but add 5+ new twists.
- It must be structured for 3 long episodes.

Respond strictly in JSON format:
{
  "title": "New Original Title",
  "synopsis": "Full synopsis...",
  "characters": [{"name": "Name", "role": "Role", "description": "..."}],
  "episodeArcs": [
    {"episodeNum": 1, "arc": "Description of episode 1 arc"},
    {"episodeNum": 2, "arc": "Description of episode 2 arc"},
    {"episodeNum": 3, "arc": "Description of episode 3 arc"}
  ]
}`;
    const response = await this.callAI("You are a master storyteller.", prompt);
    return await this.parseAIJSON(response);
  }

  async generateEpisodeOutline(outline, epNum) {
    this.log(`Generating outline for episode ${epNum}...`);
    const epArc = outline.episodeArcs.find(e => e.episodeNum === epNum || e.episode_num === epNum) || { arc: "Main storyline" };
    const prompt = `Create a detailed outline for Episode ${epNum} of the manhwa "${outline.title}".
Episode Arc: ${epArc.arc}

REQUIREMENTS:
We need exactly 250 scenes. Outline the structure of these 250 scenes according to this pacing:
- Hook (scenes 1-3): Flash-forward to climax
- Act 1 Setup (scenes 4-60): World, characters, inciting incident
- Act 2A Rising Action (scenes 61-130): Training, first battles
- Midpoint Twist (scenes 131-135): Major revelation
- Act 2B Complications (scenes 136-200): Betrayal, darkest moment
- Act 3 Climax (scenes 201-240): Final battle
- Cliffhanger (scenes 241-250): Setup for next episode

Respond strictly in JSON format:
{
  "title": "Episode ${epNum} Title",
  "hook": "...",
  "cliffhanger": "...",
  "sceneOutlines": [
    {"range": "1-3", "focus": "Hook"},
    {"range": "4-60", "focus": "Act 1 Setup"},
    {"range": "61-130", "focus": "Act 2A Rising Action"},
    {"range": "131-135", "focus": "Midpoint Twist"},
    {"range": "136-200", "focus": "Act 2B Complications"},
    {"range": "201-240", "focus": "Act 3 Climax"},
    {"range": "241-250", "focus": "Cliffhanger"}
  ]
}`;
    const response = await this.callAI("You are a master storyteller and episode planner.", prompt);
    return await this.parseAIJSON(response);
  }

  async generateSceneBatch(epOutline, epNum, startScene, endScene) {
    this.log(`Generating scenes ${startScene} to ${endScene} for episode ${epNum}...`);
    const prompt = `Write scenes ${startScene} to ${endScene} for Episode ${epNum} of our manhwa.
Focus for this section based on outline: ${JSON.stringify(epOutline.sceneOutlines)}

REQUIREMENTS FOR EACH SCENE:
- sceneNumber (${startScene}-${endScene})
- scene_title (string)
- description (50-100 words describing the action)
- dialogue: Array of {speaker, line} objects (2-4 lines total per scene)
- panel_description (string - detailed visual prompt for an image generator)
- emotional_tone (string)
- audio_narration (100-200 words of dramatic narration text to be spoken by TTS)

Respond strictly in JSON format as a list of scenes:
[
  {
    "sceneNumber": ${startScene},
    "scene_title": "...",
    "description": "...",
    "dialogue": [{"speaker": "...", "line": "..."}],
    "panel_description": "...",
    "emotional_tone": "...",
    "audio_narration": "..."
  }
]`;
    const response = await this.callAI("You are a brilliant manhwa scriptwriter. You strictly return valid JSON arrays.", prompt);
    let scenes = await this.parseAIJSON(response);
    if (!Array.isArray(scenes) && typeof scenes === 'object' && scenes !== null) {
      scenes = scenes.scenes || scenes.sceneList || scenes.data || Object.values(scenes).find(v => Array.isArray(v)) || [];
    }
    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error(`Failed to generate scenes ${startScene}-${endScene}`);
    }
    return scenes;
  }

  // SEO methods
  async generateSEOTitle(storyData, episodeNum) {
    this.log(`Generating SEO Title for episode ${episodeNum}...`);
    const prompt = `Generate 5 highly engaging YouTube video titles for Episode ${episodeNum} of a manhwa recap/story called "${storyData.title}".
Make them clickbaity, high CTR, incorporating manhwa tropes like "Reincarnated", "Overpowered", "Betrayed".
Respond strictly as a JSON array of 5 strings: ["Title 1", "Title 2", ...]`;
    const response = await this.callAI("You are a YouTube SEO expert.", prompt);
    const titles = await this.parseAIJSON(response);
    return Array.isArray(titles) && titles.length > 0 ? titles[0] : `Episode ${episodeNum} Summary`;
  }

  async generateSEODescription(storyData, episodeNum, scenes) {
    this.log(`Generating SEO Description for episode ${episodeNum}...`);
    const prompt = `Generate a 500+ word YouTube SEO description for Episode ${episodeNum} of "${storyData.title}".
Include timestamps roughly every 45 seconds (e.g. 0:00 Intro, 0:45 The Awakening).
Make sure to include keywords related to action fantasy manhwa recaps.
Return ONLY the description text, no JSON.`;
    const response = await this.callAI("You are a YouTube SEO expert.", prompt);
    return response;
  }

  async generateSEOTags(storyData) {
    this.log(`Generating SEO Tags...`);
    const prompt = `Generate exactly 30 YouTube tags for a manhwa story called "${storyData.title}".
Include tags like manhwa recap, manhwa summary, overpowered mc, etc.
Return strictly as a JSON array of strings: ["tag1", "tag2", ...]`;
    const response = await this.callAI("You are a YouTube SEO expert.", prompt);
    return await this.parseAIJSON(response);
  }

  async generateThumbnailPrompt(storyData, episodeNum) {
    this.log(`Generating Thumbnail Prompt for episode ${episodeNum}...`);
    const prompt = `Create a midjourney/stable diffusion prompt for an eye-catching YouTube thumbnail for Episode ${episodeNum} of "${storyData.title}".
The thumbnail should feature the main character in a dramatic, high-contrast anime/manhwa art style.
Return strictly the prompt string, nothing else.`;
    const response = await this.callAI("You are a talented AI prompt engineer.", prompt);
    return response.trim();
  }

  async generateSEOForEpisode(storyData, episodeNum) {
    const episode = storyData.episodes.find(e => e.episodeNum === episodeNum);
    const title = await this.generateSEOTitle(storyData, episodeNum);
    const description = await this.generateSEODescription(storyData, episodeNum, episode.scenes);
    const tags = await this.generateSEOTags(storyData);
    const thumbnailPrompt = await this.generateThumbnailPrompt(storyData, episodeNum);
    
    return { title, description, tags, thumbnailPrompt };
  }

  async uploadToYouTube(videoBlobUrl, seoData) {
    this.log(`Uploading to YouTube: ${seoData.title}`);
    if (!window.YouTubeAPI || !window.YouTubeAPI.uploadVideo) {
      this.log('YouTube API not available. Connect YouTube in Settings to enable upload.');
      throw new Error('YouTube not connected. Go to Settings → YouTube to connect your account.');
    }
    const isAuth = await window.YouTubeAPI.isAuthenticated();
    if (!isAuth) {
      this.log('YouTube not authenticated. Skipping upload.');
      throw new Error('YouTube not authenticated. Click Connect YouTube in Settings.');
    }
    return await window.YouTubeAPI.uploadVideo(videoBlobUrl, seoData);
  }

  async schedulePublish(videoId) {
    this.log(`Scheduling publish for video ${videoId}`);
    if (!window.YouTubeAPI || !window.YouTubeAPI.scheduleVideo) {
      this.log('YouTube schedule API not available.');
      return null;
    }
    const publishAt = new Date();
    publishAt.setDate(publishAt.getDate() + 3);
    publishAt.setUTCHours(23, 0, 0, 0);
    return await window.YouTubeAPI.scheduleVideo(videoId, publishAt.toISOString());
  }

  async run() {
    try {
      this.updateProgress(0, "Starting StoryForge Agent");
      
      const site = await this.pickRandomSite();
      this.updateProgress(5, `Picked site: ${site.name}`);
      
      const list = await this.fetchStoryList(site);
      this.updateProgress(10, `Fetched ${list.length} stories`);
      
      const story = await this.pickRandomStory(list);
      this.updateProgress(15, `Picked story: ${story.title}`);
      
      const analysis = await this.analyzeStory(story);
      this.updateProgress(20, `Analyzed story premise`);
      
      const storyData = await this.generateStoryOutline(analysis);
      storyData.episodes = [];
      this.updateProgress(25, `Generated original story outline: ${storyData.title}`);

      const totalEpisodes = window.ManhwaConfig?.pipeline?.episodeCount || 3;
      const targetScenesPerEp = window.ManhwaConfig?.pipeline?.scenesPerEpisode || 250;
      const batchSize = Math.min(10, targetScenesPerEp);
      const totalBatches = Math.ceil(targetScenesPerEp / batchSize);

      for (let epNum = 1; epNum <= totalEpisodes; epNum++) {
        const epOutline = await this.generateEpisodeOutline(storyData, epNum);
        epOutline.episodeNum = epNum;
        epOutline.scenes = [];
        this.updateProgress(30 + (epNum-1)*(50/totalEpisodes), `Generated outline for Episode ${epNum}`);
        
        for (let batch = 0; batch < totalBatches; batch++) {
          const startScene = batch * batchSize + 1;
          const endScene = Math.min((batch + 1) * batchSize, targetScenesPerEp);
          const scenes = await this.generateSceneBatch(epOutline, epNum, startScene, endScene);
          if (Array.isArray(scenes)) {
            epOutline.scenes.push(...scenes);
          }
          
          this.updateProgress(
            30 + ((epNum-1)/totalEpisodes)*50 + ((batch+1)/totalBatches)*(50/totalEpisodes), 
            `Episode ${epNum}, scenes ${startScene}-${endScene} generated`
          );
          
          localStorage.setItem(`storyforge_checkpoint_ep${epNum}_batch${batch}`, JSON.stringify(scenes));
        }
        
        storyData.episodes.push(epOutline);
        
        // Generate SEO metadata
        this.updateProgress(85 + (epNum * 3), `Generating SEO for Episode ${epNum}`);
        try {
          const seoData = await this.generateSEOForEpisode(storyData, epNum);
          epOutline.seo = seoData;
          this.log(`SEO generated for Episode ${epNum}: "${seoData.title}"`);
        } catch (seoErr) {
          this.log(`SEO generation skipped for Episode ${epNum}: ${seoErr.message}`);
        }
      }
      
      this.updateProgress(100, "StoryForge Agent Completed");
      return storyData;
      
    } catch (e) {
      this.log(`Error in run(): ${e.stack || e.message}`);
      throw e;
    }
  }
}

window.StoryForgeAgent = StoryForgeAgent;
