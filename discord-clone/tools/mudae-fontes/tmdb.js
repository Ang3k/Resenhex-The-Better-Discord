// Séries com atores (TMDB). Precisa de tmdbKey (a "API Key" ou o token de leitura). A foto do
// personagem é a do ator. Entram as séries mais votadas, sem animação (a foto seria a do dublador),
// reality, talk show, jornal e séries sobre gente real; de cada uma, o elenco principal. Popularidade: votos da série,
// dividido pela posição do ator nos créditos.
const { pacer, request, genderOf } = require('./comum');

const pace = pacer(120);
const SKIP_GENRES = '16,10763,10764,10767'; // animação, jornal, reality, talk show
const PER_SHOW = 12;
// Séries sobre gente real (Narcos, Dahmer, The Crown): a foto seria de um ator fazendo uma pessoa de verdade.
// based on true story, biography, true crime, historical figure.
const REAL_PEOPLE = new Set([9672, 5565, 33722, 6165]);
// E as que o TMDB não marcou: Band of Brothers, Pablo Escobar: O Patrão do Mal.
const BLOCKED_SHOWS = new Set([4613, 43348]);
const NOT_A_CHARACTER = /^(self|himself|herself|themselves|narrator|host|various|additional voices)\b|\bself\b/i;

async function tmdb({ want = 3000, keys }) {
  if (!keys.tmdbKey) throw new Error('falta tmdbKey em tools/mudae-chaves.json');
  const bearer = keys.tmdbKey.startsWith('eyJ');
  const api = async (path, params = {}) => {
    await pace();
    const query = new URLSearchParams({ language: 'pt-BR', ...params, ...(bearer ? {} : { api_key: keys.tmdbKey }) });
    return request(`https://api.themoviedb.org/3/${path}?${query}`, { headers: bearer ? { Authorization: `Bearer ${keys.tmdbKey}` } : {} }, { label: `TMDB ${path}` });
  };

  const shows = [];
  const needShows = Math.ceil((want / PER_SHOW) * 1.3);
  for (let page = 1; shows.length < needShows && page <= 50; page++) {
    const data = await api('discover/tv', { sort_by: 'vote_count.desc', without_genres: SKIP_GENRES, page: String(page) });
    shows.push(...data.results);
    if (page >= data.total_pages) break;
  }
  console.log(`  séries: ${shows.length} séries`);

  const rows = [];
  for (const [i, show] of shows.entries()) {
    if (BLOCKED_SHOWS.has(show.id)) continue;
    const details = await api(`tv/${show.id}`, { append_to_response: 'aggregate_credits,keywords' });
    if ((details.keywords?.results || []).some((k) => REAL_PEOPLE.has(k.id))) continue;
    const cast = (details.aggregate_credits?.cast || []).filter((p) => p.profile_path).sort((a, b) => a.order - b.order).slice(0, PER_SHOW);
    cast.forEach((p, order) => {
      const role = (p.roles || []).sort((a, b) => b.episode_count - a.episode_count)[0];
      const character = String(role?.character || '').split(/\s*\/\s*/)[0].replace(/\s*\(.*\)\s*$/, '').trim();
      if (!character || NOT_A_CHARACTER.test(character)) return;
      rows.push([`s${show.id}-${p.id}`, character, show.name, `https://image.tmdb.org/t/p/w342${p.profile_path}`,
        p.gender === 1 ? 'F' : p.gender === 2 ? 'M' : genderOf(''), Math.round((show.vote_count || 0) / (order + 1)), 's']);
    });
    if (i % 50 === 49) console.log(`  séries: ${rows.length} personagens`);
  }
  return rows.sort((a, b) => b[5] - a[5]).slice(0, want);
}

module.exports = { tmdb };
