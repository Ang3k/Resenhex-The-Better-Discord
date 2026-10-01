// Atalhos de teclado configuráveis, com os padrões do Discord.
// Cada atalho é guardado como texto: modificadores na ordem Ctrl, Alt, Shift, Meta e o KeyboardEvent.code
// no fim, ex.: "Ctrl+Shift+KeyM". Uma string vazia desliga a ação.
window.Keybinds = (() => {
  const ACTIONS = [
    { id: 'toggleMute', group: 'Voz', label: 'Ativar ou desativar microfone', combo: 'Ctrl+Shift+KeyM', global: true },
    { id: 'toggleDeafen', group: 'Voz', label: 'Ativar ou desativar áudio', combo: 'Ctrl+Shift+KeyD', global: true },
    { id: 'toggleCamera', group: 'Voz', label: 'Ligar ou desligar câmera', combo: '' },
    { id: 'shareScreen', group: 'Voz', label: 'Compartilhar tela', combo: '' },
    { id: 'toggleNoise', group: 'Voz', label: 'Supressão de ruído', combo: '' },
    { id: 'disconnect', group: 'Voz', label: 'Sair da chamada', combo: '' },
    { id: 'returnToCall', group: 'Voz', label: 'Voltar para a chamada', combo: 'Ctrl+Alt+KeyA' },
    { id: 'prevChannel', group: 'Navegação', label: 'Canal anterior', combo: 'Alt+ArrowUp' },
    { id: 'nextChannel', group: 'Navegação', label: 'Próximo canal', combo: 'Alt+ArrowDown' },
    { id: 'prevUnread', group: 'Navegação', label: 'Canal não lido anterior', combo: 'Alt+Shift+ArrowUp' },
    { id: 'nextUnread', group: 'Navegação', label: 'Próximo canal não lido', combo: 'Alt+Shift+ArrowDown' },
    { id: 'prevServer', group: 'Navegação', label: 'Servidor anterior', combo: 'Ctrl+Alt+ArrowUp' },
    { id: 'nextServer', group: 'Navegação', label: 'Próximo servidor', combo: 'Ctrl+Alt+ArrowDown' },
    { id: 'toggleMembers', group: 'Conversa', label: 'Mostrar ou esconder membros', combo: 'Ctrl+KeyU' },
    { id: 'emojiPicker', group: 'Conversa', label: 'Abrir emojis', combo: 'Ctrl+KeyE' },
    { id: 'upload', group: 'Conversa', label: 'Enviar arquivo', combo: 'Ctrl+Shift+KeyU' },
    { id: 'settings', group: 'Conversa', label: 'Abrir configurações', combo: 'Ctrl+Comma' },
    { id: 'shortcuts', group: 'Conversa', label: 'Ver atalhos', combo: 'Ctrl+Slash' },
  ];
  const DEFAULTS = Object.fromEntries(ACTIONS.map((action) => [action.id, action.combo]));
  const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'];
  const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

  // Teclas que só funcionam com Ctrl ou Alt junto: sozinhas atrapalhariam a digitação.
  const needsModifier = (code) => /^(Key[A-Z]|Digit\d|Space|Enter|Backspace|Tab|Escape|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|IntlRo|Arrow(Up|Down|Left|Right))$/.test(code);

  const modsOf = (event) => [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta'].filter(Boolean);
  function fromEvent(event) {
    if (!event.code || MODIFIER_CODES.test(event.code)) return null;
    return [...modsOf(event), event.code].join('+');
  }
  // Pontuação pelo caractere: no ABNT2 a "/" fica em outra tecla física (IntlRo), e Ctrl+/ tem que funcionar igual.
  const PUNCTUATION = { '/': 'Slash', ',': 'Comma', '.': 'Period', ';': 'Semicolon', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', "'": 'Quote', '`': 'Backquote' };
  // Combinações que o evento pode representar: pela tecla física e, na pontuação, pelo caractere.
  function candidates(event) {
    const list = [fromEvent(event)];
    if (Object.hasOwn(PUNCTUATION, event.key)) list.push([...modsOf(event), PUNCTUATION[event.key]].join('+'));
    return [...new Set(list.filter(Boolean))];
  }

  function parse(combo) {
    const parts = String(combo || '').split('+').filter(Boolean);
    const code = parts.pop() || '';
    return { code, ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift'), meta: parts.includes('Meta') };
  }

  const KEY_NAMES = {
    Space: 'Espaço', Enter: 'Enter', Escape: 'Esc', Backspace: 'Backspace', Tab: 'Tab', Delete: 'Delete', Insert: 'Insert',
    Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', IntlBackslash: '\\', IntlRo: '/', NumpadAdd: 'Num +', NumpadSubtract: 'Num -',
    NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num ,', NumpadEnter: 'Num Enter', CapsLock: 'Caps Lock',
    Pause: 'Pause', ScrollLock: 'Scroll Lock', PrintScreen: 'Print Screen', ContextMenu: 'Menu',
  };
  function keyName(code) {
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad(\d)$/, 'Num $1');
  }
  // Partes para mostrar em <kbd>, ex.: ["Ctrl", "Shift", "M"].
  const parts = (combo) => {
    if (!combo) return [];
    const { code, ...mods } = parse(combo);
    return [...MODIFIERS.filter((m) => mods[m.toLowerCase()]), keyName(code)];
  };
  const format = (combo) => parts(combo).join(' + ');

  // Valida e completa o que veio do armazenamento: ações novas ganham o padrão, ações removidas somem.
  function normalize(saved) {
    const result = { ...DEFAULTS };
    if (saved && typeof saved === 'object') {
      for (const id of Object.keys(DEFAULTS)) {
        if (typeof saved[id] !== 'string') continue;
        const { code } = parse(saved[id]);
        if (saved[id] === '' || /^[A-Za-z0-9]+$/.test(code)) result[id] = saved[id];
      }
    }
    return result;
  }

  function load() {
    try { return normalize(JSON.parse(localStorage.getItem('keybinds') || 'null')); } catch { return { ...DEFAULTS }; }
  }

  // Ação que usa a combinação, se houver (para avisar conflitos ao editar).
  const actionFor = (binds, combo, except) => (combo ? ACTIONS.find((a) => a.id !== except && binds[a.id] === combo) : null);

  return { ACTIONS, DEFAULTS, fromEvent, candidates, parse, parts, format, normalize, load, actionFor, needsModifier };
})();
