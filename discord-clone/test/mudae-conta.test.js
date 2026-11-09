// Conta do Mudae: dia de Brasília, contadores que destravam poderes e o teto do divórcio.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, CLAIM_RESET_MS } = require('../server/mudae');
const { dayOf } = require('../server/mudae-conta');
const { DIVORCE_CAP, DIVORCE_CAP_MS } = require('../server/mudae-regras');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Satoru Fujinuma', 'Erased', 'b5-e.jpg', 'M', 500],
  [6, 'Eren Yeager', 'Attack on Titan', 'b6-f.jpg', 'M', 400],
  ['g1', 'Link', 'Zelda', 'https://images.igdb.com/1.jpg', 'M', 300, 'g'],
];

function setup({ pick = 0, catalog = CATALOG } = {}) {
  let t = 10 * CLAIM_RESET_MS + 1000; // começo de uma janela de claim
  const mudae = createMudae({ catalog, now: () => t, random: () => pick, refSize: catalog.length });
  const store = { claims: {}, usage: {} };
  const marry = (accountId, charId) => { t += CLAIM_RESET_MS; mudae.claim(store, accountId, charId, { revealAt: t }); };
  return { mudae, store, marry, advance: (ms) => { t += ms; }, now: () => t };
}

test('dayOf vira à meia-noite de Brasília', () => {
  assert.equal(dayOf(Date.UTC(2026, 10, 10, 2, 59)), dayOf(Date.UTC(2026, 10, 9, 12)));
  assert.equal(dayOf(Date.UTC(2026, 10, 10, 3, 0)), dayOf(Date.UTC(2026, 10, 9, 12)) + 1);
});

test('contadores: só casamento conta, presente e troca não, divórcio não desconta', () => {
  const { mudae, store, marry } = setup();
  marry('a', 1);
  assert.equal(mudae.stats(store, 'a').claims, 1);
  mudae.give(store, 'a', 'b', 'gojou');
  assert.equal(mudae.stats(store, 'b').claims, 0);
  assert.equal(mudae.stats(store, 'a').claims, 1);
  marry('a', 2);
  mudae.divorceId(store, 'a', 2);
  assert.equal(mudae.stats(store, 'a').claims, 2);
});

test('primeira leitura usa o harém de hoje como crédito', () => {
  const many = Array.from({ length: 300 }, (_, i) => [i + 1, `Pessoa ${i}`, 'Obra', `b${i}.png`, 'F', 1000 - i]);
  const { mudae, store } = setup({ catalog: many });
  assert.equal(mudae.card(1).rarity, 'legendary');
  assert.notEqual(mudae.card(150).rarity, 'legendary');
  for (const id of [1, 150, 200]) store.claims[id] = { ownerId: 'v', at: 1 };
  assert.deepEqual({ ...mudae.stats(store, 'v') }, { claims: 3, rolls: 0, crystals: 0, legendary: 1 });
  mudae.give(store, 'v', 'w', 'Pessoa 149');
  assert.equal(mudae.stats(store, 'v').claims, 3);
});

test('roll soma rolls', () => {
  const { mudae, store } = setup();
  mudae.roll(store, 'a', 'm');
  mudae.roll(store, 'a', 'm');
  assert.equal(mudae.stats(store, 'a').rolls, 2);
});

test('divórcio devolve até 500 de kakera por dia', () => {
  const { mudae, store, marry, advance } = setup();
  for (const id of [1, 2, 3, 4]) marry('a', id);
  assert.ok(mudae.card(1).value > DIVORCE_CAP, 'o teste precisa de cartas que passam do teto');
  const d1 = mudae.divorceId(store, 'a', 1);
  assert.equal(d1.refund, DIVORCE_CAP);
  assert.equal(d1.capped, true);
  const d2 = mudae.divorceId(store, 'a', 2);
  assert.equal(d2.refund, 0);
  assert.ok(d2.capped && d2.refundIn > 0 && d2.refundIn <= DIVORCE_CAP_MS);
  assert.equal(mudae.kakeraOf(store, 'a'), DIVORCE_CAP);
  advance(DIVORCE_CAP_MS);
  assert.equal(mudae.divorceId(store, 'a', 3).refund, DIVORCE_CAP);
});

test('divórcio com parte da cota usada devolve só o que falta', () => {
  const { mudae, store, marry, now } = setup();
  marry('a', 1);
  store.usage.a.refunds = [[now(), 300]];
  const d = mudae.divorceId(store, 'a', 1);
  assert.equal(d.refund, 200);
  assert.equal(d.capped, true);
});
