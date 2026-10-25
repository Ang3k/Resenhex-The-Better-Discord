// Medidor de saúde do servidor (Fase 0 do docs/plano-5000-online.md). A cada 10 s junta o atraso do event
// loop, processador, memória, conexões, mudanças e bytes enviados por segundo, o tempo gasto montando e
// entregando os avisos de cada mudança, o tempo que a gravação do
// banco deixa o servidor parado, as portas do retransmissor em uso, a rede do mês e o disco. Guarda os últimos 10
// minutos (painel do dono e simulador de carga) e escreve uma linha por minuto no log.
const fs = require('node:fs');
const v8 = require('node:v8');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const SAMPLE_MS = 10_000;
const KEEP = 60;
// Mesma faixa do deploy/instalar-vps.sh (min-port/max-port do coturn).
const TURN_PORTS = { min: 49152, max: 65535 };
// Metas de "sem travar" do plano: o painel pinta de alerta o que passar delas. heapPct: quanto do limite do
// JavaScript (--max-old-space-size no serviço, 6 GB) está em uso; perto de 100% o Node cai sem memória.
// monthGB: a Oracle dá 10 TB de saída por mês; a meta deixa 3 TB de folga. monthCutGB: o corte final (MONTH).
// diskPct: acima disso, hora de aumentar o disco (a Oracle dá até 200 GB de graça).
const TARGETS = { loopP99: 50, loopMax: 250, cpu: 50, rssMb: 6144, heapPct: 70, turnPorts: Math.round((TURN_PORTS.max - TURN_PORTS.min + 1) * 0.8), monthGB: 7000, monthCutGB: 9500, diskPct: 80 };
// Rede do mês gasta num ritmo: até cada momento, a fração do mês que já passou de 6,7 TB, mais 300 GB de folga
// (um dia cheio); no fim do mês, os 7 TB da meta. Acima do ritmo, o retransmissor (o que mais gasta) não recebe
// gente nova (server/turn.js). Como o ritmo guarda rede para os dias que faltam, o site sozinho, que gasta bem
// menos, não leva o mês além da meta mesmo que o corte venha cedo. As senhas já entregues valem até 30 h: se
// ainda assim a rede passar 1 TB do ritmo (abuso com elas), o coturn é parado até voltar ao ritmo
// (relayFile, deploy/instalar-vps.sh). Pior caso do retransmissor: ~8 TB.
// Corte final: o resto do site (anexos, instaladores, prévias) é contado mas não tem ritmo, e alguém baixando um
// anexo sem parar passaria dos 10 TB em menos de um dia. Com 9,5 TB no mês, seja do que for, o site inteiro sai
// do ar até o mês virar (o systemd para o Caddy e o coturn): os 10 TB grátis nunca são passados.
const MONTH = { budgetGB: 6700, slackGB: 300, haltGB: 1000, cutGB: TARGETS.monthCutGB };

// Quanto o ritmo permite ter gastado até este momento do mês (UTC), em GB.
function monthPace(at, { budgetGB, slackGB } = MONTH) {
  const date = new Date(at);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return budgetGB * (at - start) / (end - start) + slackGB;
}

