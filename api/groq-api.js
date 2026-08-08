class GroqAPI {
  constructor() { this.name = 'GroqAPI'; this.baseURL = 'https://api.groq.com/openai/v1'; }
  get apiKey() { return window.ManhwaConfig?.keys?.groq || ''; }
  
  async chat(messages, options = {}) {
    return this.withRetry(async () => {
      if (!this.apiKey) throw new Error("Groq API key not set.");
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: options.model || window.ManhwaConfig?.models?.textGroq || 'llama-3.3-70b-versatile',
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
  
  async isAvailable() {
    if (!this.apiKey) return false;
    try {
      await fetch(`${this.baseURL}/models`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return true;
    } catch {
      return false;
    }
  }
  
  async withRetry(fn, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        if (window.RateLimiter) await window.RateLimiter.throttle('groq');
        return await fn();
      } catch (error) {
        if (error.status === 429) {
          attempt++;
          if (attempt >= maxRetries) throw new Error("Groq API rate limit exhausted after retries.");
          const delay = Math.pow(2, attempt) * 1000;
          if (window.RateLimiter) window.RateLimiter.pauseUntil('groq', Date.now() + delay);
          await new Promise(r => setTimeout(r, delay));
        } else {
            throw error;
        }
      }
    }
  }
}
window.GroqAPI = new GroqAPI();
