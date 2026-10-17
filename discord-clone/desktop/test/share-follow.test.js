const test = require('node:test');
const assert = require('node:assert/strict');
const { createShareFollow, isGameOf } = require('../lib/share-follow');
const { createGameMatcher } = require('../lib/game-detect');

// Regras como as do servidor (server/games.js), com o LoL da lista do Discord.
const matcher = createGameMatcher({
  games: [['League of Legends', ['league of legends.exe']], ['Counter-Strike 2', ['win64/cs2.exe']]],
  folders: ['steamapps/common/', 'riot games/'],
  ignore: ['launcher', 'crash', 'leagueclient', 'riotclient'],
  ignorePaths: ['riot games/riot client/'],
});
const CLIENT = 'C:\\Riot Games\\League of Legends\\LeagueClientUx.exe';
const GAME = 'C:\\Riot Games\\League of Legends\\Game\\League of Legends.exe';

test('o jogo do launcher fica dentro da pasta dele, e a Steam não segue qualquer jogo', () => {
  assert.equal(isGameOf(CLIENT, GAME, matcher), true);
  assert.equal(isGameOf('D:\\Jogos\\League of Legends\\LeagueClientUx.exe', 'D:\\Jogos\\League of Legends\\Game\\League of Legends.exe', matcher), true, 'em outra pasta também');
  assert.equal(isGameOf(GAME, GAME, matcher), false, 'o próprio jogo não segue a si mesmo');
  assert.equal(isGameOf(CLIENT, 'C:\\Riot Games\\League of Legends\\LeagueClientUxRender.exe', matcher), false, 'outro processo do client não é jogo');
  assert.equal(isGameOf(CLIENT, 'C:\\Games\\cs2\\game\\bin\\win64\\cs2.exe', matcher), false, 'jogo de outra pasta');
  assert.equal(isGameOf('C:\\Program Files (x86)\\Steam\\steam.exe', 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe', matcher), false, 'biblioteca da Steam');
  assert.equal(isGameOf('C:\\League of Legends.exe', 'C:\\x\\League of Legends.exe', matcher), false, 'o disco inteiro não é a pasta do launcher');
  assert.equal(isGameOf(CLIENT, GAME, null), false, 'sem a lista de jogos, nada muda');
});

// Janelas falsas: 10 é o client (pid 100), 20 é a partida (pid 200), 30 é o client reaberto (pid 300).
function harness() {
  const state = { foreground: null, alive: new Set([10]), visible: new Set([10]), sources: [{ id: 'window:10:0', name: 'League of Legends' }] };
  const owners = { 10: { pid: 100, exe: CLIENT }, 20: { pid: 200, exe: GAME }, 30: { pid: 300, exe: CLIENT } };
  const windows = () => state.foreground;
  windows.processOf = (hwnd) => state.alive.has(hwnd) ? owners[hwnd] : null;
  windows.alive = (hwnd) => state.alive.has(hwnd);
  windows.visible = (hwnd) => state.visible.has(hwnd);
  const sent = [], timers = [];
  let clock = 0;
  const contents = { isDestroyed: () => false };
  const follow = createShareFollow({
    windows, games: { matcher: () => matcher }, log: { info() {}, warn() {} },
    sources: async () => state.sources, large: () => true, now: () => clock,
    send: (target, message) => { assert.equal(target, contents); sent.push(message); },
    setInterval: (fn) => { timers.push(fn); return timers.length; }, clearInterval: () => { timers.length = 0; },
  });
  const tick = async (ms = 1000) => { clock += ms; timers[0]?.(); await new Promise(setImmediate); await new Promise(setImmediate); };
  const openGame = () => {
    state.alive.add(20); state.visible.add(20);
    state.foreground = { hwnd: 20, pid: 200, exe: GAME, rect: { x: 0, y: 0, width: 1920, height: 1080 } };
    state.sources = [...state.sources, { id: 'window:20:0', name: 'League of Legends (TM) Client' }];
  };
  const closeGame = () => {
    state.alive.delete(20); state.visible.delete(20);
    state.foreground = null;
    state.sources = state.sources.filter((source) => source.id !== 'window:20:0');
  };
  return { state, follow, contents, sent, timers, tick, openGame, closeGame };
}

test('vai do client para a partida e volta, levando junto o som que seguia o client', async () => {
  const h = harness();
  h.follow.start(h.contents, { source: { id: 'window:10:0', name: 'League of Legends' }, audio: { enabled: true, pids: [100, 555] } });
  await h.tick();
  assert.deepEqual(h.sent, [], 'no client, nada muda');

  h.openGame();
  h.state.visible.delete(10); // o client se esconde durante a partida
  await h.tick();
  assert.deepEqual(h.sent, [{ action: 'switch', to: 'game', name: 'League of Legends (TM) Client' }]);
  assert.equal(h.follow.takePick(h.contents), null, 'sem a confirmação do site, o seletor de alguém não é desviado');
  assert.equal(h.follow.accept(h.contents), true);
  assert.deepEqual(h.follow.takePick(h.contents), { source: { id: 'window:20:0', name: 'League of Legends (TM) Client' }, audio: true, pids: [200, 555] });
  assert.equal(h.follow.takePick(h.contents), null, 'cada troca vale um pedido');
  await h.tick();
  assert.equal(h.sent.length, 1, 'na partida, fica na partida');

  h.closeGame();
  assert.equal(h.follow.ended(h.contents), true, 'o site espera em vez de parar');
  await h.tick();
  assert.equal(h.sent.length, 1, 'espera o client aparecer de novo');
  h.state.visible.add(10);
  await h.tick();
  assert.deepEqual(h.sent.at(-1), { action: 'switch', to: 'home', name: 'League of Legends' });
  h.follow.accept(h.contents);
  assert.deepEqual(h.follow.takePick(h.contents), { source: { id: 'window:10:0', name: 'League of Legends' }, audio: true, pids: [100, 555] });

  h.openGame(); // a próxima partida segue de novo
  await h.tick();
  assert.equal(h.sent.at(-1).to, 'game');
  h.follow.stop(h.contents);
  assert.equal(h.timers.length, 0);
});

test('a troca não confirmada expira e é pedida de novo; sem o launcher depois da partida, para', async () => {
  const h = harness();
  h.follow.start(h.contents, { source: { id: 'window:10:0', name: 'League of Legends' }, audio: { enabled: false, pids: [] } });
  h.openGame();
  await h.tick();
  await h.tick(5000);
  assert.equal(h.sent.length, 1, 'enquanto a troca vale, não repete');
  await h.tick(15000);
  assert.equal(h.sent.length, 2, 'o site estava ocupado: pede de novo');
  h.follow.accept(h.contents);
  assert.deepEqual(h.follow.takePick(h.contents).pids, []);

  // O client fecha na partida (opção do LoL) e não volta.
  h.state.alive.delete(10); h.state.visible.delete(10);
  h.state.sources = h.state.sources.filter((source) => source.id !== 'window:10:0');
  h.closeGame();
  assert.equal(h.follow.ended(h.contents), true);
  await h.tick(30000);
  assert.equal(h.sent.at(-1).action, 'switch', 'ainda esperando');
  await h.tick(31000);
  assert.deepEqual(h.sent.at(-1), { action: 'stop' });
  assert.equal(h.timers.length, 0);
});

test('o client reaberto em outra janela também vale para a volta', async () => {
  const h = harness();
  h.follow.start(h.contents, { source: { id: 'window:10:0', name: 'League of Legends' }, audio: { enabled: true, pids: [100] } });
  h.openGame();
  h.state.alive.delete(10); h.state.visible.delete(10); // o client fechou para a partida
  await h.tick();
  h.follow.accept(h.contents);
  h.follow.takePick(h.contents);
  h.closeGame();
  h.state.alive.add(30); h.state.visible.add(30);
  h.state.sources = [{ id: 'window:30:0', name: 'League of Legends' }];
  await h.tick();
  assert.deepEqual(h.sent.at(-1), { action: 'switch', to: 'home', name: 'League of Legends' });
  h.follow.accept(h.contents);
  assert.deepEqual(h.follow.takePick(h.contents), { source: { id: 'window:30:0', name: 'League of Legends' }, audio: true, pids: [300] });
});

test('o próprio jogo ou um app qualquer fechado param a transmissão na hora, como antes', async () => {
  const h = harness();
  h.follow.start(h.contents, { source: { id: 'window:20:0', name: 'League of Legends (TM) Client' }, audio: { enabled: true, pids: [] } });
  assert.equal(h.timers.length, 0, 'a janela já fechou: nada a seguir');
  h.openGame();
  h.follow.start(h.contents, { source: { id: 'window:20:0', name: 'League of Legends (TM) Client' }, audio: { enabled: true, pids: [] } });
  assert.equal(h.follow.ended(h.contents), false, 'transmitindo o jogo, o fim da partida para a transmissão');
  assert.equal(h.timers.length, 0);
  assert.equal(h.follow.ended({}), false, 'outra página não interfere');
});
