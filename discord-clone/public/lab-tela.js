// Laboratório da transmissão do celular (docs/planos/PLANO-FPS-TELA-DO-CELULAR-2026-11-08.md).
// 1. Painel do dono (Configurações → Laboratório): liga por até 2 h, dá nome ao teste (tela inteira ou um app
//    só; o que estava na tela) e escolhe as variações (regra de atraso, codec da call, captura em JPEG).
// 2. Medição: o servidor manda lab:state só para quem está na mesma call que o dono. Com ele ligado, esta página
//    manda a cada segundo os números da transmissão: os do celular (android-screen.js), os de envio para cada
//    espectador e os de recebimento de cada tela assistida (media-session.js). Nada de imagem, som ou texto.
//    Um selo na call avisa que a medição está ligada.
window.ScreenLab = (() => {
  const api = { state: { on: false }, init };
  let deps = null;
  let timer = null;
  let busy = false;
  let hz = null;
  let measuring = false;
  let appVisible = true;

  // Taxa da tela do celular (60, 90, 120 Hz), contando quadros por 1 s enquanto a página está à vista.
  function measureHz() {
    if (hz || measuring || document.hidden || typeof requestAnimationFrame !== 'function') return;
    measuring = true;
    let frames = 0;
    const started = performance.now();
    const step = (now) => {
      frames++;
      if (now - started < 1000) { requestAnimationFrame(step); return; }
      measuring = false;
      const got = Math.round(frames * 1000 / (now - started));
      // Menos que 24 é a página freada (janela escondida): o tick tenta de novo depois.
      if (!document.hidden && appVisible && got >= 24) hz = got;
    };
    requestAnimationFrame(step);
  }

  async function tick() {
    if (busy || !api.state.on || !deps) return;
    busy = true;
    measureHz();
    try {
      const phone = window.AndroidScreen?.labTake?.() || null;
      const media = (await deps.labStats?.()) || {};
      // Sem transmissão do celular, sem enviar e sem assistir: nada a medir nesta página.
      if (!phone && !media.out?.length && !media.in?.length && !media.sfu) return;
      deps.socket.emit('lab:sample', {
        t: Date.now(), role: phone ? 'phone' : media.out?.length ? 'sender' : 'viewer', app: appVisible, hidden: document.hidden, hz,
        ua: navigator.userAgent, screen: [screen.width, screen.height, window.devicePixelRatio || 1], phone, ...media,
      });
    } catch {
      // Uma leitura perdida; a próxima vem em 1 s.
    } finally { busy = false; }
  }

  function badge() {
    const view = document.querySelector('#voice-view');
    let pill = document.querySelector('#lab-pill');
    if (!api.state.on) { pill?.remove(); return; }
    if (!view || pill) return;
    pill = deps.el('div', { id: 'lab-pill', class: 'lab-pill', role: 'status', tip: 'O dono do Resenhex está medindo a transmissão: só números (quadros, taxa, atrasos), nada de imagem, som ou texto.' },
      deps.el('span', { class: 'lab-pill-dot', ariaHidden: 'true' }), deps.el('span', { class: 'lab-pill-text', textContent: 'Laboratório ligado' }));
    view.append(pill);
  }

  function setState(next) {
    api.state = next?.on ? { on: true, run: next.run, lagRule: next.lagRule !== false, codec: next.codec || 'auto', capture: next.capture || 'h264' } : { on: false };
    clearInterval(timer);
    timer = null;
    if (api.state.on) {
      measureHz();
      timer = setInterval(tick, 1000);
      deps.onCodec?.(); // codec fixado pelo laboratório: vale na hora para quem já está assistindo
    }
    badge();
  }

  // ---------------- painel do dono ----------------

  function panel({ request }) {
    const page = document.querySelector('#page-lab');
    const settings = document.querySelector('#settings');
    if (!page || !settings) return;
    const $ = (id) => page.querySelector('#' + id);
    const fields = { on: $('lab-on'), mode: $('lab-mode'), content: $('lab-content'), lagRule: $('lab-lag'), codec: $('lab-codec'), capture: $('lab-capture') };
    const status = $('lab-status');
    let poll = null;
    let sending = false;
    const visible = () => !settings.classList.contains('hidden') && !page.classList.contains('hidden') && !document.hidden;

    function show(view) {
      if (!view || view.error) { status.textContent = view?.error || 'Não foi possível falar com o servidor.'; return; }
      if (!sending) {
        fields.on.checked = !!view.on;
        for (const key of ['mode', 'content', 'codec', 'capture']) fields[key].value = view[key] ?? fields[key].value;
        fields.lagRule.checked = view.lagRule !== false;
      }
      const until = view.on && view.until ? new Date(view.until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const pages = view.collectors === 1 ? '1 página na sua call' : `${view.collectors || 0} páginas na sua call`;
      status.textContent = view.on
        ? `Ligado até ${until} · teste nº ${view.run} · ${pages} · ${view.written} amostras gravadas`
        : 'Desligado. Ligue, entre na call e transmita a tela do celular.';
    }

    async function refresh() {
      clearTimeout(poll);
      poll = null;
      if (!visible()) return;
      show(await request('lab:get'));
      if (visible()) poll = setTimeout(refresh, 3000);
    }

    async function send() {
      sending = true;
      try {
        show(await request('lab:set', { on: fields.on.checked, mode: fields.mode.value, content: fields.content.value,
          lagRule: fields.lagRule.checked, codec: fields.codec.value, capture: fields.capture.value }));
      } finally { sending = false; }
    }

    for (const field of Object.values(fields)) field.addEventListener('change', send);
    settings.addEventListener('settings-section', (event) => { if (event.detail === 'lab') refresh(); });
    document.addEventListener('visibilitychange', () => { if (!poll) refresh(); });
  }

  function init(options) {
    deps = options;
    deps.socket.on('lab:state', setState);
    // Servidor reiniciou: o laboratório volta desligado (ele avisa de novo se ainda valer).
    deps.socket.on('connect', () => setState(null));
    window.addEventListener('resenhex:app-visibility', (event) => { appVisible = !!event.detail?.visible; });
    // A call abriu depois do aviso: o selo entra junto.
    new MutationObserver(() => badge()).observe(document.querySelector('#voice-view') || document.body, { attributes: true, attributeFilter: ['class'] });
    panel(options);
  }

  return api;
})();
