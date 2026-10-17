const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader } = require('jsdom');

// Roda public/desktop.js como no navegador e como dentro do app de desktop (com a ponte simulada).
const publicDir = path.join(__dirname, '..', 'public');
const html = '<body><a id="btn-download-app" class="hidden" href="/baixar"></a></body>';

function load({ userAgent, bridge, body = html } = {}) {
  const dom = new JSDOM(body, { url: 'https://resenhex.test/', runScripts: 'outside-only', pretendToBeVisual: true, resources: new ResourceLoader({ userAgent }) });
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

test('mostra o ícone do aplicativo enquanto recebe a prévia e preserva a seleção', async () => {
  const b = bridge();
  const w = load({ bridge: b });
  const list = sources.map(source => ({ ...source, icon: source.kind === 'window' ? 'data:image/png;base64,AA==' : null }));
  const choice = b.calls.picker(list, { audio: false });
  const card = w.document.querySelector('.share-source');
  assert.ok(card.querySelector('.share-placeholder-icon'));
  assert.equal(card.querySelector('.share-preview'), null);
  card.click(); card.focus();
  b.calls.update(list.map(source => ({ ...source, thumbnail: 'data:image/png;base64,AQ==' })), {});
  assert.ok(w.document.querySelector('.share-source.selected .share-preview'));
  assert.equal(w.document.activeElement.dataset.sourceId, 'window:7:0');
  w.document.querySelector('.btn-primary').click();
  assert.equal((await choice).id, 'window:7:0');
  w.close();
});

test('antecipa as prévias ao entrar na chamada e ao aproximar o foco ou mouse do botão', async () => {
  const b = bridge();
  let preparations = 0;
  b.prepareShare = () => preparations++;
  const w = load({ bridge: b, body: '<body><div id="voice-panel" class="hidden"><button id="btn-share"></button></div></body>' });
  const button = w.document.querySelector('#btn-share');
  button.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
  assert.equal(preparations, 0, 'fora da chamada não busca imagens');
  w.document.querySelector('#voice-panel').classList.remove('hidden');
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(preparations, 1);
  button.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
  button.focus();
  assert.equal(preparations, 3);
  button.disabled = true;
  button.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
  assert.equal(preparations, 3, 'não prepara um botão indisponível');
  w.close();
});

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
  assert.deepEqual(chips.map((c) => c.textContent), ['Automáticaaté 1080p', 'Movimento1080p · 60 fps']);
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

test('marca vários aplicativos e mantém a escolha durante atualizações', async () => {
  const b = bridge();
  b.appAudio = { supported: true };
  const w = load({ bridge: b });
  const apps = [{ pid: 20, name: 'Jogo' }, { pid: 30, name: 'Spotify' }, { pid: 40, name: 'WhatsApp' }];
  const choice = b.calls.picker(sources, { audio: true, apps });
  const select = w.document.querySelector('.share-audio-select');
  select.value = 'apps';
  select.dispatchEvent(new w.Event('change'));
  const checkboxes = [...w.document.querySelectorAll('.share-audio-app input')];
  checkboxes.forEach(input => input.click());
  checkboxes[1].focus();
  b.calls.update(sources, { apps });
  assert.ok([...w.document.querySelectorAll('.share-audio-app input')].every(input => input.checked));
  assert.equal(w.document.activeElement.value, '30', 'uma atualização conserva o foco no app');
  assert.equal(select.options[select.selectedIndex].textContent, '3 aplicativos selecionados');
  w.document.querySelector('.share-source').click();
  w.document.querySelector('.btn-primary').click();
  const result = await choice;
  assert.equal(result.id, 'window:7:0');
  assert.deepEqual([...result.apps], [20, 30, 40]);
  assert.equal(result.audio, true);
  w.close();
});

test('um grupo vazio não transmite e a seleção de apps respeita seu limite', async () => {
  const b = bridge();
  b.appAudio = { supported: true };
  const w = load({ bridge: b });
  const choice = b.calls.picker(sources, { audio: true, maxAudioApps: 2, apps: [{ pid: 20, name: 'A' }, { pid: 30, name: 'B' }, { pid: 40, name: 'C' }] });
  w.document.querySelector('.share-source').click();
  const select = w.document.querySelector('.share-audio-select');
  select.value = 'apps'; select.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelector('.btn-primary').disabled, true);
  const inputs = [...w.document.querySelectorAll('.share-audio-app input')];
  inputs[0].click(); inputs[1].click();
  assert.equal(inputs[2].disabled, true);
  w.document.querySelector('.share-close').click();
  assert.equal(await choice, null);
  w.close();
});

