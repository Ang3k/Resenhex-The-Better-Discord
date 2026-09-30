// Servidor do Resenhex (plataforma de chat e voz inspirada no Discord): contas, cargos e permissões, moderação,
// chat de texto com anexos, amigos e mensagens diretas, e sinalização WebRTC para voz, câmera e tela.
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { Server } = require('socket.io');
const { decodeAvatar, decodeBanner, decodeProfilePhoto, validateAvatarCrop } = require('./avatar');
const { decodeSound, soundName, MAX_SOUND_BYTES, MAX_SERVER_SOUNDS } = require('./soundboard');
const { channelActions } = require('./channels');
const { communityStore } = require('./communities');
const { downloadRoutes } = require('./downloads');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_MESSAGES = 300;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 25;
// Instalador e atualizações do app de desktop (enviados por deploy/publicar-app.ps1).
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads');
const MAX_ATTACHMENTS = 10;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });
const SOUND_DIR = path.join(UPLOAD_DIR, 'sounds');
fs.mkdirSync(SOUND_DIR, { recursive: true });

// Tipos que o navegador pode exibir direto. Todo o resto é servido como download,
// para que um arquivo enviado (ex.: .html, .svg) nunca rode código neste site.
const INLINE_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
};

const PERMS = {
  ADMIN: 'Administrador (todas as permissões)',
  MANAGE_ROLES: 'Gerenciar cargos',
  MANAGE_CHANNELS: 'Gerenciar canais',
  MANAGE_MESSAGES: 'Apagar mensagens dos outros',
  KICK: 'Expulsar membros',
  BAN: 'Banir membros',
  TIMEOUT: 'Castigar membros',
  MUTE_MEMBERS: 'Silenciar e ensurdecer membros',
  MOVE_MEMBERS: 'Mover e desconectar membros da voz',
  MENTION_EVERYONE: 'Mencionar @everyone e @here',
  SEND_MESSAGES: 'Enviar mensagens',
  CONNECT: 'Entrar em canais de voz',
  SPEAK: 'Falar na voz',
  STREAM: 'Vídeo (câmera e compartilhar tela)',
  SOUNDBOARD: 'Usar efeitos sonoros',
  MANAGE_SOUNDBOARD: 'Gerenciar efeitos sonoros',
};
// Efeitos sonoros que podem ser tocados na chamada (o som é gerado no navegador de cada um).
const SOUNDBOARD = ['grilo', 'trovao', 'aplausos', 'badumtss', 'buzina', 'fail', 'vitoria', 'suspense'];
const ALL_PERMS = Object.keys(PERMS);

// Servidores STUN/TURN entregues ao navegador. TURN é opcional, mas necessário
// quando alguém está atrás de NAT restritivo (redes de empresa, 4G etc).
function iceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    servers.push({
      urls: process.env.TURN_URL.split(','),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}

const newId = () => crypto.randomBytes(8).toString('hex');

// ---------------- banco de dados (arquivo JSON) ----------------
function defaultDb() {
  const text = ['geral', 'jogos', 'links'];
  const voice = ['Sala 1', 'Sala 2', 'AFK'];
  return {
    ownerId: null,
    accounts: {},
    sessions: {},
    // A posição no array é a hierarquia: índice maior = cargo mais alto.
    roles: [
      { id: 'everyone', name: '@everyone', color: '', hoist: false, perms: ['SEND_MESSAGES', 'CONNECT', 'SPEAK', 'STREAM', 'SOUNDBOARD'] },
      { id: newId(), name: 'Moderador', color: '#3498db', hoist: true, perms: ['KICK', 'TIMEOUT', 'MUTE_MEMBERS', 'MOVE_MEMBERS', 'MANAGE_MESSAGES', 'MENTION_EVERYONE'] },
      { id: newId(), name: 'Admin', color: '#e74c3c', hoist: true, perms: ['ADMIN'] },
    ],
    channels: [
      ...text.map((name) => ({ id: name, type: 'text', name, allowedRoles: [] })),
      ...voice.map((name) => ({ id: newId(), type: 'voice', name, allowedRoles: [] })),
    ],
    messages: Object.fromEntries(text.map((c) => [c, []])),
    uploads: {},
  };
}

function parseDbFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw.accounts) return raw;
  // Formato antigo (só mensagens por nome de canal): mantém o histórico.
  const db = defaultDb();
  for (const [channel, list] of Object.entries(raw)) {
    if (!db.messages[channel] || !Array.isArray(list)) continue;
    db.messages[channel] = list.map((m) => ({ id: m.id, authorId: null, authorName: m.author, authorColor: m.color, text: m.text, ts: m.ts }));
  }
  return db;
}

// Carrega os dados. A cada início guarda uma cópia (data.json.bak); se o arquivo
// principal estiver corrompido, ele é preservado com outro nome e a cópia é usada.
function loadDb() {
  if (!fs.existsSync(DATA_FILE)) return defaultDb();
  try {
    const db = parseDbFile(DATA_FILE);
    fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
    return db;
  } catch (err) {
    const broken = `${DATA_FILE}.corrompido-${Date.now()}`;
    fs.renameSync(DATA_FILE, broken);
    console.error(`[!] ${DATA_FILE} estava corrompido (${err.message}). Guardado como ${broken}.`);
    try {
      const db = parseDbFile(DATA_FILE + '.bak');
      console.error('[!] Dados recuperados do backup data.json.bak.');
      return db;
    } catch {
      console.error('[!] Sem backup válido: começando do zero.');
      return defaultDb();
    }
  }
}

const loadedDb = loadDb();
// Keep the original single-server database even after subsequent restarts replace .bak.
const legacySource = fs.existsSync(DATA_FILE) ? DATA_FILE : fs.existsSync(DATA_FILE + '.bak') ? DATA_FILE + '.bak' : null;
if (!loadedDb.servers && legacySource) {
  try { fs.copyFileSync(legacySource, DATA_FILE + '.pre-0.9.1.bak', fs.constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const communities = communityStore(loadedDb, newId, defaultDb);
const db = communities.db;
const channelStore = channelActions(db, newId);
db.uploads ||= {};
db.friendships ||= {}; // "idA-idB" (ids em ordem) -> { status: 'pending' | 'friends', from, ts }
db.blocks ||= {}; // idDeQuemBloqueou -> [ids bloqueados]
db.dms ||= {}; // "dm-idA-idB" -> { id, users: [idA, idB], closed: { idDaConta: true } }; as mensagens ficam em db.messages[id]

// Grava na hora ao desligar o servidor (Ctrl+C), para não perder o que estava pendente.
function saveNow() {
  clearTimeout(saveTimer);
  fs.writeFileSync(DATA_FILE, JSON.stringify(communities.root));
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    saveNow();
    process.exit(0);
  });
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(communities.root), (err) => {
      if (err) return console.error('Falha ao salvar dados:', err);
      fs.rename(tmp, DATA_FILE, (err2) => err2 && console.error('Falha ao salvar dados:', err2));
    });
  }, 300);
}

// ---------------- senhas e sessões ----------------
// scrypt assíncrono: calcular o hash leva ~70 ms e não pode travar o servidor
// (chat e voz de todo mundo param enquanto o processo está ocupado).
const scrypt = promisify(crypto.scrypt);

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: (await scrypt(password, salt, 64)).toString('hex') };
}

async function checkPassword(acc, password) {
  const { hash } = await hashPassword(password, acc.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(acc.hash, 'hex'));
}

// ---------------- limites contra abuso ----------------
// Janela deslizante: no máximo "max" ações em "ms" milissegundos por chave.
const hits = new Map();
function allow(key, max, ms) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < ms);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, list] of hits) if (!list.length || now - list[list.length - 1] > 60 * 60 * 1000) hits.delete(key);
}, 60 * 1000).unref();

// Senha errada várias vezes seguidas bloqueia aquele nome, naquele IP, por um tempo crescente.
const loginFailures = new Map(); // ip|nome -> { count, until }
function loginLocked(key) {
  const f = loginFailures.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function loginFailed(key) {
  const f = loginFailures.get(key) || { count: 0, until: 0 };
  f.count++;
  if (f.count >= 5) f.until = Date.now() + Math.min(30_000 * 2 ** (f.count - 5), 10 * 60 * 1000);
  loginFailures.set(key, f);
}

// IP real de quem conecta. Atrás do Cloudflare Tunnel ou de um proxy HTTPS (Caddy, Nginx)
// todo mundo chegaria como 127.0.0.1; TRUST_PROXY=1 faz confiar no X-Forwarded-For do proxy.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const clientIp = (headers, address) => String(
  (TRUST_PROXY && String(headers['x-forwarded-for'] || '').split(',')[0].trim())
  || address || '');

function createSession(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = accountId;
  save();
  return token;
}

// ---------------- permissões ----------------
const roleIndex = (id) => db.roles.findIndex((r) => r.id === id);
const isOwner = (acc) => acc.id === db.ownerId;

