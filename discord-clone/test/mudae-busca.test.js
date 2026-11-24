// Busca da aba Personagens: sugestões de obras e personagens (com filtros) e a lista que abre na página do escolhido.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae } = require('../server/mudae');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Satoru Fujinuma', 'Erased', 'b5-e.jpg', 'M', 500],
  [6, 'Eren Yeager', 'Attack on Titan', 'b6-f.jpg', 'M', 400],
  ['g1', 'Link', 'Zelda', 'https://images.igdb.com/1.jpg', 'M', 300, 'g'],
  ['g2', 'Zelda', 'Zelda', 'https://images.igdb.com/2.jpg', 'F', 250, 'g'],
];
const setup = (catalog = CATALOG) => ({ mudae: createMudae({ catalog, now: () => 1e9, random: () => 0, refSize: catalog.length }), store: { claims: {}, usage: {} } });

test('busca: acha personagem e obra pelo mesmo texto, sem acento e sem maiúscula', () => {
  const { mudae, store } = setup();
  const r = mudae.suggest(store, 'ZELDA');
  assert.deepEqual(r.series.map((s) => [s.name, s.count, s.source]), [['Zelda', 2, 'g']]);
  assert.deepEqual(r.chars.map((c) => c.id), ['g2'], 'o nome igual vem primeiro; "Link" não tem "zelda" no nome');
  const sat = mudae.suggest(store, 'satoru');
  assert.deepEqual(sat.chars.map((c) => c.name), ['Satoru Gojou', 'Satoru Fujinuma'], 'mais popular primeiro');
  assert.deepEqual(sat.series, []);
  assert.deepEqual(mudae.suggest(store, 'attack').series.map((s) => s.name), ['Attack on Titan']);
});

test('busca: palavras fora de ordem e texto curto demais', () => {
  const { mudae, store } = setup();
  assert.deepEqual(mudae.suggest(store, 'ackerman mikasa').chars.map((c) => c.id), [2]);
  assert.deepEqual(mudae.suggest(store, 'm'), { series: [], chars: [], filter: null }, 'uma letra não busca');
  assert.deepEqual(mudae.suggest(store, '   '), { series: [], chars: [], filter: null });
  assert.equal(mudae.suggest(store, 'nada disso existe').chars.length, 0);
});

test('busca: os filtros de gênero e fonte valem para os personagens, e a fonte também para as obras', () => {
  const { mudae, store } = setup();
  assert.deepEqual(mudae.suggest(store, 'satoru', { gender: 'F' }).chars, []);
  assert.deepEqual(mudae.suggest(store, 'e', { gender: 'F' }).chars, [], 'mínimo de duas letras');
  assert.deepEqual(mudae.suggest(store, 'mik', { gender: 'M' }).chars.map((c) => c.id), [], 'Mikasa é waifu');
  assert.deepEqual(mudae.suggest(store, 'mik', { gender: 'F' }).chars.map((c) => c.id), [2]);
  assert.deepEqual(mudae.suggest(store, 'zelda', { source: 'a' }).series, [], 'Zelda é de jogos');
  assert.deepEqual(mudae.suggest(store, 'zelda', { source: 'g' }).series.map((s) => s.name), ['Zelda']);
  assert.deepEqual(mudae.suggest(store, 'ky', { gender: 'O' }).chars.map((c) => c.id), [4]);
});

test('busca: o texto "waifus jogos" vira um filtro, e cada personagem diz quem é o dono', () => {
  const { mudae, store } = setup();
  const f = mudae.suggest(store, 'waifus jogos').filter;
  assert.deepEqual(f, { key: 'F|g|', label: 'Waifus de jogos', gender: 'F', source: 'g' });
  assert.equal(mudae.suggest(store, 'zelda').filter, null);
  mudae.claim(store, 'a', 'g2', { revealAt: 1e9 });
  assert.equal(mudae.suggest(store, 'zelda').chars[0].ownerId, 'a');
  assert.equal(mudae.suggest(store, 'link').chars[0].ownerId, null);
});

test('busca: nunca passa do limite e o limite tem teto', () => {
  const many = Array.from({ length: 80 }, (_, i) => [i + 1, `Hero ${i}`, `Saga ${i % 9}`, `b${i}.png`, 'F', 5000 - i]);
  const { mudae, store } = setup(many);
  assert.equal(mudae.suggest(store, 'hero').chars.length, 6);
  assert.equal(mudae.suggest(store, 'hero', { limit: 100 }).chars.length, 10);
  assert.equal(mudae.suggest(store, 'saga').series.length, 6);
});

test('lista: com o personagem escolhido, abre na página dele e devolve o foco', () => {
  const many = Array.from({ length: 40 }, (_, i) => [i + 1, `P${i}`, 'Grande', `b${i}.png`, 'F', 5000 - i]);
  const { mudae, store } = setup(many);
  const key = mudae.topFilter('grande', true).key;
  const sem = mudae.list(store, key, 0);
  assert.equal(sem.page, 0);
  assert.equal(sem.focus, undefined);
  const com = mudae.list(store, key, 0, null, 33);
  assert.equal(com.page, 2, 'o 34º personagem está na terceira página de 15');
  assert.equal(com.focus, '33');
  assert.ok(com.chars.some((c) => String(c.id) === '33'));
  assert.equal(mudae.list(store, key, 1, null, 'inexistente').page, 1, 'foco que não existe é ignorado');
});