const round = (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;
// O monitorEventLoopDelay mede de 10 em 10 ms e cada leitura inclui esses 10 ms: o atraso é o que passa disso.
const RESOLUTION_MS = 10;
const delayMs = (ns) => Math.max(0, round(ns / 1e6 - RESOLUTION_MS, 1));

// Portas UDP abertas na faixa do retransmissor, lidas do /proc (legível por qualquer usuário no Linux).
function countRelayPorts(text) {
  let used = 0;
  for (const line of text.split('\n').slice(1)) {
    const local = line.trim().split(/\s+/)[1];
    const port = local ? parseInt(local.split(':')[1], 16) : NaN;
    if (port >= TURN_PORTS.min && port <= TURN_PORTS.max) used++;
  }
  return used;
}

// Bytes que a máquina já mandou pela rede, somando as placas menos a interna (lo). Colunas do /proc/net/dev:
// depois de "placa:", 8 de recebimento e então os bytes enviados.
function sentBytes(text) {
  let total = 0;
  for (const line of text.split('\n').slice(2)) {
    const [name, rest] = line.split(':');
    if (!rest || name.trim() === 'lo') continue;
    total += Number(rest.trim().split(/\s+/)[8]) || 0;
  }
  return total;
}

// monthFile: onde fica o total do mês (o contador da placa zera quando a máquina reinicia). relayFile: onde o
// systemd lê se o coturn fica ligado ("ligado" ou "parado"). diskPath: uma pasta do disco dos dados.
function createHealth({ connections, online, log = console.log, every = SAMPLE_MS, udpTable = '/proc/net/udp', netDev = '/proc/net/dev', uptimeFile = '/proc/uptime', monthFile = null, relayFile = null, network = MONTH, now = Date.now, diskPath = null }) {
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  const loop = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  loop.enable();
  let cpu = process.cpuUsage();
  let since = performance.now();
  let counts = { changes: 0, states: 0, patches: 0, bytes: 0, sendMs: 0 };
  let saves = [];
  let turnPorts = null;
  let month = null; // { key: 'AAAA-MM' (UTC), bytes: enviados no mês, counter: última leitura da placa }
  let paceGB = null;
  let relay = null; // 'on', 'paused' (sem gente nova) ou 'stopped' (coturn parado); null sem medição
  let cut = null; // corte final: o site inteiro fora do ar; null sem medição
  let relayWritten = null; // o que está gravado no relayFile ('fora', 'parado', 'ligado' ou 'falhou'); null antes de gravar
  let relayWriting = false;
  let disk = null; // { pct, freeGB }
  const history = [];

  const readRelayPorts = () => fs.readFile(udpTable, 'utf8', (error, text) => { turnPorts = error ? null : countRelayPorts(text); });
  const readNetwork = () => fs.readFile(netDev, 'utf8', (error, text) => { if (!error) countMonth(sentBytes(text)); });
  // bavail: o que sobra para quem não é administrador (o site), menos que o bfree.
  const readDisk = () => diskPath && fs.statfs(diskPath, (error, s) => {
    disk = error || !s.blocks ? null : { pct: round((1 - s.bavail / s.blocks) * 100, 1), freeGB: round(s.bavail * s.bsize / 1e9, 1) };
  });
  const relayAllowed = () => relay === null || relay === 'on';
  // Sem o arquivo do mês (primeira vez, ou estragado), começar do zero deixaria o mês passar do teto. O contador da
  // placa conta desde que a máquina ligou: ligada neste mês, tudo é do mês; ligada antes, a parte do mês é estimada
  // pela fração do tempo ligado que caiu nele. Sem saber quando ligou, conta tudo (sobrar só segura o retransmissor).
  function startMonth(key, sent, at) {
    let uptimeMs = NaN;
    try { uptimeMs = parseFloat(fs.readFileSync(uptimeFile, 'utf8')) * 1000; } catch { /* sem /proc/uptime */ }
    const date = new Date(at);
    const sinceStart = at - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    const share = uptimeMs > 0 ? Math.min(1, sinceStart / uptimeMs) : 1;
    return { key, bytes: Math.round(sent * share), counter: sent };
  }
  // Soma o que a placa mandou desde a última leitura. Na primeira, retoma o arquivo: o que a máquina mandou
  // com o servidor desligado (publicação, queda) também entra. Contador menor que o anterior: a máquina
  // reiniciou, e tudo o que ele marca é novo.
  function countMonth(sent) {
    const at = now();
    const key = new Date(at).toISOString().slice(0, 7);
    if (!month) {
      let saved = null;
      try { saved = monthFile && JSON.parse(fs.readFileSync(monthFile, 'utf8')); } catch { saved = null; }
      month = saved?.key === key && Number.isFinite(saved.bytes) && Number.isFinite(saved.counter) ? saved : startMonth(key, sent, at);
    }
    const delta = sent >= month.counter ? sent - month.counter : sent;
    month = { key, bytes: (month.key === key ? month.bytes : 0) + delta, counter: sent };
    paceGB = monthPace(at, network);
    const usedGB = month.bytes / 1e9;
    // Parado só volta quando a rede alcança o ritmo de novo: as senhas de antes do corte já terão vencido.
    const next = usedGB > paceGB + network.haltGB || (relay === 'stopped' && usedGB > paceGB) ? 'stopped' : usedGB > paceGB ? 'paused' : 'on';
    const before = relay;
    relay = next;
    const gb = (value) => `${Math.round(value)} GB`;
    if (before !== null && next !== before) {
      log(next === 'stopped' ? `[saúde] a rede do mês (${gb(usedGB)}) passou ${network.haltGB / 1000} TB do ritmo (${gb(paceGB)}): o retransmissor fica parado até voltar a ele`
        : next === 'paused' ? `[saúde] a rede do mês (${gb(usedGB)}) passou do ritmo (${gb(paceGB)}): o retransmissor não recebe gente nova até voltar a ele`
        : `[saúde] a rede do mês voltou ao ritmo (${gb(usedGB)} de ${gb(paceGB)}): o retransmissor recebe gente nova de novo`);
    }
    const nextCut = usedGB >= network.cutGB;
    // Na primeira leitura também, se já estiver no corte (servidor religado no meio dele).
    if (nextCut !== cut && (cut !== null || nextCut)) {
      log(nextCut ? `[saúde] a rede do mês (${gb(usedGB)}) chegou ao corte final (${network.cutGB / 1000} TB): o site inteiro fica fora do ar até o mês virar`
        : `[saúde] a rede do mês (${gb(usedGB)}) está abaixo do corte final: o site volta ao ar`);
    }
    cut = nextCut;
    // Grava sempre que o arquivo difere do estado, na primeira leitura também (o coturn ou o Caddy podem ter sido
    // religados por uma publicação ou um reinício). Uma gravação que falha tenta de novo na leitura seguinte.
    // "fora": o systemd para o Caddy e o coturn; "parado": só o coturn.
    const want = cut ? 'fora' : next === 'stopped' ? 'parado' : 'ligado';
    if (relayFile && relayWritten !== want && !relayWriting) {
      relayWriting = true;
      fs.writeFile(relayFile, want + '\n', (error) => {
        relayWriting = false;
        if (!error) relayWritten = want;
        else if (relayWritten !== 'falhou') { relayWritten = 'falhou'; log(`[saúde] não deu para gravar ${relayFile}: ${error.message} (tenta de novo a cada leitura)`); }
      });
    }
  }
  function saveMonth() {
    if (!monthFile || !month) return;
    const temporary = monthFile + '.tmp';
    fs.writeFile(temporary, JSON.stringify(month), (error) => { if (!error) fs.rename(temporary, monthFile, () => {}); });
  }

  function sample() {
    const now = performance.now();
    const seconds = (now - since) / 1000;
    const usage = process.cpuUsage(cpu);
    const memory = process.memoryUsage();
    history.push({
      at: Date.now(),
      loopP50: delayMs(loop.percentile(50)), loopP99: delayMs(loop.percentile(99)), loopMax: delayMs(loop.max),
      cpu: round((usage.user + usage.system) / 10_000 / seconds, 1), // % de um núcleo
      rssMb: Math.round(memory.rss / 1048576), heapMb: Math.round(memory.heapUsed / 1048576), heapPct: round(memory.heapUsed / heapLimit * 100, 1),
      connections: connections(), online: online(),
      changes: round(counts.changes / seconds, 1), states: round(counts.states / seconds, 1), patches: round(counts.patches / seconds, 1), sentKBps: round(counts.bytes / 1024 / seconds, 1),
      // Processador gasto montando e entregando estados e avisos, por mudança (a meta da Fase 3 é < 1 ms).
      sendMsPerChange: counts.changes ? round(counts.sendMs / counts.changes, 2) : null,
      saves: saves.length, saveMaxMs: saves.length ? round(Math.max(...saves), 1) : null,
      turnPorts,
      monthGB: month ? round(month.bytes / 1e9, 1) : null, monthPaceGB: paceGB === null ? null : round(paceGB, 1), relay, cut,
      diskPct: disk?.pct ?? null, diskFreeGB: disk?.freeGB ?? null,
    });
    if (history.length > KEEP) history.shift();
    loop.reset();
    cpu = process.cpuUsage();
    since = now;
    counts = { changes: 0, states: 0, patches: 0, bytes: 0, sendMs: 0 };
    saves = [];
    readRelayPorts();
    readNetwork();
    readDisk();
    if (history.length % 6 === 0) { log(summary(history.slice(-6))); saveMonth(); }
  }

  // Uma linha por minuto: o pior atraso, a média de processador e de tráfego, o último valor do resto.
  function summary(points) {
    const last = points.at(-1);
    const avg = (key) => round(points.reduce((sum, p) => sum + p[key], 0) / points.length, 1);
    const max = (key) => Math.max(...points.map((p) => p[key] ?? 0));
    return `[saúde] atraso p99 ${max('loopP99')} ms (máx ${max('loopMax')}) · processador ${avg('cpu')}% · memória ${last.rssMb} MB (${last.heapPct}% do limite)`
      + ` · ${last.connections} conexões, ${last.online} online · ${avg('changes')} mudanças/s · ${avg('sentKBps')} KB/s`
      + ` · gravação ${max('saveMaxMs')} ms · rede do mês ${last.monthGB ?? '?'} GB (ritmo ${last.monthPaceGB ?? '?'}) · disco ${last.diskPct ?? '?'}%`
      + ` · portas do retransmissor ${last.turnPorts ?? '?'}`;
  }

  readRelayPorts();
  readNetwork();
  readDisk();
  setInterval(sample, every).unref();
  return {
    count: (key, amount = 1) => { counts[key] += amount; },
    saved: (ms) => { saves.push(ms); },
    relayAllowed,
    view: () => ({ every, targets: TARGETS, turnRange: TURN_PORTS, history }),
  };
}

module.exports = { createHealth, countRelayPorts, sentBytes, monthPace, TARGETS, MONTH };
