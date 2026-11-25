// Conquistas que precisam de dados novos (Sorte de principiante, Dedo no gatilho, Quase, Dia perfeito, Acabamento raro)
// e as coletivas ("Do servidor").
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, CLAIM_RESET_MS, DAILY_MS } = require('../server/mudae');
const { createConquistas, ALL } = require('../server/mudae-conquistas');
const { ACHIEVEMENTS: A, CRYSTAL } = require('../server/mudae-regras');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
];
const COUNTERS = [...new Set(ALL.map((a) => a.count))];
const ctx = (extra = {}) => ({ ...Object.fromEntries(COUNTERS.map((c) => [c, 0])), ...extra });

function setup({ start = Date.UTC(2026, 10, 25, 15) } = {}) {
  let t = start;
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random: () => 0, refSize: CATALOG.length });
  const conquistas = createConquistas({ now: () => t });
  const store = { claims: {}, usage: {} };
  const marry = (id, who = 'a') => { t += CLAIM_RESET_MS; mudae.claim(store, who, id, { revealAt: t }); };
  return { mudae, conquistas, store, marry, advance: (ms) => { t += ms; }, now: () => t };
}

test('catálogo: as 5 conquistas novas e as 3 coletivas existem, com contadores próprios', () => {
  for (const key of ['sorte:1', 'gatilho:1', 'acabamento:1', 'quase:1', 'diaperfeito:1', 'servidor:1', 'servidor:3']) assert.ok(ALL.find((a) => a.key === key), key);
  assert.deepEqual(ALL.filter((a) => a.hidden).map((a) => a.trail).sort(), ['diaperfeito', 'madrugada', 'quase', 'reencontro']);
  assert.deepEqual(ALL.filter((a) => a.server).map((a) => a.need), [100, 1000, 10000]);
  assert.equal(ALL.reduce((sum, a) => sum + a.kakera, 0), 11250);
});

test('Sorte de principiante: o 1º roll da janela volta marcado, o segundo não', () => {
  const s = setup();
  assert.equal(s.mudae.roll(s.store, 'a', 'm').firstRoll, true);
  assert.equal(s.mudae.roll(s.store, 'a', 'm').firstRoll, undefined);
  s.advance(CLAIM_RESET_MS);
  assert.equal(s.mudae.roll(s.store, 'a', 'm').firstRoll, true, 'a janela seguinte tem o seu primeiro');
  assert.equal(s.mudae.roll(s.store, 'b', 'm').firstRoll, true, 'cada pessoa tem o seu');
});

test('Dedo no gatilho: desejo casado em menos de 5 s do aparecimento da carta', () => {
  const s = setup();
  s.mudae.wish(s.store, 'a', 'Gojo');
  s.mudae.wish(s.store, 'a', 'Mikasa');
  s.advance(CLAIM_RESET_MS);
  s.mudae.claim(s.store, 'a', 1, { revealAt: s.now() - 4000 });
  assert.equal(s.store.stats.a.fastWish, 1, '4 s depois: rápido');
  s.advance(CLAIM_RESET_MS);
  s.mudae.claim(s.store, 'a', 2, { revealAt: s.now() - 6000 });
  assert.equal(s.store.stats.a.fastWish, 1, '6 s depois: devagar');
  assert.equal(s.store.stats.a.wishClaims, 2, 'os dois eram desejos');
  s.advance(CLAIM_RESET_MS);
  s.mudae.claim(s.store, 'a', 3, { revealAt: s.now() - 1000 });
  assert.equal(s.store.stats.a.fastWish, 1, 'rápido, mas não era desejo');
});

test('Quase: chegar menos de 1 s depois de quem casou conta; chegar depois não, e o dono não se conta', () => {
  const s = setup();
  s.marry(1, 'b');
  const attempt = (who) => { try { s.mudae.claim(s.store, who, 1, { revealAt: s.now() - 1000 }); } catch (e) { return e.message; } return null; };
  s.advance(500);
  assert.match(attempt('a'), /já tem dono/);
  assert.equal(s.store.stats.a.closeCall, 1, 'meio segundo depois: foi por pouco');
  s.advance(2000);
  assert.match(attempt('c'), /já tem dono/);
  assert.equal(s.store.stats.c?.closeCall, undefined, '2 s depois: não foi por pouco');
  s.advance(1);
  assert.match(attempt('b'), /já tem dono/);
  assert.equal(s.store.stats.b.closeCall, undefined, 'quem já é dono não perdeu nada');
});

test('Dia perfeito: 15 cristais inteiros, $dk e $daily no mesmo dia', () => {
  const s = setup();
  const spend = () => { for (let i = 0; i < 10; i++) s.mudae.roll(s.store, 'a', 'm'); };
  assert.equal(s.mudae.perfectDay(s.store, 'a'), false);
  s.mudae.dailyKakera(s.store, 'a');
  assert.equal(s.mudae.perfectDay(s.store, 'a'), false, 'só o $dk');
  spend();
  s.mudae.daily(s.store, 'a');
  assert.equal(s.mudae.perfectDay(s.store, 'a'), false, 'falta os cristais');
  const today = Math.floor((s.now() - 3 * 3600_000) / 86_400_000);
  s.store.usage.a.crystalDay = [today, CRYSTAL.dailyFull - 1];
  assert.equal(s.mudae.perfectDay(s.store, 'a'), false, '14 cristais ainda não');
  s.store.usage.a.crystalDay = [today, CRYSTAL.dailyFull];
  assert.equal(s.mudae.perfectDay(s.store, 'a'), true, 'os três no mesmo dia');
  s.advance(DAILY_MS);
  assert.equal(s.mudae.perfectDay(s.store, 'a'), false, 'no dia seguinte começa de novo');
});

