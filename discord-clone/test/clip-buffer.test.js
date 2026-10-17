const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');

function loadRing() {
  const ctx = vm.createContext({ Int16Array, Float32Array, Math });
  vm.runInContext(read('clip-buffer-worklet.js'), ctx);
  return ctx.ClipRing;
}

// AudioContext falso: cada AudioWorkletNode tem um anel de verdade, alimentado pelo teste.
function harness({ maxPeople = 12, rate = 100 } = {}) {
  const ClipRing = loadRing();
  let clock = 0;
  const nodes = [];
  class AudioWorkletNode {
    constructor(_ctx, name) {
      assert.equal(name, 'clip-buffer');
      this.ring = new ClipRing(rate, 30);
      this.connected = true;
      this.messages = [];
      nodes.push(this);
      const node = this;
      this.port = {
        onmessage: null,
        postMessage(msg) {
          node.messages.push(msg.type);
          if (msg.type === 'clear') node.ring.clear();
          if (msg.type === 'snapshot') setTimeout(() => node.port.onmessage?.({ data: { type: 'snapshot', id: msg.id, ...node.ring.snapshot() } }), 0);
        },
      };
    }
    connect() { return this; }
    disconnect() { this.connected = false; }
  }
  const sources = [];
  const ctx = {
    sampleRate: rate,
    destination: {},
    audioWorklet: { addModule: async (url) => { assert.equal(url, '/clip-buffer-worklet.js'); } },
    createMediaStreamSource(stream) { const s = { stream, connect: (n) => n, disconnect() { s.off = true; } }; sources.push(s); return s; },
    createGain() { return { gain: { value: 1 }, connect: (n) => n, disconnect() {} }; },
  };
  const window = { AudioWorkletNode };
  const context = vm.createContext({ window, setTimeout, clearTimeout, Promise, Map, Set, Float32Array, Int16Array, Math });
  vm.runInContext(read('clip-buffer.js'), context);
  const buffer = window.ClipBuffer({ getCtx: () => ctx, now: () => clock, maxPeople });
  return { buffer, nodes, sources, advance: (ms) => { clock += ms; }, ClipRing };
}

const profile = (name) => ({ name, color: '#5865f2', avatarUrl: null, avatarCrop: null });

test('o anel guarda só os últimos 30 s em ordem', () => {
  const ClipRing = loadRing();
  const ring = new ClipRing(100, 30);
  const block = new Float32Array(3500).map((_, i) => (i % 1000) / 1000);
  ring.push(block);
  const { pcm, samples } = ring.snapshot();
  assert.equal(samples, 3000);
  assert.equal(pcm.length, 3000);
  assert.equal(pcm[0], Math.round(((500 % 1000) / 1000) * 32767));
  assert.equal(pcm[2999], Math.round(((3499 % 1000) / 1000) * 32767));
  ring.clear();
  assert.equal(ring.snapshot().samples, 0);
});

test('reconexão mantém o anel e saída guarda por 30 s', async () => {
  const h = harness();
  await h.buffer.track('a', { id: 's1' }, profile('Ana'));
  h.nodes[0].ring.push(new Float32Array(50).fill(0.5));
  await h.buffer.track('a', { id: 's2' }, profile('Ana'));
  assert.equal(h.nodes.length, 1, 'o mesmo nó continua');
  assert.equal(h.sources[0].off, true, 'o stream antigo foi desligado');
  let snap = await h.buffer.snapshot();
  assert.equal(snap.people.length, 1);
  assert.equal(snap.people[0].pcm.length, 50);
  assert.ok(Math.abs(snap.people[0].pcm[49] - 0.5) < 0.001);
  h.buffer.untrack('a');
  h.advance(29_000);
  snap = await h.buffer.snapshot();
  assert.equal(snap.people[0].accountId, 'a');
  assert.equal(snap.people[0].left, true);
  h.advance(2_000);
  snap = await h.buffer.snapshot();
  assert.equal(snap.people.length, 0);
});

