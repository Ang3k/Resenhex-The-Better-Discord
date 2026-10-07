// Desenhos ocidentais (wikis do Fandom). Não há uma API de personagens: para cada franquia a
// lista sai da categoria de personagens da wiki, e o tamanho do artigo serve de popularidade
// (personagem importante tem artigo grande). A foto é a imagem principal da página e o gênero vem
// da ficha (infobox). Sem chave.
const { pacer, request, genderOf } = require('./comum');
const { createCollection, mergeByRank } = require('./coleta');
const { isAuxiliaryTitle } = require('./qualidade');
const { classifyFandomBiography, isRealPersonRow, realPeopleExclusions } = require('./pessoas-reais');

// wiki: subdomínio em fandom.com. byFilm: a obra vem da ficha
// (Disney, Pixar e DreamWorks têm personagens de muitos filmes).
const FRANCHISES = [
  { wiki: 'simpsons', series: 'Os Simpsons' },
  { wiki: 'futurama', series: 'Futurama' },
  { wiki: 'familyguy', series: 'Uma Família da Pesada' },
  { wiki: 'southpark', series: 'South Park' },
  { wiki: 'rickandmorty', series: 'Rick and Morty' },
  { wiki: 'avatar', series: 'Avatar: A Lenda de Aang' },
  { wiki: 'adventuretime', series: 'Hora de Aventura' },
  { wiki: 'gravityfalls', series: 'Gravity Falls' },
  { wiki: 'steven-universe', series: 'Steven Universo' },
  { wiki: 'phineasandferb', series: 'Phineas e Ferb' },
  { wiki: 'spongebob', series: 'Bob Esponja' },
  { wiki: 'ben10', series: 'Ben 10' },
  { wiki: 'teentitans', series: 'Jovens Titãs' },
  { wiki: 'looneytunes', series: 'Looney Tunes' },
  { wiki: 'hazbinhotel', series: 'Hazbin Hotel' },
  { wiki: 'theamazingworldofgumball', series: 'O Incrível Mundo de Gumball' },
  { wiki: 'regularshow', series: 'Apenas um Show' },
  { wiki: 'kimpossible', series: 'Kim Possible' },
  { wiki: 'dannyphantom', series: 'Danny Phantom' },
  { wiki: 'theowlhouse', series: 'A Casa da Coruja' },
  { wiki: 'totaldrama', series: 'Ilha dos Desafios' },
  { wiki: 'mlp', series: 'My Little Pony' },
  { wiki: 'powerpuffgirls', series: 'As Meninas Superpoderosas' },
  // A wiki da Disney também tem Marvel e Star Wars em live-action: fica só quem tem animador na ficha.
  { wiki: 'disney', series: 'Disney', byFilm: true, animatedOnly: true },
  { wiki: 'pixar', series: 'Pixar', byFilm: true },
  { wiki: 'dreamworks', series: 'DreamWorks', byFilm: true },
];
const SKIP = /^(lists? of|unnamed|minor characters|background characters)\b|\b(episodes?|galler(y|ies)|template|transcript|dialogue|quotes|roster)\b|\/|\b(family|families)$/i;
const SKIP_CATEGORY = /image|galler|template|stub|voice[ -]?overs?|talents|character stor(?:y|ies)|character storyline|constellations|outfits|costumes|animations/i;
const isAuxiliaryCategory = (name) => SKIP_CATEGORY.test(name)
  || (/\b(sound files|sound effects|audio|voices?|video files|icons?|squares|renders?|screenshots?|concept art|loading screens|skins?|portraits?|textures|particle effects|3d models)\b/i.test(name)
    && !/\b(characters?|npcs?|people|individuals)\b/i.test(name))
  || (/\b(episodes?|quests?|weapons?|items?)\b/i.test(name) && !/\b(characters?|npcs?|people|individuals)\b/i.test(name));
// Campos da ficha que dizem a obra, do melhor para o pior.
const FILM_FIELDS = ['films', 'film', 'movies', 'first', 'first appearance', 'first_appearance', 'debut', 'appear', 'appearances'];

const pace = pacer(150);
const stripHtml = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\[\d+\]/g, '').trim();

