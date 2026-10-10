const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { encode, Decoder, MAX_PACKET } = require('../desktop/lib/voice-protocol');
const { downloadModel, verifyFile } = require('../desktop/lib/voice-download');
const { VoiceEngine } = require('../desktop/lib/voice-engine');

function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-voice-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function spec(pcm, file = 'voice.onnx') { return { file, bytes: pcm.length, sha256: crypto.createHash('sha256').update(pcm).digest('hex'), url: 'https://models.test/' + file }; }
function response(bytes) { return { ok: true, status: 200, url: 'https://models.test/voice.onnx', body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) }; }

test('voice model download verifies hash and size, atomically installs and reuses existing files', async (t) => {
  const dir = temporary(t), bytes = Buffer.from('test model data'), model = spec(bytes), file = path.join(dir, model.file);
  let requests = 0;
  const request = async () => { requests++; return response(bytes); };
  await downloadModel(model, file, { fetch: request });
  assert.equal(await verifyFile(file, model), true);
  await downloadModel(model, file, { fetch: request });
  assert.equal(requests, 1); assert.equal(fs.existsSync(file + '.partial'), false);
});
test('download aceita a url vazia que o net.fetch do Electron devolve', async (t) => {
  const dir = temporary(t), bytes = Buffer.from('electron net'), model = spec(bytes), file = path.join(dir, model.file);
  await downloadModel(model, file, { fetch: async () => ({ ...response(bytes), url: '' }) });
  assert.equal(await verifyFile(file, model), true);
});
test('corrupt or oversized model downloads leave no usable model or partial file', async (t) => {
  const dir = temporary(t), model = spec(Buffer.from('good'));
  for (const bytes of [Buffer.from('evil'), Buffer.from('too large')]) {
    const file = path.join(dir, model.file);
    await assert.rejects(downloadModel(model, file, { fetch: async () => response(bytes) }));
    assert.equal(fs.existsSync(file), false); assert.equal(fs.existsSync(file + '.partial'), false);
  }
});
test('canceling a model download preserves an existing model and removes the partial file', async (t) => {
  const dir = temporary(t), file = path.join(dir, 'voice.onnx'), abort = new AbortController();
  fs.writeFileSync(file, 'old');
  const model = spec(Buffer.from('new valid model'));
  await assert.rejects(downloadModel(model, file, { signal: abort.signal, fetch: async () => {
    abort.abort(); return response(Buffer.from('new valid model'));
  } }));
  assert.equal(fs.readFileSync(file, 'utf8'), 'old'); assert.equal(fs.existsSync(file + '.partial'), false);
});
test('voice RPC handles fragmented packets, PCM alignment, malformed lengths and maximum sizes', () => {
  const received = [], decoder = new Decoder((meta, pcm) => received.push({ meta, pcm }));
  const pcm = Buffer.from(new Float32Array([.2, -.3]).buffer), packet = encode({ id: 1, op: 'convert' }, pcm);
  for (let i = 0; i < packet.length; i += 3) decoder.push(packet.subarray(i, i + 3));
  assert.deepEqual(received, [{ meta: { id: 1, op: 'convert' }, pcm }]);
  assert.throws(() => encode({}, Buffer.alloc(3)));
  assert.throws(() => encode({}, Buffer.alloc(MAX_PACKET)));
  const bad = Buffer.alloc(4); bad.writeUInt32LE(MAX_PACKET + 1);
  assert.throws(() => new Decoder(() => {}).push(bad));
  const malformed = Buffer.from(packet); malformed.writeUInt32LE(16385, 4);
  assert.throws(() => new Decoder(() => {}).push(malformed));
});
test('voice RPC preserves packet order and owns PCM across arbitrary boundaries and chunk reuse', () => {
  const packets = [encode({ id: 1 }), encode({ id: 2 }, Buffer.alloc(30720, 7)), encode({ id: 3 }, Buffer.alloc(15360, 9))];
  const wire = Buffer.concat(packets);
  for (const fragment of [1, 7, 256, wire.length]) {
    const replies = [], decoder = new Decoder((meta, pcm) => replies.push({ id: meta.id, pcm }));
    decoder.push(Buffer.alloc(0));
    for (let offset = 0; offset < wire.length; offset += fragment) {
      const chunk = Buffer.from(wire.subarray(offset, offset + fragment));
      decoder.push(chunk); chunk.fill(0);
    }
    assert.deepEqual(replies.map((r) => r.id), [1, 2, 3]);
    assert.equal(replies[0].pcm.length, 0);
    assert.deepEqual(replies[1].pcm, Buffer.alloc(30720, 7));
    assert.deepEqual(replies[2].pcm, Buffer.alloc(15360, 9));
  }
});

