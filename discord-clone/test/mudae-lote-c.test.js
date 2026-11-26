// Lote C: kakera nos personagens com dono (cor, poder de reação, bônus e segundo cristal pela chave), likelist, starwish,
// desejo de obra, wishk, privacidade, ordem e o $daily empilhado.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, parse, CLAIM_RESET_MS, DAILY_MS } = require('../server/mudae');
const { createCrystals } = require('../server/mudae-cristal');
const { createCommands } = require('../server/mudae-comandos');
const { KEYS, CRYSTAL, LIKES, WISHES } = require('../server/mudae-regras');
const { powerView } = require('../server/mudae-conta');
const { parseFlags } = require('../server/mudae-flags');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Eren Yeager', 'Attack on Titan', 'b5-e.jpg', 'M', 500],
  [6, 'Levi Ackerman', 'Attack on Titan', 'b6-f.jpg', 'M', 400],
];

// ---------- cristal da carta ----------
// random com fila: o que acabar devolve 0.5.
function crystalSetup(values = []) {
  let t = Date.UTC(2026, 10, 25, 15);
  const queue = [...values];
  const random = () => (queue.length ? queue.shift() : 0.5);
  const crystals = createCrystals({ now: () => t, random });
  const store = { claims: {}, usage: {} };
  return { crystals, store, advance: (ms) => { t += ms; }, now: () => t };
}
// Cada spawn gasta 3 sorteios: se é arco-íris, a cor, e o desenho do voo.
const ROXO = 0.1;
const AZUL = 0.4;
const CIANO = 0.6;
const VERDE = 0.8;
const NOT_RAINBOW = 0.5;

test('cristal da carta: a chave prata (3) troca ciano e verde por laranja', () => {
  for (const [level, expectCian, expectGreen] of [[0, 'ciano', 'verde'], [2, 'ciano', 'verde'], [3, 'laranja', 'laranja'], [50, 'laranja', 'laranja']]) {
    const a = crystalSetup([NOT_RAINBOW, CIANO, 0.5]);
    assert.equal(a.crystals.spawnForCard('s', { card: { id: 1, level } })[0].colorKey, expectCian, `ciano no nível ${level}`);
    const b = crystalSetup([NOT_RAINBOW, VERDE, 0.5]);
    assert.equal(b.crystals.spawnForCard('s', { card: { id: 1, level } })[0].colorKey, expectGreen, `verde no nível ${level}`);
  }
  const roxo = crystalSetup([NOT_RAINBOW, ROXO, 0.5]);
  assert.equal(roxo.crystals.spawnForCard('s', { card: { id: 1, level: 100 } })[0].colorKey, 'roxo', 'as outras cores não mudam');
});

test('cristal da carta: o arco-íris tem valor sorteado e a cor do cristal errante não muda', () => {
  const a = crystalSetup([0.01, 0, 0.5]); // arco-íris, valor no mínimo
  const [c] = a.crystals.spawnForCard('s', { card: { id: 1, level: 0 } });
  assert.equal(c.colorKey, 'arcoiris');
  assert.equal(c.value, CRYSTAL.rainbow.min);
  const b = crystalSetup([0.01, 0.9999, 0.5]);
  assert.equal(b.crystals.spawnForCard('s', { card: { id: 1, level: 0 } })[0].value, CRYSTAL.rainbow.max);
  const drifter = crystalSetup([0.01, 0.5]); // o errante não sorteia arco-íris: 0.01 vira a cor roxa
  assert.equal(drifter.crystals.spawn('s', {}).colorKey, 'roxo');
  assert.equal(a.crystals.view(c).keys, undefined, 'sem chave, a vista não leva o campo');
  const keyed = crystalSetup([NOT_RAINBOW, AZUL, 0.5]);
  assert.equal(keyed.crystals.view(keyed.crystals.spawnForCard('s', { card: { id: 1, level: 7 } })[0]).keys, 7);
});

