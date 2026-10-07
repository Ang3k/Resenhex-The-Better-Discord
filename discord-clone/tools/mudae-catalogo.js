// Atualiza todas as fontes por padrão; --juntar apenas monta; --retomar reutiliza consultas salvas.
const fs = require('fs');
const path = require('path');
const { anilist } = require('./mudae-fontes/anilist');
const { igdb } = require('./mudae-fontes/igdb');
const { comicvine } = require('./mudae-fontes/comicvine');
const { fandom, GAME_FRANCHISES } = require('./mudae-fontes/fandom');
const { tmdb } = require('./mudae-fontes/tmdb');
const { createCollection, preserveRows, mergeByRank, validateRows, writeJson } = require('./mudae-fontes/coleta');
const { correctCatalog, isAuxiliaryRow } = require('./mudae-fontes/qualidade');
const { realPeopleExclusions, isRealPersonRow } = require('./mudae-fontes/pessoas-reais');

const OUT = path.join(__dirname, '..', 'mudae-catalogo.json');
const CACHE = path.join(__dirname, 'mudae-cache');
const KEYS = path.join(__dirname, 'mudae-chaves.json');
const SOURCES = { anime: 'a', jogos: 'g', quadrinhos: 'c', desenhos: 'd', series: 's' };
const readRows = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];

function mergeGames(native, wikis, previous = []) {
  const groups = new Map();
  for (const row of wikis) {
    const wiki = String(row[0]).slice(2, String(row[0]).lastIndexOf('-'));
    if (!groups.has(wiki)) groups.set(wiki, []);
    groups.get(wiki).push(row);
  }
  return mergeByRank([native, ...groups.values()], previous);
}

async function runSource(name, { keys, previous, resume, options }) {
  const collection = createCollection(name, { cacheDir: CACHE, resume });
  const child = (label) => createCollection(label, { cacheDir: CACHE, resume });
  try {
    let rows;
    if (name === 'anime') rows = await anilist({ previous, collection, popularPages: options.animePages });
    if (name === 'quadrinhos') rows = await comicvine({ keys, previous, collection, nativePages: options.comicPages });
    if (name === 'series') rows = await tmdb({ keys, previous, collection, showCount: options.showCount });
    if (name === 'desenhos') rows = await fandom({ previous, collection });
    if (name === 'jogos') {
      const igdbReport = child('jogos-igdb');
      const fandomReport = child('jogos-fandom');
      const lists = await Promise.allSettled([
        igdb({ keys, collection: igdbReport }),
        fandom({ franchises: GAME_FRANCHISES, letter: 'g', label: 'jogos', previous, collection: fandomReport }),
      ]);
      for (const [i, result] of lists.entries()) {
        const provider = i === 0 ? 'igdb' : 'fandom';
        const report = i === 0 ? igdbReport : fandomReport;
        if (result.status === 'rejected') { report.error(provider, result.reason); report.finish([]); collection.error(provider, result.reason); }
        else if (report.report.status === 'partial') collection.error(provider, new Error('Coleta parcial; consulte o relatório do provedor'));
      }
      rows = mergeGames(lists[0].status === 'fulfilled' ? lists[0].value : [], lists[1].status === 'fulfilled' ? lists[1].value : [], previous);
      collection.report.scope = { characters: 'IGDB: todos com retrato, nome e jogo + categorias de personagens de 25 wikis, com filtros de imagem e página' };
      collection.finish(rows);
    }
    validateRows(rows, SOURCES[name]);
    const merged = preserveRows(previous, rows);
    validateRows(merged, SOURCES[name]);
    writeJson(path.join(CACHE, name + '.json'), merged, true);
    const refreshed = new Set(rows.map((r) => String(r[0])));
    collection.report.retainedPrevious = previous.filter((old) => !refreshed.has(String(old[0]))).length;
    collection.report.published = merged.length;
    collection.finish(rows);
    console.log(name + ': ' + merged.length + ' personagens (' + collection.report.status + ')');
    return collection.report;
  } catch (err) {
    collection.error(name, err);
    collection.finish([]);
    console.log(name + ': falhou; fichas anteriores preservadas (' + err.message + ')');
    return collection.report;
  }
}

