// Servidor do Resenhex (plataforma de chat e voz inspirada no Discord): contas, cargos e permissões, moderação,
// chat de texto com anexos, amigos e mensagens diretas, e sinalização WebRTC para voz, câmera e tela.
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { Server } = require('socket.io');
const { decodeAvatar, decodeBanner, decodeProfileBackground, decodeProfilePhoto, validateAvatarCrop } = require('./avatar');
const { decodeSound, soundName, MAX_SOUND_BYTES, MAX_SERVER_SOUNDS } = require('./soundboard');
const linkPreview = require('./link-preview');
const { channelActions } = require('./channels');
const { communityStore } = require('./communities');
const { downloadRoutes } = require('./downloads');
const { createDj } = require('./dj');
const { createMudae, CLAIM_WINDOW_MS, revealDelay, PRIORITY_MS } = require('./mudae');
const { youtubeSearch } = require('./youtube');
const { createDmCalls } = require('./dm-calls');
const { cleanGif } = require('./gifs');
const { version: APP_VERSION } = require('./package.json');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_MESSAGES = 300;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 50;
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
  MANAGE_EMOJIS: 'Gerenciar emojis',
  MUSIC: 'Usar o DJ (pedir e controlar músicas)',
  MUDAE: 'Usar o Mudae (rodar e casar com personagens)',
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
      { id: 'everyone', name: '@everyone', color: '', hoist: false, perms: ['SEND_MESSAGES', 'CONNECT', 'SPEAK', 'STREAM', 'SOUNDBOARD', 'MUSIC', 'MUDAE'] },
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
// Chamada numa conversa privada: a sala de voz tem o id da conversa e não pertence a servidor nenhum.
const isDmCall = (s) => !!s?.voice && isDmId(s.voice);
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
const { mediaSfu } = require('./media-sfu');
// O LiveKit caiu: quem está numa sala que usava o SFU reconecta em P2P.
let mediaSwitched = () => {};
const media = mediaSfu({ onSwitch: (...args) => mediaSwitched(...args), membership: (sid) => {
  const s = online.get(sid);
  if (!s?.voice) return null;
  return communities.run(s.voiceServerId, () => {
    const acc = db.accounts[s.accountId];
    if (!acc) return null;
    const dm = isDmCall(s);
    return { server: s.voiceServerId, channel: s.voice,
      speak: dm || (can(acc, 'SPEAK') && !acc.serverMuted && !acc.serverDeafened && !timedOut(acc)),
      stream: dm || (can(acc, 'STREAM') && !timedOut(acc)), deafened: !dm && !!acc.serverDeafened };
  });
} });

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
app.post('/api/media/webhook', express.text({ type: 'application/webhook+json', limit: '128kb' }), async (req, res) => {
  try { await media.webhook(req.body, req.headers.authorization); res.sendStatus(204); }
  catch { res.sendStatus(401); }
});
app.get('/vendor/livekit-client.js', (_req, res) => res.sendFile(path.join(path.dirname(require.resolve('livekit-client')), 'livekit-client.umd.js')));
app.use((req, _res, next) => {
  const account = communities.root.accounts[db.sessions[req.get('x-token')]];
  communities.run(req.get('x-server-id') || account?.lastServerId || communities.root.defaultServerId, next);
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(downloadRoutes(DOWNLOAD_DIR, { storeId: process.env.MS_STORE_ID }));
app.get('/baixar', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'baixar.html')));
// Prova de que o app Android (que abre o site em tela cheia) é do mesmo dono do site. Sem ela,
// o Android mostra a barra de endereço dentro do app. O express.static não serve pastas com ponto.
app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'), { dotfiles: 'allow' });
});
app.get('/privacidade', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'privacidade.html')));
// Supressão de ruído por IA (RNNoise e GTCRN compilados para WebAssembly), usada no navegador.
app.use('/vendor/noise', express.static(path.dirname(require.resolve('@sapphi-red/web-noise-suppressor')), { maxAge: '7d' }));
// Mudança de tom do modificador de voz (Signalsmith Stretch, MIT, WebAssembly num AudioWorklet).
app.get('/vendor/stretch.mjs', (_req, res) => res.sendFile(path.join(path.dirname(require.resolve('signalsmith-stretch')), 'SignalsmithStretch.mjs'), { maxAge: '7d' }));
// Three.js da cena 3D do Salão do Mudae, servido daqui (sem CDN): só o build e os addons.
const threeDir = path.join(path.dirname(require.resolve('three')), '..');
app.use('/vendor/three/build', express.static(path.join(threeDir, 'build'), { maxAge: '7d' }));
app.use('/vendor/three/addons', express.static(path.join(threeDir, 'examples', 'jsm'), { maxAge: '7d' }));
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
const imageInUse = (file) => Object.values(communities.root.servers).some((s) => s.serverIcon === file || (s.emojis || []).some((e) => e.file === file)) || Object.values(db.accounts).some((account) => account.avatar === file || account.banner === file || account.background === file);
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
// ---------------- prévias de links ----------------
// A chave que assina as imagens das prévias fica no banco: as prévias antigas continuam abrindo.
db.linkSecret ||= crypto.randomBytes(32).toString('hex');
const linkImages = linkPreview.imageProxy(db.linkSecret);
app.get('/link-image', (req, res) => {
  if (!allow('link-image:' + clientIp(req.headers, req.socket.remoteAddress), 120, 60_000)) return res.status(429).end();
  linkImages.handle(req, res);
});
// Busca as prévias depois de a mensagem sair (não atrasa o envio) e manda a mensagem atualizada.
// Se ela foi apagada ou editada nesse meio-tempo, a prévia velha é descartada.
function attachPreviews(c, msg, emit) {
  if (msg.noEmbeds || !linkPreview.linksIn(msg.text).length) {
    if (msg.embeds) { delete msg.embeds; emit(); }
    return;
  }
  const text = msg.text;
  linkPreview.previews(text).then((found) => {
    const live = (db.messages[c.id] || []).find((m) => m.id === msg.id);
    if (!live || live.text !== text || live.noEmbeds) return;
    const embeds = found.map((e) => ({ ...e, image: linkImages.proxied(e.image) }));
    if (!embeds.length && !live.embeds) return;
    if (embeds.length) live.embeds = embeds; else delete live.embeds;
    emit(); save();
  });
}

