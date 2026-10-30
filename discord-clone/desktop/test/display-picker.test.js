const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { AppAudioPlans, selectedAudioApps, MAX_AUDIO_APPS } = require('../lib/app-audio');

const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const pickerCode = main.slice(main.indexOf('const pendingPicks ='), main.indexOf('// ---------------- push-to-talk'));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(setImmediate);
const thumb = { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,AA==' };
const icon = { isEmpty: () => false, resize: () => thumb };
const emptyThumb = { isEmpty: () => true };
const sources = [{ id: 'screen:1:0', name: 'Screen', thumbnail: thumb }, { id: 'window:7:0', name: 'Jogo', thumbnail: thumb, appIcon: icon }];
const metadata = sources.map(source => ({ ...source, thumbnail: emptyThumb }));
const apps = [{ pid: 20, name: 'Jogo', windows: ['7'], path: null }];

function harness(progressive = true, autoStart = true) {
  const messages = [], callbacks = [], handlers = new Map();
  const video = deferred(), previews = deferred(), audio = deferred(), icons = deferred();
  const requests = [];
  let audioCalls = 0, elapsed = 0, tuned = 0;
  const contents = { send: (...args) => messages.push(args), isDestroyed: () => false };
  const context = { site: { webContents: contents }, win: { getMediaSourceId: () => 'window:99:0' }, tuneCapture: () => { tuned++; return { ok: true }; }, store: { get: () => true },
    ipcMain: { on: (name, handler) => handlers.set(name, handler), handle: (name, handler) => handlers.set(name, handler) }, fromSite: () => true, isAppUrl: () => true, fromVoiceSite: () => true,
    AppAudioPlans, selectedAudioApps, MAX_AUDIO_APPS, Date: { now: () => Date.now() + elapsed },
    desktopCapturer: { getSources: (options) => {
      requests.push(options);
      return options.thumbnailSize.width === 0 || !progressive ? video.promise : previews.promise;
    } }, setTimeout, clearTimeout,
    systemAudioDevice: () => 'loopbackWithoutChrome', appAudioDevice: (pid) => `applicationLoopback:${pid}`,
    windowHandle: (id) => /^window:(\d+):/.exec(id)?.[1] || null,
    process: { platform: 'win32', getSystemVersion: () => '10.0.26100' }, log: { warn() {} } };
  vm.createContext(context);
  vm.runInContext(pickerCode, context);
  context.listAudioApps = () => { audioCalls++; return audio.promise; };
  context.appIcon = () => icons.promise;
  handlers.get('desktop:pick-source:ready')({ sender: contents }, progressive);
  const request = { securityOrigin: 'https://resenhex.test', videoRequested: true, audioRequested: true };
  const start = () => context.pickDisplayMedia(request, (streams) => callbacks.push(streams));
  const pending = autoStart ? start() : Promise.resolve();
  const id = messages[0]?.[1] || 1;
  const choose = (choice) => handlers.get('desktop:pick-source:result')({ sender: contents }, id, choice);
  const reopen = start;
  const chooseLatest = choice => handlers.get('desktop:pick-source:result')({ sender: contents }, messages.findLast(message => message[0] === 'desktop:pick-source')[1], choice);
  const prepare = () => handlers.get('desktop:pick-source:prepare')({ sender: contents });
  // A transmissão que segue a partida (lib/share-follow.js), trocada por uma falsa.
  const useFollow = (follow) => { context.fakeFollow = follow; vm.runInContext('shareFollow = fakeFollow', context); };
  return { messages, callbacks, video, previews, audio, icons, pending, choose, chooseLatest, reopen, requests, useFollow, handlers, contents,
    audioCalls: () => audioCalls, tuned: () => tuned, prepare, advance: ms => { elapsed += ms; } };
}

test('picker opens before sources and audio; video selection never waits for audio discovery', async () => {
  const h = harness();
  assert.equal(h.tuned(), 1, 'o ajuste da captura do Windows entra antes de qualquer captura');
  assert.equal(h.messages[0][0], 'desktop:pick-source');
  assert.equal(h.messages[0][2].length, 0);
  assert.equal(h.messages[0][3].loading, true);
  await tick();
  assert.equal(h.audioCalls(), 0, 'a inicialização do áudio não bloqueia a enumeração das fontes');
  h.video.resolve(metadata);
  await tick();
  const update = h.messages.at(-1);
  assert.equal(update[0], 'desktop:pick-source:update');
  assert.equal(update[2].length, 2);
  assert.equal(update[3].loading, false);
  assert.equal(update[3].appsLoading, true);
  assert.equal(update[2][1].thumbnail, null, 'a janela é selecionável antes da miniatura');
  assert.equal(h.requests[0].thumbnailSize.width, 0);
  assert.equal(h.requests[0].fetchWindowIcons, true);
  assert.equal(update[2][1].icon, thumb.toDataURL(), 'o ícone já acompanha o nome da janela');
  assert.equal(h.audioCalls(), 1);
  h.choose({ id: 'window:7:0', audio: true });
  assert.equal(h.callbacks[0].video.id, 'window:7:0');
  assert.equal(h.callbacks[0].audio, 'loopbackWithoutChrome');
  const count = h.messages.length;
  h.audio.resolve(apps);
  await h.pending;
  assert.equal(h.messages.length, count, 'late audio does not reopen the picker');
  assert.equal(h.callbacks.length, 1);
  h.previews.resolve(sources);
  await tick();
  assert.equal(h.messages.length, count, 'a miniatura tardia não reabre o picker');
});

test('preparing before opening supplies images in the first source list and throttles repeated hints', async () => {
  const h = harness(true, false);
  h.prepare(); h.prepare();
  await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].thumbnailSize.width, 384);
  assert.equal(h.callbacks.length, 0, 'preparar não inicia uma transmissão');
  assert.equal(h.messages.length, 0, 'preparar não abre o seletor');
  h.previews.resolve(sources);
  await tick();
  h.prepare();
  await tick();
  assert.equal(h.requests.length, 1, 'não repete a captura recente');
  h.video.resolve(metadata); h.audio.resolve(apps); h.icons.resolve(null);
  await h.reopen();
  const firstList = h.messages.find(message => message[2]?.length);
  assert.equal(firstList[2][1].thumbnail, thumb.toDataURL());
  assert.equal(h.requests.length, 2, 'a lista atual é conferida sem recapturar miniaturas');
  h.chooseLatest(null);

  h.advance(11000);
  await h.reopen();
  assert.equal(h.messages.findLast(message => message[2]?.length)[2][1].thumbnail, thumb.toDataURL(), 'a imagem anterior aparece enquanto é renovada');
  assert.equal(h.requests.filter(options => options.thumbnailSize.width > 0).length, 2);
  h.chooseLatest(null);
});

