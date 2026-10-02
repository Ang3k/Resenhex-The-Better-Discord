// Soma só os módulos efetivamente observados pela bancada, não o pacote npm inteiro.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const threeDir = path.join(path.dirname(require.resolve('three')), '..');
const entries = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rows = entries.map((entry) => {
  const url = entry.url.replace('/benchmark-assets', '');
  const file = url.startsWith('/vendor/three/') ? path.join(threeDir, url.slice('/vendor/three/'.length).replace(/^addons\//, 'examples/jsm/')) : path.join(root, 'public', url);
  const bytes = fs.readFileSync(file);
  return { url, rawBytes: bytes.length, gzipBytes: zlib.gzipSync(bytes, { level: 6 }).length, observedBodyBytes: entry.encodedBodySize, observedTransferBytes: entry.transferSize };
});
const sum = (list) => list.reduce((total, row) => ({ rawBytes: total.rawBytes + row.rawBytes, gzipBytes: total.gzipBytes + row.gzipBytes }), { rawBytes: 0, gzipBytes: 0 });
const shaderAdded = rows.filter((row) => /\/gacha\/efeitos\.mjs$|\/GTAOPass\.js$|\/GTAOShader\.js$|\/PoissonDenoiseShader\.js$|\/SimplexNoise\.js$/.test(row.url));
const report = { total: sum(rows), core: sum(rows.filter((row) => row.url.includes('/build/'))), addons: sum(rows.filter((row) => row.url.includes('/addons/'))), scene: sum(rows.filter((row) => row.url.includes('/gacha/'))), shaderAdded: sum(shaderAdded), rows, method: 'Gzip nível 6 aplicado separadamente a cada arquivo; estimativa de transferência com compressão. O instalador do VPS configura encode gzip. O servidor localhost entrega sem Content-Encoding.' };
console.log(JSON.stringify(report, null, 2));
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
