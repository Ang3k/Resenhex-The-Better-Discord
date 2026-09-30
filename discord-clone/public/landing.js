// Página inicial de quem chega pela primeira vez (o index.html decide antes de pintar).
// #entrar e #criar-conta abrem o cartão de login; Voltar do navegador volta para a página inicial.
(() => {
  const root = document.documentElement;
  const landing = document.getElementById('landing');
  const MODES = { '#entrar': 'login', '#criar-conta': 'register' };
  let lastTrigger = null;

  const ua = navigator.userAgent;
  const windows = /Windows NT/i.test(ua) && !/Mobile|Xbox/i.test(ua);
  for (const link of landing.querySelectorAll('.ld-download')) link.classList.toggle('hidden', !windows);
  // Sem app para o sistema de quem visita, abrir no navegador vira o botão principal.
  if (!windows) landing.querySelector('.ld-hero .ld-open').classList.replace('ld-btn-dark', 'ld-btn-light');

  function route() {
    const mode = MODES[location.hash];
    const authenticated = !!localStorage.getItem('token');
    const wasLanding = root.classList.contains('show-landing');
    const showLanding = root.dataset.landing === 'on' && !mode && !authenticated;
    root.classList.toggle('show-landing', showLanding);
    if (mode && !authenticated) window.dispatchEvent(new CustomEvent('resenhex:auth-mode', { detail: mode }));
    if (showLanding && !wasLanding) (lastTrigger || landing.querySelector('.ld-brand')).focus({ preventScroll: true });
  }
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  route();

  landing.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    const target = link.getAttribute('href');
    if (target === '#recursos') {
      const reduceMotion = root.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('recursos').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    if (!MODES[target]) return;
    lastTrigger = link;
    // Marca a entrada vinda daqui, para "Voltar ao início" desfazer o passo em vez de empilhar outro.
    history.pushState({ fromLanding: true }, '', target);
    route();
  });

  document.getElementById('login-back').addEventListener('click', (event) => {
    event.preventDefault();
    if (history.state?.fromLanding) return history.back();
    history.replaceState(null, '', location.pathname + location.search);
    route();
  });

  // As seções entram com um leve movimento quando aparecem na tela.
  const reveal = landing.querySelectorAll('.ld-row, .ld-final');
  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in-view'); seen.unobserve(entry.target); }
    }, { root: landing, threshold: 0.15 });
    reveal.forEach((node) => seen.observe(node));
  } else {
    reveal.forEach((node) => node.classList.add('in-view'));
  }
})();