function topPosition(acc) {
  if (isOwner(acc)) return Infinity;
  return Math.max(0, ...acc.roles.map(roleIndex));
}

function permsOf(acc) {
  if (!acc || !communities.joined(acc.id)) return new Set();
  if (isOwner(acc)) return new Set(ALL_PERMS);
  const set = new Set();
  for (const r of db.roles) if (r.id === 'everyone' || acc.roles.includes(r.id)) r.perms.forEach((p) => set.add(p));
  return set.has('ADMIN') ? new Set(ALL_PERMS) : set;
}

const can = (acc, perm) => permsOf(acc).has(perm);
// Só age sobre quem está abaixo na hierarquia; ninguém age sobre o dono.
const outranks = (actor, target) => !isOwner(target) && topPosition(actor) > topPosition(target);
const timedOut = (acc) => acc.timeoutUntil > Date.now();

function canView(acc, channel) {
  return !!acc && communities.joined(acc.id) && (!channel.private || can(acc, 'ADMIN') || channel.allowedRoles.some((r) => acc.roles.includes(r)));
}

// ---------------- amigos e mensagens diretas ----------------
const MAX_FRIENDS = 200;
const MAX_PENDING_REQUESTS = 100;
const MAX_BLOCKS = 500;
const pairKey = (a, b) => [a, b].sort().join('-');
const dmIdOf = (a, b) => 'dm-' + pairKey(a, b);
const isDmId = (id) => typeof id === 'string' && id.startsWith('dm-');
const friendshipOf = (a, b) => db.friendships[pairKey(a, b)];
const areFriends = (a, b) => friendshipOf(a, b)?.status === 'friends';
const hasBlocked = (blocker, target) => (db.blocks[blocker] || []).includes(target);
const presentAccount = (id) => {
  const a = db.accounts[id];
  return a || null;
};

// Amigos, pedidos e conversas abertas de uma conta (o navegador só recebe o que é dele).
function socialFor(acc) {
  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const [key, f] of Object.entries(db.friendships)) {
    const [a, b] = key.split('-');
    if (a !== acc.id && b !== acc.id) continue;
    const other = a === acc.id ? b : a;
    if (!presentAccount(other)) continue;
    if (f.status === 'friends') friends.push(other);
    else (f.from === acc.id ? outgoing : incoming).push(other);
  }
  const dms = Object.values(db.dms)
    .filter((dm) => dm.users.includes(acc.id) && !dm.closed?.[acc.id])
    .map((dm) => ({ id: dm.id, userId: dm.users.find((u) => u !== acc.id), last: (db.messages[dm.id] || []).at(-1)?.ts || 0 }))
    .filter((dm) => presentAccount(dm.userId))
    .sort((x, y) => y.last - x.last);
  return { friends, incoming, outgoing, blocked: (db.blocks[acc.id] || []).filter((id) => db.accounts[id]), dms };
}

// ---------------- menções e anexos ----------------
// Menções ficam no texto como <@idDaConta> e <@&idDoCargo>; @everyone/@here só contam com permissão.
function parseMentions(acc, text, replyAuthorId) {
  const users = new Set([...text.matchAll(/<@([0-9a-f]{16})>/g)].map((m) => m[1]).filter((id) => communities.joined(id)));
  if (replyAuthorId && replyAuthorId !== acc.id && communities.joined(replyAuthorId)) users.add(replyAuthorId);
  const roles = [...new Set([...text.matchAll(/<@&([0-9a-f]{16})>/g)].map((m) => m[1]))].filter((id) => roleIndex(id) > 0);
  const everyone = /(^|[^\w<])@(everyone|here)\b/.test(text) && can(acc, 'MENTION_EVERYONE');
  return { users: [...users], roles, everyone };
}

function mentionsAccount(msg, acc) {
  const m = msg.mentions;
  return !!m && msg.authorId !== acc.id && (m.everyone || m.users.includes(acc.id) || m.roles.some((r) => acc.roles.includes(r)));
}

function deleteUpload(id) {
  const up = db.uploads[id];
  if (!up) return;
  delete db.uploads[id];
  fs.unlink(path.join(UPLOAD_DIR, up.file), () => {});
}

const deleteAttachments = (msg) => (msg.attachments || []).forEach((a) => deleteUpload(a.id));

// Apaga anexos enviados mas nunca usados numa mensagem (ex.: a pessoa desistiu).
setInterval(() => {
  const limit = Date.now() - 60 * 60 * 1000;
  for (const up of Object.values(db.uploads)) if (!up.messageId && up.ts < limit) deleteUpload(up.id);
  save();
}, 10 * 60 * 1000).unref();

// ---------------- sessões conectadas ----------------
// socket.id -> { accountId, voice: idDoCanal|null, muted, deafened, sharing, paused, camera }
const online = new Map();

// Manda a lista de amigos/conversas atualizada para quem está conectado.
function pushSocial(...accountIds) {
  for (const id of new Set(accountIds)) {
    const acc = db.accounts[id];
    if (!acc) continue;
    const payload = socialFor(acc);
    for (const [sid, s] of online) if (s.accountId === id) io.sockets.sockets.get(sid)?.emit('social', payload);
  }
  broadcastState();
}

const app = express();
app.use((req, _res, next) => {
  const account = communities.root.accounts[db.sessions[req.get('x-token')]];
  communities.run(req.get('x-server-id') || account?.lastServerId || communities.root.defaultServerId, next);
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(downloadRoutes(DOWNLOAD_DIR, { storeId: process.env.MS_STORE_ID }));
app.get('/baixar', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'baixar.html')));
app.get('/privacidade', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'privacidade.html')));
// Supressão de ruído por IA (RNNoise e GTCRN compilados para WebAssembly), usada no navegador.
app.use('/vendor/noise', express.static(path.dirname(require.resolve('@sapphi-red/web-noise-suppressor')), { maxAge: '7d' }));
app.get('/config', (_req, res) => {
  res.json({ passwordRequired: false, hasOwner: Object.keys(db.accounts).length > 0, maxUploadMb: MAX_UPLOAD_MB });
});
app.get('/invites/:code', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!allow('invite-preview:' + clientIp(req.headers, req.socket.remoteAddress), 60, 60_000)) return res.status(429).json({ error: 'Muitos convites consultados. Aguarde um minuto.' });
  const community = communities.byInvite(req.params.code);
  if (!community) return res.status(404).json({ error: 'Convite inválido ou revogado. Peça um novo link.' });
  res.json({ id: community.id, name: community.serverName, icon: community.serverIcon ? '/avatars/' + community.serverIcon : null,
    members: Object.values(community.members).filter((m) => m.active && !m.banned).length });
});

// Profile pictures are shared with the server, independent of chat attachments.
// Uma imagem pode ser foto de alguém e ícone do servidor ao mesmo tempo (mesmo conteúdo, mesmo arquivo).
const IMAGE_FILE = /^[a-f0-9]{64}\.(png|gif)$/;
const imageInUse = (file) => Object.values(communities.root.servers).some((s) => s.serverIcon === file) || Object.values(db.accounts).some((account) => account.avatar === file || account.banner === file);
function removeImageIfUnused(file) {
  if (!file || !IMAGE_FILE.test(file) || imageInUse(file)) return;
  try { fs.unlinkSync(path.join(AVATAR_DIR, file)); } catch (error) { if (error.code !== 'ENOENT') console.warn('Não foi possível remover uma imagem antiga.'); }
}
function storeImage(dataUrl) {
  const image = decodeAvatar(dataUrl);
  const file = crypto.createHash('sha256').update(image).digest('hex') + '.png';
  fs.writeFileSync(path.join(AVATAR_DIR, file), image);
  return file;
}