test('a mistura libera todas as capturas e seu contexto, inclusive quando um app falha', async () => {
  const b = bridge();
  const releases = [];
  b.appAudio = { supported: true, reset() {}, takePlan: () => ({ token: 'confirmed', mode: 'app', pids: [30, 40] }), prepare: async () => {}, release: async token => releases.push(token) };
  const w = load({ bridge: b });
  const track = kind => ({ kind, stopped: false, stop() { this.stopped = true; }, addEventListener() {}, removeEventListener() {} });
  class Stream {
    constructor(tracks) { this.tracks = [...tracks]; }
    getTracks() { return [...this.tracks]; }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
    removeTrack(track) { this.tracks = this.tracks.filter(item => item !== track); }
    addTrack(track) { this.tracks.push(track); }
  }
  let context;
  w.MediaStream = Stream;
  w.AudioContext = class {
    constructor() { context = this; this.closed = false; }
    createMediaStreamDestination() { return { stream: new Stream([track('audio')]) }; }
    createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect() {} }; }
    createMediaStreamSource() { return { connect() {} }; }
    async resume() {}
    async close() { this.closed = true; }
  };
  const originalAudio = track('audio');
  const original = new Stream([track('video'), originalAudio]);
  const extras = [new Stream([track('audio'), track('video')]), new Stream([track('audio'), track('video')])];
  let at = 0;
  Object.defineProperty(w.navigator, 'mediaDevices', { value: { getDisplayMedia: async () => extras[at++] } });
  const mixed = await w.DesktopApp.captureScreen(async () => original);
  assert.equal(mixed.getAudioTracks().length, 1);
  assert.equal(mixed.desktopAudioMode, 'app');
  assert.ok(extras.every(stream => stream.getVideoTracks()[0].stopped), 'extra videos stop immediately');
  mixed.desktopAudioCleanup(); mixed.desktopAudioCleanup();
  assert.equal(context.closed, true);
  assert.equal(originalAudio.stopped, true);
  assert.ok(extras.every(stream => stream.getAudioTracks()[0].stopped));
  assert.deepEqual(releases, ['confirmed']);
  const failed = new Stream([track('audio'), track('video')]);
  const one = new Stream([track('audio'), track('video')]);
  at = 0;
  w.navigator.mediaDevices.getDisplayMedia = async () => { if (at++ === 0) return one; throw new Error('app capture failed'); };
  await assert.rejects(w.DesktopApp.captureScreen(async () => failed), /app capture failed/);
  assert.ok(failed.getTracks().every(track => track.stopped));
  assert.ok(one.getTracks().every(track => track.stopped));
  assert.deepEqual(releases, ['confirmed', 'confirmed']);
  w.close();
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
  assert.equal(doc.querySelector('.btn-primary').disabled, true, 'aguarda o som automático da janela');
  const select = doc.querySelector('.share-audio-select');
  select.value = 'none';
  select.dispatchEvent(new w.Event('change'));
  assert.equal(doc.querySelector('.btn-primary').disabled, false, 'sem som não espera a descoberta de áudio');
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
  assert.equal(w.document.querySelector('.btn-primary').disabled, true);
  w.document.querySelector('.share-source').dispatchEvent(new w.MouseEvent('dblclick'));
  assert.ok(w.document.querySelector('.share-overlay:not(.closing)'), 'duplo clique também aguarda o som automático');
  b.calls.update(sources.map((source) => ({ ...source, app: 20 })), { appsLoading: false, apps: [{ pid: 20, name: 'Jogo' }] });
  assert.equal(w.document.querySelector('.share-audio-select').value, '20');
  assert.equal(w.document.querySelector('.btn-primary').disabled, false);
  w.document.querySelector('.btn-primary').click();
  assert.equal((await choice).app, 20);
  w.close();
});