test('preview failure leaves the enumerated windows selectable', async () => {
  const h = harness();
  h.video.resolve(metadata);
  h.audio.resolve(apps);
  h.icons.resolve(null);
  await h.pending;
  h.previews.reject(new Error('thumbnail timed out'));
  await tick();
  assert.equal(h.callbacks.length, 0);
  assert.equal(h.messages.at(-1)[3].loading, false);
  h.choose({ id: 'window:7:0', audio: true, app: 20 });
  assert.equal(h.callbacks[0].audio, 'applicationLoopback:20');
});

test('reopening reuses fresh previews and rechecks source identities', async () => {
  const h = harness();
  const current = metadata.map(source => ({ ...source }));
  h.video.resolve(current);
  h.audio.resolve(apps);
  h.icons.resolve(null);
  await h.pending;
  h.choose(null);
  await h.reopen();
  assert.equal(h.requests.filter(options => options.thumbnailSize.width > 0).length, 1, 'a captura pendente é compartilhada');
  h.previews.resolve(sources);
  await tick();
  assert.equal(h.messages.at(-1)[2][1].thumbnail, thumb.toDataURL());
  h.chooseLatest(null);
  await h.reopen();
  assert.equal(h.requests.filter(options => options.thumbnailSize.width > 0).length, 1);
  assert.equal(h.requests.filter(options => options.thumbnailSize.width === 0).length, 3, 'a lista é sempre atualizada');
  assert.equal(h.messages.at(-1)[2][1].thumbnail, thumb.toDataURL());
  h.chooseLatest(null);

  // Uma janela fechada some, e uma janela renomeada não usa a imagem anterior.
  current[1] = { ...current[1], name: 'Outra janela' };
  current.shift();
  await h.reopen();
  const update = h.messages.at(-1);
  assert.equal(update[2].length, 1);
  assert.equal(update[2][0].name, 'Outra janela');
  assert.equal(update[2][0].thumbnail, null);
  h.chooseLatest(null);
});

