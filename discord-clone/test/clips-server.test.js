const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

const JPEG = (n = 1, size = 80) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, ...new Array(size).fill(n), 0xff, 0xd9]);
const MP4 = (n = 1000) => { const b = Buffer.alloc(n, 7); b.write('ftypisom', 4, 'latin1'); return b; };
const framed = (thumb, mp4) => { const len = Buffer.alloc(4); len.writeUInt32BE(thumb.length); return Buffer.concat([len, thumb, mp4]); };

test('clipes: envio, aviso só na sala, recusas, download de uso único, lista e allowClips', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-clips-test-'));
  const port = 38000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', ACCESS_PASSWORD_B64: '' }, stdio: 'ignore' });
  const clients = [];
  const emit = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
  const until = async (check, tries = 100) => { for (let i = 0; i < tries; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 50)); } throw Error('condition timed out'); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const postClip = (socket, meta, { thumb = JPEG(7), mp4 = MP4() } = {}) => fetch(base + '/clips', {
    method: 'POST', body: framed(thumb, mp4),
    headers: { 'x-token': socket.token, 'content-type': 'application/octet-stream', 'x-clip': encodeURIComponent(JSON.stringify(meta)) },
  });
  try {
    await until(async () => { try { return (await fetch(base + '/config')).ok; } catch { return false; } }, 300);
    async function connect(name) {
      const socket = io(base, { autoConnect: false, reconnection: false });
      clients.push(socket);
      socket.clips = [];
      socket.on('clip:new', (clip) => socket.clips.push(clip));
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
      socket.on('state', (s) => { socket.snapshot = s; });
      const auth = await emit(socket, 'auth', { mode: 'register', name, password: 'test-only-2026', confirmPassword: 'test-only-2026' });
      assert.ok(auth.accountId);
      socket.token = auth.token;
      socket.accountId = auth.accountId;
      if (!auth.serverId) {
        const invite = await emit(clients[0], 'server:invite', {});
        assert.ok(!(await emit(socket, 'server:join', { code: invite.code })).error);
      }
      return socket;
    }
    const host = await connect('Host'), viewer = await connect('Viewer'), outsider = await connect('Elsewhere'), idle = await connect('Idle');
    await until(() => host.snapshot);
    const rooms = host.snapshot.channels.filter((c) => c.type === 'voice');
    await emit(host, 'voice:join', { channel: rooms[0].id });
    await emit(viewer, 'voice:join', { channel: rooms[0].id });
    await emit(outsider, 'voice:join', { channel: rooms[1].id });
    const meta = { duration: 15.2, participants: [host.accountId, viewer.accountId], channelName: 'Sala 1' };

    // Só quem está em chamada envia, e o aviso chega só na sala.
    const sent = await postClip(host, meta);
    assert.equal(sent.status, 200);
    const { id } = await sent.json();
    assert.ok(id);
    await until(() => viewer.clips.length === 1);
    assert.equal(viewer.clips[0].id, id);
    assert.equal(viewer.clips[0].duration, 15.2);
    assert.match(viewer.clips[0].thumb, /^data:image\/jpeg;base64,/);
    assert.equal('file' in viewer.clips[0], false);
    await wait(500);
    assert.equal(outsider.clips.length, 0);
    assert.equal((await postClip(idle, meta)).status, 403);
    assert.equal((await fetch(base + '/clips', { method: 'POST', body: framed(JPEG(), MP4()) })).status, 401);

    // Duração, miniatura e vídeo inválidos.
    assert.equal((await postClip(host, { ...meta, duration: 31.5 })).status, 400);
    assert.equal((await postClip(host, meta, { thumb: Buffer.from('<svg></svg>') })).status, 400);
    assert.equal((await postClip(host, meta, { thumb: JPEG(1, 41 * 1024) })).status, 400);
    assert.equal((await postClip(host, meta, { mp4: Buffer.alloc(1000, 1) })).status, 400);

    // Só destinatários baixam, uma vez.
    assert.ok((await emit(outsider, 'clip:link', { id })).error);
    const { url } = await emit(viewer, 'clip:link', { id });
    assert.match(url, new RegExp(`^/clips/${id}\\?t=`));
    const download = await fetch(base + url);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'video/mp4');
    assert.match(download.headers.get('content-disposition'), /^attachment; filename="resenhex-clipe-sala-1-\d{4}-\d{2}-\d{2}-\d{4}\.mp4"$/);
    assert.equal((await download.arrayBuffer()).byteLength, 1000);
    assert.equal((await fetch(base + url)).status, 410);
    assert.equal((await fetch(`${base}/clips/${id}`)).status, 410);

    // A lista é da sala e de quem estava lá.
    await emit(viewer, 'voice:leave', {});
    await emit(viewer, 'voice:join', { channel: rooms[0].id });
    assert.deepEqual((await emit(viewer, 'clip:list', {})).clips.map((c) => c.id), [id]);
    await emit(idle, 'voice:join', { channel: rooms[0].id });
    assert.deepEqual((await emit(idle, 'clip:list', {})).clips, []);
    assert.deepEqual((await emit(outsider, 'clip:list', {})).clips, []);

    // allowClips aparece no estado da chamada, ligado por padrão.
    const entry = (sock, accountId) => sock.snapshot.voice.find((v) => v.accountId === accountId);
    await until(() => entry(host, viewer.accountId));
    assert.equal(entry(host, viewer.accountId).allowClips, true);
    await emit(viewer, 'voice:state', { allowClips: false });
    await until(() => entry(host, viewer.accountId)?.allowClips === false);

    // Quem desligou a opção não pode estar no clipe.
    const refused = await postClip(host, meta);
    assert.equal(refused.status, 403);
    assert.match((await refused.json()).error, /não quer/);
    assert.equal((await postClip(host, { ...meta, participants: [host.accountId] })).status, 200);
  } finally {
    for (const socket of clients) socket.close();
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
