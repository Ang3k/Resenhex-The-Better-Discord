const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { downloadRoutes, readRelease } = require('../downloads');

const LATEST = `version: 1.2.0
files:
  - url: Resenhex-Setup-1.2.0.exe
    sha512: abc==
    size: 11
path: Resenhex-Setup-1.2.0.exe
sha512: abc==
releaseDate: '2026-09-30T12:00:00.000Z'
`;

async function serve(t, dir) {
  const app = express();
  app.use(downloadRoutes(dir));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return (url, init = {}) => fetch(base + url, { redirect: 'manual', ...init });
}

function releaseDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-downloads-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('sem versão publicada, o link fixo leva para a página de download', async (t) => {
  const get = await serve(t, releaseDir(t));
  assert.equal((await get('/download/info')).status, 404);
  const res = await get('/download/Resenhex-Setup.exe');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/baixar');
  assert.equal((await get('/download/latest.yml')).status, 404);
});

test('publica a versão mais nova, o latest.yml e o instalador', async (t) => {
  const dir = releaseDir(t);
  fs.writeFileSync(path.join(dir, 'latest.yml'), LATEST);
  fs.writeFileSync(path.join(dir, 'Resenhex-Setup-1.2.0.exe'), 'instalador!');
  assert.deepEqual(readRelease(dir), { version: '1.2.0', file: 'Resenhex-Setup-1.2.0.exe', size: 11, releaseDate: '2026-09-30T12:00:00.000Z' });
  const get = await serve(t, dir);

  const info = await (await get('/download/info')).json();
  assert.equal(info.version, '1.2.0');
  assert.equal(info.url, '/download/Resenhex-Setup-1.2.0.exe');

  const latest = await get('/download/Resenhex-Setup.exe');
  assert.equal(latest.status, 302);
  assert.equal(latest.headers.get('location'), '/download/Resenhex-Setup-1.2.0.exe');

  const yml = await get('/download/latest.yml');
  assert.equal(yml.headers.get('cache-control'), 'no-cache');
  assert.equal(await yml.text(), LATEST);

  const exe = await get('/download/Resenhex-Setup-1.2.0.exe');
  assert.equal(exe.status, 200);
  assert.match(exe.headers.get('cache-control'), /immutable/);
  assert.equal(await exe.text(), 'instalador!');
});

test('atende várias faixas de bytes, como a atualização diferencial do app pede', async (t) => {
  const dir = releaseDir(t);
  const content = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
  fs.writeFileSync(path.join(dir, 'Resenhex-Setup-1.2.0.exe'), content);
  const get = await serve(t, dir);
  const exe = '/download/Resenhex-Setup-1.2.0.exe';
  const multi = await get(exe, { headers: { Range: 'bytes=0-3,10-12,30-35' } });
  assert.equal(multi.status, 206);
  const type = multi.headers.get('content-type');
  const boundary = /^multipart\/byteranges; boundary=(\w+)$/.exec(type)?.[1];
  assert.ok(boundary, type);
  const body = Buffer.from(await multi.arrayBuffer());
  assert.equal(Number(multi.headers.get('content-length')), body.length);
  const text = body.toString('latin1');
  const pieces = text.split(`--${boundary}`).slice(1, -1).map((part) => {
    const [head, data] = part.split('\r\n\r\n');
    return { range: /Content-Range: bytes (\S+)/.exec(head)[1], data: data.slice(0, -2) };
  });
  assert.deepEqual(pieces, [
    { range: '0-3/36', data: '0123' },
    { range: '10-12/36', data: 'abc' },
    { range: '30-35/36', data: 'uvwxyz' },
  ]);
  assert.ok(text.endsWith(`--${boundary}--\r\n`));

  // Faixas vizinhas continuam separadas: o atualizador conta uma parte por faixa pedida.
  const adjacent = await get(exe, { headers: { Range: 'bytes=0-1,2-3' } });
  const adjacentText = Buffer.from(await adjacent.arrayBuffer()).toString('latin1');
  assert.equal((adjacentText.match(/Content-Range/g) || []).length, 2);

  const single = await get(exe, { headers: { Range: 'bytes=5-9' } });
  assert.equal(single.status, 206);
  assert.equal(await single.text(), '56789');
});

test('ignora latest.yml incompleto ou apontando para fora da pasta', async (t) => {
  const dir = releaseDir(t);
  fs.writeFileSync(path.join(dir, 'latest.yml'), LATEST.replace('Resenhex-Setup-1.2.0.exe\nsha512', '../server.js\nsha512'));
  assert.equal(readRelease(dir), null);
  fs.writeFileSync(path.join(dir, 'latest.yml'), LATEST);
  assert.equal(readRelease(dir), null, 'instalador ainda não enviado');
  const get = await serve(t, dir);
  assert.ok([403, 404].includes((await get('/download/..%2Fserver.js')).status));
});
