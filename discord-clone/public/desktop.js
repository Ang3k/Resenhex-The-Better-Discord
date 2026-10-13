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
  let captureAttempt = null;
  // Prepare uma vez ao entrar na chamada e renove quando a pessoa se aproxima do botão.
  // Nenhuma captura de áudio ou transmissão é iniciada aqui.
  if (desktop.prepareShare) {
    const voicePanel = $('#voice-panel');
    let wasInVoice = false, prepareTimer;
    const inVoice = () => voicePanel && !voicePanel.classList.contains('hidden');
    const prepare = () => { if (!open && inVoice() && !$('#btn-share')?.disabled) desktop.prepareShare(); };
    const syncVoice = () => {
      const active = !!inVoice();
      if (active && !wasInVoice) prepareTimer = setTimeout(prepare, 350);
      if (!active) clearTimeout(prepareTimer);
      wasInVoice = active;
    };
    if (voicePanel) {
      new MutationObserver(syncVoice).observe(voicePanel, { attributes: true, attributeFilter: ['class'] });
      syncVoice();
    }
    for (const event of ['pointerover', 'focusin']) document.addEventListener(event, (event) => {
      const button = event.target.closest?.('#btn-share, #sc-screen');
      if (button && !button.disabled && !button.contains(event.relatedTarget)) prepare();
    });
  }
  async function captureAppAudio(stream) {
    const plan = desktop.appAudio?.takePlan();
    if (!plan) return stream;
    if (plan.mode) stream.desktopAudioMode = plan.mode;
    if (!plan.pids?.length) return stream;
    const inputs = [new MediaStream(stream.getAudioTracks())];
    let context, output;
    let released = false;
    const video = stream.getVideoTracks()[0];
    const release = () => {
      if (released) return;
      released = true;
      inputs.forEach(input => input.getTracks().forEach(track => track.stop()));
      output?.stream.getTracks().forEach(track => track.stop());
      video?.removeEventListener('ended', release);
      context?.close().catch(() => {});
    };
    try {
      if (!inputs[0].getAudioTracks().length) throw new Error('O aplicativo escolhido não forneceu áudio.');
      for (const pid of plan.pids) {
        await desktop.appAudio.prepare(plan.token, pid);
        const extra = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 1, max: 1 } },
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } },
        });
        // A captura extra usa a mesma fonte visual já autorizada; só seu áudio é mantido.
        extra.getVideoTracks().forEach(track => track.stop());
        inputs.push(new MediaStream(extra.getAudioTracks()));
        if (!extra.getAudioTracks().length) throw new Error('Um dos aplicativos escolhidos não forneceu áudio.');
      }
      context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
      output = context.createMediaStreamDestination();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = .003;
      limiter.release.value = .12;
      limiter.connect(output);
      for (const input of inputs) context.createMediaStreamSource(input).connect(limiter);
      await context.resume();
      stream.getAudioTracks().forEach(track => stream.removeTrack(track));
      output.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      stream.desktopAudioCleanup = release;
      video?.addEventListener('ended', release, { once: true });
      return stream;
    } catch (error) { release(); throw error; }
    finally { if (plan.token) await desktop.appAudio.release(plan.token).catch(() => {}); }
  }

  // Vincula o cancelamento à captura que abriu o seletor, sem esconder erros de permissão.
  async function captureScreen(capture) {
    const attempt = { cancelled: false };
    captureAttempt = attempt;
    desktop.appAudio?.reset();
    let stream;
    try { stream = await capture(); return await captureAppAudio(stream); }
    catch (error) {
      stream?.desktopAudioCleanup?.();
      stream?.getTracks().forEach(track => track.stop());
      if (!attempt.cancelled) throw error;
      const cancelled = new Error('Seleção de tela cancelada.');
      cancelled.name = 'ShareCancelledError';
      throw cancelled;
    } finally { if (captureAttempt === attempt) captureAttempt = null; }
  }

  function updateSource(sources, options = {}) { open?.update(sources, options); }

  function pickSource(sources, options = {}) {
    open?.cancel();
    return new Promise((resolve) => {
      const attempt = captureAttempt;
      let closed = false;
      let loading = !!options.loading;
      let appsLoading = !!options.appsLoading;
      let screens = sources.filter((source) => source.kind === 'screen');
      let windows = sources.filter((source) => source.kind === 'window');
      let tab = loading || windows.length ? 'window' : 'screen';
      let selected = null;
      let audio = !!options.audio;
      // App novo: dá para escolher o som de um app só (o jogo sem o Discord, por exemplo).
      // 'system' é o PC inteiro; 'none', sem som; senão, o ID do processo do app.
      const validApps = (items) => options.audio && Array.isArray(items) ? items.filter((item) => Number.isInteger(item?.pid) && item.name) : [];
      let apps = validApps(options.apps);
      let audioSource = 'system';
      let audioTouched = false;
      const multiAudio = desktop.appAudio?.supported === true;
      const maxAudioApps = options.maxAudioApps || 8;
      const audioPids = new Set();

      const finish = (choice, userCancelled = true) => {
        if (closed) return;
        closed = true;
        if (!choice && userCancelled && attempt) attempt.cancelled = true;
        if (open === picker) open = null;
        document.removeEventListener('keydown', onKey, true);
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 140);
        resolve(choice);
      };
      const go = () => {
        if (!selected || start.disabled) return;
        if (quality && preset !== quality.current()) quality.set(preset);
        if (audioSource === 'apps') return finish({ id: selected.id, audio: true, apps: [...audioPids] });
        if (!apps.length) return finish({ id: selected.id, audio });
        finish({ id: selected.id, audio: audioSource !== 'none', app: typeof audioSource === 'number' ? audioSource : null });
      };
      const onKey = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); }
        else if (event.key === 'Enter' && selected && !event.target.closest?.('.share-tabs, .share-quality, .share-audio-apps, select')) { event.preventDefault(); event.stopPropagation(); go(); }
      };

      const grid = el('div', { class: 'share-grid', role: 'listbox', ariaLabel: 'Fontes disponíveis' });
      const start = el('button', { type: 'button', class: 'btn-primary', disabled: true, onclick: go }, Icon('screenShare', 18), el('span', { textContent: 'Transmitir' }));
      const tabs = el('div', { class: 'share-tabs', role: 'tablist' });

      function renderTabs() {
        tabs.replaceChildren(...[['window', 'Aplicativos', windows], ['screen', 'Telas', screens]].map(([key, label, list]) =>
          el('button', { type: 'button', role: 'tab', class: tab === key ? 'active' : '', ariaSelected: String(tab === key), disabled: loading || !list.length, onclick: () => { tab = key; render(); } },
            el('span', { textContent: label }), el('span', { class: 'share-count', textContent: loading ? '…' : String(list.length) }))));
      }
      function select(source, card) {
        selected = source;
        // Como no Discord: a janela de um app leva o som daquele app, até a pessoa escolher outro.
        if (apps.length && !audioTouched) setAudioSource(apps.some((item) => item.pid === source.app) ? source.app : 'system');
        updateAudioApps();
        for (const node of grid.children) {
          node.classList.toggle('selected', node === card);
          node.setAttribute('aria-selected', String(node === card));
        }
      }
      function render() {
        renderTabs();
        grid.setAttribute('aria-busy', String(loading));
        if (loading) {
          grid.replaceChildren(el('div', { class: 'share-loading', role: 'status', textContent: 'Buscando aplicativos e telas…' }));
          return;
        }
        const list = tab === 'window' ? windows : screens;
        grid.replaceChildren(...list.map((source) => {
          const card = el('button', {
            type: 'button', class: 'share-source' + (selected === source ? ' selected' : ''), role: 'option', ariaSelected: String(selected === source),
            'data-source-id': source.id,
            title: sourceLabel(source, screens),
            onclick: () => select(source, card),
            ondblclick: () => { select(source, card); go(); },
          },
          el('span', { class: 'share-thumb' }, source.thumbnail
            ? el('img', { class: 'share-preview', src: source.thumbnail, alt: '', draggable: false })
            : el('span', { class: 'share-placeholder', ariaHidden: 'true' }, source.icon
              ? el('img', { class: 'share-placeholder-icon', src: source.icon, alt: '', draggable: false })
              : Icon(source.kind === 'screen' ? 'screen' : 'pip', 40))),
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
      const audioApps = el('div', { class: 'share-audio-apps' });
      function updateAudioApps() {
        const chosen = apps.filter(app => audioPids.has(app.pid));
        const option = [...audioSelect.options].find(item => item.value === 'apps');
        if (option) option.textContent = chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'aplicativo selecionado' : 'aplicativos selecionados'}` : 'Escolher aplicativos…';
        if (audioSource === 'apps') audioHint.textContent = chosen.length ? `Som de ${chosen.map(app => app.name).join(', ')}.` : 'Marque os aplicativos que quer transmitir.';
        for (const input of audioApps.querySelectorAll('input')) {
          input.checked = audioPids.has(Number(input.value));
          input.disabled = !input.checked && audioPids.size >= maxAudioApps;
        }
        // A lista de janelas pode chegar antes do som: preserve a seleção automática do app.
        start.disabled = !selected || audioSource === 'apps' && !audioPids.size ||
          appsLoading && options.audio && selected.kind === 'window' && !audioTouched;
      }
      function setAudioSource(value) {
        const pid = Number(value);
        const item = Number.isInteger(pid) && apps.find((app) => app.pid === pid);
        if (value === 'apps' && multiAudio && !audioPids.size && typeof audioSource === 'number') audioPids.add(audioSource);
        audioSource = value === 'apps' && multiAudio ? 'apps' : item ? item.pid : value === 'none' ? 'none' : 'system';
        audio = audioSource !== 'none';
        audioSelect.value = String(audioSource);
        audioIcon.replaceChildren(item?.icon ? el('img', { src: item.icon, alt: '' }) : Icon(audioSource === 'none' ? 'volumeX' : 'volume', 18));
        audioHint.textContent = item ? `Só o som de ${item.name}. O resto do PC, como o Discord ou uma música, fica de fora.` : audioHints[audioSource];
        audioApps.hidden = audioSource !== 'apps';
        updateAudioApps();
      }
      if (apps.length) setAudioSource('system');

      // Qualidade na mesma janela, como no Go Live. O site registra os perfis em shareQuality.
      const quality = api.shareQuality;
      let preset = quality?.current();
      const qualityHint = el('small');
      const spec = (key, p) => key === 'auto' ? `até ${p.height}p` : `${p.height}p · ${p.fps} fps`;
      const qualityIcons = { auto: 'sparkles', p720: 'signal', p1080: 'scan', p1080_60: 'gamepad' };
      const presetKeys = quality ? Object.keys(quality.presets) : [];
      // Trilho segmentado, como as abas de cima: o destaque desliza até o perfil escolhido.
      const qualityChips = quality ? el('div', { class: 'share-quality', role: 'radiogroup', ariaLabel: 'Qualidade da transmissão', style: `--count: ${presetKeys.length}`, onkeydown: onQualityKey },
        el('span', { class: 'share-quality-thumb', ariaHidden: 'true' }),
        ...presetKeys.map((key) => {
          const p = quality.presets[key];
          return el('button', { type: 'button', role: 'radio', class: 'share-chip', 'data-preset': key, title: p.desc, onclick: () => setPreset(key) },
            el('span', { class: 'share-chip-label' }, Icon(qualityIcons[key] || 'screen', 14), el('strong', { textContent: p.label.split(' · ')[0] })),
            el('span', { class: 'share-chip-spec', textContent: spec(key, p) }));
        })) : null;
      function setPreset(key) {
        if (!quality?.presets[key]) return;
        preset = key;
        qualityChips.style.setProperty('--i', String(presetKeys.indexOf(key)));
        for (const chip of qualityChips.querySelectorAll('.share-chip')) {
          const on = chip.dataset.preset === key;
          chip.classList.toggle('selected', on);
          chip.setAttribute('aria-checked', String(on));
          chip.tabIndex = on ? 0 : -1;
        }
        qualityHint.textContent = quality.presets[key].desc;
      }
      // Setas trocam o perfil, como num grupo de rádio.
      function onQualityKey(event) {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        event.stopPropagation();
        const next = presetKeys[(presetKeys.indexOf(preset) + step + presetKeys.length) % presetKeys.length];
        setPreset(next);
        qualityChips.querySelector(`[data-preset="${next}"]`)?.focus();
      }
      if (quality) setPreset(quality.presets[preset] ? preset : Object.keys(quality.presets)[0]);

      const setting = (title, ...children) => el('div', { class: 'share-setting' }, el('span', { class: 'share-setting-title', textContent: title }), ...children);
      const audioSetting = options.audio ? el('div', { class: 'share-setting' }) : null;
      function renderAudio() {
        if (!audioSetting) return;
        audioSelect.replaceChildren(...[
          el('option', { value: 'system', textContent: 'Som do computador inteiro' }),
          multiAudio && apps.length ? el('option', { value: 'apps', textContent: 'Escolher aplicativos…' }) : null,
          apps.length ? el('optgroup', { label: 'Só o som de um app' }, ...apps.map((item) => el('option', { value: String(item.pid), textContent: item.name }))) : null,
          el('option', { value: 'none', textContent: 'Sem som' })].filter(Boolean));
        for (const pid of audioPids) if (!apps.some(app => app.pid === pid)) audioPids.delete(pid);
        audioApps.replaceChildren(el('div', { class: 'share-audio-app-head' }, el('strong', { textContent: 'Aplicativos' }), el('small', { textContent: `Até ${maxAudioApps}` })),
          el('div', { class: 'share-audio-app-list', role: 'group', ariaLabel: 'Aplicativos para transmitir o som' }, ...apps.map(app =>
            el('label', { class: 'share-audio-app' },
              el('input', { type: 'checkbox', value: String(app.pid), checked: audioPids.has(app.pid), onchange: event => {
                audioTouched = true;
                if (event.target.checked) audioPids.add(app.pid); else audioPids.delete(app.pid);
                updateAudioApps();
              } }),
              app.icon ? el('img', { src: app.icon, alt: '' }) : Icon('pip', 16), el('span', { textContent: app.name })))));
        if (selected && !audioTouched) setAudioSource(apps.some((item) => item.pid === selected.app) ? selected.app : 'system');
        else setAudioSource(audioSource);
        audioSetting.replaceChildren(el('span', { class: 'share-setting-title', textContent: 'Som da transmissão' }),
          ...(apps.length || appsLoading ? [el('div', { class: 'share-audio-row' }, audioIcon, audioSelect), multiAudio ? audioApps : null, audioHint,
            appsLoading ? el('small', { role: 'status', textContent: 'Buscando opções de som dos aplicativos…' }) : null].filter(Boolean)
            : [el('label', { class: 'share-audio switch-row' },
              el('input', { type: 'checkbox', class: 'ds-switch', checked: audio, onchange: (event) => { audioTouched = true; setAudioSource(event.target.checked ? 'system' : 'none'); } }),
              el('span', {}, el('strong', { textContent: 'Som do computador' }), el('small', { textContent: 'Seus amigos ouvem o que toca no PC. A voz da chamada fica de fora.' })))]));
      }
      renderAudio();
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

      const picker = {
        cancel: () => finish(null),
        update: (list, next) => {
          if (closed) return;
          if (next.closed) return finish(null, false);
          if (Array.isArray(list)) {
            screens = list.filter((source) => source.kind === 'screen');
            windows = list.filter((source) => source.kind === 'window');
            selected = selected && list.find((source) => source.id === selected.id) || null;
          }
          if ('loading' in next) loading = !!next.loading;
          if ('appsLoading' in next) appsLoading = !!next.appsLoading;
          if ('apps' in next) apps = validApps(next.apps);
          if (!loading && !(tab === 'window' ? windows : screens).length) tab = windows.length ? 'window' : 'screen';
          const focusedSource = document.activeElement?.closest('.share-source')?.dataset.sourceId;
          const focusedTab = [...tabs.children].indexOf(document.activeElement);
          const focusedAudio = document.activeElement === audioSelect;
          const focusedApp = document.activeElement?.closest('.share-audio-apps') ? document.activeElement.value : null;
          const scroll = grid.scrollTop;
          start.disabled = !selected;
          render();
          renderAudio();
          grid.scrollTop = scroll;
          if (focusedSource) [...grid.children].find((node) => node.dataset.sourceId === focusedSource)?.focus();
          else if (focusedTab >= 0) tabs.children[focusedTab]?.focus();
          else if (focusedAudio) audioSelect.focus();
          else if (focusedApp) [...audioApps.querySelectorAll('input')].find(input => input.value === focusedApp)?.focus();
        },
      };
      open = picker;
      render();
      document.body.append(overlay);
      document.addEventListener('keydown', onKey, true);
      overlay.querySelector('.share-picker').focus();
    });
  }
  desktop.onPickSource(pickSource, updateSource);

  // shareQuality: { presets, current(), set(key) }, registrado pelo app.js.
  const api = { available: true, pickSource, captureScreen, shareQuality: null };
  return api;
})();
