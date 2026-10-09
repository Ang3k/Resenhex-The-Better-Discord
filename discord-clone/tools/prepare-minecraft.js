// Pinned web distribution linked by https://eaglercraft.com/news/eaglercraftx-u53.
// Large third-party files stay out of Git and are verified before extraction.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const url = 'https://cdn.eaglercraft.ru/dl/1.8.8/web/u53_web.zip';
const sha256 = '843095ac68cb01068e87df16b3960720c253747ae985ed7233525c279722c801';
const destination = path.resolve(__dirname, '../public/games/minecraft/assets');
const required = ['web_wasm/bootstrap.js', 'web_wasm/assets.epw', 'web_js/classes.js', 'web_js/assets.epk', 'web_js/lang/pt_BR.lang'];

async function prepare() {
  const manifest = path.join(destination, 'distribution.json');
  try {
    if (JSON.parse(await fs.readFile(manifest, 'utf8')).sha256 === sha256) {
      await Promise.all(required.map(file => fs.access(path.join(destination, file))));
      console.log('Eaglercraft 1.8.8 u53 já preparado.'); return;
    }
  } catch {}
  const archiveFlag = process.argv.indexOf('--archive');
  let archive;
  if (archiveFlag !== -1) {
    if (!process.argv[archiveFlag + 1]) throw new Error('Informe o ZIP depois de --archive.');
    archive = await fs.readFile(path.resolve(process.argv[archiveFlag + 1]));
  } else {
    console.log('Baixando a distribuição web Eaglercraft 1.8.8 u53…');
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error('Download falhou: HTTP ' + response.status);
    archive = Buffer.from(await response.arrayBuffer());
  }
  if (crypto.createHash('sha256').update(archive).digest('hex') !== sha256) throw new Error('O ZIP não corresponde à distribuição verificada.');
  // Read the ZIP central directory, then inflate only the game files (no executables).
  let end = archive.length - 22;
  const floor = Math.max(0, archive.length - 65557);
  while (end >= floor && archive.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < floor) throw new Error('ZIP inválido.');
  const entries = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  const extracted = new Set();
  for (let i = 0; i < entries; i++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('Diretório ZIP inválido.');
    const compression = archive.readUInt16LE(offset + 10);
    const size = archive.readUInt32LE(offset + 20);
    const rawSize = archive.readUInt32LE(offset + 24);
    const nameSize = archive.readUInt16LE(offset + 28);
    const extraSize = archive.readUInt16LE(offset + 30);
    const commentSize = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    offset += 46 + nameSize + extraSize + commentSize;
    if (!/^(web_js\/(classes\.js|assets\.epk|favicon\.png|lang\/[A-Za-z_]+\.lang)|web_wasm\/(bootstrap\.js|assets\.epw|favicon\.png))$/.test(name)) continue;
    if (rawSize > 32 * 1024 * 1024 || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Entrada ZIP inválida: ' + name);
    const start = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const compressed = archive.subarray(start, start + size);
    const content = compression === 0 ? compressed : compression === 8 ? zlib.inflateRawSync(compressed, { maxOutputLength: 32 * 1024 * 1024 }) : null;
    if (!content || content.length !== rawSize) throw new Error('Não foi possível extrair: ' + name);
    const target = path.resolve(destination, name);
    if (!target.startsWith(destination + path.sep)) throw new Error('Caminho ZIP inválido.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
    extracted.add(name);
  }
  if (!required.every(file => extracted.has(file))) throw new Error('A distribuição não contém todos os arquivos necessários.');
  await fs.writeFile(manifest, JSON.stringify({ version: '1.8.8-u53', source: url, sha256 }, null, 2) + '\n');
  console.log('Eaglercraft 1.8.8 u53 preparado (' + extracted.size + ' arquivos).');
}
prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
