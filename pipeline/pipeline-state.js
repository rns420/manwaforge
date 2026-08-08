class PipelineState {
  constructor() {
    this.state = this.load();
  }
  
  load() {
    const saved = localStorage.getItem('mf_pipeline_state');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error('Failed to parse pipeline state', e); }
    }
    return this.getDefaultState();
  }
  
  getDefaultState() {
    return {
      runId: null,
      startedAt: null,
      status: 'idle',
      currentAgent: null,
      completedSteps: [],
      data: {},
      errors: []
    };
  }

  save() {
    localStorage.setItem('mf_pipeline_state', JSON.stringify(this.state));
  }
  
  startRun() {
    this.state = this.getDefaultState();
    this.state.runId = this.generateRunId();
    this.state.startedAt = new Date().toISOString();
    this.state.status = 'running';
    this.save();
    return this.state.runId;
  }
  
  markStepComplete(stepName, data) {
    if (!this.state.completedSteps.includes(stepName)) {
      this.state.completedSteps.push(stepName);
    }
    if (data) this.state.data[stepName] = data;
    this.save();
  }
  
  markStepFailed(stepName, error) {
    this.state.errors.push({ step: stepName, error: error.toString(), time: new Date().toISOString() });
    this.state.status = 'error';
    this.save();
  }
  
  isStepComplete(stepName) {
    return this.state.completedSteps.includes(stepName);
  }
  
  getStepData(stepName) {
    return this.state.data[stepName] || null;
  }
  
  saveStepData(stepName, data) {
    this.markStepComplete(stepName, data);
  }
  
  setCurrentAgent(agentId) {
    this.state.currentAgent = agentId;
    this.save();
  }
  
  setStatus(status) {
    this.state.status = status;
    this.save();
  }
  
  reset() {
    this.state = this.getDefaultState();
    this.save();
  }
  
  getResumePoint() {
    const steps = ['init', 'scrape', 'generate_story', 'generate_panels', 'generate_audio', 'compile_video', 'upload'];
    for (const step of steps) {
      if (!this.isStepComplete(step)) return step;
    }
    return 'done';
  }
  
  generateRunId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
window.PipelineState = new PipelineState();
