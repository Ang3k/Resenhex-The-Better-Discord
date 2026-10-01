// Anime e mangá (AniList). O AniList só pagina até 5.000 resultados por consulta, então são duas
// fases: os 5.000 personagens mais favoritados e depois o elenco das obras mais populares.
// Sem chave. Limite: 30 pedidos por minuto (o script espera quando chega perto).
const { wait, request } = require('./comum');

const IMG_PREFIX = 'https://s4.anilist.co/file/anilistcdn/character/large/';
const CHAR_FIELDS = 'id name { full } gender favourites image { large }';
const TOP_CHARACTERS = `query ($page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    characters(sort: FAVOURITES_DESC) { ${CHAR_FIELDS} media(sort: POPULARITY_DESC, perPage: 1) { nodes { title { romaji english } } } }
  }
}`;
const POPULAR_MEDIA = `query ($page: Int, $type: MediaType) {
  Page(page: $page, perPage: 25) {
    pageInfo { hasNextPage }
    media(sort: POPULARITY_DESC, type: $type) { title { romaji english } characters(sort: FAVOURITES_DESC, perPage: 25) { nodes { ${CHAR_FIELDS} } } }
  }
}`;

async function query(q, variables) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: q, variables }),
    }).catch((err) => ({ ok: false, status: 0, err, headers: new Headers() }));
    if (res.ok) {
      // Fica sempre abaixo do limite: com 1 pedido sobrando, espera a janela virar.
      if (Number(res.headers.get('x-ratelimit-remaining')) <= 1) await wait(60_000);
      return (await res.json()).data.Page;
    }
    if (res.status === 400 || attempt >= 8) throw new Error(`AniList ${JSON.stringify(variables)}: HTTP ${res.status}`);
    const retry = Number(res.headers.get('retry-after')) || 30;
    console.log(`  AniList: HTTP ${res.status}, tentando de novo em ${retry}s`);
    await wait(retry * 1000);
  }
}

async function anilist({ want = 15000 }) {
  const byId = new Map();
  const add = (c, title) => {
    const img = c.image?.large || '';
    // Sem foto ou sem obra não dá um card decente.
    if (byId.has(c.id) || !img.startsWith(IMG_PREFIX) || img.endsWith('/default.jpg') || !title || !c.name?.full) return;
    const gender = c.gender === 'Female' ? 'F' : c.gender === 'Male' ? 'M' : '';
    byId.set(c.id, [c.id, c.name.full.trim(), (title.english || title.romaji).trim(), img.slice(IMG_PREFIX.length), gender, c.favourites || 0, 'a']);
  };
  for (let page = 1; page <= 100 && byId.size < want; page++) {
    const { pageInfo, characters } = await query(TOP_CHARACTERS, { page });
    for (const c of characters) add(c, c.media?.nodes?.[0]?.title);
    if (page % 20 === 0) console.log(`  anime, fase 1: ${byId.size}`);
    if (!pageInfo.hasNextPage) break;
  }
  for (const type of ['ANIME', 'MANGA']) {
    for (let page = 1; page <= 200 && byId.size < want; page++) {
      const { pageInfo, media } = await query(POPULAR_MEDIA, { page, type });
      for (const m of media) for (const c of m.characters.nodes) add(c, m.title);
      if (page % 10 === 0) console.log(`  anime, fase 2 (${type}): ${byId.size}`);
      if (!pageInfo.hasNextPage) break;
    }
  }
  return [...byId.values()].sort((a, b) => b[5] - a[5]).slice(0, want);
}

module.exports = { anilist };
