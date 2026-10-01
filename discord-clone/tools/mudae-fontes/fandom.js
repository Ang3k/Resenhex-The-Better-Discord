// Desenhos ocidentais (wikis do Fandom). Não há uma API de personagens: para cada franquia a
// lista sai da categoria de personagens da wiki, e o tamanho do artigo serve de popularidade
// (personagem importante tem artigo grande). A foto é a imagem principal da página e o gênero vem
// da ficha (infobox). Sem chave.
const { pacer, request, genderOf } = require('./comum');

// wiki: subdomínio em fandom.com. take: quantos personagens entram. byFilm: a obra vem da ficha
// (Disney, Pixar e DreamWorks têm personagens de muitos filmes).
const FRANCHISES = [
  { wiki: 'simpsons', series: 'Os Simpsons', take: 220 },
  { wiki: 'futurama', series: 'Futurama', take: 90 },
  { wiki: 'familyguy', series: 'Uma Família da Pesada', take: 100 },
  { wiki: 'southpark', series: 'South Park', take: 120 },
  { wiki: 'rickandmorty', series: 'Rick and Morty', take: 120 },
  { wiki: 'avatar', series: 'Avatar: A Lenda de Aang', take: 140 },
  { wiki: 'adventuretime', series: 'Hora de Aventura', take: 120 },
  { wiki: 'gravityfalls', series: 'Gravity Falls', take: 80 },
  { wiki: 'steven-universe', series: 'Steven Universo', take: 90 },
  { wiki: 'phineasandferb', series: 'Phineas e Ferb', take: 80 },
  { wiki: 'spongebob', series: 'Bob Esponja', take: 120 },
  { wiki: 'ben10', series: 'Ben 10', take: 100 },
  { wiki: 'teentitans', series: 'Jovens Titãs', take: 60 },
  { wiki: 'looneytunes', series: 'Looney Tunes', take: 80 },
  { wiki: 'hazbinhotel', series: 'Hazbin Hotel', take: 50 },
  { wiki: 'theamazingworldofgumball', series: 'O Incrível Mundo de Gumball', take: 70 },
  { wiki: 'regularshow', series: 'Apenas um Show', take: 70 },
  { wiki: 'kimpossible', series: 'Kim Possible', take: 50 },
  { wiki: 'dannyphantom', series: 'Danny Phantom', take: 50 },
  { wiki: 'theowlhouse', series: 'A Casa da Coruja', take: 50 },
  { wiki: 'totaldrama', series: 'Ilha dos Desafios', take: 70 },
  { wiki: 'mlp', series: 'My Little Pony', take: 70 },
  { wiki: 'powerpuffgirls', series: 'As Meninas Superpoderosas', take: 50 },
  // A wiki da Disney também tem Marvel e Star Wars em live-action: fica só quem tem animador na ficha.
  { wiki: 'disney', series: 'Disney', take: 400, byFilm: true, animatedOnly: true },
  { wiki: 'pixar', series: 'Pixar', take: 120, byFilm: true },
  { wiki: 'dreamworks', series: 'DreamWorks', take: 150, byFilm: true },
];
const MAX_LISTED = 8000; // páginas listadas por wiki (a Disney tem mais de 12 mil)
const SKIP = /\b(list|lists|episode|gallery|galleries|family|families|characters|cast|crew|minor|unnamed|template|inhabitants|residents|citizens|townsfolk|people|members|crowd|staff|army|soldiers|guards|students|creatures|house|home|room|ship|island|town|city|planet|school|relationship|quotes|roster|transcript|dialogue)\b|\/| and /i;
// Campos da ficha que dizem a obra, do melhor para o pior.
const FILM_FIELDS = ['films', 'film', 'movies', 'first', 'first appearance', 'first_appearance', 'debut', 'appear', 'appearances'];

const pace = pacer(150);
const stripHtml = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\[\d+\]/g, '').trim();