test('a tela inteira e o som escolhido manualmente não esperam a descoberta de apps', async () => {
  const b = bridge();
  const w = load({ bridge: b });
  let choice = b.calls.picker(sources, { audio: true, appsLoading: true });
  const current = () => w.document.querySelector('.share-overlay:not(.closing)');
  current().querySelectorAll('.share-tabs button')[1].click();
  current().querySelector('.share-source').click();
  assert.equal(current().querySelector('.btn-primary').disabled, false);
  current().querySelector('.btn-primary').click();
  assert.equal((await choice).id, 'screen:0:0');

  choice = b.calls.picker(sources, { audio: true, appsLoading: true });
  current().querySelector('.share-source').click();
  const select = current().querySelector('.share-audio-select');
  select.value = 'system'; select.dispatchEvent(new w.Event('change'));
  assert.equal(current().querySelector('.btn-primary').disabled, false);
  current().querySelector('.btn-primary').click();
  assert.equal((await choice).audio, true);
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

// No navegador: a mesma janela abre antes do seletor do navegador; o que só o app faz fica bloqueado.
const browserQuality = (set) => ({
  presets: {
    auto: { label: 'Automática', desc: 'Fluida', height: 1080, fps: 30, codecs: ['video/AV1'] },
    p1080_60: { label: 'Movimento · 1080p / 60', desc: 'Jogos e vídeos', height: 1080, fps: 60, codecs: ['video/H264', 'video/VP8'] },
  },
  current: () => 'auto',
  set: (key) => set.push(key),
});
const locks = (root) => [...root.querySelectorAll('.share-locked-row strong')].map((node) => node.textContent);

test('no navegador, o mesmo seletor abre antes do navegador e mostra bloqueado o que só o app faz', async () => {
  const w = load({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/140.0' });
  const doc = w.document;
  const set = [];
  w.DesktopApp.shareQuality = browserQuality(set);
  const calls = [];
  const capture = w.DesktopApp.captureScreen(async (choice) => { calls.push(choice); return 'stream'; }, { audio: true });
  assert.deepEqual([...doc.querySelectorAll('.share-tabs button')].map((tab) => tab.textContent), ['Aplicativos', 'Telas'], 'sem contagem: o site não vê as fontes');
  assert.match(doc.querySelector('.share-head p').textContent, /o navegador pede para você confirmar/);
  const cards = () => [...doc.querySelectorAll('.share-source')];
  assert.deepEqual(cards().map((card) => card.textContent), ['Janela de um app', 'Bloqueado no navegadorO navegador não mostra suas janelas ao site.Janelas com miniatura'], 'sem aba fora do Chromium');
  const locked = doc.querySelector('.share-locked');
  assert.equal(locked.getAttribute('aria-disabled'), 'true');
  locked.click();
  assert.equal(doc.querySelector('.btn-primary').disabled, true, 'o card bloqueado não seleciona');

  const select = doc.querySelector('.share-audio-select');
  assert.deepEqual([...select.options].map((o) => [o.textContent, o.disabled]), [['Som do computador inteiro', false], ['Só o som de um app (bloqueado no navegador)', true], ['Sem som', false]]);
  assert.deepEqual(locks(doc.querySelectorAll('.share-setting')[1]), ['Som de um app só']);
  assert.deepEqual(locks(doc.querySelector('.share-setting')), [], 'Automática não perde nada no navegador');
  doc.querySelector('[data-preset="p1080_60"]').click();
  await new Promise((resolve) => setTimeout(resolve));
  assert.deepEqual(locks(doc.querySelector('.share-setting')), ['60 fps pela captura nativa', 'H.264 na placa de vídeo'], 'sem confirmação do navegador, o H.264 vai no processador');

  doc.querySelectorAll('.share-tabs button')[1].click();
  assert.deepEqual(cards().map((card) => card.querySelector('.share-name').textContent), ['Tela inteira', 'Telas com miniatura']);
  cards()[0].click();
  select.value = 'none';
  select.dispatchEvent(new w.Event('change'));
  doc.querySelector('.btn-primary').click();
  assert.equal(await capture, 'stream');
  assert.deepEqual(calls.map((choice) => ({ ...choice })), [{ id: 'surface:monitor', surface: 'monitor', audio: false }]);
  assert.deepEqual(set, ['p1080_60'], 'a qualidade escolhida vale antes do pedido ao navegador');
  w.close();
});

test('no navegador, fechar a janela cancela sem pedir a captura', async () => {
  const w = load({});
  let asked = 0;
  for (const close of [(doc) => doc.querySelector('.share-close').click(), (doc) => doc.querySelector('.btn-ghost').click()]) {
    const capture = w.DesktopApp.captureScreen(async () => { asked++; }, { audio: false });
    assert.equal(w.document.querySelector('.share-overlay:not(.closing) .share-audio-select'), null, 'sem som pedido, sem opção de som');
    close(w.document.querySelector('.share-overlay:not(.closing)'));
    await assert.rejects(capture, { name: 'ShareCancelledError' });
  }
  assert.equal(asked, 0);
  w.close();
});

test('no Chromium, a aba do navegador leva o som dela e o H.264 na placa não fica bloqueado', async () => {
  const w = load({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0' });
  Object.defineProperty(w.navigator, 'userAgentData', { value: { brands: [{ brand: 'Chromium', version: '141' }, { brand: 'Google Chrome', version: '141' }] } });
  const doc = w.document;
  w.DesktopApp.shareQuality = browserQuality([]);
  const calls = [];
  const capture = w.DesktopApp.captureScreen(async (choice) => { calls.push(choice); }, { audio: true });
  doc.querySelector('[data-preset="p1080_60"]').click();
  await new Promise((resolve) => setTimeout(resolve));
  assert.deepEqual(locks(doc.querySelector('.share-setting')), ['60 fps pela captura nativa']);
  doc.querySelector('[data-source-id="surface:browser"]').click();
  assert.equal(doc.querySelector('.share-audio-select').options[0].textContent, 'Som da aba');
  assert.match(doc.querySelectorAll('.share-setting')[1].querySelector(':scope > small').textContent, /Vai só o som da aba/);
  doc.querySelector('.btn-primary').click();
  await capture;
  assert.deepEqual(calls.map((choice) => ({ ...choice })), [{ id: 'surface:browser', surface: 'browser', audio: true }]);
  w.close();
});
