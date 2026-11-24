// Troca a foto do ATOR (TMDB) pela imagem do PERSONAGEM nas fichas de série (letra 's').
// O TMDB só tem fotos de atores, então a imagem do personagem vem da wiki do Fandom de cada série:
//   1. o Wikidata diz o nome da série em inglês (e, quando sabe, a wiki do Fandom) a partir do id do TMDB;
//   2. a wiki é conferida pelo nome do site (para não cair numa wiki de outro assunto);
//   3. cada personagem é procurado pelo título da página (com redirecionamentos) e usa a imagem principal dela.
// Quem não tem página com imagem fica com a foto do ator (reserva). O resultado vai para
// tools/mudae-cache/personagens-series.json (id -> imagem) e é aplicado por aplicarImagens().
//
// Uso: node tools/mudae-fontes/personagens-series.js [--serie=1399,66732] [--aplicar] [--do-zero]
//   (sem --aplicar só coleta; --aplicar grava a imagem nas fichas de server/mudae-catalogo.json e guarda um backup)
const fs = require('fs');
const path = require('path');
const { pacer, request } = require('./comum');
const { createCollection, normalize, writeJson } = require('./coleta');

const CACHE = process.env.MUDAE_CACHE || path.join(__dirname, '..', 'mudae-cache');
const PUBLICADO = process.env.MUDAE_CATALOG || path.join(__dirname, '..', '..', 'server', 'mudae-catalogo.json');
const ARQUIVO = (cacheDir = CACHE) => path.join(cacheDir, 'personagens-series.json');
const ARQUIVO_PAGINAS = (cacheDir = CACHE) => path.join(cacheDir, 'personagens-series-paginas.json');
const UA = { 'User-Agent': 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)' };
const idDaSerie = (row) => (String(row[0]).match(/^s(\d+)-/) || [])[1];

// Wikis cujo endereço não sai do nome da série (id do TMDB -> subdomínio em fandom.com).
const WIKIS = {
  1399: 'gameofthrones', 66732: 'strangerthings', 1396: 'breakingbad', 1402: 'walkingdead', 71446: 'lacasadepapel', 93405: 'squidgame',
  1418: 'bigbangtheory', 1668: 'friends', 2316: 'theoffice', 1100: 'himym', 1416: 'greysanatomy', 1622: 'supernatural',
  // Wikis que cobrem várias séries (uma por franquia) ou cujo nome do site não bate com o da série.
  ...Object.fromEntries([[52, 'that70sshow'], [95, 'buffy'], [693, 'desperatehousewives'], [1400, 'seinfeld'], [1408, 'house'], [2038, 'drakeandjosh'],
    [4616, 'xena'], [4629, 'stargate'], [32798, 'hawaiifive-0'], [71728, 'youngsheldon'], [77169, 'cobrakai'], [76773, 'station19'],
    [84773, 'lotr'], [94997, 'gameofthrones'], [85720, 'shadowandbone'], [119051, 'wednesday'], [117581, 'ginny-and-georgia'],
    [62264, 'evildead'], [90462, 'childsplay'], [205715, 'the-boys'], [131927, 'dexter'], [82452, 'avatar'],
    ...[1415, 19885].map((i) => [i, 'sherlock']), ...[1431, 1620].map((i) => [i, 'csi']),
    ...[253, 655, 67198, 85949].map((i) => [i, 'memory-alpha']), // Memory Alpha é a wiki de todo Star Trek
    ...[60735, 62643, 62688, 89247].map((i) => [i, 'arrowverse']),
    ...[46896, 79460, 18165].map((i) => [i, 'vampirediaries']), ...[44006, 62650, 58841].map((i) => [i, 'onechicago']),
    ...[83867, 114461, 115036, 92830].map((i) => [i, 'starwars']),
    ...[1403, 38472, 61550, 61889, 62126, 67178, 84958, 85271, 88396, 92782, 92783, 114472].map((i) => [i, 'marvelcinematicuniverse'])]),
  63174: 'lucifer', 76479: 'the-boys', 85552: 'euphoria', 60059: 'bettercallsaul', 69050: 'riverdale', 71712: 'thegooddoctor',
  57243: 'tardis', 1405: 'dexter', 4614: 'ncis', 2734: 'lawandorder', 4057: 'criminalminds', 1911: 'bones', 1419: 'castle',
};

