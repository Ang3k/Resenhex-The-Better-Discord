// Som do computador na transmissão de tela, sem o que o próprio Resenhex toca (vozes da chamada,
// efeitos): senão quem está na chamada se ouve de volta na transmissão. O Chromium só deixa o
// próprio processo de fora sozinho no Windows 11, mas a mesma captura funciona no Windows 10 22H2
// (build 19045); builds anteriores do Windows 10 aceitam o pedido e mesmo assim capturam errado
// (testado pelo Vesktop, PR #1309). Nelas fica a captura de tudo, e o site tira o som do Resenhex
// com o próprio filtro (public/own-audio.js).
function systemAudioDevice(platform, systemVersion) {
  if (platform !== 'win32') return null;
  const build = Number(String(systemVersion).split('.')[2]) || 0;
  return build >= 19045 ? 'loopbackWithoutChrome' : 'loopback';
}

// Som de um app só (e dos processos que ele abriu): quem transmite o jogo deixa de fora o
// Discord, a música ou qualquer outra coisa tocando no PC. O Chromium captura o som de um
// processo pelo ID ("applicationLoopback:<pid>") com a captura por processo do Windows, que
// existe desde o Windows 10 2004 (build 19041).
function appAudioSupported(platform, systemVersion) {
  if (platform !== 'win32') return false;
  return (Number(String(systemVersion).split('.')[2]) || 0) >= 19041;
}

function appAudioDevice(pid) {
  return `applicationLoopback:${pid}`;
}

// Programas com janela aberta: ID do processo, janela principal, nome e arquivo. A janela liga o
// app à fonte de vídeo escolhida; o arquivo dá o ícone quando a janela não aparece na lista.
const AUDIO_APPS_SCRIPT = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; '
  + 'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | '
  + 'ForEach-Object { "$($_.Id)`t$([int64]$_.MainWindowHandle)`t$($_.Description)`t$($_.ProcessName)`t$($_.Path)" }';

// Uma linha por programa; o próprio Resenhex fica de fora (o som dele nunca vai junto).
function parseAudioApps(text, ownPids = []) {
  const own = new Set(ownPids);
  const apps = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const [pid, hwnd, description, processName, file] = line.split('\t');
    const id = Number(pid);
    if (!Number.isInteger(id) || id <= 0 || own.has(id) || apps.has(id)) continue;
    const name = (description || '').trim() || (processName || '').trim();
    if (!name) continue;
    apps.set(id, { pid: id, window: /^\d+$/.test(hwnd || '') ? hwnd : null, name: name.slice(0, 80), path: (file || '').trim() || null });
  }
  return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

// "window:<HWND>:0" → HWND, para achar o app da janela escolhida.
function windowHandle(sourceId) {
  const match = /^window:(\d+):/.exec(String(sourceId));
  return match ? match[1] : null;
}

module.exports = { systemAudioDevice, appAudioSupported, appAudioDevice, AUDIO_APPS_SCRIPT, parseAudioApps, windowHandle };
