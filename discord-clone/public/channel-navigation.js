// Grupos, ordenação e ações dos canais. Reutiliza os fluxos de chat e voz do app.
window.ChannelNavigation = function ({ state, el, Icon, call, toast, hasPerm, refresh, open, voiceUsers,
  createChannel, editChannel, deleteChannel, markRead, guard, confirm, menu, action, invite }) {
  let dragged = null;
  let cancelDrag = null;
  const dropTargets = new WeakMap();
  let collapsedAccount = null;
  const canManage = () => hasPerm('MANAGE_CHANNELS');
  const channels = (categoryId) => state.server.channels.filter((c) => c.categoryId === categoryId);
  const groups = () => [...(state.server.categories || []), { id: null, name: 'Sem grupo' }];
  const key = (g) => g.id ?? 'ungrouped';
  const button = (label, icon, onclick, disabled = false) => el('button', {
    type: 'button', class: 'group-action', ariaLabel: label, tip: label, disabled,
    onclick: (event) => { event.stopPropagation(); onclick(event); },
  }, Icon(icon, 16));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dragged) { event.preventDefault(); event.stopImmediatePropagation(); cancelDrag?.(); }
  }, true);
  window.addEventListener('blur', () => cancelDrag?.());

  function restoreFocus(root, focusKey) {
    if (focusKey) [...root.querySelectorAll('[data-focus-key]')].find((n) => n.dataset.focusKey === focusKey)?.focus();
  }

  function categorySelect(value, onChange) {
    const select = el('select', { ariaLabel: 'Grupo de canais', onchange: (e) => onChange?.(e.target.value || null) },
      groups().map((g) => el('option', { value: g.id || '', textContent: g.name })));
    select.value = value || '';
    return select;
  }

  function toggleGroup(group) {
    const id = key(group);
    state.collapsed.has(id) ? state.collapsed.delete(id) : state.collapsed.add(id);
    try { localStorage.setItem('collapsed:' + state.me.accountId + ':' + state.server.serverId, JSON.stringify([...state.collapsed])); } catch {}
    refresh();
  }

  // Diálogos nativos contêm foco, funcionam com teclado/toque e mantêm dados em caso de erro.
  function formDialog({ title, label, value = '', groupId, submitLabel = 'Salvar', help, submit }) {
    if (!guard()) return;
    const previous = document.activeElement;
    const input = label ? el('input', { value, required: true, maxLength: 64, autocomplete: 'off', ariaLabel: label }) : null;
    const select = groupId !== undefined ? categorySelect(groupId) : null;
    const save = el('button', { type: 'submit', class: 'btn-primary', textContent: submitLabel });
    const dialog = el('dialog', { class: 'channel-dialog', ariaLabel: title });
    let busy = false;
    const close = () => { if (!busy) dialog.close(); };
    const form = el('form', { onsubmit: async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      save.disabled = true;
      try {
        if (await submit({ name: input?.value, categoryId: select?.value || null })) dialog.close();
      } finally { busy = false; save.disabled = false; }
    } }, el('h2', { textContent: title }),
    help ? el('p', { class: 'muted-text', textContent: help }) : null,
    input ? el('label', {}, label, input) : null,
    select ? el('label', {}, 'Grupo de canais', select) : null,
    el('div', { class: 'confirm-actions' }, el('button', { type: 'button', class: 'btn-ghost', textContent: 'Cancelar', onclick: close }), save));
    dialog.append(form);
    dialog.addEventListener('cancel', (event) => { event.stopPropagation(); if (busy) event.preventDefault(); });
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') event.stopPropagation(); });
    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (previous?.isConnected && previous.getClientRects().length) previous.focus();
      else document.querySelector('#server-header')?.focus();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    (input || select || save).focus();
    input?.select();
  }

  function editGroup(group = null) {
    formDialog({ title: group ? 'Editar grupo' : 'Criar grupo de canais', label: 'Nome do grupo', value: group?.name || '',
      submitLabel: group ? 'Salvar' : 'Criar grupo',
      submit: ({ name }) => call('category', { action: group ? 'update' : 'create', id: group?.id, name }) });
  }

  async function removeGroup(group) {
    if (!guard()) return;
    if (await confirm({ title: `Excluir o grupo ${group.name}?`, text: 'Os canais irão para “Sem grupo”. Mensagens, arquivos, permissões e chamadas serão mantidos.', confirm: 'Excluir grupo' })) {
      if (await call('category', { action: 'delete', id: group.id })) toast('Grupo excluído; canais preservados.', 'info');
    }
  }

  function duplicateChannel(channel) {
    formDialog({ title: 'Duplicar canal', label: 'Nome do novo canal', value: channel.name.slice(0, 58) + '-cópia',
      groupId: channel.categoryId, submitLabel: 'Duplicar', help: 'Copia tipo, descrição e permissões. Mensagens, arquivos e participantes não são copiados.',
      submit: ({ name, categoryId }) => call('channel', { action: 'duplicate', id: channel.id, name, categoryId }) });
  }

  function moveChannel(channel) {
    formDialog({ title: `Mover ${channel.name}`, groupId: channel.categoryId, submitLabel: 'Mover canal',
      help: 'O canal mantém as mensagens, a chamada e suas permissões.',
      submit: ({ categoryId }) => call('channel', { action: 'move', id: channel.id, categoryId }) });
  }

  async function reorder(item, kind, direction) {
    if (!guard()) return;
    const list = kind === 'category' ? state.server.categories : channels(item.categoryId);
    const index = list.findIndex((c) => c.id === item.id);
    if (index < 0 || index + direction < 0 || index + direction >= list.length) return;
    const beforeId = direction < 0 ? list[index - 1].id : list[index + 2]?.id || null;
    if (await call(kind, { action: 'move', id: item.id, beforeId, ...(kind === 'channel' ? { categoryId: item.categoryId } : {}) })) {
      toast('Ordem atualizada.', 'info');
    }
  }

  function groupMenu(group, event) {
    event.preventDefault(); event.stopPropagation();
    const items = [action(state.collapsed.has(key(group)) ? 'Expandir grupo' : 'Recolher grupo', 'chevronDown', () => toggleGroup(group))];
    if (canManage()) {
      items.push(action('Criar canal de texto', 'hash', () => createChannel('text', group.id)),
        action('Criar canal de voz', 'volume', () => createChannel('voice', group.id)));
      if (group.id) {
        const index = state.server.categories.findIndex((g) => g.id === group.id);
        items.push(action('Editar grupo', 'pencil', () => editGroup(group)));
        if (index > 0) items.push(action('Mover grupo para cima', 'chevronDown', () => reorder(group, 'category', -1)));
        if (index < state.server.categories.length - 1) items.push(action('Mover grupo para baixo', 'chevronDown', () => reorder(group, 'category', 1)));
        items.push(action('Excluir grupo', 'trash', () => removeGroup(group), 'danger'));
      }
    }
    menu(event, items);
  }

  function channelMenu(channel, event) {
    event.preventDefault(); event.stopPropagation();
    const items = [];
    if (channel.type === 'text') items.push(action('Marcar como lido', 'check', () => markRead(channel.id)));
    if (canManage()) {
      const list = channels(channel.categoryId);
      const index = list.findIndex((c) => c.id === channel.id);
      items.push(action('Editar canal', 'settings', () => editChannel(channel.id)),
        action('Duplicar canal', 'plusCircle', () => duplicateChannel(channel)),
        action('Mover para outro grupo', 'hash', () => moveChannel(channel)));
      if (index > 0) items.push(action('Mover canal para cima', 'chevronDown', () => reorder(channel, 'channel', -1)));
      if (index < list.length - 1) items.push(action('Mover canal para baixo', 'chevronDown', () => reorder(channel, 'channel', 1)));
      items.push(action('Excluir canal', 'trash', () => deleteChannel(channel), 'danger'));
    }
    if (items.length) menu(event, items);
  }

  // Clique direito no vazio da lista de canais, como no Discord.
  function listMenu(event) {
    event.preventDefault(); event.stopPropagation();
    const items = [];
    if (canManage()) items.push(action('Criar canal', 'plusCircle', () => createChannel('text')),
      action('Criar grupo de canais', 'hash', () => editGroup()), el('div', { class: 'menu-sep' }));
    items.push(action('Convidar para o servidor', 'userPlus', invite, 'accent'));
    menu(event, items);
  }

  function touchMenu(node, show) {
    let timer = null;
    let start = null;
    let blockClickUntil = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    node.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' || event.target.closest('.group-action')) return;
      cancel();
      start = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        if (!node.isConnected) return;
        blockClickUntil = Date.now() + 1000;
        show({ type: 'contextmenu', currentTarget: node, clientX: start.x, clientY: start.y,
          preventDefault() {}, stopPropagation() {} });
      }, 550);
    });
    node.addEventListener('pointermove', (event) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
    });
    for (const event of ['pointerup', 'pointercancel', 'pointerleave']) node.addEventListener(event, cancel);
    node.addEventListener('click', (event) => {
      if (Date.now() < blockClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  }

  function dragSource(node, kind, id) {
    if (!canManage()) return;
    let start = null;
    let target = null;
    let blockClickUntil = 0;
    const finish = () => {
      start = null;
      target?.node.classList.remove('channel-drop-target');
      target = null;
      node.classList.remove('channel-dragging');
      dragged = null;
      cancelDrag = null;
      refresh();
    };
    node.addEventListener('pointerdown', (event) => {
      // No toque, o menu prolongado e subir/descer evitam conflitos com a rolagem.
      if (event.pointerType !== 'mouse' || event.button !== 0 || !canManage()) return;
      start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener('pointermove', (event) => {
      if (!start || event.pointerId !== start.pointerId) return;
      if (!dragged) {
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
        if (!guard()) { start = null; return; }
        dragged = { kind, id };
        cancelDrag = finish;
        node.classList.add('channel-dragging');
      }
      event.preventDefault();
      target?.node.classList.remove('channel-drop-target');
      target = null;
      let hit = document.elementFromPoint(event.clientX, event.clientY);
      while (hit) {
        const candidate = dropTargets.get(hit);
        if (candidate && (kind === 'channel' || candidate.allowGroups)) { target = candidate; break; }
        hit = hit.parentElement;
      }
      target?.node.classList.add('channel-drop-target');
      const scroll = node.closest('.channels, #settings-body');
      if (scroll) {
        const bounds = scroll.getBoundingClientRect();
        if (event.clientY < bounds.top + 28) scroll.scrollTop -= 16;
        else if (event.clientY > bounds.bottom - 28) scroll.scrollTop += 16;
      }
    });
    node.addEventListener('pointerup', async (event) => {
      if (!start || event.pointerId !== start.pointerId) return;
      if (!dragged) { start = null; return; }
      event.preventDefault();
      blockClickUntil = Date.now() + 1000;
      const destination = target;
      finish();
      if (!destination) return;
      const beforeId = kind === 'category' ? destination.groupBefore : destination.beforeId;
      if (beforeId === id) return;
      await call(kind, { action: 'move', id, beforeId,
        ...(kind === 'channel' ? { categoryId: destination.groupId } : {}) });
      refresh();
    });
    for (const event of ['pointercancel', 'lostpointercapture']) node.addEventListener(event, () => {
      if (start) { if (dragged) finish(); else start = null; }
    });
    node.addEventListener('click', (event) => {
      if (Date.now() < blockClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  }

  function dropTarget(node, groupId, beforeId = null, groupBefore = null, allowGroups = false) {
    dropTargets.set(node, { node, groupId, beforeId, groupBefore, allowGroups });
  }

  function channelRow(c, admin = false) {
    const unread = state.unread[c.id];
    const active = c.type === 'text' ? state.view === 'chat' && state.textChannel === c.id : state.voiceChannel === c.id;
    const entry = el('button', { type: 'button', class: 'channel-entry', title: c.topic || c.name,
      data: { focusKey: (admin ? 'admin-' : '') + 'open-' + c.id },
      ariaLabel: `${c.mudae ? 'Salão do Mudae' : c.type === 'text' ? 'Canal de texto' : 'Canal de voz'} ${c.name}${c.private ? ', privado' : ''}`,
      onclick: () => admin ? editChannel(c.id) : open(c) },
    el('span', { class: 'icon' }, Icon(c.mudae ? 'dice' : c.type === 'text' ? 'hash' : 'volume', 18)),
    el('span', { class: 'channel-name', textContent: c.name }),
    c.private ? el('span', { class: 'lock', title: c.allowedRoles.length ? 'Canal privado' : 'Somente administradores' }, Icon('lock', 14)) : null);
    const row = el('div', { class: 'channel grouped-channel' + (active && !admin ? ' active' : '') + (unread && !admin ? ' unread' : ''),
      oncontextmenu: (event) => channelMenu(c, event), data: { channelId: c.id } }, entry);
    if (unread?.mentions && !admin) row.append(el('span', { class: 'badge', textContent: unread.mentions > 99 ? '99+' : String(unread.mentions) }));
    if (canManage() || c.type === 'text') {
      const more = button('Ações do canal ' + c.name, 'more', (event) => channelMenu(c, event));
      // O conjunto de ícones antigo não inclui reticências.
      more.replaceChildren('⋯');
      more.dataset.focusKey = (admin ? 'admin-' : '') + 'menu-' + c.id;
      row.append(more);
    }
    dragSource(entry, 'channel', c.id);
    dropTarget(row, c.categoryId, c.id);
    if (canManage() || c.type === 'text') touchMenu(row, (event) => channelMenu(c, event));
    return el('li', { class: 'group-channel-item' }, row, admin ? null : voiceUsers(c));
  }

  function renderGroups(admin = false, query = '') {
    const container = el('div', { class: admin ? 'admin-channel-groups' : 'channel-groups' });
    for (const group of groups()) {
      const all = channels(group.id);
      const list = all.filter((c) => (group.name + ' ' + c.name + ' ' + c.topic).toLowerCase().includes(query.toLowerCase().trim()));
      if (!list.length && (!canManage() || query)) continue;
      const collapsed = !admin && state.collapsed.has(key(group));
      const count = all.reduce((sum, c) => sum + (state.unread[c.id]?.mentions || 0), 0);
      const toggle = el(admin && !group.id ? 'span' : 'button', { type: 'button', class: 'cat-toggle',
        ...(admin ? {} : { ariaExpanded: String(!collapsed) }),
        ariaLabel: admin ? (group.id ? 'Editar grupo ' + group.name : group.name) : (collapsed ? 'Expandir ' : 'Recolher ') + group.name,
        data: { focusKey: 'group-' + key(group) }, onclick: () => admin ? editGroup(group.id ? group : null) : toggleGroup(group) },
      admin ? null : el('span', { class: 'cat-chev' }, Icon('chevronDown', 12)), el('span', { class: 'group-name', textContent: group.name }));
      // Na administração, o título de "Sem grupo" não cria outro grupo implicitamente.
      if (admin && !group.id) toggle.style.pointerEvents = 'none';
      const header = el('div', { class: 'category' + (collapsed ? ' collapsed' : ''), oncontextmenu: (event) => groupMenu(group, event) }, toggle);
      touchMenu(header, (event) => groupMenu(group, event));
      if (collapsed && count) header.append(el('span', { class: 'badge', textContent: count > 99 ? '99+' : String(count) }));
      if (canManage()) {
        header.append(button('Criar canal em ' + group.name, 'plus', () => createChannel('text', group.id)));
        const more = button('Ações do grupo ' + group.name, 'more', (event) => groupMenu(group, event));
        more.replaceChildren('⋯');
        more.dataset.focusKey = 'menu-group-' + key(group);
        header.append(more);
        if (group.id) dragSource(toggle, 'category', group.id);
      }
      dropTarget(header, group.id, null, group.id, true);
      const visible = collapsed ? list.filter((c) => c.id === state.textChannel || c.id === state.voiceChannel || state.unread[c.id]) : list;
      const ul = el('ul', { class: 'group-channel-list' }, visible.map((c) => channelRow(c, admin)));
      if (!list.length && canManage() && !collapsed) ul.append(el('li', { class: 'group-empty', textContent: 'Crie um canal ou arraste para cá.' }));
      // O espaço ao fim da lista recebe canais após o último item.
      dropTarget(ul, group.id);
      container.append(el('section', { class: 'channel-group', ariaLabel: group.name, data: { categoryId: group.id || '' } }, header, ul));
    }
    if (canManage() && !admin) container.append(el('button', { type: 'button', class: 'channel-list-add',
      data: { focusKey: 'create-group' }, onclick: () => editGroup() }, Icon('plus', 14), el('span', { textContent: 'Criar grupo de canais' })));
    return container;
  }

  return {
    get dragging() { return !!dragged; },
    categorySelect, editGroup, duplicateChannel, moveChannel, listMenu,
    adminList: (query) => renderGroups(true, query),
    render() {
      const scope = state.me.accountId + ':' + state.server.serverId;
      if (collapsedAccount !== scope) {
        collapsedAccount = scope;
        try {
          const firstServer = state.server.servers[0]?.id === state.server.serverId;
          const saved = JSON.parse(localStorage.getItem('collapsed:' + scope) || (firstServer && (localStorage.getItem('collapsed:' + state.me.accountId) || localStorage.getItem('collapsed'))) || '[]');
          state.collapsed = new Set(Array.isArray(saved) ? saved.filter((v) => typeof v === 'string') : []);
        } catch { state.collapsed = new Set(); }
      }
      const root = document.querySelector('#channel-groups');
      const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
      root.replaceChildren(renderGroups());
      restoreFocus(root, focusKey);
    },
  };
};
