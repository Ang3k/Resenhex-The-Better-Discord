// Fila de imagens para o worker (server/image-worker.js): a linha principal só manda os bytes e recebe a
// imagem pronta, com o nome do arquivo (sha256). Um worker só, que sobe no primeiro pedido; se ele morrer ou
// travar numa imagem, os pedidos em andamento falham e o próximo pedido sobe outro.
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const TIMEOUT_MS = 15_000;
const FAILED = 'Não foi possível processar a imagem. Tente de novo.';

function createImages({ log = console.error } = {}) {
  let worker = null;
  let nextId = 0;
  const waiting = new Map(); // id -> { resolve, reject, timer }

  function settle(id, fn) {
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    clearTimeout(job.timer);
    fn(job);
    if (!waiting.size) worker?.unref(); // sem pedidos, o worker não segura o processo aberto
  }
  function stop(reason) { // reason null: desligando, sem aviso no log
    const current = worker;
    worker = null;
    for (const id of [...waiting.keys()]) settle(id, (job) => job.reject(new Error(FAILED)));
    if (current) {
      if (reason) log(`[imagens] worker parou (${reason}); o próximo pedido sobe outro`);
      current.terminate().catch(() => {});
    }
  }
  function start() {
    const current = new Worker(path.join(__dirname, 'image-worker.js'));
    current.on('message', ({ id, error, ext, data, hash }) => settle(id, (job) => {
      if (error) job.reject(new Error(error));
      else job.resolve({ ext, data: Buffer.from(data.buffer, data.byteOffset, data.byteLength), hash });
    }));
    current.on('error', (error) => { if (worker === current) stop(error.message); });
    current.on('exit', (code) => { if (worker === current) stop('saiu com ' + code); });
    return current;
  }

  // kind: 'avatar' (data URL de PNG), 'photo' (PNG ou GIF), 'banner' ou 'background'. Devolve { ext, data, hash }.
  function decode(kind, input) {
    worker ||= start();
    worker.ref();
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => stop('imagem levou mais de ' + TIMEOUT_MS / 1000 + ' s'), TIMEOUT_MS);
      waiting.set(id, { resolve, reject, timer });
      worker.postMessage({ id, kind, input });
    });
  }

  return { decode, close: () => stop(null) };
}

module.exports = { createImages };
