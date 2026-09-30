// Converte o código de tecla do site (KeyboardEvent.code, ex.: "Backquote", "KeyV")
// no código do gancho global de teclado (uiohook). Devolve null para teclas sem suporte.
const { UiohookKey } = require('uiohook-napi');

const ALIASES = {
  ControlLeft: 'Ctrl', ControlRight: 'CtrlRight',
  AltLeft: 'Alt', AltRight: 'AltRight',
  ShiftLeft: 'Shift', ShiftRight: 'ShiftRight',
  MetaLeft: 'Meta', MetaRight: 'MetaRight',
};
// Teclas extras do teclado ABNT2 (\| ao lado do Shift e /? ao lado do Shift direito).
const EXTRA = { IntlBackslash: 86, IntlRo: 115 };

function uiohookKeycode(code) {
  if (typeof code !== 'string' || !code) return null;
  if (Object.hasOwn(EXTRA, code)) return EXTRA[code];
  const name = (Object.hasOwn(ALIASES, code) && ALIASES[code]) || code.replace(/^Key([A-Z])$/, '$1').replace(/^Digit([0-9])$/, '$1');
  return Object.hasOwn(UiohookKey, name) ? UiohookKey[name] : null;
}

module.exports = { uiohookKeycode };