async function manager(t, options = {}) {
  const dir = temporary(t), bytes = Buffer.from('model'), model = { ...spec(bytes), id: 'test', name: 'Test', sampleRate: 40000 };
  const common = spec(Buffer.from('encoder'), 'encoder.onnx'), pitch = spec(Buffer.from('pitch'), 'pitch.onnx');
  fs.mkdirSync(path.join(dir, 'models'));
  for (const [entry, data] of [[model, bytes], [common, Buffer.from('encoder')], [pitch, Buffer.from('pitch')]]) fs.writeFileSync(path.join(dir, 'models', entry.file), data);
  let child, generation = 0, delay = false;
  const spawned = [], packets = [];
  const engine = new VoiceEngine({ dataDir: dir, python: process.execPath, script: 'engine.py', resources: dir,
    catalog: { voices: [model], components: { encoder: common, pitch } },
    store: { get: () => ({ model: 'test' }), set() {} },
    spawn: (python, args, settings) => {
      spawned.push({ python, args, settings });
      child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => child.emit('exit', 1);
      const decoder = new Decoder((meta, pcm) => {
        packets.push(meta);
        const reply = meta.op === 'load' ? { id: meta.id, generation: ++generation, backend: 'cpu' } : { id: meta.id, generation, backend: 'cpu', inferenceMs: 1, rtf: .01 };
        setTimeout(() => child.stdout.write(encode(reply, meta.op === 'convert' ? pcm : undefined)), delay ? 20 : 0);
      });
      child.stdin = new Writable({ write(chunk, _enc, done) { decoder.push(chunk); done(); } });
      return child;
    }, ...options });
  t.after(() => engine.destroy());
  return { engine, spawned, packets, get child() { return child; }, delay: () => { delay = true; } };
}
test('voice manager loads verified models in a hidden sidecar, bounds sessions and concurrent conversion', async (t) => {
  const m = await manager(t), stream = await m.engine.open();
  assert.equal(stream.generation, 1); assert.equal(m.spawned[0].settings.windowsHide, true);
  assert.deepEqual(m.spawned[0].settings.stdio, ['pipe', 'pipe', 'pipe']);
  const second = await m.engine.open(); await assert.rejects(m.engine.open(), /Feche outro/);
  m.delay(); const pcm = new Float32Array(5760).fill(.1);
  const conversion = m.engine.convert({ stream: stream.stream, epoch: 1, pcm });
  await assert.rejects(m.engine.convert({ stream: stream.stream, epoch: 1, pcm }), /indisponível/);
  assert.equal((await conversion).pcm.length, 5760);
  await assert.rejects(m.engine.convert({ stream: stream.stream, epoch: 1, pcm: new Float32Array(10) }));
  m.engine.close(second.stream); m.engine.close(stream.stream); assert.equal(m.engine.sessions.size, 0);
});
test('voice manager reports worker death, rejects pending work and can restart after failure', async (t) => {
  const m = await manager(t), stream = await m.engine.open(); m.delay();
  const pending = m.engine.convert({ stream: stream.stream, epoch: 1, pcm: new Float32Array(5760) });
  m.child.emit('exit', 1); await assert.rejects(pending, /encerrado/);
  assert.equal((await m.engine.snapshot()).state, 'error');
  m.engine.close(stream.stream); const next = await m.engine.open(); assert.equal(next.generation, 2); m.engine.close(next.stream);
});
test('simultaneous microphone opens cannot exceed the two-session limit while a model loads', async (t) => {
  const m = await manager(t); m.delay();
  const replies = await Promise.allSettled([m.engine.open(), m.engine.open(), m.engine.open()]);
  assert.equal(replies.filter((r) => r.status === 'fulfilled').length, 2);
  assert.equal(m.engine.sessions.size, 2);
});
test('closing an in-flight microphone releases its model history after conversion completes', async (t) => {
  const m = await manager(t), stream = await m.engine.open(); m.delay();
  const pending = m.engine.convert({ stream: stream.stream, epoch: 1, pcm: new Float32Array(5760) });
  m.engine.close(stream.stream); await pending;
  assert.equal(m.engine.sessions.size, 0);
  assert.ok(m.packets.some((p) => p.op === 'release' && p.stream === stream.stream));
});
test('voice manager rejects unknown catalog IDs, arbitrary backend/pitch values and damaged models', async (t) => {
  const m = await manager(t);
  await assert.rejects(m.engine.configure({ model: '../../bad' }));
  await assert.rejects(m.engine.configure({ backend: 'shell' }));
  await assert.rejects(m.engine.configure({ pitchShift: 13 }));
  fs.writeFileSync(path.join(m.engine.dataDir, 'models', 'voice.onnx'), 'evil!');
  await assert.rejects(m.engine.open(), /danificado/); assert.equal(m.spawned.length, 0);
});