test('segundo cristal: 25% na chave 25, 50% na 100, 75% na 300 e 100% na 500', () => {
  const count = (level, roll) => {
    // 3 sorteios do 1º cristal, 1 da chance, 3 do 2º
    const s = crystalSetup([NOT_RAINBOW, ROXO, 0.5, roll, NOT_RAINBOW, ROXO, 0.5]);
    return s.crystals.spawnForCard('s', { card: { id: 1, level } }).length;
  };
  assert.equal(count(24, 0), 1, 'abaixo da 25 nunca vem segundo');
  assert.equal(count(25, 0.24), 2);
  assert.equal(count(25, 0.26), 1);
  assert.equal(count(100, 0.49), 2);
  assert.equal(count(100, 0.51), 1);
  assert.equal(count(300, 0.74), 2);
  assert.equal(count(300, 0.76), 1);
  assert.equal(count(500, 0.999), 2, 'na 500 é sempre');
  const s = crystalSetup([NOT_RAINBOW, ROXO, 0.5, 0, NOT_RAINBOW, ROXO, 0.5]);
  const [first, second] = s.crystals.spawnForCard('s', { card: { id: 1, level: 500 }, appearAt: s.now() });
  assert.ok(second.appearAt > first.appearAt, 'o segundo aparece logo depois do primeiro');
});

test('poder de reação: cada cristal da carta gasta, o roxo é de graça, metade com a chave 10 e volta com o tempo', () => {
  const s = crystalSetup([NOT_RAINBOW, AZUL, 0.5, NOT_RAINBOW, ROXO, 0.5, NOT_RAINBOW, AZUL, 0.5]);
  assert.equal(powerView(s.store, 'a', s.now()).value, CRYSTAL.power.max, 'começa cheio');
  const [azul] = s.crystals.spawnForCard('s', { card: { id: 1, level: 0 } });
  const [roxo] = s.crystals.spawnForCard('s', { card: { id: 1, level: 0 } });
  const [azul10] = s.crystals.spawnForCard('s', { card: { id: 1, level: KEYS.reaction.halfCostFrom } });
  const take = (c, who = 'a') => s.crystals.take(s.store, 's', c.id, who, { perks: {} });
  assert.ok(!take(azul).error);
  assert.equal(powerView(s.store, 'a', s.now()).value, CRYSTAL.power.max - CRYSTAL.power.cost.azul);
  assert.ok(!take(roxo).error);
  assert.equal(powerView(s.store, 'a', s.now()).value, CRYSTAL.power.max - CRYSTAL.power.cost.azul, 'o roxo não gasta');
  const before = powerView(s.store, 'a', s.now()).value;
  assert.ok(!take(azul10).error);
  assert.equal(before - powerView(s.store, 'a', s.now()).value, Math.ceil(CRYSTAL.power.cost.azul / 2), 'a chave 10 paga metade');

  const view = take(azul, 'b').power;
  assert.equal(view.max, CRYSTAL.power.max);
  assert.equal(view.value, CRYSTAL.power.max - CRYSTAL.power.cost.azul);
});

test('poder de reação: sem poder não pega, com o tempo volta, e o cristal errante nunca gasta', () => {
  const s = crystalSetup([NOT_RAINBOW, AZUL, 0.5, NOT_RAINBOW, AZUL, 0.5]);
  const [card] = s.crystals.spawnForCard('s', { card: { id: 1, level: 0 } });
  s.store.usage.a = { power: { value: 5, at: s.now() } };
  const refused = s.crystals.take(s.store, 's', card.id, 'a', { perks: {} });
  assert.match(refused.error, /Sem energia/);
  assert.equal(s.store.usage.a.crystalDay, undefined, 'recusar não gasta o teto do dia');
  assert.equal(s.crystals.take(s.store, 's', card.id, 'a', { perks: {} }).error.includes('já pegou'), false, 'e não marca como pego');
  s.advance(3600_000); // +50 de poder (o cristal de antes já sumiu: ele dura segundos)
  assert.equal(powerView(s.store, 'a', s.now()).value, 55);
  const [again] = s.crystals.spawnForCard('s', { card: { id: 1, level: 0 }, appearAt: s.now() });
  assert.ok(!s.crystals.take(s.store, 's', again.id, 'a', { perks: {} }).error);
  assert.equal(powerView(s.store, 'a', s.now()).value, 55 - CRYSTAL.power.cost.azul);
  // errante: mesmo sem poder nenhum, leva
  const drifter = s.crystals.spawn('s', {});
  s.store.usage.b = { power: { value: 0, at: s.now() } };
  assert.ok(!s.crystals.take(s.store, 's', drifter.id, 'b', { perks: {} }).error);
  assert.equal(s.store.usage.b.power.value, 0, 'o errante não mexe no poder');
});