async function api(wiki, params) {
  await pace();
  const url = `https://${wiki}.fandom.com/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return request(url, { headers: { 'User-Agent': 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)' } }, { label: `Fandom ${wiki}` });
}

// Páginas (com tamanho) de uma categoria; se ela quase não tem páginas, entra um nível nas subcategorias.
async function listCategory(wiki, category, depth = 0) {
  const pages = new Map();
  let cont = {};
  do {
    const data = await api(wiki, { action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + category, gcmlimit: '500', gcmnamespace: '0', prop: 'info', ...cont });
    for (const p of data.query?.pages || []) pages.set(p.pageid, { id: p.pageid, title: p.title, length: p.length || 0 });
    cont = data.continue || null;
  } while (cont && pages.size < MAX_LISTED);
  if (pages.size >= 40 || depth > 0) return [...pages.values()];
  const subcats = await api(wiki, { action: 'query', list: 'categorymembers', cmtitle: 'Category:' + category, cmtype: 'subcat', cmlimit: '50' });
  for (const sub of subcats.query?.categorymembers || []) {
    const name = sub.title.replace(/^Category:/, '');
    if (/image|gallery|template|stub/i.test(name)) continue;
    for (const p of await listCategory(wiki, name, depth + 1)) pages.set(p.id, p);
    if (pages.size >= MAX_LISTED) break;
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
  try {
    for (const box of JSON.parse(raw || '[]')) {
      const walk = (items) => {
        for (const item of items || []) {
          if (item.type === 'group') { walk(item.data?.value); continue; }
          const source = String(item.data?.source || '').toLowerCase();
          const label = String(item.data?.label || '').toLowerCase();
          const value = stripHtml(item.data?.value);
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
  return { gender, film, liveAction: actor && !animated };
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

async function franchise(f, letter) {
  const listed = (await listCategory(f.wiki, f.category || 'Characters'))
    .filter((p) => !SKIP.test(p.title))
    .sort((a, b) => b.length - a.length)
    .slice(0, Math.ceil(f.take * 1.6));
  const rows = [];
  for (let i = 0; i < listed.length && rows.length < f.take; i += 50) {
    const batch = listed.slice(i, i + 50);
    const data = await api(f.wiki, { action: 'query', pageids: batch.map((p) => p.id).join('|'), prop: 'pageimages|pageprops', piprop: 'original', ppprop: 'infoboxes|fandomdescription' });
    const byId = new Map((data.query?.pages || []).map((p) => [p.pageid, p]));
    for (const p of batch) {
      const page = byId.get(p.id);
      const img = page?.original?.source;
      if (!img || /\.(svg|gif)(\/|\?|$)/i.test(img)) continue;
      const info = readInfobox(page.pageprops?.infoboxes);
      if (f.animatedOnly && info.liveAction) continue;
      const gender = info.gender || genderFromText(page.pageprops?.fandomdescription);
      const { film } = info;
      const name = p.title.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const series = f.byFilm && film && film.length < 60 ? film : f.series;
      rows.push([`${letter}-${f.wiki}-${p.id}`, name, series, cardImage(img), gender, p.length, letter]);
      if (rows.length >= f.take) break;
    }
  }
  return rows;
}

// Personagens de jogos que o IGDB não tem com retrato: as wikis dos jogos mais jogados.
const GAME_FRANCHISES = [
  // Nos gachas, o artigo mais longo costuma ser de NPC (transcrição de missão): vale a categoria de jogáveis.
  { wiki: 'genshin-impact', series: 'Genshin Impact', take: 134, category: 'Playable Characters' },
  { wiki: 'honkai-star-rail', series: 'Honkai: Star Rail', take: 88, category: 'Playable Characters' },
  { wiki: 'wutheringwaves', series: 'Wuthering Waves', take: 60, category: 'Playable Resonators' },
  { wiki: 'leagueoflegends', series: 'League of Legends', take: 150 },
  { wiki: 'overwatch', series: 'Overwatch', take: 45, category: 'Heroes' },
  { wiki: 'apexlegends', series: 'Apex Legends', take: 30, category: 'Legends' },
  { wiki: 'freefire', series: 'Free Fire', take: 40 },
  { wiki: 'zelda', series: 'The Legend of Zelda', take: 120 },
  { wiki: 'mario', series: 'Super Mario', take: 150 },
  { wiki: 'sonic', series: 'Sonic', take: 70 },
  { wiki: 'streetfighter', series: 'Street Fighter', take: 80 },
  { wiki: 'mortalkombat', series: 'Mortal Kombat', take: 80 },
  { wiki: 'tekken', series: 'Tekken', take: 60 },
  { wiki: 'finalfantasy', series: 'Final Fantasy', take: 120 },
  { wiki: 'kingdomhearts', series: 'Kingdom Hearts', take: 60 },
  { wiki: 'megamitensei', series: 'Persona / Shin Megami Tensei', take: 60 },
  { wiki: 'residentevil', series: 'Resident Evil', take: 60 },
  { wiki: 'masseffect', series: 'Mass Effect', take: 50 },
  { wiki: 'eldenring', series: 'Elden Ring', take: 50 },
  { wiki: 'darksouls', series: 'Dark Souls', take: 40 },
  { wiki: 'halo', series: 'Halo', take: 40 },
  { wiki: 'thelastofus', series: 'The Last of Us', take: 30 },
  { wiki: 'deltarune', series: 'Deltarune', take: 35 },
  { wiki: 'undertale', series: 'Undertale', take: 30 },
  { wiki: 'cuphead', series: 'Cuphead', take: 35 },
];

async function fandom({ franchises = FRANCHISES, letter = 'd', label = 'desenhos' } = {}) {
  const all = [];
  for (const f of franchises) {
    try {
      const rows = await franchise(f, letter);
      console.log(`  ${label}: ${f.series} — ${rows.length}`);
      all.push(...rows);
    } catch (err) {
      console.log(`  ${label}: ${f.series} falhou (${err.message.slice(0, 120)})`);
    }
  }
  // A popularidade é o tamanho do artigo, que muda de wiki para wiki: compara pela posição
  // dentro da própria franquia (o 1º de cada uma fica no topo, depois os 2ºs…).
  // Cada franquia já vem do maior artigo para o menor.
  const seen = new Map();
  for (const row of all) {
    const wiki = row[0].slice(2, row[0].lastIndexOf('-'));
    const n = (seen.get(wiki) || 0) + 1;
    seen.set(wiki, n);
    row[5] = Math.round(1e6 / n);
  }
  // Mesmo nome duas vezes (os Ricks alternativos, o Bob Esponja de visita nos Simpsons): fica o
  // da franquia em que ele é mais importante.
  const names = new Set();
  return all.sort((a, b) => b[5] - a[5]).filter((row) => {
    const key = row[1].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (names.has(key)) return false;
    names.add(key);
    return true;
  });
}

module.exports = { fandom, FRANCHISES, GAME_FRANCHISES };
