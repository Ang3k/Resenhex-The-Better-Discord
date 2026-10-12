const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('desktop bridge keeps call controls without exposing character voice conversion', () => {
  const exposed = {}, listeners = [], sent = [];
  const electron = {
    contextBridge: { exposeInMainWorld(name, value) { exposed[name] = value; } },
    ipcRenderer: { on(name) { listeners.push(name); }, send(...args) { sent.push(args); }, invoke() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return electron; },
    process: { argv: ['--resenhex-origin=https://resenhex.test'], platform: 'win32' },
    location: { origin: 'https://resenhex.test', protocol: 'https:' },
  });
  assert.equal(exposed.resenhexDesktop.voiceAi, undefined);
  assert.ok(listeners.includes('desktop:ptt'));
  assert.ok(listeners.every(name => !name.startsWith('desktop:voice-ai:')));
  exposed.resenhexDesktop.setPushToTalk({ enabled: true, code: 'Backquote' });
  assert.equal(sent[0][0], 'desktop:set-ptt');
  assert.equal(sent[0][1].enabled, true);
  assert.equal(sent[0][1].code, 'Backquote');
});
