const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { skipReason, install, BINARY } = require('../lib/capture-tuning');

const recorder = () => {
  const lines = [];
  return { lines, info: (...parts) => lines.push(['info', ...parts]), warn: (...parts) => lines.push(['aviso', ...parts]) };
};
const WINDOWS_24H2 = { platform: 'win32', release: '10.0.26100', env: {} };

test('o ajuste da captura só roda no Windows 11 24H2 ou mais novo e pode ser desligado', () => {
  assert.equal(skipReason(WINDOWS_24H2), null);
  assert.equal(skipReason({ ...WINDOWS_24H2, release: '10.0.26200' }), null);
  assert.match(skipReason({ ...WINDOWS_24H2, release: '10.0.22631' }), /24H2/);
  assert.match(skipReason({ ...WINDOWS_24H2, release: '10.0.19045' }), /24H2/);
  assert.match(skipReason({ platform: 'linux', release: '6.8.0', env: {} }), /Windows/);
  assert.match(skipReason({ ...WINDOWS_24H2, env: { RESENHEX_CAPTURA_PADRAO: '1' } }), /RESENHEX_CAPTURA_PADRAO/);
});

test('sem o módulo, ou se ele falhar, a captura segue sem ajuste e o motivo vai para o registro', () => {
  let log = recorder();
  assert.deepEqual(install({ log, ...WINDOWS_24H2, load: () => { throw new Error('Cannot find module'); } }), { ok: false, reason: 'Cannot find module' });
  assert.equal(log.lines[0][0], 'aviso');

  log = recorder();
  const failed = install({ log, ...WINDOWS_24H2, load: () => ({ install: () => ({ ok: false, reason: 'falhou', step: 6, hr: 0x80070057 }) }) });
  assert.equal(failed.step, 6);
  assert.deepEqual(log.lines[0][2], { ok: false, reason: 'falhou', step: 6, hr: '0x80070057' });

  log = recorder();
  let asked = null;
  assert.deepEqual(install({ log, ...WINDOWS_24H2, load: () => ({ install: (options) => { asked = options; return { ok: true }; } }) }), { ok: true });
  assert.deepEqual(asked, { intervalMs: 8, drain: true });
  assert.equal(log.lines[0][0], 'info');

  log = recorder();
  const older = install({ log, ...WINDOWS_24H2, release: '10.0.22631', load: () => assert.fail('não devia carregar o módulo') });
  assert.deepEqual(older, { ok: false, reason: 'Windows anterior ao 24H2' });
  assert.equal(log.lines[0][0], 'info');
});

// O node:test pula com qualquer valor que não seja false ou undefined, até null.
const unavailable = (fs.existsSync(BINARY) ? skipReason() : 'módulo não compilado') || false;
test('o módulo compilado troca as funções da captura do Windows', { skip: unavailable }, () => {
  const native = require(BINARY);
  assert.deepEqual(native.install({ intervalMs: 8, drain: true }), { ok: true });
  assert.deepEqual(native.install(), { ok: true }); // de novo não troca nada
  assert.deepEqual(native.stats(), { installed: true, sessions: 0, adjusted: 0, dropped: 0, defaultMs: -1 });
});
