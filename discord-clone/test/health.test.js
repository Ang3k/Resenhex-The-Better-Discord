const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHealth, countRelayPorts, monthPace } = require('../server/health');

// Duas portas dentro da faixa do coturn (49152 = C000, 65535 = FFFF) e duas fora (3478 = 0D96, 53 = 0035).
const UDP = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode ref pointer drops
  1: 00000000:0D96 00000000:0000 07 00000000:00000000 00:00000000 00000000   112        0 1 2 0
  2: C800000A:C000 00000000:0000 07 00000000:00000000 00:00000000 00000000   112        0 2 2 0
  3: C800000A:FFFF 00000000:0000 07 00000000:00000000 00:00000000 00000000   112        0 3 2 0
  4: 3500007F:0035 00000000:0000 07 00000000:00000000 00:00000000 00000000   101        0 4 2 0
`;

test('relay ports count only the UDP sockets inside the coturn range', () => {
  assert.equal(countRelayPorts(UDP), 2);
  assert.equal(countRelayPorts(''), 0);
});

test('each sample turns the counters into per-second rates and keeps the slowest save', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-saude-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'udp'), UDP);
  const lines = [];
  const health = createHealth({ connections: () => 3, online: () => 2, log: (line) => lines.push(line), every: 100, udpTable: path.join(dir, 'udp'), diskPath: dir });
  for (let i = 0; i < 5; i++) health.count('changes');
  health.count('bytes', 2048);
  health.saved(4); health.saved(12.34);
  await new Promise((r) => setTimeout(r, 160));
  const { history, targets, turnRange } = health.view();
  const [first] = history;
  assert.equal(history.length, 1);
  assert.ok(first.changes > 30 && first.changes <= 55, `changes/s: ${first.changes}`);
  assert.ok(first.sentKBps > 12 && first.sentKBps <= 22, `KB/s: ${first.sentKBps}`);
  assert.equal(first.saves, 2);
  assert.equal(first.saveMaxMs, 12.3);
  assert.equal(first.connections, 3);
  assert.equal(first.online, 2);
  assert.equal(first.turnPorts, 2);
  assert.ok(first.heapPct > 0 && first.heapPct < 100, `heap: ${first.heapPct}%`);
  assert.equal(targets.heapPct, 70);
  assert.ok(first.loopP99 >= 0 && first.loopP99 < first.loopMax + 1);
  assert.equal(targets.loopP99, 50);
  assert.equal(turnRange.min, 49152);
  assert.ok(first.diskPct > 0 && first.diskPct < 100 && first.diskFreeGB > 0, `disco: ${first.diskPct}%, ${first.diskFreeGB} GB livres`);
  assert.equal(targets.diskPct, 80);
  // O minuto seguinte começa do zero; o log ganha uma linha a cada 6 amostras.
  await new Promise((r) => setTimeout(r, 560));
  const later = health.view().history;
  assert.ok(later.length >= 6);
  assert.equal(later.at(-1).changes, 0);
  assert.equal(later.at(-1).saveMaxMs, null);
  assert.match(lines[0], /^\[saúde\] atraso p99 .* portas do retransmissor 2$/);
});

// /proc/net/dev com a placa interna (lo, não conta) e uma de verdade: só os bytes enviados (9ª coluna) contam.
const netDev = (sent) => `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 999999 10 0 0 0 0 0 0 888888888 10 0 0 0 0 0 0
  ens3: 5000 50 0 0 0 0 0 0 ${sent} 40 0 0 0 0 0 0
