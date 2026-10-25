const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPatch } = require('../public/state-patch');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { JSDOM } = require('jsdom');
const { io } = require('socket.io-client');

// Prévia da transmissão: quem transmite manda fotos pequenas da tela; quem está na sala e não assiste as vê.
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'stream-preview.js'), 'utf8');
const JPEG = (n = 1) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, ...new Array(80).fill(n), 0xff, 0xd9]);
const WEBP = (n = 1) => new Uint8Array([...Buffer.from('RIFF'), 92, 0, 0, 0, ...Buffer.from('WEBPVP8 '), n, ...new Array(80).fill(n)]);

function harness({ room = ['me', 'friend'], viewers = [], webp = true } = {}) {
  const dom = new JSDOM('<body><div class="tile screen"><video></video></div></body>', { url: 'https://resenhex.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  // Relógio e temporizadores controlados pelo teste.
  let clock = 0, seq = 0;
  const timers = new Map();
  w.Date.now = () => clock;
  w.setTimeout = (fn, ms = 0) => { const id = ++seq; timers.set(id, { fn, at: clock + ms }); return id; };
  w.clearTimeout = (id) => timers.delete(id);
  w.requestAnimationFrame = (fn) => { fn(); return 0; };
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
  async function advance(ms) {
    const end = clock + ms;
    await settle();
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      clock = next[1].at;
      next[1].fn();
      await settle();
    }
    clock = end;
  }
  // Captura e codificação falsas: cada foto sai com o "brilho" atual da tela.
  const screen = { brightness: 120, frame: 1 };
  const encoded = [];
  w.MediaStream = class { constructor(tracks) { this.tracks = tracks; } };
  const realCreate = w.document.createElement.bind(w.document);
  w.document.createElement = (tag, ...rest) => {
    if (tag === 'video') return { videoWidth: 1920, videoHeight: 1080, readyState: 4, muted: false, play: () => Promise.resolve(), pause() {}, addEventListener() {} };
    if (tag === 'canvas') {
      const canvas = {
        width: 0, height: 0,
        getContext: () => ({ drawImage() {}, getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(screen.brightness) }) }),
        // Sem WebP (Safari), o navegador devolve PNG.
        toBlob: (done, type) => {
          const made = type === 'image/webp' && !webp ? 'image/png' : type;
          encoded.push(made);
          done({ size: 90, type: made, arrayBuffer: async () => (made === 'image/webp' ? WEBP : JPEG)(screen.frame).buffer });
        },
      };
      return canvas;
    }
    return realCreate(tag, ...rest);
  };
  const urls = new Set();
  let urlSeq = 0;
  const received = [];
  w.URL.createObjectURL = (blob) => { const url = 'blob:preview-' + ++urlSeq; urls.add(url); received.push(blob.type); return url; };
  w.URL.revokeObjectURL = (url) => urls.delete(url);
  w.Image = class { decode() { return Promise.resolve(); } };

  const sent = [], handlers = {};
  const socket = { connected: true, emit: (event, payload) => sent.push({ event, payload }), on: (event, fn) => { handlers[event] = fn; } };
  const track = { readyState: 'live' };
  const state = { me: { sid: 'me' }, voiceChannel: 'room', sharePaused: false, local: { screen: { getVideoTracks: () => [track] } } };
  const entries = { me: { sid: 'me', sharing: true, viewers }, friend: { sid: 'friend', sharing: true, viewers: [] } };
  const painted = [];
  const el = (tag, props = {}, ...children) => {
    const node = realCreate(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') node.className = v; else if (k === 'ariaHidden') node.setAttribute('aria-hidden', v); else node[k] = v; }
    node.append(...children);
    return node;
  };
  w.eval(source);
  const preview = w.StreamPreview({ state, socket, el, voiceEntry: (sid) => entries[sid], roomEntries: () => room.map((sid) => entries[sid] || { sid }), onPreview: (sid) => painted.push(sid) });
  const previews = () => sent.filter((s) => s.event === 'screen:preview');
  return { w, preview, state, entries, track, screen, sent, previews, handlers, painted, urls, advance, timers, encoded, received };
}

test('quem transmite manda uma foto WebP logo no começo e outra a cada 15 s enquanto alguém não assiste', async () => {
  const h = harness();
  h.preview.sync();
  await h.advance(1400);
  assert.equal(h.previews().length, 0, 'espera os primeiros quadros');
  await h.advance(200);
  assert.equal(h.previews().length, 1);
  assert.equal(Buffer.from(h.previews()[0].payload.image).toString('latin1', 8, 12), 'WEBP');
  h.screen.frame = 2;
  await h.advance(14899); // a primeira saiu em 1,5 s: a segunda vem em 16,5 s
  assert.equal(h.previews().length, 1);
  await h.advance(1);
  assert.equal(h.previews().length, 2);
  // Tela parada: a foto sairia igual e não é mandada de novo.
  await h.advance(15000);
  assert.equal(h.previews().length, 2);
  // Conexão nova: o servidor não tem a última foto, então ela vai de novo.
  h.handlers.connect();
  await h.advance(15000);
  assert.equal(h.previews().length, 3);
  assert.ok(h.encoded.every((type) => type === 'image/webp'));
});

