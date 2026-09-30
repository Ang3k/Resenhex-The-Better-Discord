const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader } = require('jsdom');

// Roda public/desktop.js como no navegador e como dentro do app de desktop (com a ponte simulada).
const publicDir = path.join(__dirname, '..', 'public');
const html = '<body><a id="btn-download-app" class="hidden" href="/baixar"></a></body>';

function load({ userAgent, bridge } = {}) {
  const dom = new JSDOM(html, { url: 'https://resenhex.test/', runScripts: 'outside-only', pretendToBeVisual: true, resources: new ResourceLoader({ userAgent }) });
  const w = dom.window;
  if (bridge) w.resenhexDesktop = bridge;
  w.eval(fs.readFileSync(path.join(publicDir, 'icons.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(publicDir, 'desktop.js'), 'utf8'));
  return w;
}

const sources = [
  { id: 'screen:0:0', name: 'Entire Screen', kind: 'screen', thumbnail: null, icon: null },
  { id: 'window:7:0', name: 'Jogo', kind: 'window', thumbnail: null, icon: null },
];
const bridge = () => {
  const calls = { theme: [], picker: null };
  return { calls, onPickSource: (fn) => { calls.picker = fn; }, setTheme: (colors) => calls.theme.push(colors), setPushToTalk() {}, onPushToTalk() {}, focus() {} };
};

test('no navegador, oferece o app só para quem usa Windows', () => {
  const windows = load({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0' });
  assert.equal(windows.document.querySelector('#btn-download-app').classList.contains('hidden'), false);
  assert.equal(windows.DesktopApp.available, false);
  const phone = load({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Chrome/140.0' });
  assert.equal(phone.document.querySelector('#btn-download-app').classList.contains('hidden'), true);
});

test('dentro do app, escolhe a fonte e respeita o som do computador', async () => {
  const b = bridge();
  const w = load({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Electron/44', bridge: b });
  assert.equal(w.document.documentElement.classList.contains('desktop-app'), true);
  assert.equal(w.document.querySelector('#btn-download-app').classList.contains('hidden'), true);
  assert.equal(typeof b.calls.picker, 'function');

  const choice = b.calls.picker(sources, { audio: true });
  const doc = w.document;
  const tabs = [...doc.querySelectorAll('.share-tabs button')];
  assert.deepEqual(tabs.map((t) => t.textContent), ['Aplicativos1', 'Telas1']);
  const start = doc.querySelector('.share-picker .btn-primary');
  assert.equal(start.disabled, true, 'nada escolhido ainda');
  tabs[1].click();
  const screen = doc.querySelector('.share-source');
  assert.equal(screen.textContent, 'Tela inteira');
  screen.click();
  assert.equal(start.disabled, false);
  doc.querySelector('.share-audio input').click(); // desliga o som
  start.click();
  assert.deepEqual({ ...await choice }, { id: 'screen:0:0', audio: false });
});

test('Esc cancela e uma nova escolha substitui a anterior', async () => {
  const b = bridge();
  const w = load({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Electron/44', bridge: b });
  const first = b.calls.picker(sources, {});
  const second = b.calls.picker(sources, {});
  assert.equal(await first, null);
  assert.equal(w.document.querySelector('.share-audio'), null, 'sem som pedido, sem opção de som');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(await second, null);
});
