const test = require('node:test');
const assert = require('node:assert/strict');
const { preserveRows, mergeByRank, validateRows } = require('../tools/mudae-fontes/coleta');
const { listCategory, readInfobox } = require('../tools/mudae-fontes/fandom');
const { castRows, isGeneric } = require('../tools/mudae-fontes/tmdb');
const { characterRow } = require('../tools/mudae-fontes/comicvine');
const { anilist } = require('../tools/mudae-fontes/anilist');
const { igdb, gameWork } = require('../tools/mudae-fontes/igdb');
const { mergeGames } = require('../tools/mudae-catalogo');

const row = (id, name, work, gender = 'M', source = 'g') => [id, name, work, 'https://example.com/image.jpg', gender, 5, source];

test('IGDB usa a franquia correspondente ao titulo em jogos com crossover', () => {
  assert.equal(gameWork({ name: 'BlazBlue: Cross Tag Battle', franchises: [{ name: 'RWBY' }, { name: 'BlazBlue' }, { name: 'Shin Megami Tensei' }] }), 'BlazBlue');
  assert.equal(gameWork({ name: 'Cross Game', franchise: { name: 'RWBY' }, franchises: [{ name: 'BlazBlue' }] }), 'Cross Game');
  assert.equal(gameWork({ name: 'Guilty Gear Xrd', franchises: [{ name: 'Guilty Gear' }] }), 'Guilty Gear');
});

test('IGDB retoma consultas salvas sem renovar login pela rede', async () => {
  const originalFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => { requests++; return new Response('{}', { status: 403 }); };
  try {
    const collection = { report: {}, count() {}, skip() {}, finish(rows) { return rows; },
      async unit() { return [{ id: 7841, name: 'Ragna the Bloodedge', mug_shot: { image_id: 'cm348' }, games: [{ name: 'BlazBlue', total_rating_count: 40 }] }]; } };
    const rows = await igdb({ keys: { igdbClientId: 'test', igdbClientSecret: 'test' }, collection });
    assert.equal(rows[0][2], 'BlazBlue');
    assert.equal(requests, 0);
  } finally { global.fetch = originalFetch; }
});

test('IDs publicados sobrevivem e homônimos de franquias distintas continuam separados', () => {
  const old = row('g-wiki-1', 'King', 'Tekken');
  const merged = mergeByRank([[row('g2', 'King', 'Tekken')], [old], [row('g3', 'King', 'The King of Fighters')]], [old]);
  assert.deepEqual(new Set(merged.map((r) => r[0])), new Set(['g-wiki-1', 'g3']));
  const updated = preserveRows([old, row('g4', 'Antigo', 'Outra obra')], [[...old.slice(0, 4), '', 8, 'g']]);
  assert.equal(updated.length, 2);
  assert.equal(updated[0][4], 'M');
  assert.equal(updated[0][5], 8);
  validateRows(updated, 'g');
  assert.throws(() => validateRows([...updated, updated[0]], 'g'), /IDs repetidos/);
  const balanced = mergeGames([], [row('g-tekken-1', 'King', 'Tekken'), row('g-mario-1', 'Mario', 'Mario'), row('g-tekken-2', 'Jin', 'Tekken')]);
  assert.equal(balanced.find((r) => r[1] === 'King')[5], balanced.find((r) => r[1] === 'Mario')[5]);
});

test('Fandom percorre subcategorias profundas, continuações e ciclos mesmo com 40 páginas na raiz', async () => {
  const calls = [];
  const api = async (wiki, params) => {
    const category = (params.gcmtitle || params.cmtitle).replace('Category:', '');
    calls.push({ category, ...params });
    if (params.generator) {
      const pages = category === 'Characters' ? Array.from({ length: 40 }, (_, i) => ({ pageid: i + 1, title: 'Pessoa ' + i, length: 1 }))
        : [{ pageid: category === 'Filhos' ? 41 : 42, title: category, length: 1 }];
      return { query: { pages } };
    }
    if (category === 'Characters' && !params.cmcontinue) return { query: { categorymembers: [{ title: 'Category:Filhos' }] }, continue: { cmcontinue: 'next' } };
    if (category === 'Characters') return { query: { categorymembers: [{ title: 'Category:Netos' }, { title: 'Category:Gnar sound files' }, { title: 'Category:Varus loading screens' }, { title: 'Category:2006 Episodes' }] } };
    return { query: { categorymembers: [{ title: 'Category:Characters' }, { title: 'Category:Netos' }] } };
  };
  const pages = await listCategory('fixture', 'Characters', api);
  assert.equal(pages.length, 42);
  assert.ok(calls.some((p) => p.cmcontinue === 'next'));
  assert.equal(calls.filter((p) => p.generator && p.category === 'Netos').length, 1);
  assert.ok(!calls.some((p) => /sound files|loading screens|2006 Episodes/.test(p.category)));
  const infobox = (sources) => JSON.stringify([{ data: sources.map((source) => ({ type: 'data', data: { source, value: '1' } })) }]);
  assert.equal(readInfobox(infobox(['season', 'episode', 'original_broadcast'])).nonCharacter, true);
  assert.equal(readInfobox(infobox(['gender', 'species', 'season'])).nonCharacter, false);
});

