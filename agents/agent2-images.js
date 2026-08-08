class PanelArtistAgent {
    constructor(app) {
        this.app = app;
        this.generatedImages = [];
        this.characterStylePrefix = "";
        this.id = 'panel-artist';
    }

    updateProgress(pct, message) {
        if (this.app && typeof this.app.updateAgentUI === 'function') {
            this.app.updateAgentUI(this.id, 'running', pct, message);
        }
        if (this.app && typeof this.app.appendLog === 'function') {
            this.app.appendLog('PanelArtist', message, 'info');
        } else {
            console.log(`[PanelArtist] ${pct.toFixed(2)}% - ${message}`);
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    buildCharacterPrefix(characters) {
        if (!characters || characters.length === 0) return "";
        const descriptions = characters.map(c => `${c.name}: ${c.description || 'character'}`).join(", ");
        return `Characters context - ${descriptions}. `;
    }

    async generateImageForScene(scene, promptPrefix) {
        const baseStyle = "Korean manhwa webtoon art style, dramatic lighting, digital illustration, high detail, vertical comic panel, ";
        const sceneDesc = scene.panel_description || scene.description || '';
        const prompt = `${baseStyle}${promptPrefix}${sceneDesc}`;

        try {
            // Primary: Pollinations.ai Flux (Verify it works first)
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=800&height=1200&nologo=true&enhance=true`;
            const res = await fetch(pollinationsUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
            if (!res.ok) throw new Error("Pollinations returned " + res.status);
            return { url: pollinationsUrl, prompt };
        } catch (error) {
            console.error("Error generating image:", error);
            throw error;
        }
    }

    async run(storyData) {
        // Load checkpoint if exists, else start fresh
        const saved = localStorage.getItem('panelArtistCheckpoint');
        this.generatedImages = saved ? JSON.parse(saved) : [];
        
        this.characterStylePrefix = this.buildCharacterPrefix(storyData.characters);
        
        let allScenes = [];
        for (let ep of (storyData.episodes || [])) {
            for (let scene of (ep.scenes || [])) {
                allScenes.push({ 
                    episodeNum: ep.episodeNum || ep.episode_number || ep.id || 1, 
                    sceneNum: scene.sceneNumber || scene.scene_number || scene.id || 1, 
                    sceneData: scene 
                });
            }
        }

        const batchSize = 5;
        const totalScenes = allScenes.length;
        
        // Skip already generated scenes (simple resume logic)
        let startIndex = this.generatedImages.length;
        if (startIndex >= totalScenes) {
            startIndex = 0; // reset if done
            this.generatedImages = [];
        }

        for (let i = startIndex; i < totalScenes; i += batchSize) {
            const batch = allScenes.slice(i, i + batchSize);
            const batchPromises = batch.map(s => this.generateImageForScene(s.sceneData, this.characterStylePrefix));
            
            const results = await Promise.allSettled(batchPromises);
            
            for (let j = 0; j < results.length; j++) {
                if (results[j].status === 'fulfilled') {
                    const res = results[j].value;
                    this.generatedImages.push({
                        episodeNum: batch[j].episodeNum,
                        sceneNum: batch[j].sceneNum,
                        url: res.url,
                        prompt: res.prompt
                    });
                } else {
                    console.error(`Failed to generate image for Ep ${batch[j].episodeNum}, Scene ${batch[j].sceneNum}`);
                }
            }

            if (this.app && typeof this.app.updateImageGallery === 'function') {
                this.app.updateImageGallery(this.generatedImages);
            }
            
            const generatedCount = this.generatedImages.length;
            const pct = (generatedCount / totalScenes) * 100;
            const currEp = batch[batch.length - 1].episodeNum;
            this.updateProgress(pct, `Ep ${currEp}: Generated images ${generatedCount}/${totalScenes}`);

            // Checkpoint
            this.saveCheckpoint();

            // Rate limiting
            if (i + batchSize < totalScenes) {
                await this.sleep(2000);
            }
        }

        return this.generatedImages;
    }

    saveCheckpoint() {
        localStorage.setItem('panelArtistCheckpoint', JSON.stringify(this.generatedImages));
    }
}
window.PanelArtistAgent = PanelArtistAgent;
