// Janela compartilhada pelo navegador e pelos apps de Windows e Android.
window.createFeedback = ({ token, prepare = () => {} }) => {
  const root = document.querySelector('#feedback');
  const form = root.querySelector('#feedback-form');
  const input = root.querySelector('#feedback-message');
  const count = root.querySelector('#feedback-count');
  const status = root.querySelector('#feedback-status');
  const submit = root.querySelector('#feedback-send');
  const success = root.querySelector('#feedback-success');
  const closeButtons = [...root.querySelectorAll('[data-feedback-close]')];
  let busy = false, sent = false, returnFocus = null, roots = [];

  const isOpen = () => !root.classList.contains('hidden');
  function refresh() {
    count.textContent = `${input.value.length}/3000`;
    submit.disabled = busy || !input.value.trim();
  }
  function close() {
    if (!isOpen() || busy) return;
    root.classList.add('hidden');
    roots.forEach(([element, inert]) => { element.inert = inert; });
    document.removeEventListener('keydown', onKey, true);
    returnFocus?.focus();
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key !== 'Tab') return;
    const controls = [...root.querySelectorAll('button, textarea, a[href]')].filter((node) => !node.disabled && !node.closest('.hidden'));
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function open() {
    if (isOpen()) return;
    returnFocus = document.activeElement;
    prepare();
    roots = ['#app', '#settings', '#server-settings'].map((selector) => document.querySelector(selector)).filter(Boolean).map((element) => [element, element.inert]);
    roots.forEach(([element]) => { element.inert = true; });
    if (sent) { sent = false; form.classList.remove('hidden'); success.classList.add('hidden'); }
    root.setAttribute('aria-labelledby', 'feedback-title');
    root.setAttribute('aria-describedby', 'feedback-description');
    status.textContent = '';
    status.classList.remove('error');
    root.classList.remove('hidden');
    document.addEventListener('keydown', onKey, true);
    refresh();
    // No celular, só abre o teclado quando a pessoa toca no campo.
    closeButtons[0].focus();
  }
  input.addEventListener('input', () => { status.textContent = ''; status.classList.remove('error'); refresh(); });
  closeButtons.forEach((button) => { button.onclick = close; });
  root.addEventListener('mousedown', (event) => { if (event.target === root) close(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const message = input.value.trim();
    if (!message || message.length > 3000) {
      status.textContent = 'Escreva uma sugestão de até 3000 caracteres.';
      status.classList.add('error');
      input.focus();
      return;
    }
    busy = true;
    form.setAttribute('aria-busy', 'true');
    input.disabled = true;
    closeButtons.forEach((button) => { button.disabled = true; });
    submit.textContent = 'Enviando…';
    status.textContent = 'Enviando sua sugestão…';
    status.classList.remove('error');
    refresh();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch('/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-token': token() || '' },
        signal: controller.signal, body: JSON.stringify({ message }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'Não foi possível enviar sua sugestão. Tente novamente.');
      sent = true;
      input.value = '';
      form.classList.add('hidden');
      success.classList.remove('hidden');
      root.setAttribute('aria-labelledby', 'feedback-success-title');
      root.setAttribute('aria-describedby', 'feedback-success-description');
    } catch (error) {
      status.textContent = error.name === 'AbortError'
        ? 'O envio demorou mais que o esperado. Sua ideia continua aqui; tente novamente.'
        : error instanceof TypeError ? 'Não foi possível conectar. Sua ideia continua aqui; confira sua conexão e tente novamente.'
          : error.message || 'Não foi possível enviar agora. Sua ideia continua aqui; tente novamente.';
      status.classList.add('error');
    } finally {
      clearTimeout(timer);
      busy = false;
      form.removeAttribute('aria-busy');
      input.disabled = false;
      closeButtons.forEach((button) => { button.disabled = false; });
      submit.textContent = 'Enviar sugestão';
      refresh();
      if (sent) root.querySelector('#feedback-done').focus();
      else input.focus();
    }
  });
  for (const selector of ['#btn-feedback', '#settings-feedback']) document.querySelector(selector).onclick = open;
  refresh();
  return { open, close, isOpen };
};
