const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const python = process.env.RESENHEX_BUILD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
(async () => {
const sevenzip = await require('app-builder-lib/out/toolsets/7zip').getPath7za();
const result = spawnSync(python, [path.join(__dirname, 'prepare-voice-runtime.py')], { stdio: 'inherit', windowsHide: true, env: { ...process.env, RESENHEX_BUILD_7ZIP: sevenzip } });
if (result.error) { console.error('O computador que gera o instalador precisa de Python 3.11+ para preparar o runtime. Defina RESENHEX_BUILD_PYTHON se necessário.'); process.exit(1); }
if (result.status !== 0) process.exit(result.status || 1);
if (!fs.existsSync(path.join(__dirname, '../voice-engine/runtime/python.exe'))) process.exit(1);
})().catch((error) => { console.error(error.message); process.exit(1); });
