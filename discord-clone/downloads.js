// Downloads do app de desktop (Windows). O script deploy/publicar-app.ps1 coloca aqui o instalador
// e o latest.yml gerados pelo electron-builder; o app instalado consulta o latest.yml para se atualizar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const INSTALLER = /^[A-Za-z0-9._-]+\.exe$/;

// Lê o latest.yml (formato fixo do electron-builder) sem depender de uma biblioteca de YAML.
function readRelease(dir) {
  let text;
  try { text = fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8'); } catch { return null; }
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9]+):\s*'?([^']*?)'?\s*$/.exec(line); // só chaves do primeiro nível
    if (match && match[2]) fields[match[1]] = match[2];
  }
  const field = (name) => fields[name];
  const file = field('path');
  const version = field('version');
  if (!file || !version || !INSTALLER.test(file)) return null;
  let size;
  try { size = fs.statSync(path.join(dir, file)).size; } catch { return null; }
  return { version, file, size, releaseDate: field('releaseDate') || null };
}

// A atualização do app baixa só os trechos do instalador que mudaram, pedindo várias faixas
// de uma vez (Range: bytes=0-99,500-899). O express.static só atende uma faixa por pedido,
// então as respostas com várias faixas (multipart/byteranges) são montadas aqui.
function multipleRanges(dir) {
  return (req, res, next) => {
    const file = req.params.file;
    if (!INSTALLER.test(file) || !req.headers.range) return next();
    let size;
    try { size = fs.statSync(path.join(dir, file)).size; } catch { return next(); }
    // Uma parte por faixa pedida, na mesma ordem: o atualizador depende dessa correspondência.
    const ranges = req.range(size);
    if (!Array.isArray(ranges) || ranges.type !== 'bytes' || ranges.length < 2) return next();

    const boundary = crypto.randomBytes(16).toString('hex');
    const parts = ranges.map(({ start, end }) => ({
      start, end,
      head: Buffer.from(`--${boundary}\r\nContent-Type: application/vnd.microsoft.portable-executable\r\nContent-Range: bytes ${start}-${end}/${size}\r\n\r\n`),
    }));
    const tail = Buffer.from(`--${boundary}--\r\n`);
    const length = parts.reduce((sum, part) => sum + part.head.length + (part.end - part.start + 1) + 2, tail.length);
    res.status(206).set({
      'Content-Type': `multipart/byteranges; boundary=${boundary}`,
      'Content-Length': String(length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    let index = 0;
    let current = null;
    const sendNext = () => {
      if (res.destroyed) return;
      if (index === parts.length) return res.end(tail);
      const part = parts[index++];
      res.write(part.head);
      current = fs.createReadStream(path.join(dir, file), { start: part.start, end: part.end });
      current.on('error', () => res.destroy());
      current.on('end', () => { res.write('\r\n'); sendNext(); });
      current.pipe(res, { end: false });
    };
    res.on('close', () => current?.destroy());
    sendNext();
  };
}

function downloadRoutes(dir) {
  const router = express.Router();
  router.get('/download/info', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    const release = readRelease(dir);
    if (!release) return res.status(404).json({ available: false });
    res.json({ available: true, ...release, url: '/download/' + encodeURIComponent(release.file) });
  });
  // Link fixo para mandar aos amigos: sempre aponta para a versão mais nova.
  router.get('/download/Resenhex-Setup.exe', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const release = readRelease(dir);
    if (!release) return res.redirect(302, '/baixar');
    res.redirect(302, '/download/' + encodeURIComponent(release.file));
  });
  router.get('/download/:file', multipleRanges(dir));
  router.use('/download', express.static(dir, {
    index: false, redirect: false,
    setHeaders(res, file) {
      // O latest.yml muda a cada versão; instaladores têm a versão no nome e nunca mudam.
      if (file.endsWith('.yml')) res.set('Cache-Control', 'no-cache');
      else res.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (file.endsWith('.exe')) res.set('Content-Type', 'application/vnd.microsoft.portable-executable');
    },
  }));
  return router;
}

module.exports = { downloadRoutes, readRelease };
