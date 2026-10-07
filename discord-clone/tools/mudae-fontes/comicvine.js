// Wikidata ordena personagens conhecidos; consultas diretas também aceitam fichas sem mapeamento.
const fs = require('fs');
const path = require('path');
const { request } = require('./comum');
const { createCollection } = require('./coleta');
const { hourlyPacer } = require('./limite');

const UA = { 'User-Agent': 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)' };
const SKIP_PUBLISHER = /shueisha|kodansha|shogakukan|square enix|viz|hakusensha|akita|kadokawa|tokyopop|futabasha|houbunsha|ichijinsha|enterbrain|media factory|mag garden|^disney|non-fictional|public domain|nintendo|sega|bongo|lego|company-licensed|hanna-barbera|warner bros|cartoon network|nickelodeon|capcom|blizzard|nbc|konami|bandai|ubisoft|activision|electronic arts|riot games|sony|microsoft/i;

function characterRow(c, links = new Map(), humans = new Set(), collection) {
  const img = c.image?.super_url || c.image?.medium_url || '';
  if (!c.name || !img || /blank|default/i.test(img)) { collection?.skip('semNomeImagem'); return null; }
  const publisher = c.publisher?.name || '';
  if (humans.has(c.id) || SKIP_PUBLISHER.test(publisher)) { collection?.skip('foraDoEscopo'); return null; }
  return ['c' + c.id, c.name.trim(), publisher || 'Quadrinhos', img, c.gender === 1 ? 'M' : c.gender === 2 ? 'F' : '',
    (links.get(c.id) || 0) * 100_000 + Math.min(99_999, c.count_of_issue_appearances || 0), 'c'];
}

async function comicvine({ keys, previous = [], nativePages = 50, collection = createCollection('quadrinhos') }) {
  if (!keys.comicVineKey) throw new Error('falta comicVineKey em tools/mudae-chaves.json');
  const queryDir = path.join(collection.cacheDir, 'consultas', collection.report.source);
  const history = fs.existsSync(queryDir) ? fs.readdirSync(queryDir).map((file) => JSON.parse(fs.readFileSync(path.join(queryDir, file), 'utf8')))
    .filter((entry) => entry.key.startsWith('comicvine:')).map((entry) => Date.parse(entry.fetchedAt)) : [];
  const pace = hourlyPacer(path.join(collection.cacheDir, 'limites', 'comicvine.json'), history);
  const links = new Map();
  const humans = new Set();
  collection.report.scope = { mapped: 'todos os IDs Wikidata, inclusive zero/um sitelink', nativePages, nativePageSize: 100, characters: 'sem teto global; expansão direta por ID de criação; filtros de mídia/imagem' };
  try {
    const q = 'SELECT ?cv ?links ?human WHERE { ?item wdt:P5905 ?cv; wikibase:sitelinks ?links. FILTER(STRSTARTS(?cv, "4005-")) OPTIONAL { ?item wdt:P31 wd:Q5. BIND(true AS ?human) } }';
    const data = await collection.unit('wikidata:todos-com-humanos-v2', () => request('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q),
      { headers: { ...UA, Accept: 'application/sparql-results+json' } }, { label: 'Wikidata' }));
    for (const b of data.results.bindings) {
      const id = Number(b.cv.value.slice(5));
      if (!id) continue;
      if (b.human?.value === 'true') humans.add(id);
      else links.set(id, Math.max(links.get(id) || 0, Number(b.links.value)));
    }
  } catch (err) { collection.error('wikidata', err); }
  collection.count('mappedIds', links.size);
  collection.count('realPeopleIds', humans.size);
  const api = (params) => collection.unit('comicvine:' + JSON.stringify(params), async () => {
    const query = new URLSearchParams({ api_key: keys.comicVineKey, format: 'json', limit: '100',
      field_list: 'id,name,gender,image,publisher,count_of_issue_appearances', ...params });
    const data = await request('https://comicvine.gamespot.com/api/characters/?' + query, { headers: UA },
      { label: 'Comic Vine', beforeAttempt: async () => { await pace(); collection.count('apiAttempts'); } });
    if (data.error !== 'OK') throw new Error('Comic Vine: ' + data.error);
    return data;
  });
  const rows = new Map();
  const fetched = new Set();
  const consume = (data) => {
    collection.count('fetched', data.results.length);
    for (const c of data.results) {
      fetched.add(c.id);
      const row = characterRow(c, links, humans, collection);
      if (row) rows.set(c.id, row);
    }
  };
  // Fichas diretas: mapeamento Wikidata não é condição para entrar.
  for (let page = 0; page < nativePages; page++) {
    const data = await api({ sort: 'id:asc', offset: String(page * 100) });
    consume(data);
    collection.progress('native', { pages: page + 1, fetched: fetched.size, providerTotal: data.number_of_total_results, status: 'running' });
    if ((page + 1) * 100 >= data.number_of_total_results || !data.results.length) break;
    if (page % 10 === 9) console.log('  quadrinhos: ' + (page + 1) + ' páginas diretas; ' + rows.size + ' fichas');
  }
  const ids = [...new Set([...links.keys(), ...previous.map((r) => Number(String(r[0]).slice(1)))])].filter((id) => id && !fetched.has(id));
  for (let i = 0; i < ids.length; i += 100) {
    const data = await api({ filter: 'id:' + ids.slice(i, i + 100).join('|') });
    consume(data);
    if (i % 1000 === 0) console.log('  quadrinhos: ' + Math.min(i + 100, ids.length) + '/' + ids.length + ' IDs adicionais; ' + rows.size + ' fichas');
  }
  collection.count('uniqueFetched', fetched.size);
  collection.progress('native', { pages: nativePages, status: 'complete-in-scope', note: 'Expansão limitada ao escopo conhecido; não é espelho integral do Comic Vine.' });
  return collection.finish([...rows.values()].sort((a, b) => b[5] - a[5]));
}

module.exports = { comicvine, characterRow };
