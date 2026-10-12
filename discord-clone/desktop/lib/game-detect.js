// Descobre se um executável é um jogo conhecido, com a lista que o servidor do Resenhex serve
// (tirada da lista de jogos detectáveis do Discord): [[nome, ["pasta/jogo.exe", "jogo.exe"]]].
// O caminho completo do processo precisa terminar com o executável da lista, inteiro:
// "C:\Riot Games\VALORANT\live\ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe" casa com
// "win64/valorant-win64-shipping.exe", mas "notwin64/…" não.

const normalize = (file) => String(file || '').toLowerCase().split('\\').join('/');
const baseName = (file) => file.slice(file.lastIndexOf('/') + 1);

function createGameMatcher(games) {
  const byBase = new Map(); // "jogo.exe" -> [[sufixo, nome]]
  for (const entry of Array.isArray(games) ? games : []) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) continue;
    for (const exe of entry[1]) {
      if (typeof exe !== 'string' || !exe) continue;
      const suffix = normalize(exe);
      const base = baseName(suffix);
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push([suffix, entry[0]]);
    }
  }
  return {
    size: byBase.size,
    // Nome do jogo, ou null. Com mais de um candidato, vale o sufixo mais longo (o mais específico).
    match(file) {
      const full = normalize(file);
      const candidates = byBase.get(baseName(full));
      if (!candidates) return null;
      let best = null;
      for (const [suffix, name] of candidates) {
        if ((full === suffix || full.endsWith('/' + suffix)) && (!best || suffix.length > best[0].length)) best = [suffix, name];
      }
      return best ? best[1] : null;
    },
  };
}

module.exports = { createGameMatcher };
