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
      // App novo: dá para escolher o som de um app só (o jogo sem o Discord, por exemplo).
      // 'system' é o PC inteiro; 'none', sem som; senão, o ID do processo do app.
      const apps = audio && Array.isArray(options.apps) ? options.apps.filter((item) => Number.isInteger(item?.pid) && item.name) : [];
      let audioSource = 'system';
      let audioTouched = false;

      const finish = (choice) => {
        if (!open) return;
        open = null;
        document.removeEventListener('keydown', onKey, true);
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 140);
        resolve(choice);
      };
      const go = () => {
        if (!selected) return;
        if (quality && preset !== quality.current()) quality.set(preset);
        if (!apps.length) return finish({ id: selected.id, audio });
        finish({ id: selected.id, audio: audioSource !== 'none', app: typeof audioSource === 'number' ? audioSource : null });
      };
      const onKey = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); }
        else if (event.key === 'Enter' && selected && !event.target.closest?.('.share-tabs, .share-quality, select')) { event.preventDefault(); event.stopPropagation(); go(); }
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
        // Como no Discord: a janela de um app leva o som daquele app, até a pessoa escolher outro.
        if (apps.length && !audioTouched) setAudioSource(apps.some((item) => item.pid === source.app) ? source.app : 'system');
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

      const audioHints = {
        system: 'Seus amigos ouvem tudo que toca no PC. A voz da chamada fica de fora.',
        none: 'A transmissão vai sem som.',
      };
      const audioSelect = el('select', { class: 'share-audio-select', ariaLabel: 'Som da transmissão', onchange: (event) => { audioTouched = true; setAudioSource(event.target.value); } },
        el('option', { value: 'system', textContent: 'Som do computador inteiro' }),
        apps.length ? el('optgroup', { label: 'Só o som de um app' }, ...apps.map((item) => el('option', { value: String(item.pid), textContent: item.name }))) : null,
        el('option', { value: 'none', textContent: 'Sem som' }));
      const audioIcon = el('span', { class: 'share-audio-icon' });
      const audioHint = el('small');
      function setAudioSource(value) {
        const pid = Number(value);
        const item = Number.isInteger(pid) && apps.find((app) => app.pid === pid);
        audioSource = item ? item.pid : value === 'none' ? 'none' : 'system';
        audioSelect.value = String(audioSource);
        audioIcon.replaceChildren(item?.icon ? el('img', { src: item.icon, alt: '' }) : Icon(audioSource === 'none' ? 'volumeX' : 'volume', 18));
        audioHint.textContent = item ? `Só o som de ${item.name}. O resto do PC, como o Discord ou uma música, fica de fora.` : audioHints[audioSource];
      }
      if (apps.length) setAudioSource('system');

      // Qualidade na mesma janela, como no Go Live. O site registra os perfis em shareQuality.
      const quality = api.shareQuality;
      let preset = quality?.current();
      const qualityHint = el('small');
      const spec = (key, p) => key === 'auto' ? `até ${p.height}p` : `${p.height}p${p.fps}`;
      const qualityChips = quality ? el('div', { class: 'share-quality', role: 'radiogroup', ariaLabel: 'Qualidade da transmissão' },
        ...Object.entries(quality.presets).map(([key, p]) => el('button', { type: 'button', role: 'radio', class: 'share-chip', 'data-preset': key, onclick: () => setPreset(key) },
          el('strong', { textContent: p.label.split(' · ')[0] }), el('span', { textContent: spec(key, p) })))) : null;
      function setPreset(key) {
        if (!quality?.presets[key]) return;
        preset = key;
        for (const chip of qualityChips.children) {
          chip.classList.toggle('selected', chip.dataset.preset === key);
          chip.setAttribute('aria-checked', String(chip.dataset.preset === key));
        }
        qualityHint.textContent = quality.presets[key].desc;
      }
      if (quality) setPreset(quality.presets[preset] ? preset : Object.keys(quality.presets)[0]);

      const setting = (title, ...children) => el('div', { class: 'share-setting' }, el('span', { class: 'share-setting-title', textContent: title }), ...children);
      const audioSetting = apps.length
        ? setting('Som da transmissão', el('div', { class: 'share-audio-row' }, audioIcon, audioSelect), audioHint)
        : options.audio ? setting('Som', el('label', { class: 'share-audio switch-row' },
          el('input', { type: 'checkbox', class: 'ds-switch', checked: audio, onchange: (event) => { audio = event.target.checked; } }),
          el('span', {}, el('strong', { textContent: 'Som do computador' }), el('small', { textContent: 'Seus amigos ouvem o que toca no PC. A voz da chamada fica de fora.' })))) : null;
      const settings = [quality ? setting('Qualidade', qualityChips, qualityHint) : null, audioSetting].filter(Boolean);

      const overlay = el('div', { class: 'confirm-overlay share-overlay', onmousedown: (event) => event.target === overlay && finish(null) },
        el('div', { class: 'confirm-card share-picker', role: 'dialog', ariaModal: 'true', ariaLabel: 'Escolher o que transmitir', tabIndex: -1 },
          el('div', { class: 'share-head' },
            el('div', {}, el('h2', { textContent: 'Compartilhar tela' }), el('p', { textContent: 'Escolha um aplicativo ou uma tela inteira para transmitir na chamada.' })),
            el('button', { type: 'button', class: 'share-close', ariaLabel: 'Fechar', onclick: () => finish(null) }, Icon('x', 20))),
          tabs,
          grid,
          settings.length ? el('div', { class: 'share-settings' }, ...settings) : null,
          el('div', { class: 'share-foot' },
            el('small', { class: 'share-tip', textContent: 'Jogo em tela cheia? Use o modo janela sem bordas ou escolha a tela inteira. Minimizar a janela pausa a transmissão.' }),
            el('div', { class: 'confirm-actions' }, el('button', { type: 'button', class: 'btn-ghost', textContent: 'Cancelar', onclick: () => finish(null) }), start))));

      open = { cancel: () => finish(null) };
      render();
      document.body.append(overlay);
      document.addEventListener('keydown', onKey, true);
      overlay.querySelector('.share-picker').focus();
    });
  }
  desktop.onPickSource(pickSource);

  // shareQuality: { presets, current(), set(key) }, registrado pelo app.js.
  const api = { available: true, pickSource, shareQuality: null };
  return api;
})();
