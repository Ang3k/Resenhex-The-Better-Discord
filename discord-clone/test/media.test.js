const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const policy = require('../public/media-policy');
const { PNG } = require('pngjs');

test('stream overlay includes resolution, FPS, Mbps and codec for every viewer count', () => {
  const first = { width: 1920, height: 1080, fps: 30, bitrate: 2_000_000, codec: 'VP8' };
  assert.equal(policy.formatVideoStats([first]), '1920×1080 · 30 fps · 2,0 Mbps · VP8');
  assert.equal(policy.formatVideoStats([first, { width: 1280, height: 720, fps: 24, bitrate: 1_000_000, codec: 'VP8' }], true), '720–1080p · 24–30 fps · 3,0 Mbps total · VP8');
  assert.match(policy.formatVideoStats([{ ...first, bitrate: null }]), /Medindo Mbps/);
});

test('upload budget counts actual viewers, reserves voice, and stays within the cap', () => {
  const peers = Array.from({ length: 5 }, (_, i) => ({ sid: i, watching: i < 2 }));
  const rates = policy.allocate(10, peers, { screen: true, camera: true });
  assert.ok([...rates.values()].reduce((sum, rate) => sum + rate.screen + rate.camera, 0) + 5 * 80_000 <= 8_500_000);
  assert.equal(rates.get(4).screen, 0);
  const many = policy.allocate(10, peers.map((p) => ({ ...p, watching: true })), { screen: true, camera: true });
  assert.ok(rates.get(0).screen > many.get(0).screen);
  const low = policy.allocate(1, Array.from({ length: 20 }, (_, sid) => ({ sid, watching: true })), { screen: true, camera: true });
  assert.ok([...low.values()].every((rate) => rate.screen === 0 && rate.camera === 0));
});

test('automatic quality steps resolution down after persistent strain and back up only with headroom', () => {
  let state = policy.adapt({}, { active: true, strained: true }, 0);
  state = policy.adapt(state, { active: true, strained: true }, 3999);
  assert.equal(state.level, 0);
  state = policy.adapt(state, { active: true, strained: true }, 4000);
  assert.equal(state.level, 1);
  state = policy.adapt(state, { active: true, strained: true }, 9999);
  assert.equal(state.level, 1, 'a new step waits for another 4 s of strain and 6 s since the last change');
  state = policy.adapt(state, { active: true, strained: true }, 10000);
  assert.equal(state.level, 2);
  state = policy.adapt(state, { active: true, strained: false }, 11000);
  state = policy.adapt(state, { active: true, strained: false, headroom: false }, 30000);
  assert.equal(state.level, 2, 'no step up while the estimate cannot carry the higher step');
  state = policy.adapt(state, { active: true, strained: false }, 30000);
  assert.equal(state.level, 1);
  state = policy.adapt(state, { active: false, strained: true }, 31000);
  assert.equal(state.badSince, null);
  assert.equal(state.level, 1);
  assert.equal(policy.strained({ reason: 'bandwidth' }), true);
  assert.equal(policy.strained({ reason: 'cpu' }), true);
  assert.equal(policy.strained({ reason: 'none', sentFps: 12, sourceFps: 30, targetFps: 30 }), true);
  assert.equal(policy.strained({ reason: 'none', sentFps: 25, sourceFps: 30, targetFps: 30 }), false);
  assert.equal(policy.strained({ reason: 'none', sentFps: 1, sourceFps: 2, targetFps: 30 }), false, 'a static screen is not strain');
  assert.equal(policy.strained({ reason: 'none', sentFps: 3, sourceFps: 60, targetFps: 5 }), false, 'background viewers only expect 5 fps');
  assert.equal(policy.encoding(policy.presets.auto, 2e6, 1).scaleResolutionDownBy, 1.5);
});