// ---------------- emojis do servidor ----------------
// Ficam junto das fotos (/avatars) e aparecem nas mensagens como <:nome:id>. /emojis/:id acha o
// emoji em qualquer servidor, para ele continuar aparecendo em conversas privadas e em citações.
const MAX_SERVER_EMOJIS = 50;
const MAX_EMOJI_BYTES = 512 * 1024;
const EMOJI_NAME = /^[A-Za-z0-9_]{2,32}$/;
const emojiList = () => (db.emojis || []).map((e) => ({ id: e.id, name: e.name, url: '/emojis/' + e.id }));
const checkEmojiName = (name, except = null) => {
  if (!EMOJI_NAME.test(name)) throw new Error('O nome do emoji deve ter de 2 a 32 letras sem acento, números ou _.');
  if ((db.emojis || []).some((e) => e.id !== except && e.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe um emoji com esse nome neste servidor.');
};
app.post('/servers/:serverId/emojis', express.raw({ type: () => true, limit: MAX_EMOJI_BYTES + 1024 }), (req, res) => {
  const acc = authFromToken(req);
  if (!acc) return res.status(401).json({ error: 'Não autenticado' });
  communities.run(req.params.serverId, () => {
    if (!communities.joined(acc.id) || !can(communities.accountView(acc), 'MANAGE_EMOJIS')) return res.status(403).json({ error: 'Você não pode gerenciar os emojis deste servidor.' });
    if (!allow('emoji-upload:' + acc.id, 20, 60000)) return res.status(429).json({ error: 'Muitos envios. Aguarde um minuto.' });
    db.emojis ||= [];
    if (db.emojis.length >= MAX_SERVER_EMOJIS) return res.status(400).json({ error: `O servidor já tem ${MAX_SERVER_EMOJIS} emojis.` });
    try {
      const name = decodeURIComponent(req.get('x-emoji-name') || '').trim();
      checkEmojiName(name);
      const { ext, data } = decodeProfilePhoto(req.body);
      if (data.length > MAX_EMOJI_BYTES) throw new Error('O emoji deve ter até 512 KB.');
      const file = crypto.createHash('sha256').update(data).digest('hex') + '.' + ext;
      fs.writeFileSync(path.join(AVATAR_DIR, file), data);
      const emoji = { id: newId(), name, file, createdBy: acc.id, ts: Date.now() };
      db.emojis.push(emoji); save(); broadcastState();
      res.json({ ok: true, id: emoji.id });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
});
app.get('/emojis/:id', (req, res) => {
  const emoji = /^[0-9a-f]{16}$/.test(req.params.id) && Object.values(communities.root.servers).flatMap((s) => s.emojis || []).find((e) => e.id === req.params.id);
  if (!emoji || !IMAGE_FILE.test(emoji.file)) return res.status(404).end();
  res.set({
    'Content-Type': emoji.file.endsWith('.gif') ? 'image/gif' : 'image/png',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'public, max-age=3600',
  });
  res.sendFile(path.join(AVATAR_DIR, emoji.file));
});

// ---------------- DJ (músicas do YouTube nas salas de voz) ----------------
// Cada sala tem a sua fila ("idDoServidor:idDaSala"). Só a busca passa pelo servidor;
// o vídeo toca no player oficial do YouTube de cada pessoa.
const dj = createDj({ newId, onChange: () => broadcastState() });

// Catálogo do Mudae: lido uma vez. Sem o arquivo, os comandos só avisam que não tem personagens.
const MUDAE_CATALOG = process.env.MUDAE_CATALOG || path.join(__dirname, 'mudae-catalogo.json');
const mudae = createMudae({ catalog: fs.existsSync(MUDAE_CATALOG) ? JSON.parse(fs.readFileSync(MUDAE_CATALOG, 'utf8')) : [] });
const MUDAE_REACTIONS = ['😱', '🔥', '💖', '😂', '💀'];

// Quem está com um Salão do Mudae aberto (salon na sessão do socket), para a aba "No salão":
// cada um com os rolls que sobram e se ainda pode casar.
function salonSockets(serverId, channelId) {
  return [...online].filter(([, s]) => s.salon === channelId && s.salonServerId === serverId);
}
function pushSalon(serverId, channelId) {
  if (!channelId || !serverId) return;
  communities.run(serverId, () => {
    const store = (db.mudae ||= { claims: {}, usage: {} });
    const sockets = salonSockets(serverId, channelId);
    const people = [...new Set(sockets.map(([, s]) => s.accountId))].map((id) => ({ id, ...mudae.status(store, id) }));
    for (const [sid] of sockets) io.to(sid).emit('mudae:presence', { channel: channelId, people });
  });
}
function leaveSalon(s) {
  if (!s?.salon) return;
  const { salon, salonServerId } = s;
  s.salon = null;
  s.salonServerId = null;
  pushSalon(salonServerId, salon);
}
const youtube = youtubeSearch(process.env.YOUTUBE_ORIGIN ? { origin: process.env.YOUTUBE_ORIGIN } : {});
const djKey = (serverId, channelId) => serverId + ':' + channelId;

app.get('/music/search', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const acc = authFromToken(req);
  if (!acc) return res.status(401).json({ error: 'Entre de novo para buscar músicas.' });
  if (!allow('music-search:' + acc.id, 20, 60_000)) return res.status(429).json({ error: 'Muitas buscas seguidas. Espere um pouco.' });
  try {
    res.json({ items: await youtube.search(String(req.query.q || '').slice(0, 300)) });
  } catch (error) {
    if (error.status || error.name === 'TimeoutError' || error.name === 'TypeError') console.error('Busca do DJ falhou:', error.message);
    res.status(400).json({ error: error.name === 'TimeoutError' || error.name === 'TypeError' ? 'O YouTube demorou para responder. Tente de novo.' : error.message });
  }
});

// Banner e fundo do perfil: mesma regra, cada um no seu campo da conta ("banner" → bannerUrl/bannerCrop).
function profileImageRoutes(field, decode, tooMany) {
  app.post('/profile/' + field, express.raw({ type: () => true, limit: MAX_BANNER_UPLOAD }), (req, res) => {
    const acc = authFromToken(req);
    if (!acc) return res.status(401).json({ error: 'Não autenticado' });
    if (!allow(field + ':' + acc.id, 10, 60 * 1000)) return res.status(429).json({ error: tooMany });
    try {
      const { ext, data } = decode(req.body);
      // PNG chega já recortado; GIF vai inteiro e guarda só o enquadramento, para manter a animação.
      const crop = ext === 'gif' ? validateAvatarCrop(JSON.parse(req.get(`x-${field}-crop`) || 'null')) : null;
      const file = crypto.createHash('sha256').update(data).digest('hex') + '.' + ext;
      fs.writeFileSync(path.join(AVATAR_DIR, file), data);
      const previous = acc[field];
      acc[field] = file;
      acc[field + 'Crop'] = crop;
      save();
      broadcastState();
      if (previous !== file) removeImageIfUnused(previous);
      res.json({ ok: true, [field + 'Url']: '/avatars/' + file, [field + 'Crop']: crop });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete('/profile/' + field, (req, res) => {
    const acc = authFromToken(req);
    if (!acc) return res.status(401).json({ error: 'Não autenticado' });
    const previous = acc[field];
    acc[field] = null;
    acc[field + 'Crop'] = null;
    save();
    broadcastState();
    removeImageIfUnused(previous);
    res.json({ ok: true, [field + 'Url']: null, [field + 'Crop']: null });
  });
}
profileImageRoutes('banner', decodeBanner, 'Muitas trocas de banner. Aguarde um minuto.');
profileImageRoutes('background', decodeProfileBackground, 'Muitas trocas de fundo. Aguarde um minuto.');

app.post('/upload', express.raw({ type: () => true, limit: MAX_UPLOAD_MB * 1024 * 1024 }), (req, res) => {
  const acc = db.accounts[db.sessions[req.get('x-token')]];
  if (!acc) return res.status(401).json({ error: 'Não autenticado' });
  const targetId = req.get('x-channel-id');
  const dm = targetId && db.dms[targetId];
  if (dm) {
    const peer = dm.users.find((id) => id !== acc.id);
    if (!dm.users.includes(acc.id) || !areFriends(acc.id, peer) || hasBlocked(acc.id, peer) || hasBlocked(peer, acc.id)) return res.status(403).json({ error: 'Conversa não disponível.' });
  } else if (!can(acc, 'SEND_MESSAGES') || timedOut(acc) || (targetId && !db.channels.some((c) => c.id === targetId && CHAT_TYPES.includes(c.type) && canView(acc, c)))) return res.status(403).json({ error: 'Você não pode enviar arquivos agora.' });
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

// Toque e mensagem de chamada das conversas privadas (dm-calls.js).
mediaSwitched = (server, channel, transport) => {
  for (const [sid, s] of online) if (s.voice === channel && (s.voiceServerId ?? null) === (server ?? null)) io.to(sid).emit('media:switch', { transport });
};
const emitToAccount = (accountId, event, payload) => { for (const [sid, s] of online) if (s.accountId === accountId) io.to(sid).emit(event, payload); };
const emitToDm = (dm, event, payload) => { for (const id of db.dms[dm]?.users || []) emitToAccount(id, event, payload); };
const dmCalls = createDmCalls({
  ringMs: Number(process.env.DM_RING_MS) || 30_000,
  messages: (dm) => db.messages[dm] || [],
  newId,
  emit: emitToAccount,
  post: (dm, msg) => {
    const list = (db.messages[dm] ||= []);
    // Para quem recebe, a chamada conta como menção (badge vermelho), como as mensagens diretas.
    msg.mentions = { users: db.dms[dm].users.filter((u) => u !== msg.authorId), roles: [], everyone: false };
    list.push(msg);
    while (list.length > MAX_MESSAGES) deleteAttachments(list.shift());
    db.dms[dm].closed = {}; // a conversa volta para a lista dos dois, como numa mensagem nova
    emitToDm(dm, 'chat:message', { channel: dm, msg, author: publicProfiles([msg.authorId])[0] });
    pushSocial(...db.dms[dm].users);
    save();
  },
  update: (dm, msg) => { emitToDm(dm, 'chat:update', { channel: dm, msg }); save(); },
  changed: () => broadcastState(),
});
// Contas de uma sala de voz (para saber quem continua na chamada privada).
const roomAccounts = (room) => [...online.values()].filter((s) => s.voice === room).map((s) => s.accountId);
// Os dois ainda podem se falar? Mesma regra das mensagens diretas.
const dmCallAllowed = (dm, accountId) => {
  const conversation = db.dms[dm];
  const peer = conversation?.users.find((u) => u !== accountId);
  return !!conversation?.users.includes(accountId) && !!db.accounts[peer] && areFriends(accountId, peer) && !hasBlocked(accountId, peer) && !hasBlocked(peer, accountId);
};

function socketsOf(accountId, local = false) {
  return [...online].filter(([, s]) => s.accountId === accountId && (!local || s.serverId === communities.currentId())).map(([sid]) => io.sockets.sockets.get(sid)).filter(Boolean);
}

// Sessões da conta que estão numa chamada do servidor atual (podem estar vendo outro servidor).
function voiceSocketsOf(accountId) {
  return [...online].filter(([, s]) => s.accountId === accountId && s.voice && !isDmCall(s) && s.voiceServerId === communities.currentId()).map(([sid]) => io.sockets.sockets.get(sid)).filter(Boolean);
}

// Status que a própria pessoa escolhe. "offline" é só o que os outros veem.
const PRESENCES = ['online', 'idle', 'dnd', 'invisible'];

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
    backgroundUrl: a.background ? '/avatars/' + a.background : null,
    backgroundCrop: a.background && a.backgroundCrop || null,
    since: a.createdAt || null,
    roles: a.roles,
    // Quem está invisível aparece offline para todo mundo (inclusive a frase de status).
    online: onlineIds.has(a.id) && a.presence !== 'invisible',
    status: !onlineIds.has(a.id) || a.presence === 'invisible' ? 'offline' : PRESENCES.includes(a.presence) ? a.presence : 'online',
    statusText: onlineIds.has(a.id) && a.presence !== 'invisible' ? a.statusText || null : null,
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
    voice: [...online].filter(([, s]) => s.voice && !isDmCall(s) && s.voiceServerId === communities.currentId()).map(([sid, s]) => voiceEntry(sid, s)),
  };
}

// Uma pessoa na sala de voz, como os outros participantes a veem.
function voiceEntry(sid, s) {
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
    voiceFx: s.voiceFx || null, // efeito do modificador de voz (selo para os outros)
    viewers: [...online].filter(([, viewer]) => viewer.voice === s.voice && viewer.watching?.has(sid)).map(([viewerId]) => viewerId),
    // "silenced": ninguém deve ouvir essa pessoa (mutada pelo servidor, de castigo ou sem permissão de falar).
    // Numa chamada privada não há cargos nem castigo.
    silenced: isDmCall(s) ? false : !!a.serverMuted || timedOut(a) || !can(a, 'SPEAK'),
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
    emojis: emojiList(),
    roles: db.roles,
    channels: visibleChannels,
    categories: db.categories.filter((g) => perms.has('MANAGE_CHANNELS') || visibleChannels.some((c) => c.categoryId === g.id)),
    members: shared.members,
    voice: shared.voice.filter((v) => db.channels.some((c) => c.id === v.channel && canView(acc, c))),
    // O que o DJ está tocando em cada sala, para aparecer na lista de canais.
    music: Object.fromEntries(visibleChannels.filter((c) => c.type === 'voice')
      .map((c) => [c.id, dj.summary(djKey(communities.currentId(), c.id))]).filter(([, summary]) => summary)),
    myPerms: [...perms],
    bans: perms.has('BAN') ? shared.bans : [],
  };
}

// A chamada em que a sessão está, vista do servidor da chamada (roda no contexto dele).
// Vai junto com o estado para a chamada continuar funcionando enquanto a pessoa olha outro servidor.
function callFor(s, shared) {
  if (isDmCall(s)) return dmCallFor(s);
  const acc = db.accounts[s.accountId];
  const channel = db.channels.find((c) => c.id === s.voice);
  if (!acc || !channel) return null;
  const voice = shared.voice.filter((v) => v.channel === s.voice);
  const ids = new Set([acc.id, ...voice.map((v) => v.accountId)]);
  return {
    serverId: communities.currentId(),
    serverName: db.serverName || 'Resenha',
    channel: { id: channel.id, name: channel.name },
    voice,
    members: shared.members.filter((m) => ids.has(m.id)),
    roles: db.roles,
    myPerms: [...permsOf(acc)],
    soundboard: db.soundboard.map((x) => ({ id: x.id, name: x.name, duration: x.duration, url: '/servers/' + communities.currentId() + '/sounds/' + x.id })),
    music: dj.view(djKey(communities.currentId(), channel.id)),
  };
}

// A chamada de uma conversa privada, no mesmo formato da chamada de servidor.
function dmCallFor(s) {
  const conversation = db.dms[s.voice];
  if (!conversation) return null;
  const peer = conversation.users.find((u) => u !== s.accountId);
  const [peerProfile] = publicProfiles([peer]);
  return {
    serverId: null,
    serverName: 'Mensagens diretas',
    dm: true,
    peerId: peer,
    ringing: dmCalls.ringing(s.voice),
    channel: { id: s.voice, name: peerProfile?.name || 'Conversa' },
    voice: [...online].filter(([, other]) => other.voice === s.voice).map(([sid, other]) => voiceEntry(sid, other)),
    members: publicProfiles(conversation.users),
    roles: [],
    myPerms: ['CONNECT', 'SPEAK', 'STREAM', 'SOUNDBOARD'],
    soundboard: [],
    music: null,
  };
}

// Avisa o DJ de cada sala quantas pessoas estão nela (sala vazia pausa e, depois, esquece a fila).
// Roda antes de mandar o estado, então a pausa já vai junto no mesmo envio.
function syncDjRooms() {
  const counts = new Map();
  for (const s of online.values()) if (s.voice) counts.set(djKey(s.voiceServerId, s.voice), (counts.get(djKey(s.voiceServerId, s.voice)) || 0) + 1);
  for (const key of dj.keys()) {
    const [serverId, channelId] = key.split(':');
    if (!communities.root.servers[serverId]?.channels.some((c) => c.id === channelId && c.type === 'voice')) dj.drop(key);
    else dj.occupancy(key, counts.get(key) || 0);
  }
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
  media.leave(socket.id, s.voiceServerId, s.voice).catch(() => {});
  const room = 'voice:' + s.voice;
  socket.to(room).emit('voice:peer-left', { id: socket.id });
  socket.leave(room);
  clearScreenWatchers(socket.id);
  for (const target of s.watching || []) io.to(target).emit('screen:quality', { viewer: socket.id, demand: null });
  s.watching?.clear();
  s.screenQuality?.clear();
  const dm = isDmCall(s) ? s.voice : null;
  const left = { server: s.voiceServerId, channel: s.voice };
  s.voice = null;
  s.voiceServerId = null;
  if (![...online.values()].some((o) => o.voice === left.channel && o.voiceServerId === left.server)) media.vacate(left.server, left.channel);
  s.sharing = false;
  s.camera = false;
  s.voiceFx = null;
  if (dm) dmCalls.left(dm, s.accountId, roomAccounts(dm));
}

// Uma conta fica numa chamada só: entrar por outra aba ou aparelho tira as sessões anteriores.
// Devolve os sockets tirados (para quem entrou não tentar se conectar com eles).
function dropOtherVoiceSessions(socket, accountId) {
  const dropped = [];
  for (const [sid, s] of online) {
    if (sid === socket.id || s.accountId !== accountId || !s.voice) continue;
    const other = io.sockets.sockets.get(sid);
    if (!other) continue;
    leaveVoice(other);
    other.emit('voice:force-leave', { reason: 'Você entrou na chamada em outra aba ou aparelho.' });
    dropped.push(sid);
  }
  return dropped;
}

// Tira da chamada quem está numa sala do servidor atual e perdeu acesso a ele.
function dropVoice(accountId, reason) {
  for (const socket of voiceSocketsOf(accountId)) {
    leaveVoice(socket);
    socket.emit('voice:force-leave', { reason });
  }
}

// Aplica as regras de voz depois de qualquer mudança de cargo, canal ou castigo.
function enforceVoice() {
  for (const [sid, s] of online) {
    if (!s.voice) continue;
    if (isDmCall(s)) {
      const socket = io.sockets.sockets.get(sid);
      if (socket && !dmCallAllowed(s.voice, s.accountId)) {
        leaveVoice(socket);
        socket.emit('voice:force-leave', { reason: 'A chamada terminou: vocês não são mais amigos.' });
      }
      continue;
    }
    communities.run(s.voiceServerId, () => {
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
  enforceVoice();
  syncDjRooms();
  broadcastQueued = false;
  const shared = new Map();
  const sharedOf = (id) => {
    if (!shared.has(id)) shared.set(id, sharedState());
    return shared.get(id);
  };
  for (const [sid, s] of online) {
    const call = s.voice ? communities.run(s.voiceServerId, () => callFor(s, sharedOf(s.voiceServerId))) : null;
    if (s.voice) media.sync(sid).catch(() => {});
    communities.run(s.serverId, () => {
      const acc = db.accounts[s.accountId];
      if (acc) io.sockets.sockets.get(sid)?.emit('state', { ...stateFor(acc, sharedOf(s.serverId)), call });
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

const CHAT_TYPES = ['text', 'voice'];
// Efeitos do modificador de voz (public/voice-fx.js); o servidor só repassa qual está ligado.
const VOICE_FX = ['esquilo', 'gigante', 'robo', 'radio', 'caverna', 'alien'];
function emitToViewers(channel, event, payload) {
  for (const [sid, s] of online) {
    if (s.serverId === communities.currentId() && canView(db.accounts[s.accountId], channel)) io.to(sid).emit(event, payload);
  }
}

const cleanName = (s, max = 32) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, max);
const cleanColor = (c, fallback = '#5865f2') => (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

// Trocar de servidor só muda o que a pessoa está vendo: a chamada continua (como no Discord).
function selectServer(socket, accountId, id) {
  leaveSalon(online.get(socket.id));
  online.get(socket.id).serverId = id;
  db.accounts[accountId].lastServerId = id;
  save();
  broadcastState();
}

function removeMembership(accountId, reason) {
  communities.membership(accountId).active = false;
  dropVoice(accountId, reason);
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
  // voice: true roda o handler no servidor da chamada, que pode não ser o que a pessoa está vendo.
  const on = (event, handler, { voice = false } = {}) => {
    socket.on(event, (payload, ack) => {
      const s = online.get(socket.id);
      communities.run((voice && s?.voice ? s.voiceServerId : s?.serverId) ?? null, () => {
        const acc = me();
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!acc) return reply({ error: 'Não autenticado' });
        try {
          const result = handler(acc, payload || {});
          // Quem fez a ação recebe o estado novo antes da confirmação.
          if (result && typeof result.then === 'function') result.then((value) => { flushBroadcast(); reply(value || { ok: true }); }, (err) => reply({ error: err.message }));
          else { flushBroadcast(); reply(result || { ok: true }); }
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
      const affected = io.sockets.sockets.get(sid);
      if (!affected) continue;
      if (session.voice && session.voiceServerId === id) {
        leaveVoice(affected);
        affected.emit('voice:force-leave', { reason: `O servidor ${community.serverName} foi excluído.` });
      }
      if (session.serverId !== id) continue;
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
    online.set(socket.id, { accountId: acc.id, serverId, voice: null, voiceServerId: null, muted: false, deafened: false, sharing: false, camera: false });
    save();
    ack({ token, accountId: acc.id, serverId, sid: socket.id, presence: acc.presence || 'online', statusText: acc.statusText || '', iceServers: iceServers(), permNames: PERMS, maxUploadMb: MAX_UPLOAD_MB, version: APP_VERSION, gifKey: process.env.KLIPY_KEY || null });
    // Páginas de antes da 0.99.3 não mandam a versão nem sabem mostrar o aviso de atualização.
    if (!payload.version) socket.emit('notice', 'Saiu uma versão nova do Resenhex. Aperte F5 para atualizar.');
    socket.emit('social', socialFor(acc));
    // Alguém está ligando: o toque aparece também na sessão que acabou de entrar.
    for (const ring of dmCalls.ringsFor(acc.id)) socket.emit('dm:ring', ring);
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

  on('presence', (acc, { presence, statusText }) => {
    if (presence !== undefined) {
      if (!PRESENCES.includes(presence)) fail('Status inválido.');
      acc.presence = presence === 'online' ? undefined : presence;
    }
    if (statusText !== undefined) {
      if (statusText !== null && typeof statusText !== 'string') fail('Frase de status inválida.');
      const text = (statusText || '').normalize('NFC').replace(/\p{Cc}/gu, ' ').trim().replace(/\s+/g, ' ');
      if ([...text].length > 80) fail('A frase de status deve ter até 80 caracteres.');
      acc.statusText = text || undefined;
    }
    if (!allow('presence:' + acc.id, 20, 60000)) fail('Muitas trocas de status. Aguarde um minuto.');
    save(); broadcastState();
    return { ok: true, presence: acc.presence || 'online', statusText: acc.statusText || '' };
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
  // Salas de voz também têm chat (para mandar links a quem está na chamada).
  const textChannel = (acc, id) => {
    const c = db.channels.find((ch) => ch.id === id && CHAT_TYPES.includes(ch.type));
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
    // "now" deixa o navegador acertar o relógio (o tempo para casar num roll do Mudae).
    return { messages, authors: publicProfiles(messages.map((msg) => msg.authorId)), now: Date.now() };
  });

  // ---------------- Mudae ----------------
  // O Mudae mora nos Salões (canais de texto com mudae: true). As respostas são mensagens do bot
  // ("by" é quem usou o comando). Erros e o $tu voltam só para quem pediu (como as mensagens
  // efêmeras do Discord) e não são gravados. "live" vai junto só no envio (as fotos da roleta).
  const postMudae = (c, acc, command, data, live = null) => {
    const list = (db.messages[c.id] ||= []);
    const msg = { id: newId(), authorId: null, bot: 'mudae', by: acc.id, command, ts: Date.now(), mudae: data };
    list.push(msg);
    while (list.length > MAX_MESSAGES) deleteAttachments(list.shift());
    (acc.lastRead ||= {})[c.id] = msg.ts;
    emitToChat(c, 'chat:message', { channel: c.id, msg: live ? { ...msg, mudae: { ...data, ...live } } : msg });
    save();
    return msg;
  };
  const mudaeAllowed = (acc) => {
    if (!can(acc, 'MUDAE')) fail('Você não tem permissão para usar o Mudae.');
    if (timedOut(acc)) fail('Você está de castigo.');
  };
  const mudaeStore = () => (db.mudae ||= { claims: {}, usage: {} });
  const salonOf = (acc, id) => {
    const c = textChannel(acc, id);
    if (!c.mudae) fail('Isso só funciona no Salão do Mudae.');
    return c;
  };
  const memberId = (id) => (typeof id === 'string' && communities.joined(id) ? id : null);
  // Ids do catálogo: números (anime) ou texto com a fonte na frente ("g1942", "c4000-1699").
  const charKey = (id) => (typeof id === 'number' || typeof id === 'string' ? String(id).slice(0, 64) : fail('Personagem inválido.'));

  function mudaeCommand(acc, c, { cmd, arg }, command) {
    mudaeAllowed(acc);
    if (!allow('mudae:' + acc.id, 8, 5000)) fail('Calma! Comandos do Mudae rápidos demais.');
    const only = (data) => ({ ephemeral: { command, ...data } });
    // Fora do Salão, o bot só aponta o caminho.
    if (!c.mudae) {
      const salon = db.channels.find((ch) => ch.mudae && canView(acc, ch));
      return only({ kind: 'redirect', channel: salon?.id || null, name: salon?.name || null });
    }
    if (!mudae.size) return only({ kind: 'error', text: 'O Mudae ainda não tem personagens neste servidor.' });
    const store = mudaeStore();
    if (/^[whm][a-z]?$/.test(cmd) && cmd !== 'mm') {
      const r = mudae.roll(store, acc.id, cmd);
      if (r.error) return only({ kind: 'error', text: r.error });
      const revealAt = Date.now() + revealDelay(r.card.rarity);
      postMudae(c, acc, command, { kind: 'roll', card: r.card, ownerId: r.ownerId, revealAt, priorityUntil: revealAt + PRIORITY_MS,
        expires: revealAt + CLAIM_WINDOW_MS, rollsLeft: r.rollsLeft }, { decoys: r.decoys });
      pushSalon(communities.currentId(), c.id);
    } else if (cmd === 'mm') {
      const ownerId = memberId(/<@(\w+)>/.exec(arg)?.[1]) || acc.id;
      postMudae(c, acc, command, { kind: 'harem', ownerId, ...mudae.harem(store, ownerId) });
    } else if (cmd === 'im') {
      if (!arg) return only({ kind: 'error', text: 'Diga o nome do personagem: **$im Gojo**' });
      const r = mudae.info(store, arg);
      if (!r) return only({ kind: 'error', text: `Nenhum personagem encontrado para **${arg.slice(0, 80)}**.` });
      postMudae(c, acc, command, { kind: 'info', card: r.card, ownerId: r.ownerId });
    } else if (cmd === 'divorce') {
      if (!arg) return only({ kind: 'error', text: 'Diga o nome do personagem: **$divorce Gojo**' });
      const card = mudae.divorce(store, acc.id, arg);
      if (!card) return only({ kind: 'error', text: `Você não tem ninguém chamado **${arg.slice(0, 80)}** no seu harem.` });
      postMudae(c, acc, command, { kind: 'divorce', card, ownerId: acc.id });
    } else if (cmd === 'tu') {
      return only({ kind: 'status', ...mudae.status(store, acc.id) });
    }
    return { ok: true };
  }

  on('mudae:claim', (acc, { channel, id }) => {
    const { c, msg } = findMessage(acc, channel, id);
    if (c.dm || msg.bot !== 'mudae' || msg.mudae?.kind !== 'roll') fail('Isso não é um roll do Mudae.');
    mudaeAllowed(acc);
    if (!allow('mudae-claim:' + acc.id, 6, 5000)) fail('Calma! Cliques rápidos demais.');
    const d = msg.mudae;
    mudae.claim(mudaeStore(), acc.id, d.card.id, { revealAt: d.revealAt ?? msg.ts, rollerId: msg.by, priority: d.priorityUntil ? PRIORITY_MS : 0 });
    d.ownerId = acc.id;
    emitToChat(c, 'chat:update', { channel: c.id, msg });
    // Casar com o roll de outra pessoa é um roubo, e o chat conta isso.
    postMudae(c, acc, null, { kind: 'married', card: d.card, ownerId: acc.id, from: msg.by && msg.by !== acc.id ? msg.by : null });
    if (c.mudae) pushSalon(communities.currentId(), c.id);
  });

  // Entrar ou sair da tela de um Salão (channel: null ao sair).
  on('mudae:presence', (acc, { channel }) => {
    const s = online.get(socket.id);
    const c = channel ? salonOf(acc, channel) : null;
    if (c && s.salon === c.id && s.salonServerId === communities.currentId()) return { ok: true, ...mudae.status(mudaeStore(), acc.id), sources: mudae.sources };
    leaveSalon(s);
    if (c) {
      s.salon = c.id;
      s.salonServerId = communities.currentId();
      pushSalon(s.salonServerId, c.id);
    }
    return { ok: true, ...(c ? { ...mudae.status(mudaeStore(), acc.id), sources: mudae.sources } : {}) };
  });

  // Reações rápidas no palco: só para quem está no Salão agora, sem gravar.
  on('mudae:react', (acc, { channel, id, emoji }) => {
    const c = salonOf(acc, channel);
    if (!MUDAE_REACTIONS.includes(emoji)) fail('Reação inválida.');
    if (!allow('mudae-react:' + acc.id, 8, 4000)) return { ok: true };
    for (const [sid] of salonSockets(communities.currentId(), c.id)) io.to(sid).emit('mudae:reaction', { channel: c.id, id: String(id || '').slice(0, 32), emoji, by: acc.id });
  });

  on('mudae:harem', (acc, { ownerId }) => mudae.album(mudaeStore(), memberId(ownerId) || acc.id));
  on('mudae:ranking', () => mudae.ranking(mudaeStore(), (id) => communities.joined(id)));
  on('mudae:profile', (acc, { accountId }) => ({ summary: memberId(accountId) ? mudae.summary(mudaeStore(), accountId) : null }));

  on('mudae:favorite', (acc, { charId }) => {
    mudaeAllowed(acc);
    mudae.setFavorite(mudaeStore(), acc.id, charId === null ? null : charKey(charId));
    save();
  });

  // Divórcio pelo álbum (por id); a notícia sai no Salão aberto.
  on('mudae:divorce', (acc, { channel, charId }) => {
    mudaeAllowed(acc);
    const c = salonOf(acc, channel);
    const card = mudae.divorceId(mudaeStore(), acc.id, charKey(charId));
    postMudae(c, acc, null, { kind: 'divorce', card, ownerId: acc.id });
  });

  const findMessage = (acc, channel, id) => {
    const c = chatTarget(acc, channel);
    const list = db.messages[c.id] || [];
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) fail('Mensagem não encontrada');
    return { c, list, i, msg: list[i] };
  };

  on('chat:send', (acc, { channel, text, attachments, replyTo, gif }) => {
    const c = chatTarget(acc, channel);
    text = String(text || '').trim().slice(0, 4000);
    const peer = c.dm ? dmPeer(acc, c.dm) : null;
    // Comandos do Mudae ($w, $mm…) viram resposta do bot, não mensagem.
    const mudaeCmd = !c.dm && !attachments?.length && !gif && mudae.parse(text);
    if (mudaeCmd) return mudaeCommand(acc, c, mudaeCmd, text.split(/\s/)[0].toLowerCase());
    if (!c.dm && !can(acc, 'SEND_MESSAGES')) fail('Você não tem permissão para enviar mensagens.');
    if (!c.dm && timedOut(acc)) fail('Você está de castigo.');
    if (!allow('chat:' + acc.id, 10, 5000)) fail('Você está enviando mensagens rápido demais. Espere um pouco.');
    const ids = [...new Set(Array.isArray(attachments) ? attachments : [])].slice(0, MAX_ATTACHMENTS);
    const ups = ids.map((id) => db.uploads[id]);
    if (ups.some((up) => !up || up.uploaderId !== acc.id || up.messageId
      || (up.serverId !== undefined && up.serverId !== (c.dm ? null : communities.currentId()))
      || (up.channelId && up.channelId !== c.id))) fail('Anexo inválido, envie o arquivo de novo.');
    if (gif !== undefined) gif = cleanGif(gif);
    if (!text && !ups.length && !gif) return;
    const list = (db.messages[c.id] ||= []);
    const replied = replyTo ? list.find((m) => m.id === replyTo) : null;
    const msg = { id: newId(), authorId: acc.id, text, ts: Date.now() };
    if (ups.length) {
      msg.attachments = ups.map((up) => ({ id: up.id, name: up.name, size: up.size, type: up.type, url: '/uploads/' + up.file }));
      ups.forEach((up) => (up.messageId = msg.id));
    }
    if (gif) msg.gif = gif;
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
    attachPreviews(c, msg, () => emitToChat(c, 'chat:update', { channel: c.id, msg }));
  });

  on('chat:edit', (acc, { channel, id, text }) => {
    const { c, list, msg } = findMessage(acc, channel, id);
    text = String(text || '').trim().slice(0, 4000);
    if (msg.authorId !== acc.id) fail('Só dá para editar suas mensagens.');
    if (msg.call) fail('Não dá para editar o aviso de uma chamada.');
    if (c.dm) dmPeer(acc, c.dm);
    else if (timedOut(acc)) fail('Você está de castigo.');
    if (!text && !msg.attachments?.length && !msg.gif) return;
    msg.text = text;
    msg.edited = Date.now();
    msg.mentions = mentionsFor(acc, c, text, list.find((m) => m.id === msg.replyTo)?.authorId);
    // Links que saíram do texto perdem a prévia; os novos ganham a sua logo depois.
    if (msg.embeds) msg.embeds = msg.embeds.filter((e) => linkPreview.linksIn(text).includes(e.url));
    if (msg.embeds && !msg.embeds.length) delete msg.embeds;
    emitToChat(c, 'chat:update', { channel: c.id, msg });
    save();
    attachPreviews(c, msg, () => emitToChat(c, 'chat:update', { channel: c.id, msg }));
  });

  // Quem escreveu pode tirar as prévias da mensagem (o "x" no cartão).
  on('chat:suppressEmbeds', (acc, { channel, id }) => {
    const { c, msg } = findMessage(acc, channel, id);
    if (msg.authorId !== acc.id && (c.dm || !can(acc, 'MANAGE_MESSAGES'))) fail('Só quem escreveu pode remover a prévia.');
    msg.noEmbeds = true;
    delete msg.embeds;
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
    const custom = /^<:\w{2,32}:([0-9a-f]{16})>$/.exec(emoji);
    if (!emoji || (!custom && (emoji.length > 16 || /[\s<>]/.test(emoji)))) fail('Emoji inválido');
    if (custom && !Object.values(communities.root.servers).some((s) => (s.emojis || []).some((e) => e.id === custom[1]))) fail('Esse emoji não existe mais.');
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
      if (!CHAT_TYPES.includes(c.type) || !canView(acc, c)) continue;
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
  on('voice:media', (_acc, { fallback } = {}) => {
    if (!allow('voice-media:' + socket.id, 30, 60_000)) throw new Error('Muitas reconexões seguidas. Aguarde um minuto.');
    return media.credentials(socket.id, { fallback: fallback === true });
  }, { voice: true });
  // serverId é opcional: sem ele, a sala é do servidor que a pessoa está vendo. Com ele, dá para
  // voltar à chamada de outro servidor (ao reconectar ou ao ser movido enquanto olha outro servidor).
  on('voice:join', (acc, { channel, serverId, dm, silent, mediaVersion }) => {
    if (media.enabled && mediaVersion !== 1) fail('Recarregue o Resenhex para usar o novo servidor de mídia.');
    const s = online.get(socket.id);
    if (dm !== undefined) return joinDmCall(acc, s, dm, silent === true);
    const target = serverId === undefined ? s.serverId : serverId;
    if (target !== s.serverId && (typeof target !== 'string' || !communities.joined(acc.id, target))) fail('Canal não encontrado');
    return communities.run(target, () => {
      const me = db.accounts[acc.id];
      const c = db.channels.find((ch) => ch.id === channel && ch.type === 'voice');
      if (!me || !c || !canView(me, c)) fail('Canal não encontrado');
      if (!can(me, 'CONNECT')) fail('Você não tem permissão para entrar em canais de voz.');
      leaveVoice(socket);
      const room = 'voice:' + c.id;
      // Quem entra recebe a lista dos que já estão na sala e inicia as conexões com eles.
      const peers = [...(io.sockets.adapter.rooms.get(room) || [])];
      socket.join(room);
      s.voice = c.id;
      s.voiceServerId = target;
      const dropped = dropOtherVoiceSessions(socket, acc.id);
      broadcastState();
      return { peers: peers.filter((p) => !dropped.includes(p)) };
    });
  });

  // Chamada privada: entra na sala da conversa. Quem chega numa sala vazia começa a chamada e
  // o amigo recebe o toque; quem chega com o outro lá dentro atende.
  function joinDmCall(acc, s, dm, silent) {
    const conversation = isDmId(dm) && db.dms[dm];
    if (!conversation || !conversation.users.includes(acc.id)) fail('Conversa não encontrada');
    if (!dmCallAllowed(dm, acc.id)) fail('Só dá para ligar para amigos.');
    leaveVoice(socket);
    const room = 'voice:' + dm;
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])];
    socket.join(room);
    s.voice = dm;
    s.voiceServerId = null;
    // A aba antiga sai depois desta entrar: com a conta ainda na sala, a chamada não acaba.
    const dropped = dropOtherVoiceSessions(socket, acc.id);
    dmCalls.joined(dm, acc.id, conversation.users.find((u) => u !== acc.id), { first: !peers.length, silent });
    broadcastState();
    return { peers: peers.filter((p) => !dropped.includes(p)) };
  }

  // Ligar de novo para quem não atendeu (só quem está na chamada, esperando).
  on('dm:ring', (acc, { dm }) => {
    const s = online.get(socket.id);
    if (!isDmCall(s) || s.voice !== dm) fail('Entre na chamada para ligar.');
    if (!allow('dm-ring:' + acc.id, 5, 60_000)) fail('Calma! Muitas ligações seguidas.');
    const peer = db.dms[dm].users.find((u) => u !== acc.id);
    if (roomAccounts(dm).includes(peer)) return;
    dmCalls.ring(dm, acc.id, peer);
  });

  on('dm:ring:decline', (acc, { dm }) => {
    const from = isDmId(dm) ? dmCalls.decline(dm, acc.id) : null;
    if (from) emitToAccount(from, 'notice', `${acc.name} recusou a chamada.`);
  });

  on('voice:leave', () => {
    leaveVoice(socket);
    broadcastState();
  });

  on('voice:state', (acc, { muted, deafened, sharing, paused, camera, voiceFx }) => {
    const s = online.get(socket.id);
    const video = !!s.voice && (isDmCall(s) || (can(acc, 'STREAM') && !timedOut(acc)));
    s.muted = !!muted;
    s.deafened = !!deafened;
    s.sharing = !!sharing && video;
    if (!s.sharing) clearScreenWatchers(socket.id);
    // Transmissão pausada: a janela compartilhada foi minimizada (o navegador para de capturar).
    s.paused = s.sharing && !!paused;
    s.camera = !!camera && video;
    s.voiceFx = VOICE_FX.includes(voiceFx) ? voiceFx : null;
    broadcastState();
  }, { voice: true });

  // Quem assiste continua autorizado na sala de quem transmite (canal visível ou amizade, na privada).
  const inSameRoom = (acc, source) => {
    if (isDmCall(source)) return dmCallAllowed(source.voice, acc.id);
    const channel = db.channels.find((c) => c.id === source.voice);
    return !!channel && canView(acc, channel) && can(acc, 'CONNECT');
  };

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
    if (!viewer.voice || !source?.sharing || viewer.voice !== source.voice || !inSameRoom(acc, source)) fail('Essa transmissão não está disponível nesta sala.');
    const demand = screenQuality(quality);
    viewer.watching ||= new Set();
    viewer.watching.add(target);
    viewer.screenQuality ||= new Map();
    viewer.screenQuality.set(target, demand);
    io.to(target).emit('screen:quality', { viewer: socket.id, demand });
    broadcastState();
  }, { voice: true });

  // Only subscribed viewers can request quality. Resize updates go to the source,
  // not into persistent state or a server-wide broadcast.
  on('screen:quality', (acc, { target, quality }) => {
    const viewer = online.get(socket.id), source = online.get(target);
    if (!viewer.voice || !source?.sharing || !viewer.watching?.has(target) || viewer.voice !== source.voice
        || !inSameRoom(acc, source)) fail('Essa transmissão não está disponível nesta sala.');
    const demand = screenQuality(quality);
    if (!allow('screen-quality:' + socket.id + ':' + target, 24, 5000)) fail('Aguarde antes de ajustar a transmissão novamente.');
    const previous = viewer.screenQuality?.get(target);
    if (previous && JSON.stringify(previous) === JSON.stringify(demand)) return;
    viewer.screenQuality ||= new Map();
    viewer.screenQuality.set(target, demand);
    io.to(target).emit('screen:quality', { viewer: socket.id, demand });
  }, { voice: true });

  // Efeito sonoro: todo mundo da sala toca o mesmo som.
  on('sound:play', (acc, { sound }) => {
    const s = online.get(socket.id);
    if (!s.voice) fail('Entre numa sala de voz para usar efeitos sonoros.');
    if (isDmCall(s)) {
      if (!SOUNDBOARD.includes(sound)) fail('Som desconhecido');
    } else {
      if (!SOUNDBOARD.includes(sound) && !db.soundboard.some((s) => s.id === sound)) fail('Som desconhecido');
      if (!can(acc, 'SOUNDBOARD')) fail('Você não tem permissão para usar efeitos sonoros.');
      if (timedOut(acc)) fail('Você está de castigo.');
    }
    if (!allow('sound:' + acc.id, 4, 10000)) fail('Calma! Muitos efeitos sonoros seguidos.');
    io.to('voice:' + s.voice).emit('sound', { sound, from: acc.id });
  }, { voice: true });

  on('sound:remove', (acc, { id }) => {
    if (!can(acc, 'MANAGE_SOUNDBOARD')) fail('Você não pode gerenciar os efeitos deste servidor.');
    const sound = db.soundboard.find((s) => s.id === id);
    if (!sound) fail('Efeito não encontrado neste servidor.');
    db.soundboard = db.soundboard.filter((s) => s.id !== id);
    save(); broadcastState(); removeSoundIfUnused(sound.file);
    return { ok: true };
  });

  on('emoji:remove', (acc, { id }) => {
    if (!can(acc, 'MANAGE_EMOJIS')) fail('Você não pode gerenciar os emojis deste servidor.');
    const emoji = (db.emojis || []).find((e) => e.id === id);
    if (!emoji) fail('Emoji não encontrado neste servidor.');
    db.emojis = db.emojis.filter((e) => e.id !== id);
    save(); broadcastState(); removeImageIfUnused(emoji.file);
    return { ok: true };
  });

  on('emoji:rename', (acc, { id, name }) => {
    if (!can(acc, 'MANAGE_EMOJIS')) fail('Você não pode gerenciar os emojis deste servidor.');
    const emoji = (db.emojis || []).find((e) => e.id === id);
    if (!emoji) fail('Emoji não encontrado neste servidor.');
    name = String(name || '').trim();
    try { checkEmojiName(name, id); } catch (error) { fail(error.message); }
    emoji.name = name;
    save(); broadcastState();
    return { ok: true };
  });

  // DJ da sala em que a pessoa está. Rodam no servidor da chamada (voice: true).
  const roomKey = () => {
    const s = online.get(socket.id);
    if (!s.voice) fail('Entre numa sala de voz para usar o DJ.');
    if (isDmCall(s)) fail('O DJ não funciona em chamadas privadas.');
    return djKey(s.voiceServerId, s.voice);
  };
  const djUser = (acc) => {
    const key = roomKey();
    if (!can(acc, 'MUSIC')) fail('Você não tem permissão para usar o DJ.');
    if (timedOut(acc)) fail('Você está de castigo.');
    if (!allow('music:' + acc.id, 12, 20_000)) fail('Calma! Muitos comandos do DJ seguidos.');
    return { key, by: { id: acc.id, name: acc.nickname || acc.name } };
  };

  on('music:add', (acc, { videoId, query }) => {
    const { key, by } = djUser(acc);
    const track = typeof videoId === 'string' && youtube.known(videoId);
    if (!track) fail('Busque a música de novo para adicionar.');
    return dj.add(key, track, by, typeof query === 'string' ? youtube.alternatives(query, videoId) : []);
  }, { voice: true });

  on('music:control', (acc, { action, trackId }) => {
    const { key, by } = djUser(acc);
    if (action === 'remove') dj.remove(key, trackId, by);
    else if (['skip', 'pause', 'resume', 'stop'].includes(action)) dj[action](key, by);
    else fail('Comando do DJ desconhecido.');
  }, { voice: true });

  // O que o player de cada um viu: a música acabou, não pode tocar aqui ou tem esta duração.
  on('music:report', (acc, { trackId, ended, error, duration }) => {
    const key = roomKey();
    if (typeof trackId !== 'string' || !allow('music-report:' + socket.id, 20, 10_000)) return;
    if (ended === true) dj.ended(key, trackId);
    else if (Number.isInteger(error)) dj.failed(key, trackId, error, socket.id);
    else if (typeof duration === 'number') dj.measured(key, trackId, duration);
  }, { voice: true });

  // Repassa ofertas/respostas/ICE entre dois participantes da mesma sala.
  socket.on('signal', ({ to, data } = {}) => {
    const from = online.get(socket.id);
    const target = online.get(to);
    if (!from || !target || !from.voice || from.voice !== target.voice || from.voiceServerId !== target.voiceServerId) return;
    if (!media.allowsP2p(from.voiceServerId, from.voice)) return;
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
        dropVoice(t.id, `${acc.name} desconectou você da voz.`);
        break;
      case 'move': {
        need('MOVE_MEMBERS');
        if (!self) needRank();
        const c = db.channels.find((ch) => ch.id === value && ch.type === 'voice');
        if (!c || !canView(t, c)) fail('Essa pessoa não pode entrar nesse canal.');
        for (const s of voiceSocketsOf(t.id)) s.emit('voice:force-move', { channel: c.id, serverId: communities.currentId(), by: acc.name });
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
    leaveSalon(online.get(socket.id));
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

// Chamadas privadas abertas antes de reiniciar: quem estava nelas tem um minuto para voltar.
setTimeout(() => dmCalls.sweep(Object.keys(db.dms)), 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Resenhex rodando em http://${HOST}:${PORT}`);
});
