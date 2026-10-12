// Qual janela está em primeiro plano no Windows: processo, executável e área útil (sem a moldura).
// Usa o koffi para chamar a API do Windows direto, sem compilar nada. Fora do Windows, ou se o
// koffi não carregar, devolve null e o overlay simplesmente não aparece.

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

function createForeground() {
  if (process.platform !== 'win32') return null;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
  koffi.struct('POINT', { x: 'long', y: 'long' });
  const GetForegroundWindow = user32.func('void *GetForegroundWindow()');
  const GetWindowThreadProcessId = user32.func('uint32 GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *pid)');
  const GetClientRect = user32.func('bool GetClientRect(void *hWnd, _Out_ RECT *rect)');
  const ClientToScreen = user32.func('bool ClientToScreen(void *hWnd, _Inout_ POINT *point)');
  const IsIconic = user32.func('bool IsIconic(void *hWnd)');
  const OpenProcess = kernel32.func('void *OpenProcess(uint32 access, bool inherit, uint32 pid)');
  const QueryFullProcessImageNameW = kernel32.func('bool QueryFullProcessImageNameW(void *process, uint32 flags, _Out_ void *name, _Inout_ uint32 *size)');
  const CloseHandle = kernel32.func('bool CloseHandle(void *handle)');

  let cached = { pid: 0, exe: '' };
  function exeOf(pid) {
    if (cached.pid === pid) return cached.exe;
    let exe = '';
    const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (handle) {
      try {
        const buffer = Buffer.alloc(2 * 1024);
        const size = [1024];
        if (QueryFullProcessImageNameW(handle, 0, buffer, size)) exe = buffer.toString('utf16le', 0, size[0] * 2);
      } finally { CloseHandle(handle); }
    }
    cached = { pid, exe };
    return exe;
  }

  // { pid, exe, rect } com a área útil em pixels físicos, ou null (sem janela ou minimizada).
  return function current() {
    const hwnd = GetForegroundWindow();
    if (!hwnd || IsIconic(hwnd)) return null;
    const pid = [0];
    GetWindowThreadProcessId(hwnd, pid);
    if (!pid[0]) return null;
    const rect = {};
    const origin = { x: 0, y: 0 };
    if (!GetClientRect(hwnd, rect) || !ClientToScreen(hwnd, origin)) return null;
    const width = rect.right - rect.left, height = rect.bottom - rect.top;
    if (width <= 0 || height <= 0) return null;
    return { pid: pid[0], exe: exeOf(pid[0]), rect: { x: origin.x, y: origin.y, width, height } };
  };
}

module.exports = { createForeground };