test('mobile viewers get a hardware-decodable screen codec unless the preset already offers one', () => {
  assert.deepEqual(policy.screenCodecs(policy.presets.p1080, []), ['video/VP9', 'video/VP8']);
  assert.deepEqual(policy.screenCodecs(policy.presets.p1080, ['video/H264']), ['video/H264', 'video/VP9', 'video/VP8']);
  assert.deepEqual(policy.screenCodecs(policy.presets.p1080, ['video/H264', 'video/VP9']), ['video/VP9', 'video/VP8']);
  assert.deepEqual(policy.screenCodecs(policy.presets.auto, ['video/H264']), ['video/H264', 'video/VP8']);
  assert.deepEqual(policy.screenCodecs(policy.presets.auto, ['video/evil']), policy.presets.auto.codecs);
  assert.deepEqual(policy.viewerDemand({ width: 844, height: 390, pixelRatio: 3, codecs: ['video/H264'] }), { mode: 'auto', maxHeight: 1080, background: false, codecs: ['video/H264'] });
});

test('viewer demand follows the displayed image, pixel density and selected mode', () => {
  assert.deepEqual(policy.viewerDemand({ width: 640, height: 500 }), { mode: 'auto', maxHeight: 360, background: false });
  assert.equal(policy.viewerDemand({ width: 640, height: 500, pixelRatio: 2 }).maxHeight, 720);
  assert.equal(policy.viewerDemand({ mode: 'source', width: 160, height: 90 }).maxHeight, 1080);
  assert.equal(policy.viewerDemand({ mode: 'economy', width: 1920, height: 1080 }).maxHeight, 720);
  assert.equal(policy.screenTarget(policy.presets.p1080_60, { background: true }).fps, 5);
});

test('allocation gives unused thumbnail bandwidth to larger viewers, reserves screen audio and ignores browser estimates', () => {
  const peers = [{ sid: 'small', watching: true, demand: { maxHeight: 360 } }, { sid: 'large', watching: true, demand: { maxHeight: 1080 } }];
  const rates = policy.allocate(5, peers, { screen: true, screenAudio: true });
  assert.equal(rates.get('small').screen, policy.screenTarget(policy.presets.auto, peers[0].demand).bitrate);
  assert.ok(rates.get('large').screen > 3_000_000);
  assert.ok(rates.get('small').screen + rates.get('large').screen + 2 * 176_000 <= 4_250_000);
  // A estimativa do navegador não limita o codificador: limitar impediria a própria estimativa de subir.
  const estimated = policy.allocate(5, peers.map((p) => ({ ...p, capacity: 300_000 })), { screen: true, screenAudio: true });
  assert.deepEqual(estimated.get('small'), rates.get('small'));
  assert.deepEqual(estimated.get('large'), rates.get('large'));
  const stepped = policy.allocate(5, [{ ...peers[1], level: 1 }], { screen: true });
  assert.equal(stepped.get('large').target.height, 720);
  assert.ok(stepped.get('large').screen < rates.get('large').screen);
  assert.equal(policy.allocate(10, [{ sid: 'idle', watching: false }], { screen: true }).get('idle').screen, 0);
  assert.ok(policy.screenTarget(policy.presets.auto, { maxHeight: 180, background: true }).bitrate >= 150_000);
});

test('screen, camera and transport allocations stay within the shared ceiling and each viewer target', () => {
  for (const upload of [1, 3, 10, 100]) for (const count of [1, 3, 20]) {
    const peers = Array.from({ length: count }, (_, i) => ({ sid: String(i), watching: i % 2 === 0, level: i % 4, demand: { maxHeight: i % 2 ? 360 : 1080 } }));
    const rates = policy.allocate(upload, peers, { screen: true, screenAudio: true, camera: true });
    const reserved = peers.reduce((sum, p) => sum + 80_000 + (p.watching ? 96_000 : 0), 0);
    const total = [...rates.values()].reduce((sum, rate) => sum + rate.screen + rate.camera, 0);
    assert.ok(total <= Math.max(0, upload * 850_000 - reserved));
    for (const p of peers) {
      const rate = rates.get(p.sid);
      assert.ok(rate.screen <= (p.watching ? policy.screenTarget(policy.presets.auto, p.demand, p.level).bitrate : 0));
      assert.ok(rate.camera <= 1_200_000);
    }
  }
});

