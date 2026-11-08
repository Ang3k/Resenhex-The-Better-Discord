// Laboratório da transmissão do celular (docs/planos/PLANO-FPS-TELA-DO-CELULAR-2026-11-08.md).
// O dono do Resenhex liga pelo painel (Configurações → Laboratório). Enquanto ligado (até 2 h), quem está na
// mesma call que ele manda, a cada segundo, só números da transmissão: quadros por segundo, taxa, atrasos,
// codificador. Nunca imagem, som ou texto. As amostras vão para <dir>/tela-AAAA-MM-DD.jsonl, uma por linha,
// e o tools/lab-tela.js resume cada teste.
const fs = require('node:fs');
const path = require('node:path');

const MAX_ON_MS = 2 * 60 * 60 * 1000;
const MAX_SAMPLE_CHARS = 12_000;
const MAX_DAY_BYTES = 64 * 1024 * 1024;
const MIN_GAP_MS = 700; // uma amostra por segundo por conexão (com folga para o relógio do celular)

// Nome do teste (escolhido no painel antes de transmitir) e as variações que a página de quem transmite usa.
const CHOICES = {
  mode: ['', 'tela', 'app'],
  content: ['', 'mexendo', 'video', 'jogo', 'parado'],
  codec: ['auto', 'h264', 'vp8'],
  capture: ['auto', 'vp8', 'h264', 'jpeg'],
};

function createLab({ dir, now = Date.now, log = console } = {}) {
  let state = { on: false, until: 0, mode: '', content: '', lagRule: true, codec: 'auto', capture: 'auto', run: 0 };
  let version = 0;
  const lastAt = new Map(); // conexão -> instante da última amostra aceita
  let file = { day: '', stream: null, bytes: 0 };
  let written = 0;

  const active = () => state.on && now() < state.until;

  function view() {
    return { ...state, on: active(), written };
  }

  // O que vai para as páginas da call: só o que elas precisam para medir e aplicar as variações.
  function client() {
    return active() ? { on: true, run: state.run, lagRule: state.lagRule, codec: state.codec, capture: state.capture } : { on: false };
  }

  function set(input = {}) {
    expire(); // venceu e o dono liga de novo: conta como mudança, para as páginas ficarem sabendo
    const next = { ...state };
    for (const key of ['mode', 'content', 'codec', 'capture']) {
      if (input[key] === undefined) continue;
      if (!CHOICES[key].includes(input[key])) throw new Error('Opção inválida no laboratório.');
      next[key] = input[key];
    }
    if (input.lagRule !== undefined) next.lagRule = input.lagRule !== false;
    if (input.on !== undefined) {
      next.on = !!input.on;
      next.until = next.on ? now() + MAX_ON_MS : 0;
    }
    const changed = ['on', 'mode', 'content', 'lagRule', 'codec', 'capture'].some((key) => next[key] !== state[key]);
    // Cada mudança com o laboratório ligado abre um teste novo: as amostras ficam separadas por "run".
    if (changed && next.on) next.run = state.run + 1;
    state = next;
    if (changed) version++;
    return view();
  }

  // Desliga sozinho depois de 2 h. Devolve true quando acabou de desligar (para avisar as páginas).
  function expire() {
    if (!state.on || now() < state.until) return false;
    state = { ...state, on: false, until: 0 };
    version++;
    return true;
  }

  function open(day) {
    if (file.day === day) return file.stream;
    file.stream?.end();
    fs.mkdirSync(dir, { recursive: true });
    const name = path.join(dir, `tela-${day}.jsonl`);
    let bytes = 0;
    try { bytes = fs.statSync(name).size; } catch {}
    const stream = fs.createWriteStream(name, { flags: 'a' });
    stream.on('error', (error) => log.warn?.('[lab] não foi possível gravar:', error.message));
    file = { day, stream, bytes };
    return stream;
  }

  // Grava uma amostra. meta vem do servidor (quem mandou, se é o dono); o resto é o que a página mediu.
  function write(sid, sample, meta = {}) {
    if (!active() || !sample || typeof sample !== 'object' || Array.isArray(sample)) return false;
    const at = now();
    if (at - (lastAt.get(sid) || 0) < MIN_GAP_MS) return false;
    let body;
    try { body = JSON.stringify(sample); } catch { return false; }
    if (body.length > MAX_SAMPLE_CHARS) return false;
    lastAt.set(sid, at);
    const time = new Date(at);
    const day = time.toISOString().slice(0, 10);
    const line = JSON.stringify({ at: time.toISOString(), run: state.run, mode: state.mode, content: state.content,
      lagRule: state.lagRule, codec: state.codec, capture: state.capture, sid: String(sid).slice(0, 6), ...meta, sample: JSON.parse(body) }) + '\n';
    const stream = open(day);
    if (file.bytes + line.length > MAX_DAY_BYTES) return false;
    file.bytes += Buffer.byteLength(line);
    stream.write(line);
    written++;
    return true;
  }

  function forget(sid) { lastAt.delete(sid); }
  function close() { file.stream?.end(); file = { day: '', stream: null, bytes: 0 }; }

  return { view, client, set, expire, write, forget, close, active, get version() { return version; } };
}

module.exports = { createLab, CHOICES, MAX_ON_MS };
