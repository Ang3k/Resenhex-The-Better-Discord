// Personagens com retrato do IGDB, sem exigir um mínimo de avaliações do jogo.
const { pacer, request, genderOf } = require('./comum');
const { createCollection, normalize } = require('./coleta');

function gameWork(game) {
  const franchises = [game.franchise, ...(game.franchises || [])].filter((f) => f?.name);
  const names = [...new Set(franchises.map((f) => f.name))];
  if (names.length === 1) return names[0];
  const title = normalize(game.name);
  const matched = names.filter((name) => {
    const prefix = normalize(name);
    return title === prefix || title.startsWith(prefix + ' ');
  }).sort((a, b) => normalize(b).length - normalize(a).length);
  return matched[0] || game.name;
}

async function igdb({ keys, collection = createCollection('igdb') }) {
  if (!keys.igdbClientId || !keys.igdbClientSecret) throw new Error('faltam igdbClientId e igdbClientSecret em tools/mudae-chaves.json');
  const pace = pacer(300);
  let token;
  const api = (endpoint, body) => collection.unit(endpoint + ':' + body, async () => {
    token ||= await request('https://id.twitch.tv/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: keys.igdbClientId, client_secret: keys.igdbClientSecret, grant_type: 'client_credentials' }),
    }, { label: 'Twitch (login do IGDB)' });
    await pace();
    return request('https://api.igdb.com/v4/' + endpoint, {
      method: 'POST', headers: { 'Client-ID': keys.igdbClientId, Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'text/plain' }, body,
    }, { label: 'IGDB ' + endpoint });
  });
  collection.report.scope = { characters: 'todos com mug_shot, nome e jogo; sem mínimo de votos' };
  const rows = new Map();
  for (let offset = 0; ; offset += 500) {
    const page = await api('characters', `fields name,gender,character_gender.name,mug_shot.image_id,games.name,games.total_rating_count,games.franchise.name,games.franchises.name; where mug_shot != null; sort id asc; limit 500; offset ${offset};`);
    collection.count('fetched', page.length);
    for (const c of page) {
      const best = [...(c.games || [])].filter((g) => g.name).sort((a, b) => (b.total_rating_count || 0) - (a.total_rating_count || 0))[0];
      if (!best || !c.name || !c.mug_shot?.image_id) { collection.skip('semNomeImagemOuJogo'); continue; }
      const gender = c.character_gender?.name ? genderOf(c.character_gender.name) : c.gender === 0 ? 'M' : c.gender === 1 ? 'F' : '';
      rows.set(c.id, [`g${c.id}`, c.name.trim(), gameWork(best),
        `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${c.mug_shot.image_id}.jpg`, gender, best.total_rating_count || 0, 'g']);
    }
    if (page.length < 500) break;
  }
  return collection.finish([...rows.values()].sort((a, b) => b[5] - a[5]));
}

module.exports = { igdb, gameWork };