test('sem WebP no navegador (Safari), a prévia sai em JPEG e continua assim', async () => {
  const h = harness({ webp: false });
  h.preview.sync();
  await h.advance(1500);
  h.screen.frame = 2;
  await h.advance(15000);
  assert.equal(h.previews().length, 2);
  for (const { payload } of h.previews()) assert.deepEqual([...new Uint8Array(payload.image)].slice(0, 3), [0xff, 0xd8, 0xff]);
  assert.deepEqual(h.encoded, ['image/png', 'image/jpeg', 'image/jpeg'], 'só a primeira tentativa é em WebP');
});

test('sem ninguém para ver a prévia (sozinho, todos assistindo ou pausada), nenhuma foto sai', async () => {
  const alone = harness({ room: ['me'] });
  alone.preview.sync();
  await alone.advance(30000);
  assert.equal(alone.previews().length, 0);
  assert.equal(alone.timers.size, 0);

  const watched = harness({ viewers: ['friend'] });
  watched.preview.sync();
  await watched.advance(30000);
  assert.equal(watched.previews().length, 0);
  // A amiga para de assistir: a foto sai logo (respeitando 3 s desde a última).
  watched.entries.me.viewers = [];
  watched.preview.sync();
  await watched.advance(10);
  assert.equal(watched.previews().length, 1);

  const paused = harness();
  paused.state.sharePaused = true;
  paused.preview.sync();
  await paused.advance(30000);
  assert.equal(paused.previews().length, 0);
});

test('os primeiros quadros pretos não viram prévia, a não ser que a tela continue preta', async () => {
  const h = harness();
  h.screen.brightness = 0;
  h.preview.sync();
  await h.advance(1500 + 3 * 1000 - 1);
  assert.equal(h.previews().length, 0);
  await h.advance(1);
  assert.equal(h.previews().length, 1, 'depois de três tentativas manda assim mesmo');
});

test('quem recebe guarda a foto, troca com esmaecido e apaga quando a transmissão acaba', async () => {
  const h = harness();
  const tile = h.w.document.querySelector('.tile');
  h.handlers['screen:preview']({ sid: 'friend', image: WEBP(1).buffer });
  await h.advance(0);
  assert.deepEqual(h.painted, ['friend']);
  assert.deepEqual(h.received, ['image/webp']);
  h.preview.paint(tile, 'friend', true);
  assert.ok(tile.classList.contains('has-preview'));
  const box = tile.querySelector('.stream-preview');
  assert.equal(box.previousElementSibling.tagName, 'VIDEO', 'a prévia fica logo acima do vídeo, abaixo dos avisos');
  assert.ok(box.classList.contains('shown'));
  assert.equal(box.querySelectorAll('.sp-frame.in').length, 1);
  assert.equal(box.querySelectorAll('img').length, 2);

  await h.advance(10);
  h.handlers['screen:preview']({ sid: 'friend', image: JPEG(2).buffer });
  await h.advance(0);
  assert.equal(h.received[1], 'image/jpeg');
  h.preview.paint(tile, 'friend', true);
  assert.equal(box.querySelectorAll('.sp-frame').length, 2, 'a foto anterior fica embaixo durante o esmaecido');
  await h.advance(900);
  assert.equal(box.querySelectorAll('.sp-frame').length, 1);
  await h.advance(2000);
  assert.equal(h.urls.size, 1, 'a foto antiga é liberada');
  // A foto guardada no servidor (de quando parei de assistir) não passa por cima de uma mais nova.
  h.handlers['screen:preview']({ sid: 'friend', image: JPEG(9).buffer, saved: true });
  await h.advance(0);
  assert.deepEqual(h.painted, ['friend', 'friend'], 'a guardada foi ignorada');
  await h.advance(2000);

  // Com a janela escondida a troca é direta: a foto não fica invisível esperando a janela aparecer.
  Object.defineProperty(h.w.document, 'hidden', { configurable: true, get: () => true });
  h.handlers['screen:preview']({ sid: 'friend', image: JPEG(3).buffer });
  await h.advance(0);
  h.preview.paint(tile, 'friend', true);
  assert.equal(box.querySelectorAll('.sp-frame').length, 1);
  assert.equal(box.querySelectorAll('.sp-frame.in').length, 1);
  delete h.w.document.hidden;
  await h.advance(2000);

  // Assistindo ao vivo: a prévia some.
  h.preview.paint(tile, 'friend', false);
  assert.ok(!tile.classList.contains('has-preview'));
  assert.ok(!box.classList.contains('shown'));

  h.entries.friend.sharing = false;
  h.preview.prune();
  assert.equal(h.preview.has('friend'), false);
  await h.advance(2000);
  assert.equal(h.urls.size, 0);
});

