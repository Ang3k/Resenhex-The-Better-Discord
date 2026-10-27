const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

// Run the real UI scripts against a deterministic socket contract, without opening
// a browser, contacting a website or granting microphone/camera permissions.
const publicDir = path.join(__dirname, '..', 'public');
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const userId = 'a'.repeat(16);
const person = { id: userId, name: 'Ana', color: '#5865f2', roles: [], online: true, timeoutUntil: 0 };
const code = 'a'.repeat(24);
const snapshot = (id, name, servers) => ({ serverId: id, serverName: name, ownerId: userId, serverIcon: null, servers,
  roles: [{ id: 'everyone', name: '@everyone', perms: [] }], channels: id ? [{ id: id + '-chat', name: 'geral', type: 'text', topic: '', categoryId: 'text', private: false, allowedRoles: [] }] : [],
  categories: id ? [{ id: 'text', name: 'Texto' }] : [], members: id ? [person] : [], people: [person], voice: [], bans: [], myPerms: id ? ['ADMIN', 'MANAGE_CHANNELS', 'SEND_MESSAGES', 'CONNECT', 'STREAM', 'KICK', 'BAN', 'MANAGE_ROLES', 'TIMEOUT', 'MUTE_MEMBERS'] : [] });

async function ui(t, invited = false, options = {}) {
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'), {
    url: 'https://resenhex.test/' + (invited ? '?invite=' + code : '') + (options.hash || ''), runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'userAgent', { value: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
  if (options.name) w.localStorage.setItem('name', options.name);
  if (options.token) w.localStorage.setItem('token', options.token);
  for (const [key, value] of Object.entries(options.storage || {})) w.localStorage.setItem(key, value);
  if (options.desktop) w.resenhexDesktop = { onPushToTalk() {}, setPushToTalk() {} };
  // Include the pre-paint decision and the landing script, in the HTML's real order.
  for (const script of w.document.querySelectorAll('script:not([src]):not([type="importmap"])')) w.eval(script.textContent);
  const events = [], handlers = new Map();
  const servers = [];
  let current = snapshot(null, '', servers);
  const push = () => handlers.get('state')?.(structuredClone(current));
  const socket = {
    connected: false, active: false,
    // Como no socket.io, cada evento pode ter mais de um ouvinte (o app e a prévia da transmissão ouvem o connect).
    on(event, handler) { const before = handlers.get(event); handlers.set(event, before ? (payload) => { const out = before(payload); handler(payload); return out; } : handler); },
    connect() { this.connected = true; }, disconnect() { this.connected = false; }, timeout() { return this; },
    emit(event, payload, callback) {
      events.push({ event, payload });
      queueMicrotask(() => {
        let result = { ok: true };
        if (event === 'auth') {
          if (payload.token && options.expiredToken) { callback?.({ error: 'Sessão expirada.' }); return; }
          if (payload.mode === 'register' && payload.confirmPassword !== payload.password) { callback?.({ error: 'As senhas não coincidem.' }); return; }
          result = { token: 'fake-ui-token', accountId: userId, sid: 'ui-socket', iceServers: [], permNames: {}, maxUploadMb: 25, gifKey: options.gifKey };
          callback?.(result); handlers.get('social')?.({ friends: [], incoming: [], outgoing: [], blocked: [], dms: [] }); push(); return;
        }
        if (event === 'server:create') {
          const id = 'server-' + (servers.length + 1);
          servers.push({ id, name: payload.name, icon: null, owner: true });
          current = snapshot(id, payload.name, servers); result = { id }; push();
        } else if (event === 'server:select') {
          const server = servers.find((s) => s.id === payload.id);
          current = snapshot(server.id, server.name, servers); push();
        } else if (event === 'server:delete') {
          servers.splice(servers.findIndex((s) => s.id === payload.id), 1);
          current = snapshot(servers[0]?.id || null, servers[0]?.name || '', servers); push();
        } else if (options.reply?.[event]) result = options.reply[event](payload);
        else if (event === 'server:invite') result = { code, name: current.serverName };
        else if (event === 'server:join') {
          if (!servers.some((s) => s.id === 'invited')) servers.push({ id: 'invited', name: 'Turma convidada', icon: null, owner: false });
          current = snapshot('invited', 'Turma convidada', servers); result = { id: 'invited' }; push();
        } else if (event === 'chat:unread') result = { unread: {} };
        else if (event === 'chat:history') result = { messages: [] };
        callback?.(null, result);
      });
    },
  };
  w.io = () => socket;
  w.structuredClone = structuredClone;
  // Sem `mouse`, a página se comporta como no celular (toque): hasMouse() é falso.
  w.matchMedia = (query) => ({ matches: !!options.mouse && query === '(hover: hover) and (pointer: fine)', addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.Element.prototype.scrollTo = function () {};
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.load = function () {};
  let releaseConfig;
  const configReady = options.deferConfig ? new Promise((resolve) => { releaseConfig = resolve; }) : Promise.resolve();
  w.fetch = async (url) => {
    if (url === '/config') await configReady;
    return { json: async () => url === '/config' ? { hasOwner: options.hasOwner ?? true, passwordRequired: false, maxUploadMb: 25, mailEnabled: options.mailEnabled ?? false } : { id: 'invited', name: 'Turma convidada', members: 3, icon: null } };
  };
  let copied = '';
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (text) => { copied = text; } } });
  options.setup?.(w);
  for (const file of ['motion.js', 'icons.js', 'format.js', 'sounds.js', 'media-policy.js', 'keybinds.js', 'settings.js', 'photo-editor.js', 'media-session.js', 'media-sfu.js', 'stream-preview.js', 'mobile-stream.js', 'stream-zoom.js', 'changelog.js', 'confetti.js', 'channel-navigation.js', 'music.js', 'mudae.js', 'mudae-salao.js', 'dm-call.js', 'gif-picker.js', 'emoji-picker.js', 'lightbox.js', 'voice-fx.js', 'feedback.js', 'clip-model.js', 'clip-buffer.js', 'clip-render.js', 'clip-ui.js', 'sound-trimmer.js', 'app.js', 'landing.js']) w.eval(fs.readFileSync(path.join(publicDir, file), 'utf8'));
  w.localStorage.setItem('seenVersion', w.APP_VERSION);
  t.after(() => { dom.window.close(); assert.deepEqual(errors.map((e) => e.message), []); });
  await settle();
  const d = w.document;
  const clickText = async (text) => { const element = [...d.querySelectorAll('button, a')].find((el) => el.textContent.trim() === text); assert.ok(element, 'Control missing: ' + text); element.click(); await settle(); };
  async function register(confirmPassword = 'test-only') {
    if (d.documentElement.classList.contains('show-landing')) d.querySelector('.ld-hero .ld-open').click();
    if (d.querySelector('#login-submit').textContent !== 'Criar conta') d.querySelector('#login-switch').click();
    d.querySelector('#login-name').value = 'Ana';
    d.querySelector('#login-password').value = 'test-only';
    d.querySelector('#login-confirm-password').value = confirmPassword;
    d.querySelector('#login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  }
  return { w, d, events, clickText, register, releaseConfig, deliver: (event, payload) => handlers.get(event)?.(payload),
    setSnapshot: (next) => { current = structuredClone(next); push(); }, get copied() { return copied; } };
}

test('Propor Melhorias: envia a sugestão autenticada uma vez e confirma só após a resposta', async (t) => {
  const requests = [];
  let complete;
  const app = await ui(t, false, { setup(w) {
    const original = w.fetch;
    w.fetch = (url, request) => {
      if (url !== '/feedback') return original(url, request);
      requests.push(request);
      return new Promise((resolve) => { complete = resolve; });
    };
  } });
  await app.register();
  const button = app.d.querySelector('#btn-feedback');
  button.focus(); button.click();
  const input = app.d.querySelector('#feedback-message');
  const form = app.d.querySelector('#feedback-form');
  const send = app.d.querySelector('#feedback-send');
  assert.equal(send.disabled, true);
  input.value = '  Busca no histórico  ';
  input.dispatchEvent(new app.w.Event('input'));
  assert.equal(send.disabled, false);
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].body), { message: 'Busca no histórico' });
  assert.equal(requests[0].headers['x-token'], 'fake-ui-token');
  assert.equal(send.disabled, true);
  assert.equal(app.d.querySelector('#feedback-success').classList.contains('hidden'), true);
  complete({ ok: true, json: async () => ({ ok: true }) }); await settle();
  assert.equal(input.value, '');
  assert.equal(app.d.querySelector('#feedback-success').classList.contains('hidden'), false);
  assert.equal(app.d.activeElement.id, 'feedback-done');
  app.d.querySelector('#feedback-done').click();
  assert.equal(app.d.querySelector('#feedback').classList.contains('hidden'), true);
  assert.equal(app.d.querySelector('#app').inert, undefined);
  assert.equal(app.d.activeElement, button);
});

test('Propor Melhorias: erro preserva a ideia, inclusive ao fechar e abrir novamente', async (t) => {
  const app = await ui(t, false, { setup(w) {
    const original = w.fetch;
    w.fetch = async (url, request) => url === '/feedback'
      ? { ok: false, json: async () => ({ error: 'Aguarde dez minutos para enviar outra.' }) }
      : original(url, request);
  } });
  await app.register();
  app.d.querySelector('#btn-feedback').click();
  const input = app.d.querySelector('#feedback-message');
  input.value = 'Minha sugestão'; input.dispatchEvent(new app.w.Event('input'));
  app.d.querySelector('#feedback-form').dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.match(app.d.querySelector('#feedback-status').textContent, /Aguarde dez minutos/);
  assert.equal(input.value, 'Minha sugestão');
  assert.equal(app.d.querySelector('#feedback-success').classList.contains('hidden'), true);
  app.d.querySelector('.feedback-cancel').click();
  app.d.querySelector('#btn-settings').click(); await settle();
  app.d.querySelector('#settings-feedback').click();
  assert.equal(input.value, 'Minha sugestão');
  assert.equal(app.d.querySelector('#settings').inert, true);
  app.d.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.d.querySelector('#feedback').classList.contains('hidden'), true);
  assert.equal(app.d.querySelector('#settings').classList.contains('hidden'), false);
  assert.equal(app.d.querySelector('#settings').inert, undefined);
});

