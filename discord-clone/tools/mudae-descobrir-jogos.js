#!/usr/bin/env node
// Descobre jogos que ainda não estão no catálogo e acha a wiki do Fandom de cada um, sem lista manual.
//   1. Wikidata (aberto): jogos, séries e franquias de jogos mais famosos (número de edições da Wikipédia) com artigo no Fandom (P6262);
//   2. a wiki PRÓPRIA do jogo é a que tem o nome parecido com o título ("Doom" -> doom; "The Witcher 3" -> witcher);
//   3. a wiki diz as suas categorias de personagens (Characters, NPCs, Bosses, "X characters"...) e o tamanho de cada uma;
//   4. gera tools/mudae-cache/prototipos/jogos-descobertos.json, que o fandom-expandido.js junta à lista de jogos.
// Nunca repete uma wiki que já é coletada nem uma obra que já está no catálogo. Cada passo guarda o que fez: pode ser interrompido.
//   node tools/mudae-descobrir-jogos.js [--max=400] [--min-edicoes=14] [--do-zero]
const fs = require('fs');
const path = require('path');
const { normalize } = require('./mudae-fontes/coleta');

const CACHE = process.env.MUDAE_CACHE || path.join(__dirname, 'mudae-cache');
const PROTO = path.join(CACHE, 'prototipos');
const SAIDA = path.join(PROTO, 'jogos-descobertos.json');
const ESTADO = path.join(PROTO, 'jogos-descobertos-estado.json');
const UA = { 'User-Agent': 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const opt = (n, d) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? Number(a.split('=')[1]) : d; };

// Wikis de empresa, plataforma, anime ou filme que o Wikidata classifica como jogo: não são obras de jogo (ou já vêm de outra fonte).
const EXCLUIR = new Set(['dragonball', 'nintendo', 'playstation', 'sega', 'jump', 'backtothefuture', 'tron', 'minecraftdungeons-archive', 'ettheextraterrestrial']);
// Nome da wiki que não diz o nome da obra.
const RENOMEAR = { arwingpedia: 'Star Fox', mmkb: 'Mega Man', infernopedia: "Dante's Inferno", 'lara croft': 'Tomb Raider', 'mario kart racing': 'Mario Kart', 'age of empires series': 'Age of Empires', 'golden sun universe': 'Golden Sun', 'papers please': 'Papers, Please', chrono: 'Chrono Trigger', 'minecraft: dungeons': 'Minecraft Dungeons' };

// ---- 1. Wikidata
const SPARQL = (min) => `SELECT ?item ?itemLabel ?sl (GROUP_CONCAT(DISTINCT ?f; separator="|") AS ?wikis) WHERE {
  VALUES ?cls { wd:Q7889 wd:Q7058673 wd:Q116741853 }
  ?item wdt:P31 ?cls . ?item wdt:P6262 ?f . ?item wikibase:sitelinks ?sl .
  FILTER(?sl >= ${min})
  SERVICE wikibase:label { bd:serviceParam wikibase:language 'en'. }
} GROUP BY ?item ?itemLabel ?sl ORDER BY DESC(?sl) LIMIT 3000`;

async function jogosDoWikidata(min) {
  for (let t = 1; t <= 6; t++) {
    try {
      const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(SPARQL(min)), { headers: { ...UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(90000) });
      if (r.ok) return (await r.json()).results.bindings.map((b) => ({ id: b.item.value.split('/').pop(), titulo: b.itemLabel.value, edicoes: Number(b.sl.value), wikis: b.wikis.value.split('|').map((x) => x.split(':')[0]) }));
    } catch { /* tenta de novo */ }
    await wait(5000 * t);
  }
  throw new Error('Wikidata não respondeu.');
}

