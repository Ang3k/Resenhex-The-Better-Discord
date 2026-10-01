const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, parse, valueOf, rarityOf, normalize, ROLL_RESET_MS, CLAIM_RESET_MS, CLAIM_WINDOW_MS, SPIN_MS, PRIORITY_MS } = require('../mudae');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Satoru Fujinuma', 'Erased', 'b5-e.jpg', 'M', 500],
];

function setup({ pick = 0 } = {}) {
  let t = 10 * CLAIM_RESET_MS + 1000; // começo de uma janela de claim
  // refSize = tamanho do catálogo: as posições valem como num catálogo de 15 mil (o 1º é lendário).
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random: () => pick, refSize: CATALOG.length });
  const store = { claims: {}, usage: {} };
  return { mudae, store, advance: (ms) => { t += ms; }, now: () => t, setPick: (p) => { pick = p; } };
}

test('parse: só comandos do Mudae, com apelidos e argumento', () => {
  assert.deepEqual(parse('$w'), { cmd: 'w', arg: '' });
  assert.deepEqual(parse('  $WAIFU  '), { cmd: 'w', arg: '' });
  assert.deepEqual(parse('$mm <@abc>'), { cmd: 'mm', arg: '<@abc>' });
  assert.deepEqual(parse('$im zero two'), { cmd: 'im', arg: 'zero two' });
  assert.equal(parse('$wx'), null);
  assert.equal(parse('custa $w'), null);
  assert.equal(parse('w'), null);
});

test('valor cai com a posição e nunca fica abaixo de 30', () => {
  assert.equal(valueOf(0), 1200);
  assert.ok(valueOf(10) > valueOf(100));
  assert.ok(valueOf(14_999) >= 30);
  assert.equal(normalize('Zérö  Two!'), 'zero two');
});

test('roll: filtra por gênero e devolve o card com foto do AniList', () => {
  const { mudae, store } = setup({ pick: 0.99 });
  assert.equal(mudae.roll(store, 'a', 'w').card.name, 'Zero Two');
  assert.equal(mudae.roll(store, 'a', 'h').card.name, 'Satoru Fujinuma');
  const any = mudae.roll(store, 'a', 'm');
  assert.equal(any.card.name, 'Satoru Fujinuma');
  assert.equal(any.card.image, 'https://s4.anilist.co/file/anilistcdn/character/large/b5-e.jpg');
  assert.equal(any.card.rank, 5);
  assert.equal(any.ownerId, null);

  const onlyMen = createMudae({ catalog: [CATALOG[0]], random: () => 0, refSize: 1 });
  assert.equal(onlyMen.roll({ claims: {}, usage: {} }, 'a', 'w').card.name, 'Satoru Gojou', 'sem ninguém do gênero, roda qualquer um');
});

test('roll: 10 por hora, e voltam na hora cheia', () => {
  const { mudae, store, advance, now } = setup();
  for (let i = 9; i >= 0; i--) assert.equal(mudae.roll(store, 'a', 'm').rollsLeft, i);
  assert.match(mudae.roll(store, 'a', 'm').error, /10 rolls por hora/);
  assert.equal(mudae.roll(store, 'b', 'm').rollsLeft, 9, 'cada pessoa tem os seus');
  advance(ROLL_RESET_MS - (now() % ROLL_RESET_MS));
  assert.equal(mudae.roll(store, 'a', 'm').rollsLeft, 9);
});

test('claim: o primeiro leva, um por janela de 3h, e só dentro dos 45s', () => {
  const { mudae, store, advance, now } = setup();
  const rolledAt = now();
  mudae.claim(store, 'a', 1, { revealAt: rolledAt });
  assert.equal(store.claims[1].ownerId, 'a');
  assert.throws(() => mudae.claim(store, 'b', 1, { revealAt: rolledAt }), /já tem dono/);
  assert.throws(() => mudae.claim(store, 'a', 2, { revealAt: rolledAt }), /Você já casou/);
  assert.equal(mudae.roll(store, 'b', 'm').ownerId, 'a', 'o roll mostra o dono');

  advance(CLAIM_WINDOW_MS + 1);
  assert.throws(() => mudae.claim(store, 'b', 2, { revealAt: rolledAt }), /Tarde demais/);

  advance(CLAIM_RESET_MS - (now() % CLAIM_RESET_MS));
  assert.equal(mudae.status(store, 'a').claimReady, true);
  mudae.claim(store, 'a', 2, { revealAt: now() });
  assert.throws(() => mudae.claim(store, 'a', 99, { revealAt: now() }), /desconhecido/);
});

