const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { uiohookKeycode } = require('../lib/ptt-keys');
const { parseTitle, badgeName } = require('../lib/title-badge');
const { createStore } = require('../lib/store');

test('converte códigos de tecla do site para o gancho global', () => {
  assert.equal(uiohookKeycode('Backquote'), 41);
  assert.equal(uiohookKeycode('KeyV'), 47);
  assert.equal(uiohookKeycode('Digit1'), 2);
  assert.equal(uiohookKeycode('Space'), 57);
  assert.equal(uiohookKeycode('F13'), 91);
  assert.equal(uiohookKeycode('ControlLeft'), 29);
  assert.equal(uiohookKeycode('AltRight'), 3640);
  assert.equal(uiohookKeycode('Numpad0'), 82);
  assert.equal(uiohookKeycode('IntlBackslash'), 86);
  assert.equal(uiohookKeycode('MouseButton4'), null);
  assert.equal(uiohookKeycode('constructor'), null);
  assert.equal(uiohookKeycode(''), null);
  assert.equal(uiohookKeycode(undefined), null);
});

test('lê menções e não lidas do título', () => {
  assert.deepEqual(parseTitle('(3) geral | Resenha | Resenhex'), { mentions: 3, unread: true });
  assert.deepEqual(parseTitle('• geral | Resenha | Resenhex'), { mentions: 0, unread: true });
  assert.deepEqual(parseTitle('geral | Resenha | Resenhex'), { mentions: 0, unread: false });
  assert.deepEqual(parseTitle('(1) Resenhex (2)'), { mentions: 1, unread: true });
  assert.equal(badgeName({ mentions: 0, unread: false }), null);
  assert.equal(badgeName({ mentions: 0, unread: true }), 'badge-dot');
  assert.equal(badgeName({ mentions: 4, unread: true }), 'badge-4');
  assert.equal(badgeName({ mentions: 12, unread: true }), 'badge-9plus');
});

test('preferências sobrevivem a reinícios e ignoram arquivo corrompido', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-store-'));
  const file = path.join(dir, 'prefs.json');
  const store = createStore(file, { closeToTray: true });
  assert.equal(store.get('closeToTray'), true);
  store.set('closeToTray', false);
  assert.equal(createStore(file, { closeToTray: true }).get('closeToTray'), false);
  fs.writeFileSync(file, '{quebrado');
  assert.equal(createStore(file, { closeToTray: true }).get('closeToTray'), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('o registro grava linhas com data e nível e recomeça quando fica grande', () => {
  const { createLog } = require('../lib/log');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-log-'));
  const file = path.join(dir, 'resenhex.log');
  const log = createLog(file);
  log.info('Iniciando a versão', '1.0.0');
  log.warn(new Error('sem internet'));
  log.debug('não aparece');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter((line) => /^\d{4}-/.test(line));
  assert.equal(lines.length, 2, 'o stack do erro continua na mesma entrada');
  assert.match(lines[0], /^\d{4}-\d\d-\d\dT.* \[info\] Iniciando a versão 1\.0\.0$/);
  assert.match(lines[1], /\[aviso\] Error: sem internet/);
  fs.writeFileSync(file, 'x'.repeat(600 * 1024));
  createLog(file).info('de novo');
  assert.match(fs.readFileSync(file, 'utf8'), /^\S+ \[info\] de novo\n$/);
  fs.rmSync(dir, { recursive: true, force: true });
});
