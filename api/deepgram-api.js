class DeepgramAPI {
  constructor() { this.name = 'DeepgramAPI'; }
  
  async generateSpeech(text, options = {}) {
    if (window.ManhwaConfig?.keys?.deepgram) {
      return this.useDeepgram(text, options.model || window.ManhwaConfig.models.ttsPrimary);
    }
    if (window.ManhwaConfig?.keys?.groq) {
      return this.useGroq(text, options.model || window.ManhwaConfig.models.ttsGroq);
    }
    return this.useFallback(text);
  }

  async useDeepgram(text, model = 'aura-asteria-en') {
    if (window.RateLimiter) await window.RateLimiter.throttle('deepgram');
    const apiKey = window.ManhwaConfig.keys.deepgram;
    const url = `https://api.deepgram.com/v1/speak?model=${model}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) throw new Error(`Deepgram TTS error! status: ${response.status}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  async useGroq(text, model = 'playai-tts') {
    if (window.RateLimiter) await window.RateLimiter.throttle('groq');
    const apiKey = window.ManhwaConfig.keys.groq;
    const url = `https://api.groq.com/openai/v1/audio/speech`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        input: text,
        voice: 'nova'
      })
    });
    
    if (!response.ok) throw new Error(`Groq TTS error! status: ${response.status}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  async useFallback(text) {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => {
         resolve('speech-synthesis-done');
      };
      utterance.onerror = (e) => reject(e);
      window.speechSynthesis.speak(utterance);
    });
  }
}
window.DeepgramAPI = new DeepgramAPI();
