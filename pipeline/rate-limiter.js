class RateLimiter {
  constructor() {
    this.queues = {};
    this.limits = window.ManhwaConfig?.rateLimits || {};
    this.paused = {};
  }
  
  async throttle(apiName) {
    await this.waitForLimit(apiName);
    this.recordRequest(apiName);
  }
  
  recordRequest(apiName) {
    if (!this.queues[apiName]) this.queues[apiName] = [];
    this.queues[apiName].push(Date.now());
  }
  
  async waitForLimit(apiName) {
    if (this.isPaused(apiName)) {
      const waitTime = this.paused[apiName] - Date.now();
      if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime));
      this.paused[apiName] = 0; // unpause
    }

    const limit = this.limits[apiName];
    if (!limit) return; // no limit

    while (true) {
        const now = Date.now();
        if (!this.queues[apiName]) this.queues[apiName] = [];
        this.queues[apiName] = this.queues[apiName].filter(t => now - t < 60000); // keep last minute
        if (this.queues[apiName].length < limit) break;
        
        // Wait for the oldest request to expire
        const oldest = this.queues[apiName][0];
        const waitTime = 60000 - (now - oldest) + 100;
        await new Promise(r => setTimeout(r, Math.max(100, waitTime)));
    }
  }
  
  isPaused(apiName) {
    return this.paused[apiName] && this.paused[apiName] > Date.now();
  }
  
  pauseUntil(apiName, timestamp) {
    this.paused[apiName] = timestamp;
  }
  
  getStatus() {
    const status = {};
    const now = Date.now();
    for (const api of Object.keys(this.limits)) {
        if (!this.queues[api]) this.queues[api] = [];
        this.queues[api] = this.queues[api].filter(t => now - t < 60000);
        status[api] = {
            requestsLastMinute: this.queues[api].length,
            limit: this.limits[api],
            isPaused: this.isPaused(api),
            pauseRemaining: this.isPaused(api) ? this.paused[api] - now : 0
        };
    }
    return status;
  }
}
window.RateLimiter = new RateLimiter();
