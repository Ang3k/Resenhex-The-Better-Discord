// Elencos completos das séries já presentes e das séries populares selecionadas.
const { pacer, request } = require('./comum');
const { createCollection, normalize, suffix } = require('./coleta');

const SKIP_GENRES = '16,10763,10764,10767';
const REAL_PEOPLE = new Set([9672, 5565, 33722, 6165]);
const BLOCKED_SHOWS = new Set([4613, 43348]);
const NOT_A_CHARACTER = /^(self|himself|herself|themselves|narrator|host|various|additional voices)\b|\bself\b/i;
const GENERIC = /^(?:unknown|unnamed|uncredited|extra|background|crowd|student|guard|soldier|officer|police officer|detective|doctor|nurse|waiter|waitress|bartender|cashier|customer|receptionist|reporter|anchor|announcer|dancer|driver|man|woman|boy|girl|child|baby|visitor|guest|passerby|pedestrian|realtor|manager|actor|actress|attendant|homem|mulher|garoto|garota|criança|estudante|policial|guarda|soldado|médico|enfermeira|figurante)(?:\s*(?:#?\d+|one|two|three))?$/i;
const DESCRIBED_EXTRA = /^(?:(?:a|an|the|young|old|older|teenage|teen|little|tall|short|fat|thin|long-haired|bald|blind|drunk|angry|crying|dead|pregnant|homeless|unidentified|unnamed|beautiful|attractive|injured|male|female|white|black|asian|hispanic|armed|military|police|security|prison|hospital|school|college|drama|detention|backup|fbi|dea)\s+)*(?:man|woman|boy|girl|kid|child|baby|student|guard|soldier|agent|officer|nurse|doctor|patron|customer|shopper|singer|dancer|driver|tech|technician|worker|waiter|waitress|photographer|umpire|teen|homem|mulher|garoto|garota|criança|estudante|guarda|soldado|agente|cliente)(?:\s+(?:(?:in|at|on|with|from|of|wearing|holding|em|com|de|da|do)\b.*|#?\d+))?$/i;
const isGeneric = (name) => normalize(name) !== 'the doctor' && (GENERIC.test(name) || DESCRIBED_EXTRA.test(name) || /\s#\d+\b/.test(name));
const roleNames = (value) => String(value || '').split(/\s*\/\s*/).map((s) => s.replace(/\s*\([^)]*\)\s*/g, ' ').trim()).filter(Boolean);

function castRows(show, cast, previous = [], collection) {
  const old = new Map(previous.map((r) => [String(r[0]), r]));
  const publishedNames = new Set(previous.filter((r) => String(r[0]).startsWith('s' + show.id + '-')).map((r) => normalize(r[1])));
  const rows = [];
  const seen = new Set();
  for (const [order, person] of [...cast].sort((a, b) => a.order - b.order).entries()) {
    if (!person.profile_path) { collection?.skip('semImagem'); continue; }
    const names = [];
    for (const role of [...(person.roles || [])].sort((a, b) => b.episode_count - a.episode_count)) {
      if (NOT_A_CHARACTER.test(role.character || '')) { collection?.skip('pessoaInterpretandoASi'); continue; }
      for (const name of roleNames(role.character)) {
        if (NOT_A_CHARACTER.test(name) || (isGeneric(name) && !publishedNames.has(normalize(name)))) { collection?.skip('papelGenerico'); continue; }
        if (!names.some((n) => normalize(n) === normalize(name))) names.push(name);
      }
    }
    const base = 's' + show.id + '-' + person.id;
    const legacy = old.get(base);
    const primary = legacy ? names.find((n) => normalize(n) === normalize(legacy[1])) : names[0];
    for (const name of names) {
      const key = normalize(name);
      // A mesma personagem pode ter vários atores (idade, substituição, temporadas).
      if (seen.has(key) && !(legacy && normalize(legacy[1]) === key) && !old.has(base + '-' + suffix(key))) {
        collection?.skip('mesmoPersonagem'); continue;
      }
      const id = name === primary ? base : base + '-' + suffix(key);
      rows.push([id, name, show.name, 'https://image.tmdb.org/t/p/w342' + person.profile_path,
        person.gender === 1 ? 'F' : person.gender === 2 ? 'M' : '', Math.round((show.vote_count || 0) / (order + 1)), 's']);
      seen.add(key);
    }
  }
  return rows;
}

async function tmdb({ keys, previous = [], showCount = 340, collection = createCollection('series') }) {
  if (!keys.tmdbKey) throw new Error('falta tmdbKey em tools/mudae-chaves.json');
  const pace = pacer(120);
  const bearer = keys.tmdbKey.startsWith('eyJ');
  const api = (endpoint, params = {}) => collection.unit(endpoint + ':' + JSON.stringify(params), async () => {
    await pace();
    const query = new URLSearchParams({ language: 'pt-BR', ...params, ...(bearer ? {} : { api_key: keys.tmdbKey }) });
    return request('https://api.themoviedb.org/3/' + endpoint + '?' + query,
      { headers: bearer ? { Authorization: 'Bearer ' + keys.tmdbKey } : {} }, { label: 'TMDB ' + endpoint });
  });
  const shows = new Map();
  for (const row of previous) {
    const match = String(row[0]).match(/^s(\d+)-/);
    if (match) shows.set(Number(match[1]), { id: Number(match[1]), name: row[2] });
  }
  collection.report.scope = { existingShows: shows.size, popularShows: showCount, characters: 'todos os papéis nomeados com foto; sem teto por série' };
  let popular = 0;
  for (let page = 1; popular < showCount; page++) {
    const data = await api('discover/tv', { sort_by: 'vote_count.desc', without_genres: SKIP_GENRES, page: String(page) });
    for (const show of data.results || []) {
      if (popular++ >= showCount) break;
      shows.set(show.id, show);
    }
    if (page >= data.total_pages || !data.results?.length) break;
  }
  const rows = [];
  for (const show of shows.values()) {
    if (BLOCKED_SHOWS.has(show.id)) { collection.skip('seriePessoaReal'); continue; }
    try {
      const details = await api('tv/' + show.id, { append_to_response: 'aggregate_credits,keywords' });
      if ((details.keywords?.results || []).some((k) => REAL_PEOPLE.has(k.id))) { collection.skip('seriePessoaReal'); continue; }
      const cast = details.aggregate_credits?.cast || [];
      collection.count('castFetched', cast.length);
      const accepted = castRows(details, cast, previous, collection);
      rows.push(...accepted);
      collection.progress(String(show.id), { name: details.name, status: 'complete', fetched: cast.length, accepted: accepted.length });
      if (Object.keys(collection.report.units).length % 25 === 0) console.log('  séries: ' + Object.keys(collection.report.units).length + '/' + shows.size + ' séries, ' + rows.length + ' fichas');
    } catch (err) { collection.error(String(show.id), err); }
  }
  return collection.finish(rows.sort((a, b) => b[5] - a[5]));
}

module.exports = { tmdb, castRows, roleNames, isGeneric };
