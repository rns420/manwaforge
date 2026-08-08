/**
 * APIFreeLLM — Free unlimited LLM API wrapper
 * https://apifreellm.com — OpenAI-compatible endpoint, no auth required
 */
class APIFreeLLMAPI {
  constructor() {
    this.name = 'APIFreeLLM';
    this.baseURL = 'https://apifreellm.com/v1/chat/completions';
  }

  async chat(messages, options = {}) {
    const res = await fetch(this.baseURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || 'gpt-4o-mini',
        messages: messages,
        max_tokens: options.max_tokens || 4000,
        temperature: options.temperature || 0.8
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '30') * 1000;
      throw Object.assign(new Error('Rate limit 429'), { retryAfterMs: retryAfter });
    }
    if (!res.ok) throw new Error(`APIFreeLLM HTTP ${res.status}`);

    const data = await res.json();
    if (!data.choices?.[0]?.message?.content) throw new Error('Empty response from APIFreeLLM');
    return data.choices[0].message.content;
  }

  async generateText(systemPrompt, userPrompt) {
    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
  }

  async isAvailable() {
    try {
      const res = await fetch(this.baseURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(10000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
window.APIFreeLLMAPI = new APIFreeLLMAPI();
