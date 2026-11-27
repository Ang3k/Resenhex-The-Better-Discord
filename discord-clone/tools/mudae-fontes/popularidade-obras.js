// Peso de cada obra de desenho, para que o nº 1 de uma obra pouco vista não empate com o Homer Simpson.
// Cada wiki do Fandom tem a própria escala de notas (1.000.000 / posição dentro da wiki): sem peso, todos os nº 1 empatam
// e o ranking vira um rodízio entre obras. O peso vem das visualizações do artigo da obra na Wikipédia em inglês
// (os últimos 10 anos fechados, só gente, sem robôs), da API pública da Wikimedia, sem chave.
//   peso = (visualizações da obra / visualizações da obra mais vista) ^ EXPOENTE
// A ordem DENTRO de cada obra não muda: o peso multiplica a obra inteira.
const fs = require('fs');
const path = require('path');
const { pacer, request } = require('./comum');
const { suffix, writeJson } = require('./coleta');

const ARQUIVO = path.join(__dirname, 'popularidade-desenhos.json');
// 0,5: uma obra com 1/16 das visualizações da mais vista tem o nº 1 valendo o nº 4 dela (e não o nº 16).
const EXPOENTE = 0.5;
// 10 anos: mede a fama que dura. Com 24 meses, Invincible e Arcane (temporadas novas) passavam dos Simpsons.
const MESES = 120;
const UA = { 'User-Agent': 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)' };

// Wiki do Fandom -> artigo(s) da Wikipédia em inglês. Com mais de um artigo (estúdios com muitos filmes), vale o mais visto.
const ARTIGOS = {
  simpsons: 'The Simpsons', futurama: 'Futurama', familyguy: 'Family Guy', southpark: 'South Park', rickandmorty: 'Rick and Morty',
  avatar: 'Avatar: The Last Airbender', adventuretime: 'Adventure Time', gravityfalls: 'Gravity Falls', 'steven-universe': 'Steven Universe',
  phineasandferb: 'Phineas and Ferb', spongebob: 'SpongeBob SquarePants', ben10: 'Ben 10', teentitans: 'Teen Titans (TV series)',
  looneytunes: 'Looney Tunes', hazbinhotel: 'Hazbin Hotel', theamazingworldofgumball: 'The Amazing World of Gumball', regularshow: 'Regular Show',
  kimpossible: 'Kim Possible', dannyphantom: 'Danny Phantom', theowlhouse: 'The Owl House', totaldrama: 'Total Drama',
  mlp: 'My Little Pony: Friendship Is Magic', powerpuffgirls: 'The Powerpuff Girls',
  disney: ['Walt Disney Animation Studios', 'Mickey Mouse', 'Frozen (2013 film)', 'The Lion King'],
  pixar: ['Pixar', 'Toy Story'], dreamworks: ['DreamWorks Animation', 'Shrek'],
  scoobydoo: 'Scooby-Doo', invincible: 'Invincible (TV series)', arcane: 'Arcane (TV series)', gargoyles: 'Gargoyles (TV series)',
  batmantheanimatedseries: 'Batman: The Animated Series', tmnt: 'Teenage Mutant Ninja Turtles', transformers: 'Transformers',
  heman: 'He-Man and the Masters of the Universe', samuraijack: 'Samurai Jack', dexterslab: "Dexter's Laboratory", johnnybravo: 'Johnny Bravo',
  courage: 'Courage the Cowardly Dog', amphibia: 'Amphibia (TV series)', bluey: 'Bluey (TV series)', peppapig: 'Peppa Pig', pawpatrol: 'Paw Patrol',
  miraculousladybug: 'Miraculous: Tales of Ladybug & Cat Noir', winx: 'Winx Club', witch: 'W.I.T.C.H. (TV series)', trollhunters: 'Trollhunters: Tales of Arcadia',
  voltron: 'Voltron: Legendary Defender', starvstheforcesofevil: 'Star vs. the Forces of Evil', hilda: 'Hilda (TV series)', primal: 'Primal (TV series)',
  helluvaboss: 'Helluva Boss', bojackhorseman: 'BoJack Horseman', archer: 'Archer (2009 TV series)', bobsburgers: "Bob's Burgers",
  kingofthehill: 'King of the Hill', americandad: 'American Dad!', daria: 'Daria', beavisandbutthead: 'Beavis and Butt-Head', rugrats: 'Rugrats',
  heyarnold: 'Hey Arnold!', recess: 'Recess (TV series)', fairlyoddparents: 'The Fairly OddParents', jimmyneutron: 'The Adventures of Jimmy Neutron, Boy Genius',
  renandstimpy: 'The Ren & Stimpy Show', animaniacs: 'Animaniacs', tinytoons: 'Tiny Toon Adventures', ducktales: 'DuckTales', darkwingduck: 'Darkwing Duck',
  flintstones: 'The Flintstones', tomandjerry: 'Tom and Jerry', popeye: 'Popeye', shaunthesheep: 'Shaun the Sheep', kungfupanda: 'Kung Fu Panda',
  madagascar: 'Madagascar (franchise)',
};

