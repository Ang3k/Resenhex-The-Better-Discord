const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameMatcher } = require('../lib/game-detect');
const { overlayConfig, overlayPosition, overlayBounds, overlayState, overlayStyle } = require('../lib/overlay-layout');

const GAMES = [
  ['VALORANT', ['win64/valorant-win64-shipping.exe']],
  ['Among Us', ['among us.exe']],
  ['Jogo genérico', ['game.exe']],
  ['Jogo específico', ['meujogo/bin/game.exe']],
];

const name = (found) => found && found.name;

test('reconhece o jogo pelo final do caminho do executável', () => {
  const { match } = createGameMatcher(GAMES);
  assert.deepEqual(match('C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe'), { name: 'VALORANT', exact: true });
  assert.equal(name(match('D:\\Steam\\steamapps\\common\\Among Us\\Among Us.exe')), 'Among Us');
  assert.equal(match('C:\\Outro\\NotWin64\\valorant-win64-shipping.exe'), null, 'a pasta precisa ser inteira');
  assert.equal(match('C:\\Windows\\explorer.exe'), null);
  assert.equal(match(''), null);
});

test('com dois candidatos, vale o executável mais específico', () => {
  const { match } = createGameMatcher(GAMES);
  assert.equal(name(match('C:\\Jogos\\MeuJogo\\bin\\game.exe')), 'Jogo específico');
  assert.equal(name(match('C:\\Jogos\\Outro\\game.exe')), 'Jogo genérico');
});

test('ignora entradas quebradas da lista', () => {
  const { match, size } = createGameMatcher([null, ['Sem exe'], [3, ['x.exe']], ['Ok', ['ok.exe', '', 5]]]);
  assert.equal(size, 1);
  assert.equal(name(match('C:\\ok.exe')), 'Ok');
  assert.equal(createGameMatcher(null).size, 0);
});

const RULES = {
  games: GAMES,
  folders: ['steamapps/common/', 'epic games/', 'xboxgames/'],
  ignore: ['launcher', 'crash', 'redist', 'steamwebhelper'],
  ignorePaths: ['steamapps/common/wallpaper_engine/', 'epic games/launcher/', '/_commonredist/', 'steamapps/common/lossless scaling/'],
  minScreenShare: 0.4,
};

test('reconhece pela pasta da loja qualquer jogo que não está na lista', () => {
  const { match, minScreenShare, folders } = createGameMatcher(RULES);
  assert.equal(folders, 3);
  assert.equal(minScreenShare, 0.4);
  assert.deepEqual(match('C:\\Program Files (x86)\\Steam\\steamapps\\common\\AION2\\Aion2\\Binaries\\Win64\\AION2.exe'), { name: 'aion2', exact: false });
  assert.deepEqual(match('E:\\SteamLibrary\\steamapps\\common\\Jogo Novo\\JogoNovo.exe'), { name: 'jogo novo', exact: false });
  assert.deepEqual(match('C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe'), { name: 'fortnite', exact: false });
  assert.deepEqual(match('C:\\XboxGames\\Forza Horizon 5\\Content\\ForzaHorizon5.exe'), { name: 'forza horizon 5', exact: false });
  assert.deepEqual(match('D:\\Steam\\steamapps\\common\\Among Us\\Among Us.exe'), { name: 'Among Us', exact: true }, 'a lista vale antes da pasta');
});

test('pela pasta, ignora launchers, ferramentas e instaladores', () => {
  const { match } = createGameMatcher(RULES);
  assert.equal(match('C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe'), null);
  assert.equal(createGameMatcher({ ...RULES, games: [['Lossless Scaling', ['losslessscaling.exe']]] }).match('C:\\Steam\\steamapps\\common\\Lossless Scaling\\LosslessScaling.exe'), null, 'ferramenta da lista do Discord numa pasta ignorada');
  assert.equal(match('C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe'), null);
  assert.equal(match('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Jogo\\Engine\\CrashReportClient.exe'), null);
  assert.equal(match('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Jogo\\_CommonRedist\\vcredist\\x.exe'), null);
  assert.equal(match('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Jogo\\JogoLauncher.exe'), null);
  assert.equal(match('C:\\Program Files (x86)\\Steam\\steamapps\\common\\solto.exe'), null, 'precisa estar dentro da pasta de um jogo');
  assert.equal(match('C:\\Program Files (x86)\\Steam\\steamwebhelper.exe'), null);
  assert.equal(match('C:\\Users\\eu\\AppData\\Local\\Programs\\Opera GX\\opera.exe'), null);
});

test('sem regras de pastas (servidor antigo), só a lista vale', () => {
  const { match, minScreenShare } = createGameMatcher({ games: GAMES });
  assert.equal(match('C:\\Steam\\steamapps\\common\\AION2\\AION2.exe'), null);
  assert.equal(minScreenShare, 1 / 3);
});

