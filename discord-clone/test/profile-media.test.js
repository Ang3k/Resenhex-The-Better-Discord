const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { PNG } = require('pngjs');
const { decodeProfilePhoto, validateAvatarCrop } = require('../avatar');
const { decodeSound } = require('../soundboard');
const { JSDOM } = require('jsdom');
const tiny = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const animated = Buffer.concat([tiny.subarray(0, -1), tiny.subarray(tiny.indexOf(0x2c), -1), Buffer.from([0x3b])]);
const png = () => PNG.sync.write({ width: 256, height: 256, data: Buffer.alloc(256 * 256 * 4, 130) });
const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms));
function wav(seconds = .2) {
  const size = Math.round(48000 * seconds) * 2, out = Buffer.alloc(44 + size);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVE', 8); out.write('fmt ', 12);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(48000, 24); out.writeUInt32LE(96000, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(size, 40);
  for (let i = 0; i < size / 2; i++) out.writeInt16LE(Math.round(Math.sin(i / 48000 * 440 * Math.PI * 2) * 8000), 44 + i * 2);
  return out;
}

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-profile-media-'));
  const port = 40000 + Math.floor(Math.random() * 18000), base = 'http://127.0.0.1:' + port;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
    proc.stdout.on('data', (d) => { if (String(d).includes('rodando')) { clearTimeout(timer); resolve(); } });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  const clients = [];
  t.after(async () => {
    clients.forEach((s) => s.disconnect()); const exit = new Promise((r) => proc.once('exit', r)); proc.kill(); await exit;
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true });
  });
  async function connect(name, join = true) {
    const socket = io(base, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; }); socket.events = [];
    socket.on('sound', (s) => socket.events.push(s));
    socket.call = (event, data = {}) => new Promise((r) => socket.timeout(3000).emit(event, data, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode: 'register', name, password: 'test-only', confirmPassword: 'test-only' });
    assert.ok(!socket.auth.error, socket.auth.error); await wait();
    if (join && !socket.last.serverId) { const invite = await clients[0].call('server:invite'); assert.ok(!(await socket.call('server:join', { code: invite.code })).error); await wait(); }
    return socket;
  }
  const send = (url, method, token, body, headers = {}) => fetch(base + url, { method, headers: { ...(token ? { 'x-token': token } : {}), ...headers }, body });
  return { base, dir, connect, send };
}

test('animated avatars retain all frames; malformed frames, dimensions and framing are rejected', () => {
  assert.ok(decodeProfilePhoto(animated).data.equals(animated));
  assert.equal(decodeProfilePhoto(png()).ext, 'png');
  const frame = Buffer.from(tiny); frame.writeUInt16LE(5, frame.indexOf(0x2c) + 5);
  const huge = Buffer.from(tiny); huge.writeUInt16LE(2000, 6);
  for (const file of [frame, huge, tiny.subarray(0, -1), Buffer.concat([tiny, Buffer.from('extra')]), Buffer.from('<svg/>')]) assert.throws(() => decodeProfilePhoto(file), /Foto inválida/);
  assert.deepEqual(validateAvatarCrop({ zoom: 2, x: .2, y: .8 }), { zoom: 2, x: .2, y: .8 });
  for (const crop of [{ zoom: 0, x: 0, y: 0 }, { zoom: 2, x: -1, y: 0 }, { zoom: Infinity, x: 0, y: 0 }, { zoom: '2', x: 0, y: 0 }]) assert.throws(() => validateAvatarCrop(crop), /Enquadramento/);
});

test('photo framing uses the same source rectangle as the zoomed preview', () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../public/photo-editor.js'), 'utf8'));
  const rect = dom.window.PhotoEditor.rect(800, 400, { x: 1, y: .5, zoom: 2 });
  assert.equal(rect.side, 200); assert.equal(rect.x, 600); assert.equal(rect.y, 100);
  const img = dom.window.document.createElement('img'); dom.window.PhotoEditor.style(img, { x: 1, y: .5, zoom: 2 });
  assert.equal(img.style.objectPosition, '100% 50%'); assert.equal(img.style.transformOrigin, '100% 50%'); assert.equal(img.style.transform, 'scale(2)'); dom.window.close();
});

test('sound uploads reject disguised, truncated, noncanonical and overlong audio', () => {
  assert.equal(decodeSound(wav()).duration, .2);
  const wrong = wav(); wrong.writeUInt16LE(2, 22);
  for (const data of [Buffer.from('<html/>'), wav().subarray(0, -1), wrong, wav(8.1)]) assert.throws(() => decodeSound(data), /Som inválido/);
});

