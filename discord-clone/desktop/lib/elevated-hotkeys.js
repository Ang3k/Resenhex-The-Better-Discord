// Microfone e áudio com um programa aberto como administrador na frente (muitos jogos rodam assim).
// O Windows não deixa o gancho de teclado (uiohook) de um app comum ver as teclas que vão para essa
// janela, mas um atalho registrado no sistema (RegisterHotKey) ainda chega. Ele só fica registrado
// enquanto essa janela está na frente: registrado, o atalho não chega a nenhum outro programa, e no
// resto do tempo o gancho funciona sem tirar a tecla do jogo. O push-to-talk fica de fora: o Windows
// avisa quando o atalho é apertado, mas não quando a tecla é solta.

const WM_HOTKEY = 0x0312;
const MOD_ALT = 0x0001, MOD_CONTROL = 0x0002, MOD_SHIFT = 0x0004, MOD_WIN = 0x0008;
const MOD_NOREPEAT = 0x4000; // segurar a tecla dispara uma vez só (sem ele, cada repetição do teclado mutaria e desmutaria)

// Teclas com o mesmo código em qualquer layout. O Enter do teclado numérico fica só com o gancho: ele tem a
// mesma tecla virtual do Enter, e registrado faria o Enter do jogo também mutar.
const NAMED_KEYS = {
  Space: 0x20, Enter: 0x0d, Tab: 0x09, Backspace: 0x08, Escape: 0x1b, Insert: 0x2d, Delete: 0x2e,
  Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
  NumpadMultiply: 0x6a, NumpadAdd: 0x6b, NumpadSubtract: 0x6d, NumpadDecimal: 0x6e, NumpadDivide: 0x6f,
  CapsLock: 0x14, ScrollLock: 0x91, NumLock: 0x90, Pause: 0x13, PrintScreen: 0x2c, ContextMenu: 0x5d,
};
// Pontuação: o site guarda a posição da tecla (o código de varredura), e a tecla virtual de cada posição
// depende do teclado em uso. Quem diz qual é, na hora, é o Windows (scanToVk = MapVirtualKey).
const SCAN_CODES = {
  Backquote: 0x29, Minus: 0x0c, Equal: 0x0d, BracketLeft: 0x1a, BracketRight: 0x1b, Backslash: 0x2b,
  Semicolon: 0x27, Quote: 0x28, Comma: 0x33, Period: 0x34, Slash: 0x35, IntlBackslash: 0x56, IntlRo: 0x73,
};

// Código de tecla virtual do Windows para o KeyboardEvent.code do site, ou null.
function virtualKey(code, scanToVk) {
  const letter = /^(?:Key([A-Z])|Digit(\d))$/.exec(code);
  if (letter) return (letter[1] || letter[2]).charCodeAt(0);
  const fn = /^F(\d{1,2})$/.exec(code);
  if (fn && fn[1] >= 1 && fn[1] <= 24) return 0x6f + Number(fn[1]);
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return 0x60 + Number(numpad[1]);
  if (Object.hasOwn(NAMED_KEYS, code)) return NAMED_KEYS[code];
  if (scanToVk && Object.hasOwn(SCAN_CODES, code)) return scanToVk(SCAN_CODES[code]) || null;
  return null;
}

// Atalhos de globalBindings() no formato do RegisterHotKey, sem os de teclas que não dá para registrar.
function hotkeysFor(bindings, scanToVk) {
  return bindings.flatMap((binding) => {
    const vk = virtualKey(binding.code, scanToVk);
    if (vk == null) return [];
    const modifiers = MOD_NOREPEAT | (binding.ctrl ? MOD_CONTROL : 0) | (binding.alt ? MOD_ALT : 0)
      | (binding.shift ? MOD_SHIFT : 0) | (binding.meta ? MOD_WIN : 0);
    return [{ id: binding.id, modifiers, vk }];
  });
}

// RegisterHotKey na janela do app: o Windows manda WM_HOTKEY para ela com o número do atalho.
function windowsHotkeyApi(hwnd) {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const RegisterHotKey = user32.func('bool RegisterHotKey(uintptr_t hWnd, int id, uint32 modifiers, uint32 vk)');
  const UnregisterHotKey = user32.func('bool UnregisterHotKey(uintptr_t hWnd, int id)');
  const MapVirtualKeyW = user32.func('uint32 MapVirtualKeyW(uint32 code, uint32 mapType)');
  const MAPVK_VSC_TO_VK = 1;
  return {
    register: (number, modifiers, vk) => { const handle = hwnd(); return !!handle && RegisterHotKey(handle, number, modifiers, vk); },
    unregister: (number) => { const handle = hwnd(); if (handle) UnregisterHotKey(handle, number); },
    scanToVk: (scan) => MapVirtualKeyW(scan, MAPVK_VSC_TO_VK),
  };
}

// elevated(): a janela da frente é de um programa de administrador (foreground.js).
// api: { register(número, modificadores, tecla) → bool, unregister(número), scanToVk?(código de varredura) → tecla }.
function createElevatedHotkeys({ elevated, api, onKeybind, log, interval = 250 }) {
  let hotkeys = [];
  let registered = []; // números dos atalhos registrados no Windows (posição em hotkeys + 1)
  let active = false;
  let timer = null;

  function register() {
    hotkeys.forEach((hotkey, index) => {
      if (api.register(index + 1, hotkey.modifiers, hotkey.vk)) registered.push(index + 1);
      else log.warn(`Atalho ${hotkey.id} já é usado por outro programa: com um programa de administrador na frente, ele não funciona`);
    });
  }
  function unregister() {
    for (const number of registered) api.unregister(number);
    registered = [];
  }
  function check() {
    let now;
    try { now = elevated(); } catch { return; }
    if (now === active) return;
    active = now;
    if (active) {
      log.info('Programa de administrador na frente: microfone e áudio passam pelos atalhos do Windows');
      register();
    } else unregister();
  }

  return {
    set(bindings) {
      unregister();
      hotkeys = hotkeysFor(bindings, api.scanToVk);
      if (active) register();
      if (hotkeys.length && !timer) timer = setInterval(check, interval);
      if (!hotkeys.length && timer) { clearInterval(timer); timer = null; active = false; }
    },
    // WM_HOTKEY, com o número do atalho.
    pressed(number) {
      if (registered.includes(number)) onKeybind(hotkeys[number - 1].id);
    },
    // Com o atalho registrado no Windows, o gancho não repassa a mesma ação (seria mutar e desmutar).
    handles: (id) => registered.some((number) => hotkeys[number - 1].id === id),
    stop() {
      clearInterval(timer);
      timer = null;
      unregister();
      active = false;
    },
  };
}

module.exports = { WM_HOTKEY, virtualKey, hotkeysFor, windowsHotkeyApi, createElevatedHotkeys };
