const { randomUUID } = require('node:crypto');

const MAX_AUDIO_APPS = 8;

function selectedAudioApps(choice, available) {
  const requested = Array.isArray(choice.apps) ? choice.apps : choice.app == null ? [] : [choice.app];
  const pids = [...new Set(requested)];
  if (Array.isArray(choice.apps) && !pids.length || pids.length > MAX_AUDIO_APPS || pids.some(pid => !Number.isInteger(pid) || pid <= 0 || !available.some(app => app.pid === pid))) {
    throw new Error('Aplicativo de áudio não autorizado.');
  }
  return pids;
}

// Cada captura extra pertence à escolha já confirmada no seletor. Uma autorização
// permite uma única captura, no mesmo frame, sem abrir outro seletor.
class AppAudioPlans {
  constructor({ now = Date.now, ttl = 30000 } = {}) {
    this.now = now;
    this.ttl = ttl;
    this.plans = new Map();
  }

  create(contents, frame, source, pids) {
    this.clear(contents);
    if (pids.length < 2) return null;
    const token = randomUUID();
    this.plans.set(token, { contents, frame, source, remaining: new Set(pids.slice(1)), armed: null, expires: this.now() + this.ttl });
    return token;
  }

  owned(contents, frame, token) {
    const plan = this.plans.get(token);
    if (!plan || plan.contents !== contents || plan.frame !== frame) throw new Error('Captura de áudio não autorizada.');
    if (plan.expires < this.now()) { this.plans.delete(token); throw new Error('A seleção de áudio expirou. Escolha os aplicativos novamente.'); }
    return plan;
  }

  prepare(contents, frame, token, pid) {
    const plan = this.owned(contents, frame, token);
    if (plan.armed !== null || !plan.remaining.has(pid)) throw new Error('Captura de áudio não autorizada.');
    plan.armed = pid;
  }

  consume(contents, frame) {
    for (const [token, plan] of this.plans) {
      if (plan.contents !== contents || plan.armed === null) continue;
      this.owned(contents, frame, token);
      const pid = plan.armed;
      plan.armed = null;
      plan.remaining.delete(pid);
      if (!plan.remaining.size) this.plans.delete(token);
      return { source: plan.source, pid };
    }
    return null;
  }

  release(contents, frame, token) {
    if (!this.plans.has(token)) return;
    this.owned(contents, frame, token);
    this.plans.delete(token);
  }

  clear(contents) {
    for (const [token, plan] of this.plans) if (plan.contents === contents) this.plans.delete(token);
  }
}

module.exports = { AppAudioPlans, selectedAudioApps, MAX_AUDIO_APPS };