test('bônus de chave: roxo, vermelho e arco-íris rendem +75%, +150% e +250% nas chaves 50, 200 e 400', () => {
  const amountAt = (level, color) => {
    const s = crystalSetup([NOT_RAINBOW, color, 0.5]);
    const [c] = s.crystals.spawnForCard('s', { card: { id: 1, level } });
    return s.crystals.take(s.store, 's', c.id, 'a', { perks: {} }).amount;
  };
  const roxo = CRYSTAL.colors.find((c) => c.key === 'roxo').value;
  assert.equal(amountAt(49, ROXO), roxo);
  assert.equal(amountAt(50, ROXO), Math.round(roxo * 1.75));
  assert.equal(amountAt(200, ROXO), Math.round(roxo * 2.5));
  assert.equal(amountAt(400, ROXO), Math.round(roxo * 3.5));
  assert.equal(amountAt(499, ROXO), Math.round(roxo * 3.5));
  const azul = CRYSTAL.colors.find((c) => c.key === 'azul').value;
  assert.equal(amountAt(400, AZUL), azul, 'o azul não ganha bônus');
  const vermelho = CRYSTAL.colors.find((c) => c.key === 'vermelho').value;
  assert.equal(amountAt(50, 0.995), Math.round(vermelho * 1.75), 'o vermelho ganha');
});

// ---------- desejos, likelist e daily ----------
function setup(n = 1) {
  let t = 10 * CLAIM_RESET_MS + 1000;
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random: () => 0, refSize: CATALOG.length });
  const store = { claims: {}, usage: {} };
  const marry = (id, who = 'a') => { t += CLAIM_RESET_MS; mudae.claim(store, who, id, { revealAt: t }); };
  return { mudae, store, marry, advance: (ms) => { t += ms; }, n };
}
const all = () => true;

test('parse: comandos de likelist e desejos', () => {
  for (const [text, cmd] of [['$like Gojo', 'like'], ['$ll', 'likelist'], ['$lr Gojo', 'likeremove'], ['$likepos Gojo $ 1', 'likepos'], ['$likeclear sim', 'likeclear'], ['$likedm 1', 'likedm'],
    ['$rll Meus', 'renamelikelist'], ['$sw Gojo', 'starwish'], ['$swr Gojo', 'starremove'], ['$starslot', 'starslot'], ['$wishk Gojo', 'wishk'], ['$wishseries Naruto', 'wishseries'], ['$ws', 'ws'],
    ['$wishdm 1', 'wishdm'], ['$wishsort', 'wishsort'], ['$wishpurge', 'wishpurge']]) {
    assert.equal(parse(text)?.cmd, cmd, text);
  }
});

test('likelist: curtir, repetir, mover, tirar, limpar e privacidade', () => {
  const { mudae, store } = setup();
  assert.equal(mudae.like(store, 'a', 'Gojo').total, 1);
  assert.match(mudae.like(store, 'a', 'Gojo').error, /já está/);
  assert.match(mudae.like(store, 'a', 'Naruto Uzumaki Inexistente Zzz').error, /Nenhum personagem/);
  for (const name of ['Mikasa', 'Zero', 'Kyubey']) mudae.like(store, 'a', name);
  assert.deepEqual(mudae.likeList(store, 'a').chars.map((c) => c.name), ['Satoru Gojou', 'Mikasa Ackerman', 'Zero Two', 'Kyubey']);
  assert.equal(mudae.likePos(store, 'a', 'Kyubey', 1).pos, 1);
  assert.equal(mudae.likeList(store, 'a').chars[0].name, 'Kyubey');
  assert.match(mudae.likePos(store, 'a', 'Zero', 9).error, /de 1 a 4/);
  assert.match(mudae.likePos(store, 'a', 'Naruto', 1).error, /Ninguém chamado/);
  assert.equal(mudae.unlike(store, 'a', 'Zero').total, 3);
  mudae.visual.rename(store, 'a', 'Meus favoritos', 'likeTitle');
  assert.equal(mudae.likeList(store, 'a').title, 'Meus favoritos');
  mudae.likeDm(store, 'a', true);
  assert.deepEqual([mudae.likeList(store, 'a', 'b').private, mudae.likeList(store, 'a', 'b').chars], [true, []], 'os outros não veem');
  assert.equal(mudae.likeList(store, 'a', 'a').chars.length, 3, 'a própria pessoa vê');
  mudae.likeDm(store, 'a', false);
  assert.equal(mudae.likeList(store, 'a', 'b').chars.length, 3);
  assert.equal(mudae.likeClear(store, 'a').count, 3);
  assert.equal(store.likes, undefined, 'sem curtidas, nada fica guardado');
  for (let i = 0; i < LIKES.max; i++) { (store.likes ||= {}).a = [...(store.likes.a || []), `x${i}`]; }
  assert.match(mudae.like(store, 'a', 'Gojo').error, /cheia/);
});

