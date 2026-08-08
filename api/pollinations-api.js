class PollinationsAPI {
  constructor() { 
    this.name = 'PollinationsAPI';
    this.cache = new Map();
  }
  
  async generateText(systemPrompt, userPrompt, model = 'openai-large') {
    const cacheKey = `text_${model}_${systemPrompt}_${userPrompt}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    if (window.RateLimiter) await window.RateLimiter.throttle('pollinations');
    const prompt = encodeURIComponent(userPrompt);
    const system = encodeURIComponent(systemPrompt);
    const url = `https://text.pollinations.ai/${prompt}?model=${model}&system=${system}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Pollinations API text error! status: ${response.status}`);
    const text = await response.text();
    this.cache.set(cacheKey, text);
    return text;
  }
  
  async generateImage(prompt, options = {}) {
    const {
      model = 'flux',
      width = 800,
      height = 1200,
      nologo = true,
      enhance = true
    } = options;
    
    const cacheKey = `img_${model}_${prompt}_${width}_${height}_${nologo}_${enhance}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    if (window.RateLimiter) await window.RateLimiter.throttle('pollinations');
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${model}&width=${width}&height=${height}&nologo=${nologo}&enhance=${enhance}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Pollinations API image error! status: ${response.status}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        this.cache.set(cacheKey, blobUrl);
        return blobUrl;
    } catch(err) {
        return url;
    }
  }
}
window.PollinationsAPI = new PollinationsAPI();