test('Acabamento raro e as outras novas abrem pela tabela de conquistas', () => {
  const s = setup();
  s.conquistas.refresh(s.store, 'a', ctx());
  const r = s.conquistas.refresh(s.store, 'a', ctx({ finishRare: 1, firstRollClaims: 10, fastWish: 1, closeCall: 1, perfectDay: 1 }));
  assert.deepEqual(r.fresh.map((f) => f.key).sort(), ['acabamento:1', 'diaperfeito:1', 'gatilho:1', 'quase:1', 'sorte:1', 'sorte:2']);
  assert.equal(r.fresh.find((f) => f.key === 'quase:1').hidden, true);
});

// ---------- do servidor ----------
test('Do servidor: na meta, guarda quem jogou no último mês e cada um abre a sua, uma vez', () => {
  const s = setup();
  const base = ctx({ serverClaims: 99 });
  s.conquistas.refresh(s.store, 'a', base);
  s.conquistas.refresh(s.store, 'b', base);
  s.conquistas.refresh(s.store, 'c', base);
  const goal = (extra = {}) => ctx({ serverClaims: 100, activeMembers: () => ['a', 'b'], ...extra });
  const first = s.conquistas.refresh(s.store, 'a', goal());
  assert.deepEqual(first.serverEvents.map((e) => e.key), ['servidor:1'], 'o aviso do servidor sai uma vez, na hora da meta');
  assert.deepEqual(first.fresh.map((f) => [f.key, f.server, f.kakera]), [['servidor:1', true, A.serverTrail[6][0]]]);
  assert.equal(s.store.achievements._server.goals['servidor:1'].members.join(), 'a,b');
  assert.equal(s.mudae.kakeraOf(s.store, 'a'), A.serverTrail[6][0]);

  const second = s.conquistas.refresh(s.store, 'b', goal());
  assert.deepEqual(second.serverEvents, [], 'sem um segundo aviso do servidor');
  assert.deepEqual(second.fresh.map((f) => f.key), ['servidor:1'], 'cada membro abre a sua');
  const outsider = s.conquistas.refresh(s.store, 'c', goal());
  assert.deepEqual(outsider.fresh, [], 'quem não jogava no último mês não ganha');
  assert.equal(s.conquistas.refresh(s.store, 'a', goal()).fresh.length, 0, 'não abre de novo');
  assert.equal(s.mudae.kakeraOf(s.store, 'a'), A.serverTrail[6][0], 'e não paga de novo');
});

test('Do servidor: a lista de membros é a de quando a meta foi alcançada, e metas maiores vêm depois', () => {
  const s = setup();
  s.conquistas.refresh(s.store, 'a', ctx());
  s.conquistas.refresh(s.store, 'a', ctx({ serverClaims: 100, activeMembers: () => ['a'] }));
  s.conquistas.refresh(s.store, 'z', ctx({ serverClaims: 100, activeMembers: () => ['a', 'z'] }));
  assert.equal(s.store.achievements.z.done['servidor:1'], undefined, 'quem chegou depois da meta não entra na lista dela');
  const big = s.conquistas.refresh(s.store, 'a', ctx({ serverClaims: 1000, activeMembers: () => ['a', 'z'] }));
  assert.deepEqual(big.serverEvents.map((e) => e.key), ['servidor:2']);
  assert.equal(s.store.achievements.a.done['servidor:2'] > 0, true);
  const huge = s.conquistas.refresh(s.store, 'z', ctx({ serverClaims: 10000, activeMembers: () => ['z'] }));
  assert.deepEqual(huge.serverEvents.map((e) => e.key), ['servidor:3']);
  assert.deepEqual(Object.keys(s.store.achievements.z.done).sort(), ['servidor:2', 'servidor:3'], 'z entrou nas metas seguintes (servidor:2 já tinha a lista com ele)');
});

test('Do servidor: na primeira avaliação o histórico é silencioso e a aba explica por que não abriu', () => {
  const s = setup();
  const r = s.conquistas.refresh(s.store, 'a', ctx({ serverClaims: 150, activeMembers: () => ['a'] }));
  assert.deepEqual([r.first, r.fresh.length, s.mudae.kakeraOf(s.store, 'a')], [true, 0, 0], 'meta antiga: abre sem aviso e sem kakera');
  assert.ok(s.store.achievements.a.done['servidor:1']);
  s.conquistas.refresh(s.store, 'b', ctx({ serverClaims: 150, activeMembers: () => ['a'] }));
  const view = s.conquistas.view(s.store, 'b', ctx({ serverClaims: 150 }));
  const item = view.items.find((i) => i.trail === 'servidor');
  assert.equal(item.server, true);
  assert.equal(item.cat, 'servidor');
  assert.match(item.hint, /não estava jogando nos últimos 30 dias/);
  assert.equal(view.items.find((i) => i.trail === 'servidor').pct, 100, '150 de 100');
  const mine = s.conquistas.view(s.store, 'a', ctx({ serverClaims: 150 })).items.find((i) => i.trail === 'servidor');
  assert.deepEqual([mine.done, mine.hint], [[true, false, false], null]);
  assert.equal(view.categories.servidor, 'Do servidor');
});