test('settings reuse verified graphs already in memory but restarting rechecks files', async (t) => {
  const m = await manager(t), stream = await m.engine.open();
  fs.writeFileSync(path.join(m.engine.dataDir, 'models', 'voice.onnx'), 'evil!');
  await m.engine.configure({ pitchShift: 2 }); // the worker reuses its in-memory graph
  assert.equal(m.packets.filter((p) => p.op === 'load').length, 2);
  m.engine.close(stream.stream); m.engine.stop();
  await assert.rejects(m.engine.open(), /danificado/);
  assert.equal(m.spawned.length, 1);
});

test('economy profile keeps bounded context while using larger blocks and preserves the configured pitch', async (t) => {
  const m = await manager(t);
  await m.engine.configure({ performance: 'economy', pitchShift: -3 });
  const stream = await m.engine.open();
  assert.equal(stream.blockMs, 160); assert.equal(stream.contextMs, 320);
  const load = m.packets.find((p) => p.op === 'load');
  assert.equal(load.pitchShift, -3);
  await assert.rejects(m.engine.convert({ stream: stream.stream, epoch: 1, pcm: new Float32Array(3840) }), /indisponível/);
  assert.equal((await m.engine.convert({ stream: stream.stream, epoch: 1, pcm: new Float32Array(7680) })).pcm.length, 7680);
});

function processor(blockMs = 80) {
  const messages = [];
  const context = { Float32Array, Number, sampleRate: 48000, currentFrame: 0, registerProcessor(_name, cls) { this.Processor = cls; }, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (data) => messages.push(data) }; } } };
  context.registerProcessor = (_name, cls) => { context.Processor = cls; };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/voice-ai-worklet.js'), 'utf8'), context);
  const node = new context.Processor({ processorOptions: { blockMs } });
  const send = (data) => node.port.onmessage({ data });
  const tick = () => { const out = new Float32Array(128); node.process([[new Float32Array(128).fill(.2)]], [[out]]); context.currentFrame += 128; return out; };
  return { node, send, tick, context, messages };
}
test('AI worklet sends bounded blocks, silences mute and discards converted speech from an old PTT epoch', () => {
  const p = processor(); p.send({ type: 'mode', mode: 'active' }); p.send({ type: 'gate', blocked: false });
  for (let i = 0; i < 30; i++) p.tick();
  const captured = p.messages.find((m) => m.type === 'capture'); assert.equal(captured.pcm.length, 3840);
  p.send({ type: 'audio', ...captured, type: 'audio', pcm: new Float32Array(3840).fill(.8) });
  assert.ok(p.tick()[0] > .7);
  p.send({ type: 'gate', blocked: true }); assert.equal(p.tick().every((v) => v === 0), true); assert.equal(p.node.buffered, 0);
  p.send({ type: 'gate', blocked: false }); p.send({ ...captured, type: 'audio', pcm: new Float32Array(3840).fill(.8) });
  assert.equal(p.tick().every((v) => v === 0), true); assert.equal(p.node.buffered, 0);
});
test('AI worklet bounds playback queues and falls back to live mic without replaying queued speech', () => {
  const p = processor(); p.send({ type: 'mode', mode: 'active' }); p.send({ type: 'gate', blocked: false });
  for (let sequence = 0; sequence < 3; sequence++) p.send({ type: 'audio', epoch: p.node.epoch, sequence, captureFrame: 0, pcm: new Float32Array(3840).fill(.8) });
  assert.equal(p.node.buffered, 7680); assert.equal(p.messages.filter((m) => m.type === 'overrun').length, 1);
  p.send({ type: 'mode', mode: 'fallback' }); assert.equal(p.node.buffered, 0); assert.ok(Math.abs(p.tick()[0] - .2) < .001);
  p.send({ type: 'gate', blocked: true }); assert.equal(p.tick().every((v) => v === 0), true);
});
test('AI worklet rejects stale, duplicate, malformed and non-finite output and reconfigures block sizes', () => {
  const p = processor(); p.send({ type: 'mode', mode: 'active' }); p.send({ type: 'gate', blocked: false });
  p.context.currentFrame = 48000;
  p.send({ type: 'audio', epoch: p.node.epoch, sequence: 0, captureFrame: 0, pcm: new Float32Array(3840) }); assert.equal(p.node.buffered, 0);
  p.send({ type: 'audio', epoch: p.node.epoch, sequence: 1, captureFrame: 48000, pcm: new Float32Array(3840).fill(NaN) }); assert.equal(p.node.buffered, 0);
  p.send({ type: 'configure', blockMs: 120 }); assert.equal(p.node.blockSize, 5760); assert.equal(p.node.used, 0);
});

