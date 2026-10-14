// Roda uma matriz de cenários: node tools/stream-lab/run.cjs tools/stream-lab/matrices/validacao.cjs [saida.jsonl] [filtro]
// cfg.net = { up: kbps de tudo o que quem transmite envia, down: [kbps de cada espectador], queueMs } (precisa de root: tc/HTB)
// cfg.netEvents = [{ at: segundos depois do início, up?, down? }]
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const server = require('./server.cjs');
const { DATA, clipFile, electronPath } = require('./paths.cjs');

const PORT_BASE = 40000, BLOCK = 64;
const LIVEKIT = path.join(DATA, 'livekit');
const tc = (...args) => { try { execFileSync('tc', args, { stdio: 'pipe' }); } catch (e) { if (args[0] !== 'qdisc' || args[1] !== 'del') console.log('tc:', args.join(' '), String(e.stderr || e).trim()); } };

function classRate(id, kbps, queueMs = 100) {
  const bytes = Math.max(6000, Math.round(kbps * 1000 / 8 * queueMs / 1000));
  tc('class', 'replace', 'dev', 'lo', 'parent', '1:', 'classid', `1:${id}`, 'htb', 'rate', `${kbps}kbit`, 'ceil', `${kbps}kbit`, 'burst', '4k', 'cburst', '4k', 'quantum', '1514');
  tc('qdisc', 'replace', 'dev', 'lo', 'parent', `1:${id}`, 'handle', `${id}:`, 'bfifo', 'limit', String(bytes));
}
// Só o UDP do WebRTC de cada janela passa pelos limites; o resto do loopback segue livre.
function shape(net, viewers) {
  tc('qdisc', 'del', 'dev', 'lo', 'root');
  if (!net) return;
  if (process.getuid?.() !== 0) throw new Error('Limitar a banda (cfg.net) precisa de root, por causa do tc.');
  tc('qdisc', 'add', 'dev', 'lo', 'root', 'handle', '1:', 'htb', 'default', '10', 'r2q', '100000');
  tc('class', 'add', 'dev', 'lo', 'parent', '1:', 'classid', '1:10', 'htb', 'rate', '20gbit', 'quantum', '60000');
  if (net.up) {
    classRate(20, net.up, net.queueMs);
    tc('filter', 'add', 'dev', 'lo', 'protocol', 'ip', 'parent', '1:', 'prio', '1', 'u32', 'match', 'ip', 'protocol', '17', '0xff', 'match', 'ip', 'sport', String(PORT_BASE), '0xffc0', 'flowid', '1:20');
  }
  for (let i = 0; i < viewers; i++) {
    if (!net.down?.[i]) continue;
    classRate(30 + i, net.down[i], net.queueMs);
    tc('filter', 'add', 'dev', 'lo', 'protocol', 'ip', 'parent', '1:', 'prio', '2', 'u32', 'match', 'ip', 'protocol', '17', '0xff', 'match', 'ip', 'dport', String(PORT_BASE + (i + 1) * BLOCK), '0xffc0', 'flowid', `1:${30 + i}`);
  }
}

let livekit = null;
// Um LiveKit novo a cada cenário: as janelas reutilizam as mesmas portas UDP, e o LiveKit mandaria
// os pacotes para a sessão do cenário anterior, ainda aberta.
async function freshLivekit() {
  if (livekit) { livekit.kill('SIGKILL'); livekit = null; await new Promise((r) => setTimeout(r, 1000)); }
  const binary = path.join(LIVEKIT, 'livekit-server');
  if (!fs.existsSync(binary)) execFileSync('bash', [path.join(__dirname, 'livekit.sh'), LIVEKIT], { stdio: 'inherit' });
  const config = path.join(LIVEKIT, 'lab.yaml');
  fs.writeFileSync(config, 'port: 7880\nbind_addresses: [127.0.0.1]\nrtc:\n  tcp_port: 7881\n  udp_port: 7882\n  node_ip: 127.0.0.1\n  use_external_ip: false\n  enable_loopback_candidate: true\nkeys:\n  lab-key: lab-secret-only-for-local-tests-1234567890\nlogging:\n  level: warn\n');
  const log = fs.openSync(path.join(LIVEKIT, 'livekit.log'), 'a');
  livekit = spawn(binary, ['--config', config], { stdio: ['ignore', log, log] });
  for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:7880/')).status) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
}

async function runOne(cfg, port) {
  cfg = { warmup: 8, duration: 20, sampleMod: 15, sampleRem: 7, viewers: 1, fps: 30, mode: 'p2p', ...cfg };
  cfg.clipFile = clipFile(cfg.clip);
  cfg.url = `http://127.0.0.1:${port}/`;
  cfg.room = 'lab-' + Date.now();
  execFileSync('cat', [cfg.clipFile], { stdio: ['ignore', 'ignore', 'ignore'] }); // clipe no cache de disco antes de medir
  if (cfg.mode === 'sfu') await freshLivekit();
  shape(cfg.net, cfg.viewers);
  server.setConfig(cfg);
  const timers = [];
  server.onGo(() => { for (const ev of cfg.netEvents || []) timers.push(setTimeout(() => { if (ev.up) classRate(20, ev.up, cfg.net?.queueMs); ev.down?.forEach((kbps, i) => kbps && classRate(30 + i, kbps, cfg.net?.queueMs)); }, ev.at * 1000)); });
  const waiting = server.waitParts(1 + cfg.viewers, (cfg.warmup + cfg.duration + 90) * 1000);
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1920x1080x24', electronPath(), '--no-sandbox', path.join(__dirname, 'run-main.cjs')],
    { env: { ...process.env, LAB_CONFIG: JSON.stringify(cfg) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  let result;
  try {
    const parts = await waiting;
    result = { name: cfg.name, cfg, streamer: parts['streamer-1'], viewers: Object.keys(parts).filter((k) => k.startsWith('viewer')).sort().map((k) => parts[k]) };
  } catch (error) { result = { name: cfg.name, cfg, error: String(error), partial: error.partial, log: output.slice(-1500) }; }
  timers.forEach(clearTimeout);
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  await new Promise((r) => setTimeout(r, 1500));
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  shape(null);
  return result;
}

(async () => {
  const matrixFile = path.resolve(process.argv[2] || path.join(__dirname, 'matrices/validacao.cjs'));
  const outFile = process.argv[3] || path.join(DATA, 'results', `${path.basename(matrixFile, '.cjs')}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const only = process.argv[4] ? new RegExp(process.argv[4]) : null;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const port = await server.start(Number(process.env.LAB_PORT) || 37951);
  console.log('Resultados em', outFile);
  try {
    for (const cfg of require(matrixFile).filter((c) => !only || only.test(c.name))) {
      let result = await runOne(cfg, port);
      if (result.error) { console.log(cfg.name, 'repetindo depois de', result.error); await new Promise((r) => setTimeout(r, 5000)); result = await runOne(cfg, port); }
      await new Promise((r) => setTimeout(r, 3000));
      fs.appendFileSync(outFile, JSON.stringify(result) + '\n');
      const v = result.viewers?.map((x) => `${x.psnr?.toFixed(1)} dB/${x.deliveredFps?.toFixed(0)} fps/${x.kbps?.toFixed(0)} kbps`).join(' | ');
      console.log(cfg.name, result.error ? 'ERRO ' + result.error : `CPU ${JSON.stringify(result.streamer?.cpu)} → ${v}`);
    }
  } finally { shape(null); livekit?.kill('SIGKILL'); server.stop(); }
  process.exit(0);
})();
