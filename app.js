/**
 * ManhwaForge v3.0 — Main Application Controller
 * 4 agents + Boss. 250 scenes/episode. 45+ min videos. No mock data.
 */
class ManhwaForge {
  constructor() {
    this.settings = this.loadSettings();
    this.pipelineRunning = false;
    this.lastStoryData = null;
    this.lastImageData = [];
    this.lastAudioData = [];

    this.storyAgent = null;
    this.imageAgent = null;
    this.audioAgent = null;
    this.videoAgent = null;
    this.bossAgent  = null;

    this.syncSettingsToConfig();
    this.initEventListeners();
    this.initSettingsTabs();
    this.checkServerHealth();
    this.checkYouTubeStatus();
    this.updatePipelineStats({});

    window.addEventListener('error', e => {
      this.sendLogToServer('BrowserError', `${e.message} at ${e.filename}:${e.lineno}`, 'error');
    });
    window.addEventListener('unhandledrejection', e => {
      this.sendLogToServer('UnhandledPromise', e.reason?.stack || e.reason || 'Unknown Rejection', 'error');
    });

    setInterval(() => this.checkSchedule(), 60000);

    this.appendLog('BossAgent', '🎭 ManhwaForge v3.0 initialized.', 'info');
    this.appendLog('BossAgent', `📊 Target: ${this.getSceneCount()} scenes/episode × ${this.getEpisodeCount()} episodes = ${this.getSceneCount() * this.getEpisodeCount()} total scenes`, 'info');
    this.appendLog('BossAgent', '🆓 Free APIs: Pollinations + apifreellm + Groq + OpenRouter + Enally + AIMLAPI', 'info');
  }

  getSceneCount() { return window.ManhwaConfig?.pipeline?.scenesPerEpisode || 250; }
  getEpisodeCount() { return window.ManhwaConfig?.pipeline?.episodeCount || 3; }