test('$daily empilha: com 5 curtidas guarda 2 usos a cada 20 h', () => {
  const { mudae, store, advance } = setup();
  const spend = () => { for (let i = 0; i < 10; i++) mudae.roll(store, 'a', 'm'); };
  assert.equal(mudae.status(store, 'a').dailyMax, 1);
  spend();
  assert.ok(!mudae.daily(store, 'a').error);
  spend();
  assert.match(mudae.daily(store, 'a').error, /volta em/, 'sem likelist, só 1 uso');
  advance(DAILY_MS);
  for (const name of ['Gojo', 'Mikasa', 'Zero', 'Kyubey']) mudae.like(store, 'a', name);
  assert.equal(mudae.status(store, 'a').dailyMax, 1, 'com 4 ainda não');
  mudae.like(store, 'a', 'Eren');
  assert.equal(mudae.status(store, 'a').dailyMax, 2);
  assert.equal(mudae.status(store, 'a').dailyCharges, 2);
  spend();
  assert.ok(!mudae.daily(store, 'a').error);
  assert.equal(mudae.status(store, 'a').dailyCharges, 1);
  spend();
  assert.ok(!mudae.daily(store, 'a').error, 'o 2º uso guardado');
  assert.equal(mudae.status(store, 'a').dailyCharges, 0);
  spend();
  assert.match(mudae.daily(store, 'a').error, /volta em/);
  assert.ok(mudae.status(store, 'a').dailyIn > 0 && mudae.status(store, 'a').dailyIn <= DAILY_MS);
  advance(DAILY_MS + 1);
  assert.equal(mudae.status(store, 'a').dailyCharges, 2, 'passadas 20 h, voltam os dois');
});

test('starwish: entra nos desejos, tem vaga limitada e a vaga extra custa vagas de desejo', () => {
  const { mudae, store, marry } = setup();
  const r = mudae.starWish(store, 'a', 'Gojo');
  assert.deepEqual([r.stars, r.starMax, r.total], [1, 1, 1]);
  assert.deepEqual(mudae.wishlist(store, 'a').stars, ['1']);
  assert.ok(mudae.wishlist(store, 'a').chars[0].star);
  assert.match(mudae.starWish(store, 'a', 'Gojo').error, /já é uma starwish/);
  const full = mudae.starWish(store, 'a', 'Mikasa');
  assert.match(full.error, /cheias \(1\)/);
  assert.match(full.error, /\*\*2\*\* vagas/);
  assert.equal(mudae.wishlist(store, 'a').total, 1, 'o desejo que não coube na estrela não entra');
  const max = mudae.status(store, 'a').wishMax;
  const slot = mudae.starSlot(store, 'a');
  assert.deepEqual([slot.cost, slot.starMax, slot.max], [2, 2, max - 2]);
  assert.equal(mudae.status(store, 'a').wishMax, max - 2);
  assert.ok(!mudae.starWish(store, 'a', 'Mikasa').error);
  assert.equal(mudae.starSlot(store, 'a').cost, 4, 'a 2ª vaga custa 4');
  assert.equal(mudae.unstar(store, 'a', 'Mikasa').stars, 1);
  assert.deepEqual(mudae.wishlist(store, 'a').chars.map((c) => c.name).sort(), ['Mikasa Ackerman', 'Satoru Gojou'], 'tirar a estrela não tira o desejo');
  assert.match(mudae.unstar(store, 'a', 'Mikasa').error, /Ninguém chamado/);
  marry(1);
  assert.equal(store.stars, undefined, 'casar com o personagem solta a estrela');
});

test('a vaga de starwish não aceita se faltam vagas de desejo', () => {
  const { mudae, store } = setup();
  store.starCost = { a: 100 };
  assert.match(mudae.starSlot(store, 'a').error, /Tire alguns/);
  assert.equal(store.starSlots, undefined);
});

