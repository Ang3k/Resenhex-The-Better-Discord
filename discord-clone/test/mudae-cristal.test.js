// Cristal errante: nascimento, quem pegou, valor, teto do dia e fim.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCrystals } = require('../server/mudae-cristal');
const { createMudae } = require('../server/mudae');
const { dayOf } = require('../server/mudae-conta');
const { CRYSTAL } = require('../server/mudae-regras');

const CATALOG = [[1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900]];

function setup({ values = [] } = {}) {
  let t = Date.UTC(2026, 10, 9, 15);
  const queue = [...values];
  const random = () => (queue.length ? queue.shift() : 0.5);
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random: () => 0, refSize: 1 });
  const store = { claims: {}, usage: {} };
  const crystals = createCrystals({ now: () => t, random, countCrystal: mudae.countCrystal });
  return { crystals, store, mudae, advance: (ms) => { t += ms; }, now: () => t };
}

test('nasce entre 5 e 15 min com alguém no Salão, e não nasce sem ninguém', () => {
  const { crystals, advance } = setup();
  assert.deepEqual(crystals.tick([]), { spawned: [], ended: [] });
  advance(CRYSTAL.everyMaxMs * 2);
  assert.equal(crystals.tick([]).spawned.length, 0);
  // com gente: o primeiro tick só marca o horário (random 0.5 -> 10 min)
  assert.equal(crystals.tick(['s1']).spawned.length, 0);
  advance(CRYSTAL.everyMinMs - 1);
  assert.equal(crystals.tick(['s1']).spawned.length, 0);
  advance(CRYSTAL.everyMaxMs);
  const { spawned } = crystals.tick(['s1']);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].serverId, 's1');
  assert.equal(spawned[0].kind, 'drifter');
  // o Salão esvazia com 10 min faltando (random 0.5): na volta, a espera continua dali, não do zero
  crystals.tick([]);
  advance(CRYSTAL.everyMaxMs * 2);
  assert.equal(crystals.tick(['s1']).spawned.length, 0);
  advance(10 * 60_000 - 1);
  assert.equal(crystals.tick(['s1']).spawned.length, 0);
  advance(1);
  assert.equal(crystals.tick(['s1']).spawned.length, 1);
  // o horário nunca vai para o navegador
  assert.equal('nextAt' in crystals.view(spawned[0]), false);
});

test('todo mundo que clica a tempo ganha, uma vez cada', () => {
  const { crystals, store, mudae } = setup();
  const c = crystals.spawn('s1');
  const a = crystals.take(store, 's1', c.id, 'a');
  const b = crystals.take(store, 's1', c.id, 'b');
  assert.equal(a.amount, c.value);
  assert.equal(b.amount, c.value);
  assert.equal(a.full, true);
  assert.equal(a.next, null);
  assert.equal(mudae.kakeraOf(store, 'a'), c.value);
  assert.match(crystals.take(store, 's1', c.id, 'a').error, /já pegou/);
  assert.equal(mudae.kakeraOf(store, 'a'), c.value);
  assert.equal(mudae.stats(store, 'a').crystals, 1);
});

test('fora do tempo: antes de aparecer e depois de sumir', () => {
  const { crystals, store, advance } = setup();
  const early = crystals.spawn('s1', { appearAt: Date.UTC(2026, 10, 9, 15) + 1000 });
  assert.match(crystals.take(store, 's1', early.id, 'a').error, /ainda está chegando/);
  advance(1000 + early.life + CRYSTAL.graceMs);
  assert.ok(crystals.take(store, 's1', early.id, 'a').amount > 0); // ainda na folga
  advance(1);
  assert.match(crystals.take(store, 's1', early.id, 'b').error, /Tarde demais/);
});

test('teto do dia: os 15 primeiros valem inteiro, depois quase nada', () => {
  const { crystals, store, advance, now } = setup();
  for (let i = 0; i < CRYSTAL.dailyFull; i++) {
    const c = crystals.spawn('s1');
    assert.equal(crystals.take(store, 's1', c.id, 'a').amount, c.value);
  }
  const c16 = crystals.spawn('s1');
  const r = crystals.take(store, 's1', c16.id, 'a');
  assert.equal(r.amount, Math.max(1, Math.round(c16.value * CRYSTAL.afterCap)));
  assert.equal(r.full, false);
  assert.equal(store.usage.a.crystalDay[0], dayOf(now()));
  advance(24 * 60 * 60 * 1000);
  const next = crystals.spawn('s1');
  const r2 = crystals.take(store, 's1', next.id, 'a');
  assert.equal(r2.amount, next.value);
  assert.equal(r2.full, true);
});

