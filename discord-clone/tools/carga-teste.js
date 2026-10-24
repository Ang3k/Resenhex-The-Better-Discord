// Teste de carga local do Resenhex (Windows: mede o processador do servidor pelo PowerShell).
// Sobe um servidor de teste com dados temporários, cria contas espalhadas em SERVERS servidores e mede, a cada
// degrau de pessoas online, quanto custa uma mudança (entrar/sair da sala de voz): processador do servidor,
// tempo até todos que deviam receber, tamanho do estado, memória e quantas pessoas receberam.
//   STEPS=200,400,800 SERVERS=40 node tools/carga-teste.js
//   SERVER_JS=<outro server.js> compara com outra versão (ex.: git show HEAD~1:discord-clone/server.js > server-antigo.js
//   na mesma pasta do server.js, para os require relativos funcionarem; apague depois).
//   SETTLE=6000 espera as conexões assentarem antes de medir (padrão 1500 ms).
// Criar servidor tem limite de 5 por minuto: por isso o teste cria um de modelo e copia os outros direto no data.json.
// Mais em docs/plano-5000-online.md (Fase 0 pede uma versão mais completa deste simulador).
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { io } = require('socket.io-client');

const SERVER = process.env.SERVER_JS || path.join(__dirname, '..', 'server.js');
const PORT = 3170;
const URL = 'http://127.0.0.1:' + PORT;
const STEPS = (process.env.STEPS || '50,100,200,400,800').split(',').map(Number);
const SERVERS = Number(process.env.SERVERS || 1); // contas espalhadas em quantos servidores
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-carga-'));
const DATA = path.join(dir, 'data.json');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let proc;

async function start() {
  proc = spawn(process.execPath, [SERVER], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DATA_FILE: DATA, UPLOAD_DIR: path.join(dir, 'uploads'), MAIL_DEV: 'console', PUBLIC_URL: '', MEDIA_SFU: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('rodando')) resolve(); });
    proc.once('exit', (c) => reject(new Error('saiu ' + c)));
  });
}
const cpuMs = () => Number(execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${proc.pid}).TotalProcessorTime.TotalMilliseconds`]).toString().trim().replace(',', '.'));
const memMb = () => Math.round(Number(execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${proc.pid}).WorkingSet64`]).toString().trim()) / 1048576);

function client(token) {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true });
    s.states = 0;
    s.on('state', (st) => { s.states++; s.lastAt = performance.now(); s.lastState = st; s.size = JSON.stringify(st).length; });
    s.on('connect', () => s.emit('auth', { token, version: 'x' }, (res) => { s.res = res; resolve(s); }));
  });
}

(async () => {
  // 1) Banco novo com o dono; 2) contas extras gravadas direto no data.json, com sessão e membro do servidor.
  await start();
  const first = io(URL, { transports: ['websocket'], forceNew: true });
  await new Promise((r) => first.on('connect', r));
  const reg = await new Promise((r) => first.emit('auth', { mode: 'register', name: 'Dono', password: 'teste123', confirmPassword: 'teste123', version: 'x' }, r));
  // Criar servidor tem limite de 5 por minuto: cria um de modelo e copia o resto direto no data.json.
  const template = SERVERS > 1 ? await new Promise((r) => first.emit('server:create', { name: 'Modelo' }, r)) : null;
  await wait(800); first.disconnect(); proc.kill(); await wait(500);
  const root = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const hex = () => crypto.randomBytes(8).toString('hex');
  for (let i = 2; i < SERVERS; i++) {
    const copy = structuredClone(root.servers[template.id]);
    const ids = new Map();
    const fresh = (old) => { if (!ids.has(old)) ids.set(old, hex()); return ids.get(old); };
    copy.id = hex();
    copy.serverName = 'Servidor ' + i;
    copy.inviteCode = crypto.randomBytes(18).toString('base64url');
    copy.categories = copy.categories.map((g) => ({ ...g, id: fresh(g.id) }));
    copy.channels = copy.channels.map((c) => ({ ...c, id: fresh(c.id), categoryId: c.categoryId ? fresh(c.categoryId) : c.categoryId }));
    root.servers[copy.id] = copy;
  }
  const serverIds = Object.keys(root.servers);
  const tokens = [];
  const max = Math.max(...STEPS);
  for (let i = 0; i < max; i++) {
    const id = crypto.randomBytes(8).toString('hex'), token = crypto.randomBytes(32).toString('hex');
    root.accounts[id] = { id, name: 'pessoa' + i, color: '#5865f2', createdAt: Date.now() };
    root.sessions[token] = id;
    root.servers[serverIds[i % serverIds.length]].members[id] = { active: true, roles: [], joinedAt: Date.now() };
    tokens.push(token);
  }
  fs.writeFileSync(DATA, JSON.stringify(root));
  await start();

  const clients = [await client(reg.token)];
  await wait(500);
  const voice = clients[0].lastState?.channels.find((c) => c.type === 'voice')?.id;
  console.log(`contas espalhadas em ${SERVERS} servidor(es); medindo entrar/sair da sala de voz (cada mudança avisa quem é afetado)`);
  console.log('online | estado por pessoa | CPU do servidor por aviso | tempo até o último receber | memória do servidor | receberam');
  for (const step of STEPS) {
    while (clients.length < step) {
      const batch = tokens.slice(clients.length - 1, Math.min(step - 1, clients.length - 1 + 50)).map(client);
      clients.push(...await Promise.all(batch));
      if (clients.length >= step) break;
    }
    await wait(Number(process.env.SETTLE || 1500));
    const rounds = 10, latencies = [];
    let received = 0;
    const c0 = cpuMs();
    for (let r = 0; r < rounds; r++) {
      const before = clients.map((s) => s.states);
      const view = clients[0].lastState.serverId;
      const targets = clients.filter((s) => s.lastState?.serverId === view);
      const t0 = performance.now();
      await new Promise((res) => clients[0].emit(r % 2 ? 'voice:leave' : 'voice:join', r % 2 ? {} : { channel: voice }, res));
      const end = performance.now() + 5000;
      while (targets.some((s) => s.states === before[clients.indexOf(s)]) && performance.now() < end) await wait(5);
      latencies.push(Math.max(...targets.map((s) => s.lastAt)) - t0);
      await wait(150);
      received = clients.filter((s, i) => s.states !== before[i]).length;
    }
    const cpu = (cpuMs() - c0) / rounds;
    latencies.sort((a, b) => a - b);
    const size = clients[clients.length - 1].size;
    console.log(`${String(step).padStart(6)} | ${(size / 1024).toFixed(0).padStart(5)} KB | ${cpu.toFixed(0).padStart(5)} ms | ${latencies[5].toFixed(0).padStart(5)} ms | ${memMb()} MB | ${received}`);
  }
  const st = clients[clients.length - 1].lastState;
  console.log('membros na lista:', st.members.length, '· bytes por membro:', Math.round(JSON.stringify(st.members).length / st.members.length), '· exemplo:', JSON.stringify(st.members.at(-1)).slice(0, 400));
  console.log('o que pesa no estado (KB):', Object.entries(st).map(([k, v]) => [k, JSON.stringify(v ?? null).length]).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `${k} ${(n / 1024).toFixed(1)}`).join(' · '));
  clients.forEach((s) => s.disconnect());
  proc.kill();
  await wait(300);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(e); proc?.kill(); process.exit(1); });