async function main(args = process.argv.slice(2)) {
  const asked = args.filter((a) => !a.startsWith('--'));
  for (const name of asked) if (!SOURCES[name]) throw new Error('Fonte desconhecida: ' + name);
  const option = (key, fallback) => {
    const raw = args.find((a) => a.startsWith('--' + key + '='));
    const value = raw ? Number(raw.split('=')[1]) : fallback;
    if (!Number.isInteger(value) || value < 0) throw new Error('Opção inválida: ' + key);
    return value;
  };
  const options = { animePages: option('anime-paginas', 8), comicPages: option('quadrinhos-paginas', 50), showCount: option('series-populares', 340) };
  const resume = args.includes('--retomar');
  const previous = readRows(OUT);
  fs.mkdirSync(CACHE, { recursive: true });
  // Também salva antes de --juntar, pois a revisão pode retirar páginas que não são personagens.
  {
    const backup = path.join(CACHE, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    writeJson(backup, previous, true);
  }
  for (const [name, letter] of Object.entries(SOURCES)) {
    if (!fs.existsSync(path.join(CACHE, name + '.json'))) writeJson(path.join(CACHE, name + '.json'), previous.filter((r) => (r[6] || 'a') === letter), true);
  }
  const reports = [];
  if (!args.includes('--juntar')) {
    const keys = fs.existsSync(KEYS) ? JSON.parse(fs.readFileSync(KEYS, 'utf8')) : {};
    // APIs independentes podem atualizar seus caches em paralelo; o catálogo só é publicado no fim.
    reports.push(...await Promise.all((asked.length ? asked : Object.keys(SOURCES)).map((name) =>
      runSource(name, { keys, previous: readRows(path.join(CACHE, name + '.json')), resume, options }))));
  }
  let all = previous;
  for (const [name, letter] of Object.entries(SOURCES)) {
    const rows = readRows(path.join(CACHE, name + '.json'));
    validateRows(rows, letter);
    all = preserveRows(all, rows);
  }
  const excludedPeopleById = realPeopleExclusions(CACHE);
  const quality = correctCatalog(all, { cacheDir: CACHE, excludedPeopleById });
  all = quality.rows;
  const ids = new Set(all.map((r) => String(r[0])));
  if (ids.size !== all.length || previous.filter((r) => !isAuxiliaryRow(r) && !isRealPersonRow(r, excludedPeopleById)).some((r) => !ids.has(String(r[0])))) throw new Error('A montagem perderia IDs de personagens publicados');
  for (const [name, letter] of Object.entries(SOURCES)) {
    const rows = all.filter((r) => r[6] === letter);
    validateRows(rows, letter);
    writeJson(path.join(CACHE, name + '.json'), rows, true);
  }
  writeJson(path.join(CACHE, 'relatorios', 'qualidade.json'), { finishedAt: new Date().toISOString(), ...quality.report });
  writeJson(OUT, all, true);
  const latestReports = Object.keys(SOURCES).map((name) => path.join(CACHE, 'relatorios', name + '.json'))
    .filter((file) => fs.existsSync(file)).map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const summary = { finishedAt: new Date().toISOString(), scope: 'elencos completos das obras atuais + obras/personagens conhecidos', previous: previous.length,
    total: all.length, added: all.length - previous.length, quality: { removedAuxiliary: quality.report.removed.length, removedRealPeople: quality.report.removedRealPeople.length, priorityEvidence: quality.report.priorityEvidence }, status: latestReports.some((r) => r.status !== 'complete') ? 'partial' : 'complete',
    sources: Object.fromEntries(Object.entries(SOURCES).map(([name, letter]) => [name, all.filter((r) => r[6] === letter).length])), reports: latestReports };
  writeJson(path.join(CACHE, 'relatorio.json'), summary);
  console.log('Pronto: ' + all.length + ' personagens, ' + (summary.added >= 0 ? '+' : '') + summary.added + ' (' + summary.status + ')');
  if (summary.status === 'partial') process.exitCode = 1;
  return summary;
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });
module.exports = { main, runSource, mergeGames };
