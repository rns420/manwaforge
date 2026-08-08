/**
 * EnallyAI — Free AI text generation wrapper
 * https://ai.enally.in/api.php
 */
class EnallyAPI {
  constructor() {
    this.name = 'EnallyAI';
    this.baseURL = 'https://ai.enally.in/api.php';
  }

  async generateText(systemPrompt, userPrompt) {
    const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}`;
    try {
      const res = await fetch(this.baseURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          system: systemPrompt,
          message: userPrompt
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (res.status === 429) {
        throw Object.assign(new Error('Enally rate limit'), { retryAfterMs: 30000 });
      }
      if (!res.ok) throw new Error(`Enally HTTP ${res.status}`);

      const raw = await res.text();
      let data = {};
      try { data = JSON.parse(raw); } catch (e) {}
      
      const text = data.response || data.text || data.content || data.message || data.result;
      if (!text) {
        if (raw && raw.length > 10 && !raw.includes('error')) return raw;
        throw new Error('Empty response from Enally');
      }
      return text;
    } catch (e) {
      if (e.retryAfterMs) throw e;
      throw new Error(`EnallyAI error: ${e.message}`);
    }
  }

  async isAvailable() {
    try {
      const res = await fetch(this.baseURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hello', message: 'test' }),
        signal: AbortSignal.timeout(8000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
window.EnallyAPI = new EnallyAPI();
