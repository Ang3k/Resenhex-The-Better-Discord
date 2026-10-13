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

// Programas com janela aberta: uma linha por janela, com ID do processo, janela, nome e arquivo. A
// janela liga o app à fonte de vídeo escolhida; o arquivo dá o ícone quando a janela não aparece
// na lista. Apps da Microsoft Store (Netflix, jogos do Xbox) desenham dentro de uma moldura do
// ApplicationFrameHost: o som sai do processo da janela de dentro (CoreWindow), e é esse que vale.
// Sem compilar o trecho em C# (PowerShell restrito), fica a janela principal de cada processo.
const WINDOWS_CS = `
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class ResenhexWindows {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  static string ClassOf(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static List<string> List() {
    var rows = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || GetWindowTextLength(h) == 0) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      string cls = ClassOf(h); if (cls == "Progman") return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (cls == "ApplicationFrameWindow") {
        uint frame = pid;
        EnumChildWindows(h, (c, x) => {
          if (ClassOf(c) != "Windows.UI.Core.CoreWindow") return true;
          uint inner; GetWindowThreadProcessId(c, out inner);
          if (inner == frame) return true;
          pid = inner; return false;
        }, IntPtr.Zero);
      }
      rows.Add(pid + "\\t" + h.ToInt64());
      return true;
    }, IntPtr.Zero);
    return rows;
  }
}`;

const AUDIO_APPS_SCRIPT = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
$procs = @{}; Get-Process | ForEach-Object { $procs[$_.Id] = $_ }
try {
  Add-Type -TypeDefinition @'
${WINDOWS_CS}
'@ -ErrorAction Stop
  $rows = [ResenhexWindows]::List()
} catch {
  $rows = $procs.Values | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object { "$($_.Id)\`t$([int64]$_.MainWindowHandle)" }
}
foreach ($row in $rows) {
  $id, $hwnd = $row -split "\`t"
  $p = $procs[[int]$id]
  if ($p) { "$id\`t$hwnd\`t$($p.Description)\`t$($p.ProcessName)\`t$($p.Path)" }
}`;

// O script vai codificado (-EncodedCommand): aspas e quebras de linha chegam intactas.
function encodeScript(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

// Um app por processo, com todas as janelas dele; o próprio Resenhex fica de fora (o som dele
// nunca vai junto). O sistema (moldura dos apps da Store, Explorer sem nome) também.
function parseAudioApps(text, ownPids = []) {
  const own = new Set(ownPids);
  const apps = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const [pid, hwnd, description, processName, file] = line.split('\t');
    const id = Number(pid);
    if (!Number.isInteger(id) || id <= 0 || own.has(id)) continue;
    if (/^ApplicationFrameHost$/i.test((processName || '').trim())) continue;
    const window = /^\d+$/.test(hwnd || '') ? hwnd : null;
    const known = apps.get(id);
    if (known) { if (window && !known.windows.includes(window)) known.windows.push(window); continue; }
    const name = (description || '').trim() || (processName || '').trim();
    if (!name) continue;
    apps.set(id, { pid: id, windows: window ? [window] : [], name: name.slice(0, 80), path: (file || '').trim() || null });
  }
  return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

// "window:<HWND>:0" → HWND, para achar o app da janela escolhida.
function windowHandle(sourceId) {
  const match = /^window:(\d+):/.exec(String(sourceId));
  return match ? match[1] : null;
}

module.exports = { systemAudioDevice, appAudioSupported, appAudioDevice, AUDIO_APPS_SCRIPT, encodeScript, parseAudioApps, windowHandle };