async function voicePreviewApp(t, options = {}) {
  const captures = [], played = [], effects = [], destinations = [];
  let capture;
  let sequence = 0;
  const track = () => ({ kind: 'audio', enabled: true, readyState: 'live', id: 'track-' + ++sequence,
    stop() { this.readyState = 'ended'; }, clone() { return track(); }, getSettings: () => ({}) });
  class Stream {
    constructor(tracks = [track()]) { this.tracks = tracks; this.id = 'stream-' + ++sequence; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
    getVideoTracks() { return []; }
  }
  const node = () => ({ gain: { value: 1 }, connect(next) { return next; }, disconnect() {} });
  const app = await ui(t, false, {
    storage: { noiseMode: 'off', ...options.storage }, reply: { 'voice:join': () => ({ peers: [] }), ...options.reply },
    setup(w) {
      capture = async () => { const stream = new Stream(); captures.push(stream); return stream; };
      Object.defineProperty(w.navigator, 'mediaDevices', { value: {
        getUserMedia: () => capture(), enumerateDevices: async () => options.devices || [],
        addEventListener() {}, removeEventListener() {},
      } });
      options.setup?.(w);
      w.MediaStream = Stream;
      w.AudioContext = class {
        constructor() { this.state = 'running'; this.destination = node(); }
        createGain() { return node(); }
        createMediaStreamSource() { return node(); }
        createMediaStreamDestination() { const stream = new Stream(); destinations.push(stream); return { ...node(), stream }; }
        createAnalyser() { return { ...node(), fftSize: 1024, getFloatTimeDomainData(data) { data.fill(0.1); }, getByteTimeDomainData(data) { data.fill(128); } }; }
      };
      w.HTMLMediaElement.prototype.play = async function () { played.push(this); };
      if (options.output) w.HTMLMediaElement.prototype.setSinkId = async function (id) { this.sinkId = id; };
    },
  });
  await app.register();
  app.w.Sounds.play = () => {};
  app.w.VoiceFx.create = async (ctx, id) => {
    const effect = { id, input: node(), output: node(), destroyed: false, blocked: false,
      setBlocked(value) { this.blocked = !!value; },
      async set(next) { this.id = next; }, destroy() { this.destroyed = true; } };
    effects.push(effect);
    return effect;
  };
  const state = snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', owner: true }]);
  state.myPerms.push('SPEAK');
  state.categories.push({ id: 'voice', name: 'Voz' });
  state.channels.push({ id: 'room-1', name: 'Sala 1', type: 'voice', categoryId: 'voice', allowedRoles: [] });
  state.voice.push({ accountId: userId, sid: 'ui-socket', channel: 'room-1' });
  app.setSnapshot(state); await settle();
  app.d.querySelector('[data-channel-id="room-1"] .channel-entry').click(); await settle();
  return { ...app, captures, played, effects, destinations, Stream, setCapture(fn) { capture = fn; } };
}

test('quem entra logo depois conecta: a oferta que chega enquanto ainda entramos é respondida', async (t) => {
  let releaseMedia;
  const pcs = [];
  const app = await voicePreviewApp(t, {
    // O voice:join já respondeu (estamos na sala para o servidor); o voice:media ainda não.
    reply: { 'voice:media': () => new Promise((resolve) => { releaseMedia = resolve; }) },
    setup(w) {
      w.RTCPeerConnection = class {
        constructor() { this.signalingState = 'stable'; this.connectionState = 'new'; this.senders = []; this.remote = []; this.candidates = []; pcs.push(this); }
        addTrack(track) { const sender = { track }; this.senders.push(sender); return sender; }
        getTransceivers() { return []; } getSenders() { return this.senders; } getReceivers() { return []; }
        async setRemoteDescription(d) { this.remote.push(d.type); this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable'; }
        async setLocalDescription() { this.localDescription = { type: 'answer', sdp: 'local' }; this.signalingState = 'stable'; }
        async addIceCandidate(c) { this.candidates.push(c.candidate); } async getStats() { return new Map(); } close() { this.signalingState = 'closed'; } restartIce() {}
      };
    },
  });
  await settle();
  // B entrou logo depois de nós e já mandou a oferta e um candidato.
  app.deliver('signal', { from: 'peer-b', data: { description: { type: 'offer', sdp: 'remote-offer' } } });
  app.deliver('signal', { from: 'peer-b', data: { candidate: { candidate: 'c1' } } });
  // C também ofereceu, mas saiu antes de a chamada começar aqui: nada de conexão com quem já foi.
  app.deliver('signal', { from: 'peer-c', data: { description: { type: 'offer', sdp: 'remote-offer' } } });
  app.deliver('voice:peer-left', { id: 'peer-c' });
  await settle();
  assert.equal(pcs.length, 0, 'nothing connects before the call starts');
  releaseMedia({ transport: 'p2p' });
  await settle(); await settle();
  assert.equal(pcs.length, 1);
  assert.deepEqual(pcs[0].remote, ['offer']);
  assert.deepEqual(pcs[0].candidates, ['c1']);
  const answers = app.events.filter((e) => e.event === 'signal' && e.payload.to === 'peer-b');
  assert.deepEqual(answers.map((e) => e.payload.data.description?.type), ['answer']);
});

test('som da tela de quem transmite em estéreo: a resposta pede stereo=1 só na seção dele, e a voz fica mono', async (t) => {
  const pcs = [];
  const audio = (mid, msid) => [`m=audio 9 UDP/TLS/RTP/SAVPF 111`, `a=mid:${mid}`, ...(msid ? [`a=msid:${msid}`] : []), 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1'];
  const sdp = (...sections) => ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', ...sections.flat(), ''].join('\r\n');
  let refuseMunging = false;
  const app = await voicePreviewApp(t, {
    setup(w) {
      w.RTCPeerConnection = class {
        constructor() { this.signalingState = 'stable'; this.connectionState = 'new'; this.senders = []; this.local = []; pcs.push(this); }
        addTrack(track) { const sender = { track }; this.senders.push(sender); return sender; }
        getTransceivers() { return []; } getSenders() { return this.senders; } getReceivers() { return []; }
        async setRemoteDescription(d) { this.remoteDescription = d; this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable'; }
        async createAnswer() { return { type: 'answer', sdp: sdp(audio('0', 'my-mic t'), audio('1')) }; }
        async createOffer() { return { type: 'offer', sdp: sdp(audio('0', 'my-mic t'), audio('1')) }; }
        async setLocalDescription(d) {
          if (d && refuseMunging && d.sdp.includes('stereo')) throw Object.assign(new Error('munging'), { name: 'InvalidModificationError' });
          d ||= await (this.signalingState === 'have-remote-offer' ? this.createAnswer() : this.createOffer());
          this.local.push(d.sdp); this.localDescription = d; this.signalingState = 'stable';
        }
        async addIceCandidate() {} async getStats() { return new Map(); } close() { this.signalingState = 'closed'; } restartIce() {}
      };
    },
  });
  await settle();
  // B transmite a tela com som: a oferta traz a voz dele (mid 0) e o som da tela (mid 1).
  const offer = { type: 'offer', sdp: sdp(audio('0', 'b-mic m'), audio('1', 'b-screen s')) };
  app.deliver('signal', { from: 'peer-b', data: { description: offer, video: { screen: 'b-screen' } } });
  await settle(); await settle();
  const [voice, screen] = pcs[0].local.at(-1).split('\r\nm=').slice(1);
  assert.match(screen, /a=fmtp:111 minptime=10;useinbandfec=1;stereo=1/);
  assert.doesNotMatch(voice, /stereo/);
  const sent = app.events.filter((e) => e.event === 'signal' && e.payload.to === 'peer-b').at(-1);
  assert.match(sent.payload.data.description.sdp, /stereo=1/, 'the answer that goes to B asks for stereo, so B encodes in stereo');
  // A nossa própria renegociação (câmera, recuperação) mantém o pedido.
  await pcs[0].onnegotiationneeded();
  assert.match(pcs[0].local.at(-1).split('\r\nm=')[2], /stereo=1/);
  // Sem tela com som: a descrição fica como o navegador fez.
  app.deliver('signal', { from: 'peer-c', data: { description: { type: 'offer', sdp: sdp(audio('0', 'c-mic m')) }, video: {} } });
  await settle(); await settle();
  assert.doesNotMatch(pcs[1].local.at(-1), /stereo/);
  // Navegador que recusa a descrição alterada: responde do jeito de antes, em mono.
  refuseMunging = true;
  app.deliver('signal', { from: 'peer-b', data: { description: offer, video: { screen: 'b-screen' } } });
  await settle(); await settle();
  assert.doesNotMatch(pcs[0].local.at(-1), /stereo/);
  assert.equal(app.events.filter((e) => e.event === 'signal' && e.payload.to === 'peer-b' && e.payload.data.description?.type === 'answer').length, 2, 'still answered');
});

test('a sala passa para conexão direta enquanto ainda entramos pelo SFU: a troca vale quando a entrada termina', async (t) => {
  const pcs = [], rooms = [];
  let releaseMedia, mediaCalls = 0;
  const app = await voicePreviewApp(t, {
    reply: {
      'voice:join': () => ({ peers: ['peer-b'] }),
      // A primeira entrada recebe o SFU; quando ela volta, a sala já é P2P.
      'voice:media': () => (++mediaCalls === 1 ? new Promise((resolve) => { releaseMedia = resolve; }) : { transport: 'p2p' }),
    },
    setup(w) {
      w.RTCPeerConnection = class {
        constructor() { this.signalingState = 'stable'; this.connectionState = 'new'; this.senders = []; pcs.push(this); }
        addTrack(track) { const sender = { track }; this.senders.push(sender); return sender; }
        getTransceivers() { return []; } getSenders() { return this.senders; } getReceivers() { return []; }
        async setRemoteDescription() {} async setLocalDescription() { this.localDescription = { type: 'offer', sdp: 'local' }; }
        async addIceCandidate() {} async getStats() { return new Map(); } close() { this.signalingState = 'closed'; } restartIce() {}
      };
      // O LiveKit está de pé (quem não o alcançou foi outra pessoa): a entrada pelo SFU dá certo.
      class Room {
        constructor() {
          rooms.push(this); this.state = 'connected'; this.engine = { serverVersion: '1.13.8' }; this.remoteParticipants = new Map();
          this.localParticipant = { permissions: { canPublish: true, canPublishSources: [] }, trackPublications: new Map(), videoTrackPublications: new Map(),
            async publishTrack(track, options) { return { source: options.source, track: { mediaStreamTrack: track } }; }, async unpublishTrack() {} };
        }
        on() {} async connect() {} async disconnect() { this.disconnected = true; }
      }
      w.LivekitClient = { Room, VideoPreset: class {}, Track: { Source: { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share', ScreenShareAudio: 'screen_share_audio' } }, RoomEvent: {}, DisconnectReason: {} };
    },
  });
  await settle();
  app.deliver('media:switch', { transport: 'p2p' }); // chega enquanto o voice:media ainda não respondeu
  releaseMedia({ transport: 'sfu', url: 'wss://sfu.test', token: 't' });
  await settle(); await settle(); await settle();
  assert.equal(app.events.filter((e) => e.event === 'voice:join').length, 2, 'joined again once the first join finished');
  assert.equal(mediaCalls, 2);
  assert.ok(rooms[0].disconnected, 'left the SFU');
  assert.equal(pcs.length, 1, 'a direct connection to the person in the room');
});

test('servidor de mídia que falha depois de entrar: a conexão direta liga com quem já estava na sala', async (t) => {
  const pcs = [], errors = [];
  let mediaCalls = 0;
  const app = await voicePreviewApp(t, {
    reply: {
      'voice:join': () => ({ peers: ['peer-b'] }),
      'voice:media': () => (++mediaCalls === 1 ? { transport: 'sfu', url: 'wss://sfu.test', token: 't' } : { transport: 'p2p' }),
    },
    setup(w) {
      w.RTCPeerConnection = class {
        constructor() { this.signalingState = 'stable'; this.connectionState = 'new'; this.senders = []; this.remote = []; pcs.push(this); }
        addTrack(track) { const sender = { track }; this.senders.push(sender); return sender; }
        getTransceivers() { return []; } getSenders() { return this.senders; } getReceivers() { return []; }
        async setRemoteDescription(d) { this.remote.push(d.type); } async setLocalDescription() { this.localDescription = { type: 'answer', sdp: 'local' }; }
        async addIceCandidate() {} async getStats() { return new Map(); } close() { this.signalingState = 'closed'; } restartIce() {}
      };
      // O SFU aceita a sala (B já estava lá), mas o microfone não sai: a entrada cai para P2P.
      class Room {
        constructor() {
          this.state = 'connected'; this.engine = { serverVersion: '1.13.8' };
          this.remoteParticipants = new Map([['peer-b', { identity: 'peer-b', trackPublications: new Map() }]]);
          this.localParticipant = { permissions: { canPublish: true, canPublishSources: [] }, trackPublications: new Map(), videoTrackPublications: new Map(),
            async publishTrack() { throw new Error('publication of local track timed out, no response from server'); }, async unpublishTrack() {} };
        }
        on() {} async connect() {} async disconnect() {}
      }
      w.LivekitClient = { Room, VideoPreset: class {}, Track: { Source: { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share', ScreenShareAudio: 'screen_share_audio' } }, RoomEvent: {}, DisconnectReason: {} };
      w.console.error = (...args) => errors.push(args.map(String).join(' '));
    },
  });
  await settle(); await settle(); await settle();
  assert.equal(mediaCalls, 2, 'fell back to direct connections');
  assert.equal(pcs.length, 1, 'a real connection to the person already in the room');
  app.deliver('signal', { from: 'peer-b', data: { description: { type: 'offer', sdp: 'remote-offer' } } });
  await settle(); await settle();
  assert.deepEqual(pcs[0].remote, ['offer']);
  assert.deepEqual(errors.filter((e) => /sinaliza/.test(e)), []);
});

test('chosen effects appear in the call menu and swap the musical voices without replacing capture', async (t) => {
  const app = await voicePreviewApp(t), d = app.d;
  d.querySelector('#sc-mic-devices').click(); await settle();
  d.querySelector('#voice-fx-toggle').click();
  for (const id of ['esquilo', 'gigante', 'radio', 'telefone', 'megafone', 'banheiro', 'caverna', 'alien', 'robo', 'fantasma', 'bebado', 'autotune', 'acordes', 'coral']) assert.ok(d.querySelector(`.vfx-chip[data-fx="${id}"]`), id);
  for (const id of ['monstro', 'walkie-talkie', 'robo-musical']) assert.equal(d.querySelector(`.vfx-chip[data-fx="${id}"]`), null);
  d.querySelector('.vfx-chip[data-fx="acordes"]').click(); await settle();
  const captures = app.captures.length;
  assert.equal(app.effects.at(-1).id, 'acordes');
  d.querySelector('.vfx-chip[data-fx="coral"]').click(); await settle();
  assert.equal(app.effects.at(-1).id, 'coral');
  assert.equal(app.captures.length, captures);
  assert.match(d.querySelector('.device-effect-current').textContent, /Coral/);
});

test('teste de voz no menu: ouve os efeitos, silencia a chamada e libera o microfone ao fechar', async (t) => {
  const app = await voicePreviewApp(t);
  const d = app.d;
  const mainTrack = app.captures[0].getAudioTracks()[0];
  assert.equal(mainTrack.enabled, true);
  d.querySelector('#sc-mic-devices').click(); await settle();
  const preview = d.querySelector('#voice-fx-preview');
  assert.equal(d.querySelector('#voice-fx-options').classList.contains('hidden'), true);
  assert.equal(preview.textContent, 'Ouvir minha voz');
  preview.click(); await settle();
  assert.equal(preview.textContent, 'Parar de ouvir');
  assert.equal(preview.getAttribute('aria-pressed'), 'true');
  assert.equal(mainTrack.enabled, false, 'o áudio do teste não sai pelo microfone da chamada');
  assert.equal(app.played.at(-1).srcObject, app.captures[1]);

  d.querySelector('#voice-fx-toggle').click();
  assert.equal(d.querySelector('#voice-fx-toggle').getAttribute('aria-expanded'), 'true');
  d.querySelector('.vfx-chip[data-fx="radio"]').click(); await settle();
  assert.equal(app.effects.at(-1).id, 'radio');
  assert.equal(app.captures[1].getAudioTracks()[0].readyState, 'ended');
  assert.equal(app.played.at(-1).srcObject.getAudioTracks()[0].enabled, true);
  const count = app.captures.length;
  d.querySelector('.vfx-chip[data-fx="robo"]').click(); await settle();
  assert.equal(app.effects.at(-1).id, 'robo');
  assert.match(d.querySelector('.device-effect-current').textContent, /Robô/);
  assert.equal(app.captures.length, count, 'trocar entre efeitos mantém a captura do teste');
  const processedCallTrack = app.destinations[0].getAudioTracks()[0];
  assert.equal(processedCallTrack.enabled, false);
  assert.equal(processedCallTrack.readyState, 'live');

  const monitoredAudio = app.played.at(-1), monitoredTrack = monitoredAudio.srcObject.getAudioTracks()[0];
  d.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(monitoredAudio.srcObject, null);
  assert.equal(monitoredTrack.readyState, 'ended');
  assert.equal(processedCallTrack.enabled, true, 'o microfone processado da chamada volta sem desligar o efeito');
  assert.equal(d.querySelector('#context-menu').classList.contains('hidden'), true);
  assert.equal(d.querySelector('#voice-fx-preview').getAttribute('aria-pressed'), 'false');
  assert.equal(d.querySelector('#voice-fx-test').textContent, 'Ouvir minha voz');
  d.querySelector('#sc-mic-devices').click(); await settle();
  d.querySelector('#voice-fx-toggle').click();
  d.querySelector('.vfx-chip[data-fx="none"]').click(); await settle();
  assert.equal(app.captures.at(-1).getAudioTracks()[0].enabled, true, 'o microfone volta ao estado anterior depois do teste');
});

test('painel de áudio compacto preserva dispositivos, volume e troca durante a escuta', async (t) => {
  const app = await voicePreviewApp(t, {
    output: true, storage: { micDeviceId: 'missing-mic' }, devices: [
      { kind: 'audioinput', deviceId: 'default', label: 'Padrão duplicado' },
      { kind: 'audioinput', deviceId: 'communications', label: 'Comunicações duplicado' },
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Microfone USB' },
      { kind: 'audioinput', deviceId: 'mic-2', label: 'Microfone Webcam' },
      ...Array.from({ length: 7 }, (_, i) => ({ kind: 'audiooutput', deviceId: 'speaker-' + i, label: 'Saída ' + i })),
    ],
  });
  const d = app.d;
  d.querySelector('#sc-mic-devices').click(); await settle();
  const menu = d.querySelector('#context-menu');
  const mic = menu.querySelector('select[data-device="micDeviceId"]');
  const output = menu.querySelector('select[data-device="speakerDeviceId"]');
  assert.equal(menu.querySelectorAll('select').length, 2);
  assert.equal(mic.options.length, 4, 'padrão, dois microfones e o salvo desconectado');
  assert.equal(mic.selectedOptions[0].disabled, true);
  assert.equal(output.options.length, 8, 'todas as saídas continuam disponíveis sem aumentar o painel');
  const arrow = new app.w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  mic.dispatchEvent(arrow);
  assert.equal(arrow.defaultPrevented, false, 'as setas continuam funcionando dentro do seletor');

  d.querySelector('#voice-fx-preview').click(); await settle();
  const previousAudio = app.played.at(-1);
  let resolveDevice;
  let deferDevice = true;
  app.setCapture(() => {
    if (deferDevice) { deferDevice = false; return new Promise(resolve => { resolveDevice = resolve; }); }
    const stream = new app.Stream(); app.captures.push(stream); return Promise.resolve(stream);
  });
  mic.value = 'mic-1'; mic.dispatchEvent(new app.w.Event('change', { bubbles: true })); await settle();
  assert.equal(app.captures[0].getAudioTracks()[0].enabled, false, 'a chamada continua muda enquanto o novo dispositivo abre');
  const replacement = new app.Stream(); app.captures.push(replacement); resolveDevice(replacement); await settle();
  assert.equal(previousAudio.srcObject, null);
  assert.equal(app.w.localStorage.getItem('micDeviceId'), 'mic-1');
  assert.equal(mic.value, 'mic-1');
  assert.equal(menu.classList.contains('hidden'), false);
  assert.equal(d.querySelector('#voice-fx-preview').getAttribute('aria-pressed'), 'true', 'a escuta usa o novo microfone');
  output.value = 'speaker-3'; output.dispatchEvent(new app.w.Event('change', { bubbles: true })); await settle();
  assert.equal(app.played.at(-1).sinkId, 'speaker-3');
  const volume = menu.querySelector('input[type="range"]');
  volume.value = '35'; volume.dispatchEvent(new app.w.Event('input', { bubbles: true }));
  assert.equal(app.w.localStorage.getItem('outputVolume'), '35');
  assert.equal(volume.style.getPropertyValue('--fill'), '35%');
  d.querySelector('#voice-fx-preview').click(); await settle();

  app.setCapture(async () => { throw new Error('Microfone indisponível'); });
  mic.value = 'mic-2'; mic.dispatchEvent(new app.w.Event('change', { bubbles: true })); await settle();
  assert.equal(mic.value, 'mic-1', 'falhas preservam o microfone que estava funcionando');
  assert.equal(mic.disabled, false);
});

test('teste de voz: fechar enquanto abre o microfone cancela o retorno e as configurações continuam funcionando', async (t) => {
  const app = await voicePreviewApp(t);
  const d = app.d;
  d.querySelector('#sc-mic-devices').click(); await settle();
  app.setCapture(async () => { throw new Error('Sem permissão'); });
  d.querySelector('#voice-fx-preview').click(); await settle();
  assert.equal(d.querySelector('#voice-fx-preview').textContent, 'Ouvir minha voz');
  assert.equal(d.querySelector('#voice-fx-preview').disabled, false);
  assert.equal(app.captures[0].getAudioTracks()[0].enabled, true, 'uma falha no teste não deixa a chamada muda');
  let resolveCapture;
  app.setCapture(() => new Promise(resolve => { resolveCapture = resolve; }));
  d.querySelector('#voice-fx-preview').click(); await settle();
  assert.equal(d.querySelector('#voice-fx-preview').disabled, true);
  d.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const cancelled = new app.Stream();
  resolveCapture(cancelled); await settle();
  assert.equal(cancelled.getAudioTracks()[0].readyState, 'ended');
  assert.equal(app.played.length, 0);
  assert.equal(app.captures[0].getAudioTracks()[0].enabled, true);

  app.setCapture(async () => { const stream = new app.Stream(); app.captures.push(stream); return stream; });
  d.querySelector('#sc-mic-devices').click(); await settle();
  await app.clickText('Configurações de voz');
  d.querySelector('#voice-fx-test').click(); await settle();
  assert.equal(d.querySelector('#voice-fx-test').textContent, 'Parar de ouvir');
  assert.equal(app.captures[0].getAudioTracks()[0].enabled, false);
  d.querySelector('.vfx-card[data-fx="radio"]').click(); await settle();
  assert.equal(app.effects.at(-1).id, 'radio');
  const audio = app.played.at(-1), track = audio.srcObject.getAudioTracks()[0];
  d.querySelector('#voice-fx-test').click(); await settle();
  assert.equal(audio.srcObject, null);
  assert.equal(track.readyState, 'ended');
  assert.equal(app.captures[0].getAudioTracks()[0].enabled, true);
});

test('removed character voices reset old preferences and never contact the desktop AI bridge', async (t) => {
  for (const oldPreference of ['ai', 'ai:naruto-br']) {
    let bridgeCalls = 0;
    const app = await voicePreviewApp(t, { storage: { voiceFx: oldPreference }, setup(w) {
      w.resenhexDesktop = { onPushToTalk() {}, setPushToTalk() {}, voiceAi: {
        status: () => { bridgeCalls++; throw new Error('Removed engine must not start'); },
        onState: () => { bridgeCalls++; },
      } };
    } });
    assert.equal(app.w.localStorage.getItem('voiceFx'), 'none');
    assert.equal(app.w.VoiceAI, undefined);
    assert.equal(app.effects.length, 0, 'old AI preference enters the call with normal voice');
    app.d.querySelector('#btn-settings').click(); await settle();
    const grid = app.d.querySelector('#voice-fx-grid');
    assert.equal(grid.children.length, 15, 'fourteen standard voices plus off');
    assert.equal(grid.querySelector('[data-fx="none"]').getAttribute('aria-checked'), 'true');
    assert.equal(grid.querySelector('[data-fx="ai"], [data-fx^="ai:"]'), null);
    assert.equal(app.d.querySelector('#voice-ai-panel'), null);
    app.d.querySelector('#settings-close').click(); await settle();
    app.d.querySelector('#sc-mic-devices').click(); await settle();
    assert.equal(app.d.querySelector('.vfx-chip[data-fx="ai"], .vfx-chip[data-fx^="ai:"]'), null);
    assert.equal(bridgeCalls, 0, 'even an older installed desktop bridge remains unused');
  }
});

test('standard voice effects preserve mute during local preview and effect changes', async (t) => {
  const app = await voicePreviewApp(t, { storage: { voiceFx: 'robo' } });
  const effect = app.effects[0], track = app.destinations[0].getAudioTracks()[0];
  assert.equal(effect.id, 'robo'); assert.equal(effect.blocked, false); assert.equal(track.enabled, true);
  app.d.querySelector('#sc-mic').click(); await settle();
  assert.equal(effect.blocked, true); assert.equal(track.enabled, false);
  app.d.querySelector('#btn-settings').click(); await settle();
  app.d.querySelector('#voice-fx-test').click(); await settle();
  assert.equal(app.effects.at(-1).id, 'robo'); assert.equal(app.effects.at(-1).blocked, false);
  assert.equal(effect.blocked, true); assert.equal(track.enabled, false);
  app.d.querySelector('.vfx-card[data-fx="coral"]').click(); await settle();
  assert.equal(app.effects.at(-1).id, 'coral');
  app.d.querySelector('#voice-fx-test').click(); await settle();
  assert.equal(app.effects.at(-1).destroyed, true);
  assert.equal(track.enabled, false); assert.equal(effect.blocked, true);
  app.d.querySelector('#sc-mic').click(); await settle();
  assert.equal(track.enabled, true); assert.equal(effect.blocked, false);
});

test('CLIPAR: "Pode clipar meu áudio" começa ligado, vai no estado de voz e desligar avisa a chamada', async (t) => {
  const app = await voicePreviewApp(t);
  const states = () => app.events.filter((e) => e.event === 'voice:state').map((e) => e.payload);
  assert.ok(states().length, 'mandou o estado de voz');
  assert.equal(states().at(-1).allowClips, true);
  assert.equal(app.d.querySelector('#sc-clip').classList.contains('hidden'), false, 'botão claquete na barra da chamada');
  assert.equal(app.d.querySelector('#sc-screen').nextElementSibling.id, 'sc-clip', 'logo depois de compartilhar tela');
  assert.ok(app.events.some((e) => e.event === 'clip:list'), 'pede os clipes da chamada ao entrar');
  app.d.querySelector('#btn-settings').click(); await settle();
  const toggle = app.d.querySelector('#allow-clips');
  assert.ok(toggle.closest('#page-voice'), 'fica em Voz e vídeo');
  assert.equal(toggle.closest('.mouse-only'), null, 'aparece também no celular');
  assert.equal(toggle.checked, true);
  toggle.checked = false; toggle.dispatchEvent(new app.w.Event('change', { bubbles: true })); await settle();
  app.d.querySelector('#settings-save').click(); await settle();
  assert.equal(states().at(-1).allowClips, false);
  assert.equal(app.w.localStorage.getItem('allowClips'), '0');
  // Sem chamada, o botão some.
  app.d.querySelector('#sc-leave').click(); await settle();
  assert.equal(app.d.querySelector('#sc-clip').classList.contains('hidden'), true);
});

test('standard voice effects preserve push-to-talk and mute when changing microphone', async (t) => {
  const app = await voicePreviewApp(t, { storage: { voiceFx: 'robo', ptt: JSON.stringify({ enabled: true, code: 'Backquote', label: '`' }) } });
  const effect = app.effects[0], track = app.destinations[0].getAudioTracks()[0];
  assert.equal(effect.blocked, true); assert.equal(track.enabled, false);
  app.d.dispatchEvent(new app.w.KeyboardEvent('keydown', { code: 'Backquote', bubbles: true })); await settle();
  assert.equal(effect.blocked, false); assert.equal(track.enabled, true);
  app.d.dispatchEvent(new app.w.KeyboardEvent('keyup', { code: 'Backquote', bubbles: true })); await settle();
  assert.equal(effect.blocked, true); assert.equal(track.enabled, false);
  app.d.querySelector('#sc-mic').click();
  app.d.querySelector('#sc-mic-devices').click(); await settle();
  const mic = app.d.querySelector('select[data-device="micDeviceId"]');
  mic.value = ''; mic.dispatchEvent(new app.w.Event('change', { bubbles: true })); await settle();
  assert.equal(app.effects.at(-1).blocked, true); assert.equal(app.destinations.at(-1).getAudioTracks()[0].enabled, false);
});

test('transmissões simultâneas usam grade, alternam destaque e preservam os players', async (t) => {
  const app = await ui(t, false, {
    storage: { noiseMode: 'off' }, reply: { 'voice:join': () => ({ peers: [] }) },
    setup(w) {
      Object.defineProperty(w.navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [], getAudioTracks: () => [] }) } });
    },
  });
  await app.register();
  app.w.Sounds.play = () => {};
  const s = snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', owner: true }]);
  s.categories.push({ id: 'voice', name: 'Voz' });
  s.channels.push({ id: 'room-1', name: 'Sala 1', type: 'voice', categoryId: 'voice', allowedRoles: [] });
  s.members.push({ ...person, id: 'b'.repeat(16), name: 'Bruno' }, { ...person, id: 'c'.repeat(16), name: 'Clara' });
  s.voice = s.members.map((m, i) => ({ accountId: m.id, sid: i ? 'remote-' + i : 'ui-socket', channel: 'room-1', sharing: i > 0 }));
  s.voice[1].voiceFx = 'robo';
  app.setSnapshot(s); await settle();
  app.d.querySelector('[data-channel-id="room-1"] .channel-entry').click(); await settle();
  const stage = app.d.querySelector('#stage');
  const primary = app.d.querySelector('#stage-primary');
  const strip = app.d.querySelector('#stage-strip');
  const first = primary.querySelector('[data-key="screen-remote-1"]');
  const second = primary.querySelector('[data-key="screen-remote-2"]');
  const video = first.querySelector('video');
  assert.equal(stage.dataset.layout, 'streams');
  assert.equal(primary.querySelectorAll('.screen').length, 2);
  assert.equal(stage.querySelectorAll('.focus').length, 0);
  assert.equal(strip.querySelectorAll('.tile').length, 3);
  const participant = stage.querySelector('[data-key="user-remote-1"]');
  assert.equal(participant.querySelector('.label .voice-fx-indicator'), null, 'o nome fica livre do indicador');
  assert.equal(participant.querySelector('.tile-badges .voice-fx-indicator'), null, 'o efeito fica fora dos selos à esquerda');
  assert.equal(participant.querySelector('.tile-fx .voice-fx-indicator').dataset.tip, 'Efeito de voz: Robô');
  assert.equal(app.d.querySelector('.voice-user .voice-fx-indicator'), null, 'a lista lateral não mostra o efeito');
  assert.equal(app.d.querySelector('#stage-summary').textContent, '2 transmissões');
  first.click();
  assert.equal(stage.dataset.layout, 'focus');
  assert.equal(primary.children.length, 1);
  assert.equal(primary.firstElementChild, first);
  assert.equal(second.parentElement, strip);
  second.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(primary.firstElementChild, second);
  assert.equal(stage.querySelectorAll('.focus').length, 1);
  app.d.querySelector('#stage-grid').click();
  assert.equal(stage.dataset.layout, 'streams');
  assert.equal(primary.firstElementChild, first, 'a grade mantém a ordem dos participantes');
  assert.equal(first.querySelector('video'), video, 'trocar o layout reutiliza o player');
  app.d.querySelector('#stage-focus').click();
  assert.equal(primary.firstElementChild, first);
  s.voice[1].sharing = false;
  s.voice[1].voiceFx = 'caverna';
  app.setSnapshot(s); await settle();
  assert.equal(participant.querySelector('.tile-fx .voice-fx-indicator').dataset.tip, 'Efeito de voz: Caverna', 'o detalhe acompanha a troca do efeito');
  assert.equal(stage.querySelector('[data-key="screen-remote-1"]'), null);
  assert.equal(primary.firstElementChild, second, 'quando a tela destacada encerra, destaca a restante');
  app.d.querySelector('#stage-grid').click();
  assert.equal(stage.dataset.layout, 'streams', 'a grade também funciona com uma tela');
  s.voice[2].sharing = false;
  s.voice[1].voiceFx = 'none';
  app.setSnapshot(s); await settle();
  assert.equal(participant.querySelector('.voice-fx-indicator'), null);
  assert.equal(participant.classList.contains('voice-fx-active'), false);
  assert.equal(app.d.querySelector('.voice-user .voice-fx-indicator'), null, 'o indicador some ao desligar o efeito');
  assert.equal(stage.dataset.layout, 'people');
  assert.equal(app.d.querySelector('#stage-toolbar').classList.contains('hidden'), true);
  assert.equal(primary.querySelectorAll('.tile').length, 3);
  assert.equal(app.events.filter((e) => e.event === 'screen:watch').length, 0, 'o layout não altera as assinaturas de vídeo');
});

test('tempo de call acompanha entrada, navegação e reconexão, e zera ao sair', async (t) => {
  let now = 1_800_000_000_000;
  let nextTimer = 0;
  const timers = new Map();
  const app = await ui(t, false, {
    storage: { noiseMode: 'off' }, reply: { 'voice:join': () => ({ peers: [] }) },
    setup(w) {
      w.Date.now = () => now;
      w.setInterval = (run, delay) => { const id = ++nextTimer; timers.set(id, { run, delay }); return id; };
      w.clearInterval = (id) => timers.delete(id);
      Object.defineProperty(w.navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [], getAudioTracks: () => [] }) } });
    },
  });
  await app.register();
  app.w.Sounds.play = () => {};
  const s = snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', owner: true }]);
  const room = { id: 'room-1', name: 'Sala 1', type: 'voice', categoryId: 'voice', allowedRoles: [] };
  s.categories.push({ id: 'voice', name: 'Voz' });
  s.channels.push(room);
  app.setSnapshot(s); await settle();
  const panel = app.d.querySelector('#voice-panel');
  const timer = app.d.querySelector('#btn-return-call [data-call-time]');
  const headerTimer = () => app.d.querySelector('#header-title [data-call-time]');
  const tick = (ms) => {
    now += ms;
    for (const { run, delay } of [...timers.values()]) if (delay === 1000) run();
  };
  assert.equal(panel.classList.contains('hidden'), true);
  app.d.querySelector('[data-channel-id="room-1"] .channel-entry').click(); await settle();
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(timer.textContent, '00:00');
  tick(65_000);
  assert.equal(timer.textContent, '01:05');
  assert.equal(timer.dateTime, 'PT65S');
  assert.equal(headerTimer()?.textContent, '01:05', 'o palco mostra o tempo no cabeçalho');
  app.d.querySelector('[data-channel-id="server-1-chat"] .channel-entry').click(); await settle();
  app.d.querySelector('#btn-mute').click();
  tick(35_000);
  assert.equal(timer.textContent, '01:40');
  assert.equal(headerTimer(), null, 'fora do palco o tempo fica no botão de voltar à chamada');
  assert.equal(app.d.querySelector('#btn-return-call').classList.contains('hidden'), false);
  app.setSnapshot({ ...snapshot('server-2', 'Outra turma', []), call: {
    serverId: s.serverId, serverName: s.serverName, channel: room, members: s.members,
    voice: [], myPerms: s.myPerms, soundboard: [],
  } }); await settle();
  tick(3_500_000);
  assert.equal(timer.textContent, '01:00:00', 'trocar de servidor mantém a chamada e o contador');
  app.deliver('disconnect', 'transport close');
  assert.equal(panel.classList.contains('hidden'), true);
  now += 5000;
  app.deliver('connect'); await settle();
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(timer.textContent, '01:00:05', 'reconectar preserva o início da chamada');
  app.d.querySelector('#btn-leave').click();
  assert.equal(panel.classList.contains('hidden'), true);
  tick(5000);
  assert.equal(timer.textContent, '00:00');
  app.setSnapshot(s); await settle();
  app.d.querySelector('[data-channel-id="room-1"] .channel-entry').click(); await settle();
  assert.equal(timer.textContent, '00:00');
  tick(1000);
  assert.equal(timer.textContent, '00:01', 'uma nova chamada começa do zero');
});

test('aesthetic chat: deleting messages uses app confirmation and preserves Shift shortcut', async (t) => {
  const app = await ui(t);
  await app.register();
  app.deliver('state', snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', owner: true }]));
  await settle();
  app.deliver('chat:message', { channel: 'server-1-chat', msg: { id: 'audit-message', authorId: userId, text: 'Mensagem de teste', ts: Date.now() } });
  await settle();
  const remove = app.d.querySelector('[data-id="audit-message"] .msg-actions .danger');
  assert.ok(remove);
  remove.click();
  assert.equal(app.d.querySelector('.confirm-card h2').textContent, 'Apagar mensagem');
  assert.equal(app.events.filter(e => e.event === 'chat:delete').length, 0);
  app.d.querySelector('.confirm-actions .btn-ghost').click(); await settle();
  assert.equal(app.d.querySelector('.confirm-overlay'), null);
  assert.equal(app.events.filter(e => e.event === 'chat:delete').length, 0);
  remove.click(); app.d.querySelector('.confirm-actions .btn-danger').click(); await settle();
  assert.deepEqual(app.events.filter(e => e.event === 'chat:delete').map(e => ({ ...e.payload })), [{ channel: 'server-1-chat', id: 'audit-message' }]);
  remove.dispatchEvent(new app.w.MouseEvent('click', { bubbles: true, shiftKey: true })); await settle();
  assert.equal(app.d.querySelector('.confirm-overlay'), null);
  assert.equal(app.events.filter(e => e.event === 'chat:delete').length, 2);
});

test('aesthetic chat: emoji popup stays within viewport and selection enters composer', async (t) => {
  const app = await ui(t);
  await app.register();
  app.deliver('state', snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', owner: true }]));
  await settle();
  Object.defineProperty(app.w, 'innerWidth', { value: 320, configurable: true });
  Object.defineProperty(app.w, 'innerHeight', { value: 240, configurable: true });
  const picker = app.d.querySelector('#emoji-picker');
  picker.getBoundingClientRect = () => ({ width: 304, height: 200 });
  app.d.querySelector('#btn-emoji').getBoundingClientRect = () => ({ right: 310, top: 180, bottom: 220 });
  app.d.querySelector('#btn-emoji').click();
  assert.equal(picker.style.left, '8px');
  assert.equal(picker.style.top, '32px');
  assert.ok(picker.querySelector('.ep-search'));
  assert.equal(picker.querySelector('.ep-section-title').textContent, 'Frequentes');
  const emoji = picker.querySelector('.ep-emoji').textContent;
  picker.querySelector('.ep-emoji').click();
  assert.ok(app.d.querySelector('#chat-input').value.includes(emoji));
  assert.equal(picker.classList.contains('hidden'), true);
});

test('GIF: botão só com chave, painel busca no KLIPY e o GIF escolhido vai como mensagem', async (t) => {
  const semChave = await ui(t);
  await semChave.register();
  assert.equal(semChave.d.querySelector('#btn-gif').classList.contains('hidden'), true);

  const pedidos = [];
  const media = (n) => ({ url: `https://static.klipy.com/ii/x/${n}`, width: 200, height: 100 });
  const item = (slug) => ({ id: 1, slug, title: 'Gato ' + slug, type: 'gif', file: { sm: { gif: media(slug + '-sm.gif'), webp: media(slug + '-sm.webp') }, md: { gif: media(slug + '.gif'), webp: media(slug + '.webp') } } });
  const app = await ui(t, false, {
    gifKey: 'chave-ui',
    setup(w) {
      const original = w.fetch;
      w.fetch = async (url) => {
        if (!String(url).startsWith('https://api.klipy.com/')) return original(url);
        pedidos.push(String(url));
        return { ok: true, status: 200, json: async () => ({ result: true, data: { data: [item('a'), item('b'), { type: 'ad' }], has_next: false } }) };
      };
    },
  });
  await app.register();
  app.deliver('state', snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', owner: true }]));
  await settle();
  const btn = app.d.querySelector('#btn-gif');
  assert.equal(btn.classList.contains('hidden'), false);
  btn.click(); await settle();
  const picker = app.d.querySelector('#gif-picker');
  assert.equal(picker.classList.contains('hidden'), false);
  assert.equal(picker.querySelector('.gif-search').placeholder, 'Pesquisar no KLIPY');
  assert.match(pedidos[0], /^https:\/\/api\.klipy\.com\/api\/v1\/chave-ui\/gifs\/trending\?/);
  assert.match(pedidos[0], new RegExp('customer_id=' + userId));
  assert.equal(picker.querySelectorAll('.gif-item').length, 2);

  // Fechar e abrir de novo não gasta outra busca.
  btn.click(); btn.click(); await settle();
  assert.equal(pedidos.length, 1);

  picker.querySelectorAll('.gif-item')[1].click(); await settle();
  assert.equal(picker.classList.contains('hidden'), true);
  const sent = app.events.filter((e) => e.event === 'chat:send').at(-1).payload;
  assert.deepEqual({ ...sent.gif }, { slug: 'b', title: 'Gato b', url: 'https://static.klipy.com/ii/x/b.gif', webp: 'https://static.klipy.com/ii/x/b.webp', width: 200, height: 100 });
  assert.equal(sent.channel, 'server-1-chat');

  // Mensagem com GIF aparece como imagem do tamanho certo.
  app.deliver('chat:message', { channel: 'server-1-chat', msg: { id: 'm-gif', authorId: userId, text: '', ts: Date.now(), gif: sent.gif } });
  await settle();
  const img = app.d.querySelector('[data-id="m-gif"] .att-gif img');
  assert.ok(img, 'GIF não apareceu na conversa');
  assert.equal(img.getAttribute('src'), 'https://static.klipy.com/ii/x/b.webp');
  assert.equal(img.width, 200);
});

test('first visit shows the home; login, back and forward preserve the chosen screen and focus', async (t) => {
  const app = await ui(t, false, { mouse: true });
  const root = app.d.documentElement;
  assert.equal(root.classList.contains('show-landing'), true);
  assert.equal(app.events.some((e) => e.event === 'auth'), false);
  assert.equal(app.d.querySelector('.ld-hero .ld-download').classList.contains('hidden'), false);
  app.d.querySelector('.ld-login').click(); await settle();
  assert.equal(root.classList.contains('show-landing'), false);
  assert.equal(app.w.location.hash, '#entrar');
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Entrar');
  assert.equal(app.d.activeElement.id, 'login-name');
  app.d.querySelector('#login-back').click(); await settle();
  assert.equal(app.w.location.hash, '');
  assert.equal(root.classList.contains('show-landing'), true);
  assert.equal(app.d.activeElement.className, 'ld-login');
  app.w.history.forward(); await settle();
  assert.equal(root.classList.contains('show-landing'), false);
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Entrar');
});

test('browser CTA opens registration; switching forms updates deep links and preserves back navigation', async (t) => {
  const app = await ui(t);
  app.d.querySelector('.ld-hero .ld-open').click(); await settle();
  assert.equal(app.w.location.hash, '#criar-conta');
  assert.equal(app.d.querySelector('#login-confirm-password').required, true);
  app.d.querySelector('#login-switch').click(); await settle();
  assert.equal(app.w.location.hash, '#entrar');
  assert.equal(app.d.querySelector('#login-confirm-password').required, false);
  app.d.querySelector('#login-back').click(); await settle();
  assert.equal(app.d.documentElement.classList.contains('show-landing'), true);
});

test('direct registration opens with focus (only with a mouse) and can return home without adding a history entry', async (t) => {
  for (const mouse of [true, false]) {
    const app = await ui(t, false, { hash: '#criar-conta', mouse });
    assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
    assert.equal(app.d.querySelector('#login-submit').textContent, 'Criar conta');
    // No toque o teclado não abre sozinho, para o cartão aparecer inteiro.
    assert.equal(app.d.activeElement.id, mouse ? 'login-name' : '');
    const entries = app.w.history.length;
    app.d.querySelector('#login-back').click(); await settle();
    assert.equal(app.d.documentElement.classList.contains('show-landing'), true);
    assert.equal(app.w.history.length, entries);
  }
});

test('returning visitors, desktop and invitations bypass the home; saved sessions authenticate automatically', async (t) => {
  for (const options of [{ name: 'Ana' }, { desktop: true }, { token: 'saved-token' }, { token: 'expired', expiredToken: true }]) {
    const app = await ui(t, false, options);
    assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
    assert.equal(app.d.documentElement.dataset.landing, undefined);
    if (options.token) assert.equal(app.events.find((e) => e.event === 'auth').payload.token, options.token);
    if (options.expiredToken) {
      assert.equal(app.w.localStorage.getItem('token'), null);
      assert.equal(app.d.querySelector('#login').classList.contains('hidden'), false);
    } else if (options.token) assert.equal(app.d.querySelector('#app').classList.contains('hidden'), false);
  }
  const invited = await ui(t, true);
  assert.equal(invited.d.documentElement.classList.contains('show-landing'), false);
  assert.equal(invited.d.documentElement.dataset.landing, undefined);
  assert.match(invited.d.querySelector('#login-notice').textContent, /Turma convidada/);
});

test('unsupported systems get the browser CTA as primary; download pages open the app directly', async (t) => {
  const app = await ui(t, false, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
  assert.equal(app.d.querySelector('.ld-hero .ld-download').classList.contains('hidden'), true);
  assert.equal(app.d.querySelector('.ld-hero .ld-open').classList.contains('ld-btn-light'), true);
  for (const file of ['baixar.html', 'privacidade.html']) {
    const page = new JSDOM(fs.readFileSync(path.join(publicDir, file), 'utf8'));
    assert.equal(page.window.document.querySelector('.dl-open').getAttribute('href'), '/#criar-conta');
    page.window.close();
  }
});

test('registration errors preserve the form so correcting the password can complete signup', async (t) => {
  const app = await ui(t);
  await app.register('different-password');
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Criar conta');
  assert.equal(app.d.querySelector('#login-confirm-password').required, true);
  assert.equal(app.w.localStorage.getItem('token'), null);
  await app.register();
  assert.equal(app.d.querySelector('#app').classList.contains('hidden'), false);
  assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
  assert.equal(app.d.documentElement.dataset.landing, undefined);
  assert.equal(app.w.location.hash, '');
  app.w.history.back(); await settle();
  assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
});

test('late config respects the chosen form; an empty installation still starts with registration', async (t) => {
  const app = await ui(t, false, { deferConfig: true });
  app.d.querySelector('.ld-hero .ld-open').click();
  app.d.querySelector('#login-switch').click();
  app.releaseConfig(); await settle();
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Entrar');
  const empty = await ui(t, false, { hash: '#entrar', hasOwner: false });
  assert.equal(empty.d.querySelector('#login-submit').textContent, 'Criar conta');
});

test('real UI registers without email, creates two servers, copies a scoped invite and restores drafts when switching', async (t) => {
  const app = await ui(t);
  await app.register();
  const auth = app.events.find((e) => e.event === 'auth').payload;
  assert.equal(auth.name, 'Ana'); assert.equal(auth.confirmPassword, 'test-only'); assert.equal(auth.email, undefined);
  assert.equal(app.d.querySelector('#app').classList.contains('hidden'), false);
  assert.equal(app.d.querySelector('#home-nav').classList.contains('hidden'), false);
  assert.match(app.d.querySelector('.server-welcome').textContent, /Entrar por convite/);
  assert.ok(app.d.querySelector('#btn-switch-server'), 'server switcher must be accessible when the rail is hidden on mobile');
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma um'; await app.clickText('Criar servidor');
  assert.equal(app.d.querySelector('#server-header span').textContent, 'Turma um');
  assert.equal(app.d.querySelector('#server-invite-link').value, 'https://resenhex.test/?invite=' + code);
  await app.clickText('Copiar link'); assert.equal(app.copied, 'https://resenhex.test/?invite=' + code);
  app.d.querySelector('#server-dialog .dialog-close').click();
  app.d.querySelector('#chat-input').value = 'rascunho da turma um';
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma dois'; await app.clickText('Criar servidor');
  app.d.querySelector('#server-dialog .dialog-close').click();
  assert.equal(app.d.querySelectorAll('#server-list .server-entry').length, 2);
  assert.equal(app.d.querySelector('#chat-input').value, '');
  app.d.querySelector('[data-server-id="server-1"]').click(); await settle();
  assert.equal(app.d.querySelector('#server-header span').textContent, 'Turma um');
  assert.equal(app.d.querySelector('#chat-input').value, 'rascunho da turma um');
  app.d.querySelector('#btn-switch-server').click(); await settle();
  assert.match(app.d.querySelector('#server-dialog').textContent, /Turma dois/);
  app.d.querySelector('#server-dialog .dialog-close').click();
  const oldAuthor = { ...person, id: 'b'.repeat(16), name: 'Amigo que saiu' };
  app.deliver('chat:message', { channel: 'server-1-chat', author: oldAuthor, msg: { id: 'historic', authorId: oldAuthor.id, text: 'mensagem preservada', ts: Date.now() } }); await settle();
  const author = app.d.querySelector('[data-id="historic"] .msg-author');
  assert.equal(author.textContent, 'Amigo que saiu');
  author.dispatchEvent(new app.w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
  assert.doesNotMatch(app.d.querySelector('#context-menu').textContent, /Banir|Expulsar|Castigar/);
});

test('server deletion is available to the owner and requires typing its name before sending', async (t) => {
  const app = await ui(t); await app.register();
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma'; await app.clickText('Criar servidor');
  app.d.querySelector('#server-dialog .dialog-close').click();
  app.d.querySelector('#server-header').click(); await settle();
  await app.clickText('Configurações do servidor');
  assert.match(app.d.querySelector('#admin-nav').textContent, /Excluir servidor/);
  await app.clickText('Excluir servidor');
  const input = app.d.querySelector('#delete-server-name');
  const submit = app.d.querySelector('#server-dialog button[type="submit"]');
  assert.equal(submit.disabled, true);
  input.value = 'errado'; input.dispatchEvent(new app.w.Event('input')); assert.equal(submit.disabled, true);
  await app.clickText('Cancelar');
  assert.equal(app.events.some((e) => e.event === 'server:delete'), false);
  await app.clickText('Excluir servidor');
  const confirmed = app.d.querySelector('#delete-server-name');
  confirmed.value = 'Turma'; confirmed.dispatchEvent(new app.w.Event('input'));
  app.d.querySelector('#server-dialog button[type="submit"]').click(); await settle();
  const deleted = app.events.find((e) => e.event === 'server:delete').payload;
  assert.equal(deleted.id, 'server-1'); assert.equal(deleted.name, 'Turma');
  assert.equal(app.d.querySelector('#server-dialog'), null);
  assert.equal(app.d.querySelectorAll('#server-list .server-entry').length, 0);
  assert.equal(app.d.querySelector('#server-settings').classList.contains('hidden'), true);
});

test('invite survives registration, shows the right preview, and joins only after acceptance', async (t) => {
  const app = await ui(t, true);
  assert.match(app.d.querySelector('#login-notice').textContent, /Turma convidada/);
  await app.register();
  assert.equal(app.events.some((e) => e.event === 'server:join'), false);
  assert.match(app.d.querySelector('#server-dialog').textContent, /3 membros/);
  await app.clickText('Entrar no servidor');
  assert.equal(app.events.find((e) => e.event === 'server:join').payload.code, code);
  assert.equal(app.d.querySelector('#server-header span').textContent, 'Turma convidada');
  assert.equal(app.w.location.search, '');
});

test('the call soundboard opens the dedicated upload dialog; ordinary members cannot manage sounds', async (t) => {
  const app = await ui(t); await app.register();
  const s = snapshot('1'.repeat(16), 'Turma', [{ id: '1'.repeat(16), name: 'Turma', owner: true }]);
  s.myPerms.push('MANAGE_SOUNDBOARD', 'SOUNDBOARD');
  app.deliver('state', s); await settle();
  app.d.querySelector('#sc-sounds').click();
  const add = app.d.querySelector('.sb-add'); assert.equal(add.disabled, false);
  assert.equal(app.d.querySelectorAll('.sb-preview').length, 8);
  add.click(); await settle();
  assert.ok(app.d.querySelector('.sound-dialog-card[aria-modal="true"]'));
  assert.match(app.d.querySelector('.sound-limit-note').textContent, /8 segundos/);
  assert.equal(app.d.querySelector('.sound-dialog-card button[type=submit]').disabled, true);
  assert.equal(app.d.querySelector('#app').inert, true);
  app.d.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  assert.equal(app.d.querySelector('.sound-dialog-card'), null);
  assert.equal(!!app.d.querySelector('#app').inert, false);
  app.deliver('state', { ...s, ownerId: 'b'.repeat(16), myPerms: ['SOUNDBOARD', 'CONNECT'] }); await settle();
  app.d.querySelector('#sc-sounds').click(); assert.equal(app.d.querySelector('.sb-add').disabled, true);
});

test('profile background drafts cancel, discard, retry uploads and remove without changing the banner', async (t) => {
  const app = await ui(t); await app.register();
  const { d, w } = app;
  const s = snapshot('1'.repeat(16), 'Turma', [{ id: '1'.repeat(16), name: 'Turma', owner: true }]);
  const me = { ...person, backgroundUrl: '/avatars/previous.gif', backgroundCrop: { x: .5, y: .5, zoom: 1 }, bannerUrl: '/avatars/banner.gif' };
  s.members = [me]; s.people = [me];
  app.deliver('state', s); await settle();
  const requests = [], revoked = [], edits = [];
  let serial = 0, failUpload = true, result = null;
  w.URL.createObjectURL = () => 'blob:https://resenhex.test/' + ++serial;
  w.URL.revokeObjectURL = (url) => revoked.push(url);
  w.PhotoEditor.edit = async (options) => { edits.push(options); return result; };
  w.fetch = async (url, options) => {
    assert.equal(url, '/profile/background');
    requests.push(options);
    if (failUpload) throw new Error('offline');
    me.backgroundUrl = options.method === 'DELETE' ? null : '/avatars/saved.gif';
    me.backgroundCrop = options.method === 'DELETE' ? null : JSON.parse(options.headers['x-background-crop']);
    app.deliver('state', structuredClone(s));
    return { ok: true, json: async () => ({ backgroundUrl: me.backgroundUrl, backgroundCrop: me.backgroundCrop }) };
  };
  const select = async () => {
    const picker = d.querySelector('#profile-background-file');
    Object.defineProperty(picker, 'files', { configurable: true, value: [new w.File(['gif'], 'background.gif', { type: 'image/gif' })] });
    picker.dispatchEvent(new w.Event('change', { bubbles: true })); await settle();
  };
  d.querySelector('#btn-settings').click(); await settle();
  const hint = d.querySelector('#profile-background-status').textContent;
  await select(); // Cancelar o editor restaura a dica e não cria alterações pendentes.
  assert.equal(d.querySelector('#profile-background-status').textContent, hint);
  assert.equal(d.querySelector('#settings-savebar').classList.contains('hidden'), true);

  const crop = { x: .2, y: .8, zoom: 1.5 }, blob = new w.Blob(['gif'], { type: 'image/gif' });
  result = { blob, crop, frame: crop };
  await select();
  assert.equal(edits.at(-1).kind, 'background');
  const draftUrl = d.querySelector('#profile-background').value;
  assert.match(draftUrl, /^blob:/);
  assert.equal(requests.length, 0);
  assert.equal(d.querySelector('#profile-preview-bg img').getAttribute('src'), draftUrl);
  assert.equal(d.querySelector('#profile-background-thumb img').getAttribute('src'), draftUrl);
  d.querySelector('#settings-discard').click(); await settle();
  assert.equal(d.querySelector('#profile-preview-bg img').getAttribute('src'), me.backgroundUrl);
  assert.equal(d.querySelector('#profile-background-thumb img').getAttribute('src'), me.backgroundUrl);
  assert.ok(revoked.includes(draftUrl));

  await select();
  const retryUrl = d.querySelector('#profile-background').value;
  d.querySelector('#settings-save').click(); await settle();
  assert.match(d.querySelector('#settings-status').textContent, /Não foi possível enviar o fundo/);
  assert.equal(d.querySelector('#profile-background').value, retryUrl);
  assert.equal(revoked.includes(retryUrl), false);
  failUpload = false;
  d.querySelector('#settings-save').click(); await settle();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].body, blob);
  assert.deepEqual(JSON.parse(requests[1].headers['x-background-crop']), crop);
  assert.equal(d.querySelector('#profile-background').value, '/avatars/saved.gif');
  assert.ok(revoked.includes(retryUrl));
  assert.equal(d.querySelector('#settings-savebar').classList.contains('hidden'), true);
  assert.equal(d.querySelector('#profile-preview-banner img').getAttribute('src'), me.bannerUrl);

  d.querySelector('#profile-background-remove').click(); await settle();
  assert.equal(d.querySelector('.profile-preview').classList.contains('has-bg'), false);
  assert.equal(requests.length, 2);
  d.querySelector('#settings-discard').click(); await settle();
  assert.equal(d.querySelector('#profile-preview-bg img').getAttribute('src'), '/avatars/saved.gif');
  d.querySelector('#profile-background-remove').click(); await settle();
  d.querySelector('#settings-save').click(); await settle();
  assert.equal(requests.at(-1).method, 'DELETE');
  assert.equal(me.backgroundUrl, null);
  assert.equal(me.backgroundCrop, null);
  assert.equal(d.querySelector('#profile-preview-bg img'), null);
  assert.equal(d.querySelector('#profile-background-thumb img'), null);
  assert.equal(d.querySelector('#profile-banner-thumb img').getAttribute('src'), me.bannerUrl);
  assert.equal(d.querySelector('#profile-preview-banner img').getAttribute('src'), me.bannerUrl);
});

test('animated profile media stays mounted when presence and profile information update', async (t) => {
  const app = await ui(t); await app.register();
  const s = snapshot('1'.repeat(16), 'Turma', [{ id: '1'.repeat(16), name: 'Turma', owner: true }]);
  const me = { ...person, backgroundUrl: '/avatars/background.gif', bannerUrl: '/avatars/banner.gif', avatarUrl: '/avatars/photo.gif' };
  s.members = [me]; s.people = [me];
  app.deliver('state', s); await settle();
  app.d.querySelector('#member-list .member').click(); await settle();
  const card = app.d.querySelector('#profile-card');
  const background = card.querySelector('.profile-bg-image'), banner = card.querySelector('.profile-banner-image'), avatar = card.querySelector('.avatar img');
  assert.ok(background && banner && avatar);
  me.online = false; me.serverMuted = true;
  app.deliver('state', s); await settle();
  assert.equal(card.querySelector('.profile-bg-image'), background);
  assert.equal(card.querySelector('.profile-banner-image'), banner);
  assert.equal(card.querySelector('.avatar img'), avatar);
  assert.equal(card.querySelector('.pc-tag.warn').textContent, 'Silenciado');
  assert.ok(card.querySelector('.pc-status.offline'));
});

test('keyboard shortcuts follow Discord defaults, can be rebound in settings and resolve conflicts', async (t) => {
  const app = await ui(t);
  await app.register();
  const { d, w } = app;
  const key = (code, mods = {}, target = d.body) => {
    const event = new w.KeyboardEvent('keydown', { code, key: /^Key/.test(code) ? code.slice(3).toLowerCase() : code, bubbles: true, cancelable: true, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift });
    target.dispatchEvent(event);
    return event;
  };
  for (const name of ['Turma um', 'Turma dois']) {
    d.querySelector('#btn-add-server').click(); await settle();
    await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
    d.querySelector('#new-server-name').value = name; await app.clickText('Criar servidor');
    d.querySelector('#server-dialog .dialog-close').click();
  }
  // O som de mutar/ensurdecer mostra qual botão o atalho apertou (o fixture não tem permissão de falar).
  const played = [];
  w.Sounds.play = (name) => played.push(name);

  // Padrão do Discord: Ctrl+Shift+M muta, também com o foco na caixa de mensagem.
  assert.equal(key('KeyM', { ctrl: true, shift: true }, d.querySelector('#chat-input')).defaultPrevented, true);
  assert.deepEqual(played.splice(0), ['mute']);
  // Ctrl+Alt+↑/↓ troca de servidor.
  key('ArrowUp', { ctrl: true, alt: true }); await settle();
  assert.equal(d.querySelector('#server-header span').textContent, 'Turma um');
  key('ArrowDown', { ctrl: true, alt: true }); await settle();
  assert.equal(d.querySelector('#server-header span').textContent, 'Turma dois');

  // Ctrl+/ abre a lista de atalhos nas configurações.
  key('Slash', { ctrl: true }); await settle();
  assert.equal(d.querySelector('#settings').classList.contains('hidden'), false);
  assert.equal(d.querySelector('#page-accessibility').classList.contains('hidden'), false);
  const keyButton = (id) => d.querySelector(`#keybind-list [data-action="${id}"]`);
  assert.equal(keyButton('toggleMute').textContent, 'CtrlShiftM');
  assert.equal(keyButton('disconnect').textContent, 'Sem atalho');

  // Letra sozinha é recusada; Ctrl+Alt+M vira o novo atalho de mutar.
  keyButton('toggleMute').click(); await settle();
  key('KeyK'); await settle();
  assert.match(d.querySelector('#keybind-status').textContent, /Ctrl ou Alt/);
  key('KeyM', { ctrl: true, alt: true }); await settle();
  assert.equal(keyButton('toggleMute').textContent, 'CtrlAltM');
  assert.equal(d.querySelector('#settings-savebar').classList.contains('hidden'), false);

  // Conflito: dar Ctrl+Alt+M para ensurdecer tira o atalho de mutar.
  keyButton('toggleDeafen').click(); await settle();
  key('KeyM', { ctrl: true, alt: true }); await settle();
  assert.equal(keyButton('toggleDeafen').textContent, 'CtrlAltM');
  assert.equal(keyButton('toggleMute').textContent, 'Sem atalho');
  assert.match(d.querySelector('#keybind-status').textContent, /saiu de "Ativar ou desativar microfone"/);
  // Esc cancela a edição sem mudar nada.
  keyButton('disconnect').click(); await settle();
  key('Escape'); await settle();
  assert.equal(keyButton('disconnect').textContent, 'Sem atalho');
  assert.equal(d.querySelector('#settings').classList.contains('hidden'), false);

  d.querySelector('#settings-save').click(); await settle();
  const saved = JSON.parse(w.localStorage.getItem('keybinds'));
  assert.equal(saved.toggleMute, '');
  assert.equal(saved.toggleDeafen, 'Ctrl+Alt+KeyM');
  d.querySelector('#settings-close').click(); await settle();

  // O atalho antigo não faz mais nada; o novo ensurdece.
  played.length = 0;
  key('KeyM', { ctrl: true, shift: true });
  assert.deepEqual(played, []);
  key('KeyM', { ctrl: true, alt: true });
  assert.deepEqual(played, ['deafen']);

  // Restaurar padrões volta ao Ctrl+Shift+M.
  key('Comma', { ctrl: true }); await settle();
  d.querySelector('#keybinds-reset').click(); await settle();
  assert.equal(keyButton('toggleMute').textContent, 'CtrlShiftM');
  d.querySelector('#settings-save').click(); await settle();
  assert.equal(JSON.parse(w.localStorage.getItem('keybinds')).toggleMute, 'Ctrl+Shift+KeyM');
});

test('app do Windows: atalhos de voz e push-to-talk valem com a janela atrás de outra', async (t) => {
  const bridge = { setPushToTalk() {}, setKeybinds() {}, onPushToTalk(fn) { bridge.ptt = fn; }, onKeybind(fn) { bridge.keybind = fn; } };
  const app = await voicePreviewApp(t, {
    storage: { voiceFx: 'robo', ptt: JSON.stringify({ enabled: true, code: 'Backquote', label: '`' }) },
    setup: (w) => { w.resenhexDesktop = bridge; },
  });
  const effect = app.effects[0];
  const played = [];
  app.w.Sounds.play = (name) => played.push(name);
  // A página pode achar que tem foco com a janela do app atrás do jogo: vale o que o app diz.
  app.d.querySelector('#btn-mute').focus();
  assert.equal(app.d.hasFocus(), true);
  bridge.ptt(true, true); await settle();
  assert.equal(effect.blocked, false);
  bridge.ptt(false, false); await settle();
  assert.equal(effect.blocked, true, 'soltar a tecla fecha o microfone mesmo com a janela em foco');
  bridge.ptt(true, false); await settle();
  assert.equal(effect.blocked, true, 'com a janela em foco, quem cuida da tecla é a própria página');
  bridge.keybind('toggleMute', true);
  assert.deepEqual(played.splice(0), ['mute']);
  bridge.keybind('toggleMute', false);
  assert.deepEqual(played, [], 'com a janela em foco, o atalho já disparou pela página');
  // Versões do app que não mandam a informação: segue o foco da página.
  bridge.keybind('toggleDeafen');
  assert.deepEqual(played, []);
  app.d.activeElement.blur();
  bridge.keybind('toggleDeafen');
  assert.deepEqual(played, ['deafen']);
});

test('Mudae: card do roll com botão de casar, dono depois do claim e resposta só para quem pediu', async (t) => {
  const status = { command: '$tu', kind: 'status', rollsLeft: 3, rollsMax: 10, rollResetIn: 10 * 60_000, claimReady: true, claimResetIn: 0 };
  const app = await ui(t, false, { reply: { 'chat:send': (p) => (p.text === '$tu' ? { ephemeral: status } : { ok: true }) } });
  await app.register();
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma'; await app.clickText('Criar servidor');
  app.d.querySelector('#server-dialog .dialog-close').click();

  const now = Date.now();
  const card = { id: 176754, name: 'Frieren', series: 'Frieren: Beyond Journey’s End', image: 'https://s4.anilist.co/file/anilistcdn/character/large/b176754.png', value: 1149, rank: 15 };
  const roll = { id: 'roll1', authorId: null, bot: 'mudae', by: userId, command: '$w', ts: now, mudae: { kind: 'roll', card, ownerId: null, expires: now + 45_000, rollsLeft: 2 } };
  app.deliver('chat:message', { channel: 'server-1-chat', msg: roll }); await settle();
  const row = app.d.querySelector('[data-id="roll1"]');
  assert.equal(row.querySelector('.msg-author').textContent, 'Mudae');
  assert.equal(row.querySelector('.bot-tag').textContent, 'BOT');
  assert.match(row.querySelector('.mudae-invocation').textContent, /Ana\s*usou\s*\$w/);
  assert.equal(row.querySelector('.mudae-name').textContent, 'Frieren');
  assert.equal(row.querySelector('.mudae-img').src, card.image);
  assert.match(row.textContent, /2 rolls restantes/);
  assert.match(row.querySelector('.mudae-claim').textContent, /Casar\s*45s/);

  row.querySelector('.mudae-claim').click(); await settle();
  const last = () => JSON.parse(JSON.stringify(app.events.at(-1)));
  assert.deepEqual(last(), { event: 'mudae:claim', payload: { channel: 'server-1-chat', id: 'roll1' } });
  app.deliver('chat:update', { channel: 'server-1-chat', msg: { ...roll, mudae: { ...roll.mudae, ownerId: userId } } });
  app.deliver('chat:message', { channel: 'server-1-chat', msg: { id: 'wed', authorId: null, bot: 'mudae', by: userId, command: null, ts: now + 1, mudae: { kind: 'married', card, ownerId: userId } } });
  await settle();
  const owned = app.d.querySelector('[data-id="roll1"]');
  assert.ok(owned.querySelector('.mudae-card.owned'));
  assert.equal(owned.querySelector('.mudae-claim'), null);
  assert.match(owned.textContent, /Pertence a Ana/);
  const wed = app.d.querySelector('[data-id="wed"]');
  assert.ok(wed.classList.contains('continued'), 'o aviso de casamento fica colado no card');
  assert.match(wed.textContent, /Ana e Frieren agora são casados/);

  const input = app.d.querySelector('#chat-input');
  input.value = '$tu';
  input.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(last(), { event: 'chat:send', payload: { channel: 'server-1-chat', text: '$tu', attachments: [] } });
  const only = app.d.querySelector('.msg.ephemeral');
  assert.match(only.textContent, /Você tem 3 de 10 rolls nesta janela de 30 minutos\. Eles voltam em 10 min\./);
  assert.match(only.textContent, /pode casar/);
  assert.match(only.textContent, /Só você pode ver esta mensagem/);
  [...only.querySelectorAll('button')].find((b) => b.textContent === 'Ignorar').click(); await settle();
  assert.equal(app.d.querySelector('.msg.ephemeral'), null);
});

test('Salão do Mudae: tela própria com palco, mesa ao vivo, presença, álbum e volta ao chat comum', async (t) => {
  const album = { ownerId: userId, total: 1, value: 1149, favorite: null, chars: [] };
  const app = await ui(t, false, { reply: { 'mudae:presence': () => ({ ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 600_000, claimReady: true, claimResetIn: 0 }), 'mudae:harem': () => album, 'mudae:profile': () => ({ summary: null }) } });
  await app.register();
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma'; await app.clickText('Criar servidor');
  app.d.querySelector('#server-dialog .dialog-close').click();
  const st = snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', icon: null, owner: true }]);
  st.channels.push({ id: 'server-1-salon', name: 'salão-mudae', type: 'text', mudae: true, topic: '', categoryId: 'text', private: false, allowedRoles: [] });
  app.deliver('state', st); await settle();

  const entry = [...app.d.querySelectorAll('.channel-entry')].find((b) => b.textContent.includes('salão-mudae'));
  assert.match(entry.getAttribute('aria-label'), /^Salão do Mudae/);
  entry.click(); await settle();
  const last = (event) => JSON.parse(JSON.stringify(app.events.filter((e) => e.event === event).at(-1) || null));
  assert.deepEqual(last('mudae:presence').payload, { channel: 'server-1-salon' });
  assert.equal(app.d.querySelector('#salon-view').classList.contains('hidden'), false);
  assert.ok(app.d.querySelector('#main').classList.contains('salon-mode'));
  assert.ok(app.d.querySelector('#app').classList.contains('hide-members'), 'a coluna do chat fica no lugar da lista de membros');
  assert.deepEqual([...app.d.querySelectorAll('.salon-tab')].map((b) => b.textContent), ['Mesa', 'Meu harem', 'Ranking']);
  assert.equal(app.d.querySelector('.salon-status').textContent, '9/10 rolls · casamento disponível 💍');
  assert.match(app.d.querySelector('.salon-stage-caption').textContent, /Rode para começar/);
  assert.equal(app.d.querySelector('.salon-gacha'), null, 'o palco não cria a camada 3D');
  assert.equal(app.d.querySelector('.salon-stage canvas'), null, 'o fundo não usa canvas');

  // Um roll de outra pessoa chega com o palco livre: vai para o palco e para a mesa ao vivo.
  const now = Date.now();
  const card = { id: 176754, name: 'Frieren', series: 'Frieren', image: 'https://s4.anilist.co/x.png', value: 1149, rank: 15, rarity: 'legendary' };
  const friend = { ...person, id: 'c'.repeat(16), name: 'Caio' };
  const roll = { id: 'roll1', authorId: null, bot: 'mudae', by: friend.id, command: '$m', ts: now, mudae: { kind: 'roll', card, ownerId: null, revealAt: now - 400, priorityUntil: now + 2600, expires: now + 44_600, rollsLeft: 8 } };
  app.deliver('chat:message', { channel: 'server-1-salon', msg: roll }); await settle();
  assert.equal(app.d.querySelector('.salon-card-slot .salon-card-name').textContent, 'Frieren');
  assert.ok(app.d.querySelector('.salon-card-slot .salon-card').classList.contains('r-legendary'));
  const claim = app.d.querySelector('.salon-claim');
  assert.equal(claim.disabled, true, 'quem rodou ainda tem prioridade');
  assert.match(app.d.querySelector('.salon-claim-caption').textContent, /prioridade de/);
  assert.equal(app.d.querySelectorAll('.salon-live-strip .salon-card').length, 1);
  assert.ok(app.d.querySelector('.mudae-roll-line'), 'no chat do Salão o roll vira uma linha');

  // Presença: a aba "No salão" mostra as pessoas com os rolls.
  app.deliver('mudae:presence', { channel: 'server-1-salon', people: [{ id: userId, rollsLeft: 9, rollsMax: 10, claimReady: true, rollResetIn: 1, claimResetIn: 1 }] }); await settle();
  assert.equal(app.d.querySelector('.salon-count').textContent, '1');
  [...app.d.querySelectorAll('.salon-side-tab')].find((b) => b.textContent.startsWith('No salão')).click(); await settle();
  assert.equal(app.d.querySelectorAll('#salon-people .salon-dots span.on').length, 9);
  assert.ok(app.d.querySelector('#chat-view').classList.contains('salon-people-open'));

  // $mm no chat do Salão abre o álbum em vez de postar.
  [...app.d.querySelectorAll('.salon-side-tab')].find((b) => b.textContent === 'Chat').click(); await settle();
  const input = app.d.querySelector('#chat-input');
  input.value = '$mm';
  input.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(last('mudae:harem').payload, { ownerId: userId });
  assert.equal(app.events.some((e) => e.event === 'chat:send' && e.payload.text === '$mm'), false);
  assert.match(app.d.querySelector('.salon-album').textContent, /Seu harem/);

  // Voltar ao canal comum desmonta o Salão e devolve o chat inteiro.
  [...app.d.querySelectorAll('.salon-side-tab')].find((b) => b.textContent.startsWith('No salão')).click(); await settle();
  [...app.d.querySelectorAll('.channel-entry')].find((b) => b.textContent.includes('geral')).click(); await settle();
  assert.deepEqual(last('mudae:presence').payload, { channel: null });
  assert.equal(app.d.querySelector('#salon-view').classList.contains('hidden'), true);
  assert.equal(app.d.querySelector('#main').classList.contains('salon-mode'), false);
  assert.equal(app.d.querySelector('#chat-view').classList.contains('salon-people-open'), false);
  assert.equal(app.d.querySelector('#salon-side-tabs'), null);
});

test('Salão do Mudae: mesmo com WebGL disponível, o palco usa a revelação sem carregar 3D', async (t) => {
  const warnings = [];
  let webglContexts = 0;
  const app = await ui(t, false, {
    // A capacidade de usar WebGL não deve ativar a antiga cena nem tentar carregá-la.
    setup: (w) => {
      w.WebGL2RenderingContext = function WebGL2RenderingContext() {};
      w.console.warn = (...args) => warnings.push(args.map(String).join(' '));
      const getContext = w.HTMLCanvasElement.prototype.getContext;
      w.HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (String(kind).includes('webgl')) { webglContexts++; return null; }
        return getContext.call(this, kind, ...args);
      };
    },
    reply: { 'mudae:presence': () => ({ ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 600_000, claimReady: true, claimResetIn: 0 }), 'mudae:profile': () => ({ summary: null }) },
  });
  await app.register();
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma'; await app.clickText('Criar servidor');
  app.d.querySelector('#server-dialog .dialog-close').click();
  const st = snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', icon: null, owner: true }]);
  st.channels.push({ id: 'server-1-salon', name: 'salão-mudae', type: 'text', mudae: true, topic: '', categoryId: 'text', private: false, allowedRoles: [] });
  app.deliver('state', st); await settle();
  [...app.d.querySelectorAll('.channel-entry')].find((b) => b.textContent.includes('salão-mudae')).click(); await settle(); await settle();
  assert.equal(app.d.querySelector('.salon-stage').classList.contains('gacha'), false);
  assert.equal(app.d.querySelector('.salon-gacha'), null);
  assert.equal(webglContexts, 0, 'não solicita contexto WebGL');
  assert.equal(warnings.length, 0, 'não tenta importar a antiga cena 3D');

  const now = Date.now();
  const card = { id: 176754, name: 'Frieren', series: 'Frieren', image: 'https://s4.anilist.co/x.png', value: 1149, rank: 15, rarity: 'epic' };
  const roll = { id: 'roll1', authorId: null, bot: 'mudae', by: 'c'.repeat(16), command: '$m', ts: now, mudae: { kind: 'roll', card, ownerId: null, revealAt: now + 1500, priorityUntil: now + 4500, expires: now + 46_500, rollsLeft: 8 } };
  app.deliver('chat:message', { channel: 'server-1-salon', msg: roll }); await settle();
  assert.equal(app.d.querySelector('.salon-card-ghost'), null, 'sem cena 3D não há cápsula');
  assert.equal(app.d.querySelector('.salon-card-slot .salon-card-name').textContent, 'Frieren');
});

test('Mudae no modo simplificado: o Salão vira chat com cards completos que esperam o giro e a vez de quem rodou', async (t) => {
  const app = await ui(t, false, { storage: { mudaeSimples: '1' } });
  await app.register();
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma'; await app.clickText('Criar servidor');
  app.d.querySelector('#server-dialog .dialog-close').click();
  const st = snapshot('server-1', 'Turma', [{ id: 'server-1', name: 'Turma', icon: null, owner: true }]);
  st.channels.push({ id: 'server-1-salon', name: 'salão-mudae', type: 'text', mudae: true, topic: '', categoryId: 'text', private: false, allowedRoles: [] });
  app.deliver('state', st); await settle();
  [...app.d.querySelectorAll('.channel-entry')].find((b) => b.textContent.includes('salão-mudae')).click(); await settle();
  assert.equal(app.d.querySelector('#salon-view').classList.contains('hidden'), true, 'sem a tela do Salão');
  assert.equal(app.d.querySelector('#btn-salon').classList.contains('hidden'), false, 'com o botão para voltar ao Salão');
  assert.equal(app.events.some((e) => e.event === 'mudae:presence'), false);

  const now = Date.now();
  const card = { id: 'g1', name: 'Geralt of Rivia', series: 'The Witcher', image: 'https://images.igdb.com/x.jpg', value: 900, rank: 4, rarity: 'legendary', source: 'g' };
  const roll = { id: 'r1', authorId: null, bot: 'mudae', by: 'c'.repeat(16), command: '$wg', ts: now, mudae: { kind: 'roll', card, ownerId: null, revealAt: now + 400, priorityUntil: now + 1000, expires: now + 45_400, rollsLeft: 5 } };
  app.deliver('chat:message', { channel: 'server-1-salon', msg: roll }); await settle();
  const button = () => app.d.querySelector('[data-id="r1"] .mudae-claim');
  assert.ok(app.d.querySelector('[data-id="r1"] .mudae-card'), 'card completo no chat, como no Mudae original');
  assert.match(app.d.querySelector('[data-id="r1"] .mudae-series').textContent, /🎮 The Witcher/);
  assert.equal(app.d.querySelector('[data-id="r1"] .mudae-rarity-tag').textContent, 'Lendário');
  assert.match(button().textContent, /Girando…/);
  assert.equal(button().disabled, true);
  await new Promise((r) => setTimeout(r, 650));
  assert.match(button().textContent, /Vez de/);
  assert.equal(button().disabled, true);
  await new Promise((r) => setTimeout(r, 700));
  assert.match(button().textContent, /^Casar/);
  assert.equal(button().disabled, false);

  // Voltar ao Salão pelo botão do topo.
  app.d.querySelector('#btn-salon').click(); await settle();
  assert.equal(app.w.localStorage.getItem('mudaeSimples'), '0');
  assert.equal(app.d.querySelector('#salon-view').classList.contains('hidden'), false);
  assert.ok(app.d.querySelector('[data-id="r1"] .mudae-roll-line'), 'no Salão o roll vira linha compacta');
});

// Respostas falsas para as rotas de recuperação; guarda o corpo de cada pedido.
function recoveryFetch(replies) {
  const requests = [];
  return {
    requests,
    setup(w) {
      const original = w.fetch;
      w.fetch = async (url, request) => {
        if (!replies[url]) return original(url, request);
        requests.push({ url, body: JSON.parse(request.body) });
        return { json: async () => replies[url] };
      };
    },
  };
}

test('cadastro mostra o e-mail opcional com o aviso e envia o que foi digitado', async (t) => {
  const app = await ui(t, false, { hash: '#criar-conta', mailEnabled: true });
  const label = app.d.querySelector('#login-email-label');
  assert.equal(label.classList.contains('hidden'), false);
  assert.match(label.textContent, /opcional/);
  assert.match(label.textContent, /não dá para recuperar a conta/);
  assert.match(app.d.querySelector('#login-subtitle').textContent, /e-mail é opcional/);
  assert.equal(app.d.querySelector('#login-forgot').classList.contains('hidden'), true);
  app.d.querySelector('#login-email').value = ' ana@exemplo.com ';
  await app.register();
  assert.equal(app.events.find((e) => e.event === 'auth').payload.email, 'ana@exemplo.com');
});

test('sem envio de e-mail, o login não mostra o campo de e-mail nem o Esqueci a senha', async (t) => {
  const app = await ui(t, false, { hash: '#criar-conta' });
  assert.equal(app.d.querySelector('#login-email-label').classList.contains('hidden'), true);
  app.d.querySelector('#login-switch').click(); await settle();
  assert.equal(app.d.querySelector('#login-forgot').classList.contains('hidden'), true);
});

test('Esqueci a senha pede o e-mail, envia uma vez e mostra a mesma resposta para qualquer e-mail', async (t) => {
  const fake = recoveryFetch({ '/password/forgot': { ok: true } });
  const app = await ui(t, false, { hash: '#entrar', mailEnabled: true, setup: fake.setup });
  const link = app.d.querySelector('#login-forgot');
  assert.equal(link.classList.contains('hidden'), false);
  assert.equal(link.getAttribute('href'), '#esqueci');
  app.w.location.hash = '#esqueci'; await settle();
  assert.equal(app.d.querySelector('#forgot-form').classList.contains('hidden'), false);
  assert.equal(app.d.querySelector('#login-form').classList.contains('hidden'), true);
  const form = app.d.querySelector('#forgot-form');
  app.d.querySelector('#forgot-email').value = 'errado';
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.match(app.d.querySelector('#forgot-status').textContent, /e-mail válido/);
  assert.equal(fake.requests.length, 0);
  app.d.querySelector('#forgot-email').value = ' ana@exemplo.com ';
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(fake.requests, [{ url: '/password/forgot', body: { email: 'ana@exemplo.com' } }]);
  assert.match(app.d.querySelector('#forgot-status').textContent, /Se houver uma conta com esse e-mail/);
});

test('link de senha nova abre Criar senha nova, tira o token do endereço e entra com a sessão nova', async (t) => {
  const token = 'c'.repeat(64);
  const fake = recoveryFetch({ '/password/reset': { ok: true, token: 'fake-ui-token', name: 'Ana' } });
  const app = await ui(t, false, { hash: '#redefinir=' + token, token: 'sessao-antiga', mailEnabled: true, setup: fake.setup });
  assert.equal(app.w.location.hash, '#nova-senha');
  assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
  assert.equal(app.d.querySelector('#reset-form').classList.contains('hidden'), false);
  assert.equal(app.events.some((e) => e.event === 'auth'), false, 'não entra com a sessão guardada antes de criar a senha');
  const form = app.d.querySelector('#reset-form');
  app.d.querySelector('#reset-password').value = 'nova1';
  app.d.querySelector('#reset-confirm').value = 'nova2';
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.match(app.d.querySelector('#reset-status').textContent, /não coincidem/);
  assert.equal(fake.requests.length, 0);
  app.d.querySelector('#reset-confirm').value = 'nova1';
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(fake.requests, [{ url: '/password/reset', body: { token, next: 'nova1', confirm: 'nova1' } }]);
  assert.deepEqual(app.events.find((e) => e.event === 'auth').payload.token, 'fake-ui-token');
  assert.equal(app.d.querySelector('#app').classList.contains('hidden'), false);
  assert.equal(app.w.location.hash, '');
});

test('link de confirmação confirma o e-mail e abre o login de quem não está conectado', async (t) => {
  const token = 'd'.repeat(64);
  const fake = recoveryFetch({ '/email/confirm': { ok: true } });
  const app = await ui(t, false, { hash: '#confirmar=' + token, mailEnabled: true, setup: fake.setup });
  await settle();
  assert.deepEqual(fake.requests, [{ url: '/email/confirm', body: { token } }]);
  assert.equal(app.w.location.hash, '#entrar');
  assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
  assert.match(app.d.querySelector('#login-notice').textContent, /E-mail confirmado/);
});

test('Minha conta: adicionar o e-mail não pede a senha atual e mostra se está confirmado', async (t) => {
  const app = await ui(t, false, { mailEnabled: true, reply: {
    'account:email': (payload) => payload.email ? { ok: true, email: payload.email, emailVerified: false, sent: true } : { ok: true, email: null, emailVerified: false, sent: false },
    'account:email:resend': () => ({ ok: true, email: 'ana@exemplo.com', emailVerified: false, sent: true }),
  } });
  await app.register();
  app.d.querySelector('#btn-settings').click(); await settle();
  app.d.querySelector('#tab-account').click(); await settle();
  const form = app.d.querySelector('#account-email-form');
  const state = app.d.querySelector('#account-email-state');
  assert.equal(form.classList.contains('hidden'), false);
  assert.match(state.textContent, /não dá para recuperar a conta/);
  assert.equal(app.d.querySelector('#account-email-remove').classList.contains('hidden'), true);

  assert.equal(app.d.querySelector('#account-email-password'), null, 'sem campo de senha atual');
  assert.doesNotMatch(form.textContent, /senha atual/i);
  app.d.querySelector('#account-email-input').value = 'ana@exemplo.com';
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(app.events.find((e) => e.event === 'account:email').payload)), { email: 'ana@exemplo.com' });
  assert.match(app.d.querySelector('#account-email-status').textContent, /link de confirmação/);
  assert.match(state.textContent, /Não confirmado/);
  assert.equal(app.d.querySelector('#account-email-resend').classList.contains('hidden'), false);
  assert.equal(app.d.querySelector('#account-email-remove').classList.contains('hidden'), false);

  app.d.querySelector('#account-email-resend').click(); await settle();
  assert.match(app.d.querySelector('#account-email-status').textContent, /outro link/);

  // O link foi aberto em outro aparelho: o servidor avisa esta sessão.
  app.deliver('account:email', { email: 'ana@exemplo.com', emailVerified: true });
  await settle();
  assert.match(state.textContent, /Confirmado/);
  assert.equal(app.d.querySelector('#account-email-resend').classList.contains('hidden'), true);
});

test('Minha conta: sem envio de e-mail no servidor, a seção fica escondida', async (t) => {
  const app = await ui(t);
  await app.register();
  app.d.querySelector('#btn-settings').click(); await settle();
  app.d.querySelector('#tab-account').click(); await settle();
  assert.equal(app.d.querySelector('#account-email-form').classList.contains('hidden'), true);
});

test('cadastro com e-mail avisa se o link de confirmação saiu ou se é preciso reenviar', async (t) => {
  const app = await ui(t, false, { hash: '#criar-conta', mailEnabled: true });
  app.d.querySelector('#login-email').value = 'ana@exemplo.com';
  await app.register();
  app.deliver('account:email', { email: 'ana@exemplo.com', emailVerified: false, signup: true, sent: true });
  await settle();
  assert.match(app.d.querySelector('#toast').textContent, /Enviamos um link para ana@exemplo\.com/);
  app.deliver('account:email', { email: 'ana@exemplo.com', emailVerified: false, signup: true, sent: false });
  await settle();
  assert.match(app.d.querySelector('#toast').textContent, /Não conseguimos enviar.*Minha conta/);
  app.d.querySelector('#btn-settings').click(); await settle();
  app.d.querySelector('#tab-account').click(); await settle();
  const state = app.d.querySelector('#account-email-state').textContent;
  assert.match(state, /Não confirmado/);
  assert.doesNotMatch(state, /enviamos/i, 'não afirma que o e-mail saiu');
});

test('link de senha nova num navegador conectado: Pedir outro link e Voltar para o login trocam o cartão', async (t) => {
  const fake = recoveryFetch({ '/password/reset': { error: 'Este link expirou ou já foi usado. Peça outro em Esqueci a senha.' } });
  const app = await ui(t, false, { hash: '#redefinir=' + 'e'.repeat(64), token: 'sessao-antiga', mailEnabled: true, setup: fake.setup });
  assert.equal(app.d.querySelector('#reset-form').classList.contains('hidden'), false);
  app.w.location.hash = '#esqueci'; await settle();
  assert.equal(app.d.querySelector('#forgot-form').classList.contains('hidden'), false);
  assert.equal(app.d.querySelector('#reset-form').classList.contains('hidden'), true);
  app.w.location.hash = '#entrar'; await settle();
  assert.equal(app.d.querySelector('#login-form').classList.contains('hidden'), false);
  assert.equal(app.d.querySelector('#forgot-form').classList.contains('hidden'), true);
  assert.equal(app.events.some((e) => e.event === 'auth'), false);
});

test('Minha conta: trocar a senha não pede a senha atual', async (t) => {
  const app = await ui(t, false, { reply: { 'account:password': () => ({ ok: true }) } });
  await app.register();
  app.d.querySelector('#btn-settings').click(); await settle();
  app.d.querySelector('#tab-account').click(); await settle();
  const form = app.d.querySelector('#account-password-form');
  assert.equal(app.d.querySelector('#account-password-current'), null, 'sem campo de senha atual');
  assert.doesNotMatch(form.textContent, /senha atual/i);
  app.d.querySelector('#account-password-next').value = 'nova1';
  app.d.querySelector('#account-password-confirm').value = 'nova2';
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.match(app.d.querySelector('#account-password-status').textContent, /não coincidem/);
  assert.equal(app.events.some((e) => e.event === 'account:password'), false);
  app.d.querySelector('#account-password-confirm').value = 'nova1';
  form.dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(app.events.find((e) => e.event === 'account:password').payload)), { next: 'nova1', confirm: 'nova1' });
  assert.match(app.d.querySelector('#account-password-status').textContent, /Senha trocada/);
});
