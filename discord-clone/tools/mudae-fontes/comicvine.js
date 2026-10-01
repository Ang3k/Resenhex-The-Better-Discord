// Quadrinhos (Comic Vine + Wikidata). Precisa de comicVineKey. A lista de personagens do Comic Vine
// ignora a ordenação por popularidade, então ela vem do Wikidata: personagens com id do Comic Vine,
// do que tem artigo em mais Wikipédias para o que tem menos (sem pessoas reais). Foto, gênero e
// editora vêm do Comic Vine, 100 por pedido (filtro por id). Uso não comercial; 200 pedidos por hora.
const { pacer, request } = require('./comum');

const pace = pacer(1100);
const UA = { 'User-Agent': 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)' };
// Fica de fora: mangá (já está no anime), gibis de desenho e de jogo (Disney, Simpsons, Nintendo… já
// estão nas outras fontes), pessoas reais que aparecem
// em quadrinhos ("Non-Fictional") e figuras religiosas e mitológicas ("In the Public Domain").
const SKIP_PUBLISHER = /shueisha|kodansha|shogakukan|square enix|viz|hakusensha|akita|kadokawa|tokyopop|futabasha|houbunsha|ichijinsha|enterbrain|media factory|mag garden|^disney|non-fictional|public domain|nintendo|sega|bongo|lego|company-licensed|hanna-barbera|warner bros|cartoon network|nickelodeon|capcom|blizzard|nbc|konami|bandai|ubisoft|activision|electronic arts|riot games|sony|microsoft/i;

async function popular(want) {
  const query = `SELECT ?cv ?links WHERE {
    ?item wdt:P5905 ?cv ; wikibase:sitelinks ?links .
    FILTER(STRSTARTS(?cv, "4005-") && ?links > 1)
    FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }
  } ORDER BY DESC(?links) LIMIT ${want}`;
  const data = await request('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query),
    { headers: { ...UA, Accept: 'application/sparql-results+json' } }, { label: 'Wikidata' });
  const best = new Map();
  for (const b of data.results.bindings) {
    const id = Number(b.cv.value.slice(5));
    if (id && !best.has(id)) best.set(id, Number(b.links.value));
  }
  return best;
}

async function comicvine({ want = 4000, keys }) {
  if (!keys.comicVineKey) throw new Error('falta comicVineKey em tools/mudae-chaves.json');
  // Os filtros de editora descartam muita gente no topo (mitologia, religião, licenciados).
  const links = await popular(want * 5);
  console.log(`  quadrinhos: ${links.size} personagens no Wikidata`);
  const ids = [...links.keys()];
  const rows = [];
  for (let i = 0; i < ids.length && rows.length < want; i += 100) {
    await pace();
    const params = new URLSearchParams({ api_key: keys.comicVineKey, format: 'json', limit: '100', filter: 'id:' + ids.slice(i, i + 100).join('|'),
      field_list: 'id,name,gender,image,publisher,count_of_issue_appearances' });
    const data = await request(`https://comicvine.gamespot.com/api/characters/?${params}`, { headers: UA }, { label: 'Comic Vine' });
    if (data.error !== 'OK') throw new Error('Comic Vine: ' + data.error);
    for (const c of data.results) {
      // super_url mantém a proporção da arte (screen_large_url é um recorte horizontal).
      const img = c.image?.super_url || c.image?.medium_url || '';
      const publisher = c.publisher?.name || '';
      if (!img || /blank|default/i.test(img) || !c.name || SKIP_PUBLISHER.test(publisher)) continue;
      // Wikipédias com artigo decidem; edições em que aparece desempatam.
      const score = links.get(c.id) * 100_000 + Math.min(99_999, c.count_of_issue_appearances || 0);
      rows.push([`c${c.id}`, c.name.trim(), publisher || 'Quadrinhos', img, c.gender === 1 ? 'M' : c.gender === 2 ? 'F' : '', score, 'c']);
    }
    if ((i / 100) % 5 === 4) console.log(`  quadrinhos: ${rows.length} (${i + 100} de ${ids.length} conferidos)`);
  }
  return rows.sort((a, b) => b[5] - a[5]).slice(0, want);
}

module.exports = { comicvine };
