/**
 * AIMLAPI — Free AI API wrapper
 * https://aimlapi.com — free tier with multiple models
 * OpenAI-compatible endpoint
 */
class AIMLAPIAPI {
  constructor() {
    this.name = 'AIMLAPI';
    this.baseURL = 'https://api.aimlapi.com/v1/chat/completions';
  }

  get apiKey() {
    return localStorage.getItem('mf_aimlapi_key') || '';
  }

  async generateText(systemPrompt, userPrompt) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(this.baseURL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.8
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (res.status === 429) {
      throw Object.assign(new Error('AIMLAPI rate limit'), { retryAfterMs: 30000 });
    }
    if (!res.ok) throw new Error(`AIMLAPI HTTP ${res.status}`);

    const data = await res.json();
    if (!data.choices?.[0]?.message?.content) throw new Error('Empty AIMLAPI response');
    return data.choices[0].message.content;
  }

  async isAvailable() {
    try {
      const res = await fetch(this.baseURL.replace('/chat/completions', '/models'), {
        signal: AbortSignal.timeout(5000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
window.AIMLAPIAPI = new AIMLAPIAPI();