`;

test('network of the month survives restarts and reboots', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-rede-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dev = path.join(dir, 'dev'), monthFile = path.join(dir, 'rede-do-mes.json'), uptimeFile = path.join(dir, 'uptime');
  const lines = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const start = () => createHealth({ connections: () => 0, online: () => 0, log: (line) => lines.push(line), every: 40, udpTable: path.join(dir, 'udp'), netDev: dev, uptimeFile, monthFile, now: () => Date.UTC(2026, 9, 16) });

  // Primeira vez, sem o arquivo: a máquina ligou há 1 h, neste mês, e tudo o que a placa marca é do mês.
  fs.writeFileSync(uptimeFile, '3600.00 7000.00\n');
  fs.writeFileSync(dev, netDev(10e9));
  const first = start();
  await wait(60);
  fs.writeFileSync(dev, netDev(11.5e9));
  await wait(300); // 6 amostras: grava o arquivo
  assert.equal(first.view().history.at(-1).monthGB, 11.5);
  assert.ok(first.relayAllowed());
  assert.equal(first.view().targets.monthGB, 7000);
  assert.equal(JSON.parse(fs.readFileSync(monthFile, 'utf8')).bytes, 11.5e9);

  // Servidor reiniciado (mesma máquina): o que passou com ele desligado também conta.
  fs.writeFileSync(dev, netDev(12e9));
  const second = start();
  await wait(100);
  assert.equal(second.view().history.at(-1).monthGB, 12);

  // Máquina reiniciada: a placa recomeça do zero, e tudo o que ela marca é novo.
  await wait(300);
  fs.writeFileSync(dev, netDev(1.5e9));
  await wait(100);
  assert.equal(second.view().history.at(-1).monthGB, 13.5);
  assert.ok(lines.some((line) => / rede do mês [0-9.]+ GB \(ritmo [0-9.]+\) · disco \?% · portas/.test(line)));
});

test('the month is spent at a pace: above it the relay takes no one new, far above it coturn stops', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-ritmo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dev = path.join(dir, 'dev'), relayFile = path.join(dir, 'retransmissor.estado');
  const lines = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Outubro tem 31 dias. Neste teste o mês vale 6,2 GB + 0,5 de folga, e o coturn para 2 GB acima do ritmo.
  let clock = Date.UTC(2026, 9, 16); // 15 dias passados: ritmo 6,2 × 15/31 + 0,5 = 3,5 GB
  const day = (d, h = 0) => Date.UTC(2026, 9, d, h);
  assert.equal(monthPace(day(1)), 300, 'no começo do mês, só a folga');
  assert.equal(Math.round(monthPace(Date.UTC(2026, 10, 1) - 1)), 7000, 'no fim, a meta inteira');
  fs.writeFileSync(dev, netDev(50e9));
  const monthFile = path.join(dir, 'rede-do-mes.json');
  fs.writeFileSync(monthFile, JSON.stringify({ key: '2026-10', bytes: 0, counter: 50e9 })); // nada gasto até aqui
  const health = createHealth({ monthFile, connections: () => 0, online: () => 0, log: (line) => lines.push(line), every: 40, udpTable: path.join(dir, 'udp'), netDev: dev, relayFile, network: { budgetGB: 6.2, slackGB: 0.5, haltGB: 2 }, now: () => clock });
  const step = async (sent) => { fs.writeFileSync(dev, netDev(sent)); await wait(100); return health.view().history.at(-1); };
  const state = () => fs.readFileSync(relayFile, 'utf8').trim();
  await wait(60); // a primeira leitura da placa marca o começo

  let last = await step(53e9);
  assert.deepEqual([last.monthGB, last.monthPaceGB, last.relay], [3, 3.5, 'on']);
  assert.ok(health.relayAllowed());
  assert.equal(state(), 'ligado', 'a primeira leitura grava o estado: o coturn pode ter sido religado');

  last = await step(54e9);
  assert.equal(last.relay, 'paused');
  assert.equal(health.relayAllowed(), false);
  assert.equal(state(), 'ligado', 'acima do ritmo só não há senhas novas; o coturn continua');
  assert.ok(lines.some((line) => /passou do ritmo .*: o retransmissor não recebe gente nova/.test(line)));

  // Abuso com senhas já entregues: 2 GB além do ritmo.
  last = await step(56.5e9);
  assert.equal(last.relay, 'stopped');
  assert.equal(state(), 'parado');
  assert.ok(lines.some((line) => /passou 0.002 TB do ritmo .*: o retransmissor fica parado/.test(line)));

  // O ritmo andou, mas a rede ainda está acima dele: continua parado.
  clock = day(23, 12); // ritmo 6,2 × 22,5/31 + 0,5 = 5 GB
  last = await step(56.5e9);
  assert.deepEqual([last.monthPaceGB, last.relay], [5, 'stopped']);
  // Alcançou o ritmo: religa.
  clock = day(31, 12); // ritmo 6,6 GB
  last = await step(56.5e9);
  assert.deepEqual([last.monthGB, last.relay], [6.5, 'on']);
  assert.equal(state(), 'ligado');
  assert.ok(health.relayAllowed());
  assert.ok(lines.some((line) => /voltou ao ritmo .*: o retransmissor recebe gente nova de novo/.test(line)));

  // O mês virou: começa do zero.
  clock = Date.UTC(2026, 10, 1, 1);
  last = await step(57e9);
  assert.deepEqual([last.monthGB, last.relay], [0.5, 'on']);
});

test('without the month file the count starts from the network card, not from zero', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-rede-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dev = path.join(dir, 'dev'), uptimeFile = path.join(dir, 'uptime');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const start = (options) => createHealth({ connections: () => 0, online: () => 0, log() {}, every: 40, udpTable: path.join(dir, 'udp'), netDev: dev, now: () => Date.UTC(2026, 9, 11), ...options });
  // Máquina ligada há 40 dias, 10 deles neste mês: a placa marca 400 GB, e o mês fica com a parte dele.
  fs.writeFileSync(uptimeFile, String(40 * 86400));
  fs.writeFileSync(dev, netDev(400e9));
  const broken = path.join(dir, 'rede-do-mes.json');
  fs.writeFileSync(broken, '{estragado');
  const estimated = start({ uptimeFile, monthFile: broken });
  // Sem saber quando a máquina ligou: conta tudo.
  const blind = start({ uptimeFile: path.join(dir, 'nao-existe') });
  await wait(100);
  assert.equal(estimated.view().history.at(-1).monthGB, 100);
  assert.equal(blind.view().history.at(-1).monthGB, 400);
});

test('a relay state that could not be written is written again on the next reading', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-estado-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dev = path.join(dir, 'dev'), relayDir = path.join(dir, 'estado'), relayFile = path.join(relayDir, 'retransmissor.estado');
  const lines = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  fs.writeFileSync(dev, netDev(1e9));
  createHealth({ connections: () => 0, online: () => 0, log: (line) => lines.push(line), every: 40, udpTable: path.join(dir, 'udp'), netDev: dev, uptimeFile: path.join(dir, 'uptime'), relayFile });
  await wait(200); // várias leituras sem a pasta
  assert.equal(lines.filter((line) => /não deu para gravar/.test(line)).length, 1, 'o aviso sai uma vez só');
  fs.mkdirSync(relayDir);
  await wait(150);
  assert.equal(fs.readFileSync(relayFile, 'utf8'), 'ligado\n');
});
