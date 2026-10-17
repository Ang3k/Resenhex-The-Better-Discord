// Descobre se um executável é um jogo, com o que o servidor do Resenhex manda (server/games.js):
// { games: [[nome, ["pasta/jogo.exe", "jogo.exe"]]], folders, ignore, ignorePaths, minScreenShare }.
//
// - Pela lista: o caminho completo do processo precisa terminar com o executável da lista, inteiro.
//   "C:\Riot Games\VALORANT\live\ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe" casa com
//   "win64/valorant-win64-shipping.exe", mas "notwin64/…" não.
// - Pela pasta da loja: um executável numa pasta de jogo de uma biblioteca (ex.: "steamapps/common/AION2/…")
//   conta como jogo, a não ser que o nome esteja entre os ignorados (launchers, instaladores…).
// - Pastas ignoradas (ferramentas como Wallpaper Engine e Lossless Scaling) nunca contam, nem pela lista.
//   Quem chama ainda confere o tamanho da janela (minScreenShare), porque ali também há ferramentas.

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
  const folders = strings(data?.folders), ignore = strings(data?.ignore), ignorePaths = strings(data?.ignorePaths);
  const share = Number(data?.minScreenShare);

  return {
    size: byBase.size,
    folders: folders.length,
    minScreenShare: share > 0 && share <= 1 ? share : 1 / 3,
    // { name, exact } ou null. exact: veio da lista (vale com qualquer tamanho de janela).
    match(file) {
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
      if (ignore.some((word) => base.includes(word))) return null;
      for (const folder of folders) {
        const at = full.indexOf('/' + folder);
        if (at < 0) continue;
        const rest = full.slice(at + 1 + folder.length);
        const slash = rest.indexOf('/');
        if (slash > 0) return { name: rest.slice(0, slash), exact: false }; // o exe fica dentro da pasta do jogo
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

module.exports = { createGameMatcher };
