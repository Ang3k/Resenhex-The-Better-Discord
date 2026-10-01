// Monta o catálogo do Mudae (mudae-catalogo.json) a partir de várias fontes. Roda no seu
// computador: o servidor só lê o arquivo pronto e nunca chama essas APIs.
//
//   node tools/mudae-catalogo.js                  baixa as fontes que ainda não têm cache e junta tudo
//   node tools/mudae-catalogo.js jogos series     baixa de novo só essas fontes e junta tudo
//   node tools/mudae-catalogo.js --juntar         só junta os caches que já existem
//
// Fontes: anime (AniList), jogos (IGDB), quadrinhos (Comic Vine), desenhos (wikis do Fandom) e
// series (TMDB). Jogos, quadrinhos e séries precisam de chaves em tools/mudae-chaves.json
// (fora do Git): { "igdbClientId", "igdbClientSecret", "comicVineKey", "tmdbKey" }.
// Cada fonte fica em tools/mudae-cache/<fonte>.json, então dá para refazer uma sem baixar as outras.
const fs = require('fs');
const path = require('path');
const { anilist } = require('./mudae-fontes/anilist');
const { igdb } = require('./mudae-fontes/igdb');
const { comicvine } = require('./mudae-fontes/comicvine');
const { fandom, GAME_FRANCHISES } = require('./mudae-fontes/fandom');
const { tmdb } = require('./mudae-fontes/tmdb');

const OUT = path.join(__dirname, '..', 'mudae-catalogo.json');
const CACHE = path.join(__dirname, 'mudae-cache');
const KEYS = path.join(__dirname, 'mudae-chaves.json');
// Junta listas da mesma fonte: cada uma vira posição relativa (1º de cada lista no topo) e o mesmo
// nome repetido fica só onde é mais importante.
function mergeByRank(lists) {
  const byName = new Map();
  for (const rows of lists) {
    rows.forEach((row, i) => {
      const scored = [...row.slice(0, 5), Math.round(1e6 / (i + 1)), row[6]];
      const key = row[1].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!byName.has(key) || byName.get(key)[5] < scored[5]) byName.set(key, scored);
    });
  }
  return [...byName.values()].sort((a, b) => b[5] - a[5]);
}

// Jogos: o IGDB tem poucos personagens com retrato, então as wikis dos jogos completam.
async function games({ want, keys }) {
  const fromIgdb = await igdb({ want, keys });
  console.log(`  jogos: ${fromIgdb.length} do IGDB`);
  const wikis = await fandom({ franchises: GAME_FRANCHISES, letter: 'g', label: 'jogos' });
  // As wikis já vêm com a posição dentro de cada franquia; o IGDB, pela nota do jogo.
  const byFranchise = new Map();
  for (const row of wikis) {
    const wiki = row[0].slice(2, row[0].lastIndexOf('-'));
    if (!byFranchise.has(wiki)) byFranchise.set(wiki, []);
    byFranchise.get(wiki).push(row);
  }
  return mergeByRank([fromIgdb, ...byFranchise.values()]).slice(0, want);
}

const SOURCES = {
  anime: { run: anilist, want: 15000, letter: 'a' },
  jogos: { run: games, want: 5000, letter: 'g' },
  quadrinhos: { run: comicvine, want: 4000, letter: 'c' },
  desenhos: { run: fandom, letter: 'd' },
  series: { run: tmdb, want: 3000, letter: 's' },
};

const cacheFile = (name) => path.join(CACHE, name + '.json');
const writeRows = (file, rows) => fs.writeFileSync(file, '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');

(async () => {
  const args = process.argv.slice(2);
  const onlyMerge = args.includes('--juntar');
  const asked = args.filter((a) => !a.startsWith('--'));
  for (const a of asked) if (!SOURCES[a]) throw new Error(`Fonte desconhecida: ${a}. Use: ${Object.keys(SOURCES).join(', ')}`);
  const keys = fs.existsSync(KEYS) ? JSON.parse(fs.readFileSync(KEYS, 'utf8')) : {};
  fs.mkdirSync(CACHE, { recursive: true });

  // O catálogo antigo (só anime) vira o cache de anime, para não baixar tudo de novo.
  if (!fs.existsSync(cacheFile('anime')) && fs.existsSync(OUT)) {
    const old = JSON.parse(fs.readFileSync(OUT, 'utf8')).filter((r) => (r[6] || 'a') === 'a').map((r) => [...r.slice(0, 6), 'a']);
    if (old.length) writeRows(cacheFile('anime'), old);
  }

  if (!onlyMerge) {
    const todo = asked.length ? asked : Object.keys(SOURCES).filter((name) => !fs.existsSync(cacheFile(name)));
    for (const name of todo) {
      const source = SOURCES[name];
      console.log(`Baixando ${name}…`);
      try {
        const rows = await source.run({ want: source.want, keys });
        writeRows(cacheFile(name), rows);
        console.log(`${name}: ${rows.length} personagens`);
      } catch (err) {
        console.log(`${name}: não deu (${err.message})`);
      }
    }
  }

  const all = [];
  const seen = new Set();
  for (const name of Object.keys(SOURCES)) {
    if (!fs.existsSync(cacheFile(name))) continue;
    const rows = JSON.parse(fs.readFileSync(cacheFile(name), 'utf8'));
    let added = 0;
    for (const row of rows) {
      if (seen.has(String(row[0]))) continue;
      seen.add(String(row[0]));
      all.push(row);
      added++;
    }
    console.log(`  ${name}: ${added}`);
  }
  // Uma linha por personagem: o diff fica legível quando o catálogo for atualizado.
  writeRows(OUT, all);
  console.log(`Pronto: ${all.length} personagens em ${path.relative(process.cwd(), OUT)}`);
})().catch((err) => { console.error(err.message); process.exit(1); });
