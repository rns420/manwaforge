class VoiceCraftAgent {
    constructor(app, id = "voice-craft") {
        this.app = app;
        this.id = id;
        this.generatedAudio = [];
    }

    updateProgress(pct, message) {
        if (this.app && typeof this.app.updateAgentUI === 'function') {
            this.app.updateAgentUI(this.id, 'running', pct, message);
        }
        if (this.app && typeof this.app.appendLog === 'function') {
            this.app.appendLog('VoiceCraft', message, 'info');
        } else {
            console.log(`[VoiceCraft] ${pct}% - ${message}`);
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    buildNarrationScript(scene, episodeTitle) {
        let text = "";
        if (episodeTitle) text += `${episodeTitle}. `;
        if (scene.description) text += `${scene.description}. `;
        if (scene.dialogue && Array.isArray(scene.dialogue)) {
            scene.dialogue.forEach(d => {
                if (d.speaker && d.line) text += `${d.speaker} said: "${d.line}". `;
            });
        }
        if (scene.audio_narration) {
            text += `${scene.audio_narration}`;
        }
        return text.trim();
    }

    chunkText(text) {
        if (text.length <= 500) return [text];
        const chunks = [];
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        let currentChunk = "";
        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > 500) {
                if (currentChunk.trim()) chunks.push(currentChunk.trim());
                currentChunk = sentence;
            } else {
                currentChunk += (currentChunk ? " " : "") + sentence;
            }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        return chunks.length > 0 ? chunks : [text];
    }

    async getAudioDuration(url) {
        return new Promise((resolve) => {
            const audio = new Audio(url);
            audio.addEventListener('loadedmetadata', () => {
                resolve(audio.duration * 1000);
            });
            audio.addEventListener('error', () => {
                resolve(0); // If fails, resolve 0
            });
        });
    }

    async generateAudioBrowserFallback(text) {
        // Use OfflineAudioContext to generate real WAV blob (a 2s sine wave beep)
        const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const audioCtx = new AudioContext(1, 44100 * 2, 44100);
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(2);
        const renderedBuffer = await audioCtx.startRendering();
        
        // Convert to WAV Blob
        const length = renderedBuffer.length;
        const numOfChan = renderedBuffer.numberOfChannels;
        const buffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(buffer);
        const channels = [];
        let offset = 0;
        let pos = 0;
        
        const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
        const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };
        
        setUint32(0x46464952); // "RIFF"
        setUint32(36 + length * 2);
        setUint32(0x45564157); // "WAVE"
        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16);
        setUint16(1); // PCM
        setUint16(numOfChan);
        setUint32(renderedBuffer.sampleRate);
        setUint32(renderedBuffer.sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2);
        setUint16(16); // 16-bit
        setUint32(0x61746164); // "data" chunk
        setUint32(length * numOfChan * 2);
        
        for(let i = 0; i < renderedBuffer.numberOfChannels; i++) {
            channels.push(renderedBuffer.getChannelData(i));
        }
        
        while(offset < length) {
            for(let i = 0; i < numOfChan; i++) {
                let sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }
        
        return new Blob([buffer], {type: "audio/wav"});
    }

    async generateTTS(text) {
        let dgKey = window.ManhwaConfig?.keys?.deepgram || localStorage.getItem('mf_dg_key');
        let groqKey = window.ManhwaConfig?.keys?.groq || localStorage.getItem('mf_groq_key');

        // Deepgram API
        if (dgKey) {
            try {
                const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${dgKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text })
                });
                if (response.ok) {
                    const blob = await response.blob();
                    return URL.createObjectURL(blob);
                }
            } catch (e) {
                console.warn("Deepgram TTS failed", e);
            }
        }

        // Groq API
        if (groqKey) {
            try {
                const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'playai-tts',
                        voice: 'Fritz-PlayAI',
                        input: text
                    })
                });
                if (response.ok) {
                    const blob = await response.blob();
                    return URL.createObjectURL(blob);
                }
            } catch (e) {
                console.warn("Groq TTS failed", e);
            }
        }


        // Browser Fallback API (WAV blob)
        try {
            const blob = await this.generateAudioBrowserFallback(text);
            return URL.createObjectURL(blob);
        } catch (e) {
            console.error("Browser fallback TTS failed", e);
            throw new Error("All TTS methods failed");
        }
    }

    async generateAudioForScene(scene, episodeTitle) {
        const script = this.buildNarrationScript(scene, episodeTitle);
        const chunks = this.chunkText(script);
        const chunkUrls = [];
        let totalDuration = 0;

        for (const chunk of chunks) {
            const url = await this.generateTTS(chunk);
            chunkUrls.push(url);
            const duration = await this.getAudioDuration(url);
            totalDuration += duration;
        }

        return {
            audioUrl: chunkUrls[0] || "",
            durationMs: totalDuration,
            audioChunks: chunkUrls
        };
    }

    async run(storyData) {
        const saved = localStorage.getItem('voiceCraftCheckpoint');
        this.generatedAudio = saved ? JSON.parse(saved) : [];
        
        let allScenes = [];
        for (let ep of (storyData.episodes || [])) {
            for (let scene of (ep.scenes || [])) {
                allScenes.push({ 
                    episodeNum: ep.episodeNum || ep.episode_number || ep.id || 1, 
                    sceneNum: scene.sceneNumber || scene.scene_number || scene.id || 1, 
                    sceneData: scene,
                    episodeTitle: ep.title || `Episode ${ep.episodeNum || ep.episode_number || ep.id}`
                });
            }
        }

        const batchSize = 10;
        const totalScenes = allScenes.length;
        
        let startIndex = this.generatedAudio.length;
        if (startIndex >= totalScenes) startIndex = 0;

        for (let i = startIndex; i < totalScenes; i += batchSize) {
            const batch = allScenes.slice(i, i + batchSize);
            const batchPromises = batch.map(s => this.generateAudioForScene(s.sceneData, s.episodeTitle));
            
            const results = await Promise.allSettled(batchPromises);
            
            for (let j = 0; j < results.length; j++) {
                if (results[j].status === 'fulfilled') {
                    const res = results[j].value;
                    this.generatedAudio.push({
                        episodeNum: batch[j].episodeNum,
                        sceneNum: batch[j].sceneNum,
                        audioUrl: res.audioUrl,
                        durationMs: res.durationMs,
                        audioChunks: res.audioChunks
                    });
                } else {
                    console.error(`Failed to generate audio for Ep ${batch[j].episodeNum}, Scene ${batch[j].sceneNum}`, results[j].reason);
                }
            }

            if (this.app && typeof this.app.updateAudioList === 'function') {
                this.app.updateAudioList(this.generatedAudio);
            }
            
            const generatedCount = this.generatedAudio.length;
            const pct = (generatedCount / totalScenes) * 100;
            const currEp = batch[batch.length - 1].episodeNum;
            this.updateProgress(pct, `Ep ${currEp}: Generated audio ${generatedCount}/${totalScenes}`);

            this.saveCheckpoint();

            if (i + batchSize < totalScenes) {
                await this.sleep(1000);
            }
        }

        return this.generatedAudio;
    }

    saveCheckpoint() {
        localStorage.setItem('voiceCraftCheckpoint', JSON.stringify(this.generatedAudio));
    }
}
window.VoiceCraftAgent = VoiceCraftAgent;