test('AI capture applies backpressure without queuing PCM and only accepts credits from its current epoch', () => {
  const p = processor(); p.send({ type: 'mode', mode: 'active' }); p.send({ type: 'gate', blocked: false });
  for (let i = 0; i < 90; i++) p.tick();
  const first = p.messages.find((m) => m.type === 'capture');
  assert.equal(p.messages.filter((m) => m.type === 'capture').length, 1);
  assert.equal(p.messages.filter((m) => m.type === 'skipped').length, 2);
  assert.equal(p.node.capture.length, 3840);
  p.send({ type: 'consumed', epoch: first.epoch - 1, sequence: first.sequence });
  for (let i = 0; i < 30; i++) p.tick();
  assert.equal(p.messages.filter((m) => m.type === 'capture').length, 1);
  p.send({ type: 'consumed', epoch: first.epoch, sequence: first.sequence });
  for (let i = 0; i < 30; i++) p.tick();
  assert.equal(p.messages.filter((m) => m.type === 'capture').length, 2);
  p.send({ type: 'gate', blocked: true }); p.send({ type: 'gate', blocked: false });
  for (let i = 0; i < 30; i++) p.tick();
  const next = p.messages.filter((m) => m.type === 'capture').at(-1);
  assert.equal(next.epoch, p.node.epoch);
  p.send({ type: 'consumed', epoch: first.epoch, sequence: next.sequence });
  assert.equal(p.node.inflight, next.sequence);
});

function playbackSimulation(delays) {
  const p = processor(), size = 3840, blocks = 20, output = [], supplied = [];
  p.send({ type: 'mode', mode: 'active' }); p.send({ type: 'gate', blocked: false });
  const arrivals = new Map();
  for (let sequence = 0; sequence < blocks; sequence++) {
    const pcm = Float32Array.from({ length: size }, (_, i) => .1 + sequence * .02 + i * .000001);
    supplied.push(...pcm);
    arrivals.set((sequence + 1) * 30 + delays[sequence % delays.length], { type: 'audio', epoch: p.node.epoch, sequence, captureFrame: sequence * size, pcm });
  }
  for (let tick = 0; tick < (blocks + 3) * 30; tick++) {
    if (arrivals.has(tick)) p.send(arrivals.get(tick));
    output.push(...p.tick());
  }
  const first = output.findIndex((v) => v !== 0), last = output.findLastIndex((v) => v !== 0);
  const gaps = output.slice(first, last + 1).filter((v) => v === 0).length;
  return { p, gaps, first, samples: output.filter((v) => v !== 0), supplied };
}
test('AI playback preserves every sample under delivery jitter and adds no startup buffer delay', () => {
  const stable = playbackSimulation([5]);
  assert.equal(stable.gaps, 0); assert.equal(stable.first, 35 * 128);
  assert.deepEqual(stable.samples, stable.supplied);
  const jittered = playbackSimulation([5, 12]); // alternate 13.3 and 32 ms after each block
  assert.deepEqual(jittered.samples, jittered.supplied);
  assert.equal(jittered.gaps, 896);
  assert.equal(jittered.first, stable.first);
  jittered.p.send({ type: 'gate', blocked: true });
  assert.equal(jittered.p.node.buffered, 0);
  assert.ok(jittered.p.tick().every((v) => v === 0));
});

test('escolher um personagem aplica o tom dele, e o ajuste manual continua valendo', async (t) => {
  const dir = temporary(t), saved = [];
  const voice = (id, pitchShift) => ({ ...spec(Buffer.from(id), id + '.onnx'), id, name: id, sampleRate: 40000, pitchShift });
  const engine = new VoiceEngine({ dataDir: dir, python: process.execPath, script: 'engine.py', resources: dir,
    catalog: { voices: [voice('braum', 0), voice('ahri', 12)], components: {} }, store: { get: () => ({}), set: (_k, v) => saved.push(v) } });
  await engine.configure({ model: 'ahri' });
  assert.equal(engine.preferences.pitchShift, 12);
  await engine.configure({ pitchShift: 9 });
  await engine.configure({ model: 'ahri' });
  assert.equal(engine.preferences.pitchShift, 9, 'reescolher a mesma voz não desfaz o ajuste');
  await engine.configure({ model: 'braum' });
  assert.equal(engine.preferences.pitchShift, 0);
});
