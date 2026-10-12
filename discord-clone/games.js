// Jogos que o overlay do app de desktop reconhece. O app recebe três camadas daqui:
// 1. Pastas das lojas de jogos (Steam, Epic, Xbox…): um executável dentro delas conta como jogo,
//    então qualquer jogo novo funciona sem esperar cadastro. Vêm com os ignorados (launchers,
//    relatórios de erro, instaladores) e o tamanho mínimo da janela, para não pegar ferramentas.
// 2. A lista pública de jogos detectáveis do Discord (~13 MB), reduzida ao nome e aos executáveis
//    do Windows (~600 KB), renovada a cada 24 h e guardada em disco.
// 3. Uma lista extra nossa, para o que escapar das duas.
// Tudo é decidido aqui e não no app: para ajustar uma regra basta um deploy do site.
const fs = require('node:fs');

const SOURCE = 'https://discord.com/api/v9/applications/detectable';
const MAX_AGE = 24 * 60 * 60 * 1000;
const MIN_GAMES = 1000; // menos que isso é resposta quebrada, não a lista de verdade

// Caminhos em minúsculas e com "/". O jogo fica numa pasta própria logo abaixo de cada uma.
const RULES = {
  folders: [
    'steamapps/common/', 'epic games/', 'xboxgames/', 'modifiablewindowsapps/', 'riot games/', 'ea games/', 'origin games/',
    'ubisoft game launcher/games/', 'gog galaxy/games/', 'gog games/', 'amazon games/library/',
  ],
  // Trechos do nome do executável que nunca são o jogo.
  ignore: [
    'launcher', 'crash', 'setup', 'redist', 'unins', 'install', 'prereq', 'helper', 'updater', 'easyanticheat', 'battleye',
    'steamwebhelper', 'steamservice', 'steamerrorreporter', 'leagueclient', 'riotclient', 'eadesktop', 'galaxyclient', 'cefsharp',
  ],
  // Pastas dentro das bibliotecas que são programas, não jogos.
  ignorePaths: [
    'steamapps/common/steamworks shared/', 'steamapps/common/steam controller configs/', 'steamapps/common/steamvr/',
    'steamapps/common/wallpaper_engine/', 'steamapps/common/lossless scaling/', 'steamapps/common/spacewar/',
    'epic games/launcher/', 'epic games/directxredist/', 'epic games/epic online services/', 'xboxgames/gamesave/', 'riot games/riot client/',
    '/_commonredist/', '/redist/', '/directx/', '/vcredist/', '/easyanticheat/', '/battleye/',
  ],
  // Pela pasta, a janela também precisa ocupar ao menos esta fração da tela (janelinhas de ferramentas ficam de fora).
  minScreenShare: 1 / 3,
};

// Jogos que nem as pastas nem o Discord cobrem (ex.: o Discord cadastra o AION 2 sem executável).
const EXTRA_GAMES = [
  ['AION 2', ['aion2/binaries/win64/aion2.exe']],
];

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

// O que o app recebe: as regras das pastas, a lista extra e a do Discord.
const bodyOf = (fetchedAt, discord) => JSON.stringify({ fetchedAt, ...RULES, games: [...EXTRA_GAMES, ...discord] });

function createGameList({ file, fetch = globalThis.fetch, source = SOURCE, maxAge = MAX_AGE, now = Date.now } = {}) {
  let cache = null; // { fetchedAt, body }
  let pending = null;
  // No disco fica só a lista do Discord; as regras e a lista extra vêm sempre deste arquivo.
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(saved.games) && saved.games.length >= MIN_GAMES) cache = { fetchedAt: saved.fetchedAt || 0, body: bodyOf(saved.fetchedAt || 0, saved.games) };
  } catch { /* ainda não baixada */ }

  function refresh() {
    pending ||= (async () => {
      try {
        const response = await fetch(source, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const games = slimDetectable(await response.json());
        if (games.length < MIN_GAMES) throw new Error(`só ${games.length} jogos`);
        const fetchedAt = now();
        cache = { fetchedAt, body: bodyOf(fetchedAt, games) };
        fs.writeFile(file + '.tmp', JSON.stringify({ fetchedAt, games }), (error) => {
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

module.exports = { slimDetectable, createGameList, SOURCE, RULES, EXTRA_GAMES };
