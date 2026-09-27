// Servidor do Resenhex (plataforma de chat e voz inspirada no Discord): contas, cargos e permissões, moderação,
// chat de texto com anexos, e sinalização WebRTC para voz, câmera e tela.
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_MESSAGES = 300;
// Se definida, só cria conta quem souber a senha (recomendado quando o servidor estiver na internet).
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD_B64
  ? Buffer.from(process.env.ACCESS_PASSWORD_B64, 'base64').toString('utf8')
  : process.env.ACCESS_PASSWORD || '';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 25;
const MAX_ATTACHMENTS = 10;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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

const db = loadDb();
db.uploads ||= {};
// Servidores criados antes dos efeitos sonoros: libera para @everyone uma única vez.
if (!db.soundboardMigrated) {
  const everyone = db.roles.find((r) => r.id === 'everyone');
  if (everyone && !everyone.perms.includes('SOUNDBOARD')) everyone.perms.push('SOUNDBOARD');
  db.soundboardMigrated = true;
}

// Grava na hora ao desligar o servidor (Ctrl+C), para não perder o que estava pendente.
function saveNow() {
  clearTimeout(saveTimer);
  fs.writeFileSync(DATA_FILE, JSON.stringify(db));
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
    fs.writeFile(tmp, JSON.stringify(db), (err) => {
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

function revokeSessions(accountId) {
  for (const [token, id] of Object.entries(db.sessions)) if (id === accountId) delete db.sessions[token];
  save();
}

// ---------------- permissões ----------------
const roleIndex = (id) => db.roles.findIndex((r) => r.id === id);
const isOwner = (acc) => acc.id === db.ownerId;

function topPosition(acc) {
  if (isOwner(acc)) return Infinity;
  return Math.max(0, ...acc.roles.map(roleIndex));
}

function permsOf(acc) {
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
  return !channel.allowedRoles.length || can(acc, 'ADMIN') || channel.allowedRoles.some((r) => acc.roles.includes(r));
}

// ---------------- menções e anexos ----------------
// Menções ficam no texto como <@idDaConta> e <@&idDoCargo>; @everyone/@here só contam com permissão.
function parseMentions(acc, text, replyAuthorId) {
  const users = new Set([...text.matchAll(/<@([0-9a-f]{16})>/g)].map((m) => m[1]).filter((id) => db.accounts[id]));
  if (replyAuthorId && replyAuthorId !== acc.id && db.accounts[replyAuthorId]) users.add(replyAuthorId);
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

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
// Supressão de ruído por IA (RNNoise e GTCRN compilados para WebAssembly), usada no navegador.
app.use('/vendor/noise', express.static(path.dirname(require.resolve('@sapphi-red/web-noise-suppressor')), { maxAge: '7d' }));
app.get('/config', (_req, res) => {
  res.json({ passwordRequired: !!ACCESS_PASSWORD, hasOwner: !!db.ownerId, maxUploadMb: MAX_UPLOAD_MB });
});

app.post('/upload', express.raw({ type: () => true, limit: MAX_UPLOAD_MB * 1024 * 1024 }), (req, res) => {
  const acc = db.accounts[db.sessions[req.get('x-token')]];
  if (!acc || acc.banned) return res.status(401).json({ error: 'Não autenticado' });
  if (!can(acc, 'SEND_MESSAGES') || timedOut(acc)) return res.status(403).json({ error: 'Você não pode enviar arquivos agora.' });
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
    const up = { id, file, name, size: req.body.length, type: INLINE_TYPES[ext] || 'application/octet-stream', uploaderId: acc.id, ts: Date.now(), messageId: null };
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
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: `Arquivo maior que ${MAX_UPLOAD_MB} MB` });
  console.error(err);
  res.status(500).json({ error: 'Erro no servidor' });
});

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

function socketsOf(accountId) {
  return [...online].filter(([, s]) => s.accountId === accountId).map(([sid]) => io.sockets.sockets.get(sid)).filter(Boolean);
}

function publicMember(a, onlineIds) {
  return {
    id: a.id,
    name: a.name,
    color: a.color,
    roles: a.roles,
    online: onlineIds.has(a.id),
    serverMuted: !!a.serverMuted,
    serverDeafened: !!a.serverDeafened,
    timeoutUntil: a.timeoutUntil || 0,
  };
}

// Partes do estado que são iguais para todo mundo: calculadas uma vez por envio.
function sharedState() {
  const onlineIds = new Set([...online.values()].map((s) => s.accountId));
  const accounts = Object.values(db.accounts);
  return {
    members: accounts.filter((a) => !a.banned).map((a) => publicMember(a, onlineIds)),
    bans: accounts.filter((a) => a.banned).map((a) => ({ id: a.id, name: a.name })),
    voice: [...online].filter(([, s]) => s.voice).map(([sid, s]) => {
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
        // "silenced": ninguém deve ouvir essa pessoa (mutada pelo servidor, de castigo ou sem permissão de falar).
        silenced: !!a.serverMuted || timedOut(a) || !can(a, 'SPEAK'),
      };
    }),
  };
}

function stateFor(acc, shared = sharedState()) {
  const perms = permsOf(acc);
  return {
    ownerId: db.ownerId,
    roles: db.roles,
    channels: db.channels.filter((c) => canView(acc, c)),
    members: shared.members,
    voice: shared.voice,
    myPerms: [...perms],
    bans: perms.has('BAN') ? shared.bans : [],
  };
}

function leaveVoice(socket) {
  const s = online.get(socket.id);
  if (!s || !s.voice) return;
  const room = 'voice:' + s.voice;
  socket.to(room).emit('voice:peer-left', { id: socket.id });
  socket.leave(room);
  s.voice = null;
  s.sharing = false;
  s.camera = false;
}

// Aplica as regras de voz depois de qualquer mudança de cargo, canal ou castigo.
function enforceVoice() {
  for (const [sid, s] of online) {
    if (!s.voice) continue;
    const acc = db.accounts[s.accountId];
    const channel = db.channels.find((c) => c.id === s.voice);
    const socket = io.sockets.sockets.get(sid);
    if (!socket) continue;
    if (!channel || !canView(acc, channel) || !can(acc, 'CONNECT')) {
      leaveVoice(socket);
      socket.emit('voice:force-leave', { reason: 'Você foi removido do canal de voz.' });
    } else if ((s.sharing || s.camera) && (!can(acc, 'STREAM') || timedOut(acc))) {
      s.sharing = false;
      s.camera = false;
      socket.emit('voice:stop-share');
    }
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
  const shared = sharedState();
  for (const [sid, s] of online) {
    const acc = db.accounts[s.accountId];
    if (acc) io.sockets.sockets.get(sid)?.emit('state', stateFor(acc, shared));
  }
}

// Reavalia o estado quando um castigo termina.
const timeoutTimers = new Map();
function scheduleTimeoutEnd(acc) {
  clearTimeout(timeoutTimers.get(acc.id));
  const ms = (acc.timeoutUntil || 0) - Date.now();
  if (ms > 0) timeoutTimers.set(acc.id, setTimeout(broadcastState, Math.min(ms + 100, 2 ** 31 - 1)));
}
Object.values(db.accounts).forEach(scheduleTimeoutEnd);

function emitToViewers(channel, event, payload) {
  for (const [sid, s] of online) {
    if (canView(db.accounts[s.accountId], channel)) io.to(sid).emit(event, payload);
  }
}

const cleanName = (s, max = 32) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, max);
const cleanColor = (c, fallback = '#5865f2') => (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

// ---------------- eventos ----------------
io.on('connection', (socket) => {
  const me = () => {
    const s = online.get(socket.id);
    return s && db.accounts[s.accountId];
  };

  // Todo handler que exige login passa por aqui; responde {error} quando falha.
  const on = (event, handler) => {
    socket.on(event, (payload, ack) => {
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
  };
  const fail = (msg) => { throw new Error(msg); };

  const ip = clientIp(socket.handshake.headers, socket.handshake.address);

  socket.on('auth', async (payload, ack) => {
    if (typeof ack !== 'function' || online.has(socket.id) || socket.data.authing) return;
    socket.data.authing = true;
    try {
      await authenticate(payload || {}, ack);
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
        if (ACCESS_PASSWORD && payload.serverPassword !== ACCESS_PASSWORD) return ack({ error: 'Senha do servidor incorreta' });
        if (name.length < 2) return ack({ error: 'Nome muito curto' });
        if (password.length < 4) return ack({ error: 'A senha precisa ter pelo menos 4 caracteres' });
        if (existing) return ack({ error: 'Esse nome já está em uso' });
        if (!allow('register:' + ip, 20, 60 * 60 * 1000)) return ack({ error: 'Muitas contas criadas daqui. Tente mais tarde.' });
        const secret = await hashPassword(password);
        // Outra pessoa pode ter pegado o nome enquanto o hash era calculado.
        if (Object.values(db.accounts).some((a) => a.name.toLowerCase() === name.toLowerCase())) return ack({ error: 'Esse nome já está em uso' });
        acc = { id: newId(), name, color: cleanColor(payload.color), roles: [], createdAt: Date.now(), ...secret };
        db.accounts[acc.id] = acc;
        // A primeira conta criada vira dona do servidor.
        if (!db.ownerId) db.ownerId = acc.id;
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
    if (acc.banned) return ack({ error: 'Você foi banido deste servidor.' });
    const token = payload.token || createSession(acc.id);
    online.set(socket.id, { accountId: acc.id, voice: null, muted: false, deafened: false, sharing: false, camera: false });
    save();
    ack({ token, accountId: acc.id, sid: socket.id, iceServers: iceServers(), permNames: PERMS, maxUploadMb: MAX_UPLOAD_MB });
    broadcastState();
  }

  on('logout', (acc, { token }) => {
    if (db.sessions[token] === acc.id) delete db.sessions[token];
    save();
  });

  on('profile', (acc, { color }) => {
    acc.color = cleanColor(color, acc.color);
    save();
    broadcastState();
  });

  // --- Chat ---
  const textChannel = (acc, id) => {
    const c = db.channels.find((ch) => ch.id === id && ch.type === 'text');
    if (!c || !canView(acc, c)) fail('Canal não encontrado');
    return c;
  };

  on('chat:history', (acc, { channel }) => ({ messages: db.messages[textChannel(acc, channel).id] || [] }));

  const findMessage = (acc, channel, id) => {
    const c = textChannel(acc, channel);
    const list = db.messages[c.id] || [];
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) fail('Mensagem não encontrada');
    return { c, list, i, msg: list[i] };
  };

  on('chat:send', (acc, { channel, text, attachments, replyTo }) => {
    const c = textChannel(acc, channel);
    text = String(text || '').trim().slice(0, 4000);
    if (!can(acc, 'SEND_MESSAGES')) fail('Você não tem permissão para enviar mensagens.');
    if (timedOut(acc)) fail('Você está de castigo.');
    if (!allow('chat:' + acc.id, 10, 5000)) fail('Você está enviando mensagens rápido demais. Espere um pouco.');
    const ids = [...new Set(Array.isArray(attachments) ? attachments : [])].slice(0, MAX_ATTACHMENTS);
    const ups = ids.map((id) => db.uploads[id]);
    if (ups.some((up) => !up || up.uploaderId !== acc.id || up.messageId)) fail('Anexo inválido, envie o arquivo de novo.');
    if (!text && !ups.length) return;
    const list = (db.messages[c.id] ||= []);
    const replied = replyTo ? list.find((m) => m.id === replyTo) : null;
    const msg = { id: newId(), authorId: acc.id, text, ts: Date.now() };
    if (ups.length) {
      msg.attachments = ups.map((up) => ({ id: up.id, name: up.name, size: up.size, type: up.type, url: '/uploads/' + up.file }));
      ups.forEach((up) => (up.messageId = msg.id));
    }
    if (replied) msg.replyTo = replied.id;
    msg.mentions = parseMentions(acc, text, replied?.authorId);
    list.push(msg);
    while (list.length > MAX_MESSAGES) deleteAttachments(list.shift());
    (acc.lastRead ||= {})[c.id] = msg.ts;
    emitToViewers(c, 'chat:message', { channel: c.id, msg });
    save();
  });

  on('chat:edit', (acc, { channel, id, text }) => {
    const { c, list, msg } = findMessage(acc, channel, id);
    text = String(text || '').trim().slice(0, 4000);
    if (msg.authorId !== acc.id) fail('Só dá para editar suas mensagens.');
    if (timedOut(acc)) fail('Você está de castigo.');
    if (!text && !msg.attachments?.length) return;
    msg.text = text;
    msg.edited = Date.now();
    msg.mentions = parseMentions(acc, text, list.find((m) => m.id === msg.replyTo)?.authorId);
    emitToViewers(c, 'chat:update', { channel: c.id, msg });
    save();
  });

  on('chat:delete', (acc, { channel, id }) => {
    const { c, list, i, msg } = findMessage(acc, channel, id);
    if (msg.authorId !== acc.id && !can(acc, 'MANAGE_MESSAGES')) fail('Sem permissão para apagar essa mensagem.');
    list.splice(i, 1);
    deleteAttachments(msg);
    emitToViewers(c, 'chat:delete', { channel: c.id, id });
    save();
  });

  on('chat:react', (acc, { channel, id, emoji }) => {
    const { c, msg } = findMessage(acc, channel, id);
    emoji = String(emoji || '');
    if (!emoji || emoji.length > 16 || /[\s<>]/.test(emoji)) fail('Emoji inválido');
    if (timedOut(acc)) fail('Você está de castigo.');
    if (!allow('react:' + acc.id, 20, 5000)) fail('Calma! Reações rápidas demais.');
    const reactions = (msg.reactions ||= {});
    const users = reactions[emoji] || [];
    if (users.includes(acc.id)) reactions[emoji] = users.filter((u) => u !== acc.id);
    else {
      if (!reactions[emoji] && Object.keys(reactions).length >= 20) fail('Limite de reações nesta mensagem');
      reactions[emoji] = [...users, acc.id];
    }
    if (!reactions[emoji].length) delete reactions[emoji];
    emitToViewers(c, 'chat:update', { channel: c.id, msg });
    save();
  });

  on('chat:read', (acc, { channel }) => {
    const c = textChannel(acc, channel);
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
    save();
    return { unread: result };
  });

  on('typing', (acc, { channel }) => {
    if (!allow('typing:' + acc.id, 3, 3000)) return;
    const c = db.channels.find((ch) => ch.id === channel);
    if (c) for (const [sid, s] of online) {
      if (sid !== socket.id && canView(db.accounts[s.accountId], c)) io.to(sid).emit('typing', { channel, name: acc.name });
    }
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
    // Transmissão pausada: a janela compartilhada foi minimizada (o navegador para de capturar).
    s.paused = s.sharing && !!paused;
    s.camera = !!camera && video;
    broadcastState();
  });

  // Efeito sonoro: todo mundo da sala toca o mesmo som.
  on('sound:play', (acc, { sound }) => {
    const s = online.get(socket.id);
    if (!SOUNDBOARD.includes(sound)) fail('Som desconhecido');
    if (!s.voice) fail('Entre numa sala de voz para usar efeitos sonoros.');
    if (!can(acc, 'SOUNDBOARD')) fail('Você não tem permissão para usar efeitos sonoros.');
    if (timedOut(acc)) fail('Você está de castigo.');
    if (!allow('sound:' + acc.id, 4, 10000)) fail('Calma! Muitos efeitos sonoros seguidos.');
    io.to('voice:' + s.voice).emit('sound', { sound, from: acc.id });
  });

  // Repassa ofertas/respostas/ICE entre dois participantes da mesma sala.
  socket.on('signal', ({ to, data } = {}) => {
    const from = online.get(socket.id);
    const target = online.get(to);
    if (!from || !target || !from.voice || from.voice !== target.voice) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // --- Moderação ---
  on('mod', (acc, { action, target, value }) => {
    const t = db.accounts[target];
    if (!t) fail('Membro não encontrado');
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
        for (const s of socketsOf(t.id)) {
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
        for (const s of socketsOf(t.id)) if (online.get(s.id).voice) s.emit('voice:force-move', { channel: c.id, by: acc.name });
        break;
      }
      case 'timeout': {
        need('TIMEOUT');
        if (self) fail('Você não pode castigar a si mesmo.');
        needRank();
        const minutes = Math.max(0, Math.min(Number(value) || 0, 28 * 24 * 60));
        t.timeoutUntil = minutes ? Date.now() + minutes * 60000 : 0;
        scheduleTimeoutEnd(t);
        for (const s of socketsOf(t.id)) {
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
        revokeSessions(t.id);
        for (const s of socketsOf(t.id)) {
          s.emit('removed', { reason: action === 'ban' ? `Você foi banido por ${acc.name}.` : `Você foi expulso por ${acc.name}.` });
          s.disconnect(true);
        }
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
      for (const a of Object.values(db.accounts)) a.roles = a.roles.filter((r) => r !== id);
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

  // --- Canais ---
  on('channel', (acc, { action, id, type, name, allowedRoles }) => {
    if (!can(acc, 'MANAGE_CHANNELS')) fail('Você não tem permissão para gerenciar canais.');
    const cleanChannelName = (n, t) => {
      n = cleanName(n, 32);
      if (t === 'text') n = n.toLowerCase().replace(/\s+/g, '-');
      if (!n) fail('Nome inválido');
      return n;
    };
    const cleanRoles = (list) => (Array.isArray(list) ? list : []).filter((r) => roleIndex(r) > 0);

    if (action === 'create') {
      if (type !== 'text' && type !== 'voice') fail('Tipo inválido');
      const channel = { id: newId(), type, name: cleanChannelName(name, type), allowedRoles: cleanRoles(allowedRoles) };
      db.channels.push(channel);
      if (type === 'text') db.messages[channel.id] = [];
      save();
      broadcastState();
      return { id: channel.id };
    }
    const channel = db.channels.find((c) => c.id === id);
    if (!channel) fail('Canal não encontrado');
    if (action === 'update') {
      channel.name = cleanChannelName(name, channel.type);
      channel.allowedRoles = cleanRoles(allowedRoles);
    } else if (action === 'delete') {
      if (channel.type === 'text' && db.channels.filter((c) => c.type === 'text').length === 1) fail('O servidor precisa de pelo menos um canal de texto.');
      db.channels = db.channels.filter((c) => c.id !== id);
      (db.messages[id] || []).forEach(deleteAttachments);
      delete db.messages[id];
    } else {
      fail('Ação desconhecida');
    }
    save();
    broadcastState();
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
