// Jogos (IGDB, da Twitch). Precisa de igdbClientId e igdbClientSecret (conta de desenvolvedor da
// Twitch). Personagem não tem popularidade no IGDB: vale a do jogo mais popular em que aparece.
// Limite: 4 pedidos por segundo.
const { pacer, request, genderOf } = require('./comum');

const pace = pacer(300);
const IMG = (id) => `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${id}.jpg`;

async function igdb({ want = 5000, keys }) {
  if (!keys.igdbClientId || !keys.igdbClientSecret) throw new Error('faltam igdbClientId e igdbClientSecret em tools/mudae-chaves.json');
  const token = await request(`https://id.twitch.tv/oauth2/token?${new URLSearchParams({ client_id: keys.igdbClientId, client_secret: keys.igdbClientSecret, grant_type: 'client_credentials' })}`,
    { method: 'POST' }, { label: 'Twitch (login do IGDB)' });
  const api = async (endpoint, body) => {
    await pace();
    return request(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: { 'Client-ID': keys.igdbClientId, Authorization: `Bearer ${token.access_token}`, Accept: 'application/json', 'Content-Type': 'text/plain' },
      body,
    }, { label: `IGDB ${endpoint}` });
  };

  // Os jogos mais avaliados (só as versões principais, sem edições e relançamentos).
  const games = new Map();
  for (let offset = 0; offset < 3000; offset += 500) {
    const page = await api('games', `fields id,name,total_rating_count,franchise.name,franchises.name; where total_rating_count > 20 & version_parent = null; sort total_rating_count desc; limit 500; offset ${offset};`);
    for (const g of page) games.set(g.id, { name: g.franchise?.name || g.franchises?.[0]?.name || g.name, score: g.total_rating_count || 0 });
    if (page.length < 500) break;
  }
  console.log(`  jogos: ${games.size} jogos populares`);

  const chars = new Map();
  const ids = [...games.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200).join(',');
    for (let offset = 0; ; offset += 500) {
      const page = await api('characters', `fields name,gender,character_gender.name,mug_shot.image_id,games; where games = (${chunk}) & mug_shot != null; limit 500; offset ${offset};`);
      for (const c of page) {
        const best = (c.games || []).map((id) => games.get(id)).filter(Boolean).sort((a, b) => b.score - a.score)[0];
        if (!best || !c.mug_shot?.image_id || !c.name) continue;
        const key = c.name.toLowerCase() + '|' + best.name.toLowerCase();
        if (chars.has(key)) continue;
        const gender = c.character_gender?.name ? genderOf(c.character_gender.name) : c.gender === 0 ? 'M' : c.gender === 1 ? 'F' : '';
        chars.set(key, [`g${c.id}`, c.name.trim(), best.name, IMG(c.mug_shot.image_id), gender, best.score, 'g']);
      }
      if (page.length < 500) break;
    }
    if ((i / 200) % 3 === 2) console.log(`  jogos: ${chars.size} personagens`);
  }
  return [...chars.values()].sort((a, b) => b[5] - a[5]).slice(0, want);
}

module.exports = { igdb };