test('TMDB importa o 13º personagem e papéis adicionais, preservando o ID do papel antigo', () => {
  const cast = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, order: i, profile_path: '/a.jpg', gender: 2,
    roles: [{ character: 'Pessoa Nomeada ' + i, episode_count: 2 }] }));
  cast[0].roles = [{ character: 'Papel Novo', episode_count: 20 }, { character: 'Papel Antigo', episode_count: 1 }];
  cast.push({ id: 20, order: 20, profile_path: '/b.jpg', roles: [{ character: 'Guard #1', episode_count: 1 }] });
  const previous = [row('s10-1', 'Papel Antigo', 'Série', 'M', 's')];
  const rows = castRows({ id: 10, name: 'Série', vote_count: 100 }, cast, previous);
  assert.equal(rows.find((r) => r[1] === 'Papel Antigo')[0], 's10-1');
  assert.match(rows.find((r) => r[1] === 'Papel Novo')[0], /^s10-1-/);
  assert.ok(rows.some((r) => r[0] === 's10-14'));
  assert.equal(rows.length, 15);
  assert.ok(!rows.some((r) => /Guard/.test(r[1])));
  for (const name of ['Security Guard', 'Man in Suit', 'Woman in Car', 'Female Patron', 'Drama Student #1']) assert.ok(isGeneric(name), name);
  for (const name of ['Erica Sinclair', 'Billy Hargrove', 'FBI Agent Roger Hardy', 'The Doctor']) assert.ok(!isGeneric(name), name);
  validateRows(rows, 's');
});

test('Comic Vine aceita personagem sem Wikidata e mantém filtros de imagem/pessoa real', () => {
  const c = { id: 123, name: 'Conhecido', publisher: { name: 'Marvel' }, gender: 1, image: { super_url: 'https://example.com/a.jpg' }, count_of_issue_appearances: 50 };
  assert.equal(characterRow(c)[0], 'c123');
  assert.equal(characterRow(c)[5], 50);
  assert.equal(characterRow(c, new Map(), new Set([123])), null);
  assert.equal(characterRow({ ...c, image: { super_url: 'https://example.com/default.jpg' } }), null);
});

test('AniList pagina além de 25, visita mangá e não corta ao atingir o tamanho anterior', async () => {
  const char = (id) => ({ id, name: { full: 'Personagem ' + id }, gender: 'Male', favourites: 1, image: { large: 'https://example.com/' + id + '.jpg' } });
  const media = (id, title) => ({ id, popularity: 100, title: { english: title, romaji: title } });
  const queries = [];
  const collection = { report: { scope: {}, counters: { requests: 1 }, units: {} }, count() {}, skip() {}, progress(id, details) { this.report.units[id] = details; }, error(id, err) { throw err; }, finish(rows) { return rows; } };
  const queryApi = async (q, vars) => {
    queries.push({ q, vars });
    if (vars?.ids) return { Page: { characters: [{ id: 1, media: { nodes: [media(10, 'Anime Atual')] } }] } };
    if (vars?.type) {
      const m = media(vars.type === 'ANIME' ? 10 : 20, vars.type === 'ANIME' ? 'Anime Atual' : 'Mangá Atual');
      return { Page: { pageInfo: { hasNextPage: false }, media: [{ ...m, characters: { nodes: Array.from({ length: 25 }, (_, i) => char(m.id * 100 + i)), pageInfo: { hasNextPage: true } } }] } };
    }
    return { m0: { characters: { nodes: [char(9000)], pageInfo: { hasNextPage: false } } }, m1: { characters: { nodes: [char(9001)], pageInfo: { hasNextPage: false } } } };
  };
  const rows = await anilist({ previous: [row(1, 'Antigo', 'Anime Atual', 'M', 'a')], popularPages: 1, collection, queryApi });
  assert.equal(rows.length, 52);
  assert.ok(queries.some((p) => p.vars?.type === 'MANGA'));
  assert.ok(queries.some((p) => p.q.includes('page:2')));
  assert.equal(collection.report.units['10'].status, 'complete');
  assert.equal(collection.report.units['20'].status, 'complete');
  validateRows(rows, 'a');
});
