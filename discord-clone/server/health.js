// Medidor de saúde do servidor (Fase 0 do docs/plano-5000-online.md). A cada 10 s junta o atraso do event
// loop, processador, memória, conexões, mudanças e bytes enviados por segundo, o tempo gasto montando e
// entregando os avisos de cada mudança, o tempo que a gravação do
// banco deixa o servidor parado e as portas do retransmissor em uso. Guarda os últimos 10 minutos (painel
// do dono e simulador de carga) e escreve uma linha por minuto no log.
const fs = require('node:fs');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const SAMPLE_MS = 10_000;
const KEEP = 60;
// Mesma faixa do deploy/instalar-vps.sh (min-port/max-port do coturn).
const TURN_PORTS = { min: 49152, max: 65535 };
// Metas de "sem travar" do plano: o painel pinta de alerta o que passar delas.
const TARGETS = { loopP99: 50, loopMax: 250, cpu: 50, rssMb: 6144, turnPorts: Math.round((TURN_PORTS.max - TURN_PORTS.min + 1) * 0.8) };

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

function createHealth({ connections, online, log = console.log, every = SAMPLE_MS, udpTable = '/proc/net/udp' }) {
  const loop = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  loop.enable();
  let cpu = process.cpuUsage();
  let since = performance.now();
  let counts = { changes: 0, states: 0, patches: 0, bytes: 0, sendMs: 0 };
  let saves = [];
  let turnPorts = null;
  const history = [];

  const readRelayPorts = () => fs.readFile(udpTable, 'utf8', (error, text) => { turnPorts = error ? null : countRelayPorts(text); });

  function sample() {
    const now = performance.now();
    const seconds = (now - since) / 1000;
    const usage = process.cpuUsage(cpu);
    const memory = process.memoryUsage();
    history.push({
      at: Date.now(),
      loopP50: delayMs(loop.percentile(50)), loopP99: delayMs(loop.percentile(99)), loopMax: delayMs(loop.max),
      cpu: round((usage.user + usage.system) / 10_000 / seconds, 1), // % de um núcleo
      rssMb: Math.round(memory.rss / 1048576), heapMb: Math.round(memory.heapUsed / 1048576),
      connections: connections(), online: online(),
      changes: round(counts.changes / seconds, 1), states: round(counts.states / seconds, 1), patches: round(counts.patches / seconds, 1), sentKBps: round(counts.bytes / 1024 / seconds, 1),
      // Processador gasto montando e entregando estados e avisos, por mudança (a meta da Fase 3 é < 1 ms).
      sendMsPerChange: counts.changes ? round(counts.sendMs / counts.changes, 2) : null,
      saves: saves.length, saveMaxMs: saves.length ? round(Math.max(...saves), 1) : null,
      turnPorts,
    });
    if (history.length > KEEP) history.shift();
    loop.reset();
    cpu = process.cpuUsage();
    since = now;
    counts = { changes: 0, states: 0, patches: 0, bytes: 0, sendMs: 0 };
    saves = [];
    readRelayPorts();
    if (history.length % 6 === 0) log(summary(history.slice(-6)));
  }

  // Uma linha por minuto: o pior atraso, a média de processador e de tráfego, o último valor do resto.
  function summary(points) {
    const last = points.at(-1);
    const avg = (key) => round(points.reduce((sum, p) => sum + p[key], 0) / points.length, 1);
    const max = (key) => Math.max(...points.map((p) => p[key] ?? 0));
    return `[saúde] atraso p99 ${max('loopP99')} ms (máx ${max('loopMax')}) · processador ${avg('cpu')}% · memória ${last.rssMb} MB`
      + ` · ${last.connections} conexões, ${last.online} online · ${avg('changes')} mudanças/s · ${avg('sentKBps')} KB/s`
      + ` · gravação ${max('saveMaxMs')} ms · portas do retransmissor ${last.turnPorts ?? '?'}`;
  }

  readRelayPorts();
  setInterval(sample, every).unref();
  return {
    count: (key, amount = 1) => { counts[key] += amount; },
    saved: (ms) => { saves.push(ms); },
    view: () => ({ every, targets: TARGETS, turnRange: TURN_PORTS, history }),
  };
}

module.exports = { createHealth, countRelayPorts, TARGETS };
