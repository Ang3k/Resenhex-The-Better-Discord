// Simulador de carga v2 do Resenhex (Fase 0 do docs/plano-5000-online.md).
// Monta um banco de teste do tamanho do site (RATIO contas cadastradas por pessoa online, com amizades, conversas,
// bloqueios, servidores pequenos, médios e grandes), sobe uma cópia do servidor com esses dados e põe as pessoas
// online em degraus. Cada pessoa segue o ritmo das premissas do plano: muda algo na call (entrar, sair, mutar,
// status) 1×/min, manda mensagem a cada 3 min (com "digitando" antes) e troca de servidor 1×/min.
// Os números vêm do medidor de saúde do próprio servidor (site:health), lido pela conta do dono.
// As pessoas ficam em vários processos (um só não aguenta milhares de conexões).
//   STEPS=250,500,1000 node tools/simulador.js
//   RATIO=10 contas por pessoa online (ou ACCOUNTS=50000 fixo) · RATE=1 multiplica o ritmo · DURATION=60 s medindo por degrau · SETTLE=15 s
//   RECONNECT=1 no fim derruba todo mundo e mede a volta em 60 s · KEEP_GOING=1 segue depois de um degrau reprovado
//   MESSAGES=50 põe 50 mensagens antigas em cada canal de texto e em cada conversa privada (banco maior, como o de verdade)
//   SERVER_JS=<outro server.js> mede outra versão (na mesma pasta do server.js, para os require relativos funcionarem).
// No PC, multiplique processador e atraso por ~1,7 para ter a estimativa do servidor ARM (o relatório já faz isso).
const { spawn, fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { io } = require('socket.io-client');
const { readRoot, writeRoot } = require('../server/store');

const PORT = Number(process.env.PORT || 3172);
const URL = 'http://127.0.0.1:' + PORT;
const ARM = 1.7;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const exp = (mean) => -Math.log(1 - Math.random()) * mean;

// ---------------- processo que simula uma parte das pessoas ----------------
if (process.argv[2] === '--worker') {
  const RATE = Number(process.env.RATE || 1);
  let people = [];
  let errors = 0;
  const reasons = new Map(); // "evento: erro" -> quantas vezes
  const fail = (event, text) => { errors++; const key = `${event}: ${text}`; reasons.set(key, (reasons.get(key) || 0) + 1); };
  const report = () => process.send({ type: 'status', online: people.filter((p) => p.ready).length, errors, reasons: [...reasons] });
  setInterval(report, 1000);

  function schedule(p, key, mean, action) {
    p.timers[key] = setTimeout(() => { if (p.ready) action(); schedule(p, key, mean, action); }, exp(mean / RATE));
  }
  const server = (p) => p.servers.find((s) => s.id === p.current);
  const emit = (p, event, payload) => p.socket.timeout(10_000).emit(event, payload, (error, res) => { if (error || res?.error) fail(event, error ? 'sem resposta' : res.error); });

  function behave(p) {
    // Mudanças: entrar ou sair da call, mutar, trocar o status.
    schedule(p, 'change', 60_000, () => {
      if (Math.random() < 0.1) return emit(p, 'presence', { presence: pick(['online', 'idle', 'dnd']) });
      if (!p.voice) { p.voice = pick(server(p).voices); emit(p, 'voice:join', { channel: p.voice, serverId: p.current }); }
      else if (Math.random() < 0.5) { p.voice = null; emit(p, 'voice:leave', {}); }
      else { p.muted = !p.muted; emit(p, 'voice:state', { muted: p.muted, deafened: false, sharing: false, paused: false, camera: false }); }
    });
    // Mensagem a cada 3 min, com dois "digitando" antes.
    schedule(p, 'message', 180_000, () => {
      if (p.switching) return;
      const at = p.current;
      const channel = server(p).text;
      // Trocou de servidor no meio: a mensagem ficaria num canal que não é do servidor aberto.
      const still = () => p.ready && !p.switching && p.current === at;
      emit(p, 'typing', { channel });
      setTimeout(() => still() && emit(p, 'typing', { channel }), 1500);
      setTimeout(() => still() && emit(p, 'chat:send', { channel, text: 'mensagem de teste ' + crypto.randomBytes(4).toString('hex') }), 3000);
    });
    // Troca de servidor 1×/min (só quem participa de mais de um).
    schedule(p, 'switch', 60_000, () => {
      if (p.servers.length < 2 || p.switching) return;
      const id = pick(p.servers.filter((s) => s.id !== p.current)).id;
      // Só passa a usar os canais do outro servidor depois que o servidor confirmou a troca.
      p.switching = true;
      p.socket.timeout(10_000).emit('server:select', { id }, (error, res) => {
        p.switching = false;
        if (error || res?.error) fail('server:select', error ? 'sem resposta' : res.error);
        else p.current = id;
      });
    });
  }

  const stopTimers = (p) => { p.ready = false; for (const t of Object.values(p.timers)) clearTimeout(t); };
  // Como o app: conexão que falha ou cai tenta de novo em 1 a 5 s, enquanto a pessoa "quer" estar online.
  const retry = (p) => { if (p.wanted) setTimeout(() => p.wanted && !p.socket && connect(p), 1000 + Math.random() * 4000); };
  function connect(p) {
    const socket = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
    p.socket = socket;
    socket.on('connect', () => socket.timeout(60_000).emit('auth', { token: p.token, serverId: p.current, version: 'x' }, (error, res) => {
      if (error || res?.error) { fail('auth', error ? 'sem resposta' : res.error); socket.disconnect(); return; }
      p.ready = true;
      p.voice = null;
      behave(p);
    }));
    socket.on('connect_error', (e) => { fail('conexão', e.message); p.socket = null; retry(p); });
    socket.on('disconnect', () => { stopTimers(p); if (p.socket === socket) { p.socket = null; retry(p); } });
  }
  // Saída pedida pelo simulador: não tenta voltar sozinha.
  const disconnect = (p) => { const socket = p.socket; p.socket = null; stopTimers(p); socket?.disconnect(); };

  process.on('message', async (msg) => {
    if (msg.type === 'people') people = msg.people.map((p) => ({ ...p, current: p.home, timers: {}, ready: false, wanted: false }));
    if (msg.type === 'online') {
      // Entra aos poucos: 25 conexões a cada 50 ms por processo.
      const todo = people.filter((p) => !p.wanted).slice(0, Math.max(0, msg.count - people.filter((p) => p.wanted).length));
      for (let i = 0; i < todo.length; i++) { todo[i].wanted = true; connect(todo[i]); if (i % 25 === 24) await wait(50); }
    }
    if (msg.type === 'reconnect') {
      const active = people.filter((p) => p.wanted);
      active.forEach(disconnect);
      for (const p of active) setTimeout(() => p.wanted && !p.socket && connect(p), Math.random() * msg.windowMs);
    }
    if (msg.type === 'stop') { people.forEach((p) => { p.wanted = false; disconnect(p); }); report(); setTimeout(() => process.exit(0), 200); }
  });
  return;
}

// ---------------- processo principal ----------------
const SERVER = process.env.SERVER_JS || path.join(__dirname, '..', 'server.js');
const STEPS = (process.env.STEPS || '250,500,1000,2000,3000,5000').split(',').map(Number);
const RATIO = Number(process.env.RATIO || 10);
const DURATION = Number(process.env.DURATION || 60) * 1000;
const SETTLE = Number(process.env.SETTLE || 15) * 1000;
const ONLINE = Math.max(...STEPS);
const ACCOUNTS = Math.max(ONLINE, Number(process.env.ACCOUNTS) || ONLINE * RATIO);
const WORKERS = Math.max(1, Math.min(os.cpus().length - 4, Math.ceil(ONLINE / 600)));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-simulador-'));
const DATA = path.join(dir, 'data.json');
const DB = path.join(dir, 'data.db'); // o servidor atual grava em SQLite; versões antigas (SERVER_JS) no data.json
const MESSAGES = Number(process.env.MESSAGES || 0);
let proc;
const workers = [];

function start() {
  const t0 = performance.now();
  proc = spawn(process.execPath, ['--max-old-space-size=6144', SERVER], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DATA_FILE: DATA, UPLOAD_DIR: path.join(dir, 'uploads'), MAIL_DEV: 'console', PUBLIC_URL: '', MEDIA_SFU: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stderr.on('data', (d) => { const text = String(d); if (!/ExperimentalWarning|DeprecationWarning/.test(text)) process.stderr.write('[servidor] ' + text); });
  return new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('rodando')) resolve(performance.now() - t0); });
    proc.once('exit', (c) => reject(new Error('o servidor saiu: ' + c)));
  });
}
const stopServer = async () => { if (proc && proc.exitCode === null) { const done = new Promise((r) => proc.once('exit', r)); proc.kill(); await done; } };
const call = (socket, event, payload = {}) => new Promise((r) => socket.timeout(30_000).emit(event, payload, (error, res) => r(error ? { error: error.message } : res)));

