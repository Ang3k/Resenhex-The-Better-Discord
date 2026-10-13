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
const emptyThumb = { isEmpty: () => true };
const sources = [{ id: 'screen:1:0', name: 'Screen', thumbnail: thumb }, { id: 'window:7:0', name: 'Jogo', thumbnail: thumb }];
const metadata = sources.map(source => ({ ...source, thumbnail: emptyThumb }));
const apps = [{ pid: 20, name: 'Jogo', windows: ['7'], path: null }];

function harness(progressive = true) {
  const messages = [], callbacks = [], handlers = new Map();
  const video = deferred(), previews = deferred(), audio = deferred(), icons = deferred();
  const requests = [];
  let audioCalls = 0;
  const contents = { send: (...args) => messages.push(args), isDestroyed: () => false };
  const context = { site: { webContents: contents }, win: { getMediaSourceId: () => 'window:99:0' },
    ipcMain: { on: (name, handler) => handlers.set(name, handler), handle: (name, handler) => handlers.set(name, handler) }, fromSite: () => true, isAppUrl: () => true, fromVoiceSite: () => true,
    AppAudioPlans, selectedAudioApps, MAX_AUDIO_APPS,
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
  const pending = context.pickDisplayMedia(request, (streams) => callbacks.push(streams));
  const id = messages[0]?.[1] || 1;
  const choose = (choice) => handlers.get('desktop:pick-source:result')({ sender: contents }, id, choice);
  const reopen = () => context.pickDisplayMedia(request, (streams) => callbacks.push(streams));
  const chooseLatest = choice => handlers.get('desktop:pick-source:result')({ sender: contents }, messages.findLast(message => message[0] === 'desktop:pick-source')[1], choice);
  return { messages, callbacks, video, previews, audio, icons, pending, choose, chooseLatest, reopen, requests, audioCalls: () => audioCalls };
}

test('picker opens before sources and audio; video selection never waits for audio discovery', async () => {
  const h = harness();
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
  assert.equal(h.requests[0].fetchWindowIcons, false);
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
