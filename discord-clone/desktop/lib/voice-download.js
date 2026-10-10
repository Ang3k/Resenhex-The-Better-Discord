const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable, Transform } = require('node:stream');

async function verifyFile(file, spec) {
  try {
    if ((await fs.promises.stat(file)).size !== spec.bytes) return false;
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === spec.sha256;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Only the application-owned catalog supplies URLs and paths. Partial files never become models.
async function downloadModel(spec, file, { fetch: request = fetch, signal, progress = () => {} } = {}) {
  if (!/^https:\/\//.test(spec.url) || !/^[a-f0-9]{64}$/.test(spec.sha256) || !Number.isSafeInteger(spec.bytes) || spec.bytes <= 0) throw new Error('Modelo sem integridade verificável.');
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  if (await verifyFile(file, spec)) { progress(spec.bytes, spec.bytes); return file; }
  const temporary = file + '.partial';
  try {
    const response = await request(spec.url, { signal, redirect: 'follow' });
    // O net.fetch do Electron devolve url vazia; nesse caso vale o endereço HTTPS do catálogo.
    const finalUrl = response.url || spec.url;
    if (!response.ok || !response.body || !finalUrl.startsWith('https://')) throw new Error(`Download indisponível (${response.status}).`);
    const hash = crypto.createHash('sha256');
    let received = 0;
    const check = new Transform({ transform(chunk, _encoding, done) {
      received += chunk.length;
      if (received > spec.bytes) return done(new Error('Download excedeu o tamanho esperado.'));
      hash.update(chunk); progress(received, spec.bytes); done(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), check, fs.createWriteStream(temporary, { flags: 'w' }), { signal });
    if (received !== spec.bytes || hash.digest('hex') !== spec.sha256) throw new Error('A integridade do modelo não confere. Tente baixar novamente.');
    await fs.promises.rename(temporary, file);
    return file;
  } finally { await fs.promises.rm(temporary, { force: true }); }
}

module.exports = { downloadModel, verifyFile };