test('harem, $im e divórcio', () => {
  const { mudae, store, advance, now } = setup();
  mudae.claim(store, 'a', 3, { revealAt: now() });
  advance(CLAIM_RESET_MS);
  mudae.claim(store, 'a', 1, { revealAt: now() });
  const harem = mudae.harem(store, 'a');
  assert.deepEqual(harem.chars.map((c) => c.name), ['Satoru Gojou', 'Zero Two'], 'o mais valioso primeiro');
  assert.equal(harem.total, 2);
  assert.equal(harem.value, valueOf(0) + valueOf(2));
  assert.equal(mudae.harem(store, 'b').total, 0);

  assert.equal(mudae.info(store, 'satoru').card.name, 'Satoru Gojou', 'empate fica com o mais popular');
  assert.equal(mudae.info(store, 'fujinuma').card.name, 'Satoru Fujinuma');
  assert.equal(mudae.info(store, 'zero two').ownerId, 'a');
  assert.equal(mudae.info(store, 'ninguém'), null);

  assert.equal(mudae.divorce(store, 'b', 'zero'), null, 'só divorcia de quem é seu');
  assert.equal(mudae.divorce(store, 'a', 'zero').name, 'Zero Two');
  assert.equal(store.claims[3], undefined);
  assert.equal(mudae.harem(store, 'a').total, 1);
});

test('raridade pela posição e card com raridade', () => {
  assert.equal(rarityOf(1), 'legendary');
  assert.equal(rarityOf(100), 'legendary');
  assert.equal(rarityOf(101), 'epic');
  assert.equal(rarityOf(1000), 'epic');
  assert.equal(rarityOf(1001), 'rare');
  assert.equal(rarityOf(5001), 'common');
  const { mudae, store } = setup();
  const r = mudae.roll(store, 'a', 'm');
  assert.equal(r.card.rarity, 'legendary');
  assert.equal(r.decoys.length, 8);
  assert.ok(r.decoys.every((url) => url.startsWith('https://s4.anilist.co/')));
});

test('Salão: ninguém casa durante o giro e quem rodou tem prioridade', () => {
  const { mudae, store, advance, now } = setup();
  const revealAt = now() + SPIN_MS;
  const roll = { revealAt, rollerId: 'a', priority: PRIORITY_MS };
  assert.throws(() => mudae.claim(store, 'a', 1, roll), /girando/);
  advance(SPIN_MS);
  assert.throws(() => mudae.claim(store, 'b', 1, roll), /prioridade/);
  advance(PRIORITY_MS);
  mudae.claim(store, 'b', 1, roll);
  assert.equal(store.claims[1].ownerId, 'b', 'depois da prioridade, qualquer um rouba');
  advance(CLAIM_RESET_MS);
  const late = { revealAt: now() - CLAIM_WINDOW_MS - 1, rollerId: 'a', priority: PRIORITY_MS };
  assert.throws(() => mudae.claim(store, 'a', 2, late), /Tarde demais/);
});

