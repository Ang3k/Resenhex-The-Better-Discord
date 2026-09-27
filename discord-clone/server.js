// Servidor do clone do Discord: contas, cargos e permissões, moderação,
// chat de texto e sinalização WebRTC para voz e compartilhamento de tela.
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_MESSAGES = 300;
// Se definida, só cria conta quem souber a senha (recomendado quando o servidor estiver na internet).
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';

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
  SEND_MESSAGES: 'Enviar mensagens',
  CONNECT: 'Entrar em canais de voz',
  SPEAK: 'Falar na voz',
  STREAM: 'Compartilhar tela',
};
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
      { id: 'everyone', name: '@everyone', color: '', hoist: false, perms: ['SEND_MESSAGES', 'CONNECT', 'SPEAK', 'STREAM'] },
      { id: newId(), name: 'Moderador', color: '#3498db', hoist: true, perms: ['KICK', 'TIMEOUT', 'MUTE_MEMBERS', 'MOVE_MEMBERS', 'MANAGE_MESSAGES'] },
      { id: newId(), name: 'Admin', color: '#e74c3c', hoist: true, perms: ['ADMIN'] },
    ],
    channels: [
      ...text.map((name) => ({ id: name, type: 'text', name, allowedRoles: [] })),
      ...voice.map((name) => ({ id: newId(), type: 'voice', name, allowedRoles: [] })),
    ],
    messages: Object.fromEntries(text.map((c) => [c, []])),
  };
}

function loadDb() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return defaultDb();
  }
  if (raw.accounts) return raw;
  // Formato antigo (só mensagens por nome de canal): mantém o histórico.
  const db = defaultDb();
  for (const [channel, list] of Object.entries(raw)) {
    if (!db.messages[channel] || !Array.isArray(list)) continue;
    db.messages[channel] = list.map((m) => ({ id: m.id, authorId: null, authorName: m.author, authorColor: m.color, text: m.text, ts: m.ts }));
  }
  return db;
}

const db = loadDb();

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
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function checkPassword(acc, password) {
  const { hash } = hashPassword(password, acc.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(acc.hash, 'hex'));
}

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

// ---------------- sessões conectadas ----------------
// socket.id -> { accountId, voice: idDoCanal|null, muted, deafened, sharing }
const online = new Map();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/config', (_req, res) => {
  res.json({ passwordRequired: !!ACCESS_PASSWORD, hasOwner: !!db.ownerId });
});

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

function socketsOf(accountId) {
  return [...online].filter(([, s]) => s.accountId === accountId).map(([sid]) => io.sockets.sockets.get(sid)).filter(Boolean);
}

function publicMember(a) {
  return {
    id: a.id,
    name: a.name,
    color: a.color,
    roles: a.roles,
    online: [...online.values()].some((s) => s.accountId === a.id),
    serverMuted: !!a.serverMuted,
    serverDeafened: !!a.serverDeafened,
    timeoutUntil: a.timeoutUntil || 0,
  };
}

function stateFor(acc) {
  return {
    ownerId: db.ownerId,
    roles: db.roles,
    channels: db.channels.filter((c) => canView(acc, c)),
    members: Object.values(db.accounts).filter((a) => !a.banned).map(publicMember),
    voice: [...online].filter(([, s]) => s.voice).map(([sid, s]) => {
      const a = db.accounts[s.accountId];
      return {
        sid,
        accountId: s.accountId,
        channel: s.voice,
        muted: s.muted,
        deafened: s.deafened,
        sharing: s.sharing,
        // "silenced": ninguém deve ouvir essa pessoa (mutada pelo servidor, de castigo ou sem permissão de falar).
        silenced: !!a.serverMuted || timedOut(a) || !can(a, 'SPEAK'),
      };
    }),
    myPerms: [...permsOf(acc)],
    bans: can(acc, 'BAN') ? Object.values(db.accounts).filter((a) => a.banned).map((a) => ({ id: a.id, name: a.name })) : [],
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
    } else if (s.sharing && (!can(acc, 'STREAM') || timedOut(acc))) {
      s.sharing = false;
      socket.emit('voice:stop-share');
    }
  }
}

function broadcastState() {
  enforceVoice();
  for (const [sid, s] of online) {
    const acc = db.accounts[s.accountId];
    io.sockets.sockets.get(sid)?.emit('state', stateFor(acc));
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
        reply(result || { ok: true });
      } catch (err) {
        reply({ error: err.message });
      }
    });
  };
  const fail = (msg) => { throw new Error(msg); };

  socket.on('auth', async (payload, ack) => {
    if (typeof ack !== 'function' || online.has(socket.id)) return;
    payload ||= {};
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
        acc = { id: newId(), name, color: cleanColor(payload.color), roles: [], createdAt: Date.now(), ...hashPassword(password) };
        db.accounts[acc.id] = acc;
        // A primeira conta criada vira dona do servidor.
        if (!db.ownerId) db.ownerId = acc.id;
      } else {
        if (!existing || !checkPassword(existing, password)) {
          await new Promise((r) => setTimeout(r, 800)); // atrasa tentativas de adivinhar senha
          return ack({ error: 'Nome ou senha incorretos' });
        }
        acc = existing;
      }
    }
    if (acc.banned) return ack({ error: 'Você foi banido deste servidor.' });
    const token = payload.token || createSession(acc.id);
    online.set(socket.id, { accountId: acc.id, voice: null, muted: false, deafened: false, sharing: false });
    save();
    ack({ token, accountId: acc.id, sid: socket.id, iceServers: iceServers(), permNames: PERMS });
    broadcastState();
  });

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

  on('chat:send', (acc, { channel, text }) => {
    const c = textChannel(acc, channel);
    text = String(text || '').trim().slice(0, 2000);
    if (!text) return;
    if (!can(acc, 'SEND_MESSAGES')) fail('Você não tem permissão para enviar mensagens.');
    if (timedOut(acc)) fail('Você está de castigo.');
    const msg = { id: newId(), authorId: acc.id, text, ts: Date.now() };
    const list = (db.messages[c.id] ||= []);
    list.push(msg);
    if (list.length > MAX_MESSAGES) list.shift();
    emitToViewers(c, 'chat:message', { channel: c.id, msg });
    save();
  });

  on('chat:edit', (acc, { channel, id, text }) => {
    const c = textChannel(acc, channel);
    const msg = db.messages[c.id]?.find((m) => m.id === id);
    text = String(text || '').trim().slice(0, 2000);
    if (!msg || msg.authorId !== acc.id) fail('Só dá para editar suas mensagens.');
    if (timedOut(acc)) fail('Você está de castigo.');
    if (!text) return;
    msg.text = text;
    msg.edited = Date.now();
    emitToViewers(c, 'chat:update', { channel: c.id, msg });
    save();
  });

  on('chat:delete', (acc, { channel, id }) => {
    const c = textChannel(acc, channel);
    const list = db.messages[c.id] || [];
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) return;
    if (list[i].authorId !== acc.id && !can(acc, 'MANAGE_MESSAGES')) fail('Sem permissão para apagar essa mensagem.');
    list.splice(i, 1);
    emitToViewers(c, 'chat:delete', { channel: c.id, id });
    save();
  });

  on('typing', (acc, { channel }) => {
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

  on('voice:state', (acc, { muted, deafened, sharing }) => {
    const s = online.get(socket.id);
    s.muted = !!muted;
    s.deafened = !!deafened;
    s.sharing = !!sharing && !!s.voice && can(acc, 'STREAM') && !timedOut(acc);
    broadcastState();
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

server.listen(PORT, () => {
  console.log(`Discord clone rodando em http://localhost:${PORT}`);
});
