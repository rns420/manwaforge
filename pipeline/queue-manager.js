class QueueManager {
  constructor() {
    this.queues = {};
    this.processors = {};
    this.running = {};
    this.concurrency = {};
    this.activeWorkers = {};
  }
  
  createQueue(name, processorFn, maxConcurrent = 1) {
    if (!this.queues[name]) this.queues[name] = [];
    this.processors[name] = processorFn;
    this.concurrency[name] = maxConcurrent;
    this.running[name] = true;
    this.activeWorkers[name] = 0;
  }
  
  enqueue(queueName, task) {
    return new Promise((resolve, reject) => {
      if (!this.queues[queueName]) this.queues[queueName] = [];
      this.queues[queueName].push({ task, resolve, reject });
      this.processQueue(queueName);
    });
  }
  
  pause(queueName) {
    this.running[queueName] = false;
  }
  
  resume(queueName) {
    this.running[queueName] = true;
    this.processQueue(queueName);
  }
  
  clear(queueName) {
    if (this.queues[queueName]) {
      for (const item of this.queues[queueName]) {
        item.reject(new Error('Queue cleared'));
      }
      this.queues[queueName] = [];
    }
  }
  
  getQueueLength(queueName) {
    return this.queues[queueName] ? this.queues[queueName].length : 0;
  }
  
  async processQueue(queueName) {
    if (!this.running[queueName] || !this.queues[queueName] || this.queues[queueName].length === 0) return;
    
    if (this.activeWorkers[queueName] >= this.concurrency[queueName]) return;
    
    this.activeWorkers[queueName]++;
    
    const item = this.queues[queueName].shift();
    if (item) {
        try {
            const result = await this.processors[queueName](item.task);
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        }
    }
    
    this.activeWorkers[queueName]--;
    
    // Process next
    if (this.queues[queueName].length > 0 && this.running[queueName]) {
        this.processQueue(queueName);
    }
  }
}
window.QueueManager = new QueueManager();