// Nomes a tentar na wiki: o nome inteiro e o nome sem apelido entre aspas / sem parênteses ("Tyrion 'The Halfman' Lannister").
function nomesParaBuscar(nome) {
  const limpo = (s) => s.replace(/\s+/g, ' ').trim();
  const lista = [];
  const add = (s) => { s = limpo(s).replace(/\|/g, ''); if (s && !lista.includes(s)) lista.push(s); };
  add(nome.replace(/\s*\([^)]*\)\s*/g, ' '));
  add(nome.replace(/\s*(["“'‘][^"”'’]+["”'’])\s*/g, ' ').replace(/\s*\([^)]*\)\s*/g, ' '));
  return lista;
}

// Endereços prováveis da wiki a partir do nome em inglês da série.
function wikisCandidatas(titulo) {
  const base = String(titulo || '').replace(/\s*\([^)]*\)\s*/g, ' ').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const slugs = new Set();
  for (const t of [base, base.replace(/^the\s+/, '')]) {
    slugs.add(t.replace(/[^a-z0-9]+/g, ''));
    slugs.add(t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }
  slugs.delete('');
  return [...slugs].filter((s) => /^[a-z0-9-]{2,}$/.test(s));
}

// Título da página do Fandom que tem aquele nome, seguindo "normalized" e "redirects" da resposta.
function paginaDe(data, titulo) {
  const norm = new Map((data.query?.normalized || []).map((n) => [n.from, n.to]));
  const redir = new Map((data.query?.redirects || []).map((r) => [r.from, r.to]));
  let t = norm.get(titulo) || titulo;
  t = redir.get(t) || t;
  return (data.query?.pages || []).find((p) => p.title === t) || null;
}

const imagemDeCard = (url) => url.replace(/\/revision\/latest(\/[^?]*)?/, '/revision/latest/scale-to-width-down/400');

async function wikidata(ids, { pace }) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 40) {
    const lote = ids.slice(i, i + 40);
    const query = `SELECT ?id ?l ?f WHERE { VALUES ?id { ${lote.map((x) => `"${x}"`).join(' ')} } ?i wdt:P4983 ?id . OPTIONAL{?i rdfs:label ?l . FILTER(LANG(?l)="en")} OPTIONAL{?i wdt:P6262 ?f} }`;
    await pace();
    const data = await request('https://query.wikidata.org/sparql', {
      method: 'POST', headers: { ...UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query }),
    }, { label: 'Wikidata' });
    for (const b of data.results.bindings) {
      const o = out.get(b.id.value) || { titulo: b.l?.value, wikis: [] };
      const wiki = b.f && String(b.f.value).split(':')[0].toLowerCase();
      if (wiki && /^[a-z0-9-]+$/.test(wiki)) o.wikis.push(wiki); // 'uk.dc' (wiki em outro idioma) não serve
      out.set(b.id.value, o);
    }
  }
  return out;
}

