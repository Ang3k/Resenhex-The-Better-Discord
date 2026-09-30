// Página /baixar: mostra a versão publicada do app de desktop e se adapta ao sistema de quem visita.
(() => {
  for (const node of document.querySelectorAll('[data-icon]')) node.prepend(Icon(node.dataset.icon, Number(node.dataset.size) || 20));
  for (const node of document.querySelectorAll('[data-logo]')) node.append(Icon.logo(Number(node.dataset.logo)));

  const button = document.getElementById('dl-button');
  if (!button) return; // página de privacidade: só precisa dos ícones
  const meta = document.getElementById('dl-meta');
  const platform = navigator.userAgentData?.platform || navigator.userAgent;
  const isWindows = /win/i.test(platform) && !/android|iphone|ipad/i.test(navigator.userAgent);
  if (!isWindows) document.getElementById('dl-other-os').classList.remove('hidden');
  if (window.resenhexDesktop) {
    button.classList.add('disabled');
    button.removeAttribute('href');
    button.lastElementChild.textContent = 'Você já está usando o app';
  }

  const megabytes = (bytes) => (bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' MB';
  // Com o app na Microsoft Store, o botão principal baixa o instalador da Microsoft (sem aviso do
  // Windows) e o .exe fica como alternativa.
  const useStore = (store, directUrl) => {
    for (const step of document.querySelectorAll('[data-mode]')) step.hidden = step.dataset.mode !== 'store';
    if (window.resenhexDesktop) return;
    button.href = store.installer;
    button.removeAttribute('download');
    meta.textContent = 'Grátis · pela Microsoft Store · Windows 10 e 11';
    const direct = document.getElementById('dl-direct');
    if (directUrl) { direct.href = directUrl; direct.classList.remove('hidden'); }
  };

  fetch('/download/info', { cache: 'no-cache' })
    .then((res) => res.ok ? res.json() : null)
    .then((info) => {
      if (info?.store) return useStore(info.store, info.available ? info.url : null);
      if (!info?.available) {
        button.classList.add('disabled');
        button.removeAttribute('href');
        document.getElementById('dl-soon').classList.remove('hidden');
        return;
      }
      if (!window.resenhexDesktop) button.href = info.url;
      meta.textContent = `Versão ${info.version} · ${megabytes(info.size)} · Windows 10 e 11 (64 bits)`;
    })
    .catch(() => {});
})();