test('wishk: não avisa e não aparece, mas paga quando OUTRA pessoa casa (com teto de 24 h)', () => {
  const { mudae, store, marry } = setup();
  assert.equal(mudae.wishK(store, 'b', 'Gojo').reward, WISHES.wishkReward);
  assert.match(mudae.wishK(store, 'b', 'Gojo').error, /já é um wishk/);
  assert.deepEqual(mudae.wishersOf(store, 1, all), [], 'não aparece em "desejado por"');
  assert.deepEqual(mudae.wishAlerts(store, 1, all), [], 'e não recebe aviso');
  assert.equal(mudae.wishlist(store, 'b').chars[0].quiet, true);
  for (const id of [2, 3, 4]) mudae.wishK(store, 'b', String(id === 2 ? 'Mikasa' : id === 3 ? 'Zero' : 'Kyubey'));
  marry(1);
  assert.equal(mudae.kakeraOf(store, 'b'), WISHES.wishkReward);
  assert.equal(mudae.kakeraOf(store, 'a'), 0, 'quem casou não ganha nada');
  marry(2);
  marry(3);
  marry(4);
  assert.equal(mudae.kakeraOf(store, 'b'), WISHES.wishkCap, 'o teto de 24 h corta o 4º pagamento');
  // quem casa com o próprio wishk não é pago
  const solo = setup();
  solo.mudae.wishK(solo.store, 'a', 'Gojo');
  solo.marry(1, 'a');
  assert.equal(solo.mudae.kakeraOf(solo.store, 'a'), 0);
});

test('desejo de obra: avisa por qualquer personagem, tem limite e sai com $wr', () => {
  const { mudae, store } = setup();
  assert.deepEqual(mudae.wishSeries(store, 'b', 'Attack on Titan'), { series: 'Attack on Titan', count: 1, max: 1 });
  assert.match(mudae.wishSeries(store, 'b', 'Attack on Titan').error, /já está/);
  assert.match(mudae.wishSeries(store, 'b', 'Madoka').error, /máximo/);
  assert.match(mudae.wishSeries(store, 'b', 'Obra Que Nao Existe Zzz').error, /Nenhuma obra/);
  for (const id of [2, 5, 6]) assert.deepEqual(mudae.wishAlerts(store, id, all), ['b'], 'Mikasa, Eren e Levi são de Attack on Titan');
  assert.deepEqual(mudae.wishAlerts(store, 1, all), [], 'outra obra não avisa');
  assert.deepEqual(mudae.wishersOf(store, 2, all), ['b']);
  assert.deepEqual(mudae.wishlist(store, 'b').series, ['Attack on Titan']);
  const r = mudae.unwish(store, 'b', 'Attack on Titan');
  assert.equal(r.removedSeries, true);
  assert.equal(store.wishSeries, undefined);
  assert.deepEqual(mudae.wishAlerts(store, 2, all), []);
});

test('$wishdm: lista privada some para os outros, mas o aviso continua chegando', () => {
  const { mudae, store } = setup();
  mudae.wish(store, 'b', 'Gojo');
  assert.deepEqual(mudae.wishersOf(store, 1, all), ['b']);
  mudae.wishDm(store, 'b', true);
  assert.deepEqual(mudae.wishersOf(store, 1, all), [], 'não aparece em "desejado por"');
  assert.deepEqual(mudae.wishAlerts(store, 1, all), ['b'], 'mas recebe o aviso');
  assert.deepEqual([mudae.wishlist(store, 'b', 'a').private, mudae.wishlist(store, 'b', 'a').chars], [true, []]);
  assert.equal(mudae.wishlist(store, 'b', 'b').chars.length, 1);
  assert.equal(mudae.info(store, 'Gojo', all).wishedBy.length, 0);
  assert.equal(mudae.wishDm(store, 'b', false).private, false);
  assert.deepEqual(mudae.wishersOf(store, 1, all), ['b']);
  assert.equal(store.prefs, undefined, 'voltar ao padrão não deixa lixo');
});

test('$wishsort e $wishpurge', () => {
  const { mudae, store, marry } = setup();
  for (const name of ['Zero', 'Mikasa', 'Gojo', 'Kyubey']) mudae.wish(store, 'b', name);
  assert.equal(mudae.wishSort(store, 'b').total, 4);
  assert.deepEqual(mudae.wishlist(store, 'b').chars.map((c) => c.name), ['Kyubey', 'Mikasa Ackerman', 'Satoru Gojou', 'Zero Two']);
  assert.match(mudae.wishSort(store, 'x').error, /pelo menos 2/);
  marry(1);
  marry(2);
  const r = mudae.wishPurge(store, 'b');
  assert.deepEqual([r.removed, r.total], [2, 2]);
  assert.equal(mudae.wishPurge(store, 'b').removed, 0);
});

