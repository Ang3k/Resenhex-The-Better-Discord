// Qual janela está em primeiro plano no Windows: janela, processo, executável e área útil (sem a
// moldura). Usa o koffi para chamar a API do Windows direto, sem compilar nada. Fora do Windows, ou
// se o koffi não carregar, devolve null: o overlay não aparece e a transmissão não segue a partida.
// A janela (HWND) é o mesmo número das fontes de captura ("window:<HWND>:0").

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
let instance; // o overlay e a transmissão usam a mesma: o koffi não aceita registrar RECT duas vezes

function createForeground() {
  if (instance !== undefined) return instance;
  if (process.platform !== 'win32') return (instance = null);
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
  koffi.struct('POINT', { x: 'long', y: 'long' });
  const GetForegroundWindow = user32.func('uintptr_t GetForegroundWindow()');
  const GetWindowThreadProcessId = user32.func('uint32 GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32 *pid)');
  const GetClientRect = user32.func('bool GetClientRect(uintptr_t hWnd, _Out_ RECT *rect)');
  const ClientToScreen = user32.func('bool ClientToScreen(uintptr_t hWnd, _Inout_ POINT *point)');
  const IsIconic = user32.func('bool IsIconic(uintptr_t hWnd)');
  const IsWindow = user32.func('bool IsWindow(uintptr_t hWnd)');
  const IsWindowVisible = user32.func('bool IsWindowVisible(uintptr_t hWnd)');
  const OpenProcess = kernel32.func('void *OpenProcess(uint32 access, bool inherit, uint32 pid)');
  const QueryFullProcessImageNameW = kernel32.func('bool QueryFullProcessImageNameW(void *process, uint32 flags, _Out_ void *name, _Inout_ uint32 *size)');
  const CloseHandle = kernel32.func('bool CloseHandle(void *handle)');
  const PostMessageW = user32.func('bool PostMessageW(uintptr_t hWnd, uint32 msg, uintptr_t wParam, intptr_t lParam)');
  const RegisterWindowMessageW = user32.func('uint32 RegisterWindowMessageW(str16 name)');
  const UIPI_TEST = RegisterWindowMessageW('ResenhexUipiTest');

  function imageOf(pid) {
    let exe = '';
    const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (handle) {
      try {
        const buffer = Buffer.alloc(2 * 1024);
        const size = [1024];
        if (QueryFullProcessImageNameW(handle, 0, buffer, size)) exe = buffer.toString('utf16le', 0, size[0] * 2);
      } finally { CloseHandle(handle); }
    }
    return exe;
  }
  let cached = { pid: 0, exe: '' };
  function exeOf(pid) {
    if (cached.pid !== pid) cached = { pid, exe: imageOf(pid) };
    return cached.exe;
  }

  // { hwnd, pid, exe, rect } com a área útil em pixels físicos, ou null (sem janela ou minimizada).
  function current() {
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
    return { hwnd, pid: pid[0], exe: exeOf(pid[0]), rect: { x: origin.x, y: origin.y, width, height } };
  }
  // De quem é uma janela qualquer: { pid, exe }, ou null se ela já fechou.
  current.processOf = (hwnd) => {
    const pid = [0];
    if (!hwnd || !IsWindow(hwnd)) return null;
    GetWindowThreadProcessId(hwnd, pid);
    return pid[0] ? { pid: pid[0], exe: imageOf(pid[0]) } : null;
  };
  current.alive = (hwnd) => !!hwnd && IsWindow(hwnd);
  // Escondida (o client do LoL durante a partida) ou já fechada: false.
  current.visible = (hwnd) => !!hwnd && IsWindow(hwnd) && IsWindowVisible(hwnd);
  // A janela da frente é de um programa aberto como administrador? O Windows recusa as mensagens de um
  // app comum para ela, o mesmo bloqueio que esconde do gancho de teclado as teclas que vão para ela.
  // A mensagem existe só para o teste (quem recebe ignora) e só é mandada quando a janela da frente muda.
  let uipi = { hwnd: 0, blocked: false };
  current.elevated = () => {
    const hwnd = GetForegroundWindow();
    if (hwnd !== uipi.hwnd) uipi = { hwnd, blocked: !!hwnd && IsWindow(hwnd) && !PostMessageW(hwnd, UIPI_TEST, 0, 0) };
    return uipi.blocked;
  };
  return (instance = current);
}

module.exports = { createForeground };