test('encoding keeps the requested FPS under low bandwidth, scales in fixed steps and never upscales', () => {
  const text = policy.screenEncoding(policy.presets.auto, 400_000, { maxHeight: 1080 }, { height: 1080 });
  const motion = policy.screenEncoding(policy.presets.p1080_60, 400_000, { maxHeight: 1080 }, { height: 1080 });
  assert.equal(text.maxFramerate, 30);
  assert.equal(motion.maxFramerate, 60);
  assert.equal(text.scaleResolutionDownBy, 1);
  assert.equal(text.maxBitrate, 400_000);
  assert.equal(policy.screenEncoding(policy.presets.auto, 2e6, { maxHeight: 1080 }, { height: 1080 }, 1).scaleResolutionDownBy, 1.5);
  assert.equal(policy.screenEncoding(policy.presets.auto, 2e6, { maxHeight: 1080 }, { height: 1080 }, 3).scaleResolutionDownBy, 3);
  assert.equal(policy.screenEncoding(policy.presets.p1080, 2e6, { maxHeight: 1080 }, { height: 1080 }, 2).scaleResolutionDownBy, 1, 'Nitidez keeps its resolution');
  assert.equal(policy.screenEncoding(policy.presets.auto, 4e6, { mode: 'source' }, { height: 720 }).scaleResolutionDownBy, 1);
  assert.deepEqual(policy.screenEncoding(policy.presets.auto, 1e6, { maxHeight: 1080, background: true }, { height: 1080 }), { maxBitrate: 1e6, maxFramerate: 5, scaleResolutionDownBy: 3, active: true });
  assert.equal(policy.screenEncoding(policy.presets.auto, 0, {}, { height: 1080 }).active, false);
});

test('adaptive steps descend from the viewer request through 720/540/360 and only for adaptive presets', () => {
  const heights = (preset, demand) => [0, 1, 2, 3, 4].map((level) => policy.screenTarget(preset, demand, level).height);
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 1080 }), [1080, 720, 540, 360, 360]);
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 540 }), [540, 360, 360, 360, 360]);
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 180 }), [180, 180, 180, 180, 180]);
  assert.deepEqual(heights(policy.presets.p720, { maxHeight: 1080 }), [720, 540, 360, 360, 360]);
  assert.deepEqual(heights(policy.presets.p1080, { maxHeight: 1080 }), [1080, 1080, 1080, 1080, 1080]);
  assert.deepEqual(heights(policy.presets.p1080_60, { maxHeight: 1080 }), [1080, 1080, 1080, 1080, 1080]);
  for (const level of [0, 1, 2, 3]) assert.equal(policy.screenTarget(policy.presets.auto, { maxHeight: 1080 }, level).fps, 30);
});

test('sender mutation queue preserves order after a rejected operation', async () => {
  const peer = {}, order = [];
  const first = policy.enqueue(peer, async () => { await new Promise((r) => setTimeout(r, 10)); order.push('first'); throw Error('unsupported'); });
  const second = policy.enqueue(peer, async () => { order.push('second'); });
  await assert.rejects(first);
  await second;
  assert.deepEqual(order, ['first', 'second']);
});