test('álbum, favorito, resumo do perfil e ranking', () => {
  const { mudae, store, advance, now } = setup();
  mudae.claim(store, 'a', 3, { revealAt: now() });
  advance(CLAIM_RESET_MS);
  mudae.claim(store, 'a', 4, { revealAt: now() });
  advance(CLAIM_RESET_MS);
  mudae.claim(store, 'b', 1, { revealAt: now() });

  const album = mudae.album(store, 'a');
  assert.deepEqual(album.chars.map((c) => c.name), ['Zero Two', 'Kyubey']);
  assert.ok(album.chars.every((c) => c.claimedAt > 0));
  assert.equal(album.favorite.name, 'Zero Two', 'sem escolha, o favorito é o mais valioso');
  assert.equal(album.favorite.chosen, false);

  mudae.setFavorite(store, 'a', 4);
  assert.equal(mudae.summary(store, 'a').favorite.name, 'Kyubey');
  assert.equal(mudae.summary(store, 'a').favorite.chosen, true);
  assert.throws(() => mudae.setFavorite(store, 'a', 1), /não é seu/);
  assert.equal(mudae.summary(store, 'c'), null);

  const { rows, legendaries } = mudae.ranking(store);
  assert.deepEqual(rows.map((r) => [r.ownerId, r.total]), [['a', 2], ['b', 1]], 'ordenado pelo valor total');
  assert.deepEqual(legendaries.map((c) => [c.name, c.ownerId]), [['Satoru Gojou', 'b'], ['Zero Two', 'a'], ['Kyubey', 'a']]);
  assert.deepEqual(mudae.ranking(store, (id) => id !== 'b').rows.map((r) => r.ownerId), ['a'], 'quem saiu não aparece');

  assert.equal(mudae.divorceId(store, 'a', 4).name, 'Kyubey');
  assert.equal(mudae.summary(store, 'a').favorite.name, 'Zero Two', 'divorciar do favorito volta para o mais valioso');
  assert.throws(() => mudae.divorceId(store, 'a', 1), /não é seu/);
});

test('várias fontes: raridade dentro de cada fonte, comandos com sufixo e ids em texto', () => {
  const games = Array.from({ length: 150 }, (_, i) => [`g${i + 1}`, `Herói ${i + 1}`, 'Jogo', `https://images.igdb.com/${i + 1}.jpg`, i % 2 ? 'M' : 'F', 1000 - i, 'g']);
  const anime = Array.from({ length: 300 }, (_, i) => [i + 1, `Anime ${i + 1}`, 'Obra', `b${i + 1}.png`, 'F', 5000 - i]);
  let t = 10 * CLAIM_RESET_MS;
  let pick = 0;
  const mudae = createMudae({ catalog: [...anime, ...games], now: () => t, random: () => pick, refSize: 150 });
  assert.deepEqual(mudae.sources, { a: 300, g: 150 });
  assert.deepEqual(parse('$wg'), { cmd: 'wg', arg: '' });
  assert.deepEqual(parse('$HA'), { cmd: 'ha', arg: '' });

  const store = { claims: {}, usage: {} };
  const r = mudae.roll(store, 'a', 'wg');
  assert.equal(r.card.source, 'g');
  assert.equal(r.card.id, 'g1');
  assert.equal(r.card.image, 'https://images.igdb.com/1.jpg', 'foto de outra fonte vai inteira');
  assert.equal(r.card.rarity, 'legendary', 'o 1º de cada fonte é lendário');
  assert.ok(r.decoys.every((url) => url.startsWith('https://images.igdb.com/')), 'as iscas vêm da mesma fonte');
  // O 2º de 300 animes fica na mesma faixa que o 1º de 150 jogos.
  assert.equal(mudae.card(2).value, mudae.card('g1').value);
  assert.equal(mudae.roll(store, 'a', 'ha').card.source, 'a', 'sem husbando de anime, cai em qualquer anime');
  pick = 0.999;
  assert.equal(mudae.roll(store, 'a', 'hg').card.id, 'g150');

  mudae.claim(store, 'a', 'g1', { revealAt: t });
  assert.equal(store.claims.g1.ownerId, 'a');
  mudae.setFavorite(store, 'a', 'g1');
  assert.equal(mudae.summary(store, 'a').favorite.chosen, true);
  assert.equal(mudae.info(store, 'herói 1').card.id, 'g1');
  assert.equal(mudae.divorceId(store, 'a', 'g1').name, 'Herói 1');
  assert.equal(store.favorites.a, undefined);
});
