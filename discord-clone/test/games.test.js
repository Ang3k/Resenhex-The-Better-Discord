const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { slimDetectable, createGameList, RULES, EXTRA_GAMES } = require('../games');

const exe = (name, extra = {}) => ({ name, os: 'win32', is_launcher: false, ...extra });

test('deixa só o nome e os executáveis de Windows dos jogos', () => {
  const games = slimDetectable([
    { name: 'VALORANT', cover_image_hash: 'x', executables: [exe('win64/VALORANT-Win64-Shipping.exe'), exe('valorant', { os: 'darwin' })] },
    { name: 'Steam', executables: [exe('steam.exe', { is_launcher: true })] },
    { name: 'Half-Life 2', executables: [exe('>hl2.exe'), exe('hl2\\bin\\hl2.exe'), exe('hl2/bin/hl2.exe')] },
    { name: 'Sem Windows', executables: [exe('x', { os: 'linux' })] },
    { name: '', executables: [exe('a.exe')] },
    null,
  ]);
  assert.deepEqual(games, [
    ['VALORANT', ['win64/valorant-win64-shipping.exe']],
    ['Half-Life 2', ['hl2/bin/hl2.exe']],
  ]);
  assert.deepEqual(slimDetectable({}), []);
});

function fakeDiscord(count) {
  return Array.from({ length: count }, (_, i) => ({ name: 'Jogo ' + i, executables: [exe(`jogo${i}.exe`)] }));
}

test('baixa a lista na primeira vez, guarda em disco e reaproveita', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jogos-'));
  const file = path.join(dir, 'jogos.json');
  let calls = 0;
  const fetch = async () => { calls++; return { ok: true, json: async () => fakeDiscord(1500) }; };
  const list = createGameList({ file, fetch });
  const body = JSON.parse(await list.body());
  assert.equal(body.games.length, 1500 + EXTRA_GAMES.length);
  assert.deepEqual(body.games[0], EXTRA_GAMES[0], 'a lista extra vem junto');
  assert.deepEqual(body.folders, RULES.folders, 'e as regras das pastas das lojas');
  assert.ok(body.ignore.includes('launcher') && body.minScreenShare > 0);
  assert.equal(calls, 1);
  await list.body();
  assert.equal(calls, 1, 'lista nova não baixa de novo');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const again = createGameList({ file, fetch: async () => { throw new Error('sem rede'); } });
  const fromDisk = JSON.parse(await again.body());
  assert.equal(fromDisk.games.length, 1500 + EXTRA_GAMES.length, 'usa a cópia do disco');
  assert.deepEqual(fromDisk.folders, RULES.folders, 'com as regras atuais, não as da cópia');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resposta quebrada do Discord não substitui a lista boa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jogos-'));
  let time = 0;
  let response = fakeDiscord(1200);
  const list = createGameList({ file: path.join(dir, 'jogos.json'), now: () => time, fetch: async () => ({ ok: true, json: async () => response }) });
  assert.equal(JSON.parse(await list.body()).games.length, 1200 + EXTRA_GAMES.length);
  time = 2 * 24 * 60 * 60 * 1000;
  response = fakeDiscord(10);
  await list.refresh();
  assert.equal(JSON.parse(await list.body()).games.length, 1200 + EXTRA_GAMES.length);
  const empty = createGameList({ file: path.join(dir, 'outra.json'), fetch: async () => ({ ok: false, status: 500 }) });
  assert.equal(await empty.body(), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
