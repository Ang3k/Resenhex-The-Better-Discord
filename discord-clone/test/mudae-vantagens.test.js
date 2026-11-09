// Vantagens das medalhas no jogo: rolls extras e guardados, mais desejos, $dk em dobro, reserva e o Rubi.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, ROLL_RESET_MS, CLAIM_RESET_MS, WISH_LIMIT } = require('../server/mudae');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Satoru Fujinuma', 'Erased', 'b5-e.jpg', 'M', 500],
  [6, 'Eren Yeager', 'Attack on Titan', 'b6-f.jpg', 'M', 400],
  ['g1', 'Link', 'Zelda', 'https://images.igdb.com/1.jpg', 'M', 300, 'g'],
  ['g2', 'Zelda', 'Zelda', 'https://images.igdb.com/2.jpg', 'F', 200, 'g'],
];

// medals: { medalha: nível } da conta "a".
function setup(medals = {}) {
  let t = 10 * CLAIM_RESET_MS + 1000;
  const state = { r: 0.5, calls: 0 };
  const random = () => { state.calls++; return state.r; };
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random, refSize: CATALOG.length });
  const store = { claims: {}, usage: {}, medals: { a: Object.fromEntries(Object.entries(medals).map(([m, level]) => [m, { level, finish: 'metal' }])) } };
  return { mudae, store, state, advance: (ms) => { t += ms; }, now: () => t };
}

test('Safira IV: 14 rolls por janela', () => {
  const { mudae, store } = setup({ safira: 4 });
  assert.equal(mudae.status(store, 'a').rollsMax, 14);
  for (let i = 0; i < 14; i++) assert.ok(!mudae.roll(store, 'a', 'm').error, `roll ${i + 1}`);
  assert.match(mudae.roll(store, 'a', 'm').error, /14 rolls/);
  assert.equal(mudae.status(store, 'a').rollsLeft, 0);
});

test('Prata II: guarda até 2 rolls para a janela seguinte, nunca mais', () => {
  const { mudae, store, advance } = setup({ prata: 2 });
  for (let i = 0; i < 7; i++) mudae.roll(store, 'a', 'm');
  advance(ROLL_RESET_MS);
  assert.equal(mudae.status(store, 'a').rollsMax, 12);
  assert.equal(mudae.status(store, 'a').rollsLeft, 12);
  for (let i = 0; i < 12; i++) assert.ok(!mudae.roll(store, 'a', 'm').error);
  assert.ok(mudae.roll(store, 'a', 'm').error);
  advance(2 * ROLL_RESET_MS); // pulou uma janela inteira: só a anterior conta, e a sobra dela era 10
  assert.equal(mudae.status(store, 'a').rollsMax, 12);
});

test('Prata II: sem sobra na janela anterior, nada é guardado', () => {
  const { mudae, store, advance } = setup({ prata: 2 });
  advance(ROLL_RESET_MS);
  for (let i = 0; i < 12; i++) mudae.roll(store, 'a', 'm'); // gasta tudo (10 + 2 guardados)
  advance(ROLL_RESET_MS);
  assert.equal(mudae.status(store, 'a').rollsMax, 10);
});

test('Prata: o $daily volta os rolls até o novo máximo', () => {
  const { mudae, store } = setup({ safira: 1, prata: 1 });
  for (let i = 0; i < 12; i++) mudae.roll(store, 'a', 'm');
  assert.equal(mudae.status(store, 'a').rollsLeft, 0);
  assert.deepEqual(mudae.daily(store, 'a'), { rollsLeft: 12 });
  assert.equal(mudae.status(store, 'a').rollsLeft, 12);
});

test('Bronze III: 13 desejos', () => {
  const { mudae, store } = setup({ bronze: 3 });
  assert.equal(mudae.status(store, 'a').wishMax, WISH_LIMIT + 3);
  store.wishes = { a: Array.from({ length: 12 }, (_, i) => 'x' + i) };
  assert.ok(!mudae.wish(store, 'a', 'Gojou').error, 'o 13º entra');
  assert.match(mudae.wish(store, 'a', 'Mikasa').error, /cheia \(13\)/);
});

test('Ouro IV: $dk vem em dobro', () => {
  const { mudae, store } = setup({ ouro: 4 });
  assert.equal(mudae.dailyKakera(store, 'a').amount, 500);
  const sem = setup({ ouro: 3 });
  assert.equal(sem.mudae.dailyKakera(sem.store, 'a').amount, 250);
});

test('Esmeralda I: um casamento de reserva a cada 24 h', () => {
  const { mudae, store, advance, now } = setup({ esmeralda: 1 });
  const t0 = { revealAt: now() };
  assert.equal(mudae.status(store, 'a').reserveReady, true);
  assert.equal(mudae.claim(store, 'a', 1, t0).reserve, false);
  assert.equal(mudae.claim(store, 'a', 2, t0).reserve, true);
  const s = mudae.status(store, 'a');
  assert.equal(s.reserveReady, false);
  assert.ok(s.reserveIn > 0);
  assert.throws(() => mudae.claim(store, 'a', 3, t0), /casar de novo/);
  advance(24 * 3600_000);
  assert.equal(mudae.status(store, 'a').reserveReady, true);
  assert.equal(mudae.claim(store, 'a', 3, { revealAt: now() }).reserve, false, 'a janela nova vale primeiro');
  assert.equal(mudae.claim(store, 'a', 4, { revealAt: now() }).reserve, true);
});

test('sem Esmeralda, não há reserva', () => {
  const { mudae, store, now } = setup();
  const s = mudae.status(store, 'a');
  assert.equal(s.reserveReady, false);
  assert.equal(s.reserveIn, 0);
  mudae.claim(store, 'a', 1, { revealAt: now() });
  assert.throws(() => mudae.claim(store, 'a', 2, { revealAt: now() }), /casar de novo/);
});

test('Rubi IV: 2% de chance de o roll trazer um desejo sem dono do comando usado', () => {
  const { mudae, store, state } = setup({ rubi: 4 });
  store.wishes = { a: ['g2', 3, 2] };
  store.claims[3] = { ownerId: 'b', at: 1 };
  state.r = 0.5; // acima de 2%: o mesmo sorteio de quem não tem medalha
  const normal = setup();
  assert.equal(mudae.roll(store, 'a', 'm').card.id, normal.mudae.roll(normal.store, 'a', 'm').card.id);
  state.r = 0.01; // abaixo: um desejo livre. $m aceita g2 e 2 (o 3 tem dono).
  const got = mudae.roll(store, 'a', 'm').card.id;
  assert.ok(got === 'g2' || got === 2, String(got));
  assert.equal(mudae.roll(store, 'a', 'wg').card.id, 'g2', '$wg só aceita a mulher de jogo; a Mikasa (anime) não entra');
  assert.equal(mudae.roll(store, 'a', 'hg').card.id, 'g1', '$hg: nenhum desejo cabe, segue o sorteio normal (só há um homem de jogo)');
});

test('Rubi: sem a medalha, o roll não gasta um random a mais', () => {
  const sem = setup();
  const com = setup({ rubi: 1 });
  sem.store.wishes = { a: [2] };
  com.store.wishes = { a: [2] };
  sem.mudae.roll(sem.store, 'a', 'm');
  com.mudae.roll(com.store, 'a', 'm');
  assert.equal(com.state.calls, sem.state.calls + 1);
});
