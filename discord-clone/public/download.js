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
  // Os passos de instalação seguem o que a pessoa escolheu: instalador da Microsoft Store ou .exe direto.
  const showSteps = (mode) => {
    for (const step of document.querySelectorAll('[data-mode]')) step.hidden = step.dataset.mode !== mode;
  };

  // Dois botões: o .exe direto e a Microsoft Store (instalador da Microsoft, sem aviso do Windows).
  // Antes do .exe, uma janela avisa da tela "O Windows protegeu o computador" e oferece a Store.
  const storeButton = document.getElementById('dl-store');
  const dialog = document.getElementById('dl-exe-dialog');
  const confirm = document.getElementById('dl-exe-confirm');
  const dialogStore = document.getElementById('dl-exe-store');
  let warnBeforeExe = false;
  button.addEventListener('click', (event) => {
    if (!warnBeforeExe || !dialog.showModal) return showSteps('direct');
    event.preventDefault();
    dialog.showModal();
  });
  storeButton.addEventListener('click', () => showSteps('store'));
  confirm.addEventListener('click', () => { showSteps('direct'); dialog.close(); });
  dialogStore.addEventListener('click', () => { showSteps('store'); dialog.close(); });
  dialog.querySelector('.dl-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }); // clique fora da janela

  const useStore = (store) => {
    showSteps('store');
    storeButton.href = dialogStore.href = store.installer;
    storeButton.classList.remove('hidden');
  };

  fetch('/download/info', { cache: 'no-cache' })
    .then((res) => res.ok ? res.json() : null)
    .then((info) => {
      showAndroid(info?.android);
      if (window.resenhexDesktop) return;
      const windowsMeta = 'Windows 10 e 11 (64 bits)';
      if (info?.store) useStore(info.store);
      if (!info?.available) {
        if (info?.store) { button.classList.add('hidden'); meta.textContent = `Grátis · ${windowsMeta}`; return; }
        button.classList.add('disabled');
        button.removeAttribute('href');
        document.getElementById('dl-soon').classList.remove('hidden');
        return;
      }
      button.href = confirm.href = info.url;
      warnBeforeExe = !!info.store;
      meta.textContent = `Versão ${info.version} · ${megabytes(info.size)} · ${windowsMeta}`;
    })
    .catch(() => {});
})();
