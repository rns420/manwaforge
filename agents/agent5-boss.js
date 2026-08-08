class BossAgent {
    constructor(app) {
        this.app = app;
        this.id = 'agent5-boss';
        this.name = 'Boss Agent (Orchestrator)';
        this.description = 'Manages pipeline and performs AI quality review';
        this.isWorking = false;
        this.agents = {};
        
        // Use Puter/Groq/Pollinations/OpenRouter
        this.apiKeys = {}; 
    }

    registerAgents({ story, images, audio, video }) {
        this.agents = { story, images, audio, video };
    }

    updateUI(progress, message) {
        if (this.app && this.app.updateAgentUI) {
            this.app.updateAgentUI(this.id, 'active', progress, message);
        } else {
            console.log(`[${this.name}] ${progress}% - ${message}`);
        }
    }

    async handleRateLimit(error, currentPct, currentMsg) {
        if (error && error.message && error.message.includes('429')) {
            const retryAfterMatch = error.message.match(/retryAfter: (\d+)/);
            const retryAfterMs = retryAfterMatch ? parseInt(retryAfterMatch[1]) : 60000;
            
            const waitMsg = `Rate limit hit. Paused for ${Math.ceil(retryAfterMs/1000)}s...`;
            if (this.app && this.app.updateAgentUI) {
                this.app.updateAgentUI(this.id, 'paused', currentPct, waitMsg);
            }
            if (this.app && this.app.showToast) {
                this.app.showToast(waitMsg, 'warning');
            }
            
            // Show countdown
            let remaining = retryAfterMs;
            while(remaining > 0) {
                await this.delay(1000);
                remaining -= 1000;
                if (this.app && this.app.updateAgentUI) {
                    this.app.updateAgentUI(this.id, 'paused', currentPct, `Rate limit hit. Paused for ${Math.ceil(remaining/1000)}s...`);
                }
            }
            
            this.updateUI(currentPct, `Resuming: ${currentMsg}`);
            return true; // handled
        }
        return false; // not a rate limit error
    }

    async run() {
        if (this.isWorking) return;
        this.isWorking = true;
        this.updateUI(0, 'Starting pipeline orchestration...');

        try {
            if (!window.PipelineState) {
                window.PipelineState = {
                    getStepData: () => null,
                    saveStepData: () => {},
                    reset: () => {}
                };
            }

            let storyData = window.PipelineState.getStepData('story_built');
            let assetsData = window.PipelineState.getStepData('assets_built');
            let videoData = window.PipelineState.getStepData('video_built');
            let seoData = window.PipelineState.getStepData('seo_published');

            // 1. STORY GENERATION & REVIEW
            if (!storyData) {
                this.updateUI(10, 'Running StoryForge (Agent 1)...');
                storyData = await this.executeWithRetry(async () => {
                    return await this.agents.story.run();
                }, 10, 'Running StoryForge (Agent 1)...');
                
                // Real AI Quality Review for Story
                this.updateUI(15, 'Boss reviewing story quality...');
                let reviewPassed = await this.reviewStoryQuality(storyData);
                if (!reviewPassed) {
                    this.updateUI(15, 'Story quality failed review, proceeding anyway but logged warnings.');
                }
                
                window.PipelineState.saveStepData('story_built', storyData);
                if (this.app && this.app.updateStoryPreview) this.app.updateStoryPreview(storyData);
            } else {
                this.updateUI(15, 'Skipping StoryForge (already completed)');
                this.app?.appendLog('BossAgent', 'Skipping StoryForge (using checkpoint data)', 'info');
            }

            // 2. ASSETS (IMAGES & AUDIO PARALLEL) & REVIEW
            if (!assetsData) {
                this.updateUI(25, 'Running PanelArtist and VoiceCraft in parallel...');
                
                const [imageData, audioData] = await Promise.all([
                    this.executeWithRetry(async () => this.agents.images.run(storyData), 25, 'Running PanelArtist'),
                    this.executeWithRetry(async () => this.agents.audio.run(storyData), 25, 'Running VoiceCraft')
                ]);

                // Boss reviews assets
                this.updateUI(60, 'Boss reviewing generated assets...');
                this.reviewAssets(imageData, audioData, storyData);
                
                assetsData = { imageData, audioData };
                window.PipelineState.saveStepData('assets_built', assetsData);
                
                if (this.app && this.app.updateImageGallery) this.app.updateImageGallery(imageData);
                if (this.app && this.app.updateAudioList) this.app.updateAudioList(audioData);
            } else {
                this.updateUI(50, 'Skipping Assets generation (already completed)');
                this.app?.appendLog('BossAgent', 'Skipping Assets generation (using checkpoint data)', 'info');
            }

            // 3. VIDEO GENERATION & REVIEW
            if (!videoData) {
                this.updateUI(70, 'Running VideoForge (Agent 4)...');
                videoData = await this.executeWithRetry(async () => {
                    return await this.agents.video.run(storyData, assetsData.imageData, assetsData.audioData);
                }, 70, 'Running VideoForge (Agent 4)...');
                
                // Boss reviews video
                this.updateUI(85, 'Boss reviewing video...');
                this.reviewVideo(videoData);
                
                window.PipelineState.saveStepData('video_built', videoData);
                
                if (this.app && this.app.updateVideoPreview && videoData && videoData.length > 0) {
                    this.app.updateVideoPreview(videoData[0].videoUrl);
                }
            } else {
                this.updateUI(85, 'Skipping Video compilation (already completed)');
                this.app?.appendLog('BossAgent', 'Skipping Video compilation (using checkpoint data)', 'info');
            }

            // 4. SEO & PUBLISH
            if (!seoData) {
                this.updateUI(90, 'Running SEO and Publish...');
                
                const seoContent = await this.executeWithRetry(async () => {
                    return await this.agents.story.generateSEOForEpisode(storyData, 1);
                }, 90, 'Generating SEO...');
                
                if (this.app && this.app.updateSEOPreview) this.app.updateSEOPreview(seoContent);
                
                const uploadResult = await this.executeWithRetry(async () => {
                    if (videoData && videoData.length > 0) {
                        return await this.agents.story.uploadToYouTube(videoData[0].videoUrl, seoContent);
                    }
                    throw new Error("No video data available for upload");
                }, 95, 'Uploading to YouTube...');
                
                seoData = { seoContent, uploadResult };
                window.PipelineState.saveStepData('seo_published', seoData);
            } else {
                this.updateUI(95, 'Skipping SEO & Publish (already completed)');
                this.app?.appendLog('BossAgent', 'Skipping SEO & Publish (using checkpoint data)', 'info');
            }
            
            // 5. SCHEDULE NEXT RUN
            this.scheduleNextRun();

            this.updateUI(100, 'Pipeline complete!');
            this.isWorking = false;
            
        } catch (error) {
            this.isWorking = false;
            this.updateUI(0, `Pipeline failed: ${error.message}`);
            if (this.app && this.app.showToast) {
                this.app.showToast(`Pipeline failed: ${error.message}`, 'error');
            }
            this.app?.appendLog('BossAgent', `Pipeline failed: ${error.message}`, 'error');
            if (error.stack) this.app?.appendLog('BossAgent', error.stack, 'error');
            throw error;
        }
    }

    async executeWithRetry(func, pct, msg) {
        let maxRetries = 3;
        while(maxRetries > 0) {
            try {
                return await func();
            } catch (err) {
                let handled = await this.handleRateLimit(err, pct, msg);
                if (handled) {
                    // Retry immediately after wait
                    continue; 
                }
                maxRetries--;
                if (maxRetries === 0) throw err;
                await this.delay(5000); // generic retry wait
            }
        }
    }

    async reviewStoryQuality(storyData) {
        // Prepare prompt
        const storyText = JSON.stringify(storyData).substring(0, 4000); // limit size
        const prompt = `Review the following manga/manhwa story data. Rate its engagement potential from 1-10. Is the hook strong? Are there enough twists? Does each episode cliffhanger make viewers want to continue? Answer strictly in JSON format: {"rating": <number 1-10>, "suggestions": "<string feedback>"}. Story: ${storyText}`;
        
        try {
            let responseStr = await this.callAI(prompt);
            // extract JSON
            let match = responseStr.match(/\{[\s\S]*\}/);
            if (match) {
                let review = JSON.parse(match[0]);
                console.log("Boss Story Review:", review);
                if (review.rating < 7) {
                    console.warn(`Boss Agent Warning: Story rating is low (${review.rating}/10). Suggestions: ${review.suggestions}`);
                    return false;
                }
                return true;
            }
        } catch (e) {
            console.error("Boss failed to review story with AI:", e);
        }
        return true; // proceed by default
    }

    reviewAssets(imageData, audioData, storyData) {
        // Image Check
        let imageCount = imageData.length;
        let expectedImages = storyData.episodes ? storyData.episodes.length * 250 : 250;
        console.log(`Boss Asset Review: Generated ${imageCount} images (Expected ~${expectedImages})`);
        if (imageCount < expectedImages * 0.8) {
            console.warn(`Boss Warning: Significantly fewer images than expected! ${imageCount}`);
        }

        // Audio Check
        let totalDuration = audioData.reduce((acc, aud) => acc + (aud.durationMs ? aud.durationMs / 1000 : 10), 0);
        let totalDurationMinutes = totalDuration / 60;
        console.log(`Boss Asset Review: Generated ${totalDurationMinutes.toFixed(2)} minutes of audio.`);
        
        // If it's a single episode, we expect 45 mins (2700s)
        let totalEpisodes = storyData.episodes ? storyData.episodes.length : 1;
        let expectedDuration = totalEpisodes * 2700;
        
        if (totalDuration < expectedDuration * 0.9) {
            console.warn(`Boss Warning: Total audio duration (${totalDuration}s) is significantly under the 45+ minute target per episode!`);
        }
    }

    reviewVideo(videoData) {
        if (!videoData || videoData.length === 0) {
            console.warn("Boss Warning: No video data returned!");
            return;
        }
        
        videoData.forEach(vid => {
            if (!vid.videoUrl || vid.videoUrl.trim() === '') {
                console.warn(`Boss Warning: Video URL is empty for Episode ${vid.episodeNum}!`);
            } else {
                console.log(`Boss Video Review Passed: Episode ${vid.episodeNum}, URL: ${vid.videoUrl}, Duration: ${Math.floor(vid.durationSeconds/60)}m ${Math.round(vid.durationSeconds%60)}s`);
            }
        });
    }

    scheduleNextRun() {
        // 3 days later at 23:00 UTC
        const now = new Date();
        const nextRun = new Date(now);
        nextRun.setUTCDate(now.getUTCDate() + 3);
        nextRun.setUTCHours(23, 0, 0, 0); // 23:00 UTC is 6 PM ET during standard time (or 7PM EDT)
        
        console.log(`Boss Agent scheduled next pipeline run for: ${nextRun.toUTCString()}`);
        if (this.app && this.app.showToast) {
            this.app.showToast(`Next upload scheduled: ${nextRun.toLocaleString()}`, 'success');
        }
    }

    async callAI(prompt) {
        // Try Pollinations as reliable free fallback
        try {
            let res = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: prompt }],
                    model: 'openai'
                })
            });
            if (res.ok) {
                let text = await res.text();
                return text;
            }
        } catch (e) {
            console.warn('Pollinations failed', e);
        }
        
        throw new Error('All AI providers failed');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.BossAgent = BossAgent;