function mediaHarness() {
  let serial = 0;
  let clock = 0;
  const events = new Map(), calls = [], nodes = new Map();
  const track = (kind) => ({ id: `t${serial++}`, kind, readyState: 'live', constraints: [], settings: { height: 1080, width: 1920, frameRate: 30 },
    stop() { this.readyState = 'ended'; }, getSettings() { return this.settings; }, async applyConstraints(value) { this.constraints.push(value); this.settings = { height: value.height?.max || 1080, width: value.width?.max || 1920, frameRate: value.frameRate?.max || 30 }; } });
  const makeSender = (t) => ({ track: t, params: { encodings: [{}] }, changes: [], async replaceTrack(next) { this.track = next; },
    getParameters() { return structuredClone(this.params); }, async setParameters(params) { this.params = structuredClone(params); this.changes.push(structuredClone(params)); } });
  const stream = (tracks) => ({ id: `s${serial++}`, getTracks: () => [...tracks], getVideoTracks: () => tracks.filter((t) => t.kind === 'video'), getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'), addTrack: (t) => tracks.push(t), removeTrack: (t) => tracks.splice(tracks.indexOf(t), 1) });
  const microphone = track('audio');
  const screen = stream([track('video'), track('audio')]);
  const senders = [makeSender(microphone)];
  const transceivers = [];
  const peer = { sid: 'viewer', adaptation: {}, stats: {}, remote: {}, senders: { screen: [], camera: [] }, pc: {
    signalingState: 'stable', connectionState: 'connected',
    report: new Map(), async getStats() { return this.report; }, getReceivers: () => [],
    getSenders: () => senders, getTransceivers: () => transceivers,
    addTrack(t) { const sender = makeSender(t); sender.getStats = async () => this.report; senders.push(sender); transceivers.push({ sender, receiver: { track: { kind: t.kind } } }); return sender; },
    removeTrack(sender) { sender.track = null; },
  } };
  const self = { viewers: [], sid: 'self' };
  const state = { me: { sid: 'self' }, local: { screen, camera: null }, sharePreset: 'auto', shareAudio: true, uploadMbps: 10, peers: new Map([['viewer', peer]]), voiceChannel: 'room', view: 'voice' };
  const notices = [];
  const domNode = { textContent: '', classList: { contains: () => true }, replaceChildren() {} };
  const context = { window: {}, MediaPolicy: policy, document: { querySelector: (selector) => selector.startsWith('[data-key') ? nodes.get(selector) || null : domNode }, performance: { now: () => clock }, localStorage: { setItem() {} }, setInterval() {}, setTimeout(fn, delay) { const timer = setTimeout(fn, delay); timer.unref(); return timer; }, clearTimeout, console,
    navigator: { mediaDevices: { getDisplayMedia: async () => stream([track('video'), track('audio')]) } }, Sounds: { play() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/media-session.js'), 'utf8'), context);
  const ownAudio = { cleaned: [], synced: [], works: true, async clean(s) { this.cleaned.push(s); return this.works; }, sync(s) { this.synced.push(s); } };
  const media = context.window.MediaSession({ state, socket: { on: (event, handler) => events.set(event, handler) }, call: async (event, payload) => { calls.push({ event, payload }); return {}; }, el: () => domNode, toast: (msg) => notices.push(msg), voiceEntry: (sid) => sid === 'self' ? self : { channel: 'room' }, member: () => ({}), render() {}, renderStage() {}, sendVoiceState() {}, preferCodec() {}, ownAudio });
  return { media, state, self, peer, screen, microphone, notices, context, events, calls, nodes, ownAudio, track, stream, clock: (value) => { clock = value; } };
}

async function settle(h) { for (let i = 0; i < 4; i++) { await h.peer.mediaQueue; await Promise.resolve(); } }

test('capture stays at the chosen preset while viewers resize; each viewer is scaled by its encoder', async () => {
  const h = mediaHarness();
  const track = h.screen.getVideoTracks()[0];
  await h.media.applySharePreset();
  assert.deepEqual(track.settings, { height: 1080, width: 1920, frameRate: 30 });
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const constraints = track.constraints.length;
  h.events.get('screen:quality')({ viewer: 'viewer', demand: { mode: 'auto', maxHeight: 360, background: true } });
  await settle(h);
  assert.equal(track.constraints.length, constraints, 'a viewer resize does not recapture the screen');
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video').params.encodings[0];
  assert.equal(video.scaleResolutionDownBy, 3);
  assert.equal(video.maxFramerate, 5);
  await h.media.setSharePreset('p720');
  await h.media.applySharePreset();
  assert.deepEqual(track.settings, { height: 720, width: 1280, frameRate: 30 });
  await h.media.setSharePreset('p1080_60');
  await h.media.applySharePreset();
  assert.deepEqual(track.settings, { height: 1080, width: 1920, frameRate: 60 });
  assert.equal(track.contentHint, 'motion');
  assert.equal(track.readyState, 'live');
});

test('quality arriving during sender tuning is applied and screen audio remains bounded', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const mic = h.peer.pc.getSenders()[0];
  mic.params.encodings = [{}];
  let release, entered;
  const blocked = new Promise((r) => { entered = r; });
  const original = mic.setParameters;
  mic.setParameters = async function (params) { entered(); await new Promise((r) => { release = r; }); mic.setParameters = original; await original.call(this, params); };
  h.media.tuneSenders(); await blocked;
  h.events.get('screen:quality')({ viewer: 'viewer', demand: { mode: 'economy', maxHeight: 360, background: false } });
  release(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video').params.encodings[0];
  assert.equal(video.maxFramerate, 15);
  assert.equal(video.scaleResolutionDownBy, 3);
  assert.equal(h.peer.senders.screen.find((s) => s.track.kind === 'audio').params.encodings[0].maxBitrate, 96000);
  assert.equal(mic.params.encodings[0].maxBitrate, 64000);
});

test('ultrawide and portrait sources retain their aspect and fit the selected capture ceiling', async () => {
  for (const size of [{ width: 3440, height: 1440 }, { width: 900, height: 1600 }]) {
    const h = mediaHarness(), track = h.screen.getVideoTracks()[0];
    track.settings = { ...size, frameRate: 30 };
    h.self.viewers = ['viewer'];
    await h.media.applySharePreset();
    assert.ok(track.settings.width <= 1920 && track.settings.height <= 1080);
    assert.ok(Math.abs(track.settings.width / track.settings.height - size.width / size.height) < .01);
  }
});

test('unsupported per-viewer scaling retains bitrate/FPS without shrinking the shared capture', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video');
  const original = video.setParameters;
  video.setParameters = async function (params) {
    if (params.encodings[0].scaleResolutionDownBy > 1) throw Object.assign(Error('unsupported'), { name: 'NotSupportedError' });
    return original.call(this, params);
  };
  h.events.get('screen:quality')({ viewer: 'viewer', demand: { mode: 'auto', maxHeight: 360, background: false } });
  await settle(h);
  assert.equal(video.scalingUnsupported, true);
  assert.ok(video.params.encodings[0].maxBitrate < 1e6);
  assert.equal(h.screen.getVideoTracks()[0].settings.height, 1080);
  assert.match(h.peer.mediaError, /resolução por espectador/);
});

test('stats use the selected ICE path and do not downgrade a static screen from stale trouble', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const screenTrack = h.screen.getVideoTracks()[0];
  const report = [
    { id: 'transport', type: 'transport', selectedCandidatePairId: 'selected' },
    { id: 'selected', type: 'candidate-pair', state: 'succeeded', nominated: true, availableOutgoingBitrate: 2e6, currentRoundTripTime: .05 },
    { id: 'old', type: 'candidate-pair', state: 'succeeded', nominated: true, availableOutgoingBitrate: 100_000, currentRoundTripTime: 1 },
    { id: 'source', type: 'media-source', trackIdentifier: screenTrack.id },
    { id: 'screen', type: 'outbound-rtp', kind: 'video', mediaSourceId: 'source', bytesSent: 1000, framesSent: 10, timestamp: 100, qualityLimitationReason: 'bandwidth' },
  ];
  h.peer.pc.report = new Map(report.map((r) => [r.id, r]));
  await h.media.updateStreamStats();
  assert.equal(h.peer.estimate.bitrate, 2e6);
  assert.equal(h.peer.stats.rtt, .05);
  h.clock(6000); report[4].timestamp = 6100;
  await h.media.updateStreamStats();
  assert.equal(h.peer.adaptation.level, 0);
  assert.equal(h.peer.adaptation.badSince, null);
  // Uma tela que continua enviando, mas engasgada, desce um degrau de resolução e mantém o FPS.
  for (const at of [7000, 9000, 11000]) {
    h.clock(at); report[4] = { ...report[4], timestamp: at + 100, bytesSent: at * 100, framesSent: at };
    h.peer.pc.report = new Map(report.map((r) => [r.id, r]));
    await h.media.updateStreamStats();
  }
  assert.equal(h.peer.adaptation.level, 1);
  h.media.tuneSenders(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video').params.encodings[0];
  assert.equal(video.scaleResolutionDownBy, 1.5);
  assert.equal(video.maxFramerate, 30);
});

test('viewer resize and background requests are coalesced without stopping the subscribed audio', async () => {
  const h = mediaHarness();
  let width = 320;
  h.nodes.set('[data-key="screen-viewer"] video', { getBoundingClientRect: () => ({ width, height: width * 9 / 16 }), videoWidth: 1920, videoHeight: 1080, isConnected: true });
  // The receiver is subscribed to the other participant's stream.
  h.self.viewers = [];
  const entry = { channel: 'room', viewers: ['self'] };
  const socket = { connected: true, timeout: (ms) => {
    assert.equal(ms, 5000);
    return { emit: (event, payload, ack) => { h.calls.push({ event, payload }); ack(null, { ok: true }); } };
  } };
  // Harness voiceEntry is fixed; wire a second MediaSession with a receiver entry.
  const media = h.context.window.MediaSession({ state: h.state, socket, call: () => { throw Error('automatic requests must be quiet'); }, el: () => ({}), toast() {},
    voiceEntry: (sid) => sid === 'viewer' ? entry : h.self, member: () => ({}), render() {}, renderStage() {}, sendVoiceState() {}, preferCodec() {} });
  media.syncViewerQuality(); width = 640; media.syncViewerQuality();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].payload.quality.maxHeight, 360);
  h.context.document.hidden = true;
  media.syncViewerQuality(); await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.calls[1].payload.quality.background, true);
  socket.connected = false; width = 960;
  media.syncViewerQuality(); await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.calls.length, 2);
  socket.connected = true;
  media.syncViewerQuality(); await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.calls[2].payload.quality.maxHeight, 540);
  assert.ok(h.calls.every((c) => c.event === 'screen:quality'));
});

