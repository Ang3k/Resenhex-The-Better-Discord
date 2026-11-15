// "Seus jogos": programas que a pessoa marcou como jogo na aba Jogos das configurações, para o que a lista do
// servidor não reconhece (jogo pirata numa pasta qualquer, jogo novo, emulador). Ficam nas preferências do app
// e valem antes da lista do servidor (withCustom em game-detect.js), no overlay, no "Jogando agora" e na
// transmissão que segue a partida.
const path = require('node:path');
const { cleanCustom } = require('./game-detect');

const MAX_OPEN = 40;
const handleOf = (sourceId) => Number(/^window:(\d+):/.exec(String(sourceId))?.[1]) || 0;
const key = (exe) => String(exe || '').toLowerCase().split('\\').join('/');
// O nome que aparece no "Jogando agora", se a pessoa não escolher: o nome do arquivo sem o ".exe".
const defaultName = (exe) => path.win32.basename(String(exe || '')).replace(/\.exe$/i, '');

// store: { get, set } (preferências). windows: foreground.js (processOf, commandLine), ou null fora do Windows.
// sources(): Promise<[{ id: "window:<HWND>:0", name }]> das janelas abertas. games: game-list.js.
function createMyGames({ store, windows, sources, games, self = process.pid }) {
  let list = cleanCustom(store.get('myGames'));
  let offered = new Set(); // os executáveis da última lista de programas abertos: só eles podem entrar
  const save = (next) => { list = cleanCustom(next); store.set('myGames', list); return list; };

  // Os programas com janela aberta agora, um por executável: [{ title, exe, file, game, mine }].
  // game: o nome com que já é reconhecido ('' se não é); mine: está entre os adicionados.
  async function open() {
    if (!windows) return [];
    const matcher = games.matcher();
    const seen = new Set();
    const programs = [];
    for (const source of await sources()) {
      const hwnd = handleOf(source.id);
      const owner = hwnd ? windows.processOf(hwnd) : null;
      if (!owner?.exe || owner.pid === self || seen.has(key(owner.exe))) continue;
      seen.add(key(owner.exe));
      // As janelas do próprio Windows (Explorador, Configurações) nunca são jogo.
      if (/^[a-z]:\/windows\//.test(key(owner.exe))) continue;
      const game = matcher?.match(owner.exe, () => windows.commandLine?.(owner.pid));
      programs.push({ title: String(source.name || '').trim().slice(0, 120), exe: owner.exe, file: path.win32.basename(owner.exe),
        game: game ? game.name : '', mine: !!game?.custom });
      if (programs.length >= MAX_OPEN) break;
    }
    offered = new Set(programs.map((program) => key(program.exe)));
    return programs;
  }

  return {
    list: () => list,
    open,
    // Adiciona um programa da última lista de abertos, ou troca o nome de um jogo já adicionado. Devolve a lista.
    add(exe, name) {
      const at = list.findIndex((game) => key(game.exe) === key(exe));
      const clean = String(name || '').replace(/\s+/g, ' ').trim();
      if (at >= 0) return clean ? save(list.map((game, i) => (i === at ? { ...game, name: clean } : game))) : list;
      if (!offered.has(key(exe))) return list;
      return save([...list, { name: clean || defaultName(exe), exe: String(exe) }]);
    },
    remove(exe) {
      return list.some((game) => key(game.exe) === key(exe)) ? save(list.filter((game) => key(game.exe) !== key(exe))) : list;
    },
  };
}

module.exports = { createMyGames, defaultName };
