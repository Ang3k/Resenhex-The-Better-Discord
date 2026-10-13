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
  return { calls, onPickSource: (fn, update) => { calls.picker = fn; calls.update = update; }, setTheme: (colors) => calls.theme.push(colors), setPushToTalk() {}, onPushToTalk() {}, focus() {} };
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
  assert.match(doc.querySelector('.share-setting small').textContent, /Só o som de Jogo/);
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

test('a qualidade fica na janela de escolha, como no Go Live', async () => {
  const b = bridge();
  const w = load({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Electron/44', bridge: b });
  const doc = w.document;
  const set = [];
  let current = 'auto';
  w.DesktopApp.shareQuality = {
    presets: {
      auto: { label: 'Automática', desc: 'Fluida', height: 1080, fps: 30 },
      p1080_60: { label: 'Movimento · 1080p / 60', desc: 'Jogos e vídeos', height: 1080, fps: 60 },
    },
    current: () => current,
    set: (key) => { set.push(key); current = key; },
  };
  let choice = b.calls.picker(sources, { audio: true });
  const chips = [...doc.querySelectorAll('.share-chip')];
  assert.deepEqual(chips.map((c) => c.textContent), ['Automáticaaté 1080p', 'Movimento1080p60']);
  assert.equal(chips[0].getAttribute('aria-checked'), 'true');
  chips[1].click();
  assert.equal(doc.querySelector('.share-setting small').textContent, 'Jogos e vídeos');
  assert.deepEqual(set, [], 'só vale ao transmitir');
  doc.querySelector('.share-source').click();
  doc.querySelector('.share-picker .btn-primary').click();
  await choice;
  assert.deepEqual(set, ['p1080_60']);

  choice = b.calls.picker(sources, { audio: true });
  const open = [...doc.querySelectorAll('.share-overlay:not(.closing)')].at(-1);
  assert.equal(open.querySelector('.share-chip.selected').dataset.preset, 'p1080_60', 'abre com a qualidade atual');
  open.querySelectorAll('.share-chip')[0].click();
  open.querySelector('.share-close').click();
  assert.equal(await choice, null);
  assert.deepEqual(set, ['p1080_60'], 'cancelar não muda a qualidade');
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

test('o seletor abre enquanto carrega e recebe fontes e áudio sem perder as escolhas', async () => {
  const b = bridge();
  const w = load({ bridge: b });
  const doc = w.document;
  const choice = b.calls.picker([], { audio: true, loading: true, appsLoading: true });
  assert.ok(doc.querySelector('.share-picker'), 'a janela já está aberta');
  assert.equal(doc.querySelector('.share-grid').getAttribute('aria-busy'), 'true');
  assert.equal(doc.querySelector('.btn-primary').disabled, true);

  b.calls.update(sources, { loading: false });
  assert.equal(doc.querySelector('.share-grid').getAttribute('aria-busy'), 'false');
  doc.querySelector('.share-source').click();
  const select = doc.querySelector('.share-audio-select');
  select.value = 'none';
  select.dispatchEvent(new w.Event('change'));
  select.focus();
  const mapped = sources.map((source) => ({ ...source, app: source.kind === 'window' ? 20 : null }));
  b.calls.update(mapped, { apps: [{ pid: 20, name: 'Jogo' }], appsLoading: false });
  assert.equal(doc.querySelector('.share-source.selected').textContent, 'Jogo');
  assert.equal(doc.querySelector('.share-audio-select').value, 'none', 'a atualização respeita o som escolhido');
  assert.equal(doc.activeElement, select, 'a atualização mantém o foco no som');
  doc.querySelector('.btn-primary').click();
  assert.deepEqual({ ...await choice }, { id: 'window:7:0', audio: false, app: null });
  b.calls.update(sources, {});
  assert.equal(doc.querySelector('.share-overlay:not(.closing)'), null, 'uma resposta tardia não reabre o seletor');
  w.close();
});

test('o áudio do app pode chegar depois da seleção da janela', async () => {
  const b = bridge();
  const w = load({ bridge: b });
  const choice = b.calls.picker(sources, { audio: true, appsLoading: true });
  w.document.querySelector('.share-source').click();
  b.calls.update(sources.map((source) => ({ ...source, app: 20 })), { appsLoading: false, apps: [{ pid: 20, name: 'Jogo' }] });
  assert.equal(w.document.querySelector('.share-audio-select').value, '20');
  w.document.querySelector('.btn-primary').click();
  assert.equal((await choice).app, 20);
  w.close();
});

test('fechar o seletor identifica o cancelamento, mas erros reais continuam sendo erros', async () => {
  const b = bridge();
  const w = load({ bridge: b });
  const denied = () => Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const current = () => w.document.querySelector('.share-overlay:not(.closing)');
  for (const close of [() => current().querySelector('.share-close').click(),
    () => current().querySelector('.btn-ghost').click(),
    () => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))]) {
    const capture = w.DesktopApp.captureScreen(async () => { await b.calls.picker(sources, {}); throw denied(); });
    close();
    await assert.rejects(capture, { name: 'ShareCancelledError' });
  }
  await assert.rejects(w.DesktopApp.captureScreen(async () => { throw denied(); }), { name: 'NotAllowedError' });
  const failure = w.DesktopApp.captureScreen(async () => { await b.calls.picker([], { loading: true }); throw denied(); });
  b.calls.update(null, { closed: true });
  await assert.rejects(failure, { name: 'NotAllowedError' }, 'uma falha do app não vira cancelamento voluntário');
  w.close();
});
