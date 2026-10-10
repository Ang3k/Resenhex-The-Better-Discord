// Página /baixar: mostra a versão publicada do app de desktop e se adapta ao sistema de quem visita.
(() => {
  for (const node of document.querySelectorAll('[data-icon]')) node.prepend(Icon(node.dataset.icon, Number(node.dataset.size) || 20));
  for (const node of document.querySelectorAll('[data-logo]')) node.append(Icon.logo(Number(node.dataset.logo)));

  const button = document.getElementById('dl-button');
  if (!button) return; // página de privacidade: só precisa dos ícones
  const meta = document.getElementById('dl-meta');
  const platform = navigator.userAgentData?.platform || navigator.userAgent;
  const isWindows = /win/i.test(platform) && !/android|iphone|ipad/i.test(navigator.userAgent);
  const isAndroid = document.documentElement.dataset.os === 'android';
  if (!isWindows && !isAndroid) document.getElementById('dl-other-os').classList.remove('hidden');
  const disable = (link) => {
    link.classList.add('disabled');
    link.removeAttribute('href');
    link.lastElementChild.textContent = 'Você já está usando o app';
  };
  if (window.resenhexDesktop) disable(button);
  const inAndroidApp = !!window.ResenhexAndroid || matchMedia('(display-mode: standalone)').matches;

  const megabytes = (bytes) => (bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' MB';
  // O app de Android abre o site em tela cheia (modo standalone); lá dentro não faz sentido baixar de novo.
  const showAndroid = (android) => {
    const androidButton = document.getElementById('dl-android');
    if (!android) {
      androidButton.classList.add('disabled');
      androidButton.removeAttribute('href');
      if (isAndroid) document.getElementById('dl-android-soon').classList.remove('hidden');
      return;
    }
    androidButton.href = android.url;
    document.getElementById('dl-android-meta').textContent = `Versão ${android.version} · ${megabytes(android.size)} · Android 7 ou mais novo`;
    if (inAndroidApp) disable(androidButton);
    if (!window.resenhexDesktop) {
      const link = document.getElementById('dl-android-link');
      link.href = android.url;
      link.classList.remove('hidden');
    }
  };
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
      showAndroid(info?.android);
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