test('profile upload publishes animated framing to other members and cleans replaced files', async (t) => {
  const { base, connect, send } = await fixture(t);
  const ana = await connect('Ana'), beto = await connect('Beto');
  assert.equal((await send('/profile/avatar', 'POST', '', animated)).status, 401);
  const crop = { zoom: 2, x: .25, y: .75 };
  const uploaded = await (await send('/profile/avatar', 'POST', ana.auth.token, animated, { 'x-avatar-crop': JSON.stringify(crop) })).json();
  assert.match(uploaded.avatarUrl, /\.gif$/); await wait();
  assert.deepEqual(beto.last.members.find((m) => m.id === ana.auth.accountId).avatarCrop, crop);
  assert.ok(Buffer.from(await (await fetch(base + uploaded.avatarUrl)).arrayBuffer()).equals(animated));
  assert.equal((await send('/profile/avatar', 'POST', ana.auth.token, animated, { 'x-avatar-crop': '{"zoom":9,"x":0,"y":0}' })).status, 400);
  const replaced = await (await send('/profile/avatar', 'POST', ana.auth.token, png())).json();
  assert.match(replaced.avatarUrl, /\.png$/); assert.equal(replaced.avatarCrop, null);
  assert.equal((await fetch(base + uploaded.avatarUrl)).status, 404);
  await send('/profile/avatar', 'DELETE', ana.auth.token); await wait();
  assert.equal(beto.last.members.find((m) => m.id === ana.auth.accountId).avatarUrl, null);
  assert.equal((await fetch(base + replaced.avatarUrl)).status, 404);
});

test('server sounds enforce permission, server isolation and room-only playback; removal cleans files', async (t) => {
  const { base, dir, connect, send } = await fixture(t);
  const owner = await connect('Dono'), friend = await connect('Amigo'), otherRoom = await connect('OutraSala'), outsider = await connect('OutroDono', false);
  const id = owner.last.serverId, route = '/servers/' + id + '/sounds';
  assert.equal((await send(route, 'POST', '', wav())).status, 401);
  assert.equal((await send(route, 'POST', friend.auth.token, wav(), { 'x-sound-name': 'Risada' })).status, 403);
  assert.equal((await send(route, 'POST', outsider.auth.token, wav(), { 'x-sound-name': 'Risada' })).status, 403);
  assert.equal((await send(route, 'POST', owner.auth.token, wav(8.1), { 'x-sound-name': 'Longo' })).status, 413);
  assert.equal((await send(route, 'POST', owner.auth.token, '<html/>', { 'x-sound-name': 'Falso' })).status, 400);
  const added = await (await send(route, 'POST', owner.auth.token, wav(), { 'x-sound-name': encodeURIComponent('Risada da turma') })).json();
  assert.ok(added.id, added.error); await wait();
  const sound = friend.last.soundboard.find((s) => s.id === added.id);
  assert.equal(sound.name, 'Risada da turma'); assert.equal(sound.duration, .2);
  assert.equal((await send(sound.url, 'GET', friend.auth.token)).headers.get('content-type'), 'audio/wav');
  assert.equal((await send(sound.url, 'GET', outsider.auth.token)).status, 404);
  const rooms = owner.last.channels.filter((c) => c.type === 'voice');
  for (const [client, room] of [[owner, rooms[0]], [friend, rooms[0]], [otherRoom, rooms[1]]]) assert.ok(!(await client.call('voice:join', { channel: room.id })).error);
  assert.ok(!(await owner.call('sound:play', { sound: added.id })).error); await wait();
  assert.equal(friend.events[0].sound, added.id); assert.equal(otherRoom.events.length, 0); assert.equal(outsider.events.length, 0);
  assert.ok((await friend.call('sound:remove', { id: added.id })).error);
  await outsider.call('server:create', { name: 'Outro servidor' }); await wait();
  assert.ok((await outsider.call('sound:play', { sound: added.id })).error);
  assert.ok((await outsider.call('sound:remove', { id: added.id })).error);
  const otherRoute = '/servers/' + outsider.last.serverId + '/sounds';
  const shared = await (await send(otherRoute, 'POST', outsider.auth.token, wav(), { 'x-sound-name': 'Outro som' })).json();
  assert.ok(shared.id); assert.equal(fs.readdirSync(path.join(dir, 'uploads/sounds')).length, 1);
  assert.ok(!(await owner.call('sound:remove', { id: added.id })).error);
  assert.equal((await send(sound.url, 'GET', owner.auth.token)).status, 404);
  assert.equal(fs.readdirSync(path.join(dir, 'uploads/sounds')).length, 1);
  assert.ok(!(await outsider.call('sound:remove', { id: shared.id })).error);
  assert.equal(fs.readdirSync(path.join(dir, 'uploads/sounds')).length, 0);
  assert.equal((await fetch(base + sound.url)).status, 401);
});