test('watch/unwatch suspends both screen tracks while preserving the microphone', async () => {
  const h = mediaHarness();
  h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  assert.equal(h.peer.senders.screen.length, 0);
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  assert.equal(h.peer.senders.screen.filter((s) => s.track).length, 2);
  h.self.viewers = []; h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  assert.ok(h.peer.senders.screen.every((s) => s.track === null));
  assert.equal(h.microphone.readyState, 'live');
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  assert.equal(h.peer.senders.screen.filter((s) => s.track).length, 2);
});

test('source-switch failure keeps previous tracks alive and reports failure', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  const sender = h.peer.senders.screen[0];
  const old = sender.track;
  sender.replaceTrack = async () => { throw Error('unsupported track'); };
  await h.media.switchScreen();
  assert.equal(h.state.local.screen, h.screen);
  assert.equal(old.readyState, 'live');
  assert.ok(h.notices.some((msg) => msg.includes('anterior foi mantida')));
});

test('capture completing after leaving a room releases its tracks', async () => {
  const h = mediaHarness();
  h.media.stopVideo('screen');
  let resolve;
  h.context.navigator.mediaDevices.getDisplayMedia = () => new Promise((r) => { resolve = r; });
  const pending = h.media.startVideo('screen');
  h.media.stopVideo('screen'); h.state.voiceChannel = null;
  let stopped = 0;
  resolve({ getTracks: () => [{ stop() { stopped++; } }] });
  await pending;
  assert.equal(stopped, 1);
  assert.equal(h.state.local.screen, null);
});

