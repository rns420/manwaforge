class VideoForgeAgent {
    constructor(app) {
        this.app = app;
        this.id = 'agent4-video';
        this.name = 'VideoForge (Editor)';
        this.description = 'Assembles 45+ min videos with Ken Burns effect';
        this.isWorking = false;
        
        // Define endpoints
        this.pythonServer = window.ManhwaConfig?.endpoints?.pythonServer || 'http://localhost:8000';
    }

    async run(storyData, imageData, audioData) {
        this.isWorking = true;
        this.updateUI(0, 'Starting video assembly process...');
        
        try {
            const results = [];
            let totalEpisodes = storyData.episodes ? storyData.episodes.length : 1;
            
            for (let epIndex = 0; epIndex < totalEpisodes; epIndex++) {
                let episodeNum = epIndex + 1;
                this.updateUI(5, `Preparing episode ${episodeNum} data...`);
                
                // Get episode data
                let epStory = storyData.episodes ? storyData.episodes[epIndex] : storyData;
                let epImages = imageData.filter(img => img.episodeNum === episodeNum);
                let epAudio = audioData.filter(aud => aud.episodeNum === episodeNum);
                
                // Calculate real duration
                let durationSeconds = 0;
                let scenes = [];
                
                // Usually there are ~250 scenes. Let's merge them
                let totalScenes = Math.max(epImages.length, epAudio.length, epStory.scenes ? epStory.scenes.length : 0);
                
                for (let i = 0; i < totalScenes; i++) {
                    let sceneAudio = epAudio.find(a => a.sceneIndex === i) || epAudio[i];
                    let sceneImage = epImages.find(img => img.sceneIndex === i) || epImages[i];
                    
                    let sceneDuration = 10; // default 10 seconds
                    
                    if (sceneAudio && (sceneAudio.durationMs ? sceneAudio.durationMs / 1000 : null)) {
                        sceneDuration = sceneAudio.durationMs / 1000;
                    } else if (sceneAudio && (sceneAudio.audioUrl || sceneAudio.url)) {
                        // Attempt to estimate duration from audio length if missing
                        sceneDuration = await this.getAudioDuration(sceneAudio.audioUrl || sceneAudio.url);
                        sceneAudio.durationMs = sceneDuration * 1000;
                    }
                    
                    durationSeconds += sceneDuration;
                    
                    scenes.push({
                        index: i,
                        imageUrl: sceneImage ? (sceneImage.url || sceneImage.imageUrl) : null,
                        audioUrl: sceneAudio ? (sceneAudio.audioUrl || sceneAudio.url) : null,
                        duration: sceneDuration
                    });
                }
                
                this.updateUI(10, `Assembling Ep ${episodeNum}: ${scenes.length} scenes, estimated ${Math.floor(durationSeconds/60)}m ${Math.round(durationSeconds%60)}s`);
                
                // Attempt Backend Generation first
                let videoUrl = await this.tryBackendAssembly(episodeNum, scenes);
                
                if (!videoUrl) {
                    this.updateUI(15, `Backend failed or unavailable. Falling back to client-side Canvas assembly...`);
                    videoUrl = await this.clientSideAssembly(episodeNum, scenes);
                }
                
                if (videoUrl) {
                    if (this.app && this.app.updateVideoPreview) {
                        this.app.updateVideoPreview(videoUrl);
                    }
                    
                    results.push({
                        episodeNum,
                        videoUrl,
                        durationSeconds,
                        frameCount: scenes.length
                    });
                } else {
                    throw new Error(`Failed to generate video for episode ${episodeNum}`);
                }
            }
            
            this.updateUI(100, `Completed all video assembly!`);
            this.isWorking = false;
            return results;
            
        } catch (error) {
            this.isWorking = false;
            this.updateUI(0, `Error: ${error.message}`);
            throw error;
        }
    }
    
    async getAudioDuration(url) {
        return new Promise((resolve) => {
            let audio = new Audio();
            audio.addEventListener('loadedmetadata', () => {
                resolve(audio.duration || 10);
            });
            audio.addEventListener('error', () => resolve(10));
            audio.src = url;
        });
    }

    async tryBackendAssembly(episodeNum, scenes) {
        try {
            const createUrl = `${this.pythonServer}/api/create-video`;
            
            // Format for backend
            const payload = {
                episodeNum,
                scenes: scenes.map(s => ({
                    imageUrl: s.imageUrl,
                    audioUrl: s.audioUrl,
                    duration: s.duration
                }))
            };
            
            // Issue POST
            const createRes = await fetch(createUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => null);
            
            if (!createRes || !createRes.ok) return null;
            
            const createData = await createRes.json();
            const jobId = createData.jobId;
            if (!jobId) return null;
            
            // Poll for status
            let isComplete = false;
            let videoUrl = null;
            let attempts = 0;
            const maxAttempts = 1200; // 1 hour max at 3s intervals
            
            while (!isComplete && attempts < maxAttempts) {
                await this.delay(3000); // 3 seconds
                attempts++;
                
                const statusRes = await fetch(`${this.pythonServer}/api/video-status/${jobId}`).catch(() => null);
                if (!statusRes || !statusRes.ok) continue;
                
                const statusData = await statusRes.json();
                
                // Update UI based on backend progress
                if (statusData.progress) {
                    let pct = 10 + Math.floor(statusData.progress * 0.8); // Scale to 10-90%
                    this.updateUI(pct, `Backend assembling Ep ${episodeNum}: ${statusData.message || 'Processing...'}`);
                }
                
                if (statusData.status === 'completed') {
                    isComplete = true;
                    videoUrl = `${this.pythonServer}/api/download-video/${jobId}`;
                } else if (statusData.status === 'failed') {
                    console.error("Backend generation failed:", statusData.error);
                    return null;
                }
            }
            
            return videoUrl;
            
        } catch (e) {
            console.error("Backend assembly error:", e);
            return null;
        }
    }

    async clientSideAssembly(episodeNum, scenes) {
        return new Promise(async (resolve, reject) => {
            try {
                // Setup Canvas
                const canvas = document.createElement('canvas');
                canvas.width = 1920;
                canvas.height = 1080;
                const ctx = canvas.getContext('2d');
                
                // Check MediaRecorder support
                let mimeType = 'video/webm; codecs=vp9';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm; codecs=vp8';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = 'video/webm';
                    }
                }
                
                const stream = canvas.captureStream(24); // 24 FPS
                
                // Audio context for synchronization
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const dest = audioCtx.createMediaStreamDestination();
                
                // Merge audio track into video stream
                const mixedStream = new MediaStream([
                    ...stream.getVideoTracks(),
                    ...dest.stream.getAudioTracks()
                ]);
                
                const recorder = new MediaRecorder(mixedStream, { mimeType, videoBitsPerSecond: 5000000 });
                const chunks = [];
                
                recorder.ondataavailable = e => {
                    if (e.data.size > 0) chunks.push(e.data);
                };
                
                let recordingFinished = false;
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    recordingFinished = true;
                    resolve(url);
                };
                
                recorder.start();
                
                const totalScenes = scenes.length;
                const batchSize = 10;
                
                for (let i = 0; i < totalScenes; i += batchSize) {
                    const batch = scenes.slice(i, Math.min(i + batchSize, totalScenes));
                    
                    // Preload images for this batch
                    for (let j = 0; j < batch.length; j++) {
                        const scene = batch[j];
                        const globalIndex = i + j;
                        
                        this.updateUI(20 + Math.floor((globalIndex / totalScenes) * 70), 
                            `Assembling Ep ${episodeNum}: Scene ${globalIndex + 1}/${totalScenes}`);
                            
                        let img = await this.loadImage(scene.imageUrl);
                        let audioBuffer = null;
                        
                        if (scene.audioUrl) {
                            try {
                                const response = await fetch(scene.audioUrl);
                                const arrayBuffer = await response.arrayBuffer();
                                audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                            } catch (e) {
                                console.warn(`Could not load audio for scene ${globalIndex}`, e);
                            }
                        }
                        
                        await this.renderScene(ctx, canvas.width, canvas.height, img, audioBuffer, scene.duration, audioCtx, dest);
                    }
                }
                
                recorder.stop();
                
                // Wait for onstop
                while (!recordingFinished) {
                    await this.delay(100);
                }
                
            } catch (error) {
                console.error("Client side assembly failed", error);
                reject(error);
            }
        });
    }

    async renderScene(ctx, width, height, img, audioBuffer, durationSeconds, audioCtx, destNode) {
        return new Promise((resolve) => {
            const startMs = performance.now();
            const durationMs = durationSeconds * 1000;
            
            // Play audio if available
            let source = null;
            if (audioBuffer) {
                source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(destNode);
                source.connect(audioCtx.destination); // Optional: hear while recording
                source.start();
            }
            
            const animate = () => {
                const now = performance.now();
                const elapsed = now - startMs;
                const progress = Math.min(elapsed / durationMs, 1.0);
                
                // Clear canvas
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, width, height);
                
                if (img) {
                    // Ken Burns effect: scale from 1.0 to 1.15 over duration
                    const scale = 1.0 + (0.15 * progress);
                    
                    // Calculate dimensions to maintain aspect ratio covering the canvas
                    const imgRatio = img.width / img.height;
                    const canvasRatio = width / height;
                    
                    let drawWidth, drawHeight;
                    if (imgRatio > canvasRatio) {
                        drawHeight = height;
                        drawWidth = height * imgRatio;
                    } else {
                        drawWidth = width;
                        drawHeight = width / imgRatio;
                    }
                    
                    // Apply scale
                    const finalWidth = drawWidth * scale;
                    const finalHeight = drawHeight * scale;
                    
                    // Center the image
                    const x = (width - finalWidth) / 2;
                    const y = (height - finalHeight) / 2;
                    
                    ctx.save();
                    ctx.drawImage(img, x, y, finalWidth, finalHeight);
                    ctx.restore();
                } else {
                    // Fallback visual if no image
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '30px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('Scene Missing', width/2, height/2);
                }
                
                if (progress < 1.0) {
                    requestAnimationFrame(animate);
                } else {
                    if (source) {
                        try { source.stop(); } catch(e) {}
                    }
                    resolve();
                }
            };
            
            requestAnimationFrame(animate);
        });
    }

    loadImage(url) {
        return new Promise((resolve) => {
            if (!url) {
                resolve(null);
                return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    updateUI(progress, message) {
        if (this.app && this.app.updateAgentUI) {
            this.app.updateAgentUI(this.id, 'active', progress, message);
        } else {
            console.log(`[${this.name}] ${progress}% - ${message}`);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.VideoForgeAgent = VideoForgeAgent;