// A tabela de comandos com um chat de mentira.
function table() {
  const s = setup();
  const posted = [];
  const cmds = createCommands({ mudae: s.mudae, forja: { shownOf: () => [] }, parseFlags, postMudae: (c, acc, command, data) => posted.push({ command, ...data }), save: () => {} });
  const run = (cmd, arg = '', extra = {}) => cmds[cmd]?.({ acc: { id: 'a' }, c: { id: 'canal' }, store: s.store, cmd, arg, rest: arg, target: null, command: '$' + cmd, only: (d) => ({ ephemeral: d }), error: (text) => ({ ephemeral: { kind: 'error', text } }), isMember: all, ...extra });
  return { ...s, run, posted };
}

test('tabela: $wish com vários nomes, e um nome só segue para o comando antigo', () => {
  const t = table();
  assert.equal(t.run('wish', 'Gojo'), undefined, 'um nome só: cai no comando de sempre');
  assert.equal(t.run('wish', ''), undefined);
  const r = t.run('wish', 'Gojo $ Mikasa $ Naruto Inexistente Zzz').ephemeral.text;
  assert.match(r, /\*\*2\*\* de 3 desejo/);
  assert.match(r, /Nenhum personagem encontrado/);
  assert.equal(t.mudae.wishlist(t.store, 'a').total, 2);
  assert.match(t.run('wish', 'Naruto Zzz $ Outro Zzz').ephemeral.text, /Nenhum personagem/);
});

test('tabela: likelist, starwish, wishk, obra e privacidade respondem', () => {
  const t = table();
  assert.match(t.run('like', '').ephemeral.text, /Diga o personagem/);
  assert.match(t.run('like', 'Gojo $ Mikasa').ephemeral.text, /Na likelist \(2\).*Faltam 3/);
  assert.match(t.run('like', 'Zero $ Kyubey $ Eren').ephemeral.text, /guarda 2 usos/);
  assert.deepEqual(t.run('likelist'), { ok: true });
  assert.equal(t.posted.at(-1).kind, 'likelist');
  assert.equal(t.posted.at(-1).total, 5);
  assert.match(t.run('likepos', 'Eren $ 1').ephemeral.text, /número \*\*1\*\*/);
  assert.match(t.run('likepos', 'Eren').ephemeral.text, /Diga o personagem e o lugar/);
  assert.match(t.run('likeremove', 'Eren').ephemeral.text, /saiu da likelist \(4\)/);
  assert.match(t.run('likeclear').ephemeral.text, /Para confirmar, digite \*\*\$likeclear sim\*\*/);
  assert.equal(t.store.likes.a.length, 4, 'sem o "sim", nada some');
  assert.match(t.run('likeclear', 'sim').ephemeral.text, /Likelist limpa \(4/);
  assert.match(t.run('likedm', '2').ephemeral.text, /Use \*\*\$likedm 1\*\*/);
  assert.match(t.run('likedm', '1').ephemeral.text, /privada/);
  assert.match(t.run('renamelikelist', '').ephemeral.text, /Diga o título/);
  assert.match(t.run('renamelikelist', 'Os meus').ephemeral.text, /Os meus/);

  assert.match(t.run('starwish', 'Gojo').ephemeral.text, /starwish \(1\/1\)/);
  assert.match(t.run('starwish', 'Mikasa').ephemeral.text, /cheias/);
  assert.match(t.run('starslot').ephemeral.text, /trocou \*\*2\*\* vagas/);
  assert.match(t.run('starwish', '').ephemeral.text, /Diga o personagem/);
  assert.match(t.run('starremove', 'Gojo').ephemeral.text, /deixou de ser starwish/);
  assert.match(t.run('wishk', 'Kyubey').ephemeral.text, new RegExp(`${WISHES.wishkReward}`));
  assert.match(t.run('wishseries', 'Attack on Titan').ephemeral.text, /1\/1 obras/);
  assert.match(t.run('wishseries', '').ephemeral.text, /Diga a obra/);
  assert.match(t.run('wishdm', '1').ephemeral.text, /privada/);
  assert.match(t.run('wishdm', 'x').ephemeral.text, /Use \*\*\$wishdm 1\*\*/);
  assert.match(t.run('wishsort').ephemeral.text, /ordem alfabética/);
  assert.match(t.run('wishpurge').ephemeral.text, /Nenhum dos seus desejos tem dono/);
});

test('status: poder de reação e $daily empilhado aparecem para a tela', () => {
  const { mudae, store } = setup();
  const s = mudae.status(store, 'a');
  assert.deepEqual(s.kakeraPower, { value: CRYSTAL.power.max, max: CRYSTAL.power.max, fullIn: 0 });
  assert.equal(s.dailyMax, 1);
  assert.equal(s.likes, 0);
});