test('audio options are selectable before file icons finish loading', async () => {
  const h = harness();
  h.audio.resolve(apps);
  h.video.resolve(sources);
  await tick();
  assert.equal(h.messages.at(-1)[2][1].app, 20);
  assert.equal(h.messages.at(-1)[3].apps[0].pid, 20);
  h.choose({ id: 'window:7:0', audio: true, app: 20 });
  assert.equal(h.callbacks[0].audio, 'applicationLoopback:20');
  const count = h.messages.length;
  h.icons.resolve('icon');
  await h.pending;
  assert.equal(h.messages.length, count);
});

test('cancelling during discovery denies once and ignores late results', async () => {
  const h = harness();
  h.choose(null);
  assert.equal(Object.keys(h.callbacks[0]).length, 0);
  assert.equal(h.messages.at(-1)[3].closed, true);
  const count = h.messages.length;
  h.video.resolve(sources);
  h.audio.resolve(apps);
  await h.pending;
  assert.equal(h.messages.length, count);
  assert.equal(h.callbacks.length, 1);
});

test('source discovery failure closes the loading picker; legacy sites get one complete list', async () => {
  const failure = harness();
  failure.video.reject(new Error('capture failed'));
  failure.audio.resolve([]);
  await failure.pending;
  assert.equal(failure.messages.at(-1)[3].closed, true);
  assert.equal(failure.callbacks.length, 1);

  const legacy = harness(false);
  assert.equal(legacy.messages.length, 0);
  legacy.video.resolve(sources);
  await tick();
  assert.equal(legacy.messages.length, 0);
  legacy.audio.resolve(apps);
  await legacy.pending;
  assert.equal(legacy.messages.length, 1);
  assert.equal(legacy.messages[0][3].loading, false);
  legacy.choose({ id: 'window:7:0', audio: false });
  assert.equal(legacy.callbacks[0].video.id, 'window:7:0');
});

test('a troca da partida entra no lugar do seletor; a escolha com "Seguir a partida" começa a seguir', async () => {
  const h = harness(true, false);
  const calls = [];
  let auto = null;
  h.useFollow({ start: (_contents, options) => calls.push(['start', JSON.parse(JSON.stringify(options))]), stop: () => calls.push(['stop']), takePick: () => auto,
    accept: () => true, ended: () => true });
  h.reopen();
  h.audio.resolve(apps);
  h.video.resolve(sources);
  await tick();
  h.choose({ id: 'window:7:0', audio: true, app: 20, follow: true });
  assert.deepEqual(calls, [['start', { source: { id: 'window:7:0', name: 'Jogo' }, audio: { enabled: true, pids: [20] } }]]);
  assert.equal(h.callbacks[0].audio, 'applicationLoopback:20');

  // O app já escolheu a janela da partida: nenhum seletor abre, e o som vai com o app da partida.
  auto = { source: { id: 'window:8:0', name: 'Partida' }, audio: true, pids: [30, 40] };
  const opened = h.messages.filter(message => message[0] === 'desktop:pick-source').length;
  await h.reopen();
  assert.equal(h.messages.filter(message => message[0] === 'desktop:pick-source').length, opened);
  assert.deepEqual(JSON.parse(JSON.stringify(h.callbacks[1])), { video: { id: 'window:8:0', name: 'Partida' }, audio: 'applicationLoopback:30' });
  assert.deepEqual([...h.messages.at(-1)[1].pids], [40], 'o outro app vai pela captura extra');
  assert.equal(calls.length, 1, 'a troca não recomeça o acompanhamento');

  // A tela inteira (ou um site sem a opção) não segue nada.
  auto = null;
  h.reopen();
  h.video.resolve(sources);
  await tick();
  h.chooseLatest({ id: 'screen:1:0', audio: false, follow: true });
  assert.deepEqual(calls.at(-1), ['stop']);
  assert.equal(await h.handlers.get('desktop:share-follow:accept')({ sender: h.contents }), true);
  assert.equal(await h.handlers.get('desktop:share-follow:ended')({ sender: h.contents }), true);
});