// ---- 2. Qual wiki é a do jogo?  Slug e título parecidos: "doom" x "Doom", "witcher" x "The Witcher 3: Wild Hunt".
const compacto = (s) => normalize(s).replace(/ /g, '');
const palavras = (s) => normalize(s).split(' ').filter((w) => w.length > 1 && !['the', 'of', 'and', 'a', 'an', 'game', 'games', 'video'].includes(w));
function wikiDoJogo(titulo, slugs) {
  const t = compacto(titulo);
  const base = compacto(titulo.replace(/[:–—-].*$/, '')); // "The Witcher 3: Wild Hunt" -> "thewitcher3"
  const semArtigo = base.replace(/^the/, '');
  const prim = palavras(titulo)[0] || '';
  let melhor = null;
  for (const slug of slugs) {
    if (/\./.test(slug)) continue; // wikis em outros idiomas (pl.minecraft)
    const s = slug.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!s) continue;
    let nota = 0;
    if (s === t || s === base) nota = 100;
    else if (s === semArtigo) nota = 95;
    else if (s.replace(/wiki$|fandom$|archive$|pedia$/, '') === base || s.replace(/wiki$|pedia$/, '') === semArtigo) nota = 90;
    else if (prim.length >= 4 && s === prim) nota = 70;
    else if (semArtigo.length >= 5 && (s.startsWith(semArtigo) || semArtigo.startsWith(s)) && s.length >= 5) nota = 60;
    if (nota && (!melhor || nota > melhor.nota || (nota === melhor.nota && s.length < melhor.slug.replace(/[^a-z0-9]/gi, '').length))) melhor = { slug, nota };
  }
  return melhor && melhor.nota >= 60 ? melhor : null;
}