test('quem desliga a opção é descartado na hora', async () => {
  const h = harness();
  await h.buffer.track('a', { id: 's1' }, profile('Ana'));
  await h.buffer.track('b', { id: 's2' }, profile('Bia'));
  h.buffer.sample(new Map([['a', { allowClips: false }], ['b', { allowClips: true }]]));
  assert.ok(h.nodes[0].messages.includes('clear'));
  assert.equal(h.nodes[0].connected, false);
  const snap = await h.buffer.snapshot();
  assert.deepEqual(Array.from(snap.people, (p) => p.accountId), ['b']);
  await h.buffer.track('a', { id: 's3' }, profile('Ana'));
  assert.deepEqual(Array.from((await h.buffer.snapshot()).people, (p) => p.accountId), ['b'], 'enquanto estiver desligada, não volta a gravar');
});

test('quem religa a opção volta a ser gravado sem precisar reconectar', async () => {
  const h = harness();
  await h.buffer.track('a', { id: 's1' }, profile('Ana'));
  h.buffer.sample(new Map([['a', { allowClips: false }]]));
  assert.equal((await h.buffer.snapshot()).people.length, 0);
  h.buffer.sample(new Map([['a', { allowClips: true }]]));
  await new Promise((r) => setTimeout(r, 0));
  const snap = await h.buffer.snapshot();
  assert.deepEqual(Array.from(snap.people, (p) => p.accountId), ['a']);
  assert.equal(snap.people[0].profile.name, 'Ana');
  assert.equal(h.sources.at(-1).stream.id, 's1', 'volta a ouvir o mesmo stream');
  assert.ok(h.nodes.at(-1).ring.snapshot().samples === 0, 'o anel recomeça vazio: o que foi dito desligado não volta');
  // Saiu da chamada enquanto estava desligada: religar não volta a gravar.
  await h.buffer.track('b', { id: 's2' }, profile('Bia'));
  h.buffer.sample(new Map([['b', { allowClips: false }]]));
  h.buffer.untrack('b');
  h.buffer.sample(new Map([['b', { allowClips: true }]]));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(Array.from((await h.buffer.snapshot()).people, (p) => p.accountId), ['a']);
});

test('acima do limite ficam as pessoas que falaram por último', async () => {
  const h = harness({ maxPeople: 2 });
  await h.buffer.track('a', { id: 's1' }, profile('Ana'));
  h.advance(100);
  await h.buffer.track('b', { id: 's2' }, profile('Bia'));
  h.advance(100);
  h.buffer.sample(new Map([['a', { speaking: true }], ['b', { speaking: false }]]));
  await h.buffer.track('c', { id: 's3' }, profile('Caio'));
  assert.deepEqual(Array.from((await h.buffer.snapshot()).people, (p) => p.accountId).sort(), ['a', 'c']);
});

test('a foto alinha todo mundo pelo fim e guarda o estado da chamada', async () => {
  const h = harness();
  await h.buffer.track('a', { id: 's1' }, profile('Ana'));
  h.nodes[0].ring.push(new Float32Array(300).fill(0.25));
  await h.buffer.track('b', { id: 's2' }, profile('Bia'));
  h.nodes[1].ring.push(new Float32Array(100).fill(0.5));
  h.buffer.sample(new Map([['a', { muted: true }], ['b', {}]]));
  const snap = await h.buffer.snapshot();
  assert.equal(snap.sampleRate, 100);
  assert.equal(snap.seconds, 3);
  const b = snap.people.find((p) => p.accountId === 'b');
  assert.equal(b.pcm.length, 300);
  assert.equal(b.offset, 200);
  assert.equal(b.pcm[199], 0);
  assert.ok(Math.abs(b.pcm[200] - 0.5) < 0.001);
  assert.equal(b.profile.name, 'Bia');
  assert.equal(snap.states.length, 1);
  assert.equal(snap.states[0].byAccount.get('a').muted, true);
});

test('recorded mede o áudio disponível e stop descarta tudo', async () => {
  const h = harness();
  assert.equal(h.buffer.recorded(), 0);
  await h.buffer.track('a', { id: 's1' }, profile('Ana'));
  h.advance(800);
  assert.ok(Math.abs(h.buffer.recorded() - 0.8) < 1e-9);
  h.advance(60_000);
  assert.equal(h.buffer.recorded(), 30);
  h.buffer.stop();
  assert.equal(h.buffer.recorded(), 0);
  assert.equal((await h.buffer.snapshot()).people.length, 0);
});
