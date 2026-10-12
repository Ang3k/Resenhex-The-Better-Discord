// Import artwork made with image_gen; export small WebP files with unchanged
// composition and alpha. Original PNGs are copied to an archive outside public/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { PNG } = require('pngjs');
const sourceFile = path.resolve(process.argv[2]);
const archive = path.resolve(process.argv[3]);
const encoder = process.env.CWEBP_BINARY || 'cwebp';
const app = path.resolve(__dirname, '../..');
const destination = path.join(app, 'public/assets/voice-effects');
const sources = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const version = execFileSync(encoder, ['-version'], { encoding: 'utf8', windowsHide: true }).trim();
fs.mkdirSync(destination, { recursive: true });
fs.mkdirSync(archive, { recursive: true });
const manifest = { generator: 'Built-in image_gen', date: '2026-10-12', export: { encoder: 'libwebp ' + version, width: 192, quality: 86, alphaQuality: 100 }, assets: [] };
for (const asset of sources) {
  assert.match(asset.id, /^[a-z]+$/);
  const original = path.resolve(asset.source);
  assert.equal(path.extname(original).toLowerCase(), '.png');
  const bytes = fs.readFileSync(original);
  const image = PNG.sync.read(bytes);
  let transparent = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] === 0) transparent++;
  assert.ok(transparent > image.width * image.height * .01, 'Missing transparent background: ' + asset.id);
  const archiveFile = path.join(archive, asset.id + '.png');
  if (fs.existsSync(archiveFile)) assert.equal(hash(fs.readFileSync(archiveFile)), hash(bytes), 'A different original already exists');
  else fs.copyFileSync(original, archiveFile);
  const output = path.join(destination, asset.id + '.webp');
  execFileSync(encoder, ['-quiet', '-q', '86', '-alpha_q', '100', '-m', '6', '-metadata', 'none', '-resize', '192', '0', original, '-o', output], { windowsHide: true });
  const result = fs.readFileSync(output);
  manifest.assets.push({ id: asset.id, file: asset.id + '.webp', bytes: result.length, sha256: hash(result), originalSha256: hash(bytes), sourceDimensions: [image.width, image.height], sourceTransparentPixels: transparent });
}
manifest.totalBytes = manifest.assets.reduce((total, a) => total + a.bytes, 0);
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ assets: manifest.assets.length, totalBytes: manifest.totalBytes, archive, encoder: version }));