app.get('/avatars/:file', (req, res) => {
  if (!IMAGE_FILE.test(req.params.file) || !imageInUse(req.params.file)) return res.status(404).end();
  res.set({
    'Content-Type': req.params.file.endsWith('.gif') ? 'image/gif' : 'image/png',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  res.sendFile(path.join(AVATAR_DIR, req.params.file));
});

// Banner do perfil: imagem PNG (já recortada pelo navegador) ou GIF, enviada como bytes puros.
const MAX_BANNER_UPLOAD = 5 * 1024 * 1024;
const authFromToken = (req) => {
  const acc = db.accounts[db.sessions[req.get('x-token')]];
  return acc || null;
};
app.post('/profile/avatar', express.raw({ type: () => true, limit: MAX_BANNER_UPLOAD }), (req, res) => {
  const acc = authFromToken(req);
  if (!acc) return res.status(401).json({ error: 'Não autenticado' });
  if (!allow('avatar:' + acc.id, 10, 60 * 1000)) return res.status(429).json({ error: 'Muitas trocas de foto. Aguarde um minuto.' });
  try {
    const { ext, data } = decodeProfilePhoto(req.body);
    const crop = ext === 'gif' ? validateAvatarCrop(JSON.parse(req.get('x-avatar-crop') || 'null')) : null;
    const file = crypto.createHash('sha256').update(data).digest('hex') + '.' + ext;
    fs.writeFileSync(path.join(AVATAR_DIR, file), data);
    const previous = acc.avatar;
    acc.avatar = file;
    acc.avatarCrop = crop;
    save(); broadcastState();
    if (previous !== file) removeImageIfUnused(previous);
    res.json({ ok: true, avatarUrl: '/avatars/' + file, avatarCrop: crop });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.delete('/profile/avatar', (req, res) => {
  const acc = authFromToken(req);
  if (!acc) return res.status(401).json({ error: 'Não autenticado' });
  const previous = acc.avatar;
  acc.avatar = null; acc.avatarCrop = null;
  save(); broadcastState(); removeImageIfUnused(previous);
  res.json({ ok: true, avatarUrl: null, avatarCrop: null });
});

const SOUND_FILE = /^[a-f0-9]{64}\.wav$/;
function removeSoundIfUnused(file) {
  if (!SOUND_FILE.test(file || '') || Object.values(communities.root.servers).some((s) => s.soundboard.some((sound) => sound.file === file))) return;
  try { fs.unlinkSync(path.join(SOUND_DIR, file)); } catch (error) { if (error.code !== 'ENOENT') console.warn('Não foi possível remover um som antigo.'); }
}
app.post('/servers/:serverId/sounds', express.raw({ type: () => true, limit: MAX_SOUND_BYTES }), (req, res) => {
  const acc = authFromToken(req);
  if (!acc) return res.status(401).json({ error: 'Não autenticado' });
  communities.run(req.params.serverId, () => {
    if (!communities.joined(acc.id) || !can(communities.accountView(acc), 'MANAGE_SOUNDBOARD')) return res.status(403).json({ error: 'Você não pode gerenciar os efeitos deste servidor.' });
    if (!allow('sound-upload:' + acc.id, 10, 60000)) return res.status(429).json({ error: 'Muitos envios. Aguarde um minuto.' });
    if (db.soundboard.length >= MAX_SERVER_SOUNDS) return res.status(400).json({ error: 'O servidor já tem 32 efeitos personalizados.' });
    try {
      const name = soundName(decodeURIComponent(req.get('x-sound-name') || ''));
      const { data, duration } = decodeSound(req.body);
      const file = crypto.createHash('sha256').update(data).digest('hex') + '.wav';
      fs.writeFileSync(path.join(SOUND_DIR, file), data);
      const sound = { id: newId(), name, file, duration, createdBy: acc.id };
      db.soundboard.push(sound); save(); broadcastState();
      res.json({ ok: true, id: sound.id });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
});
app.get('/servers/:serverId/sounds/:soundId', (req, res) => {
  const acc = authFromToken(req);
  if (!acc) return res.status(401).end();
  communities.run(req.params.serverId, () => {
    const sound = communities.joined(acc.id) && db.soundboard.find((s) => s.id === req.params.soundId);
    if (!sound || !SOUND_FILE.test(sound.file)) return res.status(404).end();
    res.set({ 'Content-Type': 'audio/wav', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.sendFile(path.join(SOUND_DIR, sound.file));
  });
});
app.post('/profile/banner', express.raw({ type: () => true, limit: MAX_BANNER_UPLOAD }), (req, res) => {
  const acc = authFromToken(req);
  if (!acc) return res.status(401).json({ error: 'Não autenticado' });
  if (!allow('banner:' + acc.id, 10, 60 * 1000)) return res.status(429).json({ error: 'Muitas trocas de banner. Aguarde um minuto.' });
  try {
    const { ext, data } = decodeBanner(req.body);
    // PNG chega já recortado; GIF vai inteiro e guarda só o enquadramento, para manter a animação.
    const crop = ext === 'gif' ? validateAvatarCrop(JSON.parse(req.get('x-banner-crop') || 'null')) : null;
    const file = crypto.createHash('sha256').update(data).digest('hex') + '.' + ext;
    fs.writeFileSync(path.join(AVATAR_DIR, file), data);
    const previous = acc.banner;
    acc.banner = file;
    acc.bannerCrop = crop;
    save();
    broadcastState();
    if (previous !== file) removeImageIfUnused(previous);
    res.json({ ok: true, bannerUrl: '/avatars/' + file, bannerCrop: crop });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.delete('/profile/banner', (req, res) => {
  const acc = authFromToken(req);
  if (!acc) return res.status(401).json({ error: 'Não autenticado' });
  const previous = acc.banner;
  acc.banner = null;
  acc.bannerCrop = null;
  save();
  broadcastState();
  removeImageIfUnused(previous);
  res.json({ ok: true, bannerUrl: null, bannerCrop: null });
});

app.post('/upload', express.raw({ type: () => true, limit: MAX_UPLOAD_MB * 1024 * 1024 }), (req, res) => {
  const acc = db.accounts[db.sessions[req.get('x-token')]];
  if (!acc) return res.status(401).json({ error: 'Não autenticado' });
  const targetId = req.get('x-channel-id');
  const dm = targetId && db.dms[targetId];
  if (dm) {
    const peer = dm.users.find((id) => id !== acc.id);
    if (!dm.users.includes(acc.id) || !areFriends(acc.id, peer) || hasBlocked(acc.id, peer) || hasBlocked(peer, acc.id)) return res.status(403).json({ error: 'Conversa não disponível.' });
  } else if (!can(acc, 'SEND_MESSAGES') || timedOut(acc) || (targetId && !db.channels.some((c) => c.id === targetId && c.type === 'text' && canView(acc, c)))) return res.status(403).json({ error: 'Você não pode enviar arquivos agora.' });
  if (!allow('upload:' + acc.id, 20, 60 * 1000)) return res.status(429).json({ error: 'Muitos arquivos seguidos. Espere um pouco.' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Arquivo vazio' });
  let name;
  try {
    name = decodeURIComponent(req.get('x-filename') || '');
  } catch {
    name = '';
  }
  name = path.basename(name).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100) || 'arquivo';
  const ext = path.extname(name).slice(1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  const id = crypto.randomBytes(16).toString('hex');
  const file = id + (ext ? '.' + ext : '');
  fs.writeFile(path.join(UPLOAD_DIR, file), req.body, (err) => {
    if (err) {
      console.error('Falha ao salvar upload:', err);
      return res.status(500).json({ error: 'Falha ao salvar o arquivo' });
    }
    if (!dm && !communities.root.servers[communities.currentId()]) {
      fs.unlink(path.join(UPLOAD_DIR, file), () => {});
      return res.status(410).json({ error: 'Este servidor foi excluído.' });
    }
    const up = { id, file, name, size: req.body.length, type: INLINE_TYPES[ext] || 'application/octet-stream', uploaderId: acc.id, ts: Date.now(), messageId: null, serverId: dm ? null : communities.currentId(), channelId: targetId || null };
    db.uploads[id] = up;
    save();
    res.json({ id, name, size: up.size, type: up.type, url: '/uploads/' + file });
  });
});

app.get('/uploads/:file', (req, res) => {
  const match = /^([0-9a-f]{32})(\.[a-z0-9]{1,10})?$/.exec(req.params.file);
  const up = match && db.uploads[match[1]];
  if (!up || up.file !== req.params.file) return res.status(404).end();
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  if (INLINE_TYPES[path.extname(up.file).slice(1)]) res.type(up.type);
  else res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(up.name)}` });
  res.sendFile(path.join(UPLOAD_DIR, up.file));
});

// Upload maior que o limite ou outro erro de corpo da requisição.
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: req.path.startsWith('/profile/') ? 'A imagem deve ter até 5 MB.' : req.path.endsWith('/sounds') ? 'O efeito sonoro deve ter até 8 segundos.' : `Arquivo maior que ${MAX_UPLOAD_MB} MB` });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro no servidor' });
});

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

function socketsOf(accountId, local = false) {
  return [...online].filter(([, s]) => s.accountId === accountId && (!local || s.serverId === communities.currentId())).map(([sid]) => io.sockets.sockets.get(sid)).filter(Boolean);
}

function publicMember(a, onlineIds) {
  return {
    id: a.id,
    name: a.nickname || a.name,
    username: a.name,
    nickname: a.nickname || null,
    color: a.color,
    avatarUrl: a.avatar ? '/avatars/' + a.avatar : null,
    avatarCrop: a.avatarCrop || null,
    bannerUrl: a.banner ? '/avatars/' + a.banner : null,
    bannerCrop: a.banner && a.bannerCrop || null,
    since: a.createdAt || null,
    roles: a.roles,
    online: onlineIds.has(a.id),
    serverMuted: !!a.serverMuted,
    serverDeafened: !!a.serverDeafened,
    timeoutUntil: a.timeoutUntil || 0,
  };
}

function publicProfiles(ids) {
  const onlineIds = new Set([...online.values()].map((s) => s.accountId));
  return communities.run(null, () => [...new Set(ids)].map((id) => db.accounts[id]).filter(Boolean).map((a) => publicMember(a, onlineIds)));
}

// Partes do estado que são iguais para todo mundo: calculadas uma vez por envio.
function sharedState() {
  const onlineIds = new Set([...online.values()].map((s) => s.accountId));
  const accounts = Object.values(db.accounts).filter((a) => communities.membership(a.id));
  return {
    members: accounts.filter((a) => communities.joined(a.id)).map((a) => publicMember(a, onlineIds)),
    bans: accounts.filter((a) => a.banned).map((a) => ({ id: a.id, name: a.name })),
    voice: [...online].filter(([, s]) => s.voice && s.serverId === communities.currentId()).map(([sid, s]) => {
      const a = db.accounts[s.accountId];
      return {
        sid,
        accountId: s.accountId,
        channel: s.voice,
        muted: s.muted,
        deafened: s.deafened,
        sharing: s.sharing,
        paused: s.paused,
        camera: s.camera,
        viewers: [...online].filter(([, viewer]) => viewer.voice === s.voice && viewer.watching?.has(sid)).map(([viewerId]) => viewerId),
        // "silenced": ninguém deve ouvir essa pessoa (mutada pelo servidor, de castigo ou sem permissão de falar).
        silenced: !!a.serverMuted || timedOut(a) || !can(a, 'SPEAK'),
      };
    }),
  };
}

function stateFor(acc, shared = sharedState()) {
  const perms = permsOf(acc);
  const visibleChannels = db.channels.filter((c) => canView(acc, c));
  return {
    serverId: communities.current().id || null,
    servers: communities.list(acc.id),
    people: (() => {
      const social = socialFor(acc);
      const ids = new Set([acc.id, ...social.friends, ...social.incoming, ...social.outgoing, ...social.blocked, ...social.dms.map((d) => d.userId)]);
      return publicProfiles(ids);
    })(),
    ownerId: db.ownerId,
    serverName: db.serverName || 'Resenha',
    serverIcon: db.serverIcon ? '/avatars/' + db.serverIcon : null,
    soundboard: db.soundboard.map((s) => ({ id: s.id, name: s.name, duration: s.duration, url: '/servers/' + communities.currentId() + '/sounds/' + s.id })),
    roles: db.roles,
    channels: visibleChannels,
    categories: db.categories.filter((g) => perms.has('MANAGE_CHANNELS') || visibleChannels.some((c) => c.categoryId === g.id)),
    members: shared.members,
    voice: shared.voice.filter((v) => db.channels.some((c) => c.id === v.channel && canView(acc, c))),
    myPerms: [...perms],
    bans: perms.has('BAN') ? shared.bans : [],
  };
}

function clearScreenWatchers(sharer) {
  for (const viewer of online.values()) {
    viewer.watching?.delete(sharer);
    viewer.screenQuality?.delete(sharer);
  }
}

const SCREEN_CODECS = ['video/H264', 'video/VP9', 'video/VP8', 'video/AV1'];
function screenQuality(value = { mode: 'auto', maxHeight: 1080, background: false }) {
  if (!value || typeof value !== 'object' || !['auto', 'economy', 'source'].includes(value.mode)
      || !Number.isInteger(value.maxHeight) || value.maxHeight < 180 || value.maxHeight > 1080 || typeof value.background !== 'boolean') throw new Error('Qualidade de transmissão inválida.');
  const demand = { mode: value.mode, maxHeight: value.maxHeight, background: value.background };
  // Opcional: codecs que o aparelho de quem assiste decodifica por hardware (celulares).
  if (value.codecs !== undefined) {
    if (!Array.isArray(value.codecs) || value.codecs.length > 4 || value.codecs.some((c) => !SCREEN_CODECS.includes(c))) throw new Error('Qualidade de transmissão inválida.');
    if (value.codecs.length) demand.codecs = [...new Set(value.codecs)];
  }
  return demand;
}

function leaveVoice(socket) {
  const s = online.get(socket.id);
  if (!s || !s.voice) return;
  const room = 'voice:' + s.voice;
  socket.to(room).emit('voice:peer-left', { id: socket.id });
  socket.leave(room);
  clearScreenWatchers(socket.id);
  for (const target of s.watching || []) io.to(target).emit('screen:quality', { viewer: socket.id, demand: null });
  s.watching?.clear();
  s.screenQuality?.clear();
  s.voice = null;
  s.sharing = false;
  s.camera = false;
}

// Aplica as regras de voz depois de qualquer mudança de cargo, canal ou castigo.
function enforceVoice() {
  for (const [sid, s] of online) {
    if (!s.voice) continue;
    communities.run(s.serverId, () => {
      const acc = db.accounts[s.accountId];
      const channel = db.channels.find((c) => c.id === s.voice);
      const socket = io.sockets.sockets.get(sid);
      if (!socket) return;
      if (!channel || !canView(acc, channel) || !can(acc, 'CONNECT')) {
        leaveVoice(socket);
        socket.emit('voice:force-leave', { reason: 'Você foi removido do canal de voz.' });
      } else if ((s.sharing || s.camera) && (!can(acc, 'STREAM') || timedOut(acc))) {
        clearScreenWatchers(sid);
        s.sharing = false;
        s.camera = false;
        socket.emit('voice:stop-share');
      }
    });
  }
}

// Várias mudanças seguidas (ex.: entrar na sala e já mutar) viram um único envio.
let broadcastQueued = false;
function broadcastState() {
  if (broadcastQueued) return;
  broadcastQueued = true;
  setImmediate(flushBroadcast);
}

function flushBroadcast() {
  if (!broadcastQueued) return;
  broadcastQueued = false;
  enforceVoice();
  const shared = new Map();
  for (const [sid, s] of online) {
    communities.run(s.serverId, () => {
      const acc = db.accounts[s.accountId];
      if (!shared.has(s.serverId)) shared.set(s.serverId, sharedState());
      if (acc) io.sockets.sockets.get(sid)?.emit('state', stateFor(acc, shared.get(s.serverId)));
    });
  }
}

// Reavalia o estado quando um castigo termina.
const timeoutTimers = new Map();
function scheduleTimeoutEnd(acc) {
  const key = communities.currentId() + ':' + acc.id;
  clearTimeout(timeoutTimers.get(key));
  const ms = (acc.timeoutUntil || 0) - Date.now();
  if (ms > 0) timeoutTimers.set(key, setTimeout(broadcastState, Math.min(ms + 100, 2 ** 31 - 1)));
}
for (const id of Object.keys(communities.root.servers)) communities.run(id, () => Object.values(db.accounts).forEach(scheduleTimeoutEnd));

function emitToViewers(channel, event, payload) {
  for (const [sid, s] of online) {
    if (s.serverId === communities.currentId() && canView(db.accounts[s.accountId], channel)) io.to(sid).emit(event, payload);
  }
}

const cleanName = (s, max = 32) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, max);
const cleanColor = (c, fallback = '#5865f2') => (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

function selectServer(socket, accountId, id) {
  leaveVoice(socket);
  online.get(socket.id).serverId = id;
  db.accounts[accountId].lastServerId = id;
  save();
  broadcastState();
}

function removeMembership(accountId, reason) {
  communities.membership(accountId).active = false;
  for (const socket of socketsOf(accountId, true)) {
    selectServer(socket, accountId, communities.choose(accountId));
    socket.emit('server:removed', { reason });
  }
}

// ---------------- eventos ----------------
io.on('connection', (socket) => {
  const me = () => {
    const s = online.get(socket.id);
    return s && db.accounts[s.accountId];
  };

  // Todo handler que exige login passa por aqui; responde {error} quando falha.
  const on = (event, handler) => {
    socket.on(event, (payload, ack) => {
      communities.run(online.get(socket.id)?.serverId ?? null, () => {
        const acc = me();
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!acc) return reply({ error: 'Não autenticado' });
        try {
          const result = handler(acc, payload || {});
          // Quem fez a ação recebe o estado novo antes da confirmação.
          flushBroadcast();
          reply(result || { ok: true });
        } catch (err) {
          reply({ error: err.message });
        }
      });
    });
  };
  const fail = (msg) => { throw new Error(msg); };

  on('server:create', (acc, { name }) => {
    const clean = cleanName(name, 32);
    if (clean.length < 2) fail('O nome do servidor precisa ter pelo menos 2 caracteres.');
    if (!allow('server-create:' + acc.id, 5, 60_000)) fail('Muitos servidores criados seguidos. Aguarde um minuto.');
    const community = communities.create(acc.id, clean);
    selectServer(socket, acc.id, community.id);
    return { id: community.id };
  });
  on('server:select', (acc, { id }) => {
    if (!communities.joined(acc.id, id)) fail('Você não participa deste servidor.');
    if (online.get(socket.id).serverId !== id) selectServer(socket, acc.id, id);
    return { id };
  });
  on('server:invite', (acc, { rotate }) => {
    if (!communities.joined(acc.id)) fail('Entre em um servidor para convidar amigos.');
    if (rotate) {
      if (!can(acc, 'ADMIN')) fail('Só administradores podem revogar o convite anterior.');
      if (!allow('invite-rotate:' + acc.id, 10, 60_000)) fail('Aguarde antes de renovar o convite.');
      communities.current().inviteCode = communities.inviteCode();
      save();
    }
    return { code: communities.current().inviteCode, name: db.serverName };
  });
  on('server:join', (acc, { code }) => {
    if (!allow('invite-join:' + acc.id, 20, 60_000)) fail('Muitos convites seguidos. Aguarde um minuto.');
    const community = communities.byInvite(code);
    if (!community) fail('Convite inválido ou revogado. Peça um novo link.');
    communities.join(acc.id, community);
    if (online.get(socket.id).serverId !== community.id) selectServer(socket, acc.id, community.id);
    else broadcastState();
    save();
    return { id: community.id };
  });
  on('server:leave', (acc) => {
    if (!communities.joined(acc.id)) fail('Servidor não encontrado.');
    if (isOwner(acc)) fail('O dono precisa permanecer no servidor.');
    removeMembership(acc.id, 'Você saiu do servidor.');
    save();
    broadcastState();
  });
  on('server:delete', (acc, { id, name }) => {
    const community = communities.current();
    if (!community.id || id !== community.id || !communities.joined(acc.id)) fail('Servidor não encontrado.');
    if (!isOwner(acc)) fail('Só o dono pode excluir o servidor.');
    if (name !== community.serverName) fail('Digite o nome atual do servidor para confirmar a exclusão.');
    const channels = new Set(community.channels.map((c) => c.id));
    for (const channelId of channels) {
      (db.messages[channelId] || []).forEach(deleteAttachments);
      delete db.messages[channelId];
    }
    for (const upload of Object.values(db.uploads)) {
      if (upload.serverId === id || channels.has(upload.channelId)) deleteUpload(upload.id);
    }
    for (const [key, timer] of timeoutTimers) {
      if (key.startsWith(id + ':')) { clearTimeout(timer); timeoutTimers.delete(key); }
    }
    const soundFiles = community.soundboard.map((s) => s.file);
    delete communities.root.servers[id];
    soundFiles.forEach(removeSoundIfUnused);
    if (communities.root.defaultServerId === id) communities.root.defaultServerId = Object.keys(communities.root.servers)[0] || null;
    for (const account of Object.values(db.accounts)) {
      for (const channelId of channels) if (account.lastRead) delete account.lastRead[channelId];
      if (account.lastServerId === id) account.lastServerId = communities.choose(account.id);
    }
    for (const [sid, session] of online) {
      if (session.serverId !== id) continue;
      const affected = io.sockets.sockets.get(sid);
      if (!affected) continue;
      selectServer(affected, session.accountId, communities.choose(session.accountId));
      affected.emit('server:removed', { reason: `O servidor ${community.serverName} foi excluído.` });
    }
    removeImageIfUnused(community.serverIcon);
    save();
    broadcastState();
  });

  const ip = clientIp(socket.handshake.headers, socket.handshake.address);

  socket.on('auth', async (payload, ack) => {
    if (typeof ack !== 'function' || online.has(socket.id) || socket.data.authing) return;
    socket.data.authing = true;
    try {
      await authenticate(payload || {}, ack);
    } catch (error) {
      console.error('Falha na autenticação:', error.message);
      ack({ error: 'Não foi possível entrar. Tente novamente.' });
    } finally {
      socket.data.authing = false;
    }
  });

  async function authenticate(payload, ack) {
    let acc;
    if (payload.token) {
      acc = db.accounts[db.sessions[payload.token]];
      if (!acc) return ack({ error: 'Sessão expirada, entre de novo.' });
    } else {
      const name = cleanName(payload.name);
      const password = String(payload.password || '');
      const existing = Object.values(db.accounts).find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (payload.mode === 'register') {
        if (name.length < 2) return ack({ error: 'Nome muito curto' });
        if (password.length < 4) return ack({ error: 'A senha precisa ter pelo menos 4 caracteres' });
        if (password.length > 128) return ack({ error: 'A senha deve ter até 128 caracteres.' });
        if (payload.confirmPassword !== password) return ack({ error: 'As senhas não coincidem. Confirme sua senha.' });
        if (existing) return ack({ error: 'Esse nome já está em uso' });
        if (!allow('register:' + ip, 20, 60 * 60 * 1000)) return ack({ error: 'Muitas contas criadas daqui. Tente mais tarde.' });
        const secret = await hashPassword(password);
        // Outra pessoa pode ter pegado o nome enquanto o hash era calculado.
        if (Object.values(db.accounts).some((a) => a.name.toLowerCase() === name.toLowerCase())) return ack({ error: 'Esse nome já está em uso' });
        acc = { id: newId(), name, color: cleanColor(payload.color), createdAt: Date.now(), ...secret };
        db.accounts[acc.id] = acc;
        // A primeira conta criada vira dona do servidor.
        const legacy = communities.root.servers[communities.root.defaultServerId];
        // Only the first account bootstraps a fresh installation. All later accounts
        // start outside servers and explicitly accept an invite or create their own.
        if (legacy && !legacy.ownerId) {
          communities.join(acc.id, legacy);
          legacy.ownerId = acc.id;
        }
      } else {
        const key = ip + '|' + name.toLowerCase();
        const locked = loginLocked(key);
        if (locked) return ack({ error: `Muitas tentativas erradas. Tente de novo em ${locked} s.` });
        if (!existing || !(await checkPassword(existing, password))) {
          loginFailed(key);
          await new Promise((r) => setTimeout(r, 800)); // atrasa tentativas de adivinhar senha
          return ack({ error: 'Nome ou senha incorretos' });
        }
        loginFailures.delete(key);
        acc = existing;
      }
    }
    const token = payload.token || createSession(acc.id);
    const serverId = communities.choose(acc.id, payload.serverId || acc.lastServerId);
    online.set(socket.id, { accountId: acc.id, serverId, voice: null, muted: false, deafened: false, sharing: false, camera: false });
    save();
    ack({ token, accountId: acc.id, serverId, sid: socket.id, iceServers: iceServers(), permNames: PERMS, maxUploadMb: MAX_UPLOAD_MB });
    socket.emit('social', socialFor(acc));
    broadcastState();
  }

  on('logout', (acc, { token }) => {
    if (db.sessions[token] === acc.id) delete db.sessions[token];
    save();
  });

  on('profile', (acc, { color, avatar }) => {
    const previousAvatar = acc.avatar;
    let nextAvatar = previousAvatar;
    if (avatar !== undefined) {
      if (!allow('avatar:' + acc.id, 10, 60 * 1000)) fail('Muitas trocas de foto. Aguarde um minuto.');
      if (avatar === null) nextAvatar = null;
      else nextAvatar = storeImage(avatar);
      acc.avatarCrop = null;
    }
    acc.avatar = nextAvatar || null;
    acc.color = cleanColor(color, acc.color);
    save();
    broadcastState();
    if (previousAvatar !== nextAvatar) removeImageIfUnused(previousAvatar);
    return { ok: true, avatarUrl: acc.avatar ? '/avatars/' + acc.avatar : null };
  });

  on('member:nickname', (acc, { nickname, serverId }) => {
    if (!communities.joined(acc.id)) fail('Entre em um servidor para editar seu nome nele.');
    if (serverId && serverId !== communities.currentId()) fail('O servidor mudou. Abra a edição novamente.');
    if (nickname !== null && typeof nickname !== 'string') fail('Nome no servidor inválido.');
    if (typeof nickname === 'string' && /[\x00-\x1f\x7f]/.test(nickname)) fail('O nome não pode conter caracteres de controle.');
    const name = (nickname || '').normalize('NFC').trim().replace(/\s+/g, ' ');
    if (name.length > 32) fail('O nome no servidor deve ter até 32 caracteres.');
    if (!allow('nickname:' + acc.id, 10, 60000)) fail('Muitas mudanças de nome. Aguarde um minuto.');
    acc.nickname = name || null;
    save(); broadcastState();
    return { ok: true, nickname: acc.nickname, name: acc.nickname || acc.name };
  });

  // --- Chat ---
  const textChannel = (acc, id) => {
    const c = db.channels.find((ch) => ch.id === id && ch.type === 'text');
    if (!c || !canView(acc, c)) fail('Canal não encontrado');
    return c;
  };

  // Um canal do servidor ou uma conversa privada (id "dm-…"): o chat funciona igual nos dois.
  const chatTarget = (acc, id) => {
    if (!isDmId(id)) return textChannel(acc, id);
    const dm = db.dms[id];
    if (!dm || !dm.users.includes(acc.id)) fail('Conversa não encontrada');
    return { id: dm.id, dm };
  };

  // Mensagem direta só entre amigos. Não revela quem bloqueou quem.
  const dmPeer = (acc, dm) => {
    const peer = presentAccount(dm.users.find((u) => u !== acc.id));
    if (!peer) fail('Essa pessoa não está mais no servidor.');
    if (hasBlocked(acc.id, peer.id) || hasBlocked(peer.id, acc.id)) fail('Não foi possível enviar a mensagem.');
    if (!areFriends(acc.id, peer.id)) fail('Vocês não são mais amigos. Adicione de novo para voltar a conversar.');
    return peer;
  };

  const emitToChat = (c, event, payload) => {
    if (!c.dm) return emitToViewers(c, event, payload);
    for (const id of c.dm.users) for (const s of socketsOf(id)) s.emit(event, payload);
  };

  // Numa conversa privada, toda mensagem da outra pessoa conta como menção (badge vermelho).
  const mentionsFor = (acc, c, text, replyAuthorId) => (c.dm
    ? { users: c.dm.users.filter((u) => u !== acc.id), roles: [], everyone: false }
    : parseMentions(acc, text, replyAuthorId));

  on('chat:history', (acc, { channel }) => {
    const messages = db.messages[chatTarget(acc, channel).id] || [];
    return { messages, authors: publicProfiles(messages.map((msg) => msg.authorId)) };
  });

  const findMessage = (acc, channel, id) => {
    const c = chatTarget(acc, channel);
    const list = db.messages[c.id] || [];
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) fail('Mensagem não encontrada');
    return { c, list, i, msg: list[i] };
  };

  on('chat:send', (acc, { channel, text, attachments, replyTo }) => {
    const c = chatTarget(acc, channel);
    text = String(text || '').trim().slice(0, 4000);
    const peer = c.dm ? dmPeer(acc, c.dm) : null;
    if (!c.dm && !can(acc, 'SEND_MESSAGES')) fail('Você não tem permissão para enviar mensagens.');
    if (!c.dm && timedOut(acc)) fail('Você está de castigo.');
    if (!allow('chat:' + acc.id, 10, 5000)) fail('Você está enviando mensagens rápido demais. Espere um pouco.');
    const ids = [...new Set(Array.isArray(attachments) ? attachments : [])].slice(0, MAX_ATTACHMENTS);
    const ups = ids.map((id) => db.uploads[id]);
    if (ups.some((up) => !up || up.uploaderId !== acc.id || up.messageId
      || (up.serverId !== undefined && up.serverId !== (c.dm ? null : communities.currentId()))
      || (up.channelId && up.channelId !== c.id))) fail('Anexo inválido, envie o arquivo de novo.');
    if (!text && !ups.length) return;
    const list = (db.messages[c.id] ||= []);
    const replied = replyTo ? list.find((m) => m.id === replyTo) : null;
    const msg = { id: newId(), authorId: acc.id, text, ts: Date.now() };
    if (ups.length) {
      msg.attachments = ups.map((up) => ({ id: up.id, name: up.name, size: up.size, type: up.type, url: '/uploads/' + up.file }));
      ups.forEach((up) => (up.messageId = msg.id));
    }
    if (replied) msg.replyTo = replied.id;
    msg.mentions = mentionsFor(acc, c, text, replied?.authorId);
    list.push(msg);
    while (list.length > MAX_MESSAGES) deleteAttachments(list.shift());
    (acc.lastRead ||= {})[c.id] = msg.ts;
    // A conversa aparece na lista de quem recebe a primeira mensagem e volta para quem a tinha fechado.
    const listChanged = c.dm && (list.length === 1 || c.dm.closed?.[peer.id] || c.dm.closed?.[acc.id]);
    if (c.dm) c.dm.closed = {};
    emitToChat(c, 'chat:message', { channel: c.id, msg, author: publicProfiles([acc.id])[0] });
    if (listChanged) pushSocial(acc.id, peer.id);
    save();
  });

  on('chat:edit', (acc, { channel, id, text }) => {
    const { c, list, msg } = findMessage(acc, channel, id);
    text = String(text || '').trim().slice(0, 4000);
    if (msg.authorId !== acc.id) fail('Só dá para editar suas mensagens.');
    if (c.dm) dmPeer(acc, c.dm);
    else if (timedOut(acc)) fail('Você está de castigo.');
    if (!text && !msg.attachments?.length) return;
    msg.text = text;
    msg.edited = Date.now();
    msg.mentions = mentionsFor(acc, c, text, list.find((m) => m.id === msg.replyTo)?.authorId);
    emitToChat(c, 'chat:update', { channel: c.id, msg });
    save();
  });

  on('chat:delete', (acc, { channel, id }) => {
    const { c, list, i, msg } = findMessage(acc, channel, id);
    // Numa conversa privada, ninguém (nem a moderação) apaga a mensagem do outro.
    if (msg.authorId !== acc.id && (c.dm || !can(acc, 'MANAGE_MESSAGES'))) fail('Sem permissão para apagar essa mensagem.');
    list.splice(i, 1);
    deleteAttachments(msg);
    emitToChat(c, 'chat:delete', { channel: c.id, id });
    save();
  });

  on('chat:react', (acc, { channel, id, emoji }) => {
    const { c, msg } = findMessage(acc, channel, id);
    emoji = String(emoji || '');
    if (!emoji || emoji.length > 16 || /[\s<>]/.test(emoji)) fail('Emoji inválido');
    if (c.dm) dmPeer(acc, c.dm);
    else if (timedOut(acc)) fail('Você está de castigo.');
    if (!allow('react:' + acc.id, 20, 5000)) fail('Calma! Reações rápidas demais.');
    const reactions = (msg.reactions ||= {});
    const users = reactions[emoji] || [];
    if (users.includes(acc.id)) reactions[emoji] = users.filter((u) => u !== acc.id);
    else {
      if (!reactions[emoji] && Object.keys(reactions).length >= 20) fail('Limite de reações nesta mensagem');
      reactions[emoji] = [...users, acc.id];
    }
    if (!reactions[emoji].length) delete reactions[emoji];
    emitToChat(c, 'chat:update', { channel: c.id, msg });
    save();
  });

  on('chat:read', (acc, { channel }) => {
    const c = chatTarget(acc, channel);
    (acc.lastRead ||= {})[c.id] = Date.now();
    save();
  });

  // Quais canais têm mensagens não lidas e quantas menções a você.
  on('chat:unread', (acc) => {
    const lastRead = (acc.lastRead ||= {});
    const result = {};
    for (const c of db.channels) {
      if (c.type !== 'text' || !canView(acc, c)) continue;
      lastRead[c.id] ??= Date.now();
      const fresh = (db.messages[c.id] || []).filter((m) => m.ts > lastRead[c.id] && m.authorId !== acc.id);
      if (fresh.length) result[c.id] = { unread: true, mentions: fresh.filter((m) => mentionsAccount(m, acc)).length };
    }
    // Conversas privadas: quem nunca abriu a conversa tem tudo como não lido.
    for (const dm of Object.values(db.dms)) {
      if (!dm.users.includes(acc.id) || dm.closed?.[acc.id]) continue;
      const fresh = (db.messages[dm.id] || []).filter((m) => m.ts > (lastRead[dm.id] ?? 0) && m.authorId !== acc.id);
      if (fresh.length) result[dm.id] = { unread: true, mentions: fresh.length };
    }
    save();
    return { unread: result };
  });

  on('typing', (acc, { channel }) => {
    if (!allow('typing:' + acc.id, 3, 3000)) return;
    if (isDmId(channel)) {
      const dm = db.dms[channel];
      if (dm?.users.includes(acc.id)) for (const s of socketsOf(dm.users.find((u) => u !== acc.id))) s.emit('typing', { channel, name: acc.name });
      return;
    }
    const c = db.channels.find((ch) => ch.id === channel);
    if (c) for (const [sid, s] of online) {
      if (sid !== socket.id && s.serverId === communities.currentId() && canView(db.accounts[s.accountId], c)) io.to(sid).emit('typing', { channel, name: acc.nickname || acc.name });
    }
  });

  // --- Amigos e mensagens diretas ---
  const cleanId = (id) => (typeof id === 'string' && /^[0-9a-f]{16}$/.test(id) ? id : '');
  const relationCount = (id) => {
    let friends = 0;
    let pending = 0;
    for (const [key, f] of Object.entries(db.friendships)) {
      if (!key.split('-').includes(id)) continue;
      if (f.status === 'friends') friends++;
      else pending++;
    }
    return { friends, pending };
  };
  const tellOthers = (id, text) => socketsOf(id).forEach((s) => s.emit('notice', text));

  function makeFriends(a, b) {
    if (relationCount(a.id).friends >= MAX_FRIENDS || relationCount(b.id).friends >= MAX_FRIENDS) fail(`O limite é de ${MAX_FRIENDS} amigos.`);
    db.friendships[pairKey(a.id, b.id)] = { status: 'friends', from: a.id, ts: Date.now() };
  }

  // Pede amizade pelo nome de usuário (aba "Adicionar amigo") ou pelo id (cartão de perfil).
  on('friend:request', (acc, { name, id }) => {
    if (!allow('friend:' + acc.id, 10, 60 * 1000)) fail('Muitos pedidos seguidos. Espere um pouco.');
    const wanted = cleanName(name).toLowerCase();
    const target = cleanId(id)
      ? presentAccount(id)
      : wanted && Object.values(db.accounts).find((a) => a.name.toLowerCase() === wanted);
    if (!target) fail('Não encontramos ninguém com esse nome.');
    if (target.id === acc.id) fail('Você não pode adicionar a si mesmo.');
    if (hasBlocked(acc.id, target.id)) fail('Você bloqueou essa pessoa. Desbloqueie para adicioná-la.');
    if (hasBlocked(target.id, acc.id)) fail('Não foi possível enviar o pedido para essa pessoa.');
    const current = friendshipOf(acc.id, target.id);
    if (current?.status === 'friends') fail('Vocês já são amigos.');
    if (current?.status === 'pending' && current.from === acc.id) fail('Você já enviou um pedido para essa pessoa.');
    if (current?.status === 'pending') {
      // Ela já tinha pedido a sua amizade: o pedido cruzado vira amizade na hora.
      makeFriends(acc, target);
      tellOthers(target.id, `${acc.name} aceitou seu pedido de amizade.`);
      pushSocial(acc.id, target.id);
      save();
      return { status: 'friends', name: target.name };
    }
    if (relationCount(acc.id).pending >= MAX_PENDING_REQUESTS || relationCount(target.id).pending >= MAX_PENDING_REQUESTS) fail('Há pedidos pendentes demais. Tente mais tarde.');
    db.friendships[pairKey(acc.id, target.id)] = { status: 'pending', from: acc.id, ts: Date.now() };
    tellOthers(target.id, `${acc.name} quer ser seu amigo.`);
    pushSocial(acc.id, target.id);
    save();
    return { status: 'pending', name: target.name };
  });

  on('friend:accept', (acc, { id }) => {
    const f = friendshipOf(acc.id, cleanId(id));
    if (!f || f.status !== 'pending' || f.from === acc.id || !presentAccount(id)) fail('Esse pedido não existe mais.');
    makeFriends(acc, db.accounts[id]);
    tellOthers(id, `${acc.name} aceitou seu pedido de amizade.`);
    pushSocial(acc.id, id);
    save();
  });

  // Recusa um pedido recebido ou cancela um pedido enviado.
  on('friend:decline', (acc, { id }) => {
    const f = friendshipOf(acc.id, cleanId(id));
    if (f?.status === 'pending') {
      delete db.friendships[pairKey(acc.id, id)];
      pushSocial(acc.id, id);
      save();
    }
  });

  on('friend:remove', (acc, { id }) => {
    const f = friendshipOf(acc.id, cleanId(id));
    if (f?.status === 'friends') {
      delete db.friendships[pairKey(acc.id, id)];
      pushSocial(acc.id, id);
      save();
    }
  });

  // Bloquear desfaz a amizade e impede pedidos e mensagens privadas nos dois sentidos.
  on('friend:block', (acc, { id }) => {
    if (!cleanId(id) || !db.accounts[id] || id === acc.id) fail('Pessoa não encontrada.');
    const list = (db.blocks[acc.id] ||= []);
    if (!list.includes(id)) {
      if (list.length >= MAX_BLOCKS) fail('Você bloqueou gente demais. Desbloqueie alguém primeiro.');
      list.push(id);
    }
    delete db.friendships[pairKey(acc.id, id)];
    pushSocial(acc.id, id);
    save();
  });

  on('friend:unblock', (acc, { id }) => {
    db.blocks[acc.id] = (db.blocks[acc.id] || []).filter((b) => b !== id);
    if (!db.blocks[acc.id].length) delete db.blocks[acc.id];
    pushSocial(acc.id);
    save();
  });

  // Abre (ou cria) a conversa privada com um amigo.
  on('dm:open', (acc, { userId }) => {
    const other = presentAccount(cleanId(userId));
    if (!other || other.id === acc.id) fail('Pessoa não encontrada.');
    const id = dmIdOf(acc.id, other.id);
    if (!db.dms[id]) {
      if (!areFriends(acc.id, other.id) || hasBlocked(acc.id, other.id) || hasBlocked(other.id, acc.id)) fail('Só dá para conversar em privado com amigos.');
      db.dms[id] = { id, users: [acc.id, other.id].sort(), closed: {} };
      db.messages[id] ||= [];
    }
    delete db.dms[id].closed?.[acc.id];
    (acc.lastRead ||= {})[id] ??= 0;
    pushSocial(acc.id);
    save();
    return { id };
  });

  // Tira a conversa da lista. O histórico continua e ela volta quando chegar mensagem nova.
  on('dm:close', (acc, { id }) => {
    const dm = isDmId(id) && db.dms[id];
    if (!dm || !dm.users.includes(acc.id)) return;
    (dm.closed ||= {})[acc.id] = true;
    (acc.lastRead ||= {})[id] = Date.now();
    pushSocial(acc.id);
    save();
  });

  // --- Voz ---
  on('voice:join', (acc, { channel }) => {
    const c = db.channels.find((ch) => ch.id === channel && ch.type === 'voice');
    if (!c || !canView(acc, c)) fail('Canal não encontrado');
    if (!can(acc, 'CONNECT')) fail('Você não tem permissão para entrar em canais de voz.');
    leaveVoice(socket);
    const room = 'voice:' + c.id;
    // Quem entra recebe a lista dos que já estão na sala e inicia as conexões com eles.
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])];
    socket.join(room);
    online.get(socket.id).voice = c.id;
    broadcastState();
    return { peers };
  });

  on('voice:leave', () => {
    leaveVoice(socket);
    broadcastState();
  });

  on('voice:state', (acc, { muted, deafened, sharing, paused, camera }) => {
    const s = online.get(socket.id);
    const video = !!s.voice && can(acc, 'STREAM') && !timedOut(acc);
    s.muted = !!muted;
    s.deafened = !!deafened;
    s.sharing = !!sharing && video;
    if (!s.sharing) clearScreenWatchers(socket.id);
    // Transmissão pausada: a janela compartilhada foi minimizada (o navegador para de capturar).
    s.paused = s.sharing && !!paused;
    s.camera = !!camera && video;
    broadcastState();
  });

  // Watching is explicit, ephemeral and limited to the same authorized voice room.
  on('screen:watch', (acc, { target, watching, quality }) => {
    const viewer = online.get(socket.id);
    const source = online.get(target);
    if (typeof watching !== 'boolean' || typeof target !== 'string' || target === socket.id) fail('Transmissão inválida.');
    if (!watching) {
      const subscribed = viewer.watching?.delete(target);
      viewer.screenQuality?.delete(target);
      if (subscribed) io.to(target).emit('screen:quality', { viewer: socket.id, demand: null });
      broadcastState();
      return;
    }
    const channel = db.channels.find((c) => c.id === source?.voice);
    if (!viewer.voice || !source?.sharing || viewer.voice !== source.voice || !channel || !canView(acc, channel) || !can(acc, 'CONNECT')) fail('Essa transmissão não está disponível nesta sala.');
    const demand = screenQuality(quality);
    viewer.watching ||= new Set();
    viewer.watching.add(target);
    viewer.screenQuality ||= new Map();
    viewer.screenQuality.set(target, demand);
    io.to(target).emit('screen:quality', { viewer: socket.id, demand });
    broadcastState();
  });

  // Only subscribed viewers can request quality. Resize updates go to the source,
  // not into persistent state or a server-wide broadcast.
  on('screen:quality', (acc, { target, quality }) => {
    const viewer = online.get(socket.id), source = online.get(target);
    const channel = db.channels.find((c) => c.id === source?.voice);
    if (!viewer.voice || !source?.sharing || !viewer.watching?.has(target) || viewer.voice !== source.voice
        || !channel || !canView(acc, channel) || !can(acc, 'CONNECT')) fail('Essa transmissão não está disponível nesta sala.');
    const demand = screenQuality(quality);
    if (!allow('screen-quality:' + socket.id + ':' + target, 24, 5000)) fail('Aguarde antes de ajustar a transmissão novamente.');
    const previous = viewer.screenQuality?.get(target);
    if (previous && JSON.stringify(previous) === JSON.stringify(demand)) return;
    viewer.screenQuality ||= new Map();
    viewer.screenQuality.set(target, demand);
    io.to(target).emit('screen:quality', { viewer: socket.id, demand });
  });

  // Efeito sonoro: todo mundo da sala toca o mesmo som.
  on('sound:play', (acc, { sound }) => {
    const s = online.get(socket.id);
    if (!SOUNDBOARD.includes(sound) && !db.soundboard.some((s) => s.id === sound)) fail('Som desconhecido');
    if (!s.voice) fail('Entre numa sala de voz para usar efeitos sonoros.');
    if (!can(acc, 'SOUNDBOARD')) fail('Você não tem permissão para usar efeitos sonoros.');
    if (timedOut(acc)) fail('Você está de castigo.');
    if (!allow('sound:' + acc.id, 4, 10000)) fail('Calma! Muitos efeitos sonoros seguidos.');
    io.to('voice:' + s.voice).emit('sound', { sound, from: acc.id });
  });

  on('sound:remove', (acc, { id }) => {
    if (!can(acc, 'MANAGE_SOUNDBOARD')) fail('Você não pode gerenciar os efeitos deste servidor.');
    const sound = db.soundboard.find((s) => s.id === id);
    if (!sound) fail('Efeito não encontrado neste servidor.');
    db.soundboard = db.soundboard.filter((s) => s.id !== id);
    save(); broadcastState(); removeSoundIfUnused(sound.file);
    return { ok: true };
  });

  // Repassa ofertas/respostas/ICE entre dois participantes da mesma sala.
  socket.on('signal', ({ to, data } = {}) => {
    const from = online.get(socket.id);
    const target = online.get(to);
    if (!from || !target || !from.voice || from.voice !== target.voice || from.serverId !== target.serverId) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // --- Moderação ---
  on('mod', (acc, { action, target, value }) => {
    const t = db.accounts[target];
    if (!t || !communities.membership(t.id)) fail('Membro não encontrado');
    const self = t.id === acc.id;
    const need = (perm) => { if (!can(acc, perm)) fail('Você não tem permissão para isso.'); };
    const needRank = () => { if (!outranks(acc, t)) fail('Essa pessoa tem um cargo igual ou maior que o seu.'); };

    switch (action) {
      case 'serverMute':
      case 'serverDeafen':
        need('MUTE_MEMBERS');
        if (!self) needRank();
        t[action === 'serverMute' ? 'serverMuted' : 'serverDeafened'] = !!value;
        break;
      case 'disconnect':
        need('MOVE_MEMBERS');
        if (!self) needRank();
        for (const s of socketsOf(t.id, true)) {
          if (!online.get(s.id).voice) continue;
          leaveVoice(s);
          s.emit('voice:force-leave', { reason: `${acc.name} desconectou você da voz.` });
        }
        break;
      case 'move': {
        need('MOVE_MEMBERS');
        if (!self) needRank();
        const c = db.channels.find((ch) => ch.id === value && ch.type === 'voice');
        if (!c || !canView(t, c)) fail('Essa pessoa não pode entrar nesse canal.');
        for (const s of socketsOf(t.id, true)) if (online.get(s.id).voice) s.emit('voice:force-move', { channel: c.id, by: acc.name });
        break;
      }
      case 'timeout': {
        need('TIMEOUT');
        if (self) fail('Você não pode castigar a si mesmo.');
        needRank();
        const minutes = Math.max(0, Math.min(Number(value) || 0, 28 * 24 * 60));
        t.timeoutUntil = minutes ? Date.now() + minutes * 60000 : 0;
        scheduleTimeoutEnd(t);
        for (const s of socketsOf(t.id, true)) {
          s.emit('notice', minutes ? `${acc.name} colocou você de castigo por ${formatMinutes(minutes)}.` : `${acc.name} removeu seu castigo.`);
        }
        break;
      }
      case 'kick':
      case 'ban':
        need(action === 'kick' ? 'KICK' : 'BAN');
        if (self) fail('Você não pode fazer isso consigo mesmo.');
        needRank();
        if (action === 'ban') t.banned = true;
        removeMembership(t.id, action === 'ban' ? `Você foi banido por ${acc.name}.` : `Você foi expulso por ${acc.name}.`);
        break;
      case 'unban':
        need('BAN');
        t.banned = false;
        break;
      case 'setRoles': {
        need('MANAGE_ROLES');
        if (!self) needRank();
        const wanted = new Set((Array.isArray(value) ? value : []).filter((id) => id !== 'everyone' && roleIndex(id) > 0));
        const changed = [...wanted].filter((id) => !t.roles.includes(id)).concat(t.roles.filter((id) => !wanted.has(id)));
        if (changed.some((id) => roleIndex(id) >= topPosition(acc))) fail('Você só pode dar ou tirar cargos abaixo do seu.');
        t.roles = [...wanted];
        break;
      }
      default:
        fail('Ação desconhecida');
    }
    save();
    broadcastState();
  });

  // --- Cargos ---
  on('role', (acc, { action, id, name, color, hoist, perms, dir }) => {
    if (!can(acc, 'MANAGE_ROLES')) fail('Você não tem permissão para gerenciar cargos.');
    const myTop = topPosition(acc);
    const myPerms = permsOf(acc);
    const checkPerms = (list, old = []) => {
      list = [...new Set((Array.isArray(list) ? list : []).filter((p) => PERMS[p]))];
      // Ninguém pode dar a um cargo uma permissão que não tem.
      if (list.some((p) => !old.includes(p) && !myPerms.has(p))) fail('Você não pode dar permissões que você não tem.');
      return list;
    };
    const editable = (roleId) => {
      const i = roleIndex(roleId);
      if (i < 0) fail('Cargo não encontrado');
      if (i >= myTop) fail('Você só pode mexer em cargos abaixo do seu.');
      return i;
    };

    if (action === 'create') {
      const role = { id: newId(), name: cleanName(name, 32) || 'novo cargo', color: cleanColor(color, '#99aab5'), hoist: !!hoist, perms: checkPerms(perms) };
      // Como no Discord, cargo novo entra no fim da hierarquia (logo acima do @everyone).
      db.roles.splice(1, 0, role);
      save();
      broadcastState();
      return { id: role.id };
    }
    if (action === 'update') {
      const role = db.roles[editable(id)];
      if (role.id !== 'everyone') {
        role.name = cleanName(name, 32) || role.name;
        role.color = color ? cleanColor(color, role.color) : '';
        role.hoist = !!hoist;
      }
      role.perms = checkPerms(perms, role.perms);
    } else if (action === 'delete') {
      const i = editable(id);
      if (id === 'everyone') fail('O cargo @everyone não pode ser apagado.');
      db.roles.splice(i, 1);
      for (const a of Object.values(db.accounts).filter((a) => communities.membership(a.id))) a.roles = a.roles.filter((r) => r !== id);
      for (const c of db.channels) c.allowedRoles = c.allowedRoles.filter((r) => r !== id);
    } else if (action === 'move') {
      const i = editable(id);
      const j = i + (dir > 0 ? 1 : -1);
      if (i === 0 || j <= 0 || j >= db.roles.length || j >= myTop) fail('Não dá para mover para lá.');
      [db.roles[i], db.roles[j]] = [db.roles[j], db.roles[i]];
    } else {
      fail('Ação desconhecida');
    }
    save();
    broadcastState();
  });

  // --- Servidor ---
  // Nome e ícone do servidor (ícone: imagem PNG já recortada no navegador, conferida de novo aqui).
  on('server:update', (acc, { name, icon }) => {
    if (!can(acc, 'ADMIN')) fail('Só administradores podem mudar o servidor.');
    let clean = db.serverName;
    if (name !== undefined) {
      clean = cleanName(name, 32);
      if (clean.length < 2) fail('O nome do servidor precisa ter pelo menos 2 caracteres.');
    }
    const previousIcon = db.serverIcon || null;
    let nextIcon = previousIcon;
    if (icon !== undefined) {
      if (!allow('server-icon:' + acc.id, 10, 60 * 1000)) fail('Muitas trocas de ícone. Aguarde um minuto.');
      nextIcon = icon === null ? null : storeImage(icon);
    }
    db.serverName = clean;
    db.serverIcon = nextIcon;
    save();
    broadcastState();
    if (previousIcon !== nextIcon) removeImageIfUnused(previousIcon);
  });

  // --- Canais ---
  on('category', (acc, payload) => {
    if (!can(acc, 'MANAGE_CHANNELS')) fail('Você não tem permissão para gerenciar canais.');
    const result = channelStore.category(payload);
    save();
    broadcastState();
    return result;
  });

  on('channel', (acc, payload) => {
    if (!can(acc, 'MANAGE_CHANNELS')) fail('Você não tem permissão para gerenciar canais.');
    // Não permite editar/copiar/reordenar canais ocultos por meio de IDs conhecidos.
    for (const id of [payload.action === 'create' ? null : payload.id, payload.beforeId]) {
      if (id == null) continue;
      const c = db.channels.find((ch) => ch.id === id);
      if (!c || !canView(acc, c)) fail('Canal não encontrado.');
    }
    const removedMessages = payload.action === 'delete' ? db.messages[payload.id] || [] : [];
    const result = channelStore.channel(payload);
    removedMessages.forEach(deleteAttachments);
    save();
    broadcastState();
    return result;
  });

  socket.on('disconnect', () => {
    leaveVoice(socket);
    online.delete(socket.id);
    broadcastState();
  });
});

function formatMinutes(m) {
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} dia(s)`;
}

server.listen(PORT, HOST, () => {
  console.log(`Resenhex rodando em http://${HOST}:${PORT}`);
});
