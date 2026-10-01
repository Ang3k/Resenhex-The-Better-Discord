// Atalhos globais (com o app em segundo plano). O site manda [{ id, combo }] com combos como
// "Ctrl+Shift+KeyM"; aqui viram códigos do gancho de teclado (uiohook) com os modificadores exigidos.
const { uiohookKeycode } = require('./ptt-keys');

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const MAX_BINDINGS = 20;

function globalBindings(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_BINDINGS).flatMap((item) => {
    if (!item || typeof item.id !== 'string' || !/^[A-Za-z]{1,32}$/.test(item.id) || typeof item.combo !== 'string') return [];
    const parts = item.combo.split('+');
    const code = parts.pop();
    if (parts.some((part) => !MODIFIERS.includes(part))) return [];
    const keycode = uiohookKeycode(code);
    if (keycode == null) return [];
    return [{ id: item.id, keycode, ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift'), meta: parts.includes('Meta') }];
  });
}

// Os modificadores precisam bater exatamente: Ctrl+Shift+M não dispara com Ctrl+Alt+Shift+M.
function matchBinding(bindings, event) {
  return bindings.find((b) => b.keycode === event.keycode && b.ctrl === !!event.ctrlKey && b.alt === !!event.altKey
    && b.shift === !!event.shiftKey && b.meta === !!event.metaKey) || null;
}

module.exports = { globalBindings, matchBinding };