// Banco do tamanho do site: o servidor de modelo vem de um cadastro de verdade; o resto é copiado direto no banco
// (criar servidor tem limite de 5 por minuto).
async function buildDatabase() {
  await start();
  const owner = io(URL, { transports: ['websocket'], forceNew: true });
  await new Promise((r) => owner.on('connect', r));
  const reg = await call(owner, 'auth', { mode: 'register', name: 'Dono', password: 'teste123', confirmPassword: 'teste123', version: 'x' });
  await wait(800); owner.disconnect(); await stopServer();
  const sqlite = fs.existsSync(DB);
  const root = sqlite ? readRoot(DB) : JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const template = root.servers[root.defaultServerId];
  const hex = () => crypto.randomBytes(8).toString('hex');
  const ids = [];
  for (let i = 0; i < ACCOUNTS; i++) { const id = hex(); ids.push(id); root.accounts[id] = { id, name: 'pessoa' + i, color: '#5865f2', createdAt: Date.now() }; }
  const servers = [];
  for (let i = 0; i < Math.round(ACCOUNTS / 4); i++) {
    const copy = structuredClone(template);
    const fresh = new Map();
    const idOf = (old) => { if (!fresh.has(old)) fresh.set(old, hex()); return fresh.get(old); };
    Object.assign(copy, { id: hex(), serverName: 'Servidor ' + i, ownerId: null, members: {}, inviteCode: crypto.randomBytes(18).toString('base64url') });
    copy.categories = copy.categories.map((g) => ({ ...g, id: idOf(g.id) }));
    copy.channels = copy.channels.map((c) => ({ ...c, id: idOf(c.id), categoryId: c.categoryId ? idOf(c.categoryId) : c.categoryId }));
    root.servers[copy.id] = copy;
    servers.push(copy);
  }
  const join = (server, id) => { server.members[id] = { active: true, roles: [], joinedAt: Date.now() }; server.ownerId ||= id; };
  // Dois servidores grandes (até 500), 1% médios (50–200) e o resto pequeno: cada conta entra em 1 a 4 deles.
  const big = Math.min(500, Math.floor(ACCOUNTS / 20));
  servers.slice(0, 2).forEach((s) => { for (let k = 0; k < big; k++) join(s, pick(ids)); });
  const medium = servers.slice(2, 2 + Math.ceil(servers.length / 100));
  medium.forEach((s) => { const n = 50 + Math.floor(Math.random() * 150); for (let k = 0; k < n; k++) join(s, pick(ids)); });
  const small = servers.slice(2 + medium.length);
  for (const id of ids) for (let k = 1 + Math.floor(Math.random() * 4); k > 0; k--) join(pick(small), id);
  // Amizades (~5 por conta), conversas privadas (~3 por conta) e alguns bloqueios.
  const pair = (a, b) => [a, b].sort().join('-');
  for (let i = 0; i < ACCOUNTS * 2.5; i++) { const a = pick(ids), b = pick(ids); if (a !== b) root.friendships[pair(a, b)] = { status: 'friends', from: a, ts: Date.now() }; }
  root.dms ||= {};
  for (let i = 0; i < ACCOUNTS * 1.5; i++) { const a = pick(ids), b = pick(ids); if (a !== b) { const id = 'dm-' + pair(a, b); root.dms[id] = { id, users: [a, b], closed: {} }; } }
  root.blocks ||= {};
  for (let i = 0; i < ACCOUNTS / 100; i++) root.blocks[pick(ids)] = [pick(ids)];
  if (MESSAGES) {
    const old = (author, k) => ({ id: hex(), authorId: author, text: `mensagem antiga ${k}: uma frase comum de conversa, com umas palavras a mais`, ts: Date.now() - (MESSAGES - k) * 60_000, mentions: { users: [], roles: [], everyone: false } });
    for (const s of servers) {
      const members = Object.keys(s.members);
      for (const c of s.channels) if (c.type === 'text' && members.length) root.messages[c.id] = Array.from({ length: MESSAGES }, (_, k) => old(pick(members), k));
    }
    for (const dm of Object.values(root.dms)) root.messages[dm.id] = Array.from({ length: MESSAGES }, (_, k) => old(pick(dm.users), k));
  }
  // Quem fica online: as primeiras ONLINE contas, cada uma com sessão e os canais dos seus servidores.
  const channelsOf = (s) => ({ id: s.id, text: s.channels.find((c) => c.type === 'text').id, voices: s.channels.filter((c) => c.type === 'voice').map((c) => c.id) });
  const memberOf = new Map();
  for (const s of servers) for (const id of Object.keys(s.members)) { if (!memberOf.has(id)) memberOf.set(id, []); memberOf.get(id).push(s); }
  const people = ids.slice(0, ONLINE).map((id) => {
    const token = crypto.randomBytes(32).toString('hex');
    root.sessions[token] = id;
    const mine = (memberOf.get(id) || []).slice(0, 8).map(channelsOf);
    const home = pick(mine).id;
    root.accounts[id].lastServerId = home;
    return { token, home, servers: mine };
  });
  if (sqlite) writeRoot(DB, root); else fs.writeFileSync(DATA, JSON.stringify(root));
  const sizes = servers.map((s) => Object.keys(s.members).length).sort((a, b) => b - a);
  const messages = Object.values(root.messages).reduce((n, list) => n + list.length, 0);
  console.log(`banco: ${ACCOUNTS} contas, ${servers.length} servidores (maiores: ${sizes.slice(0, 3).join(', ')} membros), ${Object.keys(root.friendships).length} amizades, ${Object.keys(root.dms).length} conversas, ${messages} mensagens · ${sqlite ? 'data.db' : 'data.json'} ${(fs.statSync(sqlite ? DB : DATA).size / 1048576).toFixed(1)} MB`);
  return { ownerToken: reg.token, people };
}

