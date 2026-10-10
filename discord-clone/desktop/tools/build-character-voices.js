const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { verifyFile } = require('../lib/voice-download');
const catalog = require('../lib/voice-catalog.json');
(async () => {
  const voices = catalog.voices.filter((v) => v.bundled);
  if ((await Promise.all(voices.map((v) => verifyFile(path.join(__dirname, '../voice-engine/models', v.file), v)))).every(Boolean)) return;
  const python = process.env.RESENHEX_BUILD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python, [path.join(__dirname, 'build-character-voices.py')], { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) { console.error('Falha ao preparar as vozes. No computador de build, use Python com torch==2.6.0, onnx==1.19.1 e numpy==2.2.6; defina RESENHEX_BUILD_PYTHON.'); process.exit(1); }
})().catch((error) => { console.error(error.message); process.exit(1); });
