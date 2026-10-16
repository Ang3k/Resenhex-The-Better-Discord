// Compila o ajuste da captura de tela do Windows (native/captura, explicado em captura.cc) para o
// Electron do app. Roda antes do npm start e do npm run dist, como o tools/patch-uiohook.js.
//   node tools/captura-nativa.js --build   compila, se o binário não existir ou for mais velho que o código
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(__dirname, '..', 'native', 'captura');
const BINARY = path.join(DIR, 'build', 'Release', 'captura.node');
const SOURCES = ['captura.cc', 'binding.gyp'].map((file) => path.join(DIR, file));

function stale(binary = BINARY, sources = SOURCES) {
  if (!fs.existsSync(binary)) return true;
  const built = fs.statSync(binary).mtimeMs;
  return sources.some((file) => fs.statSync(file).mtimeMs > built);
}

function run({ build }) {
  if (!build || process.platform !== 'win32' || !stale()) return;
  // Os mesmos cabeçalhos que o electron-rebuild baixa para o uiohook.
  const electron = require('electron/package.json').version;
  const gyp = path.join(__dirname, '..', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
  execFileSync(process.execPath, [gyp, 'rebuild', `--directory=${DIR}`, `--target=${electron}`, '--arch=x64',
    '--dist-url=https://electronjs.org/headers', `--devdir=${path.join(os.homedir(), '.electron-gyp')}`], { stdio: 'inherit' });
  if (!fs.existsSync(BINARY)) throw new Error('O ajuste da captura não foi compilado: a transmissão ficaria presa em 48 fps nos monitores de 144 Hz.');
}

if (require.main === module) run({ build: process.argv.includes('--build') });

module.exports = { stale, BINARY };
