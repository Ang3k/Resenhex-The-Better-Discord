// Integração com o app de desktop do Resenhex (pasta desktop/ do projeto).
// No navegador, só mostra o botão "Baixar o app" para quem usa Windows. Dentro do app,
// sincroniza as cores da barra de título e mostra a janela de escolha da tela a transmitir.
// Fica no site para que a escolha de tela seja atualizada junto com cada deploy.
window.DesktopApp = (() => {
  const desktop = window.resenhexDesktop;
  const $ = (selector) => document.querySelector(selector);

  if (!desktop) {
    const ua = navigator.userAgent;
    const windows = /Windows NT/i.test(ua) && !/Mobile|Xbox/i.test(ua);
    if (windows) $('#btn-download-app')?.classList.remove('hidden');
    return { available: false };
  }

  document.documentElement.classList.add('desktop-app');

  // ---------------- cores da barra de título ----------------
  const probe = document.createElement('span');
  probe.hidden = true;
  document.body.append(probe);
  const hex = (variable) => {
    probe.style.color = `var(${variable})`;
    const [r, g, b] = (getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) || []).map(Number);
    return [r, g, b].every(Number.isFinite) ? '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('') : null;
  };
  let lastTheme = '';
  function syncTheme() {
    const colors = { background: hex('--bg-rail'), foreground: hex('--interactive') };
    const key = colors.background + colors.foreground;
    if (!colors.background || !colors.foreground || key === lastTheme) return;
    lastTheme = key;
    desktop.setTheme(colors);
  }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });

  // ---------------- escolha da tela ----------------
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.filter(Boolean));
    return node;
  };

  function sourceLabel(source, screens) {
    if (source.kind === 'window') return source.name;
    if (screens.length === 1) return 'Tela inteira';
    return `Tela ${screens.indexOf(source) + 1}`;
  }

  let open = null;
  function pickSource(sources, options = {}) {
    open?.cancel();
    return new Promise((resolve) => {
      const screens = sources.filter((source) => source.kind === 'screen');
      const windows = sources.filter((source) => source.kind === 'window');
      let tab = windows.length ? 'window' : 'screen';
      let selected = null;
      let audio = !!options.audio;

      const finish = (choice) => {
        if (!open) return;
        open = null;
        document.removeEventListener('keydown', onKey, true);
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 140);
        resolve(choice);
      };
      const go = () => selected && finish({ id: selected.id, audio });
      const onKey = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); }
        else if (event.key === 'Enter' && selected && !event.target.closest?.('.share-tabs')) { event.preventDefault(); event.stopPropagation(); go(); }
      };

      const grid = el('div', { class: 'share-grid', role: 'listbox', ariaLabel: 'Fontes disponíveis' });
      const start = el('button', { type: 'button', class: 'btn-primary', disabled: true, onclick: go }, Icon('screenShare', 18), el('span', { textContent: 'Transmitir' }));
      const tabs = el('div', { class: 'share-tabs', role: 'tablist' });

      function renderTabs() {
        tabs.replaceChildren(...[['window', 'Aplicativos', windows], ['screen', 'Telas', screens]].map(([key, label, list]) =>
          el('button', { type: 'button', role: 'tab', class: tab === key ? 'active' : '', ariaSelected: String(tab === key), disabled: !list.length, onclick: () => { tab = key; render(); } },
            el('span', { textContent: label }), el('span', { class: 'share-count', textContent: String(list.length) }))));
      }
      function select(source, card) {
        selected = source;
        start.disabled = false;
        for (const node of grid.children) {
          node.classList.toggle('selected', node === card);
          node.setAttribute('aria-selected', String(node === card));
        }
      }
      function render() {
        renderTabs();
        const list = tab === 'window' ? windows : screens;
        grid.replaceChildren(...list.map((source) => {
          const card = el('button', {
            type: 'button', class: 'share-source' + (selected === source ? ' selected' : ''), role: 'option', ariaSelected: String(selected === source),
            title: sourceLabel(source, screens),
            onclick: () => select(source, card),
            ondblclick: () => { selected = source; go(); },
          },
          el('span', { class: 'share-thumb' }, source.thumbnail ? el('img', { src: source.thumbnail, alt: '', draggable: false }) : Icon(source.kind === 'screen' ? 'screen' : 'pip', 28)),
          el('span', { class: 'share-name' },
            source.icon ? el('img', { class: 'share-app-icon', src: source.icon, alt: '' }) : Icon(source.kind === 'screen' ? 'screen' : 'pip', 16),
            el('span', { textContent: sourceLabel(source, screens) })));
          return card;
        }));
      }

      const audioToggle = options.audio ? el('label', { class: 'share-audio switch-row' },
        el('input', { type: 'checkbox', class: 'ds-switch', checked: audio, onchange: (event) => { audio = event.target.checked; } }),
        el('span', {}, el('strong', { textContent: 'Som do computador' }), el('small', { textContent: 'Seus amigos ouvem o que toca no PC. A voz da chamada fica de fora.' }))) : null;

      const overlay = el('div', { class: 'confirm-overlay share-overlay', onmousedown: (event) => event.target === overlay && finish(null) },
        el('div', { class: 'confirm-card share-picker', role: 'dialog', ariaModal: 'true', ariaLabel: 'Escolher o que transmitir', tabIndex: -1 },
          el('div', { class: 'share-head' },
            el('div', {}, el('h2', { textContent: 'Compartilhar tela' }), el('p', { textContent: 'Escolha um aplicativo ou uma tela inteira para transmitir na chamada.' })),
            el('button', { type: 'button', class: 'share-close', ariaLabel: 'Fechar', onclick: () => finish(null) }, Icon('x', 20))),
          tabs,
          grid,
          el('div', { class: 'share-foot' }, audioToggle || el('span'),
            el('div', { class: 'confirm-actions' }, el('button', { type: 'button', class: 'btn-ghost', textContent: 'Cancelar', onclick: () => finish(null) }), start))));

      open = { cancel: () => finish(null) };
      render();
      document.body.append(overlay);
      document.addEventListener('keydown', onKey, true);
      overlay.querySelector('.share-picker').focus();
    });
  }
  desktop.onPickSource(pickSource);

  return { available: true, pickSource };
})();
