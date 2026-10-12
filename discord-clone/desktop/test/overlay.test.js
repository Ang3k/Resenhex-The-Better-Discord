const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameMatcher } = require('../lib/game-detect');
const { overlayConfig, overlayPosition, overlayBounds, overlayState } = require('../lib/overlay-layout');

const GAMES = [
  ['VALORANT', ['win64/valorant-win64-shipping.exe']],
  ['Among Us', ['among us.exe']],
  ['Jogo genérico', ['game.exe']],
  ['Jogo específico', ['meujogo/bin/game.exe']],
];

test('reconhece o jogo pelo final do caminho do executável', () => {
  const { match } = createGameMatcher(GAMES);
  assert.equal(match('C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe'), 'VALORANT');
  assert.equal(match('D:\\Steam\\steamapps\\common\\Among Us\\Among Us.exe'), 'Among Us');
  assert.equal(match('C:\\Outro\\NotWin64\\valorant-win64-shipping.exe'), null, 'a pasta precisa ser inteira');
  assert.equal(match('C:\\Windows\\explorer.exe'), null);
  assert.equal(match(''), null);
});

test('com dois candidatos, vale o executável mais específico', () => {
  const { match } = createGameMatcher(GAMES);
  assert.equal(match('C:\\Jogos\\MeuJogo\\bin\\game.exe'), 'Jogo específico');
  assert.equal(match('C:\\Jogos\\Outro\\game.exe'), 'Jogo genérico');
});

test('ignora entradas quebradas da lista', () => {
  const { match, size } = createGameMatcher([null, ['Sem exe'], [3, ['x.exe']], ['Ok', ['ok.exe', '', 5]]]);
  assert.equal(size, 1);
  assert.equal(match('C:\\ok.exe'), 'Ok');
  assert.equal(createGameMatcher(null).size, 0);
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

test('chamada grande mostra 25 e conta o resto', () => {
  const users = Array.from({ length: 30 }, (_, i) => ({ id: 'u' + i, name: 'U' + i }));
  const state = overlayState({ users });
  assert.equal(state.users.length, 25);
  assert.equal(state.more, 5);
});
