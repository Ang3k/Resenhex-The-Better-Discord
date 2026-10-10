const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { encode, Decoder } = require('./voice-protocol');
const { downloadModel, verifyFile } = require('./voice-download');
const catalog = require('./voice-catalog.json');
// Quanto as características do personagem (índice) entram na voz: 0 = sem índice, 1 = só o índice.
const DEFAULT_INDEX_RATE = 0.6;

const PERFORMANCE = { fast: { blockMs: 80, contextMs: 320 }, economy: { blockMs: 160, contextMs: 320 }, balanced: { blockMs: 120, contextMs: 480 }, quality: { blockMs: 160, contextMs: 640 } };
class VoiceEngine extends EventEmitter {
  constructor({ dataDir, resources, python, script, store, fetch: request, spawn: start = spawn, catalog: models = catalog }) {
    super();
    this.catalog = models; this.dataDir = dataDir; this.resources = resources; this.python = python; this.script = script;
    this.store = store; this.fetch = request; this.spawn = start;
    this.preferences = { model: '', backend: 'auto', performance: 'balanced', pitchShift: 0, indexRate: DEFAULT_INDEX_RATE, ...store.get('voiceAi') };
    if (!this.catalog.voices.some((v) => v.id === this.preferences.model)) this.preferences.model = '';
    if (!['auto', 'gpu', 'cpu'].includes(this.preferences.backend)) this.preferences.backend = 'auto';
    if (!PERFORMANCE[this.preferences.performance]) this.preferences.performance = 'balanced';
    this.preferences.pitchShift = Math.max(-12, Math.min(12, Number(this.preferences.pitchShift) || 0));
    this.preferences.indexRate = Number.isFinite(Number(this.preferences.indexRate)) ? Math.max(0, Math.min(1, Number(this.preferences.indexRate))) : DEFAULT_INDEX_RATE;
    this.state = 'idle'; this.error = ''; this.child = null; this.pending = new Map(); this.sequence = 0;
    this.download = null; this.progress = null; this.sessions = new Map(); this.generation = 0; this.loadedKey = ''; this.idleTimer = null;
  }
  file(spec) { return path.join(this.dataDir, 'models', spec.file); }
  components(voice) { return [this.catalog.components[voice.encoder || 'encoder'], this.catalog.components.pitch]; }
  // Arquivos do próprio personagem: o modelo e, quando houver, o índice de semelhança.
  ownFiles(voice) { return voice.index ? [voice, voice.index] : [voice]; }
  async snapshot() {
    const voices = await Promise.all(this.catalog.voices.map(async (voice) => {
      const { url, file, sha256, checkpoint, index, ...publicVoice } = voice;
      let installed = false;
      try {
        installed = (await Promise.all(this.ownFiles(voice).map(async (spec) => (await fs.promises.stat(this.file(spec))).size === spec.bytes))).every(Boolean);
      } catch {}
      return { ...publicVoice, hasIndex: !!index, installed };
    }));
    return { state: this.state, error: this.error, preferences: this.preferences, voices, progress: this.progress,
      available: !!this.python && fs.existsSync(this.python), backend: this.backend || null,
      componentsBytes: Object.values(this.catalog.components).reduce((n, c) => n + c.bytes, 0), ...PERFORMANCE[this.preferences.performance] };
  }
  changed() { this.emit('changed'); }
  save() { this.store.set('voiceAi', this.preferences); this.changed(); }
  busy() { if (this.download || this.loading) throw new Error('Aguarde o carregamento ou o download atual.'); }
  async install(id) {
    this.busy();
    const voice = this.catalog.voices.find((v) => v.id === id);
    if (!voice) throw new Error('Voz desconhecida.');
    const controller = this.download = new AbortController();
    this.state = 'downloading'; this.error = '';
    const specs = [...this.components(voice), ...this.ownFiles(voice)];
    const total = specs.reduce((n, s) => n + s.bytes, 0);
    let completed = 0, notified = 0;
    this.progress = { id, received: 0, total }; this.changed();
    try {
      for (const spec of specs) {
        const report = (received) => {
          this.progress = { id, received: completed + received, total };
          if (Date.now() - notified > 150 || received === spec.bytes) { notified = Date.now(); this.changed(); }
        };
        if (spec.bundled) {
          const source = path.join(this.resources, 'models', spec.file);
          if (!await verifyFile(source, spec)) throw new Error('Esta voz não está incluída no aplicativo; gere o instalador com os modelos de personagem.');
          controller.signal.throwIfAborted();
          await fs.promises.mkdir(path.dirname(this.file(spec)), { recursive: true });
          const temporary = this.file(spec) + '.partial';
          try {
            await fs.promises.copyFile(source, temporary);
            controller.signal.throwIfAborted();
            if (!await verifyFile(temporary, spec)) throw new Error('Integridade da voz inválida.');
            await fs.promises.rename(temporary, this.file(spec)); report(spec.bytes);
          } finally { await fs.promises.rm(temporary, { force: true }); }
        } else await downloadModel(spec, this.file(spec), { fetch: this.fetch, signal: controller.signal, progress: report });
        completed += spec.bytes;
      }
      this.state = this.loadedKey ? 'ready' : 'idle';
    } catch (error) {
      this.state = this.loadedKey ? 'ready' : 'idle';
      this.error = controller.signal.aborted ? 'Download cancelado.' : error.message;
      if (!controller.signal.aborted) throw error;
    } finally { this.download = null; this.progress = null; this.changed(); }
    return this.snapshot();
  }
  cancel() { this.download?.abort(); }
  async remove(id) {
    this.busy();
    const voice = this.catalog.voices.find((v) => v.id === id);
    if (!voice) throw new Error('Voz desconhecida.');
    if (this.preferences.model === id) {
      this.stop(); this.preferences.model = ''; this.save();
    }
    for (const spec of this.ownFiles(voice)) await fs.promises.rm(this.file(spec), { force: true });
    this.changed(); return this.snapshot();
  }
  async configure(values) {
    this.busy();
    clearTimeout(this.idleTimer);
    const next = { ...this.preferences };
    if (values.model !== undefined) {
      if (!this.catalog.voices.some((v) => v.id === values.model)) throw new Error('Voz desconhecida.');
      next.model = values.model;
      // Cada personagem já começa no tom que combina com ele; o ajuste manual continua valendo depois.
      if (values.pitchShift === undefined && values.model !== this.preferences.model) next.pitchShift = this.catalog.voices.find((v) => v.id === values.model).pitchShift || 0;
    }
    if (values.backend !== undefined) {
      if (!['auto', 'gpu', 'cpu'].includes(values.backend)) throw new Error('Aceleração inválida.');
      next.backend = values.backend;
    }
    if (values.performance !== undefined) {
      if (!PERFORMANCE[values.performance]) throw new Error('Qualidade inválida.');
      next.performance = values.performance;
    }
    if (values.indexRate !== undefined) {
      if (typeof values.indexRate !== 'number' || !(values.indexRate >= 0 && values.indexRate <= 1)) throw new Error('Semelhança inválida.');
      next.indexRate = Math.round(values.indexRate * 20) / 20;
    }
    if (values.pitchShift !== undefined) {
      if (!Number.isInteger(values.pitchShift) || Math.abs(values.pitchShift) > 12) throw new Error('Tom inválido.');
      next.pitchShift = values.pitchShift;
    }
    this.preferences = next; this.save();
    if (this.child || this.sessions.size) await this.load();
    if (this.child && !this.sessions.size) this.scheduleIdle();
    return this.snapshot();
  }
  start() {
    if (this.child) return;
    if (!this.python || !fs.existsSync(this.python)) throw new Error('O motor de voz não está incluído nesta instalação. Instale a versão Windows com Voz por IA.');
    const child = this.spawn(this.python, ['-I', '-u', this.script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1' } });
    this.child = child;
    const decoder = new Decoder((meta, pcm) => {
      const request = this.pending.get(meta.id);
      if (!request) return;
      this.pending.delete(meta.id); clearTimeout(request.timer);
      if (meta.error) request.reject(new Error(meta.error)); else request.resolve({ ...meta, pcm });
    });
    child.stdout.on('data', (chunk) => { try { decoder.push(chunk); } catch (error) { this.failed(error, child); } });
    // No PCM is written to logs. Keep only the last short diagnostic from the worker.
    let diagnostic = '';
    child.stderr.on('data', (chunk) => { diagnostic = (diagnostic + chunk.toString()).slice(-600); });
    child.on('error', (error) => this.failed(error, child));
    child.on('exit', () => this.failed(new Error(diagnostic || 'O motor de voz encerrou. Sua voz voltou ao normal.'), child));
  }
  failed(error, child = this.child) {
    if (child !== this.child || !child) return;
    this.stop(); this.state = 'error'; this.error = error.message.slice(0, 400); this.changed();
  }
  request(meta, pcm, timeout = 1500) {
    if (!this.child || this.pending.size >= 3) return Promise.reject(new Error('Motor de voz ocupado.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('O motor de voz demorou demais.')); this.failed(new Error('Conversão lenta; sua voz voltou ao normal.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.child.stdin.write(encode({ ...meta, id }, pcm)); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async load() {
    if (this.loading) return this.loading;
    this.loading = this.loadModel();
    try { return await this.loading; } finally { this.loading = null; }
  }
  async loadModel() {
    const voice = this.catalog.voices.find((v) => v.id === this.preferences.model);
    if (!voice) throw new Error('Baixe e escolha uma voz no catálogo.');
    const key = JSON.stringify(this.preferences);
    const graphKey = JSON.stringify([voice.id, this.preferences.backend]);
    if (this.child && this.loadedKey === key) return;
    this.state = 'loading'; this.error = ''; this.changed();
    try {
      // Pitch/profile updates reuse graphs already verified and loaded in memory.
      // Every new graph load and worker restart still verifies the complete files.
      if (!this.child || this.loadedGraphKey !== graphKey) {
        for (const spec of [...this.components(voice), ...this.ownFiles(voice)]) {
          if (!await verifyFile(this.file(spec), spec)) throw new Error('Modelo ausente ou danificado. Baixe a voz novamente.');
        }
      }
      this.start();
      const reply = await this.request({ op: 'load', encoder: this.file(this.catalog.components[voice.encoder || 'encoder']), pitch: this.file(this.catalog.components.pitch), voice: this.file(voice), sampleRate: voice.sampleRate,
        backend: this.preferences.backend, pitchShift: this.preferences.pitchShift,
        index: voice.index ? this.file(voice.index) : null, indexRate: this.preferences.indexRate, ...PERFORMANCE[this.preferences.performance] }, undefined, 120000);
      this.generation = reply.generation; this.backend = reply.backend; this.loadedKey = key; this.loadedGraphKey = graphKey;
      this.state = 'ready'; this.changed();
    } catch (error) { this.state = 'error'; this.error = error.message; this.changed(); throw error; }
  }
  async open() {
    clearTimeout(this.idleTimer);
    if (this.sessions.size >= 2) throw new Error('Feche outro teste de voz antes de continuar.');
    await this.load();
    clearTimeout(this.idleTimer);
    if (this.sessions.size >= 2) throw new Error('Feche outro teste de voz antes de continuar.');
    const id = require('node:crypto').randomUUID();
    this.sessions.set(id, { busy: false });
    return { stream: id, generation: this.generation, ...PERFORMANCE[this.preferences.performance], backend: this.backend };
  }
  async convert({ stream, epoch, pcm }) {
    const session = this.sessions.get(stream);
    const bytes = pcm instanceof ArrayBuffer ? Buffer.from(pcm) : ArrayBuffer.isView(pcm) ? Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength) : null;
    const expected = PERFORMANCE[this.preferences.performance].blockMs * 48 * 4;
    if (!session || session.busy || this.loading || !Number.isSafeInteger(epoch) || epoch < 0 || !bytes || bytes.length !== expected) throw new Error('Bloco de áudio indisponível.');
    session.busy = true;
    try {
      const reply = await this.request({ op: 'convert', stream, epoch, generation: this.generation }, bytes);
      const data = new Float32Array(reply.pcm.buffer.slice(reply.pcm.byteOffset, reply.pcm.byteOffset + reply.pcm.byteLength));
      if (data.length !== expected / 4 || !data.every(Number.isFinite)) throw new Error('Áudio convertido inválido.');
      return { pcm: data, inferenceMs: reply.inferenceMs, rtf: reply.rtf, generation: reply.generation, backend: reply.backend, silent: !!reply.silent };
    } finally { session.busy = false; if (!this.sessions.has(stream)) this.release(stream); }
  }
  release(id) { if (this.child && !this.loading) this.request({ op: 'release', stream: id }, undefined, 2000).catch(() => {}); }
  scheduleIdle() { clearTimeout(this.idleTimer); this.idleTimer = setTimeout(() => { if (!this.sessions.size) this.stop(); }, 15000); this.idleTimer.unref?.(); }
  close(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    if (!session.busy) this.release(id);
    if (!this.sessions.size) this.scheduleIdle();
  }
  stop() {
    clearTimeout(this.idleTimer);
    const child = this.child; this.child = null; this.loadedKey = ''; this.loadedGraphKey = ''; this.generation = 0;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Motor de voz encerrado.')); }
    this.pending.clear(); child?.kill(); this.state = 'idle'; this.changed();
  }
  destroy() { this.cancel(); this.sessions.clear(); this.stop(); }
}
module.exports = { VoiceEngine, PERFORMANCE };
