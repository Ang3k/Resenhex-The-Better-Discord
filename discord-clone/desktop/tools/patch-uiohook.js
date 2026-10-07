// O uiohook instala no Windows um gancho de teclado e outro de mouse para o sistema inteiro.
// O app só usa teclas (push-to-talk e atalhos), e o gancho de mouse faz todo movimento do
// mouse passar pelo Resenhex antes de chegar ao jogo, o que atrasa o cursor em jogos como
// Baldur's Gate 3 quando o PC está ocupado (por exemplo, transmitindo a tela).
// Este script tira o gancho de mouse do código do uiohook e o compila para o Electron.
//   node tools/patch-uiohook.js           só corrige o código (roda depois do npm install)
//   node tools/patch-uiohook.js --build   corrige e compila, se ainda não houver binário
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MARK = '/* resenhex: sem gancho de mouse */';
const HOOK_LINE = '    mouse_event_hhook = SetWindowsHookEx(WH_MOUSE_LL, mouse_hook_event_proc, hInst, 0);';
const CHECK = 'if (keyboard_event_hhook != NULL && mouse_event_hhook != NULL) {';

function patchSource(source) {
  if (source.includes(MARK)) return { source, changed: false };
  if (!source.includes(HOOK_LINE) || !source.includes(CHECK)) {
    throw new Error('O código do uiohook mudou: revise tools/patch-uiohook.js antes de atualizar a dependência.');
  }
  return {
    source: source.replace(HOOK_LINE, `    ${MARK}`).replace(CHECK, 'if (keyboard_event_hhook != NULL) {'),
    changed: true,
  };
}

function run({ build }) {
  const pkg = path.join(__dirname, '..', 'node_modules', 'uiohook-napi');
  const file = path.join(pkg, 'libuiohook', 'src', 'windows', 'input_hook.c');
  const binary = path.join(pkg, 'build', 'Release', 'uiohook_napi.node');
  const { source, changed } = patchSource(fs.readFileSync(file, 'utf8'));
  if (changed) {
    fs.writeFileSync(file, source);
    // Binários feitos com o código antigo ainda teriam o gancho de mouse.
    fs.rmSync(path.join(pkg, 'build'), { recursive: true, force: true });
  }
  // Sem os binários prontos do pacote, o app só carrega o que foi compilado com a correção.
  for (const arch of ['win32-x64', 'win32-arm64']) fs.rmSync(path.join(pkg, 'prebuilds', arch), { recursive: true, force: true });
  if (!build || process.platform !== 'win32' || fs.existsSync(binary)) return;
  const bin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-rebuild.cmd');
  execSync(`"${bin}" --force --only uiohook-napi`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  if (!fs.existsSync(binary)) throw new Error('O uiohook não foi compilado: o push-to-talk em segundo plano não funcionaria.');
}

if (require.main === module) run({ build: process.argv.includes('--build') });

module.exports = { patchSource, MARK };
