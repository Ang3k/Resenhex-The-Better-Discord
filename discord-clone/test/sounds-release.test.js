// Sons fora da chamada: o contexto de áudio parado é fechado (libera os sons decodificados), mas nunca com
// som tocando, e o próximo som cria outro.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  let now = 0;
  const timers = [];
  class FakeContext {
    constructor() { this.state = 'running'; FakeContext.made.push(this); }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  FakeContext.made = [];
  const sandbox = {
    AudioContext: FakeContext,
    localStorage: { getItem: () => null, setItem() {} },
    performance: { now: () => now },
    setTimeout: (fn, ms) => timers.push({ at: now + ms, fn }),
    setInterval: () => 0, clearInterval() {},
    fetch: () => Promise.reject(new Error('sem rede')),
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'sounds.js'), 'utf8'), sandbox);
  const advance = (ms) => {
    now += ms;
    for (const t of timers.splice(0).sort((a, b) => a.at - b.at)) if (t.at <= now) t.fn(); else timers.push(t);
  };
  return { Sounds: sandbox.Sounds, made: FakeContext.made, FakeContext, advance };
}

test('release fecha o contexto dos sons só depois de 10 s sem tocar, e o próximo som cria outro', () => {
  const { Sounds, made, advance } = load();
  assert.equal(Sounds.release(), true, 'sem contexto, nada a fazer');
  Sounds.play('join');
  assert.equal(made.length, 1);
  advance(3000);
  assert.equal(Sounds.release(), false, 'tocou há pouco');
  assert.equal(made[0].state, 'running');
  advance(8000);
  assert.equal(Sounds.release(), true);
  assert.equal(made[0].state, 'closed');
  Sounds.play('leave');
  assert.equal(made.length, 2);
  assert.equal(made[1].state, 'running');
});

test('release não fecha com toque de chamada em repetição nem com a saída da chamada ligada', () => {
  const { Sounds, made, FakeContext, advance } = load();
  const stop = Sounds.loop('join', 2000);
  advance(20_000);
  assert.equal(Sounds.release(), false, 'toque em repetição');
  stop(); stop(); // parar duas vezes não desconta duas vezes
  assert.equal(Sounds.release(), true);
  const call = new FakeContext();
  Sounds.route(call, {});
  advance(20_000);
  assert.equal(Sounds.release(call), false, 'saída da chamada ligada');
  Sounds.route(null, null);
  assert.equal(Sounds.release(call), true, 'o app fecha o contexto da chamada');
  assert.equal(call.state, 'running', 'release(c) não fecha o contexto do app');
  assert.equal(made.filter((c) => c.state === 'running').length, 1);
});

test('route: o contexto próprio dos sons fecha 15 s depois de a chamada assumir', () => {
  const { Sounds, made, FakeContext, advance } = load();
  Sounds.play('join');
  const own = made[0];
  const call = new FakeContext();
  Sounds.route(call, {});
  advance(14_000);
  assert.equal(own.state, 'running', 'um som de até 8 s ainda pode estar tocando');
  advance(2000);
  assert.equal(own.state, 'closed');
  Sounds.route(call, {}); // o mesmo contexto de novo: nada a fechar
  advance(20_000);
  assert.equal(call.state, 'running');
});
