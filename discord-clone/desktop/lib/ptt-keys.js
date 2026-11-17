// Converte o código de tecla do site (KeyboardEvent.code, ex.: "Backquote", "KeyV")
// no código do gancho global de teclado (uiohook). Devolve null para teclas sem suporte.
const { UiohookKey } = require('uiohook-napi');

const ALIASES = {
  ControlLeft: 'Ctrl', ControlRight: 'CtrlRight',
  AltLeft: 'Alt', AltRight: 'AltRight',
  ShiftLeft: 'Shift', ShiftRight: 'ShiftRight',
  MetaLeft: 'Meta', MetaRight: 'MetaRight',
};
// Teclas que o uiohook-napi não nomeia, com o código que o uiohook entrega no Windows: a \| ao lado do
// Shift do ABNT2 chega como VC_LESSER_GREATER; a /? ao lado do Shift direito chega como VC_UNDERSCORE
// (só com o remendo de tools/patch-uiohook.js); Pause e a tecla Menu.
const EXTRA = { IntlBackslash: 0x0e46, IntlRo: 0x0073, Pause: 0x0e45, ContextMenu: 0x0e5d };

function uiohookKeycode(code) {
  if (typeof code !== 'string' || !code) return null;
  if (Object.hasOwn(EXTRA, code)) return EXTRA[code];
  const name = (Object.hasOwn(ALIASES, code) && ALIASES[code]) || code.replace(/^Key([A-Z])$/, '$1').replace(/^Digit([0-9])$/, '$1');
  return Object.hasOwn(UiohookKey, name) ? UiohookKey[name] : null;
}

module.exports = { uiohookKeycode };
