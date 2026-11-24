const test = require('node:test');
const assert = require('node:assert/strict');
const { linhaDe } = require('../tools/mudae-fontes/anilist-completo');
const { GRUPOS } = require('../tools/mudae-fontes/fandom-expandido');
const { FRANCHISES, GAME_FRANCHISES } = require('../tools/mudae-fontes/fandom');
const { validateRows } = require('../tools/mudae-fontes/coleta');

const char = (extra = {}) => ({ id: 7, name: { full: 'Naruto Uzumaki' }, gender: 'Male', favourites: 99, image: { large: 'https://s4.anilist.co/file/anilistcdn/character/large/b7-abc.png' },
  media: { nodes: [{ type: 'ANIME', format: 'TV', countryOfOrigin: 'JP', isAdult: false, title: { romaji: 'Naruto', english: null } }] }, ...extra });

test('AniList completo: monta a linha de 7 colunas e guarda tipo, país e +18 à parte', () => {
  const r = linhaDe(char());
  assert.deepEqual(r.row, [7, 'Naruto Uzumaki', 'Naruto', 'b7-abc.png', 'M', 99, 'a']);
  assert.deepEqual(r.extra, { id: 7, tipo: 'ANIME', pais: 'JP', adulto: false, formato: 'TV' });
  validateRows([r.row], 'a');
});

test('AniList completo: título em inglês vence o romaji, e manhwa fica marcado pelo país', () => {
  const r = linhaDe(char({ gender: 'Female', media: { nodes: [{ type: 'MANGA', format: 'MANGA', countryOfOrigin: 'KR', isAdult: true, title: { romaji: 'Sololeveling', english: 'Solo Leveling' } }] } }));
  assert.equal(r.row[2], 'Solo Leveling');
  assert.equal(r.row[4], 'F');
  assert.equal(r.extra.pais, 'KR');
  assert.equal(r.extra.adulto, true);
});

test('AniList completo: sem nome, sem foto de verdade ou sem obra não entra', () => {
  assert.equal(linhaDe(char({ name: { full: '  ' } })).skip, 'semNome');
  assert.equal(linhaDe(char({ image: { large: 'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg' } })).skip, 'semImagem');
  assert.equal(linhaDe(char({ image: null })).skip, 'semImagem');
  assert.equal(linhaDe(char({ media: { nodes: [] } })).skip, 'semObra');
  assert.equal(linhaDe(char({ gender: 'Non-binary' })).row[4], '');
});

test('Fandom expandido: cada wiki aparece uma vez e nenhuma repete as que o fandom.js já coleta', () => {
  const existentes = new Set([...FRANCHISES, ...GAME_FRANCHISES].map((f) => f.wiki));
  const vistas = new Set();
  for (const [grupo, { franchises, letter }] of Object.entries(GRUPOS)) {
    assert.ok(['d', 'g', 'c', 's'].includes(letter), grupo);
    for (const f of franchises) {
      assert.ok(f.wiki && f.series, grupo + ': wiki e série são obrigatórias');
      assert.ok(!existentes.has(f.wiki), f.wiki + ' já é coletada pelo fandom.js');
      // Uma wiki pode alimentar duas obras (Baldur's Gate 1/2 e 3, Hollow Knight e Silksong), mas nunca a mesma obra duas vezes.
      assert.ok(!vistas.has(f.wiki + '|' + f.series), f.wiki + ' repetida');
      vistas.add(f.wiki + '|' + f.series);
      if (f.maxPages !== undefined) assert.ok(Number.isInteger(f.maxPages) && f.maxPages > 0, f.wiki);
      if (f.category !== undefined) assert.ok([].concat(f.category).every((c) => typeof c === 'string' && c), f.wiki);
    }
  }
  assert.ok([...vistas].some((v) => v.startsWith('scoobydoo|')) && [...vistas].some((v) => v.startsWith('castlevania|')), 'Scooby-Doo e Castlevania estão na lista');
});

test('Fandom expandido: o grupo usa a letra de fonte certa e labels próprios (não sobrescreve os caches antigos)', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(GRUPOS).map(([k, v]) => [k, v.letter])), { desenhos: 'd', quadrinhos: 'c', jogos: 'g', series: 's' });
  for (const { label } of Object.values(GRUPOS)) assert.match(label, /-extra$/);
});
