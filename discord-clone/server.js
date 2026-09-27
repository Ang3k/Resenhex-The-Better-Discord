// Servidor do clone do Discord: serve o front-end, guarda o chat de texto
// e faz a sinalização WebRTC para as chamadas de voz e compartilhamento de tela.
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_MESSAGES = 200;
// Se definida, só entra quem souber a senha (recomendado quando o servidor estiver na internet).
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';

const TEXT_CHANNELS = ['geral', 'jogos', 'links'];
const VOICE_CHANNELS = ['Sala 1', 'Sala 2', 'AFK'];

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

function loadMessages() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return Object.fromEntries(TEXT_CHANNELS.map((c) => [c, []]));
  }
}

const messages = loadMessages();
for (const c of TEXT_CHANNELS) messages[c] ??= [];

let saveTimer = null;
function saveMessages() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(messages), (err) => {
      if (err) console.error('Falha ao salvar mensagens:', err);
    });
  }, 500);
}

// socket.id -> { name, color, voice: nomeDaSala|null, muted, deafened, sharing }
const users = new Map();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/config', (_req, res) => {
  res.json({ textChannels: TEXT_CHANNELS, voiceChannels: VOICE_CHANNELS, passwordRequired: !!ACCESS_PASSWORD });
});

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

function publicUser(id) {
  const u = users.get(id);
  return { id, name: u.name, color: u.color, voice: u.voice, muted: u.muted, deafened: u.deafened, sharing: u.sharing };
}

function broadcastPresence() {
  io.emit('presence', [...users.keys()].map(publicUser));
}

function leaveVoice(socket) {
  const u = users.get(socket.id);
  if (!u || !u.voice) return;
  const room = 'voice:' + u.voice;
  socket.to(room).emit('voice:peer-left', { id: socket.id });
  socket.leave(room);
  u.voice = null;
  u.sharing = false;
}

io.on('connection', (socket) => {
  socket.on('login', ({ name, color, password }, ack) => {
    name = String(name || '').trim().slice(0, 32);
    if (!name) return ack?.({ error: 'Nome inválido' });
    if (ACCESS_PASSWORD && password !== ACCESS_PASSWORD) return ack?.({ error: 'Senha incorreta' });
    users.set(socket.id, {
      name,
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#5865f2',
      voice: null,
      muted: false,
      deafened: false,
      sharing: false,
    });
    ack?.({ id: socket.id, messages, iceServers: iceServers() });
    broadcastPresence();
  });

  socket.on('chat:send', ({ channel, text }) => {
    const u = users.get(socket.id);
    text = String(text || '').trim().slice(0, 2000);
    if (!u || !text || !TEXT_CHANNELS.includes(channel)) return;
    const msg = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), author: u.name, color: u.color, text, ts: Date.now() };
    messages[channel].push(msg);
    if (messages[channel].length > MAX_MESSAGES) messages[channel].shift();
    io.emit('chat:message', { channel, msg });
    saveMessages();
  });

  socket.on('typing', ({ channel }) => {
    const u = users.get(socket.id);
    if (u) socket.broadcast.emit('typing', { channel, name: u.name });
  });

  // --- Voz ---
  socket.on('voice:join', ({ channel }, ack) => {
    const u = users.get(socket.id);
    if (!u || !VOICE_CHANNELS.includes(channel)) return;
    leaveVoice(socket);
    const room = 'voice:' + channel;
    // Quem entra recebe a lista dos que já estão na sala e inicia as conexões com eles.
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])];
    socket.join(room);
    u.voice = channel;
    ack?.({ peers });
    broadcastPresence();
  });

  socket.on('voice:leave', () => {
    leaveVoice(socket);
    broadcastPresence();
  });

  socket.on('voice:state', ({ muted, deafened, sharing }) => {
    const u = users.get(socket.id);
    if (!u) return;
    u.muted = !!muted;
    u.deafened = !!deafened;
    u.sharing = !!sharing && !!u.voice;
    broadcastPresence();
  });

  // Repassa ofertas/respostas/ICE entre dois participantes da mesma sala.
  socket.on('signal', ({ to, data }) => {
    const from = users.get(socket.id);
    const target = users.get(to);
    if (!from || !target || !from.voice || from.voice !== target.voice) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    leaveVoice(socket);
    users.delete(socket.id);
    broadcastPresence();
  });
});

server.listen(PORT, () => {
  console.log(`Discord clone rodando em http://localhost:${PORT}`);
});