  loadSettings() {
    const kc = window.ManhwaConfig?.keys || {};
    const yt = window.ManhwaConfig?.youtube || {};
    const defaults = {
      groq: (kc.groq && !kc.groq.includes('YOUR_')) ? kc.groq : '',
      deepgram: (kc.deepgram && !kc.deepgram.includes('YOUR_')) ? kc.deepgram : '',
      openrouter: (kc.openrouter && !kc.openrouter.includes('YOUR_')) ? kc.openrouter : '',
      ytClientId: (yt.clientId && !yt.clientId.includes('YOUR_')) ? yt.clientId : '',
      ytClientSecret: (yt.clientSecret && !yt.clientSecret.includes('YOUR_')) ? yt.clientSecret : '',
      genre:'random', autorun:false, episodes:3, scenes:250, nextSchedule:null
    };
    try {
      const s = localStorage.getItem('manhwaforge_settings_v3');
      if (!s) return defaults;
      const parsed = JSON.parse(s);
      for (let k of ['groq', 'deepgram', 'openrouter', 'ytClientId', 'ytClientSecret']) {
        if (!parsed[k] || parsed[k].includes('YOUR_')) {
          parsed[k] = defaults[k];
        }
      }
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  }

  saveSettings() {
    if (this.settings.groq)       localStorage.setItem('mf_groq_key', this.settings.groq);
    if (this.settings.deepgram)   localStorage.setItem('mf_dg_key', this.settings.deepgram);
    if (this.settings.openrouter) localStorage.setItem('mf_or_key', this.settings.openrouter);
    if (window.YouTubeAPI) {
      if (this.settings.ytClientId)    window.YouTubeAPI.clientId = this.settings.ytClientId;
      if (this.settings.ytClientSecret) window.YouTubeAPI.clientSecret = this.settings.ytClientSecret;
    }
    localStorage.setItem('manhwaforge_settings_v3', JSON.stringify(this.settings));
    this.syncSettingsToConfig();
    this.showToast('Settings saved', 'success');
  }

  syncSettingsToConfig() {
    if (!window.ManhwaConfig) return;
    const c = window.ManhwaConfig;
    if (this.settings.groq)       c.keys.groq      = this.settings.groq;
    if (this.settings.deepgram)   c.keys.deepgram  = this.settings.deepgram;
    if (this.settings.openrouter) c.keys.openrouter = this.settings.openrouter;
    c.pipeline.scenesPerEpisode = parseInt(this.settings.scenes) || 250;
    c.pipeline.episodeCount     = parseInt(this.settings.episodes) || 3;
    c.pipeline.sourceGenre      = this.settings.genre;
  }

  initAgents() {
    this.storyAgent = new StoryForgeAgent(this);
    this.imageAgent = new PanelArtistAgent(this);
    this.audioAgent = new VoiceCraftAgent(this);
    this.videoAgent = new VideoForgeAgent(this);
    this.bossAgent  = new BossAgent(this);
    this.bossAgent.registerAgents({
      story:  this.storyAgent,
      images: this.imageAgent,
      audio:  this.audioAgent,
      video:  this.videoAgent
    });
    this.appendLog('BossAgent', '🤖 All 4 agents + Boss initialized.', 'info');
  }

  initEventListeners() {
    document.getElementById('btn-settings').addEventListener('click', () => this.toggleModal('modal-settings', true));
    document.getElementById('btn-run').addEventListener('click', () => this.runPipeline());
    document.getElementById('btn-schedule').addEventListener('click', () => this.schedulePipeline());
    document.getElementById('btn-reset').addEventListener('click', () => this.resetPipeline());
    document.querySelector('#modal-settings .close-modal').addEventListener('click', () => this.toggleModal('modal-settings', false));
    document.getElementById('modal-settings').addEventListener('click', (e) => { if (e.target.id === 'modal-settings') this.toggleModal('modal-settings', false); });
    document.getElementById('btn-save-settings').addEventListener('click', () => this.collectAndSaveSettings());
    document.getElementById('btn-connect-youtube').addEventListener('click', () => this.connectYouTube());
    document.getElementById('btn-disconnect-youtube').addEventListener('click', () => this.disconnectYouTube());
    document.getElementById('btn-yt-connect-modal').addEventListener('click', () => this.connectYouTube());
    document.getElementById('btn-yt-disconnect-modal').addEventListener('click', () => this.disconnectYouTube());
    document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', (e) => this.switchTab(e.target.dataset.target)));
    document.getElementById('episode-selector').addEventListener('change', (e) => {
      const idx = parseInt(e.target.value) - 1;
      if (this.lastStoryData?.episodes?.[idx]) this.renderEpisode(this.lastStoryData.episodes[idx]);
    });
    document.getElementById('btn-download-video').addEventListener('click', () => {
      const p = document.getElementById('main-video-player');
      if (p.src) { const a = document.createElement('a'); a.href = p.src; a.download = 'manhwa_episode.webm'; a.click(); }
    });
    this.populateSettingsForm();
    const uri = document.getElementById('redirect-uri-display');
    if (uri) uri.textContent = `${window.location.origin}/oauth-callback.html`;
  }

  populateSettingsForm() {
    const s = this.settings;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
    set('key-groq', s.groq); set('key-deepgram', s.deepgram); set('key-openrouter', s.openrouter);
    set('yt-client-id', s.ytClientId); set('yt-client-secret', s.ytClientSecret);
    set('pref-genre', s.genre); set('pref-scenes', String(s.scenes || 250)); set('pref-episodes', String(s.episodes || 3));
    const ar = document.getElementById('pref-autorun'); if (ar) ar.checked = !!s.autorun;
  }

  collectAndSaveSettings() {
    const g = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
    this.settings.groq = g('key-groq'); this.settings.deepgram = g('key-deepgram'); this.settings.openrouter = g('key-openrouter');
    this.settings.ytClientId = g('yt-client-id'); this.settings.ytClientSecret = g('yt-client-secret');
    this.settings.genre = g('pref-genre'); this.settings.scenes = parseInt(g('pref-scenes')) || 250;
    this.settings.episodes = parseInt(g('pref-episodes')) || 3;
    this.settings.autorun = document.getElementById('pref-autorun')?.checked || false;
    this.saveSettings();
    this.toggleModal('modal-settings', false);
  }

  initSettingsTabs() {
    document.querySelectorAll('.stab').forEach(b => {
      b.addEventListener('click', (e) => {
        document.querySelectorAll('.stab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.stab-content').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.stab)?.classList.add('active');
      });
    });
  }

