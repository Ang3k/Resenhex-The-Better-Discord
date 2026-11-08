// Janela compartilhada pelo navegador e pelos apps de Windows e Android.
// O app.js conta se o dev está online (na entrada e pelo aviso "dev:status"); a janela e o botão mostram a bolinha.
let feedbackDev = { available: false, online: false };
const feedbackDevListeners = new Set();
window.setFeedbackDev = (next) => {
  feedbackDev = { ...feedbackDev, ...next };
  feedbackDevListeners.forEach((listener) => listener());
};
window.createFeedback = ({ token, prepare = () => {} }) => {
  const root = document.querySelector('#feedback');
  const form = root.querySelector('#feedback-form');
  const input = root.querySelector('#feedback-message');
  const count = root.querySelector('#feedback-count');
  const status = root.querySelector('#feedback-status');
  const submit = root.querySelector('#feedback-send');
  const success = root.querySelector('#feedback-success');
  const closeButtons = [...root.querySelectorAll('[data-feedback-close]')];
  const via = root.querySelector('#feedback-via');
  const devOption = root.querySelector('#feedback-via-dev');
  const devDot = root.querySelector('#feedback-dev-dot');
  const viaNote = root.querySelector('#feedback-via-note');
  const successText = root.querySelector('#feedback-success-description');
  const SUCCESS_EMAIL = successText.textContent;
  const SUCCESS_DEV = 'Sua mensagem chegou ao dev. Se ele responder, a conversa aparece nas suas mensagens.';
  const linkDot = document.querySelector('#feedback-link-dot');
  let busy = false, sent = false, returnFocus = null, roots = [];

  // Mensagem pro dev: a bolinha fica verde quando o dev está online e cinza quando não está, na janela e no botão.
  // Muda sozinha pelo aviso do servidor. Se o servidor não oferece (ou é o próprio dev), a opção e a bolinha somem.
  const channel = () => via.querySelector('input:checked')?.value || 'email';
  function showDev() {
    const { available, online } = feedbackDev;
    if (!available && channel() === 'dev') via.querySelector('input[value="email"]').checked = true;
    devOption.classList.toggle('hidden', !available);
    via.classList.toggle('hidden', !available);
    const label = online ? 'Dev online agora' : 'Dev offline';
    for (const dot of [devDot, linkDot].filter(Boolean)) {
      dot.classList.toggle('online', !!online);
      dot.setAttribute('aria-label', label);
      dot.title = label;
    }
    linkDot?.classList.toggle('hidden', !available);
    viaNote.classList.toggle('hidden', channel() !== 'dev');
  }
  feedbackDevListeners.add(showDev);
  // Ao abrir, confere de novo (a conexão pode ter caído e perdido um aviso).
  async function checkDev() {
    try {
      const response = await fetch('/feedback/dev', { headers: { 'x-token': token() || '' }, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const result = await response.json();
      window.setFeedbackDev({ available: !!result.available, online: !!result.online });
    } catch { /* sem resposta: fica como estava */ }
  }
  via.addEventListener('change', () => { viaNote.classList.toggle('hidden', channel() !== 'dev'); });

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
    const controls = [...root.querySelectorAll('button, textarea, a[href], input:checked')].filter((node) => !node.disabled && !node.closest('.hidden'));
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
    showDev();
    checkDev();
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
    via.disabled = true;
    const sentVia = channel();
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
        signal: controller.signal, body: JSON.stringify({ message, channel: sentVia }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'Não foi possível enviar sua sugestão. Tente novamente.');
      sent = true;
      input.value = '';
      successText.textContent = sentVia === 'dev' ? SUCCESS_DEV : SUCCESS_EMAIL;
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
      via.disabled = false;
      closeButtons.forEach((button) => { button.disabled = false; });
      submit.textContent = 'Enviar sugestão';
      refresh();
      if (sent) root.querySelector('#feedback-done').focus();
      else input.focus();
    }
  });
  for (const selector of ['#btn-feedback', '#settings-feedback']) document.querySelector(selector).onclick = open;
  refresh();
  showDev();
  return { open, close, isOpen };
};