// "Bluey (2018 TV series)" e "Bluey (TV series)" -> "bluey"; "PAW Patrol" e "Paw Patrol" -> "paw patrol".
const semDesambiguacao = (t) => String(t).replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
const mesmoNome = (a, b) => a !== b && semDesambiguacao(a) === semDesambiguacao(b);

const wikiDe = (row) => String(row[0]).match(/^[gdcs]-(.+)-\d+$/)?.[1];

// Os MESES fechados antes de `hoje` (AAAAMMDD00, como a API pede).
function periodo(hoje = new Date()) {
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0));
  const inicio = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - MESES + 1, 1));
  const f = (d) => d.toISOString().slice(0, 10).replace(/-/g, '') + '00';
  return { inicio: f(inicio), fim: f(fim) };
}

// Pedido com cache em disco (tools/mudae-cache/consultas/wikipedia): rodar de novo no mesmo mês não consulta nada.
function comCache(cacheDir) {
  const pace = pacer(1100);
  return async (url) => {
    const file = cacheDir && path.join(cacheDir, 'consultas', 'wikipedia', suffix(url) + '.json');
    if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).data;
    const data = await request(url, { headers: UA }, { label: 'Wikipédia', beforeAttempt: pace });
    if (file) writeJson(file, { url, data });
    return data;
  };
}

