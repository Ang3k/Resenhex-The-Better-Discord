// Caminhos e dependências do laboratório de transmissão (tools/stream-lab/README.md).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
// Clipes (~1 GB cada), resultados e o LiveKit ficam fora do repositório.
const DATA = process.env.STREAM_LAB_DIR || path.join(os.homedir(), '.cache', 'resenhex-stream-lab');
const CLIPS = path.join(DATA, 'clips');

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require(require.resolve('electron', { paths: [path.join(ROOT, 'desktop')] })); }
  catch { throw new Error('Electron não encontrado: rode "npm install" em desktop/ ou defina ELECTRON_PATH.'); }
}

function clipFile(name) {
  const file = path.join(CLIPS, name + '.y4m');
  if (!fs.existsSync(file)) throw new Error(`Clipe ${name} não encontrado. Gere com: node tools/stream-lab/clips.cjs ${name}`);
  return file;
}

module.exports = { ROOT, DATA, CLIPS, electronPath, clipFile };
