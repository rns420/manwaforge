class OpenRouterAPI {
  constructor() { this.name = 'OpenRouterAPI'; this.baseURL = 'https://openrouter.ai/api/v1'; }
  get apiKey() { return window.ManhwaConfig?.keys?.openrouter || ''; }
  
  async chat(messages, options = {}) {
    return this.withRetry(async () => {
      if (!this.apiKey) throw new Error("OpenRouter API key not set.");
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'ManhwaForge'
        },
        body: JSON.stringify({
          model: options.model || window.ManhwaConfig?.models?.textOpenRouter || 'meta-llama/llama-3.3-70b-instruct:free',
          messages: messages,
          ...options
        })
      });
      if (response.status === 429) {
          throw { status: 429, message: 'Rate limited' };
      }
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.choices[0].message.content;
    });
  }

  async generateStory(systemPrompt, userPrompt) {
    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
  }

  async withRetry(fn, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        if (window.RateLimiter) await window.RateLimiter.throttle('openrouter');
        return await fn();
      } catch (error) {
        if (error.status === 429) {
          attempt++;
          if (attempt >= maxRetries) throw new Error("OpenRouter API rate limit exhausted after retries.");
          const delay = Math.pow(2, attempt) * 1000;
          if (window.RateLimiter) window.RateLimiter.pauseUntil('openrouter', Date.now() + delay);
          await new Promise(r => setTimeout(r, delay));
        } else {
            throw error;
        }
      }
    }
  }
}
window.OpenRouterAPI = new OpenRouterAPI();
