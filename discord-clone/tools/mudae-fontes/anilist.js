// Completa as obras do catálogo e inclui as obras mais populares de anime E mangá.
const { pacer, request } = require('./comum');
const { createCollection, normalize } = require('./coleta');

const IMG_PREFIX = 'https://s4.anilist.co/file/anilistcdn/character/large/';
const CHAR_FIELDS = 'id name { full } gender favourites image { large }';
const MEDIA_FIELDS = 'id popularity title { romaji english }';
const CAST_FIELDS = 'pageInfo { hasNextPage } nodes { ' + CHAR_FIELDS + ' }';

async function anilist({ previous = [], popularPages = 8, collection = createCollection('anime'), queryApi }) {
  const pace = pacer(2100);
  const query = queryApi || ((q, variables = {}) => collection.unit(q + ':' + JSON.stringify(variables), async () => {
    await pace();
    const data = await request('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: q, variables }),
    }, { label: 'AniList' });
    if (data.errors?.length || !data.data) throw new Error('AniList: ' + (data.errors || []).map((e) => e.message).join('; '));
    return data.data;
  }));
  collection.report.scope = { existingWorks: new Set(previous.map((r) => r[2])).size, popularWorksPerType: popularPages * 25, characters: 'elenco paginado; sem teto global; anime e mangá' };
  const old = new Map(previous.map((r) => [String(r[0]), r]));
  const rows = new Map();
  const works = new Map();
  const represented = new Map();
  const resolved = new Set();
  for (const row of previous) if (!represented.has(normalize(row[2]))) represented.set(normalize(row[2]), row);
  const add = (c, title) => {
    const img = c.image?.large || '';
    const name = c.name?.full?.trim();
    if (!name || !/^https?:\/\//.test(img) || /\/default\.(jpg|png)/i.test(img) || !title) { collection.skip('semNomeImagemOuObra'); return; }
    if (rows.has(c.id)) { collection.skip('mesmoId'); return; }
    rows.set(c.id, [c.id, name, old.get(String(c.id))?.[2] || title, img.startsWith(IMG_PREFIX) ? img.slice(IMG_PREFIX.length) : img,
      c.gender === 'Female' ? 'F' : c.gender === 'Male' ? 'M' : '', c.favourites || 0, 'a']);
  };
  const titleOf = (m) => m.title?.english || m.title?.romaji;
  const matches = (m, title) => [m.title?.english, m.title?.romaji].some((t) => normalize(t) === title);
  // Um representante por obra descobre seu ID sem pesquisar milhares de títulos individualmente.
  const reps = [...represented.values()];
  for (let i = 0; i < reps.length; i += 25) {
    const batch = reps.slice(i, i + 25);
    const q = 'query($ids:[Int]) { Page(perPage:25) { characters(id_in:$ids) { id media(sort:POPULARITY_DESC,perPage:25) { nodes { ' + MEDIA_FIELDS + ' } } } } }';
    const data = await query(q, { ids: batch.map((r) => Number(r[0])) });
    const chars = new Map(data.Page.characters.map((c) => [c.id, c]));
    for (const row of batch) {
      const title = normalize(row[2]);
      const media = chars.get(Number(row[0]))?.media?.nodes.find((m) => matches(m, title));
      if (media) { works.set(media.id, media); resolved.add(title); }
    }
    if (i % 250 === 0) console.log('  anime: identificando obras, ' + Math.min(i + 25, reps.length) + '/' + reps.length);
  }
  // Busca exata de títulos que não vieram nas associações do representante.
  for (const [title, row] of represented) if (!resolved.has(title)) {
    try {
      const data = await query('query($search:String) { Page(perPage:25) { media(search:$search) { ' + MEDIA_FIELDS + ' } } }', { search: row[2] });
      const media = data.Page.media.find((m) => matches(m, title));
      if (!media) throw new Error('Obra sem correspondência exata: ' + row[2]);
      works.set(media.id, media); resolved.add(title);
    } catch (err) { collection.error('obra:' + row[2], err); }
  }
  const firstPages = new Map();
  for (const type of ['ANIME', 'MANGA']) for (let page = 1; page <= popularPages; page++) {
    const q = 'query($page:Int,$type:MediaType) { Page(page:$page,perPage:25) { pageInfo { hasNextPage } media(sort:POPULARITY_DESC,type:$type) { ' + MEDIA_FIELDS + ' characters(sort:FAVOURITES_DESC,page:1,perPage:25) { ' + CAST_FIELDS + ' } } } }';
    const data = await query(q, { page, type });
    for (const media of data.Page.media) {
      works.set(media.id, media);
      firstPages.set(media.id, media.characters);
    }
    if (!data.Page.pageInfo.hasNextPage) break;
  }
  const pending = [...works.values()].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).map((media) => ({ media, page: 1, seen: new Set() }));
  const consume = (item, cast) => {
    collection.count('fetched', cast.nodes.length);
    let newIds = 0;
    for (const c of cast.nodes) {
      if (!item.seen.has(c.id)) { item.seen.add(c.id); newIds++; }
      add(c, titleOf(item.media));
    }
    if (cast.pageInfo.hasNextPage && !newIds) {
      collection.error('elenco:' + item.media.id, new Error('Paginação sem avanço'));
      return false;
    }
    collection.progress(String(item.media.id), { name: titleOf(item.media), pages: item.page, fetched: item.seen.size, status: cast.pageInfo.hasNextPage ? 'running' : 'complete' });
    return cast.pageInfo.hasNextPage;
  };
  const initial = pending.splice(0);
  for (const item of initial) {
    if (firstPages.has(item.media.id)) {
      if (!consume(item, firstPages.get(item.media.id))) continue;
      item.page++;
    }
    pending.push(item);
  }
  // Vários elencos por pedido mantêm a paginação completa dentro da cota da API.
  while (pending.length) {
    const batch = pending.splice(0, 8);
    const q = 'query { ' + batch.map((item, i) => 'm' + i + ': Media(id:' + item.media.id + ') { characters(sort:FAVOURITES_DESC,page:' + item.page + ',perPage:25) { ' + CAST_FIELDS + ' } }').join(' ') + ' }';
    try {
      const data = await query(q);
      for (const [i, item] of batch.entries()) {
        const cast = data['m' + i]?.characters;
        if (!cast) { collection.error('elenco:' + item.media.id, new Error('Elenco ausente na resposta')); continue; }
        if (consume(item, cast)) { item.page++; pending.push(item); }
      }
    } catch (err) {
      for (const item of batch) collection.error('elenco:' + item.media.id + ':' + item.page, err);
    }
    if (collection.report.counters.requests % 25 === 0) console.log('  anime: ' + rows.size + ' fichas; ' + pending.length + ' elencos pendentes');
  }
  return collection.finish([...rows.values()].sort((a, b) => b[5] - a[5]));
}

module.exports = { anilist };