// ---- 3. Categorias de personagens da wiki
const categoriaDePersonagem = [
  /^characters?$/i, /^playable characters?$/i, /^npcs?$/i, /^main characters?$/i, /^bosses$/i, /^villains$/i, /^heroes$/i,
  /^(?:[\w'!.: &-]{2,40}) characters?$/i, /^characters? in [\w'!.: &-]{2,50}$/i, /^(?:[\w'!.: &-]{2,40}) bosses$/i, /^(?:[\w'!.: &-]{2,40}) npcs?$/i, /^companions?$/i, /^agents$/i, /^operators$/i, /^champions$/i,
];
const RUIM = /(?:quote|dialogue|audio|gallery|galleries|trivia|history|quest|mod|template|achievement|redirect|stub|fanon|cosplay|merch|music|song|voice|soundtrack|cards?|skins?|items?|weapons?|locations?|enemies in|deceased|unused|cut |removed|concept|development|real|people|staff|crew|actors|screenshots?)/i;

async function api(wiki, params) {
  const url = `https://${wiki}.fandom.com/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let t = 1; t <= 4; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 404 || r.status === 410) return null;
      if (r.ok) return JSON.parse(await r.text());
    } catch { /* tenta de novo */ }
    await wait(1500 * t);
  }
  return undefined; // erro de rede: não decide nada sobre esta wiki
}

async function categoriasDe(slug) {
  const todas = [];
  let from = '';
  for (let i = 0; i < 8; i++) {
    const d = await api(slug, { action: 'query', list: 'allcategories', aclimit: '500', acprop: 'size', acfrom: from });
    if (d === null) return null;
    if (d === undefined) return undefined;
    todas.push(...(d.query?.allcategories || []));
    if (!d.continue) break;
    from = d.continue.accontinue;
    await wait(300);
  }
  return todas;
}

function escolherCategorias(todas) {
  const boas = todas.filter((c) => c.pages >= 4 && categoriaDePersonagem.some((re) => re.test(c.category)) && !RUIM.test(c.category))
    .sort((a, b) => b.pages - a.pages);
  const escolhidas = [];
  let total = 0;
  for (const c of boas) { if (escolhidas.length >= 8) break; escolhidas.push(c.category); total += c.pages; }
  return { categorias: escolhidas, estimativa: total };
}

async function siteName(slug) {
  const d = await api(slug, { action: 'query', meta: 'siteinfo', siprop: 'general' });
  return d?.query?.general?.sitename || null;
}

// O título do Wikidata é de UM jogo ("Far Cry 3"); a wiki cobre a franquia, e o nome dela ("Far Cry Wiki") diz melhor a obra.
function nomeDaObra(a) {
  const site = String(a.siteName || '').replace(/s*[-–|:]?s*(?:wiki|fandom|database|encyclopedia|archive|wikia)s*$/i, '').replace(/^thes+(?=S+s+S+)/i, '').trim();
  const nome = site.length >= 3 && site.length <= 60 ? site : a.series;
  return RENOMEAR[nome.toLowerCase()] || nome;
}

async function main() {
  const max = opt('max', 400);
  const min = opt('min-edicoes', 14);
  fs.mkdirSync(PROTO, { recursive: true });
  const { FRANCHISES, GAME_FRANCHISES } = require('./mudae-fontes/fandom');
  const { JOGOS_MANUAIS, DESENHOS, QUADRINHOS, SERIES } = require('./mudae-fontes/fandom-expandido');
  // Os descobertos de rodadas anteriores ficam de fora desta conta, senão sumiriam do arquivo ao rodar de novo.
  const jaTemos = new Set([...FRANCHISES, ...GAME_FRANCHISES, ...JOGOS_MANUAIS, ...DESENHOS, ...QUADRINHOS, ...SERIES].map((f) => f.wiki));
  // Obras já no catálogo publicado (nome normalizado): não repete jogo que já temos por outra fonte (IGDB).
  const pub = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'mudae-catalogo.json'), 'utf8'));
  const obrasPublicadas = new Set(pub.filter((r) => r[6] === 'g').map((r) => normalize(r[2])));
  const obrasManuais = new Set([...FRANCHISES, ...GAME_FRANCHISES, ...JOGOS_MANUAIS].map((f) => normalize(f.series)));

  const estado = !process.argv.includes('--do-zero') && fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, 'utf8')) : { feitos: {} };
  const salvar = () => fs.writeFileSync(ESTADO, JSON.stringify(estado));

  console.log('Wikidata: jogos com artigo no Fandom e >= ' + min + ' edições da Wikipédia...');
  const jogos = await jogosDoWikidata(min);
  console.log('  ' + jogos.length + ' jogos/séries');

  const achados = [];
  const visto = new Set();
  let consultados = 0;
  for (const j of jogos) {
    if (achados.length >= max) break;
    const m = wikiDoJogo(j.titulo, j.wikis);
    if (!m || visto.has(m.slug) || jaTemos.has(m.slug)) continue;
    visto.add(m.slug);
    const nome = normalize(j.titulo);
    if (obrasManuais.has(nome)) continue;
    if (estado.feitos[m.slug]) { if (estado.feitos[m.slug].categorias?.length) achados.push(estado.feitos[m.slug]); continue; }
    consultados++;
    const todas = await categoriasDe(m.slug);
    if (todas === undefined) { console.log('  sem rede em ' + m.slug + ': fica para a próxima rodada'); continue; }
    if (todas === null) { estado.feitos[m.slug] = { slug: m.slug, categorias: [] }; salvar(); continue; }
    const { categorias, estimativa } = escolherCategorias(todas);
    const jaNoCatalogo = obrasPublicadas.has(nome);
    const registro = { wiki: m.slug, series: j.titulo, wikidata: j.id, edicoes: j.edicoes, nota: m.nota, categorias, estimativa, jaNoCatalogo };
    if (categorias.length) { registro.siteName = await siteName(m.slug); }
    estado.feitos[m.slug] = registro;
    if (consultados % 10 === 0) salvar();
    if (categorias.length) { achados.push(registro); console.log('  ' + j.titulo + ' -> ' + m.slug + ' (' + estimativa + ' personagens em ' + categorias.length + ' categorias' + (jaNoCatalogo ? ', já temos alguns pelo IGDB' : '') + ')'); }
    await wait(350);
  }
  salvar();
  // maxPages evita que uma wiki gigante (milhares de páginas) vire só ruído.
  const saida = achados
    .filter((a) => a.estimativa >= 5 && !EXCLUIR.has(a.wiki))
    .map((a) => ({ wiki: a.wiki, series: nomeDaObra(a), category: a.categorias, maxPages: Math.min(900, Math.max(60, Math.round(a.estimativa * 1.2))), edicoes: a.edicoes, estimativa: a.estimativa, jaNoCatalogo: a.jaNoCatalogo }));
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1));
  console.log('Descobertos: ' + saida.length + ' jogos novos com ~' + saida.reduce((s, a) => s + a.estimativa, 0) + ' personagens. Arquivo: ' + SAIDA);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { wikiDoJogo, escolherCategorias };