  toggleModal(id, show) {
    const m = document.getElementById(id);
    if (!m) return;
    if (show) { m.classList.remove('hidden'); this.populateSettingsForm(); } else m.classList.add('hidden');
  }

  switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn[data-target="${tabId}"]`)?.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');
  }

  // YouTube
  async checkYouTubeStatus() {
    if (!window.YouTubeAPI) return;
    const ok = await window.YouTubeAPI.isAuthenticated();
    this.updateYouTubeStatusUI(ok);
    if (ok) { try { const ch = await window.YouTubeAPI.getChannelInfo(); if (ch) this.updateYouTubeStatusUI(true, ch.snippet?.title, ch.statistics?.subscriberCount); } catch {} }
  }

  updateYouTubeStatusUI(connected, name = '', subs = '') {
    const icon = document.getElementById('yt-status-icon');
    const text = document.getElementById('yt-status-text');
    const bc = document.getElementById('btn-connect-youtube');
    const bd = document.getElementById('btn-disconnect-youtube');
    const bmc = document.getElementById('btn-yt-connect-modal');
    const bmd = document.getElementById('btn-yt-disconnect-modal');
    if (connected) {
      if (icon) icon.textContent = '✅';
      if (text) text.textContent = name ? `Connected: ${name} (${subs} subs)` : 'YouTube connected';
      if (bc) bc.style.display = 'none'; if (bd) bd.style.display = 'inline-block';
      if (bmc) bmc.style.display = 'none'; if (bmd) bmd.style.display = 'inline-block';
    } else {
      if (icon) icon.textContent = '⭕';
      if (text) text.textContent = 'YouTube not connected';
      if (bc) bc.style.display = 'inline-block'; if (bd) bd.style.display = 'none';
      if (bmc) bmc.style.display = 'inline-block'; if (bmd) bmd.style.display = 'none';
    }
  }

  async connectYouTube() {
    const ci = document.getElementById('yt-client-id');
    const cs = document.getElementById('yt-client-secret');
    if (ci?.value) window.YouTubeAPI.clientId = ci.value.trim();
    if (cs?.value) window.YouTubeAPI.clientSecret = cs.value.trim();
    if (!window.YouTubeAPI.clientId) { this.showToast('Enter Client ID in Settings → YouTube first', 'error'); return; }
    this.showToast('Opening Google authorization...', 'info');
    try { await window.YouTubeAPI.initiateOAuthFlow(); this.showToast('✅ YouTube connected!', 'success'); await this.checkYouTubeStatus(); }
    catch (e) { this.showToast(`Auth failed: ${e.message}`, 'error'); }
  }

  disconnectYouTube() { window.YouTubeAPI.disconnect(); this.updateYouTubeStatusUI(false); this.showToast('YouTube disconnected', 'info'); }

  async checkServerHealth() {
    const ind = document.getElementById('server-status');
    try { const r = await fetch(`${window.ManhwaConfig?.endpoints?.pythonServer || 'http://localhost:8000'}/health`, {signal:AbortSignal.timeout(3000)}); if (r.ok) { ind.className='status-indicator online'; this.appendLog('BossAgent','✅ Python backend online — FFmpeg video enabled.','info'); } else throw 0; }
    catch { ind.className='status-indicator offline'; this.appendLog('BossAgent','⚪ Python backend offline — using browser video fallback.','info'); }
  }

  showToast(msg, type='info') {
    const c = document.getElementById('toast-container'); if (!c) return;
    const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
    t.style.cssText = 'opacity:0;transform:translateX(100px);transition:all 0.3s ease';
    c.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(0)'; });
    setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 400); }, 4000);
  }

  async sendLogToServer(source, message, level) {
    try {
      fetch(`${window.ManhwaConfig?.endpoints?.pythonServer || 'http://localhost:8000'}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, message: String(message), level }),
        keepalive: true
      }).catch(()=>{});
    } catch (e) {}
  }

  appendLog(agent, message, level='info') {
    this.sendLogToServer(agent, message, level);
    const term = document.getElementById('log-terminal');
    if (!term) { console.log(`[${agent}]`, message); return; }
    const e = document.createElement('div');
    e.className = `log-entry log-level-${level}`;
    const time = new Date().toLocaleTimeString('en-US',{hour12:false});
    const colors = { BossAgent:'#a78bfa', StoryForge:'#facc15', PanelArtist:'#f472b6', VoiceCraft:'#60a5fa', VideoForge:'#fb923c' };
    const c = colors[agent] || '#94a3b8';
    const lc = {error:'#ef4444', warning:'#f59e0b', success:'#10b981', info:'#f8fafc'}[level] || '#f8fafc';
    e.innerHTML = `<span style="color:#475569">[${time}]</span> <span style="color:${c};font-weight:600">${agent}:</span> <span style="color:${lc}">${message}</span>`;
    term.appendChild(e);
    term.scrollTop = term.scrollHeight;
  }

  updateAgentUI(agentId, status, progress, taskMsg) {
    const badge = document.getElementById(`badge-${agentId}`);
    const task  = document.getElementById(`task-${agentId}`);
    const bar   = document.getElementById(`progress-${agentId}`);
    if (!badge || !task || !bar) return;
    const labels = {idle:'Idle', running:'Running', paused:'Paused', done:'Done', error:'Error'};
    badge.className = `badge badge-${status}`; badge.textContent = labels[status]||status;
    task.textContent = taskMsg || '';
    bar.style.width = `${Math.min(100,Math.max(0,progress))}%`;
    if (status === 'running') bar.classList.add('animated'); else bar.classList.remove('animated');
    const card = document.getElementById(`agent-${agentId}`);
    if (card) card.className = `agent-card glass-panel status-${status}`;
  }

  updateSceneCounter(agentId, current, total) {
    const el = document.getElementById(`counter-${agentId}`);
    if (el) el.textContent = `${current} / ${total}`;
  }

  updatePipelineStats(stats) {
    const total = this.getSceneCount() * this.getEpisodeCount();
    const set = (id,v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('stat-episodes', `${stats.episodes || 0}/${this.getEpisodeCount()}`);
    set('stat-scenes', `${stats.scenes || 0}/${total}`);
    set('stat-images', `${stats.images || 0}/${total}`);
    set('stat-audio', `${stats.audio || 0}/${total}`);
    set('stat-video-length', stats.videoMinutes ? `${stats.videoMinutes} min` : '0 min');
  }

  // Pipeline
  async runPipeline() {
    if (this.pipelineRunning) { this.showToast('Pipeline already running!','warning'); return; }
    this.resetPipeline();
    if (!this.bossAgent) { try { this.initAgents(); } catch (e) { this.showToast(`Init failed: ${e.message}`,'error'); return; } }
    this.pipelineRunning = true;
    const btn = document.getElementById('btn-run');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Running...'; }
    this.switchTab('tab-logs');
    this.showToast('🚀 Pipeline starting! Target: 750 scenes, 45+ min/episode','info');
    this.appendLog('BossAgent','═══════════ PIPELINE START ═══════════','info');
    try {
      await this.bossAgent.run();
      this.showToast('✅ Pipeline complete!','success');
      this.appendLog('BossAgent','═══════════ PIPELINE COMPLETE ═══════════','success');
    } catch (e) {
      this.appendLog('BossAgent',`❌ Pipeline failed: ${e.message}`,'error');
      this.showToast(`Pipeline error: ${e.message}`,'error');
    } finally {
      this.pipelineRunning = false;
      if (btn) { btn.disabled = false; btn.textContent = '▶ Run Pipeline'; }
    }
  }

  resetPipeline() {
    if (this.pipelineRunning) { this.showToast('Cannot reset while running','warning'); return; }
    if (window.PipelineState) window.PipelineState.reset();
    localStorage.removeItem('mf_pipeline_state');
    localStorage.removeItem('panelArtistCheckpoint');
    localStorage.removeItem('voiceCraftCheckpoint');
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('storyforge_checkpoint_')) localStorage.removeItem(k);
      }
    } catch(e) {}
    this.lastStoryData = null; this.lastImageData = []; this.lastAudioData = [];
    ['story','images','audio','video','boss'].forEach(id => {
      this.updateAgentUI(id, 'idle', 0, id === 'boss' ? 'Checkpoint cleared.' : 'Waiting...');
      this.updateSceneCounter(id, 0, 0);
    });
    this.updatePipelineStats({});
    this.showToast('Pipeline state reset! All checkpoints cleared.', 'info');
  }

  schedulePipeline() {
    const next = new Date(); next.setDate(next.getDate()+3); next.setUTCHours(23,0,0,0);
    this.settings.nextSchedule = next.toISOString();
    this.settings.autorun = true;
    this.saveSettings();
    const local = next.toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'});
    this.showToast(`Scheduled: ${local} ET`,'success');
    this.appendLog('BossAgent',`📅 Next run: ${local} ET`,'info');
  }

  checkSchedule() {
    if (!this.settings.autorun || !this.settings.nextSchedule || this.pipelineRunning) return;
    if (new Date() >= new Date(this.settings.nextSchedule)) {
      this.appendLog('BossAgent','⏰ Scheduled run triggered','info');
      this.runPipeline().then(() => {
        const next = new Date(); next.setDate(next.getDate()+3); next.setUTCHours(23,0,0,0);
        this.settings.nextSchedule = next.toISOString();
        this.saveSettings();
      });
    }
  }

  // Story UI
  updateStoryPreview(storyData) {
    this.lastStoryData = storyData;
    const sel = document.getElementById('episode-selector');
    if (sel) { sel.innerHTML = ''; (storyData.episodes||[]).forEach((ep,i) => { const o = document.createElement('option'); o.value = i+1; o.textContent = `Ep ${ep.episodeNum||ep.episodeNumber||i+1}: ${ep.title||''}  (${ep.scenes?.length||0} scenes)`; sel.appendChild(o); }); }
    const syn = document.getElementById('story-synopsis');
    if (syn) syn.textContent = storyData.synopsis || '';
    const chars = document.getElementById('story-characters');
    if (chars) chars.textContent = `Characters: ${Array.isArray(storyData.characters) ? storyData.characters.map(c => typeof c === 'string' ? c : c.name).join(', ') : ''}`;
    if (storyData.episodes?.[0]) this.renderEpisode(storyData.episodes[0]);
    this.switchTab('tab-story');
  }

  renderEpisode(ep) {
    const body = document.getElementById('story-body');
    if (!body || !ep) return;
    let html = `<h3 style="color:var(--accent-cyan)">📺 ${ep.title||''} (${ep.scenes?.length||0} scenes)</h3>`;
    if (ep.hook) html += `<div class="story-hook">🎬 <strong>Hook:</strong> ${ep.hook}</div>`;
    const scenes = ep.scenes || [];
    const showMax = 20;
    scenes.slice(0, showMax).forEach(s => {
      html += `<div class="story-scene"><h4>Scene ${s.sceneNumber||''}: ${s.scene_title||s.title||''}</h4><p class="scene-tone">${s.emotional_tone||''}</p><p class="scene-desc">${s.description||''}</p>`;
      if (s.dialogue?.length) { html += `<div class="scene-dialogue">`; s.dialogue.forEach(d => { html += `<p><strong class="speaker">${d.speaker}:</strong> "${d.line}"</p>`; }); html += `</div>`; }
      html += `</div>`;
    });
    if (scenes.length > showMax) html += `<div class="empty-state"><p>... and ${scenes.length-showMax} more scenes. Full story generated successfully.</p></div>`;
    if (ep.cliffhanger) html += `<div class="story-cliffhanger">⚡ <strong>Cliffhanger:</strong> ${ep.cliffhanger}</div>`;
    body.innerHTML = html;
  }

  updateImageGallery(imageList) {
    this.lastImageData = imageList;
    const grid = document.getElementById('image-gallery');
    if (!grid) return;
    grid.innerHTML = '';
    if (!imageList?.length) return;
    const showMax = 50;
    imageList.slice(0, showMax).forEach((item,i) => {
      const url = typeof item === 'string' ? item : item.url;
      const label = typeof item === 'object' ? `Ep${item.episodeNum||'?'} Sc${item.sceneNum||i+1}` : `Panel ${i+1}`;
      const el = document.createElement('div'); el.className = 'gallery-item';
      el.innerHTML = `<img src="${url}" alt="${label}" loading="lazy" onerror="this.style.display='none'"><div class="gallery-label">${label}</div>`;
      grid.appendChild(el);
    });
    if (imageList.length > showMax) {
      const more = document.createElement('div'); more.className = 'empty-state';
      more.innerHTML = `<p>Showing first ${showMax} of ${imageList.length} images</p>`;
      grid.appendChild(more);
    }
  }

  updateAudioList(audioList) {
    this.lastAudioData = audioList;
    const c = document.getElementById('audio-player-list');
    if (!c) return; c.innerHTML = '';
    if (!audioList?.length) return;
    const showMax = 20;
    audioList.slice(0, showMax).forEach((item,i) => {
      const url = typeof item === 'string' ? item : item.audioUrl;
      const label = typeof item === 'object' ? `Ep ${item.episodeNum||'?'} — Scene ${item.sceneNum||i+1}` : `Scene ${i+1}`;
      const el = document.createElement('div'); el.className = 'audio-item glass-panel';
      el.innerHTML = `<div class="audio-label">🎙️ ${label}</div><audio controls src="${url}" style="width:100%;margin-top:0.5rem" preload="metadata"></audio>`;
      c.appendChild(el);
    });
    if (audioList.length > showMax) {
      const more = document.createElement('div'); more.className = 'empty-state';
      more.innerHTML = `<p>${audioList.length} total audio clips generated</p>`;
      c.appendChild(more);
    }
  }

  updateVideoPreview(videoUrl) {
    const ph = document.getElementById('video-placeholder');
    const pl = document.getElementById('main-video-player');
    if (ph) ph.style.display = 'none';
    if (pl) { pl.style.display = 'block'; pl.src = videoUrl; pl.load(); }
    document.getElementById('btn-download-video')?.removeAttribute('disabled');
    this.switchTab('tab-video');
  }

  updateSEOPreview(seoData) {
    const set = (id,v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
    set('seo-title', seoData.title);
    set('seo-description', seoData.description);
    set('seo-tags', Array.isArray(seoData.tags) ? seoData.tags.join(', ') : seoData.tags);
    set('seo-schedule', seoData.publishAt ? new Date(seoData.publishAt).toLocaleString('en-US',{timeZone:'America/New_York'}) + ' ET' : 'Pending');
    if (seoData.thumbnailUrl) {
      const th = document.getElementById('seo-thumbnail');
      if (th) { th.style.backgroundImage = `url('${seoData.thumbnailUrl}')`; th.style.backgroundSize = 'cover'; th.innerHTML = ''; }
    }
    this.switchTab('tab-seo');
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new ManhwaForge(); });
