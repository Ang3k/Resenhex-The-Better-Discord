// Lista de jogos que o overlay do app de desktop reconhece.
// Vem da lista pública de jogos detectáveis do Discord (~13 MB); aqui ela fica só com o nome
// e os executáveis do Windows (~600 KB) e é guardada em disco. Cada app baixa a versão enxuta
// daqui, e não do Discord: se o endpoint deles mudar, só este arquivo precisa de ajuste.
const fs = require('node:fs');

const SOURCE = 'https://discord.com/api/v9/applications/detectable';
const MAX_AGE = 24 * 60 * 60 * 1000;
const MIN_GAMES = 1000; // menos que isso é resposta quebrada, não a lista de verdade

// [[nome, [executáveis]]]. Os executáveis ficam em minúsculas e com "/" (ex.: "win64/valorant-win64-shipping.exe").
// Ficam de fora os launchers (Steam, Battle.net…) e os que começam com ">", que no Discord
// dependem dos argumentos da linha de comando (ex.: ">hl2.exe" vale para vários jogos da Valve).
function slimDetectable(raw) {
  if (!Array.isArray(raw)) return [];
  const games = [];
  for (const app of raw) {
    if (!app || typeof app.name !== 'string' || !app.name.trim() || !Array.isArray(app.executables)) continue;
    const exes = new Set();
    for (const exe of app.executables) {
      if (!exe || exe.os !== 'win32' || exe.is_launcher || typeof exe.name !== 'string') continue;
      const name = exe.name.trim().toLowerCase().split('\\').join('/').replace(/^\/+/, '');
      if (name && !name.startsWith('>') && name.length <= 200) exes.add(name);
    }
    if (exes.size) games.push([app.name.trim().slice(0, 100), [...exes]]);
  }
  return games;
}

function createGameList({ file, fetch = globalThis.fetch, source = SOURCE, maxAge = MAX_AGE, now = Date.now } = {}) {
  let cache = null; // { fetchedAt, body }
  let pending = null;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(saved.games) && saved.games.length >= MIN_GAMES) cache = { fetchedAt: saved.fetchedAt || 0, body: JSON.stringify(saved) };
  } catch { /* ainda não baixada */ }

  function refresh() {
    pending ||= (async () => {
      try {
        const response = await fetch(source, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const games = slimDetectable(await response.json());
        if (games.length < MIN_GAMES) throw new Error(`só ${games.length} jogos`);
        const fetchedAt = now();
        const body = JSON.stringify({ fetchedAt, games });
        cache = { fetchedAt, body };
        fs.writeFile(file + '.tmp', body, (error) => {
          if (error) return console.warn('Lista de jogos não foi salva:', error.message);
          fs.rename(file + '.tmp', file, (err) => err && console.warn('Lista de jogos não foi salva:', err.message));
        });
      } catch (error) {
        console.warn('Não foi possível atualizar a lista de jogos:', error.message);
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  // Sem lista, espera o download; com lista velha, responde com ela e atualiza por trás.
  async function body() {
    if (!cache) await refresh();
    else if (now() - cache.fetchedAt > maxAge) refresh();
    return cache?.body || null;
  }

  async function route(_req, res) {
    const json = await body();
    if (!json) return res.status(503).json({ error: 'Lista de jogos indisponível no momento.' });
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('application/json').send(json);
  }

  return { body, refresh, route };
}

module.exports = { slimDetectable, createGameList, SOURCE };
