// Roda numa worker_thread (server/store.js): passa o que está no arquivo -wal para o banco, a cada `intervalMs`,
// com uma conexão própria. Assim a linha principal só acrescenta no -wal e nunca espera o disco.
// PASSIVE: copia o que dá sem esperar ninguém; quem grava ou lê nunca fica esperando por ele.
const { workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');

const state = new Int32Array(workerData.shared); // [0]: 1 = parar; [1]: 1 = já fechou o banco
const db = new DatabaseSync(workerData.file);
const checkpoint = db.prepare('PRAGMA wal_checkpoint(PASSIVE)');
while (Atomics.load(state, 0) === 0) {
  checkpoint.get();
  Atomics.wait(state, 0, 0, workerData.intervalMs);
}
db.close();
Atomics.store(state, 1, 1);
Atomics.notify(state, 1);
