const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const policy = require('../public/media-policy');

test('upload budget counts actual viewers, reserves voice, and stays within the cap', () => {
  const rates = policy.budget(10, 2, 5, true, true);
  assert.ok(rates.screen * 2 + rates.camera * 5 + 5 * 80_000 <= 8_500_000);
  assert.equal(policy.budget(10, 0, 5, true, false).screen, 0);
  assert.ok(policy.budget(10, 2, 5, true, false).screen > policy.budget(10, 5, 5, true, false).screen);
  const low = policy.budget(1, 20, 20, true, true);
  assert.equal(low.screen, 0);
  assert.equal(low.camera, 0);
});

test('automatic quality tolerates startup, degrades persistent trouble, and recovers slowly', () => {
  let state = policy.adapt({}, { active: true, reason: 'bandwidth' }, 0);
  state = policy.adapt(state, { active: true, reason: 'bandwidth' }, 4000);
  assert.equal(state.level, 0);
  state = policy.adapt(state, { active: true, reason: 'bandwidth' }, 5000);
  assert.equal(state.level, 1);
  state = policy.adapt(state, { active: true, reason: 'cpu' }, 15000);
  assert.equal(state.level, 2);
  state = policy.adapt(state, { active: true, reason: 'none' }, 16000);
  state = policy.adapt(state, { active: true, reason: 'none' }, 40000);
  assert.equal(state.level, 2);
  state = policy.adapt(state, { active: true, reason: 'none' }, 41000);
  assert.equal(state.level, 1);
  assert.equal(policy.encoding(policy.presets.auto, 2e6, 1).scaleResolutionDownBy, 1.5);
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
  const track = (kind) => ({ id: `t${serial++}`, kind, readyState: 'live', stop() { this.readyState = 'ended'; }, applyConstraints: async () => {} });
  const stream = (tracks) => ({ id: `s${serial++}`, getTracks: () => [...tracks], getVideoTracks: () => tracks.filter((t) => t.kind === 'video'), getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'), addTrack: (t) => tracks.push(t), removeTrack: (t) => tracks.splice(tracks.indexOf(t), 1) });
  const microphone = track('audio');
  const screen = stream([track('video'), track('audio')]);
  const senders = [{ track: microphone, getParameters: () => ({ encodings: [{}] }), setParameters: async () => {} }];
  const transceivers = [];
  const peer = { sid: 'viewer', adaptation: {}, stats: {}, remote: {}, senders: { screen: [], camera: [] }, pc: {
    signalingState: 'stable', connectionState: 'connected',
    getSenders: () => senders, getTransceivers: () => transceivers,
    addTrack(t) { const sender = { track: t, async replaceTrack(next) { this.track = next; }, getParameters: () => ({ encodings: [{}] }), setParameters: async () => {} }; senders.push(sender); transceivers.push({ sender, receiver: { track: { kind: t.kind } } }); return sender; },
    removeTrack(sender) { sender.track = null; },
  } };
  const self = { viewers: [], sid: 'self' };
  const state = { me: { sid: 'self' }, local: { screen, camera: null }, sharePreset: 'auto', shareAudio: true, uploadMbps: 10, peers: new Map([['viewer', peer]]), voiceChannel: 'room', view: 'voice' };
  const notices = [];
  const domNode = { textContent: '', classList: { contains: () => true }, replaceChildren() {} };
  const context = { window: {}, MediaPolicy: policy, document: { querySelector: () => domNode }, performance, localStorage: { setItem() {} }, setInterval() {}, setTimeout, clearTimeout, console,
    navigator: { mediaDevices: { getDisplayMedia: async () => stream([track('video'), track('audio')]) } }, Sounds: { play() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/media-session.js'), 'utf8'), context);
  const media = context.window.MediaSession({ state, socket: {}, call: async () => ({}), el: () => domNode, toast: (msg) => notices.push(msg), voiceEntry: (sid) => sid === 'self' ? self : {}, member: () => ({}), render() {}, renderStage() {}, sendVoiceState() {}, preferCodec() {} });
  return { media, state, self, peer, screen, microphone, notices, context };
}

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
      assert.ok((await emit(socket, 'auth', { mode: 'register', name, password: 'test-only-2026' })).accountId);
      return socket;
    }
    const host = await connect('Host'), viewer = await connect('Viewer'), outsider = await connect('Elsewhere');
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
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: true })).ok);
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 1);
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    assert.equal(host.snapshot.voice.find((v) => v.sid === host.id).viewers.length, 1);
    await emit(viewer, 'screen:watch', { target: host.id, watching: false });
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 0);
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    await emit(host, 'voice:state', { sharing: false });
    assert.equal(host.snapshot.voice.find((v) => v.sid === host.id).viewers.length, 0);
    await emit(host, 'voice:state', { sharing: true });
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    await emit(viewer, 'voice:leave');
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 0);
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
