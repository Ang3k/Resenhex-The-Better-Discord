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

test('o som da transmissão pode ser de um app só, e a janela de um app puxa o som dele', async () => {
  const b = bridge();
  const w = load({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Electron/44', bridge: b });
  const doc = w.document;
  const list = [...sources, { id: 'window:8:0', name: 'Navegador', kind: 'window', thumbnail: null, icon: null }];
  list[1] = { ...list[1], app: 20 };
  const apps = [{ pid: 31, name: 'Discord', icon: null }, { pid: 20, name: 'Jogo', icon: 'data:image/png;base64,AA==' }];

  let choice = b.calls.picker(list, { audio: true, apps });
  assert.equal(doc.querySelector('.share-audio input'), null, 'a escolha substitui o botão liga/desliga');
  const select = doc.querySelector('.share-audio-select');
  assert.deepEqual([...select.options].map((o) => o.textContent), ['Som do computador inteiro', 'Discord', 'Jogo', 'Sem som']);
  assert.equal(select.value, 'system');
  const cards = () => [...doc.querySelectorAll('.share-source')];
  cards()[0].click();
  assert.equal(select.value, '20', 'a janela do jogo leva o som do jogo');
  assert.match(doc.querySelector('.share-audio-body small').textContent, /Só o som de Jogo/);
  assert.ok(doc.querySelector('.share-audio-icon img'), 'com o ícone do app');
  cards()[1].click();
  assert.equal(select.value, 'system', 'janela sem app conhecido volta ao som do computador');
  cards()[0].click();
  doc.querySelector('.share-picker .btn-primary').click();
  assert.deepEqual({ ...await choice }, { id: 'window:7:0', audio: true, app: 20 });

  // A janela anterior ainda some com animação: cada rodada olha só a que está aberta.
  const current = () => [...doc.querySelectorAll('.share-overlay:not(.closing)')].at(-1);
  const chooseAudio = (value) => {
    const node = current().querySelector('.share-audio-select');
    node.value = value;
    node.dispatchEvent(new w.Event('change'));
    return node;
  };
  choice = b.calls.picker(list, { audio: true, apps });
  const manual = chooseAudio('31');
  current().querySelector('.share-source').click();
  assert.equal(manual.value, '31', 'a escolha feita à mão não muda com a janela');
  current().querySelector('.btn-primary').click();
  assert.deepEqual({ ...await choice }, { id: 'window:7:0', audio: true, app: 31 });

  choice = b.calls.picker(list, { audio: true, apps });
  chooseAudio('none');
  current().querySelector('.share-source').click();
  current().querySelector('.btn-primary').click();
  assert.deepEqual({ ...await choice }, { id: 'window:7:0', audio: false, app: null });
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