async function personagensDeSeries({ rows, only, collection = createCollection('personagens-series', { cacheDir: CACHE, resume: true }), cacheDir = CACHE }) {
  const pace = pacer(150);
  const api = (wiki, params) => collection.unit(wiki + ':' + JSON.stringify(params), async () => {
    await pace();
    const url = `https://${wiki}.fandom.com/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    return request(url, { headers: UA }, { label: 'Fandom ' + wiki });
  });

  const porSerie = new Map();
  for (const row of rows) {
    if (row[6] !== 's') continue;
    const id = idDaSerie(row);
    if (!id || (only && !only.has(id))) continue;
    if (!porSerie.has(id)) porSerie.set(id, { nome: row[2], rows: [] });
    porSerie.get(id).rows.push(row);
  }
  collection.report.scope = { series: porSerie.size, fichas: [...porSerie.values()].reduce((n, s) => n + s.rows.length, 0) };
  const dados = await wikidata([...porSerie.keys()], { pace });

  // Só vale uma wiki cujo nome do site contém o nome da série.
  const wikiValida = async (wiki, titulo) => {
    try {
      const data = await api(wiki, { action: 'query', meta: 'siteinfo', siprop: 'general' });
      const nomeDoSite = normalize(data.query?.general?.sitename);
      const alvo = normalize(String(titulo).replace(/^the\s+/i, ''));
      return !!nomeDoSite && !!alvo && nomeDoSite.includes(alvo);
    } catch { return false; }
  };
  const acharWiki = async (id, titulo) => {
    if (WIKIS[id]) return WIKIS[id];
    const d = dados.get(id);
    const lista = [...(d?.wikis || []), ...(titulo ? wikisCandidatas(titulo) : [])];
    for (const wiki of new Set(lista)) if (await wikiValida(wiki, titulo || wiki)) return wiki;
    return null;
  };

  const feito = (() => { try { return JSON.parse(fs.readFileSync(ARQUIVO(cacheDir), 'utf8')); } catch { return {}; } })();
  const resultado = { ...feito };
  const paginas = (() => { try { return JSON.parse(fs.readFileSync(ARQUIVO_PAGINAS(cacheDir), 'utf8')); } catch { return {}; } })();
  let proximo = 0;
  const series = [...porSerie.entries()];
  const trabalhar = async () => {
    while (proximo < series.length) {
      const [id, serie] = series[proximo++];
      try {
        const titulo = dados.get(id)?.titulo;
        const wiki = await acharWiki(id, titulo);
        if (!wiki) { collection.skip('serieSemWiki'); collection.progress(id, { name: serie.nome, status: 'sem-wiki', title: titulo }); continue; }
        // Primeira rodada: nome inteiro; segunda: o nome sem apelido, só para quem ficou sem página.
        const pendentes = new Map(serie.rows.map((r) => [String(r[0]), r]));
        for (let tentativa = 0; tentativa < 2 && pendentes.size; tentativa++) {
          const pedidos = new Map(); // título buscado -> fichas
          for (const [rid, r] of pendentes) {
            const nome = nomesParaBuscar(r[1])[tentativa];
            if (!nome) continue;
            if (!pedidos.has(nome)) pedidos.set(nome, []);
            pedidos.get(nome).push(rid);
          }
          const nomes = [...pedidos.keys()];
          for (let i = 0; i < nomes.length; i += 50) {
            const lote = nomes.slice(i, i + 50);
            const data = await api(wiki, { action: 'query', titles: lote.join('|'), redirects: '1', prop: 'pageimages|pageprops', piprop: 'original', ppprop: 'disambiguation' });
            for (const nome of lote) {
              const page = paginaDe(data, nome);
              const imagem = page && !page.missing && !page.pageprops?.disambiguation && page.original?.source && !/\.(svg|gif)(\/|\?|$)/i.test(page.original.source) ? imagemDeCard(page.original.source) : null;
              if (!imagem) continue;
              for (const rid of pedidos.get(nome)) { resultado[rid] = imagem; paginas[rid] = wiki + ':' + page.title; pendentes.delete(rid); }
            }
          }
        }
        const achadas = serie.rows.length - pendentes.size;
        collection.count('personagensComImagem', achadas);
        collection.progress(id, { name: serie.nome, wiki, status: 'complete', fichas: serie.rows.length, comImagemDoPersonagem: achadas });
        console.log(`  ${serie.nome} (${wiki}): ${achadas}/${serie.rows.length}`);
        writeJson(ARQUIVO(cacheDir), resultado);
        writeJson(ARQUIVO_PAGINAS(cacheDir), paginas);
      } catch (err) { collection.error(id, err); console.log(`  ${serie.nome} falhou (${String(err.message).slice(0, 100)})`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, series.length) }, trabalhar));
  writeJson(ARQUIVO(cacheDir), resultado);
  collection.finish(Object.keys(resultado).map((k) => [k]));
  return resultado;
}

// Troca a foto do ator pela do personagem nas linhas de série que têm uma (as outras ficam como estão).
function aplicarImagens(rows, imagens) {
  let trocadas = 0;
  const novas = rows.map((r) => {
    const img = r[6] === 's' ? imagens[String(r[0])] : null;
    if (!img || img === r[3]) return r;
    trocadas++;
    return [...r.slice(0, 3), img, ...r.slice(4)];
  });
  return { rows: novas, trocadas };
}
// O mesmo personagem com dois nomes na série (Player 456 = Seong Gi-hun, Jane Hopper = Eleven) cai na mesma página da wiki:
// fica o mais popular e os outros saem da roleta (8ª coluna = 1). Duas páginas diferentes com a mesma imagem de grupo não contam.
function marcarMesmoPersonagem(rows, paginas) {
  const grupos = new Map();
  for (const r of rows) {
    const p = r[6] === 's' && r[7] !== 1 ? paginas[String(r[0])] : null;
    if (!p) continue;
    const k = r[2] + '|' + p;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  const sai = new Set();
  for (const g of grupos.values()) if (g.length > 1) for (const r of g.sort((a, b) => b[5] - a[5] || String(a[0]).localeCompare(String(b[0]))).slice(1)) sai.add(String(r[0]));
  return { rows: rows.map((r) => (sai.has(String(r[0])) ? [...r.slice(0, 7), 1] : r)), marcadas: sai.size };
}
const lerPaginas = (cacheDir = CACHE) => { try { return JSON.parse(fs.readFileSync(ARQUIVO_PAGINAS(cacheDir), 'utf8')); } catch { return {}; } };
const lerImagens = (cacheDir = CACHE) => { try { return JSON.parse(fs.readFileSync(ARQUIVO(cacheDir), 'utf8')); } catch { return {}; } };

async function main(args = process.argv.slice(2)) {
  const serie = args.find((a) => a.startsWith('--serie='));
  const only = serie ? new Set(serie.split('=')[1].split(',')) : null;
  const rows = JSON.parse(fs.readFileSync(PUBLICADO, 'utf8'));
  const collection = createCollection('personagens-series', { cacheDir: CACHE, resume: !args.includes('--do-zero') });
  const imagens = await personagensDeSeries({ rows, only, collection });
  const total = rows.filter((r) => r[6] === 's' && (!only || only.has(idDaSerie(r)))).length;
  console.log(`Imagens de personagem: ${Object.keys(imagens).length} de ${total} fichas de série.`);
  if (args.includes('--aplicar')) {
    writeJson(path.join(CACHE, 'backups', 'antes-personagens-series-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), rows, true);
    const r = aplicarImagens(rows, imagens);
    const m = marcarMesmoPersonagem(r.rows, lerPaginas());
    writeJson(PUBLICADO, m.rows, true);
    console.log(`${r.trocadas} fichas trocaram a foto do ator pela do personagem em ${PUBLICADO}`);
    console.log(`${m.marcadas} fichas são o mesmo personagem com outro nome e saíram da roleta (o mais popular fica).`);
  }
  if (collection.report.status === 'partial') process.exitCode = 1;
}

if (require.main === module) main().catch((err) => { console.error(err); process.exitCode = 1; });
module.exports = { personagensDeSeries, aplicarImagens, lerImagens, marcarMesmoPersonagem, lerPaginas, nomesParaBuscar, wikisCandidatas, paginaDe, WIKIS };