const f1 = (v) => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('pt-BR');
const f2 = (v) => v == null ? '—' : (Math.round(v * 100) / 100).toLocaleString('pt-BR');
const pad = (text, n) => String(text).padStart(n);

(async () => {
  console.log(`simulador: degraus ${STEPS.join(', ')} online · ${RATIO} contas por pessoa online · ${WORKERS} processos de pessoas · ritmo ×${process.env.RATE || 1}`);
  const { ownerToken, people } = await buildDatabase();
  const startup = await start();
  console.log(`o servidor ligou em ${f1(startup / 1000)} s com esse banco`);
  const owner = io(URL, { transports: ['websocket'], forceNew: true });
  await new Promise((r) => owner.on('connect', r));
  const auth = await call(owner, 'auth', { token: ownerToken, version: 'x' });
  if (auth.error) throw new Error('conta do dono: ' + auth.error);

  const status = new Map();
  for (let w = 0; w < WORKERS; w++) {
    const child = fork(__filename, ['--worker'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', (m) => { if (m.type === 'status') status.set(w, m); });
    child.send({ type: 'people', people: people.filter((_, i) => i % WORKERS === w) });
    workers.push(child);
  }
  const onlineNow = () => [...status.values()].reduce((sum, s) => sum + s.online, 0);
  const errorsNow = () => [...status.values()].reduce((sum, s) => sum + s.errors, 0);
  const reasonsNow = () => {
    const all = new Map();
    for (const s of status.values()) for (const [key, n] of s.reasons) all.set(key, (all.get(key) || 0) + n);
    return [...all].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, n]) => `  ${n}× ${key}`).join('\n');
  };
  // Cada amostra cobre os 10 s anteriores a ela: só valem as que começaram depois de 'since'.
  const samples = async (since) => {
    const health = await call(owner, 'site:health');
    if (health.error) { console.log(`  o medidor não respondeu (${health.error})`); return []; }
    return health.history.filter((p) => p.at - health.every >= since);
  };

  console.log('\nonline | atraso p99 (PC → ARM) | atraso máx (PC → ARM) | processador (PC → ARM) | memória | mudanças/s | custo por mudança (PC → ARM) | envio | gravação | resultado');
  let ceiling = null, lastPassed = 0;
  for (const step of STEPS) {
    workers.forEach((child) => child.send({ type: 'online', count: Math.ceil(step / WORKERS) }));
    const entering = Date.now();
    let told = entering;
    while (onlineNow() < step * 0.98 && Date.now() - entering < 5 * 60_000) {
      await wait(500);
      if (Date.now() - told >= 15_000) { told = Date.now(); console.log(`  entrando: ${onlineNow()} de ${step} em ${Math.round((told - entering) / 1000)} s`); }
    }
    const slow = onlineNow() < step * 0.98; // não chegou lá em 5 min: o degrau reprova mesmo que os números pareçam bons
    await wait(SETTLE);
    const since = Date.now();
    await wait(DURATION);
    const points = await samples(since);
    if (!points.length) {
      console.log(`${pad(onlineNow(), 6)} | NÃO PASSOU: sem amostras do medidor (servidor travado)`);
      ceiling ??= step;
      if (!process.env.KEEP_GOING) break;
      continue;
    }
    const max = (key) => Math.max(...points.map((p) => p[key] ?? 0));
    const avg = (key) => points.reduce((sum, p) => sum + (p[key] ?? 0), 0) / points.length;
    const p99 = max('loopP99'), worst = max('loopMax'), cpu = avg('cpu');
    const failed = [slow && 'não entraram todos em 5 min', p99 * ARM >= 50 && 'atraso p99', worst * ARM >= 250 && 'atraso máx', cpu * ARM >= 50 && 'processador', (max('rssMb') >= 6144 || max('heapPct') >= 70) && 'memória'].filter(Boolean);
    console.log(`${pad(onlineNow(), 6)} | ${pad(f1(p99) + ' → ' + f1(p99 * ARM) + ' ms', 21)} | ${pad(f1(worst) + ' → ' + f1(worst * ARM) + ' ms', 21)} | ${pad(f1(cpu) + '% → ' + f1(cpu * ARM) + '%', 22)} | ${pad(max('rssMb') + ' MB', 7)} | ${pad(f1(avg('changes')), 10)} | ${pad(f2(avg('sendMsPerChange')) + ' → ' + f2(avg('sendMsPerChange') * ARM) + ' ms', 28)} | ${pad(f1(avg('sentKBps')) + ' KB/s', 11)} | ${pad(points.some((p) => p.saves) ? f1(max('saveMaxMs')) + ' ms' : 'nenhuma', 8)} | ${failed.length ? 'NÃO PASSOU: ' + failed.join(', ') : 'passou'}${errorsNow() ? ` (${errorsNow()} respostas com erro até aqui)` : ''}`);
    if (failed.length) { ceiling ??= step; if (!process.env.KEEP_GOING) break; } else lastPassed = step;
  }

  if (process.env.RECONNECT && lastPassed) {
    const before = onlineNow();
    const since = Date.now();
    workers.forEach((child) => child.send({ type: 'reconnect', windowMs: 60_000 }));
    await wait(3000);
    while (onlineNow() < before * 0.98 && Date.now() - since < 5 * 60_000) await wait(500);
    const back = (Date.now() - since) / 1000;
    await wait(12_000);
    const points = await samples(since);
    const worst = Math.max(...points.map((p) => p.loopMax));
    console.log(`\nreconexão em massa (${before} pessoas em 60 s): todos de volta em ${f1(back)} s · pior travada ${f1(worst)} ms (ARM ≈ ${f1(worst * ARM)} ms) · ${worst * ARM > 1000 || back > 120 ? 'NÃO PASSOU' : 'passou'}`);
  }

  if (errorsNow()) console.log(`\nrespostas com erro (as mais comuns):\n${reasonsNow()}`);
  console.log(ceiling ? `\nteto atual: entre ${lastPassed || 0} e ${ceiling} pessoas online (estimativa para o servidor ARM)` : '\nnenhum degrau reprovou');
  workers.forEach((child) => child.send({ type: 'stop' }));
  await wait(800);
  owner.disconnect();
  await stopServer();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch(async (e) => { console.error(e); workers.forEach((c) => c.kill()); await stopServer(); process.exit(1); });