test('configuração do overlay começa desligada e no meio da tela, à esquerda', () => {
  assert.deepEqual(overlayConfig(null), { enabled: false, x: 0, y: 0.5 });
  assert.deepEqual(overlayConfig({ enabled: true, x: 0.25, y: 1 }), { enabled: true, x: 0.25, y: 1 });
  assert.deepEqual(overlayConfig({ enabled: 'sim', x: 'a', y: 2 }), { enabled: false, x: 0, y: 0.5 });
  assert.deepEqual(overlayConfig({ x: -1, y: 7 }), { enabled: false, x: 0, y: 1 }, 'fora da tela vira a borda');
  assert.deepEqual(overlayPosition({ corner: 'bottom-right' }), { x: 1, y: 1 }, 'canto das versões anteriores');
});

test('posiciona na área do jogo, com margem e sem passar da borda', () => {
  const area = { x: 1920, y: 0, width: 1920, height: 1080 };
  const size = { width: 240, height: 200 };
  assert.deepEqual(overlayBounds(area, { x: 0, y: 0 }, size), { x: 1936, y: 16, width: 240, height: 200 });
  assert.deepEqual(overlayBounds(area, { x: 1, y: 0 }, size), { x: 3584, y: 16, width: 240, height: 200 });
  assert.deepEqual(overlayBounds(area, { x: 0, y: 1 }, size), { x: 1936, y: 864, width: 240, height: 200 });
  assert.deepEqual(overlayBounds(area, { x: 1, y: 1 }, size), { x: 3584, y: 864, width: 240, height: 200 });
  assert.deepEqual(overlayBounds(area, { x: 0, y: 0.5 }, size), { x: 1936, y: 440, width: 240, height: 200 }, 'meio da esquerda centraliza a lista');
  assert.deepEqual(overlayBounds(area, { x: 0.5, y: 0.5 }, size), { x: 2760, y: 440, width: 240, height: 200 });
  assert.deepEqual(overlayBounds({ x: 0, y: 0, width: 200, height: 100 }, { x: 1, y: 1 }, size), { x: 16, y: 16, width: 168, height: 68 });
});

test('o resumo da chamada só passa o que o overlay desenha', () => {
  const state = overlayState({
    channel: 'Geral',
    users: [
      { id: 'a', name: 'Ana', color: '#ff0000', avatarUrl: '/avatars/x.png', avatarCrop: { x: 0.2, y: 0.8, zoom: 2 }, speaking: true, muted: false, extra: 'x' },
      { id: 'b', name: 'B'.repeat(200), color: 'red', avatarUrl: 'https://evil.example/a.png', muted: true, deafened: 1 },
      { id: 'c', name: 'C', avatarUrl: '//evil.example/a.png', avatarCrop: { x: 'a' } },
      { name: 'sem id' },
    ],
  });
  assert.equal(state.channel, 'Geral');
  assert.equal(state.users.length, 3);
  assert.deepEqual(state.users[0], { id: 'a', name: 'Ana', color: '#ff0000', avatarUrl: '/avatars/x.png', avatarCrop: { x: 0.2, y: 0.8, zoom: 2 }, speaking: true, muted: false, deafened: false, serverMuted: false, serverDeafened: false });
  assert.equal(state.users[1].name.length, 64);
  assert.equal(state.users[1].color, '#5865f2');
  assert.equal(state.users[1].avatarUrl, '', 'imagem de outro site não passa');
  assert.equal(state.users[1].deafened, false, 'só true vale');
  assert.equal(state.users[2].avatarUrl, '');
  assert.equal(state.users[2].avatarCrop, null);
  assert.equal(overlayState(null), null);
  assert.equal(overlayState({ users: 'x' }), null);
});

test('a aparência do overlay passa validada, com o padrão quando falta', () => {
  const standard = { opacity: 1, names: true, show: 'all', animated: true };
  assert.deepEqual(overlayState({ users: [] }).style, standard, 'site antigo, sem aparência');
  assert.deepEqual(overlayStyle({ opacity: 0.456, names: false, show: 'speaking', animated: false }), { opacity: 0.46, names: false, show: 'speaking', animated: false });
  assert.deepEqual(overlayStyle({ opacity: 0, show: 'ninguém', names: 0 }), { ...standard, opacity: 0.2 }, 'nunca some de vez; só false desliga');
  assert.equal(overlayStyle({ opacity: 7 }).opacity, 1);
  assert.equal(overlayStyle({ opacity: 'x' }).opacity, 1);
  assert.equal(overlayState({ users: [], style: { show: 'unmuted' } }).style.show, 'unmuted');
});

test('chamada grande mostra 25 e conta o resto', () => {
  const users = Array.from({ length: 30 }, (_, i) => ({ id: 'u' + i, name: 'U' + i }));
  const state = overlayState({ users });
  assert.equal(state.users.length, 25);
  assert.equal(state.more, 5);
});
