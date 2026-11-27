// Contas de teste do Mudae: depois do refill, tudo que é limite volta a ficar livre.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, CLAIM_RESET_MS } = require('../server/mudae');
const { createTesters, TESTER_KAKERA } = require('../server/mudae-teste');
const { POWERS } = require('../server/mudae-regras');

const CATALOG = Array.from({ length: 40 }, (_, i) => [i + 1, `Pessoa ${i + 1}`, 'Obra', `b${i + 1}.png`, 'F', 1000 - i]);

test('MUDAE_TESTERS aceita nome ou id, sem diferenciar maiúsculas', () => {
  const t = createTesters(' Teste , abc123 ');
  assert.equal(t.enabled, true);
  assert.equal(t.isTester({ id: 'x', name: 'teste' }), true);
  assert.equal(t.isTester({ id: 'ABC123', name: 'outro' }), true);
  assert.equal(t.isTester({ id: 'y', name: 'outro' }), false);
  assert.equal(createTesters('').isTester({ id: 'x', name: 'teste' }), false);
});

test('a conta de teste roda, casa e pega o daily sem parar', () => {
  let now = 10 * CLAIM_RESET_MS + 1000;
  const mudae = createMudae({ catalog: CATALOG, now: () => now, refSize: CATALOG.length });
  const store = { claims: {}, usage: {} };
  const testers = createTesters('a');
  for (let i = 0; i < 30; i++) { // bem mais que os 10 rolls por meia hora
    testers.refill(store, 'a');
    const r = mudae.roll(store, 'a', 'w');
    assert.ok(!r.error, r.error);
    if (!store.claims[r.card.id]) { testers.refill(store, 'a'); mudae.claim(store, 'a', r.card.id, { revealAt: now }); }
    now += 4000;
  }
  for (let i = 0; i < 3; i++) { testers.refill(store, 'a'); const dk = mudae.dailyKakera(store, 'a'); assert.ok(!dk.error, dk.error); }
  testers.refill(store, 'a');
  assert.ok(Object.values(store.claims).filter((c) => c.ownerId === 'a').length >= 20);
  assert.ok(store.kakera.a >= TESTER_KAKERA);
  assert.deepEqual([...store.powers.a.unlocked].sort(), POWERS.map((p) => p.key).sort());
  for (const key of store.powers.a.slots) assert.equal(store.powers.a.readyAt[key], 0);
});