test('server validates viewers and cleans subscriptions on stop, leave and disconnect', { timeout: 25000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-media-test-'));
  const port = 38000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', ACCESS_PASSWORD_B64: '' }, stdio: 'ignore' });
  const clients = [];
  const emit = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
  const until = async (check) => { for (let i = 0; i < 80; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 40)); } throw Error('condition timed out'); };
  try {
    await until(async () => { try { return (await fetch(base + '/config')).ok; } catch { return false; } });
    async function connect(name) {
      const socket = io(base, { autoConnect: false, reconnection: false });
      clients.push(socket);
      socket.on('state', (s) => { socket.snapshot = s; });
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
      const auth = await emit(socket, 'auth', { mode: 'register', name, password: 'test-only-2026', confirmPassword: 'test-only-2026' });
      assert.ok(auth.accountId);
      if (!auth.serverId) {
        const invite = await emit(clients[0], 'server:invite', {});
        assert.ok(!(await emit(socket, 'server:join', { code: invite.code })).error);
      }
      return socket;
    }
    const host = await connect('Host'), viewer = await connect('Viewer'), outsider = await connect('Elsewhere');
    const qualityEvents = [], outsiderQuality = [];
    host.on('screen:quality', (event) => qualityEvents.push(event));
    outsider.on('screen:quality', (event) => outsiderQuality.push(event));
    const avatar = 'data:image/png;base64,' + PNG.sync.write({ width: 32, height: 32, data: Buffer.alloc(4096, 200) }).toString('base64');
    assert.ok((await emit(host, 'profile', { avatar: 'data:image/svg+xml;base64,PHN2Zz4=' })).error);
    const profile = await emit(host, 'profile', { color: '#123456', avatar });
    assert.match(profile.avatarUrl, /^\/avatars\/[a-f0-9]{64}\.png$/);
    await until(() => viewer.snapshot.members.some((m) => m.name === 'Host' && m.avatarUrl === profile.avatarUrl));
    const response = await fetch(base + profile.avatarUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^image\/png/);
    assert.equal(PNG.sync.read(Buffer.from(await response.arrayBuffer())).width, 32);
    // Another account can use the same image; removing one must not break the other.
    assert.equal((await emit(viewer, 'profile', { avatar })).avatarUrl, profile.avatarUrl);
    const edited = await emit(host, 'profile', { color: '#654321' });
    assert.equal(edited.avatarUrl, profile.avatarUrl);
    await until(() => {
      try { return Object.values(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')).accounts).some((account) => account.name === 'Host' && '/avatars/' + account.avatar === profile.avatarUrl); } catch { return false; }
    });
    assert.equal((await emit(host, 'profile', { avatar: null })).avatarUrl, null);
    assert.equal((await fetch(base + profile.avatarUrl)).status, 200);
    assert.equal((await emit(viewer, 'profile', { avatar: null })).avatarUrl, null);
    assert.equal((await fetch(base + profile.avatarUrl)).status, 404);
    const rooms = host.snapshot.channels.filter((c) => c.type === 'voice');
    const room = rooms[0].id;
    await emit(host, 'voice:join', { channel: room });
    await emit(viewer, 'voice:join', { channel: room });
    await emit(outsider, 'voice:join', { channel: rooms[1].id });
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: true })).error);
    await emit(host, 'voice:state', { sharing: true });
    assert.ok((await emit(outsider, 'screen:watch', { target: host.id, watching: true })).error);
    assert.ok((await emit(host, 'screen:watch', { target: host.id, watching: true })).error);
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: 'yes' })).error);
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: true, quality: { mode: 'auto', maxHeight: 9000, background: false } })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { mode: 'auto', maxHeight: 360, background: false } })).error);
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: true })).ok);
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 1);
    await until(() => qualityEvents.length === 1);
    assert.deepEqual(qualityEvents[0], { viewer: viewer.id, demand: { mode: 'auto', maxHeight: 1080, background: false } });
    const quality = { mode: 'economy', maxHeight: 360, background: true };
    assert.ok((await emit(outsider, 'screen:quality', { target: host.id, quality })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { ...quality, background: 'yes' } })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality })).ok);
    await until(() => qualityEvents.length === 2);
    assert.deepEqual(qualityEvents[1], { viewer: viewer.id, demand: quality });
    await emit(viewer, 'screen:quality', { target: host.id, quality });
    assert.equal(qualityEvents.length, 2);
    // Celulares informam os codecs que decodificam por hardware; só nomes conhecidos passam.
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { ...quality, codecs: ['video/evil'] } })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { ...quality, codecs: 'video/H264' } })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { ...quality, codecs: ['video/H264', 'video/H264'] } })).ok);
    await until(() => qualityEvents.length === 3);
    assert.deepEqual(qualityEvents[2].demand, { ...quality, codecs: ['video/H264'] });
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality })).ok);
    await until(() => qualityEvents.length === 4);
    assert.equal(outsiderQuality.length, 0);
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    assert.equal(host.snapshot.voice.find((v) => v.sid === host.id).viewers.length, 1);
    await emit(viewer, 'screen:watch', { target: host.id, watching: false });
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 0);
    await until(() => qualityEvents.at(-1)?.demand === null);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality })).error);
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    await emit(host, 'voice:state', { sharing: false });
    assert.equal(host.snapshot.voice.find((v) => v.sid === host.id).viewers.length, 0);
    await emit(host, 'voice:state', { sharing: true });
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    await emit(viewer, 'voice:leave');
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 0);
    await until(() => qualityEvents.at(-1)?.demand === null);
    await emit(viewer, 'voice:join', { channel: room });
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    viewer.close();
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 0);
  } finally {
    clients.forEach((client) => client.close());
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill(); await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('screen audio that carries the call is cleaned; excluded system audio and tab audio are not', async () => {
  const h = mediaHarness();
  h.media.stopVideo('screen');
  const capture = (videoSettings, audioSettings) => {
    const video = h.track('video'), audio = h.track('audio');
    video.settings = { ...video.settings, ...videoSettings };
    audio.settings = audioSettings;
    const stream = h.stream([video, audio]);
    h.context.navigator.mediaDevices.getDisplayMedia = async () => stream;
    return stream;
  };
  const cases = [
    [{ displaySurface: 'monitor' }, { deviceId: 'loopback', restrictOwnAudio: false }, true, 'filter'],
    [{ displaySurface: 'monitor' }, { deviceId: 'loopback', restrictOwnAudio: true }, false, 'native'],
    [{ displaySurface: 'monitor' }, { deviceId: 'loopbackWithoutChrome' }, false, 'native'],
    [{ displaySurface: 'browser' }, { deviceId: 'tab' }, false, 'tab'],
  ];
  for (const [video, audio, cleaned, mode] of cases) {
    const stream = capture(video, audio);
    h.ownAudio.cleaned.length = 0;
    await h.media.startVideo('screen');
    assert.equal(h.ownAudio.cleaned.includes(stream), cleaned, JSON.stringify({ video, audio }));
    assert.equal(h.state.shareAudioMode, mode);
    assert.equal(h.ownAudio.synced.at(-1), stream, 'the filter follows the live capture');
    h.media.stopVideo('screen');
    assert.equal(h.ownAudio.synced.at(-1), null, 'stopping the share releases the filter');
    assert.equal(h.state.shareAudioMode, null);
  }
  assert.equal(h.notices.filter((text) => text.includes('pode sobrar um pouco')).length, 1, 'the filter notice is shown once');

  // Sem como filtrar, quem transmite fica sabendo que as vozes vão junto, a cada transmissão.
  h.ownAudio.works = false;
  for (let i = 0; i < 2; i++) {
    capture({ displaySurface: 'monitor' }, { deviceId: 'loopback' });
    h.notices.length = 0;
    await h.media.startVideo('screen');
    assert.equal(h.state.shareAudioMode, 'mixed');
    assert.match(h.state.mediaHealth, /vão junto/, 'mixed audio is announced');
    if (i === 0) assert.ok(h.notices.some((text) => text.includes('vão junto')), 'and shown');
    h.media.stopVideo('screen');
  }
});
