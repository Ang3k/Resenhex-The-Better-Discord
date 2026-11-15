// Descobre se um executável é um jogo, com o que o servidor do Resenhex manda (server/games.js):
// { games: [[nome, ["pasta/jogo.exe", "jogo.exe"]]], byArgs: [[nome, "jogo.exe", ["trecho"]]],
//   folders, ignore, ignorePaths, minScreenShare }.
//
// - Pela lista: o caminho completo do processo precisa terminar com o executável da lista, inteiro.
//   "C:\Riot Games\VALORANT\live\ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe" casa com
//   "win64/valorant-win64-shipping.exe", mas "notwin64/…" não.
// - Pela linha de comando (byArgs): para executáveis que servem para muita coisa, como o "javaw.exe" do
//   Minecraft Java. Vale quando a linha de comando do processo tem um dos trechos.
// - Pela pasta da loja: um executável numa pasta de jogo de uma biblioteca (ex.: "steamapps/common/AION2/…")
//   conta como jogo, a não ser que o nome esteja entre os ignorados (launchers, instaladores…).
// - Pastas ignoradas (ferramentas como Wallpaper Engine e Lossless Scaling) nunca contam, nem pela lista.
//   Quem chama ainda confere o tamanho da janela (minScreenShare), porque ali também há ferramentas.
// - Os jogos que a pessoa adicionou no app (withCustom) valem antes de tudo, pelo caminho inteiro.

const normalize = (file) => String(file || '').toLowerCase().split('\\').join('/');
const baseName = (file) => file.slice(file.lastIndexOf('/') + 1);
const strings = (list) => Array.isArray(list) ? list.filter((item) => typeof item === 'string' && item).map(normalize) : [];

function createGameMatcher(data) {
  const games = Array.isArray(data) ? data : Array.isArray(data?.games) ? data.games : []; // versões antigas mandavam só a lista
  const byBase = new Map(); // "jogo.exe" -> [[sufixo, nome]]
  for (const entry of games) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) continue;
    for (const exe of entry[1]) {
      if (typeof exe !== 'string' || !exe) continue;
      const suffix = normalize(exe);
      const base = baseName(suffix);
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push([suffix, entry[0]]);
    }
  }
  const byArgs = new Map(); // "javaw.exe" -> [[[trechos], nome]]
  for (const entry of Array.isArray(data?.byArgs) ? data.byArgs : []) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || !entry[1]) continue;
    const parts = strings(entry[2]); // em minúsculas e com "/", como a linha de comando abaixo
    if (!parts.length) continue;
    const base = entry[1].toLowerCase();
    if (!byArgs.has(base)) byArgs.set(base, []);
    byArgs.get(base).push([parts, entry[0]]);
  }
  const folders = strings(data?.folders), ignore = strings(data?.ignore), ignorePaths = strings(data?.ignorePaths);
  const share = Number(data?.minScreenShare);

  return {
    size: byBase.size,
    folders: folders.length,
    minScreenShare: share > 0 && share <= 1 ? share : 1 / 3,
    // { name, exact } ou null. exact: veio da lista ou da linha de comando (vale com qualquer tamanho de janela).
    // commandLine: o texto da linha de comando do processo, ou uma função que o lê (só é chamada quando precisa).
    match(file, commandLine) {
      const full = normalize(file);
      const base = baseName(full);
      // Pastas ignoradas valem até para a lista: o Discord cadastra ferramentas como o Lossless Scaling.
      if (ignorePaths.some((part) => full.includes(part))) return null;
      let best = null;
      // Com mais de um candidato, vale o sufixo mais longo (o mais específico).
      for (const [suffix, name] of byBase.get(base) || []) {
        if ((full === suffix || full.endsWith('/' + suffix)) && (!best || suffix.length > best[0].length)) best = [suffix, name];
      }
      if (best) return { name: best[1], exact: true };
      const rules = byArgs.get(base);
      if (rules && commandLine) {
        let line = '';
        try { line = normalize(typeof commandLine === 'function' ? commandLine() : commandLine); } catch { /* o processo fechou */ }
        const rule = line && rules.find(([parts]) => parts.some((part) => line.includes(part)));
        if (rule) return { name: rule[1], exact: true };
      }
      if (ignore.some((word) => base.includes(word))) return null;
      for (const folder of folders) {
        const at = full.indexOf('/' + folder);
        if (at < 0) continue;
        const rest = full.slice(at + 1 + folder.length);
        const slash = rest.indexOf('/');
        // O exe fica dentro da pasta do jogo. O nome sai do caminho original, com as maiúsculas da pasta
        // ("Forza Horizon 5"), porque aparece para a galera no "Jogando agora".
        if (slash > 0) return { name: String(file).split('\\').join('/').substr(at + 1 + folder.length, slash), exact: false };
      }
      return null;
    },
    // Se o caminho passa por uma biblioteca de jogos ("steamapps/common/", "riot games/"…).
    inLibrary(file) {
      const full = '/' + normalize(file);
      return folders.some((folder) => full.includes('/' + folder));
    },
  };
}

const MAX_CUSTOM = 100;
const MAX_NAME = 60;

// A lista "Seus jogos" do jeito que fica salva: [{ name, exe }], sem repetir o executável.
function cleanCustom(list) {
  const seen = new Set();
  const games = [];
  for (const item of Array.isArray(list) ? list : []) {
    const exe = typeof item?.exe === 'string' ? item.exe.trim() : '';
    const name = typeof item?.name === 'string' ? item.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
    if (!name || !/\.exe$/i.test(exe) || exe.length > 1000 || seen.has(normalize(exe))) continue;
    seen.add(normalize(exe));
    games.push({ name, exe });
    if (games.length >= MAX_CUSTOM) break;
  }
  return games;
}

// O reconhecedor do servidor (ou null, antes da primeira lista) mais os jogos que a pessoa adicionou.
// Um jogo adicionado vale pelo caminho inteiro do executável, com qualquer tamanho de janela e mesmo numa pasta ignorada.
function withCustom(base, list) {
  const mine = new Map(cleanCustom(list).map((game) => [normalize(game.exe), game.name]));
  if (!mine.size) return base;
  return {
    size: (base?.size || 0) + mine.size,
    folders: base?.folders || 0,
    minScreenShare: base?.minScreenShare || 1 / 3,
    match(file, commandLine) {
      const name = mine.get(normalize(file));
      if (name) return { name, exact: true, custom: true };
      return base ? base.match(file, commandLine) : null;
    },
    inLibrary: (file) => !!base?.inLibrary(file),
  };
}

module.exports = { createGameMatcher, withCustom, cleanCustom, MAX_CUSTOM, MAX_NAME };