test('Ouro aumenta só o que a pessoa ganha', () => {
  const { crystals, store } = setup();
  const c = crystals.spawn('s1');
  assert.equal(crystals.take(store, 's1', c.id, 'ouro', { perks: { crystalBonus: 0.3 } }).amount, Math.round(c.value * 1.3));
  assert.equal(crystals.take(store, 's1', c.id, 'comum', { perks: { crystalBonus: 0 } }).amount, c.value);
  assert.equal(crystals.take(store, 's1', c.id, 'sem').amount, c.value);
});

test('chuva do poder: cada gota vale menos que a da chuva que nasce sozinha', () => {
  const { crystals, store } = setup();
  const own = crystals.spawn('s1', { kind: 'storm' });
  const called = crystals.spawn('s1', { kind: 'storm', by: 'dono', called: true });
  assert.equal(crystals.take(store, 's1', own.id, 'a').amount, Math.max(1, Math.round(own.value * CRYSTAL.storm.valueFactor)));
  assert.equal(crystals.take(store, 's1', called.id, 'a').amount, Math.max(1, Math.round(called.value * CRYSTAL.storm.calledFactor)));
});

test('chuva: cada gota uma vez por pessoa, conta como 1 cristal e gasta 2 do teto', () => {
  const { crystals, store, mudae } = setup();
  const c = crystals.spawn('s1', { kind: 'storm', by: 'dono' });
  const each = Math.max(1, Math.round(c.value * CRYSTAL.storm.valueFactor));
  assert.equal(c.gems, CRYSTAL.storm.gems);
  for (let g = 0; g < 5; g++) assert.equal(crystals.take(store, 's1', c.id, 'a', { gem: g }).amount, each);
  assert.match(crystals.take(store, 's1', c.id, 'a', { gem: 2 }).error, /já pegou/);
  assert.equal(crystals.take(store, 's1', c.id, 'b', { gem: 2 }).amount, each);
  assert.ok(crystals.take(store, 's1', c.id, 'a', { gem: 99 }).error);
  assert.equal(mudae.stats(store, 'a').crystals, 1);
  assert.equal(store.usage.a.crystalDay[1], CRYSTAL.storm.capCost);
});

test('corrente: o próximo nasce se alguém pegar, e para no último', () => {
  const { crystals, store, advance, now } = setup();
  let c = crystals.spawn('s1', { kind: 'chain' });
  const colors = [];
  for (let step = 1; step <= CRYSTAL.chain.values.length; step++) {
    assert.equal(c.step, step);
    assert.equal(c.value, CRYSTAL.chain.values[step - 1]);
    colors.push(c.colorKey);
    const r = crystals.take(store, 's1', c.id, 'a');
    if (step < CRYSTAL.chain.values.length) {
      assert.equal(r.next.step, step + 1);
      assert.equal(r.next.appearAt, now() + CRYSTAL.chain.gapMs);
      // o segundo a pegar o mesmo degrau não cria outro
      assert.equal(crystals.take(store, 's1', c.id, 'b').next, null);
      advance(CRYSTAL.chain.gapMs);
      c = { id: r.next.id, ...r.next };
    } else {
      assert.equal(r.next, null);
    }
  }
  assert.deepEqual(colors, ['roxo', 'ciano', 'amarelo', 'laranja', 'vermelho']);
  // corrente que ninguém pegou não cria o próximo
  const lone = crystals.spawn('s1', { kind: 'chain' });
  advance(lone.life + CRYSTAL.graceMs + 1);
  assert.equal(crystals.tick([]).ended.some((e) => e.id === lone.id && e.takers.length === 0), true);
});

test('cristal que acabou sai da memória com quem pegou', () => {
  const { crystals, store, advance } = setup();
  const c = crystals.spawn('s1', { from: { channel: 'c1', msgId: 'm1' } });
  crystals.take(store, 's1', c.id, 'a');
  crystals.take(store, 's1', c.id, 'b');
  advance(c.life + CRYSTAL.graceMs);
  assert.equal(crystals.tick([]).ended.length, 0);
  advance(1);
  const { ended } = crystals.tick([]);
  assert.deepEqual(ended, [{ id: c.id, serverId: 's1', kind: 'drifter', colorKey: c.colorKey, color: c.color, from: { channel: 'c1', msgId: 'm1' },
    takers: [{ id: 'a', amount: c.value }, { id: 'b', amount: c.value }] }]);
  assert.match(crystals.take(store, 's1', c.id, 'c').error, /já sumiu/);
});

test('cristal desconhecido (servidor reiniciado) dá "já sumiu"', () => {
  const { crystals, store } = setup();
  assert.match(crystals.take(store, 's1', 'nao-existe', 'a').error, /já sumiu/);
  const c = crystals.spawn('s1');
  assert.match(crystals.take(store, 's2', c.id, 'a').error, /já sumiu/);
});