// Consulta a Wikipédia e devolve { wikis: { wiki: { artigos: [{ titulo, visualizacoes }], visualizacoes } } }.
// Título que não existe (ou que caiu num redirecionamento para outro assunto) fica com null e entra no relatório.
async function coletar({ cacheDir, artigos = ARTIGOS, hoje = new Date(), log = console.log } = {}) {
  const get = comCache(cacheDir);
  const { inicio, fim } = periodo(hoje);
  const titulos = [...new Set(Object.values(artigos).flat())];
  const canonico = new Map();
  for (let i = 0; i < titulos.length; i += 50) {
    const lote = titulos.slice(i, i + 50);
    const j = await get('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: lote.join('|') }));
    const norm = new Map((j.query?.normalized || []).map((n) => [n.from, n.to]));
    const red = new Map((j.query?.redirects || []).map((n) => [n.from, n.to]));
    const faltam = new Set((j.query?.pages || []).filter((p) => p.missing || p.invalid).map((p) => p.title));
    for (const t of lote) { let c = norm.get(t) || t; c = red.get(c) || c; canonico.set(t, faltam.has(c) ? null : c); }
  }
  // Artigo renomeado ("Bluey (2018 TV series)" -> "Bluey (TV series)", "PAW Patrol" -> "Paw Patrol"): o histórico ficou no
  // título antigo, que virou redirecionamento. Soma os redirecionamentos com o mesmo nome (sem a desambiguação e sem caixa).
  const antigos = new Map();
  const canonicos = [...new Set([...canonico.values()].filter(Boolean))];
  for (let i = 0; i < canonicos.length; i += 50) {
    let cont = {};
    do {
      const j = await get('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'redirects', rdlimit: 'max', rdnamespace: '0', titles: canonicos.slice(i, i + 50).join('|'), ...cont }));
      for (const p of j.query?.pages || []) {
        const lista = antigos.get(p.title) || antigos.set(p.title, []).get(p.title);
        for (const r of p.redirects || []) if (mesmoNome(r.title, p.title)) lista.push(r.title);
      }
      cont = j.continue || null;
    } while (cont);
  }
  const vistasDe = async (titulo) => {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(titulo.replace(/ /g, '_'))}/monthly/${inicio}/${fim}`;
    const j = await get(url).catch((err) => { if (/HTTP 404/.test(err.message)) return { items: [] }; throw err; }); // 404: sem nenhuma visita no período
    return (j.items || []).reduce((s, x) => s + x.views, 0);
  };
  const vistas = new Map();
  const somados = new Map();
  for (const [n, t] of titulos.entries()) {
    const c = canonico.get(t);
    if (!c) { vistas.set(t, null); continue; }
    let total = await vistasDe(c);
    for (const a of antigos.get(c) || []) total += await vistasDe(a);
    vistas.set(t, total);
    somados.set(t, antigos.get(c) || []);
    if ((n + 1) % 10 === 0) log(`  Wikipédia: ${n + 1}/${titulos.length}`);
  }
  const wikis = {};
  for (const [wiki, lista] of Object.entries(artigos)) {
    const itens = [].concat(lista).map((t) => ({ titulo: t, canonico: canonico.get(t), visualizacoes: vistas.get(t), ...(somados.get(t)?.length ? { tambemSomados: somados.get(t) } : {}) }));
    const validas = itens.map((x) => x.visualizacoes).filter(Number.isFinite);
    wikis[wiki] = { artigos: itens, visualizacoes: validas.length ? Math.max(...validas) : null };
  }
  return { fonte: 'Wikimedia Pageviews (en.wikipedia, user, mensal)', periodo: { inicio, fim }, expoente: EXPOENTE, wikis };
}

function lerPopularidade(file = ARQUIVO) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

// wiki -> peso em (0, 1]. Wiki sem dado fica com o peso mediano (nem sobe nem afunda). Sem arquivo, tudo vale 1 (como antes).
function pesos(popularidade = lerPopularidade(), expoente = popularidade?.expoente ?? EXPOENTE) {
  const mapa = new Map();
  if (!popularidade?.wikis) return { de: () => 1, mapa };
  const v = Object.entries(popularidade.wikis).map(([w, x]) => [w, x.visualizacoes]).filter(([, x]) => Number.isFinite(x) && x > 0);
  if (!v.length) return { de: () => 1, mapa };
  const max = Math.max(...v.map(([, x]) => x));
  for (const [w, x] of v) mapa.set(w, (x / max) ** expoente);
  const ordenados = [...mapa.values()].sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(ordenados.length / 2)];
  return { de: (wiki) => mapa.get(wiki) ?? mediana, mapa, mediana };
}

// Nota de quem está na posição i (0 = nº 1) de uma wiki com esse peso. Com peso 1 é a nota de sempre (1.000.000 / posição).
const notaDaPosicao = (i, peso = 1) => Math.round(Math.round(1e6 / (i + 1)) * peso * 100) / 100;

// Aplica o peso nas linhas de desenho de um catálogo já montado (8 colunas, publicado), sem mudar a ordem dentro de cada wiki
// nem qualquer outra coluna. A posição dentro da wiki é a da nota atual (empate: a ordem em que já estão no catálogo).
function pesarDesenhos(rows, peso = pesos().de) {
  const grupos = new Map();
  rows.forEach((r, i) => {
    if (r[6] !== 'd') return;
    const w = wikiDe(r);
    if (!w) return;
    (grupos.get(w) || grupos.set(w, []).get(w)).push(i);
  });
  const nova = rows.slice();
  let mudaram = 0;
  for (const [w, idx] of grupos) {
    idx.sort((a, b) => (rows[b][5] - rows[a][5]) || (a - b));
    const p = peso(w);
    idx.forEach((i, pos) => {
      const nota = rows[i][5] === 0 ? 0 : notaDaPosicao(pos, p);
      if (nota !== rows[i][5]) { nova[i] = [...rows[i].slice(0, 5), nota, ...rows[i].slice(6)]; mudaram++; }
    });
  }
  return { rows: nova, mudaram, wikis: grupos.size };
}

module.exports = { ARTIGOS, ARQUIVO, EXPOENTE, periodo, coletar, lerPopularidade, pesos, notaDaPosicao, pesarDesenhos, wikiDe };
