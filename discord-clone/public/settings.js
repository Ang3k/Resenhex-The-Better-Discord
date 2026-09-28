/* Settings shell: draft values, accessible navigation and explicit save/discard. */
window.SettingsPanel = function ({ read, apply, preview, onOpen, onClose }) {
  const root = document.querySelector('#settings');
  const fields = [...root.querySelectorAll('[data-setting]')];
  const nav = [...root.querySelectorAll('[data-section]')];
  let initial = null;
  let saving = false;
  let processing = false;
  let returnFocus = null;
  let active = 'profile';
  const values = () => Object.fromEntries(fields.map((field) => [field.dataset.setting,
    field.type === 'checkbox' ? field.checked : field.dataset.number !== undefined ? Number(field.value) : field.value]));
  const dirty = () => initial && JSON.stringify(values()) !== JSON.stringify(initial);
  const write = (data) => {
    for (const field of fields) {
      if (field.type === 'checkbox') field.checked = !!data[field.dataset.setting];
      else {
        const value = data[field.dataset.setting] ?? '';
        if (field.tagName === 'SELECT' && value && ![...field.options].some((option) => option.value === String(value))) field.add(new Option('Dispositivo salvo', value));
        field.value = value;
      }
    }
  };
  const status = (text) => { root.querySelector('#settings-status').textContent = text; };
  function refresh() {
    root.querySelector('#settings-savebar').classList.toggle('hidden', !dirty() && !saving);
    root.querySelector('#settings-save').disabled = saving || processing;
    root.querySelector('#settings-discard').disabled = saving || processing;
    root.querySelectorAll('[data-draft-action]').forEach((button) => { button.disabled = saving || processing; });
    root.querySelector('#sens-range').disabled = saving || root.querySelector('#sens-auto').checked;
    root.querySelector('#ptt-row').classList.toggle('hidden', root.querySelector('#input-mode').value !== 'ptt');
    for (const output of root.querySelectorAll('[data-output]')) {
      const field = root.querySelector('#' + output.dataset.output);
      output.textContent = field.value + (output.dataset.suffix || '');
    }
    root.querySelector('#profile-preview-avatar').style.background = root.querySelector('#profile-color').value;
    root.querySelector('.profile-preview').style.setProperty('--pc-color', root.querySelector('#profile-color').value);
    preview(values());
  }
  function select(section, focus = false) {
    if (!nav.some((button) => button.dataset.section === section)) section = 'profile';
    active = section;
    nav.forEach((button) => {
      button.classList.toggle('active', button.dataset.section === section);
      button.setAttribute('aria-selected', String(button.dataset.section === section));
      button.tabIndex = button.dataset.section === section ? 0 : -1;
    });
    root.querySelectorAll('[data-settings-page]').forEach((page) => page.classList.toggle('hidden', page.dataset.settingsPage !== section));
    root.querySelector('#settings-content').scrollTop = 0;
    if (focus) nav.find((button) => button.dataset.section === section).focus();
  }
  nav.forEach((button, i) => {
    button.onclick = () => select(button.dataset.section);
    button.onkeydown = (event) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(event.key in keys)) return;
      event.preventDefault();
      const visible = nav.filter((b) => !b.hidden);
      const index = visible.indexOf(button);
      select(visible[(index + keys[event.key] + visible.length) % visible.length].dataset.section, true);
    };
  });
  root.querySelector('#settings-search').oninput = (event) => {
    const query = event.target.value.toLocaleLowerCase('pt-BR').trim();
    nav.forEach((button) => { button.hidden = !((button.textContent + ' ' + button.dataset.keywords).toLocaleLowerCase('pt-BR').includes(query)); });
    root.querySelector('#settings-search-empty').classList.toggle('hidden', nav.some((b) => !b.hidden));
  };
  root.addEventListener('input', () => { if (!saving) { status(''); refresh(); } });
  root.addEventListener('change', () => { if (!saving) refresh(); });
  root.querySelector('#settings-discard').onclick = () => {
    if (saving || processing) return;
    write(initial);
    onClose(); // also releases test microphone/camera when discarding
    refresh();
    status('Alterações descartadas.');
  };
  root.querySelector('#settings-save').onclick = async () => {
    if (saving || processing || !dirty()) return;
    saving = true;
    const draft = values();
    fields.forEach((field) => { field.dataset.wasDisabled = String(field.disabled); field.disabled = true; });
    status('Salvando suas preferências…');
    refresh();
    try {
      await apply(draft);
      initial = values();
      status('Preferências salvas.');
    } catch (error) {
      status(error.message || 'Não foi possível salvar. Tente novamente.');
    } finally {
      saving = false;
      fields.forEach((field) => { field.disabled = field.dataset.wasDisabled === 'true'; });
      refresh();
    }
  };
  function close() {
    if (saving) { status('Aguarde o salvamento terminar.'); return false; }
    if (dirty()) {
      status('Você tem alterações pendentes. Salve ou descarte antes de fechar.');
      root.querySelector('#settings-savebar').classList.remove('hidden');
      root.querySelector('#settings-discard').focus();
      return false;
    }
    onClose();
    root.classList.add('hidden');
    document.querySelector('#app').inert = false;
    returnFocus?.focus();
    return true;
  }
  root.querySelector('#settings-close').onclick = close;
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...root.querySelectorAll('button, input, select, a[href], [tabindex="0"]')].filter((node) => !node.disabled && node.getClientRects().length && node.tabIndex !== -1);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  return {
    async open(section = active) {
      if (!root.classList.contains('hidden')) { select(section); return; }
      returnFocus = document.activeElement;
      root.classList.remove('hidden');
      document.querySelector('#app').inert = true;
      root.querySelector('#settings-search').value = '';
      nav.forEach((button) => { button.hidden = false; });
      root.querySelector('#settings-search-empty').classList.add('hidden');
      status('');
      write(read());
      initial = values();
      select(section);
      refresh();
      root.querySelector('#settings-close').focus();
      await onOpen();
      // Device choices are inserted asynchronously. Preserve edits made meanwhile.
      if (!root.classList.contains('hidden')) refresh();
    },
    close,
    refresh,
    values,
    setProcessing(value) { processing = value; refresh(); },
    isOpen: () => !root.classList.contains('hidden'),
  };
};