test('o servidor repassa a prévia só a quem está na sala e não assiste, recusa o que não é foto e entrega a última a quem entra', { timeout: 40000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-preview-test-'));
  const port = 38000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', ACCESS_PASSWORD_B64: '' }, stdio: 'ignore' });
  const clients = [];
  const emit = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
  const until = async (check, tries = 100) => { for (let i = 0; i < tries; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 50)); } throw Error('condition timed out'); };
  try {
    await until(async () => { try { return (await fetch(base + '/config')).ok; } catch { return false; } }, 300);
    async function connect(name) {
      const socket = io(base, { autoConnect: false, reconnection: false });
      clients.push(socket);
      socket.previews = [];
      socket.on('screen:preview', (event) => socket.previews.push(event));
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
      socket.on('state', (s) => { socket.snapshot = s; }); socket.on('state:patch', (p) => applyPatch(socket.snapshot, p));
      const auth = await emit(socket, 'auth', { mode: 'register', name, password: 'test-only-2026', confirmPassword: 'test-only-2026' });
      assert.ok(auth.accountId);
      if (!auth.serverId) {
        const invite = await emit(clients[0], 'server:invite', {});
        assert.ok(!(await emit(socket, 'server:join', { code: invite.code })).error);
      }
      return socket;
    }
    const host = await connect('Host'), viewer = await connect('Viewer'), outsider = await connect('Elsewhere');
    await until(() => host.snapshot);
    const rooms = host.snapshot.channels.filter((c) => c.type === 'voice');
    await emit(host, 'voice:join', { channel: rooms[0].id });
    await emit(viewer, 'voice:join', { channel: rooms[0].id });
    await emit(outsider, 'voice:join', { channel: rooms[1].id });
    const image = Buffer.from(JPEG(7));

    assert.ok((await emit(host, 'screen:preview', { image })).error, 'só quem está transmitindo');
    await emit(host, 'voice:state', { sharing: true });
    assert.ok((await emit(host, 'screen:preview', { image: Buffer.from('<svg/>'.padEnd(100)) })).error, 'só JPEG ou WebP');
    assert.ok((await emit(host, 'screen:preview', { image: Buffer.from('RIFF\0\0\0\0WAVE'.padEnd(100)) })).error, 'RIFF que não é WebP');
    assert.ok((await emit(host, 'screen:preview', { image: 'data:image/jpeg;base64,/9j/' })).error, 'só bytes');
    assert.ok((await emit(host, 'screen:preview', { image: Buffer.concat([image, Buffer.alloc(200_000)]) })).error, 'até 200 KB');
    assert.ok((await emit(host, 'screen:preview', { image })).ok);
    await until(() => viewer.previews.length === 1);
    assert.equal(viewer.previews[0].sid, host.id);
    assert.deepEqual(Buffer.from(viewer.previews[0].image), image);
    assert.equal(host.previews.length, 0, 'quem transmite não recebe a própria foto');
    assert.equal(outsider.previews.length, 0, 'outra sala não recebe');

    // Quem assiste já vê o vídeo e não recebe prévias; ao parar de assistir, recebe a última guardada.
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: true })).ok);
    const webp = Buffer.from(WEBP(8));
    assert.ok((await emit(host, 'screen:preview', { image: webp })).ok);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(viewer.previews.length, 1);
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: false })).ok);
    await until(() => viewer.previews.length === 2);
    assert.deepEqual(Buffer.from(viewer.previews[1].image), webp);
    assert.equal(viewer.previews[1].saved, true);

    // Quem entra depois recebe a última foto guardada.
    await emit(outsider, 'voice:join', { channel: rooms[0].id });
    await until(() => outsider.previews.length === 1);
    assert.equal(outsider.previews[0].sid, host.id);

    // Fim da transmissão: a foto guardada vai embora.
    await emit(outsider, 'voice:leave');
    await emit(host, 'voice:state', { sharing: false });
    await emit(host, 'voice:state', { sharing: true });
    await emit(outsider, 'voice:join', { channel: rooms[0].id });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(outsider.previews.length, 1);

    // No máximo 8 em 20 s (duas já foram): das 9 seguidas, 6 passam.
    const results = [];
    for (let i = 0; i < 9; i++) results.push(await emit(host, 'screen:preview', { image }));
    assert.equal(results.filter((r) => r.ok).length, 6);
    assert.ok(results[8].error);
  } finally {
    clients.forEach((client) => client.close());
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill(); await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
