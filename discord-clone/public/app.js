// Front-end do clone do Discord.
// Chat de texto via Socket.IO; voz e tela via WebRTC em malha (cada pessoa
// conecta diretamente com as outras da sala; o servidor só repassa a sinalização).
// Cargos e moderação são validados no servidor; aqui só escondemos o que a pessoa não pode usar.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const socket = io({ autoConnect: false });

  const state = {
    me: null, // { accountId, sid }
    server: null, // último 'state' do servidor: roles, channels, members, voice, myPerms, bans, ownerId
    permNames: {},
    messages: {}, // idDoCanal -> mensagens (carregadas sob demanda)
    textChannel: null,
    view: 'chat', // 'chat' | 'voice'
    voiceChannel: null,
    muted: false,
    deafened: false,
    micStream: null,
    screenStream: null,
    peers: new Map(), // sid -> { pc, polite, makingOffer, ignoreOffer, micStream, screenStream, audioEl, screenSenders }
    micDeviceId: localStorage.getItem('micDeviceId') || '',
    speakerDeviceId: localStorage.getItem('speakerDeviceId') || '',
    noiseSuppression: localStorage.getItem('noiseSuppression') !== 'false',
    localVolume: JSON.parse(localStorage.getItem('localVolume') || '{}'), // accountId -> 0..1
    localMuted: new Set(JSON.parse(localStorage.getItem('localMuted') || '[]')),
    speaking: new Set(), // sids
    editing: null, // id da mensagem sendo editada
    removed: false,
  };

  let audioCtx = null;
  const analysers = new Map(); // sid -> { analyser, source, data }

  // ---------------- utilidades ----------------
  function toast(text, kind = 'error') {
    const el = $('#toast');
    el.textContent = text;
    el.className = kind;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  // Emite um evento e espera a resposta; mostra o erro, se houver.
  function call(event, payload = {}) {
    return new Promise((resolve) => {
      socket.emit(event, payload, (res) => {
        if (res?.error) {
          toast(res.error);
          return resolve(null);
        }
        resolve(res);
      });
    });
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k === 'data') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node[k] = v;
    }
    node.append(...children.flat().filter((c) => c != null && c !== false));
    return node;
  }

  const initials = (name) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  function avatar(member, cls = '', sid = '') {
    return el('div', {
      class: 'avatar ' + cls,
      style: { background: member.color || '#5865f2' },
      textContent: initials(member.name || '?'),
      data: sid ? { sid } : {},
    });
  }

  function linkify(text) {
    const frag = document.createDocumentFragment();
    const re = /(https?:\/\/[^\s]+)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      frag.append(text.slice(last, m.index));
      frag.append(el('a', { href: m[1], textContent: m[1], target: '_blank', rel: 'noopener noreferrer' }));
      last = m.index + m[1].length;
    }
    frag.append(text.slice(last));
    return frag;
  }

  function formatUntil(ts) {
    return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  // ---------------- cargos e permissões (espelho do servidor) ----------------
  const member = (id) => state.server?.members.find((m) => m.id === id);
  const meMember = () => member(state.me.accountId);
  const roleIdx = (id) => state.server.roles.findIndex((r) => r.id === id);
  const isOwner = (id) => id === state.server.ownerId;
  const hasPerm = (p) => state.server?.myPerms.includes(p);
  const timedOut = (m) => m && m.timeoutUntil > Date.now();

  function topPos(m) {
    if (isOwner(m.id)) return Infinity;
    return Math.max(0, ...m.roles.map(roleIdx));
  }

  const iOutrank = (target) => !isOwner(target.id) && topPos(meMember()) > topPos(target);
  const canActOn = (target) => target.id === state.me.accountId || iOutrank(target);

  // Cor do nome = cor do cargo colorido mais alto.
  function nameColor(m) {
    if (!m) return '';
    let best = null;
    for (const id of m.roles) {
      const i = roleIdx(id);
      const r = state.server.roles[i];
      if (r?.color && (!best || i > best.i)) best = { i, color: r.color };
    }
    return best?.color || '';
  }

  // Cargo "exibido separadamente" mais alto, usado para agrupar a lista de membros.
  function hoistRole(m) {
    let best = null;
    for (const id of m.roles) {
      const i = roleIdx(id);
      if (state.server.roles[i]?.hoist && (!best || i > best.i)) best = { i, role: state.server.roles[i] };
    }
    return best;
  }

  const voiceEntries = (channel) => state.server.voice.filter((v) => v.channel === channel);
  const voiceEntry = (sid) => state.server.voice.find((v) => v.sid === sid);
  const channelById = (id) => state.server.channels.find((c) => c.id === id);

  // ---------------- login / cadastro ----------------
  let config = { passwordRequired: false, hasOwner: true };
  let loginMode = 'login';

  function setLoginMode(mode) {
    loginMode = mode;
    const register = mode === 'register';
    $('#login-title').textContent = register ? 'Criar uma conta' : 'Bem-vindo de volta!';
    $('#login-subtitle').textContent = register
      ? (config.hasOwner ? 'Escolha um nome e uma senha.' : 'Você é o primeiro! Esta conta será a dona do servidor 👑')
      : 'Entre com sua conta.';
    $('#login-submit').textContent = register ? 'Criar conta' : 'Entrar';
    $('#login-switch-text').textContent = register ? 'Já tem uma conta?' : 'Precisa de uma conta?';
    $('#login-switch').textContent = register ? 'Entrar' : 'Registre-se';
    $('#login-color-label').classList.toggle('hidden', !register);
    $('#server-password-label').classList.toggle('hidden', !register || !config.passwordRequired);
    $('#server-password').required = register && config.passwordRequired;
    $('#login-password').autocomplete = register ? 'new-password' : 'current-password';
  }

  function showLogin(notice) {
    setLoginMode('login');
    $('#login-name').value = localStorage.getItem('name') || '';
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#login-notice').textContent = notice || '';
    $('#login-notice').classList.toggle('hidden', !notice);
  }

  $('#login-switch').onclick = (e) => {
    e.preventDefault();
    setLoginMode(loginMode === 'login' ? 'register' : 'login');
  };

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    authenticate({
      mode: loginMode,
      name: $('#login-name').value.trim(),
      password: $('#login-password').value,
      serverPassword: $('#server-password').value,
      color: $('#login-color').value,
    });
  });

  function authenticate(payload) {
    if (!socket.connected) socket.connect();
    socket.emit('auth', payload, (res) => {
      if (res.error) {
        if (payload.token) localStorage.removeItem('token');
        showLogin(payload.token ? '' : undefined);
        return toast(res.error);
      }
      localStorage.setItem('token', res.token);
      if (payload.name) localStorage.setItem('name', payload.name);
      state.me = { accountId: res.accountId, sid: res.sid };
      state.permNames = res.permNames;
      state.iceServers = res.iceServers;
      $('#login-password').value = '';
      $('#server-password').value = '';
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      if (state.server) render();
    });
  }

  fetch('/config').then((r) => r.json()).then((c) => {
    config = c;
    setLoginMode(c.hasOwner ? 'login' : 'register');
    $('#login-name').value = localStorage.getItem('name') || '';
    const token = localStorage.getItem('token');
    if (token) authenticate({ token });
  });

  socket.on('removed', ({ reason }) => {
    state.removed = true;
    localStorage.removeItem('token');
    leaveVoice(false);
    showLogin(reason);
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect' || state.removed) return;
    toast('Conexão perdida. Reconectando…');
    leaveVoice(false);
  });
  // Ao reconectar, recarrega a página: o token salvo faz o login automático.
  socket.io.on('reconnect', () => { if (!state.removed) location.reload(); });

  socket.on('notice', (text) => toast(text, 'info'));

  // ---------------- estado do servidor ----------------
  socket.on('state', (s) => {
    state.server = s;
    if (!state.me) return;
    const textChannels = s.channels.filter((c) => c.type === 'text');
    if (!textChannels.some((c) => c.id === state.textChannel)) state.textChannel = textChannels[0]?.id || null;
    // Fecha conexões com quem saiu da nossa sala.
    for (const sid of state.peers.keys()) {
      const v = voiceEntry(sid);
      if (!v || v.channel !== state.voiceChannel) closePeer(sid);
    }
    applyAudio();
    render();
  });

  // ---------------- renderização ----------------
  function render() {
    if (!state.server || !state.me || !meMember()) return;
    const me = meMember();
    $('#me-name').textContent = me.name;
    $('#me-name').style.color = nameColor(me);
    $('#me-avatar').replaceWith(Object.assign(avatar(me), { id: 'me-avatar' }));
    $('#btn-server-settings').classList.toggle('hidden', !['MANAGE_ROLES', 'MANAGE_CHANNELS', 'BAN'].some(hasPerm));
    renderChannels();
    renderMembers();
    renderMain();
    renderControls();
    // Só redesenha as configurações se algo delas mudou; senão perderia o que está sendo editado.
    const settingsKey = JSON.stringify([state.server.roles, state.server.channels, state.server.bans, state.server.myPerms, state.server.members.map((m) => m.roles)]);
    if (!$('#server-settings').classList.contains('hidden') && settingsKey !== render.settingsKey) renderServerSettings();
    render.settingsKey = settingsKey;
  }

  function renderChannels() {
    const tl = $('#text-channels');
    tl.innerHTML = '';
    for (const c of state.server.channels.filter((c) => c.type === 'text')) {
      tl.append(el('li', {
        class: 'channel' + (state.view === 'chat' && state.textChannel === c.id ? ' active' : ''),
        onclick: () => { state.textChannel = c.id; state.view = 'chat'; state.editing = null; render(); },
      }, el('span', { class: 'icon', textContent: '#' }), c.name, c.allowedRoles.length ? el('span', { class: 'lock', textContent: '🔒', title: 'Canal privado' }) : null));
    }

    const vl = $('#voice-channels');
    vl.innerHTML = '';
    for (const c of state.server.channels.filter((c) => c.type === 'voice')) {
      const users = voiceEntries(c.id).map((v) => {
        const m = member(v.accountId);
        if (!m) return null;
        const flags = el('span', { class: 'flags' });
        if (v.sharing) flags.append(el('span', { class: 'live', textContent: 'AO VIVO' }), ' ');
        if (m.serverMuted || timedOut(m)) flags.append(el('span', { class: 'server-flag', textContent: '🔇', title: timedOut(m) ? 'De castigo' : 'Silenciado pelo servidor' }));
        else if (v.muted) flags.append('🔇');
        if (m.serverDeafened) flags.append(el('span', { class: 'server-flag', textContent: '🙉', title: 'Ensurdecido pelo servidor' }));
        else if (v.deafened) flags.append('🙉');
        if (state.localMuted.has(m.id)) flags.append(el('span', { title: 'Mutado para você', textContent: '🔕' }));
        return el('li', {
          class: 'voice-user',
          onclick: (e) => openMemberMenu(m.id, e),
          oncontextmenu: (e) => openMemberMenu(m.id, e),
        }, avatar(m, 'small' + (state.speaking.has(v.sid) ? ' speaking' : ''), v.sid), el('span', { class: 'name', textContent: m.name }), flags);
      });
      vl.append(el('li', {},
        el('div', {
          class: 'channel' + (state.view === 'voice' && state.voiceChannel === c.id ? ' active' : ''),
          onclick: () => (state.voiceChannel === c.id ? (state.view = 'voice', render()) : joinVoice(c.id)),
        }, el('span', { class: 'icon', textContent: '🔊' }), c.name, c.allowedRoles.length ? el('span', { class: 'lock', textContent: '🔒' }) : null),
        el('ul', { class: 'voice-users' }, users)));
    }
  }

  function renderMembers() {
    const list = $('#member-list');
    list.innerHTML = '';
    const groups = new Map(); // chave -> { title, pos, members }
    for (const m of state.server.members) {
      let key, title, pos;
      if (!m.online) { key = 'offline'; title = 'OFFLINE'; pos = -2; }
      else {
        const h = hoistRole(m);
        if (h) { key = h.role.id; title = h.role.name.toUpperCase(); pos = h.i; }
        else { key = 'online'; title = 'ONLINE'; pos = -1; }
      }
      if (!groups.has(key)) groups.set(key, { title, pos, members: [] });
      groups.get(key).members.push(m);
    }
    for (const g of [...groups.values()].sort((a, b) => b.pos - a.pos)) {
      list.append(el('div', { class: 'category', textContent: `${g.title} — ${g.members.length}` }));
      g.members.sort((a, b) => a.name.localeCompare(b.name));
      for (const m of g.members) {
        const v = state.server.voice.find((x) => x.accountId === m.id);
        let sub = '';
        if (timedOut(m)) sub = '⏳ De castigo até ' + formatUntil(m.timeoutUntil);
        else if (v) sub = (v.sharing ? '🖥️ Transmitindo em ' : '🔊 ') + (channelById(v.channel)?.name || '');
        list.append(el('div', {
          class: 'member' + (m.online ? '' : ' offline'),
          onclick: (e) => openMemberMenu(m.id, e),
          oncontextmenu: (e) => openMemberMenu(m.id, e),
        }, avatar(m), el('div', { class: 'member-info' },
          el('div', { class: 'member-name', style: { color: nameColor(m) } }, m.name, isOwner(m.id) ? el('span', { title: 'Dono do servidor', textContent: ' 👑' }) : null),
          sub ? el('div', { class: 'sub', textContent: sub }) : null)));
      }
    }
  }

  function renderMain() {
    const inVoiceView = state.view === 'voice' && state.voiceChannel;
    $('#chat-view').classList.toggle('hidden', !!inVoiceView);
    $('#voice-view').classList.toggle('hidden', !inVoiceView);
    if (inVoiceView) {
      $('#main-header').textContent = '🔊 ' + (channelById(state.voiceChannel)?.name || '');
      renderStage();
      return;
    }
    const c = channelById(state.textChannel);
    $('#main-header').textContent = c ? '# ' + c.name : '';
    if (!c) return;
    const me = meMember();
    const input = $('#chat-input');
    if (timedOut(me)) {
      input.disabled = true;
      input.placeholder = '⏳ Você está de castigo até ' + formatUntil(me.timeoutUntil);
    } else if (!hasPerm('SEND_MESSAGES')) {
      input.disabled = true;
      input.placeholder = 'Você não tem permissão para enviar mensagens.';
    } else {
      input.disabled = false;
      input.placeholder = 'Conversar em #' + c.name;
    }
    if (!state.messages[c.id]) {
      state.messages[c.id] = [];
      call('chat:history', { channel: c.id }).then((res) => {
        if (!res) return;
        state.messages[c.id] = res.messages;
        if (state.textChannel === c.id) renderMessages(true);
      });
    }
    renderMessages();
  }

  function renderMessages(scrollToEnd = false) {
    if (state.view !== 'chat') return;
    const box = $('#messages');
    // Não redesenha enquanto a pessoa edita uma mensagem.
    if (state.editing && box.querySelector('.msg-edit')) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 50;
    const lastChannel = box.dataset.channel;
    box.innerHTML = '';
    box.dataset.channel = state.textChannel;
    let prev = null;
    for (const msg of state.messages[state.textChannel] || []) {
      const author = member(msg.authorId);
      const name = author?.name || msg.authorName || 'Usuário removido';
      const continued = prev && prev.authorId === msg.authorId && (msg.authorId || prev.authorName === msg.authorName) && msg.ts - prev.ts < 5 * 60 * 1000;
      const mine = msg.authorId === state.me.accountId;
      const body = el('div', { class: 'msg-body' });
      if (!continued) {
        const openMenu = (e) => author && openMemberMenu(author.id, e);
        body.append(el('div', {},
          el('span', { class: 'msg-author', style: { color: nameColor(author) || msg.authorColor || '' }, textContent: name, onclick: openMenu, oncontextmenu: openMenu }),
          el('span', { class: 'msg-time', textContent: formatUntil(msg.ts) })));
      }
      if (state.editing === msg.id) {
        const input = el('input', { class: 'msg-edit', value: msg.text, maxLength: 2000 });
        input.onkeydown = async (e) => {
          if (e.key === 'Escape') { state.editing = null; renderMessages(); }
          if (e.key === 'Enter') {
            e.preventDefault();
            const text = input.value.trim();
            state.editing = null;
            if (text && text !== msg.text) await call('chat:edit', { channel: state.textChannel, id: msg.id, text });
            renderMessages();
          }
        };
        body.append(input, el('div', { class: 'muted-text', textContent: 'Esc para cancelar • Enter para salvar' }));
        setTimeout(() => input.focus());
      } else {
        body.append(el('div', { class: 'msg-text' }, linkify(msg.text), msg.edited ? el('span', { class: 'edited', textContent: ' (editado)' }) : null));
      }
      const actions = el('div', { class: 'msg-actions' });
      if (mine && !timedOut(meMember())) actions.append(el('button', { title: 'Editar', textContent: '✏️', onclick: () => { state.editing = msg.id; renderMessages(); } }));
      if (mine || hasPerm('MANAGE_MESSAGES')) {
        actions.append(el('button', {
          title: 'Apagar',
          textContent: '🗑️',
          onclick: (e) => {
            if (e.shiftKey || confirm('Apagar esta mensagem?')) call('chat:delete', { channel: state.textChannel, id: msg.id });
          },
        }));
      }
      box.append(el('div', { class: 'msg' + (continued ? ' continued' : '') },
        continued ? null : avatar(author || { name, color: msg.authorColor }),
        body,
        actions.childElementCount ? actions : null));
      prev = msg;
    }
    if (atBottom || scrollToEnd || lastChannel !== state.textChannel) box.scrollTop = box.scrollHeight;
  }

  // Palco de voz: um bloco por participante + um bloco grande por tela compartilhada.
  function renderStage() {
    const stage = $('#stage');
    const wanted = new Set();

    for (const v of voiceEntries(state.voiceChannel)) {
      const m = member(v.accountId);
      if (!m) continue;
      const self = v.sid === state.me.sid;
      const screenStream = self ? state.screenStream : state.peers.get(v.sid)?.screenStream;
      if (v.sharing && screenStream) {
        const key = 'screen-' + v.sid;
        wanted.add(key);
        let tile = stage.querySelector(`[data-key="${key}"]`);
        if (!tile) {
          const video = el('video', { autoplay: true, playsInline: true });
          video.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen());
          tile = el('div', { class: 'tile screen', data: { key } }, video, el('div', { class: 'label' }));
          stage.prepend(tile);
        }
        const video = tile.querySelector('video');
        if (video.srcObject !== screenStream) {
          video.srcObject = screenStream;
          setSinkId(video);
        }
        tile.querySelector('.label').textContent = '🖥️ Tela de ' + m.name;
      }

      const key = 'user-' + v.sid;
      wanted.add(key);
      let tile = stage.querySelector(`[data-key="${key}"]`);
      if (!tile) {
        tile = el('div', {
          class: 'tile',
          data: { key },
          oncontextmenu: (e) => openMemberMenu(m.id, e),
        }, avatar(m, '', v.sid), el('div', { class: 'label' }));
        stage.append(tile);
      }
      tile.classList.toggle('speaking', state.speaking.has(v.sid));
      const silenced = m.serverMuted || timedOut(m);
      tile.querySelector('.label').textContent = m.name + (silenced || v.muted ? ' 🔇' : '') + (m.serverDeafened || v.deafened ? ' 🙉' : '');
    }

    for (const tile of [...stage.children]) {
      if (!wanted.has(tile.dataset.key)) tile.remove();
    }
    applyAudio();
  }

  function renderControls() {
    const me = meMember();
    const inVoice = !!state.voiceChannel;
    const forcedMute = me.serverMuted || timedOut(me) || !hasPerm('SPEAK');
    $('#voice-panel').classList.toggle('hidden', !inVoice);
    $('#voice-room-name').textContent = channelById(state.voiceChannel)?.name || '';
    const mute = $('#btn-mute');
    mute.classList.toggle('off', state.muted || forcedMute);
    mute.classList.toggle('locked', forcedMute);
    mute.textContent = state.muted || forcedMute ? '🔇' : '🎤';
    mute.title = forcedMute ? 'Silenciado pelo servidor' : 'Microfone';
    const deafen = $('#btn-deafen');
    deafen.classList.toggle('off', state.deafened || me.serverDeafened);
    deafen.classList.toggle('locked', !!me.serverDeafened);
    deafen.textContent = state.deafened || me.serverDeafened ? '🙉' : '🎧';
    deafen.title = me.serverDeafened ? 'Ensurdecido pelo servidor' : 'Fone de ouvido';
    const share = $('#btn-share');
    share.classList.toggle('on', !!state.screenStream);
    share.disabled = !state.screenStream && (!hasPerm('STREAM') || timedOut(me));
    share.title = state.screenStream ? 'Parar de compartilhar' : share.disabled ? 'Sem permissão para compartilhar tela' : 'Compartilhar tela';
  }

  // ---------------- menu de membro (clique direito) ----------------
  function closeMenu() {
    $('#context-menu').classList.add('hidden');
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('#context-menu')) closeMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function openMemberMenu(accountId, e) {
    e.preventDefault();
    e.stopPropagation();
    const m = member(accountId);
    if (!m) return;
    const menu = $('#context-menu');
    menu.innerHTML = '';
    const self = m.id === state.me.accountId;
    const v = state.server.voice.find((x) => x.accountId === m.id);
    const item = (label, onclick, cls = '') => el('button', { class: 'menu-item ' + cls, textContent: label, onclick: async () => { closeMenu(); await onclick(); } });
    const section = (title) => el('div', { class: 'menu-section', textContent: title });
    const sep = () => el('div', { class: 'menu-sep' });
    const mod = (action, value) => call('mod', { action, target: m.id, value });

    // Cabeçalho com nome e cargos
    const roleChips = m.roles.map((id) => state.server.roles[roleIdx(id)]).filter(Boolean)
      .sort((a, b) => roleIdx(b.id) - roleIdx(a.id))
      .map((r) => el('span', { class: 'chip' }, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), r.name));
    menu.append(el('div', { class: 'menu-head' },
      avatar(m),
      el('div', {},
        el('div', { class: 'member-name', style: { color: nameColor(m) } }, m.name, isOwner(m.id) ? ' 👑' : ''),
        timedOut(m) ? el('div', { class: 'sub', textContent: '⏳ Castigo até ' + formatUntil(m.timeoutUntil) }) : null,
        el('div', { class: 'chips' }, roleChips.length ? roleChips : el('span', { class: 'muted-text', textContent: 'Sem cargos' })))));

    // Controles locais (só afetam o que eu ouço)
    if (!self && v && v.channel === state.voiceChannel) {
      const vol = Math.round((state.localVolume[m.id] ?? 1) * 100);
      const label = el('span', { textContent: `Volume: ${vol}%` });
      const range = el('input', { type: 'range', min: 0, max: 100, value: vol });
      range.oninput = () => {
        label.textContent = `Volume: ${range.value}%`;
        state.localVolume[m.id] = range.value / 100;
        localStorage.setItem('localVolume', JSON.stringify(state.localVolume));
        applyAudio();
      };
      menu.append(sep(), el('div', { class: 'menu-range' }, label, range));
    }
    if (!self) {
      const localMuted = state.localMuted.has(m.id);
      menu.append(item(localMuted ? '🔔 Desmutar para mim' : '🔕 Mutar para mim', () => {
        localMuted ? state.localMuted.delete(m.id) : state.localMuted.add(m.id);
        localStorage.setItem('localMuted', JSON.stringify([...state.localMuted]));
        applyAudio();
        render();
      }));
    }

    const actOn = canActOn(m);
    const modItems = [];
    if (hasPerm('MUTE_MEMBERS') && actOn) {
      modItems.push(item(m.serverMuted ? '🎤 Remover silêncio do servidor' : '🔇 Silenciar no servidor', () => mod('serverMute', !m.serverMuted)));
      modItems.push(item(m.serverDeafened ? '🎧 Remover surdez do servidor' : '🙉 Ensurdecer no servidor', () => mod('serverDeafen', !m.serverDeafened)));
    }
    if (hasPerm('MOVE_MEMBERS') && actOn && v) {
      modItems.push(item('📴 Desconectar da voz', () => mod('disconnect')));
      const others = state.server.channels.filter((c) => c.type === 'voice' && c.id !== v.channel);
      if (others.length) {
        modItems.push(section('MOVER PARA'));
        for (const c of others) modItems.push(item('🔊 ' + c.name, () => mod('move', c.id), 'indent'));
      }
    }
    if (modItems.length) menu.append(sep(), ...modItems);

    if (hasPerm('TIMEOUT') && !self && iOutrank(m)) {
      menu.append(sep());
      if (timedOut(m)) menu.append(item('✅ Remover castigo', () => mod('timeout', 0)));
      else {
        menu.append(section('CASTIGO (não fala nem escreve)'));
        const options = [['60 segundos', 1], ['5 minutos', 5], ['10 minutos', 10], ['1 hora', 60], ['1 dia', 1440], ['1 semana', 10080]];
        for (const [label, min] of options) menu.append(item('⏳ ' + label, () => mod('timeout', min), 'indent'));
      }
    }

    if (hasPerm('MANAGE_ROLES') && actOn) {
      const myTop = topPos(meMember());
      const roles = state.server.roles.slice(1).map((r, i) => ({ r, i: i + 1 })).reverse();
      if (roles.length) {
        menu.append(sep(), section('CARGOS'));
        for (const { r, i } of roles) {
          const has = m.roles.includes(r.id);
          const box = el('input', { type: 'checkbox', checked: has, disabled: i >= myTop });
          box.onchange = () => {
            const next = box.checked ? [...m.roles, r.id] : m.roles.filter((x) => x !== r.id);
            mod('setRoles', next);
          };
          menu.append(el('label', { class: 'menu-check' + (i >= myTop ? ' disabled' : '') }, box,
            el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), r.name));
        }
      }
    }

    const danger = [];
    if (hasPerm('KICK') && !self && iOutrank(m)) {
      danger.push(item(`👢 Expulsar ${m.name}`, () => confirm(`Expulsar ${m.name}? A pessoa vai precisar entrar de novo.`) && mod('kick'), 'danger'));
    }
    if (hasPerm('BAN') && !self && iOutrank(m)) {
      danger.push(item(`🔨 Banir ${m.name}`, () => confirm(`Banir ${m.name}? A pessoa não vai conseguir entrar mais.`) && mod('ban'), 'danger'));
    }
    if (danger.length) menu.append(sep(), ...danger);

    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(e.clientX, innerWidth - rect.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(e.clientY, innerHeight - rect.height - 8)) + 'px';
  }

  // ---------------- configurações do servidor ----------------
  let settingsTab = 'roles';
  let selectedRole = null;
  let creatingRole = false;

  $('#btn-server-settings').onclick = () => {
    const tabs = { roles: 'MANAGE_ROLES', channels: 'MANAGE_CHANNELS', bans: 'BAN' };
    if (!hasPerm(tabs[settingsTab])) settingsTab = Object.keys(tabs).find((t) => hasPerm(tabs[t]));
    $('#server-settings').classList.remove('hidden');
    renderServerSettings();
  };
  $('#server-settings-close').onclick = () => $('#server-settings').classList.add('hidden');
  $('#settings-tabs').onclick = (e) => {
    if (!e.target.dataset.tab) return;
    settingsTab = e.target.dataset.tab;
    renderServerSettings();
  };

  function renderServerSettings() {
    const tabs = { roles: 'MANAGE_ROLES', channels: 'MANAGE_CHANNELS', bans: 'BAN' };
    if (!Object.values(tabs).some(hasPerm)) return $('#server-settings').classList.add('hidden');
    if (creatingRole) return;
    for (const b of $('#settings-tabs').children) {
      b.classList.toggle('hidden', !hasPerm(tabs[b.dataset.tab]));
      b.classList.toggle('active', b.dataset.tab === settingsTab);
    }
    const body = $('#settings-body');
    // Preserva o que está sendo digitado: só redesenha se o foco não estiver num campo.
    if (body.contains(document.activeElement) && document.activeElement.matches('input[type=text], input:not([type])')) return;
    body.innerHTML = '';
    if (settingsTab === 'roles') body.append(rolesTab());
    if (settingsTab === 'channels') body.append(channelsTab());
    if (settingsTab === 'bans') body.append(bansTab());
  }

  function rolesTab() {
    const roles = state.server.roles;
    const myTop = topPos(meMember());
    if (!roles.some((r) => r.id === selectedRole)) selectedRole = roles[roles.length - 1].id;
    const list = el('div', { class: 'role-list' },
      el('button', {
        type: 'button', class: 'secondary', textContent: '+ Criar cargo',
        onclick: async () => {
          creatingRole = true;
          const res = await call('role', { action: 'create', name: 'novo cargo', color: '#99aab5', perms: [] });
          creatingRole = false;
          if (res) selectedRole = res.id;
          renderServerSettings();
        },
      }),
      [...roles].reverse().map((r) => {
        const count = state.server.members.filter((m) => m.roles.includes(r.id)).length;
        return el('button', {
          type: 'button',
          class: 'role-row' + (r.id === selectedRole ? ' active' : ''),
          onclick: () => { selectedRole = r.id; renderServerSettings(); },
        }, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), el('span', { class: 'grow', textContent: r.name }),
        r.id === 'everyone' ? null : el('span', { class: 'muted-text', textContent: String(count) }));
      }));

    const i = roleIdx(selectedRole);
    const role = roles[i];
    const editable = i < myTop;
    const everyone = role.id === 'everyone';
    const name = el('input', { value: role.name, maxLength: 32, disabled: !editable || everyone });
    const color = el('input', { type: 'color', value: role.color || '#99aab5', disabled: !editable || everyone });
    const noColor = el('input', { type: 'checkbox', checked: !role.color, disabled: !editable || everyone });
    const hoist = el('input', { type: 'checkbox', checked: role.hoist, disabled: !editable || everyone });
    const perms = Object.entries(state.permNames).map(([key, label]) => {
      const box = el('input', { type: 'checkbox', checked: role.perms.includes(key), disabled: !editable || (!hasPerm(key) && !role.perms.includes(key)) });
      box.dataset.perm = key;
      return el('label', { class: 'row' }, box, label);
    });
    const save = async () => {
      const res = await call('role', {
        action: 'update',
        id: role.id,
        name: name.value,
        color: noColor.checked ? '' : color.value,
        hoist: hoist.checked,
        perms: perms.map((l) => l.firstChild).filter((b) => b.checked).map((b) => b.dataset.perm),
      });
      if (res) toast('Cargo salvo', 'info');
    };

    const editor = el('div', { class: 'role-editor' },
      !editable ? el('div', { class: 'notice', textContent: 'Você só pode editar cargos abaixo do seu cargo mais alto.' }) : null,
      everyone ? el('div', { class: 'muted-text', textContent: '@everyone vale para todos os membros. Tire uma permissão daqui para restringir todo mundo que não tem outro cargo com ela.' }) : null,
      el('label', {}, 'NOME DO CARGO', name),
      everyone ? null : el('div', { class: 'row gap' }, el('label', { class: 'inline' }, 'COR', color), el('label', { class: 'row' }, noColor, 'Sem cor')),
      everyone ? null : el('label', { class: 'row' }, hoist, 'Mostrar separado na lista de membros'),
      el('div', { class: 'category', textContent: 'PERMISSÕES' }),
      el('div', { class: 'perm-list' }, perms),
      editable ? el('div', { class: 'buttons' },
        everyone ? null : el('button', { type: 'button', class: 'secondary', textContent: '▲ Subir', title: 'Subir na hierarquia', onclick: () => call('role', { action: 'move', id: role.id, dir: 1 }) }),
        everyone ? null : el('button', { type: 'button', class: 'secondary', textContent: '▼ Descer', title: 'Descer na hierarquia', onclick: () => call('role', { action: 'move', id: role.id, dir: -1 }) }),
        everyone ? null : el('button', { type: 'button', class: 'secondary danger-text', textContent: 'Apagar', onclick: () => confirm(`Apagar o cargo ${role.name}?`) && call('role', { action: 'delete', id: role.id }) }),
        el('button', { type: 'button', textContent: 'Salvar', onclick: save })) : null);

    return el('div', { class: 'split' }, list, editor);
  }

  function channelsTab() {
    const roles = state.server.roles.slice(1);
    const roleBoxes = (selected) => el('div', { class: 'chips' }, roles.map((r) => {
      const box = el('input', { type: 'checkbox', checked: selected.includes(r.id) });
      box.dataset.role = r.id;
      return el('label', { class: 'chip selectable' }, box, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), r.name);
    }));
    const picked = (container) => [...container.querySelectorAll('input[data-role]')].filter((b) => b.checked).map((b) => b.dataset.role);

    const rows = state.server.channels.map((c) => {
      const name = el('input', { value: c.name, maxLength: 32 });
      const boxes = roleBoxes(c.allowedRoles);
      return el('div', { class: 'channel-row' },
        el('div', { class: 'row gap' },
          el('span', { class: 'icon', textContent: c.type === 'text' ? '#' : '🔊' }), name,
          el('button', { type: 'button', textContent: 'Salvar', onclick: () => call('channel', { action: 'update', id: c.id, name: name.value, allowedRoles: picked(boxes) }).then((r) => r && toast('Canal salvo', 'info')) }),
          el('button', { type: 'button', class: 'secondary danger-text', textContent: 'Apagar', onclick: () => confirm(`Apagar o canal ${c.name}?` + (c.type === 'text' ? ' As mensagens serão perdidas.' : '')) && call('channel', { action: 'delete', id: c.id }) })),
        el('div', { class: 'muted-text', textContent: 'Privado — só estes cargos veem (nenhum marcado = todos veem):' }),
        boxes);
    });

    const type = el('select', {}, el('option', { value: 'text', textContent: '# Texto' }), el('option', { value: 'voice', textContent: '🔊 Voz' }));
    const newName = el('input', { placeholder: 'nome do canal', maxLength: 32 });
    const newRoles = roleBoxes([]);
    const create = el('div', { class: 'channel-row new' },
      el('div', { class: 'category', textContent: 'CRIAR CANAL' }),
      el('div', { class: 'row gap' }, type, newName,
        el('button', {
          type: 'button', textContent: 'Criar',
          onclick: () => call('channel', { action: 'create', type: type.value, name: newName.value, allowedRoles: picked(newRoles) }).then((r) => r && renderServerSettings()),
        })),
      el('div', { class: 'muted-text', textContent: 'Privado para (opcional):' }), newRoles);

    return el('div', {}, create, ...rows);
  }

  function bansTab() {
    const bans = state.server.bans;
    if (!bans.length) return el('p', { class: 'muted-text', textContent: 'Ninguém banido.' });
    return el('div', {}, bans.map((b) => el('div', { class: 'row gap ban-row' },
      el('span', { class: 'grow', textContent: b.name }),
      el('button', { type: 'button', class: 'secondary', textContent: 'Desbanir', onclick: () => call('mod', { action: 'unban', target: b.id }) }))));
  }

  // ---------------- chat ----------------
  socket.on('chat:message', ({ channel, msg }) => {
    if (!state.messages[channel]) return; // carrega quando abrir o canal
    state.messages[channel].push(msg);
    if (channel === state.textChannel) renderMessages();
  });

  socket.on('chat:update', ({ channel, msg }) => {
    const list = state.messages[channel];
    const i = list?.findIndex((m) => m.id === msg.id);
    if (i >= 0) list[i] = msg;
    if (channel === state.textChannel) renderMessages();
  });

  socket.on('chat:delete', ({ channel, id }) => {
    if (state.messages[channel]) state.messages[channel] = state.messages[channel].filter((m) => m.id !== id);
    if (channel === state.textChannel) renderMessages();
  });

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    call('chat:send', { channel: state.textChannel, text });
    input.value = '';
  });

  // Seta para cima edita a última mensagem, como no Discord.
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' || e.target.value) return;
    const mine = (state.messages[state.textChannel] || []).filter((m) => m.authorId === state.me.accountId);
    if (!mine.length) return;
    e.preventDefault();
    state.editing = mine[mine.length - 1].id;
    renderMessages();
  });

  let lastTyping = 0;
  $('#chat-input').addEventListener('input', () => {
    if (Date.now() - lastTyping > 2000) {
      lastTyping = Date.now();
      socket.emit('typing', { channel: state.textChannel });
    }
  });

  const typers = new Map();
  socket.on('typing', ({ channel, name }) => {
    typers.set(name, { channel, until: Date.now() + 3000 });
    renderTyping();
    setTimeout(renderTyping, 3100);
  });
  function renderTyping() {
    const now = Date.now();
    const names = [...typers].filter(([, t]) => t.until > now && t.channel === state.textChannel).map(([n]) => n);
    $('#typing').textContent = names.length ? names.join(', ') + (names.length > 1 ? ' estão' : ' está') + ' digitando…' : '';
  }

  // ---------------- áudio local ----------------
  async function getMicStream() {
    const constraints = {
      audio: {
        deviceId: state.micDeviceId ? { exact: state.micDeviceId } : undefined,
        echoCancellation: state.noiseSuppression,
        noiseSuppression: state.noiseSuppression,
        autoGainControl: true,
      },
    };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('Microfone indisponível:', err);
      toast('Microfone indisponível — você entrou só para ouvir.');
      // Trilha silenciosa para manter a negociação WebRTC igual para todos.
      return getAudioCtx().createMediaStreamDestination().stream;
    }
  }

  function getAudioCtx() {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Aplica mudo/surdo (meu, do servidor e local) em tudo que toca ou transmite.
  function applyAudio() {
    if (!state.server || !state.me) return;
    const me = meMember();
    if (!me) return;
    const iCantHear = state.deafened || me.serverDeafened;
    const iCantSpeak = state.muted || iCantHear || me.serverMuted || timedOut(me) || !hasPerm('SPEAK');
    state.micStream?.getAudioTracks().forEach((t) => (t.enabled = !iCantSpeak));

    for (const [sid, p] of state.peers) {
      const v = voiceEntry(sid);
      const silent = iCantHear || !v || v.silenced || state.localMuted.has(v.accountId);
      const volume = v ? state.localVolume[v.accountId] ?? 1 : 1;
      if (p.audioEl) {
        p.audioEl.muted = silent;
        p.audioEl.volume = volume;
      }
      const video = document.querySelector(`[data-key="screen-${sid}"] video`);
      if (video) {
        video.muted = iCantHear || (v && state.localMuted.has(v.accountId));
        video.volume = volume;
      }
    }
    // O próprio áudio da tela não deve voltar para quem está compartilhando.
    const own = document.querySelector(`[data-key="screen-${state.me.sid}"] video`);
    if (own) own.muted = true;
  }

  function sendVoiceState() {
    const me = meMember();
    socket.emit('voice:state', {
      muted: state.muted || state.deafened,
      deafened: state.deafened || !!me?.serverDeafened,
      sharing: !!state.screenStream,
    });
  }

  function setSinkId(node) {
    if (state.speakerDeviceId && node.setSinkId) node.setSinkId(state.speakerDeviceId).catch(() => {});
  }

  // Indicador de quem está falando (círculo verde).
  function watchSpeaking(sid, stream) {
    if (!stream.getAudioTracks().length) return;
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analysers.set(sid, { analyser, source, data: new Uint8Array(analyser.fftSize) });
  }

  function unwatchSpeaking(sid) {
    analysers.get(sid)?.source.disconnect();
    analysers.delete(sid);
    state.speaking.delete(sid);
  }

  setInterval(() => {
    if (!state.server) return;
    let changed = false;
    for (const [sid, { analyser, data }] of analysers) {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const x of data) sum += (x - 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const v = voiceEntry(sid);
      const muted = sid === state.me?.sid
        ? state.muted || state.deafened || v?.silenced
        : !v || v.muted || v.silenced || state.localMuted.has(v.accountId);
      const speaking = rms > 4 && !muted;
      if (speaking !== state.speaking.has(sid)) {
        speaking ? state.speaking.add(sid) : state.speaking.delete(sid);
        changed = true;
      }
    }
    if (changed) {
      document.querySelectorAll('.avatar[data-sid]').forEach((node) => node.classList.toggle('speaking', state.speaking.has(node.dataset.sid)));
      document.querySelectorAll('#stage .tile[data-key^="user-"]').forEach((node) => node.classList.toggle('speaking', state.speaking.has(node.dataset.key.slice(5))));
    }
  }, 100);

  // ---------------- voz (WebRTC) ----------------
  async function joinVoice(channel) {
    if (state.voiceChannel) leaveVoice();
    state.micStream = await getMicStream();
    const res = await call('voice:join', { channel });
    if (!res) {
      state.micStream.getTracks().forEach((t) => t.stop());
      state.micStream = null;
      return;
    }
    state.voiceChannel = channel;
    state.view = 'voice';
    watchSpeaking(state.me.sid, state.micStream);
    applyAudio();
    // Quem entra inicia a conexão com todos que já estavam na sala.
    for (const sid of res.peers) getPeer(sid);
    sendVoiceState();
    render();
  }

  function leaveVoice(notify = true) {
    if (!state.voiceChannel) return;
    stopScreenShare(false);
    for (const sid of [...state.peers.keys()]) closePeer(sid);
    state.micStream?.getTracks().forEach((t) => t.stop());
    state.micStream = null;
    unwatchSpeaking(state.me.sid);
    state.voiceChannel = null;
    state.view = 'chat';
    if (notify && socket.connected) socket.emit('voice:leave');
    render();
  }

  socket.on('voice:force-leave', ({ reason }) => {
    leaveVoice(false);
    toast(reason, 'info');
  });

  socket.on('voice:force-move', ({ channel, by }) => {
    joinVoice(channel);
    toast(`${by} moveu você para ${channelById(channel)?.name || 'outro canal'}.`, 'info');
  });

  socket.on('voice:stop-share', () => {
    stopScreenShare(false);
    toast('Você não pode mais compartilhar a tela.');
  });

  function getPeer(sid) {
    let peer = state.peers.get(sid);
    if (peer) return peer;

    const pc = new RTCPeerConnection({ iceServers: state.iceServers });
    peer = {
      pc,
      polite: state.me.sid < sid, // "perfect negotiation": o educado cede em caso de colisão
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      micStream: null,
      screenStream: null,
      audioEl: null,
      remoteScreenId: null,
      screenSenders: [],
    };
    state.peers.set(sid, peer);

    for (const track of state.micStream.getTracks()) pc.addTrack(track, state.micStream);
    if (state.screenStream) addScreenTracks(peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('signal', { to: sid, data: { description: pc.localDescription, screen: state.screenStream?.id } });
      } catch (err) {
        console.error(err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('signal', { to: sid, data: { candidate } });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
    };

    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] || new MediaStream([track]);
      const isScreen = track.kind === 'video' || stream.id === peer.remoteScreenId;
      if (isScreen) {
        peer.screenStream = stream;
        stream.onremovetrack = () => {
          if (!stream.getTracks().length) {
            peer.screenStream = null;
            renderStage();
          }
        };
        if (state.view === 'voice') renderStage();
        return;
      }
      peer.micStream = stream;
      if (!peer.audioEl) {
        peer.audioEl = new Audio();
        peer.audioEl.autoplay = true;
        setSinkId(peer.audioEl);
      }
      peer.audioEl.srcObject = stream;
      peer.audioEl.play().catch(() => {});
      applyAudio();
      unwatchSpeaking(sid);
      watchSpeaking(sid, stream);
    };

    return peer;
  }

  function closePeer(sid) {
    const peer = state.peers.get(sid);
    if (!peer) return;
    peer.pc.close();
    if (peer.audioEl) peer.audioEl.srcObject = null;
    unwatchSpeaking(sid);
    state.peers.delete(sid);
  }

  socket.on('signal', async ({ from, data }) => {
    if (!state.voiceChannel) return;
    const peer = getPeer(from);
    const { pc } = peer;
    try {
      if (data.description) {
        // Uma resposta ainda sendo aplicada não conta como colisão; sem isso,
        // uma oferta que chega logo depois da resposta seria descartada.
        const readyForOffer = !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingRemoteAnswer);
        const offerCollision = data.description.type === 'offer' && !readyForOffer;
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        peer.remoteScreenId = data.screen || null;
        peer.settingRemoteAnswer = data.description.type === 'answer';
        try {
          await pc.setRemoteDescription(data.description);
        } finally {
          peer.settingRemoteAnswer = false;
        }
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          socket.emit('signal', { to: from, data: { description: pc.localDescription, screen: state.screenStream?.id } });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.error('Erro de sinalização:', err);
    }
  });

  socket.on('voice:peer-left', ({ id }) => {
    closePeer(id);
    if (state.view === 'voice') renderStage();
  });

  // ---------------- compartilhamento de tela ----------------
  function addScreenTracks(peer) {
    for (const track of state.screenStream.getTracks()) {
      peer.screenSenders.push(peer.pc.addTrack(track, state.screenStream));
    }
  }

  async function startScreenShare() {
    if (!navigator.mediaDevices.getDisplayMedia) return toast('Seu navegador não suporta compartilhamento de tela.');
    try {
      state.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true, // áudio da aba/sistema quando o navegador permitir
      });
    } catch {
      return; // usuário cancelou
    }
    const [video] = state.screenStream.getVideoTracks();
    video.contentHint = 'detail';
    video.onended = () => stopScreenShare(); // botão "Parar compartilhamento" do navegador
    for (const peer of state.peers.values()) addScreenTracks(peer);
    sendVoiceState();
    state.view = 'voice';
    render();
  }

  function stopScreenShare(notify = true) {
    if (!state.screenStream) return;
    state.screenStream.getTracks().forEach((t) => t.stop());
    state.screenStream = null;
    for (const peer of state.peers.values()) {
      for (const sender of peer.screenSenders) {
        try { peer.pc.removeTrack(sender); } catch {}
      }
      peer.screenSenders = [];
    }
    if (notify) sendVoiceState();
    render();
  }

  // ---------------- botões ----------------
  $('#btn-mute').onclick = () => {
    if (state.deafened) {
      state.deafened = false;
      state.muted = false;
    } else {
      state.muted = !state.muted;
    }
    applyAudio();
    sendVoiceState();
    renderControls();
  };

  $('#btn-deafen').onclick = () => {
    state.deafened = !state.deafened;
    applyAudio();
    sendVoiceState();
    renderControls();
  };

  $('#btn-share').onclick = () => (state.screenStream ? stopScreenShare() : startScreenShare());
  $('#btn-leave').onclick = () => leaveVoice();

  // Atalho estilo Discord: Ctrl+Shift+M muta, Ctrl+Shift+D ensurdece.
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey || !state.me) return;
    if (e.key.toLowerCase() === 'm') { e.preventDefault(); $('#btn-mute').click(); }
    if (e.key.toLowerCase() === 'd') { e.preventDefault(); $('#btn-deafen').click(); }
  });

  // ---------------- configurações do usuário ----------------
  $('#btn-settings').onclick = async () => {
    $('#profile-color').value = meMember().color;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const fill = (select, kind, current) => {
      select.innerHTML = '<option value="">Padrão</option>';
      for (const d of devices.filter((d) => d.kind === kind)) {
        select.append(new Option(d.label || kind, d.deviceId, false, d.deviceId === current));
      }
    };
    fill($('#mic-select'), 'audioinput', state.micDeviceId);
    fill($('#speaker-select'), 'audiooutput', state.speakerDeviceId);
    $('#speaker-select').disabled = !('setSinkId' in HTMLMediaElement.prototype);
    $('#noise-toggle').checked = state.noiseSuppression;
    $('#settings').classList.remove('hidden');
  };

  $('#btn-logout').onclick = async () => {
    await call('logout', { token: localStorage.getItem('token') });
    localStorage.removeItem('token');
    location.reload();
  };

  $('#settings-close').onclick = async () => {
    $('#settings').classList.add('hidden');
    if ($('#profile-color').value !== meMember().color) call('profile', { color: $('#profile-color').value });
    const mic = $('#mic-select').value;
    const speaker = $('#speaker-select').value;
    const noise = $('#noise-toggle').checked;
    const micChanged = mic !== state.micDeviceId || noise !== state.noiseSuppression;
    state.micDeviceId = mic;
    state.speakerDeviceId = speaker;
    state.noiseSuppression = noise;
    localStorage.setItem('micDeviceId', mic);
    localStorage.setItem('speakerDeviceId', speaker);
    localStorage.setItem('noiseSuppression', noise);

    for (const p of state.peers.values()) if (p.audioEl) setSinkId(p.audioEl);
    document.querySelectorAll('#stage video').forEach(setSinkId);

    // Troca o microfone sem derrubar a chamada.
    if (micChanged && state.voiceChannel) {
      const old = state.micStream;
      state.micStream = await getMicStream();
      const [track] = state.micStream.getAudioTracks();
      for (const p of state.peers.values()) {
        const sender = p.pc.getSenders().find((s) => s.track && old.getTracks().includes(s.track));
        if (sender) await sender.replaceTrack(track);
      }
      old.getTracks().forEach((t) => t.stop());
      applyAudio();
      unwatchSpeaking(state.me.sid);
      watchSpeaking(state.me.sid, state.micStream);
    }
  };

  window.addEventListener('beforeunload', () => leaveVoice());
})();
