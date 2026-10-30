const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameMatcher } = require('../lib/game-detect');
const { createNowPlaying, isAlive } = require('../lib/now-playing');

const matcher = createGameMatcher({ games: [['VALORANT', ['win64/valorant-win64-shipping.exe']]], folders: ['steamapps/common/'] });
const VALORANT = String.raw`C:\Riot Games\VALORANT\live\ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe`;
const FORZA = String.raw`D:\SteamLibrary\steamapps\common\Forza Horizon 5\ForzaHorizon5.exe`;

// Janela da frente e processos vivos controlados pelo teste.
function setup() {
  const world = { top: null, alive: new Set(), changes: [], clock: 1000 };
  const playing = createNowPlaying({
    foreground: () => world.top, games: { matcher: () => matcher }, large: (rect) => rect.big,
    onChange: (game) => world.changes.push(game), alive: (pid) => world.alive.has(pid), now: () => world.clock, self: 1,
  });
  const front = (pid, exe, big = true) => { world.top = { pid, exe, rect: { big } }; world.alive.add(pid); };
  return { world, playing, front };
}

test('jogando agora: o jogo na frente vale até o processo fechar, mesmo com outra janela por cima', () => {
  const { world, playing, front } = setup();
  front(10, VALORANT);
  playing.check();
  assert.deepEqual(world.changes, [{ name: 'VALORANT', since: 1000 }]);

  world.clock = 5000;
  front(20, String.raw`C:\Windows\explorer.exe`);
  playing.check();
  playing.check();
  assert.equal(world.changes.length, 1, 'trocar de janela não muda nada');
  assert.deepEqual(playing.current(), { name: 'VALORANT', since: 1000 });

  world.alive.delete(10);
  playing.check();
  assert.deepEqual(world.changes.at(-1), null);
  assert.equal(playing.current(), null);
});

test('jogando agora: outro jogo na frente toma o lugar; pela pasta só vale com janela grande', () => {
  const { world, playing, front } = setup();
  front(10, VALORANT);
  playing.check();
  front(30, FORZA, false);
  playing.check();
  assert.equal(world.changes.length, 1, 'janela pequena numa pasta de jogos pode ser ferramenta');
  world.clock = 9000;
  front(30, FORZA, true);
  playing.check();
  assert.deepEqual(world.changes.at(-1), { name: 'Forza Horizon 5', since: 9000 });
});

test('jogando agora: o próprio Resenhex e janelas que somem no meio não contam', () => {
  const { world, playing, front } = setup();
  front(1, VALORANT);
  playing.check();
  world.top = null;
  playing.check();
  const broken = createNowPlaying({ foreground: () => { throw new Error('sumiu'); }, games: { matcher: () => matcher }, large: () => true, onChange: (g) => world.changes.push(g) });
  broken.check();
  assert.deepEqual(world.changes, []);
});

test('isAlive: o próprio processo existe e um pid impossível não', () => {
  assert.equal(isAlive(process.pid), true);
  assert.equal(isAlive(2 ** 22 + 7), false);
});
