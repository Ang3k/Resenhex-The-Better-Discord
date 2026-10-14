const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const policy = require('../public/media-policy');
// Objetos criados dentro do vm têm protótipos de outro contexto: compara a forma em JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));

// public/media-sfu.js contra um SDK do LiveKit de mentira: confere como cada fonte é publicada.
// Ordem das capacidades do Chrome: o primeiro H.264 é o 42001f, que o LiveKit não negocia.
const chromeCodecs = [{ mimeType: 'video/VP8' }, { mimeType: 'video/rtx', sdpFmtpLine: 'apt=96' },
  { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f' },
  { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f' },
  { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f' },
  { mimeType: 'video/AV1', sdpFmtpLine: 'level-idx=5;profile=0;tier=0' }];
function harness({ serverVersion = '1.13.8', codecs = ['video/VP8', 'video/VP9', 'video/AV1', 'video/H264'], sharePreset = 'auto' } = {}) {
  const published = [], transceivers = [];
  class RTCRtpTransceiver { setCodecPreferences(list) { this.preferences = list; } }
  class RTCPeerConnection { addTransceiver(track) { const t = new RTCRtpTransceiver(); t.track = track; transceivers.push(t); return t; } }
  const addTransceiver = RTCPeerConnection.prototype.addTransceiver;
  class VideoPreset { constructor(width, height, maxBitrate, maxFramerate) { Object.assign(this, { width, height, encoding: { maxBitrate, maxFramerate } }); } }
  const Source = { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share', ScreenShareAudio: 'screen_share_audio' };
  class Room {
    constructor() {
      this.remoteParticipants = new Map();
      this.engine = { serverVersion };
      const publications = new Map();
      this.localParticipant = {
        permissions: { canPublish: true, canPublishSources: [] }, trackPublications: publications, videoTrackPublications: new Map(),
        async publishTrack(track, options) {
          published.push({ kind: track.kind, options });
          const pc = new RTCPeerConnection();
          if (track.kind === 'video') { pc.addTransceiver({ id: 'other', kind: 'video' }); pc.addTransceiver(track); }
          const sender = { params: { degradationPreference: options.degradationPreference, encodings: [{}] }, getParameters() { return structuredClone(this.params); } };
          const publication = { source: options.source, track: { mediaStreamTrack: track, sender, async setDegradationPreference(value) { sender.params.degradationPreference = value; } } };
          publications.set(track.id, publication);
          return publication;
        },
        async unpublishTrack() {},
      };
    }
    on() {} async connect() {} async disconnect() {}
  }
  const track = (kind, width, height) => ({ id: `${kind}-${width}`, kind, getSettings: () => ({ width, height }) });
  const stream = (...tracks) => ({ getTracks: () => tracks, getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'), getVideoTracks: () => tracks.filter((t) => t.kind === 'video') });
  const state = { sharePreset, uploadMbps: 10, local: { screen: null, camera: null }, peers: new Map(), micStream: stream(track('audio', 0, 0)) };
  const context = { window: { LivekitClient: { Room, VideoPreset, Track: { Source }, RoomEvent: {}, DisconnectReason: {} } }, MediaPolicy: policy, structuredClone,
    RTCRtpSender: { getCapabilities: () => ({ codecs: codecs.map((mimeType) => ({ mimeType })) }) }, RTCRtpReceiver: { getCapabilities: () => ({ codecs: chromeCodecs }) },
    RTCPeerConnection, RTCRtpTransceiver, document: { querySelector: () => null }, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/media-sfu.js'), 'utf8'), context);
  const sfu = context.window.MediaSfu({ state, renderStage() {}, applyAudio() {}, watchSpeaking() {}, unwatchSpeaking() {}, closePeer() {}, notice() {} });
  return { sfu, state, published, track, stream, transceivers, patched: () => RTCPeerConnection.prototype.addTransceiver !== addTransceiver };
}

test('SFU text shares publish one full-resolution AV1 layer with screen tools and a VP8 backup', async () => {
  const h = harness();
  await h.sfu.connect({ url: 'wss://sfu.test', token: 't' });
  await h.sfu.publish('screen', h.stream(h.track('video', 1920, 1080)));
  const { options } = h.published.find((p) => p.kind === 'video');
  assert.equal(options.videoCodec, 'av1');
  // Camada única por envio (L1T1): o SDK não força SVC nem contentHint "motion".
  assert.equal(options.simulcast, true);
  assert.equal(options.scalabilityMode, 'L1T1');
  assert.deepEqual(plain(options.screenShareSimulcastLayers), []);
  assert.deepEqual(plain(options.screenShareEncoding), { maxBitrate: 4_000_000, maxFramerate: 30 }, 'no 0.75 cut on the full layer');
  assert.equal(options.backupCodec.codec, 'vp8');
  assert.equal(options.degradationPreference, 'maintain-resolution');
});

test('SFU text shares avoid AV1 SVC on servers without single-layer support', async () => {
  const h = harness({ serverVersion: '1.13.6' });
  await h.sfu.connect({ url: 'wss://sfu.test', token: 't' });
  await h.sfu.publish('screen', h.stream(h.track('video', 1920, 1080)));
  const { options } = h.published.find((p) => p.kind === 'video');
  assert.equal(options.videoCodec, 'vp8');
  assert.equal(options.simulcast, false);
  assert.equal(options.scalabilityMode, undefined);
});

test('SFU motion shares keep 1080p60 with a usable 540p60 layer, never the starved 720p/600 kbps one', async () => {
  const h = harness({ sharePreset: 'p1080_60' });
  await h.sfu.connect({ url: 'wss://sfu.test', token: 't' });
  await h.sfu.publish('screen', h.stream(h.track('video', 1920, 1080)));
  const { options } = h.published.find((p) => p.kind === 'video');
  assert.equal(options.videoCodec, 'h264');
  assert.deepEqual(plain(options.screenShareEncoding), { maxBitrate: 6_000_000, maxFramerate: 60 });
  assert.deepEqual(plain(options.screenShareSimulcastLayers.map((l) => [l.height, l.encoding.maxBitrate, l.encoding.maxFramerate])), [[540, 1_500_000, 60]]);
  assert.equal(options.degradationPreference, 'maintain-framerate-and-resolution');
  const vp8 = harness({ sharePreset: 'p1080_60', codecs: ['video/VP8', 'video/VP9'] });
  await vp8.sfu.connect({ url: 'wss://sfu.test', token: 't' });
  await vp8.sfu.publish('screen', vp8.stream(vp8.track('video', 1920, 1080)));
  assert.equal(vp8.published.find((p) => p.kind === 'video').options.videoCodec, 'vp8');
});

test('SFU cameras keep a 360p30 layer for the grid', async () => {
  const h = harness();
  await h.sfu.connect({ url: 'wss://sfu.test', token: 't' });
  await h.sfu.publish('camera', h.stream(h.track('video', 1280, 720)));
  const { options } = h.published.find((p) => p.kind === 'video');
  assert.equal(options.videoCodec, 'vp8');
  assert.deepEqual(plain(options.videoSimulcastLayers.map((l) => [l.height, l.encoding.maxBitrate, l.encoding.maxFramerate])), [[360, 450_000, 30]]);
  assert.deepEqual(plain(options.videoEncoding), { maxBitrate: 1_200_000, maxFramerate: 30 });
});

test('an H.264 screen offers 42e01f first, so the SDK start bitrate lands on the codec LiveKit picks', async () => {
  const h = harness({ sharePreset: 'p1080_60' });
  await h.sfu.connect({ url: 'wss://sfu.test', token: 't' });
  await h.sfu.publish('screen', h.stream(h.track('video', 1920, 1080)));
  const screen = h.transceivers.find((t) => t.track.id === 'video-1920'), other = h.transceivers.find((t) => t.track.id === 'other');
  assert.deepEqual(plain(screen.preferences.map((c) => c.sdpFmtpLine?.match(/packetization-mode=\d;profile-level-id=\w+/)?.[0] || c.mimeType)), [
    'video/VP8', 'video/rtx', 'packetization-mode=1;profile-level-id=42e01f', 'packetization-mode=1;profile-level-id=42001f', 'packetization-mode=0;profile-level-id=42001f', 'video/AV1']);
  assert.equal(other.preferences, undefined, 'other transceivers keep the browser order');
  assert.equal(h.patched(), false, 'addTransceiver is restored after the publish');
  const text = harness();
  await text.sfu.connect({ url: 'wss://sfu.test', token: 't' });
  await text.sfu.publish('screen', text.stream(text.track('video', 1920, 1080)));
  assert.equal(text.transceivers.find((t) => t.track.id === 'video-1920').preferences, undefined, 'AV1/VP8 publishes are left alone');
});