async function api(wiki, params) {
  // Namespace 0 contém artigos; type=page evita paginar milhares de arquivos filtrados.
  // O conjunto de artigos é o mesmo das consultas antigas guardadas no cache.
  if (params.generator === 'categorymembers' && params.gcmnamespace === '0') params = { ...params, gcmtype: 'page' };
  const url = `https://${wiki}.fandom.com/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return request(url, { headers: { 'User-Agent': 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)' } }, { label: `Fandom ${wiki}`, beforeAttempt: pace });
}

// Percorre todas as páginas/subcategorias, incluindo continuação e ciclos.
async function listCategory(wiki, category, apiCall = api) {
  const pages = new Map();
  const visited = new Set();
  const queue = Array.isArray(category) ? [...category] : [category];
  for (let i = 0; i < queue.length; i++) {
    const name = queue[i];
    if (visited.has(name)) continue;
    visited.add(name);
    let cont = {};
    do {
      const data = await apiCall(wiki, { action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + name, gcmlimit: '500', gcmnamespace: '0', prop: 'info', ...cont });
    for (const p of data.query?.pages || []) if (p.ns === undefined || p.ns === 0) pages.set(p.pageid, { id: p.pageid, title: p.title, length: p.length || 0 });
      cont = data.continue || null;
    } while (cont);
    cont = {};
    do {
      const data = await apiCall(wiki, { action: 'query', list: 'categorymembers', cmtitle: 'Category:' + name, cmtype: 'subcat', cmlimit: '500', ...cont });
      for (const sub of data.query?.categorymembers || []) {
        const child = sub.title.replace(/^Category:/, '');
        if (!isAuxiliaryCategory(child) && !visited.has(child)) queue.push(child);
      }
      cont = data.continue || null;
    } while (cont);
  }
  return [...pages.values()];
}

// Ficha do personagem: gênero e, para os estúdios, a obra (o primeiro filme).
function readInfobox(raw) {
  let gender = '';
  let film = '';
  let filmRank = Infinity;
  let actor = false;
  let animated = false;
  let characterFields = false;
  let mediaFields = false;
  try {
    for (const box of JSON.parse(raw || '[]')) {
      const walk = (items) => {
        for (const item of items || []) {
          if (item.type === 'group') { walk(item.data?.value); continue; }
          const source = String(item.data?.source || '').toLowerCase();
          const label = String(item.data?.label || '').toLowerCase();
          const value = stripHtml(item.data?.value);
          if (value && /^(gender|sex|species|race|occupation)$/.test(source)) characterFields = true;
          if (value && /^(episode|episode_number|season|original_broadcast|airdate|air_date|productioncode|production_code|runtime|director|producer|release_date|releasedate)$/.test(source)) mediaFields = true;
          if (!gender && /gender|sex/.test(source + ' ' + label)) gender = genderOf(value);
          if (['actor', 'actress', 'performer', 'portrayed'].includes(source)) actor = true;
          if (source === 'animator' || source === 'animators') animated = true;
          const rank = FILM_FIELDS.indexOf(source);
          if (rank >= 0 && rank < filmRank && value) {
            film = value.split('\n')[0].replace(/^["“]|["”]$/g, '').trim();
            filmRank = rank;
          }
        }
      };
      walk(box.data);
    }
  } catch { /* ficha em formato inesperado: segue sem ela */ }
  // Personagem de live-action (ator na ficha e nenhum animador): a foto seria de um ator, não de um desenho.
  return { gender, film, liveAction: actor && !animated, nonCharacter: mediaFields && !characterFields };
}

// Sem gênero na ficha: os pronomes da descrição decidem, se um lado ganhar com folga.
function genderFromText(text) {
  const t = String(text || '').toLowerCase();
  const he = (t.match(/\b(he|his|him|himself|boy|man)\b/g) || []).length;
  const she = (t.match(/\b(she|her|hers|herself|girl|woman)\b/g) || []).length;
  if (he >= 2 && he >= she * 2) return 'M';
  if (she >= 2 && she >= he * 2) return 'F';
  return '';
}

// Imagem em tamanho de card (o CDN do Fandom redimensiona pela URL).
const cardImage = (url) => url.replace(/\/revision\/latest(\/[^?]*)?/, '/revision/latest/scale-to-width-down/400');

async function franchise(f, letter, collection, apiCall) {
  const pages = new Map();
  // Inclui NPCs da categoria geral, além da categoria específica de jogáveis/heróis.
  for (const p of await listCategory(f.wiki, [...new Set(['Characters', f.category || 'Characters'])], apiCall)) pages.set(p.id, p);
  collection.count('listed', pages.size);
  const listed = [...pages.values()].filter((p) => {
    if (!SKIP.test(p.title) && !isAuxiliaryTitle(p.title)) return true;
    collection.skip('paginaAuxiliar'); return false;
  }).sort((a, b) => b.length - a.length);
  const rows = [];
  for (let i = 0; i < listed.length; i += 50) {
    const batch = listed.slice(i, i + 50);
    const data = await apiCall(f.wiki, { action: 'query', pageids: batch.map((p) => p.id).join('|'), prop: 'pageimages|pageprops', piprop: 'original', ppprop: 'infoboxes|fandomdescription' });
    const byId = new Map((data.query?.pages || []).map((p) => [p.pageid, p]));
    for (const p of batch) {
      const page = byId.get(p.id);
      const id = `${letter}-${f.wiki}-${p.id}`;
      const biography = classifyFandomBiography(page);
      if (biography || isRealPersonRow([id])) {
        collection.skip('biografiaPessoaReal');
        if (biography) (collection.report.excludedRealPeople ||= []).push({ id, name: p.title, ...biography });
        continue;
      }
      const img = page?.original?.source;
      if (!img || /\.(svg|gif)(\/|\?|$)/i.test(img)) { collection.skip('semImagemUtil'); continue; }
      const info = readInfobox(page.pageprops?.infoboxes);
      if (info.nonCharacter) { collection.skip('fichaDeEpisodioOuFilme'); continue; }
      if (f.animatedOnly && info.liveAction) { collection.skip('liveAction'); continue; }
      const gender = info.gender || genderFromText(page.pageprops?.fandomdescription);
      const name = p.title.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const series = f.byFilm && info.film && info.film.length < 60 ? info.film : f.series;
      rows.push([id, name, series, cardImage(img), gender, p.length, letter]);
    }
  }
  collection.progress(f.wiki, { status: 'complete', listed: pages.size, accepted: rows.length });
  return rows;
}

// Personagens de jogos que o IGDB não tem com retrato: as wikis dos jogos mais jogados.
const GAME_FRANCHISES = [
  // Nos gachas, o artigo mais longo costuma ser de NPC (transcrição de missão): vale a categoria de jogáveis.
  { wiki: 'genshin-impact', series: 'Genshin Impact', category: 'Playable Characters' },
  { wiki: 'honkai-star-rail', series: 'Honkai: Star Rail', category: 'Playable Characters' },
  { wiki: 'wutheringwaves', series: 'Wuthering Waves', category: 'Playable Resonators' },
  { wiki: 'leagueoflegends', series: 'League of Legends' },
  { wiki: 'overwatch', series: 'Overwatch', category: 'Heroes' },
  { wiki: 'apexlegends', series: 'Apex Legends', category: 'Legends' },
  { wiki: 'freefire', series: 'Free Fire' },
  { wiki: 'zelda', series: 'The Legend of Zelda' },
  { wiki: 'mario', series: 'Super Mario' },
  { wiki: 'sonic', series: 'Sonic' },
  { wiki: 'streetfighter', series: 'Street Fighter' },
  { wiki: 'mortalkombat', series: 'Mortal Kombat' },
  { wiki: 'tekken', series: 'Tekken' },
  { wiki: 'finalfantasy', series: 'Final Fantasy' },
  { wiki: 'kingdomhearts', series: 'Kingdom Hearts' },
  { wiki: 'megamitensei', series: 'Persona / Shin Megami Tensei' },
  { wiki: 'residentevil', series: 'Resident Evil' },
  { wiki: 'masseffect', series: 'Mass Effect' },
  { wiki: 'eldenring', series: 'Elden Ring' },
  { wiki: 'darksouls', series: 'Dark Souls' },
  { wiki: 'halo', series: 'Halo' },
  { wiki: 'thelastofus', series: 'The Last of Us' },
  { wiki: 'deltarune', series: 'Deltarune' },
  { wiki: 'undertale', series: 'Undertale' },
  { wiki: 'cuphead', series: 'Cuphead' },
];

async function fandom({ franchises = FRANCHISES, letter = 'd', label = 'desenhos', previous = [], collection = createCollection(label + '-fandom') } = {}) {
  collection.report.scope = { wikis: franchises.map((f) => f.wiki), characters: 'categorias completas; inclui NPCs; sem cotas' };
  const apiCall = async (wiki, params) => {
    const data = await collection.unit(wiki + ':' + JSON.stringify(params), () => api(wiki, params));
    if (data.error) throw new Error('Fandom ' + wiki + ': ' + data.error.code + ' ' + (data.error.info || ''));
    return data;
  };
  const lists = new Array(franchises.length);
  let next = 0;
  const worker = async () => {
    while (next < franchises.length) {
      const index = next++;
      const f = franchises[index];
      try {
        const rows = await franchise(f, letter, collection, apiCall);
        console.log(`  ${label}: ${f.series} — ${rows.length}`);
        lists[index] = rows;
        if (!rows.length) collection.error(f.wiki, new Error('Categoria sem fichas utilizáveis'));
      } catch (err) {
        collection.error(f.wiki, err);
        console.log(`  ${label}: ${f.series} falhou (${err.message.slice(0, 120)})`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, franchises.length) }, worker));
  const exclusions = realPeopleExclusions(collection.cacheDir);
  for (const entry of collection.report.excludedRealPeople || []) exclusions.set(String(entry.id), entry);
  return collection.finish(mergeByRank(lists.filter(Boolean), previous.filter((r) => !isRealPersonRow(r, exclusions))).filter((r) => !isRealPersonRow(r, exclusions)));
}

module.exports = { fandom, FRANCHISES, GAME_FRANCHISES, listCategory, readInfobox };
