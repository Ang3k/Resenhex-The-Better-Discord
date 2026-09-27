// Front-end do clone do Discord.
// Chat de texto via Socket.IO; voz, câmera e tela via WebRTC em malha (cada pessoa
// conecta diretamente com as outras da sala; o servidor só repassa a sinalização).
// Cargos e moderação são validados no servidor; aqui só escondemos o que a pessoa não pode usar.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const socket = io({ autoConnect: false });

  const EMOJIS = ['👍', '👎', '😂', '🤣', '❤️', '🔥', '😮', '😢', '😭', '😡', '🎉', '👀', '💀', '🙏', '😎', '🤔',
    '🥳', '👏', '💯', '✅', '❌', '😅', '😍', '🥺', '😤', '🤡', '🗿', '👑', '⚡', '🎮', '🍕', '🍺'];

  // Perfis de transmissão de tela. "hint" diz ao codificador o tipo de conteúdo e
  // "degradation" decide o que sacrificar quando falta internet: nitidez ou fluidez.
  const SHARE_PRESETS = {
    text: { label: '📄 Texto e código', desc: 'Máxima nitidez · 1080p 15 fps', width: 1920, height: 1080, fps: 15, hint: 'text', degradation: 'maintain-resolution', bitrate: 2_500_000, codecs: ['video/VP9', 'video/VP8'] },
    balanced: { label: '⚖️ Equilibrado', desc: 'Uso geral · 1080p 30 fps', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'balanced', bitrate: 4_000_000, codecs: ['video/VP9', 'video/VP8'] },
    motion: { label: '🎮 Jogos e vídeos', desc: 'Mais fluido · 720p 60 fps', width: 1280, height: 720, fps: 60, hint: 'motion', degradation: 'maintain-framerate', bitrate: 5_000_000, codecs: ['video/H264', 'video/VP8'] },
  };

  const state = {
    me: null, // { accountId, sid }
    server: null, // último 'state' do servidor: roles, channels, members, voice, myPerms, bans, ownerId
    permNames: {},
    maxUploadMb: 25,
    messages: {}, // idDoCanal -> mensagens (carregadas sob demanda)
    unread: {}, // idDoCanal -> { unread, mentions }
    textChannel: null,
    view: 'chat', // 'chat' | 'voice'
    voiceChannel: null,
    muted: false,
    deafened: false,
    micStream: null,
    local: { screen: null, camera: null }, // meus streams de vídeo
    sharePreset: SHARE_PRESETS[localStorage.getItem('sharePreset')] ? localStorage.getItem('sharePreset') : 'balanced',
    sharePaused: false,
    uploadMbps: Number(localStorage.getItem('uploadMbps')) || 10,
    peers: new Map(), // sid -> conexão WebRTC com cada participante da sala
    micDeviceId: localStorage.getItem('micDeviceId') || '',
    speakerDeviceId: localStorage.getItem('speakerDeviceId') || '',
    noiseSuppression: localStorage.getItem('noiseSuppression') !== 'false',
    ptt: JSON.parse(localStorage.getItem('ptt') || '{"enabled":false,"code":"Backquote","label":"`"}'),
    pttHeld: false,
    notify: localStorage.getItem('notify') !== 'false',
    localVolume: JSON.parse(localStorage.getItem('localVolume') || '{}'), // accountId -> 0..1
    localMuted: new Set(JSON.parse(localStorage.getItem('localMuted') || '[]')),
    speaking: new Set(), // sids
    editing: null, // id da mensagem sendo editada
    replyTo: null, // mensagem sendo respondida
    pending: [], // anexos do rascunho
    voiceSnapshot: null, // para tocar sons quando alguém entra/sai da sala
    removed: false,
  };

  let audioCtx = null;
  const analysers = new Map(); // sid -> { analyser, source, data }

  // ---------------- utilidades ----------------
  function toast(text, kind = 'error') {
    const node = $('#toast');
    node.textContent = text;
    node.className = kind;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => node.classList.add('hidden'), 4500);
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

  const formatUntil = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  const isTyping = (target) => target && (target.matches?.('input, textarea, select') || target.isContentEditable);

  // ---------------- cargos e permissões (espelho do servidor) ----------------
  const member = (id) => state.server?.members.find((m) => m.id === id);
  const meMember = () => member(state.me.accountId);
  const roleIdx = (id) => state.server.roles.findIndex((r) => r.id === id);
  const roleById = (id) => state.server.roles.find((r) => r.id === id);
  const isOwner = (id) => id === state.server.ownerId;
  const hasPerm = (p) => state.server?.myPerms.includes(p);
  const timedOut = (m) => m && m.timeoutUntil > Date.now();
  const canSend = () => hasPerm('SEND_MESSAGES') && !timedOut(meMember());
  const canVideo = () => hasPerm('STREAM') && !timedOut(meMember());

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

  const fmtCtx = { member: (id) => member(id), role: (id) => roleById(id), onUser: (id, e) => openMemberMenu(id, e) };

  function mentionsMe(msg) {
    const m = msg.mentions;
    if (!m || !state.me || msg.authorId === state.me.accountId) return false;
    const mine = meMember();
    return m.everyone || m.users.includes(state.me.accountId) || (mine && m.roles.some((r) => mine.roles.includes(r)));
  }

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
        showLogin();
        return toast(res.error);
      }
      localStorage.setItem('token', res.token);
      if (payload.name) localStorage.setItem('name', payload.name);
      state.me = { accountId: res.accountId, sid: res.sid };
      state.permNames = res.permNames;
      state.iceServers = res.iceServers;
      state.maxUploadMb = res.maxUploadMb;
      $('#login-password').value = '';
      $('#server-password').value = '';
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      call('chat:unread').then((r) => {
        if (!r) return;
        state.unread = r.unread;
        if (state.server) render();
      });
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
    playVoiceSounds();
    applyAudio();
    tuneSenders();
    render();
  });

  // Sons quando alguém entra, sai ou começa a transmitir na minha sala.
  function playVoiceSounds() {
    const prev = state.voiceSnapshot;
    if (!state.voiceChannel) {
      state.voiceSnapshot = null;
      return;
    }
    const others = voiceEntries(state.voiceChannel).filter((v) => v.sid !== state.me.sid);
    const snap = { channel: state.voiceChannel, sids: new Set(others.map((v) => v.sid)), live: new Set(others.filter((v) => v.sharing).map((v) => v.sid)) };
    state.voiceSnapshot = snap;
    if (!prev || prev.channel !== snap.channel) return;
    if ([...snap.sids].some((sid) => !prev.sids.has(sid))) Sounds.play('join');
    else if ([...prev.sids].some((sid) => !snap.sids.has(sid))) Sounds.play('leave');
    else if ([...snap.live].some((sid) => !prev.live.has(sid))) Sounds.play('stream');
  }

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
    updateTitle();
    // Só redesenha as configurações se algo delas mudou; senão perderia o que está sendo editado.
    const settingsKey = JSON.stringify([state.server.roles, state.server.channels, state.server.bans, state.server.myPerms, state.server.members.map((m) => m.roles)]);
    if (!$('#server-settings').classList.contains('hidden') && settingsKey !== render.settingsKey) renderServerSettings();
    render.settingsKey = settingsKey;
  }

  function updateTitle() {
    const entries = Object.entries(state.unread).filter(([id]) => channelById(id));
    const mentions = entries.reduce((n, [, u]) => n + u.mentions, 0);
    document.title = (mentions ? `(${mentions}) ` : entries.length ? '• ' : '') + 'Resenha';
  }

  function openTextChannel(id) {
    if (state.textChannel !== id) {
      state.editing = null;
      state.replyTo = null;
    }
    state.textChannel = id;
    state.view = 'chat';
    markRead(id);
    render();
    $('#chat-input').focus();
  }

  function renderChannels() {
    const tl = $('#text-channels');
    tl.innerHTML = '';
    for (const c of state.server.channels.filter((c) => c.type === 'text')) {
      const u = state.unread[c.id];
      tl.append(el('li', {
        class: 'channel' + (state.view === 'chat' && state.textChannel === c.id ? ' active' : '') + (u ? ' unread' : ''),
        onclick: () => openTextChannel(c.id),
      }, el('span', { class: 'icon', textContent: '#' }), el('span', { class: 'channel-name', textContent: c.name }),
      c.allowedRoles.length ? el('span', { class: 'lock', textContent: '🔒', title: 'Canal privado' }) : null,
      u?.mentions ? el('span', { class: 'badge', textContent: u.mentions > 99 ? '99+' : String(u.mentions) }) : null));
    }

    const vl = $('#voice-channels');
    vl.innerHTML = '';
    for (const c of state.server.channels.filter((c) => c.type === 'voice')) {
      const users = voiceEntries(c.id).map((v) => {
        const m = member(v.accountId);
        if (!m) return null;
        const flags = el('span', { class: 'flags' });
        if (v.sharing) flags.append(el('span', { class: 'live', textContent: 'AO VIVO' }), ' ');
        if (v.camera) flags.append(el('span', { title: 'Câmera ligada', textContent: '📷' }));
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
        }, el('span', { class: 'icon', textContent: '🔊' }), el('span', { class: 'channel-name', textContent: c.name }), c.allowedRoles.length ? el('span', { class: 'lock', textContent: '🔒' }) : null),
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
    if (!state.messages[c.id]) {
      state.messages[c.id] = [];
      call('chat:history', { channel: c.id }).then((res) => {
        if (!res) return;
        state.messages[c.id] = res.messages;
        if (state.textChannel === c.id) renderMessages(true);
      });
    }
    $('#notify-banner').classList.toggle('hidden', !('Notification' in window) || Notification.permission !== 'default' || !!localStorage.getItem('notifyDismissed'));
    renderComposer();
    renderMessages();
  }

  // ---------------- mensagens ----------------
  const msgNodes = new Map(); // id -> { sig, node }
  let stickToBottom = true;
  $('#messages').addEventListener('scroll', () => {
    const box = $('#messages');
    stickToBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  });
  const keepBottom = () => {
    if (stickToBottom) $('#messages').scrollTop = $('#messages').scrollHeight;
  };

  // Só reconstrói as mensagens que mudaram, para não reiniciar vídeos/áudios tocando.
  function renderMessages(scrollToEnd = false) {
    if (state.view !== 'chat') return;
    const box = $('#messages');
    if (box.dataset.channel !== state.textChannel) {
      box.innerHTML = '';
      msgNodes.clear();
      box.dataset.channel = state.textChannel;
      scrollToEnd = true;
    }
    const list = state.messages[state.textChannel] || [];
    const epoch = JSON.stringify([state.server.members.map((m) => [m.id, m.name, m.color, m.roles]), state.server.roles.map((r) => [r.id, r.name, r.color]),
      hasPerm('MANAGE_MESSAGES'), canSend(), state.replyTo?.id]);
    const nodes = [];
    let prev = null;
    for (const msg of list) {
      const continued = !!(prev && !msg.replyTo && prev.authorId === msg.authorId && (msg.authorId || prev.authorName === msg.authorName) && msg.ts - prev.ts < 5 * 60 * 1000);
      const replied = msg.replyTo ? list.find((m) => m.id === msg.replyTo) || null : null;
      const sig = JSON.stringify([msg, continued, state.editing === msg.id, epoch, replied && [replied.text, replied.authorId, !!replied.attachments]]);
      let entry = msgNodes.get(msg.id);
      if (!entry || entry.sig !== sig) {
        entry = { sig, node: buildMessage(msg, continued, replied, msg.replyTo && !replied) };
        msgNodes.set(msg.id, entry);
      }
      nodes.push(entry.node);
      prev = msg;
    }
    const wanted = new Set(nodes);
    for (const child of [...box.children]) if (!wanted.has(child)) child.remove();
    for (const [id, entry] of msgNodes) if (!wanted.has(entry.node)) msgNodes.delete(id);
    nodes.forEach((node, i) => {
      if (box.children[i] !== node) box.insertBefore(node, box.children[i] || null);
    });
    if (scrollToEnd) stickToBottom = true;
    keepBottom();
  }

  function buildMessage(msg, continued, replied, replyMissing) {
    const author = member(msg.authorId);
    const name = author?.name || msg.authorName || 'Usuário removido';
    const mine = msg.authorId === state.me.accountId;
    const row = el('div', { class: 'msg' + (continued ? ' continued' : '') + (mentionsMe(msg) ? ' mentioned' : ''), data: { id: msg.id } });

    if (replied || replyMissing) {
      const ra = replied && member(replied.authorId);
      row.append(el('div', { class: 'reply-ref', onclick: () => replied && jumpTo(replied.id) },
        el('span', { class: 'reply-curve' }),
        replied
          ? [el('span', { class: 'reply-author', style: { color: nameColor(ra) }, textContent: '@' + (ra?.name || replied.authorName || '?') }),
            el('span', { class: 'reply-snippet', textContent: Format.plain(replied.text, fmtCtx) || '📎 Anexo' })]
          : el('span', { class: 'reply-snippet', textContent: 'Mensagem original apagada' })));
    }

    const body = el('div', { class: 'msg-body' });
    if (!continued) {
      const openMenu = (e) => author && openMemberMenu(author.id, e);
      row.append(avatar(author || { name, color: msg.authorColor }));
      body.append(el('div', {},
        el('span', { class: 'msg-author', style: { color: nameColor(author) || msg.authorColor || '' }, textContent: name, onclick: openMenu, oncontextmenu: openMenu }),
        el('span', { class: 'msg-time', textContent: formatUntil(msg.ts) })));
    }

    if (state.editing === msg.id) {
      const input = el('textarea', { class: 'msg-edit', value: Format.toDisplay(msg.text, fmtCtx), maxLength: 4000, rows: 1 });
      input.onkeydown = async (e) => {
        if (e.key === 'Escape') { state.editing = null; renderMessages(); }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = Format.toRaw(input.value.trim(), state.server.members, state.server.roles);
          state.editing = null;
          if (text !== msg.text && (text || msg.attachments?.length)) await call('chat:edit', { channel: state.textChannel, id: msg.id, text });
          renderMessages();
        }
      };
      input.oninput = () => autoresize(input);
      body.append(input, el('div', { class: 'muted-text', textContent: 'Esc para cancelar • Enter para salvar' }));
      setTimeout(() => { autoresize(input); input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
    } else if (msg.text) {
      const onlyEmoji = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,20}$/u.test(msg.text) && !/\d/.test(msg.text);
      body.append(el('div', { class: 'msg-text' + (onlyEmoji ? ' jumbo' : '') }, Format.render(msg.text, fmtCtx),
        msg.edited ? el('span', { class: 'edited', textContent: ' (editado)', title: formatUntil(msg.edited) }) : null));
    }

    if (msg.attachments?.length) body.append(el('div', { class: 'attachments' }, msg.attachments.map(attachmentNode)));

    const reactions = Object.entries(msg.reactions || {});
    if (reactions.length) {
      body.append(el('div', { class: 'reactions' },
        reactions.map(([emoji, users]) => el('button', {
          class: 'reaction' + (users.includes(state.me.accountId) ? ' mine' : ''),
          title: users.map((id) => member(id)?.name || '?').join(', '),
          onclick: () => react(msg.id, emoji),
        }, emoji, el('span', { textContent: String(users.length) }))),
        canSend() ? el('button', { class: 'reaction add', title: 'Adicionar reação', textContent: '＋', onclick: (e) => openEmojiPicker(e.currentTarget, (em) => react(msg.id, em)) }) : null));
    }
    row.append(body);

    const actions = el('div', { class: 'msg-actions' });
    if (canSend()) {
      actions.append(el('button', { title: 'Reagir', textContent: '😀', onclick: (e) => openEmojiPicker(e.currentTarget, (em) => react(msg.id, em)) }));
      actions.append(el('button', { title: 'Responder', textContent: '↩️', onclick: () => startReply(msg) }));
    }
    if (mine && canSend()) actions.append(el('button', { title: 'Editar', textContent: '✏️', onclick: () => { state.editing = msg.id; renderMessages(); } }));
    if (mine || hasPerm('MANAGE_MESSAGES')) {
      actions.append(el('button', {
        title: 'Apagar (Shift+clique apaga sem perguntar)',
        textContent: '🗑️',
        onclick: (e) => {
          if (e.shiftKey || confirm('Apagar esta mensagem?')) call('chat:delete', { channel: state.textChannel, id: msg.id });
        },
      }));
    }
    if (actions.childElementCount) row.append(actions);
    return row;
  }

  function attachmentNode(a) {
    if (a.type.startsWith('image/')) {
      const img = el('img', { src: a.url, alt: a.name, loading: 'lazy', onclick: () => openLightbox(a), onload: keepBottom });
      return el('div', { class: 'att-image' }, img);
    }
    if (a.type.startsWith('video/')) return el('video', { class: 'att-video', src: a.url, controls: true, preload: 'metadata', onloadedmetadata: keepBottom });
    const file = el('a', { class: 'att-file', href: a.url, download: a.name, title: 'Baixar' },
      el('span', { class: 'att-icon', textContent: a.type.startsWith('audio/') ? '🎵' : '📄' }),
      el('div', { class: 'att-info' }, el('div', { class: 'att-name', textContent: a.name }), el('div', { class: 'muted-text', textContent: formatSize(a.size) })),
      el('span', { textContent: '⬇️' }));
    if (a.type.startsWith('audio/')) return el('div', { class: 'att-audio' }, file, el('audio', { src: a.url, controls: true, preload: 'none' }));
    return file;
  }

  function openLightbox(a) {
    const box = $('#lightbox');
    box.querySelector('img').src = a.url;
    box.querySelector('a').href = a.url;
    box.classList.remove('hidden');
  }
  $('#lightbox').onclick = (e) => { if (e.target.tagName !== 'A') $('#lightbox').classList.add('hidden'); };

  function jumpTo(id) {
    const node = $('#messages').querySelector(`[data-id="${id}"]`);
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.classList.remove('flash');
    void node.offsetWidth;
    node.classList.add('flash');
  }

  const react = (id, emoji) => call('chat:react', { channel: state.textChannel, id, emoji });

  function startReply(msg) {
    state.replyTo = msg;
    renderComposer();
    renderMessages();
    $('#chat-input').focus();
  }

  // ---------------- caixa de mensagem ----------------
  function autoresize(input = $('#chat-input')) {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 240) + 'px';
  }

  function renderComposer() {
    const c = channelById(state.textChannel);
    const input = $('#chat-input');
    const me = meMember();
    if (timedOut(me)) {
      input.disabled = true;
      input.placeholder = '⏳ Você está de castigo até ' + formatUntil(me.timeoutUntil);
    } else if (!hasPerm('SEND_MESSAGES')) {
      input.disabled = true;
      input.placeholder = 'Você não tem permissão para enviar mensagens.';
    } else {
      input.disabled = false;
      input.placeholder = 'Conversar em #' + (c?.name || '');
    }
    $('#btn-attach').disabled = input.disabled;
    $('#btn-emoji').disabled = input.disabled;

    const reply = state.replyTo;
    $('#reply-bar').classList.toggle('hidden', !reply);
    if (reply) {
      const ra = member(reply.authorId);
      $('#reply-text').replaceChildren('Respondendo a ', el('strong', { style: { color: nameColor(ra) }, textContent: ra?.name || reply.authorName || '?' }));
    }

    const bar = $('#attachments-bar');
    bar.classList.toggle('hidden', !state.pending.length);
    bar.replaceChildren(...state.pending.map((p) => el('div', { class: 'pending' + (p.uploading ? ' uploading' : '') },
      p.preview ? el('img', { src: p.preview, alt: '' }) : el('div', { class: 'att-icon', textContent: '📄' }),
      el('div', { class: 'pending-name', textContent: p.name }),
      el('div', { class: 'muted-text', textContent: p.uploading ? 'enviando…' : formatSize(p.size) }),
      el('button', { type: 'button', class: 'pending-remove', title: 'Remover', textContent: '✕', onclick: () => removePending(p) }))));
  }

  function removePending(p) {
    state.pending = state.pending.filter((x) => x !== p);
    if (p.preview) URL.revokeObjectURL(p.preview);
    renderComposer();
  }

  async function uploadFiles(files) {
    if (!canSend()) return toast('Você não pode enviar arquivos agora.');
    for (const file of files) {
      if (state.pending.length >= 10) return toast('No máximo 10 arquivos por mensagem.');
      if (file.size > state.maxUploadMb * 1024 * 1024) {
        toast(`"${file.name}" é maior que ${state.maxUploadMb} MB.`);
        continue;
      }
      const item = { name: file.name || 'imagem.png', size: file.size, uploading: true, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null };
      state.pending.push(item);
      renderComposer();
      fetch('/upload', {
        method: 'POST',
        headers: { 'x-token': localStorage.getItem('token'), 'x-filename': encodeURIComponent(item.name), 'content-type': 'application/octet-stream' },
        body: file,
      })
        .then((r) => r.json().catch(() => ({ error: 'Falha no envio (' + r.status + ')' })))
        .catch(() => ({ error: 'Falha no envio' }))
        .then((res) => {
          if (!state.pending.includes(item)) return;
          if (res.error) {
            toast(res.error);
            removePending(item);
            return;
          }
          Object.assign(item, res, { uploading: false });
          renderComposer();
        });
    }
  }

  async function sendMessage() {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (state.pending.some((p) => p.uploading)) return toast('Espere os arquivos terminarem de enviar.', 'info');
    if (!text && !state.pending.length) return;
    const draft = { value: input.value, pending: state.pending, replyTo: state.replyTo };
    const payload = {
      channel: state.textChannel,
      text: Format.toRaw(text, state.server.members, state.server.roles),
      attachments: state.pending.map((p) => p.id),
      replyTo: state.replyTo?.id,
    };
    input.value = '';
    state.pending = [];
    state.replyTo = null;
    autoresize();
    renderComposer();
    renderMessages();
    const res = await call('chat:send', payload);
    if (!res && !input.value) {
      // Deu erro: devolve o rascunho.
      input.value = draft.value;
      state.pending = draft.pending;
      state.replyTo = draft.replyTo;
      autoresize();
      renderComposer();
      return;
    }
    draft.pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
  }

  $('#chat-form').addEventListener('submit', (e) => e.preventDefault());
  $('#btn-attach').onclick = () => $('#file-input').click();
  $('#file-input').onchange = (e) => {
    uploadFiles([...e.target.files]);
    e.target.value = '';
  };
  $('#btn-emoji').onclick = (e) => openEmojiPicker(e.currentTarget, (emoji) => insertAtCursor(emoji));
  $('#reply-cancel').onclick = () => { state.replyTo = null; renderComposer(); renderMessages(); };

  function insertAtCursor(text) {
    const input = $('#chat-input');
    const start = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(input.selectionEnd ?? start);
    input.focus();
    input.setSelectionRange(start + text.length, start + text.length);
    autoresize();
  }

  // Colar print (Ctrl+V) e arrastar arquivos para o chat.
  $('#chat-input').addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    uploadFiles(files);
  });
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  $('#chat-view').addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    $('#drop-overlay').classList.remove('hidden');
  });
  $('#chat-view').addEventListener('dragleave', () => {
    if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').classList.add('hidden'); }
  });
  $('#chat-view').addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  $('#chat-view').addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('#drop-overlay').classList.add('hidden');
    uploadFiles([...e.dataTransfer.files]);
  });

  // Autocompletar menções ao digitar "@".
  let ac = null; // { items, index, start }
  function updateAutocomplete() {
    const input = $('#chat-input');
    const before = input.value.slice(0, input.selectionStart);
    const m = /(^|\s)@([^\s@]{0,32})$/.exec(before);
    if (!m) return closeAutocomplete();
    const q = m[2].toLowerCase();
    const items = [];
    for (const mem of state.server.members) {
      if (mem.name.toLowerCase().includes(q)) items.push({ insert: '@' + mem.name, label: mem.name, color: nameColor(mem), member: mem });
    }
    for (const r of state.server.roles.slice(1)) {
      if (r.name.toLowerCase().includes(q)) items.push({ insert: '@' + r.name, label: '@' + r.name, color: r.color, note: 'cargo' });
    }
    if (hasPerm('MENTION_EVERYONE')) {
      if ('everyone'.startsWith(q)) items.push({ insert: '@everyone', label: '@everyone', note: 'avisa todo mundo' });
      if ('here'.startsWith(q)) items.push({ insert: '@here', label: '@here', note: 'avisa todo mundo' });
    }
    items.sort((a, b) => Number(!a.label.toLowerCase().replace('@', '').startsWith(q)) - Number(!b.label.toLowerCase().replace('@', '').startsWith(q)));
    if (!items.length) return closeAutocomplete();
    ac = { items: items.slice(0, 8), index: 0, start: before.length - m[2].length - 1 };
    renderAutocomplete();
  }

  function renderAutocomplete() {
    const box = $('#autocomplete');
    box.classList.remove('hidden');
    box.replaceChildren(el('div', { class: 'menu-section', textContent: 'MEMBROS E CARGOS' }), ...ac.items.map((item, i) => el('button', {
      type: 'button',
      class: 'ac-item' + (i === ac.index ? ' active' : ''),
      onmousedown: (e) => { e.preventDefault(); applyAutocomplete(item); },
    }, item.member ? avatar(item.member, 'small') : el('span', { class: 'ac-at', textContent: '@' }),
    el('span', { style: { color: item.color || '' }, textContent: item.label }),
    item.note ? el('span', { class: 'muted-text', textContent: item.note }) : null)));
  }

  function closeAutocomplete() {
    ac = null;
    $('#autocomplete').classList.add('hidden');
  }

  function applyAutocomplete(item) {
    const input = $('#chat-input');
    const end = input.selectionStart;
    input.value = input.value.slice(0, ac.start) + item.insert + ' ' + input.value.slice(end);
    const pos = ac.start + item.insert.length + 1;
    input.setSelectionRange(pos, pos);
    closeAutocomplete();
    input.focus();
  }

  $('#chat-input').addEventListener('keydown', (e) => {
    if (ac) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        ac.index = (ac.index + (e.key === 'ArrowDown' ? 1 : -1) + ac.items.length) % ac.items.length;
        return renderAutocomplete();
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        return applyAutocomplete(ac.items[ac.index]);
      }
      if (e.key === 'Escape') return closeAutocomplete();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      return sendMessage();
    }
    if (e.key === 'Escape' && state.replyTo) {
      state.replyTo = null;
      renderComposer();
      renderMessages();
    }
    // Seta para cima edita a última mensagem, como no Discord.
    if (e.key === 'ArrowUp' && !e.target.value) {
      const mine = (state.messages[state.textChannel] || []).filter((m) => m.authorId === state.me.accountId);
      if (!mine.length) return;
      e.preventDefault();
      state.editing = mine[mine.length - 1].id;
      renderMessages();
    }
  });

  let lastTyping = 0;
  $('#chat-input').addEventListener('input', () => {
    autoresize();
    updateAutocomplete();
    if (Date.now() - lastTyping > 2000 && $('#chat-input').value) {
      lastTyping = Date.now();
      socket.emit('typing', { channel: state.textChannel });
    }
  });
  $('#chat-input').addEventListener('blur', () => setTimeout(closeAutocomplete, 100));

  // ---------------- seletor de emoji ----------------
  function openEmojiPicker(anchor, onPick) {
    const picker = $('#emoji-picker');
    picker.replaceChildren(...EMOJIS.map((emoji) => el('button', {
      type: 'button',
      textContent: emoji,
      onclick: () => { picker.classList.add('hidden'); onPick(emoji); },
    })));
    picker.classList.remove('hidden');
    const a = anchor.getBoundingClientRect();
    const p = picker.getBoundingClientRect();
    picker.style.left = Math.max(8, Math.min(a.right - p.width, innerWidth - p.width - 8)) + 'px';
    picker.style.top = (a.top - p.height - 8 > 8 ? a.top - p.height - 8 : a.bottom + 8) + 'px';
  }

  // ---------------- não lidas e notificações ----------------
  const isViewing = (channel) => state.view === 'chat' && state.textChannel === channel && document.visibilityState === 'visible' && document.hasFocus();

  function markRead(channel) {
    if (!channel) return;
    if (state.unread[channel]) {
      delete state.unread[channel];
      renderChannels();
      updateTitle();
    }
    socket.emit('chat:read', { channel }, () => {});
  }

  window.addEventListener('focus', () => { if (state.me && state.view === 'chat') markRead(state.textChannel); });
  document.addEventListener('visibilitychange', () => {
    if (state.me && document.visibilityState === 'visible' && state.view === 'chat') markRead(state.textChannel);
  });

  function notify(msg, channel) {
    if (!state.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    const author = member(msg.authorId)?.name || 'Alguém';
    const n = new Notification(`${author} em #${channelById(channel)?.name || ''}`, {
      body: Format.plain(msg.text, fmtCtx).slice(0, 200) || '📎 Anexo',
      tag: channel,
      silent: true,
    });
    n.onclick = () => {
      window.focus();
      openTextChannel(channel);
      n.close();
    };
  }

  $('#notify-enable').onclick = async () => {
    const result = await Notification.requestPermission();
    state.notify = result === 'granted';
    localStorage.setItem('notify', state.notify);
    $('#notify-banner').classList.add('hidden');
    if (state.notify) toast('Notificações ativadas!', 'info');
  };
  $('#notify-dismiss').onclick = () => {
    localStorage.setItem('notifyDismissed', '1');
    $('#notify-banner').classList.add('hidden');
  };

  // ---------------- chat (eventos) ----------------
  socket.on('chat:message', ({ channel, msg }) => {
    state.messages[channel]?.push(msg);
    if (msg.authorId !== state.me?.accountId) {
      if (isViewing(channel)) markRead(channel);
      else {
        const u = (state.unread[channel] ||= { unread: true, mentions: 0 });
        if (mentionsMe(msg)) {
          u.mentions++;
          Sounds.play('mention');
          notify(msg, channel);
        }
        renderChannels();
        updateTitle();
      }
    }
    if (channel === state.textChannel) renderMessages(msg.authorId === state.me?.accountId);
  });

  socket.on('chat:update', ({ channel, msg }) => {
    const list = state.messages[channel];
    const i = list ? list.findIndex((m) => m.id === msg.id) : -1;
    if (i >= 0) list[i] = msg;
    if (channel === state.textChannel) renderMessages();
  });

  socket.on('chat:delete', ({ channel, id }) => {
    if (state.messages[channel]) state.messages[channel] = state.messages[channel].filter((m) => m.id !== id);
    if (state.replyTo?.id === id) {
      state.replyTo = null;
      renderComposer();
    }
    if (channel === state.textChannel) renderMessages();
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

  // Palco de voz: um bloco por participante (com câmera, se ligada) + um bloco grande por tela compartilhada.
  function renderStage() {
    const stage = $('#stage');
    const wanted = new Set();

    for (const v of voiceEntries(state.voiceChannel)) {
      const m = member(v.accountId);
      if (!m) continue;
      const self = v.sid === state.me.sid;
      const remote = self ? state.local : state.peers.get(v.sid)?.remote || {};
      if (v.sharing && remote.screen) {
        const key = 'screen-' + v.sid;
        wanted.add(key);
        let tile = stage.querySelector(`[data-key="${key}"]`);
        if (!tile) {
          const video = el('video', { autoplay: true, playsInline: true });
          video.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen());
          tile = el('div', { class: 'tile screen', data: { key } }, video,
            el('div', { class: 'paused-overlay hidden' }, el('div', { class: 'paused-title', textContent: '⏸ Transmissão pausada' }),
              el('div', { class: 'muted-text', textContent: 'A janela compartilhada foi minimizada. Ela volta sozinha quando a janela for restaurada.' })),
            el('div', { class: 'stats' }), el('div', { class: 'label' }));
          stage.prepend(tile);
        }
        tile.querySelector('.paused-overlay').classList.toggle('hidden', !v.paused);
        const video = tile.querySelector('video');
        if (video.srcObject !== remote.screen) {
          video.srcObject = remote.screen;
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
        }, avatar(m, '', v.sid), el('video', { class: 'cam hidden' + (self ? ' mirror' : ''), autoplay: true, playsInline: true, muted: true }), el('div', { class: 'label' }));
        stage.append(tile);
      }
      const cam = tile.querySelector('video.cam');
      const camStream = v.camera ? remote.camera : null;
      if (cam.srcObject !== camStream) cam.srcObject = camStream;
      cam.classList.toggle('hidden', !camStream);
      tile.querySelector('.avatar').classList.toggle('hidden', !!camStream);
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
    mute.title = forcedMute ? 'Silenciado pelo servidor' : 'Microfone (Ctrl+Shift+M)';
    const deafen = $('#btn-deafen');
    deafen.classList.toggle('off', state.deafened || me.serverDeafened);
    deafen.classList.toggle('locked', !!me.serverDeafened);
    deafen.textContent = state.deafened || me.serverDeafened ? '🙉' : '🎧';
    deafen.title = me.serverDeafened ? 'Ensurdecido pelo servidor' : 'Fone de ouvido (Ctrl+Shift+D)';
    for (const [id, kind, on, off] of [['#btn-share', 'screen', 'Qualidade / parar transmissão', 'Compartilhar tela'], ['#btn-camera', 'camera', 'Desligar câmera', 'Ligar câmera']]) {
      const btn = $(id);
      btn.classList.toggle('on', !!state.local[kind]);
      btn.disabled = !state.local[kind] && !canVideo();
      btn.title = state.local[kind] ? on : btn.disabled ? 'Sem permissão para vídeo' : off;
    }
  }

  // ---------------- menu de membro (clique direito) ----------------
  function closeMenu() {
    $('#context-menu').classList.add('hidden');
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) closeMenu();
    if (!e.target.closest('#emoji-picker')) $('#emoji-picker').classList.add('hidden');
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeMenu();
    $('#emoji-picker').classList.add('hidden');
    $('#lightbox').classList.add('hidden');
  });

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
    const roleChips = m.roles.map((id) => roleById(id)).filter(Boolean)
      .sort((a, b) => roleIdx(b.id) - roleIdx(a.id))
      .map((r) => el('span', { class: 'chip' }, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), r.name));
    menu.append(el('div', { class: 'menu-head' },
      avatar(m),
      el('div', {},
        el('div', { class: 'member-name', style: { color: nameColor(m) } }, m.name, isOwner(m.id) ? ' 👑' : ''),
        timedOut(m) ? el('div', { class: 'sub', textContent: '⏳ Castigo até ' + formatUntil(m.timeoutUntil) }) : null,
        el('div', { class: 'chips' }, roleChips.length ? roleChips : el('span', { class: 'muted-text', textContent: 'Sem cargos' })))));

    if (!self && canSend() && state.view === 'chat') {
      menu.append(item('💬 Mencionar', () => insertAtCursor('@' + m.name + ' ')));
    }

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

    showMenuAt(e.clientX, e.clientY);
  }

  function showMenuAt(x, y) {
    const menu = $('#context-menu');
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, innerWidth - rect.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - rect.height - 8)) + 'px';
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

  // Estou impedido de falar agora? (mudo, surdo, servidor, castigo ou push-to-talk solto)
  function selfSilent() {
    const me = meMember();
    return state.muted || state.deafened || !!me?.serverDeafened || !!me?.serverMuted || timedOut(me) || !hasPerm('SPEAK') || (state.ptt.enabled && !state.pttHeld);
  }

  // Aplica mudo/surdo (meu, do servidor e local) em tudo que toca ou transmite.
  function applyAudio() {
    if (!state.server || !state.me) return;
    const me = meMember();
    if (!me) return;
    const iCantHear = state.deafened || me.serverDeafened;
    state.micStream?.getAudioTracks().forEach((t) => (t.enabled = !selfSilent()));

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
      sharing: !!state.local.screen,
      paused: !!state.local.screen && state.sharePaused,
      camera: !!state.local.camera,
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
        ? selfSilent()
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
    if (state.voiceChannel) leaveVoice(true, false);
    state.micStream = await getMicStream();
    const res = await call('voice:join', { channel });
    if (!res) {
      state.micStream.getTracks().forEach((t) => t.stop());
      state.micStream = null;
      return;
    }
    state.voiceChannel = channel;
    state.voiceSnapshot = null;
    state.view = 'voice';
    Sounds.play('join');
    watchSpeaking(state.me.sid, state.micStream);
    applyAudio();
    // Quem entra inicia a conexão com todos que já estavam na sala.
    for (const sid of res.peers) getPeer(sid);
    sendVoiceState();
    render();
  }

  function leaveVoice(notify = true, sound = true) {
    if (!state.voiceChannel) return;
    stopVideo('screen', false);
    stopVideo('camera', false);
    for (const sid of [...state.peers.keys()]) closePeer(sid);
    state.micStream?.getTracks().forEach((t) => t.stop());
    state.micStream = null;
    unwatchSpeaking(state.me.sid);
    state.voiceChannel = null;
    state.voiceSnapshot = null;
    state.view = 'chat';
    if (sound) Sounds.play('leave');
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
    stopVideo('screen', false);
    stopVideo('camera', false);
    toast('Você não pode mais usar vídeo.');
  });

  // Ids dos meus streams de vídeo, enviados junto da negociação para o outro lado
  // saber qual trilha é tela e qual é câmera.
  const videoIds = () => ({ screen: state.local.screen?.id, camera: state.local.camera?.id });

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
      audioEl: null,
      remote: { screen: null, camera: null },
      remoteIds: { screen: null, camera: null },
      senders: { screen: [], camera: [] },
    };
    state.peers.set(sid, peer);

    for (const track of state.micStream.getTracks()) pc.addTrack(track, state.micStream);
    for (const kind of ['screen', 'camera']) if (state.local[kind]) addVideoTracks(peer, kind);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('signal', { to: sid, data: { description: pc.localDescription, video: videoIds() } });
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
      if (pc.connectionState === 'connected') tuneSenders();
    };

    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] || new MediaStream([track]);
      const kind = stream.id === peer.remoteIds.camera ? 'camera'
        : stream.id === peer.remoteIds.screen || track.kind === 'video' ? 'screen' : 'mic';
      if (kind !== 'mic') {
        peer.remote[kind] = stream;
        stream.onremovetrack = () => {
          if (!stream.getTracks().length && peer.remote[kind] === stream) {
            peer.remote[kind] = null;
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
        peer.remoteIds = { screen: data.video?.screen || null, camera: data.video?.camera || null };
        peer.settingRemoteAnswer = data.description.type === 'answer';
        try {
          await pc.setRemoteDescription(data.description);
        } finally {
          peer.settingRemoteAnswer = false;
        }
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          socket.emit('signal', { to: from, data: { description: pc.localDescription, video: videoIds() } });
        }
        tuneSenders();
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

  // ---------------- câmera e compartilhamento de tela ----------------
  // Codec preferido para cada tipo: VP9 tem ferramentas para conteúdo de tela (texto nítido
  // com pouca banda); H.264 costuma ter codificação por hardware (leve para quem está jogando).
  // Usa o primeiro codec da lista que o navegador suportar (nem todo Chromium tem H.264).
  function preferCodec(pc, sender, mimes) {
    const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
    const caps = window.RTCRtpReceiver?.getCapabilities?.('video');
    if (!transceiver?.setCodecPreferences || !caps) return;
    for (const mime of mimes) {
      const first = caps.codecs.filter((c) => c.mimeType.toLowerCase() === mime.toLowerCase()
        // VP9 perfil 0 é o compatível com todo mundo; os outros são de 10/12 bits.
        && (mime !== 'video/VP9' || !c.sdpFmtpLine || c.sdpFmtpLine.includes('profile-id=0')));
      if (!first.length) continue;
      try {
        transceiver.setCodecPreferences([...first, ...caps.codecs.filter((c) => !first.includes(c))]);
      } catch {}
      return;
    }
  }

  function addVideoTracks(peer, kind) {
    const stream = state.local[kind];
    for (const track of stream.getTracks()) {
      const sender = peer.pc.addTrack(track, stream);
      peer.senders[kind].push(sender);
      if (track.kind === 'video') preferCodec(peer.pc, sender, kind === 'screen' ? SHARE_PRESETS[state.sharePreset].codecs : ['video/VP8']);
    }
  }

  // Na malha, quem transmite envia uma cópia para cada pessoa: divide o upload entre
  // elas, para a transmissão não travar quando tem muita gente assistindo.
  function videoBitrates() {
    const viewers = Math.max(1, state.peers.size);
    const budget = state.uploadMbps * 1e6 * 0.85; // o resto fica para o áudio
    const both = state.local.screen && state.local.camera;
    return {
      screen: Math.round(Math.max(300_000, Math.min(SHARE_PRESETS[state.sharePreset].bitrate, (budget * (both ? 0.8 : 1)) / viewers))),
      camera: Math.round(Math.max(150_000, Math.min(1_200_000, (budget * (both ? 0.2 : 1)) / viewers))),
    };
  }

  function tuneSenders() {
    if (!state.local.screen && !state.local.camera) return;
    const rates = videoBitrates();
    const preset = SHARE_PRESETS[state.sharePreset];
    for (const peer of state.peers.values()) {
      for (const kind of ['screen', 'camera']) {
        for (const sender of peer.senders[kind]) {
          if (sender.track?.kind !== 'video') continue;
          const params = sender.getParameters();
          if (!params.encodings?.length) continue; // ainda negociando; tenta de novo depois
          params.encodings[0].maxBitrate = rates[kind];
          if (kind === 'screen') {
            params.encodings[0].maxFramerate = preset.fps;
            params.degradationPreference = preset.degradation;
          } else {
            params.degradationPreference = 'balanced';
          }
          sender.setParameters(params).catch(() => {});
        }
      }
    }
  }

  function applySharePreset() {
    const track = state.local.screen?.getVideoTracks()[0];
    if (!track) return;
    const p = SHARE_PRESETS[state.sharePreset];
    track.contentHint = p.hint;
    track.applyConstraints({ width: { ideal: p.width }, height: { ideal: p.height }, frameRate: { ideal: p.fps, max: p.fps } }).catch(() => {});
    tuneSenders();
  }

  function setSharePreset(key) {
    state.sharePreset = key;
    localStorage.setItem('sharePreset', key);
    applySharePreset();
  }

  function openShareMenu(anchor) {
    const menu = $('#context-menu');
    const live = !!state.local.screen;
    menu.replaceChildren(
      el('div', { class: 'menu-section', textContent: live ? 'QUALIDADE DA TRANSMISSÃO' : 'COMPARTILHAR TELA' }),
      ...Object.entries(SHARE_PRESETS).map(([key, p]) => el('button', {
        class: 'menu-item preset' + (key === state.sharePreset ? ' selected' : ''),
        onclick: () => {
          closeMenu();
          setSharePreset(key);
          if (!live) startVideo('screen');
        },
      }, el('div', { textContent: p.label }), el('div', { class: 'muted-text', textContent: p.desc }))),
      ...(live
        ? [el('div', { class: 'menu-sep' }), el('button', { class: 'menu-item danger', textContent: '⏹ Parar transmissão', onclick: () => { closeMenu(); stopVideo('screen'); } })]
        : [el('div', { class: 'menu-tip', textContent: 'Dica: para jogos, escolha "Tela inteira" e use o jogo em modo janela sem bordas. Se você compartilhar só uma janela e minimizá-la, a transmissão pausa.' })]));
    const rect = anchor.getBoundingClientRect();
    menu.classList.remove('hidden');
    showMenuAt(rect.left, rect.top - menu.getBoundingClientRect().height - 8);
  }

  async function startVideo(kind) {
    const preset = SHARE_PRESETS[state.sharePreset];
    try {
      if (kind === 'screen') {
        if (!navigator.mediaDevices.getDisplayMedia) return toast('Seu navegador não suporta compartilhamento de tela.');
        state.local.screen = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps, max: preset.fps } },
          // Áudio da aba/sistema sem os filtros de voz, que estragam música e som de jogo.
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          selfBrowserSurface: 'exclude', // não mostra a própria aba do Resenha (efeito "espelho infinito")
          surfaceSwitching: 'include', // botão "compartilhar esta guia em vez disso"
          systemAudio: 'include',
          monitorTypeSurfaces: 'include',
        });
      } else {
        state.local.camera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      }
    } catch (err) {
      if (kind === 'camera') toast('Não consegui acessar a câmera.');
      return; // usuário cancelou ou sem permissão
    }
    const video = state.local[kind].getVideoTracks()[0];
    // Botão "Parar compartilhamento" do navegador, ou câmera desconectada.
    video.onended = () => stopVideo(kind);
    if (kind === 'screen') {
      video.contentHint = preset.hint;
      state.sharePaused = false;
      // O navegador "muta" a captura quando a janela compartilhada é minimizada.
      video.onmute = () => {
        state.sharePaused = true;
        sendVoiceState();
        toast('A janela que você compartilha foi minimizada, então a transmissão pausou. Restaure a janela ou compartilhe a "Tela inteira".', 'info');
      };
      video.onunmute = () => {
        state.sharePaused = false;
        sendVoiceState();
      };
      if (video.getSettings().displaySurface === 'window') {
        toast('Você está compartilhando uma janela: se minimizá-la, a transmissão pausa. Para jogos, prefira "Tela inteira".', 'info');
      }
    }
    for (const peer of state.peers.values()) addVideoTracks(peer, kind);
    if (kind === 'screen') Sounds.play('stream');
    sendVoiceState();
    state.view = 'voice';
    render();
  }

  function stopVideo(kind, notify = true) {
    if (!state.local[kind]) return;
    state.local[kind].getTracks().forEach((t) => t.stop());
    state.local[kind] = null;
    if (kind === 'screen') state.sharePaused = false;
    for (const peer of state.peers.values()) {
      for (const sender of peer.senders[kind]) {
        try { peer.pc.removeTrack(sender); } catch {}
      }
      peer.senders[kind] = [];
    }
    if (notify) sendVoiceState();
    render();
  }

  // Estatísticas no canto da transmissão: resolução, fps, taxa e o que está limitando.
  const statsPrev = new Map(); // id do relatório -> { bytes, ts }
  function rate(key, bytes, ts) {
    const prev = statsPrev.get(key);
    statsPrev.set(key, { bytes, ts });
    if (!prev || ts <= prev.ts || bytes < prev.bytes) return null;
    return ((bytes - prev.bytes) * 8) / ((ts - prev.ts) / 1000);
  }
  // Só avisa de limitação se ela durar alguns segundos: no começo de toda transmissão
  // o WebRTC ainda está medindo a internet e sempre aparece "limitado".
  let limitedFor = 0;
  const mbps = (bps) => (bps == null ? '' : ` · ${(bps / 1e6).toFixed(1).replace('.', ',')} Mbps`);

  async function updateStreamStats() {
    if (state.view !== 'voice' || !state.voiceChannel) return;
    for (const tile of document.querySelectorAll('#stage .tile.screen')) {
      const sid = tile.dataset.key.slice('screen-'.length);
      const box = tile.querySelector('.stats');
      try {
        if (sid === state.me.sid) {
          const peer = [...state.peers.values()].find((p) => p.senders.screen.some((s) => s.track?.kind === 'video'));
          if (!peer) { box.textContent = 'Ninguém assistindo ainda'; continue; }
          const report = await peer.senders.screen.find((s) => s.track?.kind === 'video').getStats();
          report.forEach((r) => {
            if (r.type !== 'outbound-rtp' || r.kind !== 'video') return;
            const codec = report.get(r.codecId)?.mimeType?.split('/')[1] || '';
            limitedFor = r.qualityLimitationReason && r.qualityLimitationReason !== 'none' ? limitedFor + 1 : 0;
            const limit = limitedFor >= 5 ? { bandwidth: ' · ⚠️ limitado pela internet', cpu: ' · ⚠️ limitado pelo processador' }[r.qualityLimitationReason] || '' : '';
            box.textContent = `${r.frameWidth || '?'}×${r.frameHeight || '?'} · ${Math.round(r.framesPerSecond || 0)} fps${mbps(rate(r.id, r.bytesSent, r.timestamp))} por pessoa · ${codec} · ${state.peers.size} assistindo${limit}`;
          });
        } else {
          const peer = state.peers.get(sid);
          const track = peer?.remote.screen?.getVideoTracks()[0];
          const receiver = track && peer.pc.getReceivers().find((r) => r.track === track);
          if (!receiver) continue;
          const report = await receiver.getStats();
          report.forEach((r) => {
            if (r.type !== 'inbound-rtp' || r.kind !== 'video') return;
            const codec = report.get(r.codecId)?.mimeType?.split('/')[1] || '';
            box.textContent = `${r.frameWidth || '?'}×${r.frameHeight || '?'} · ${Math.round(r.framesPerSecond || 0)} fps${mbps(rate(sid + r.id, r.bytesReceived, r.timestamp))} · ${codec}`;
          });
        }
      } catch {}
    }
  }
  setInterval(updateStreamStats, 1000);

  // ---------------- botões ----------------
  $('#btn-mute').onclick = () => {
    if (state.deafened) {
      state.deafened = false;
      state.muted = false;
    } else {
      state.muted = !state.muted;
    }
    Sounds.play(state.muted ? 'mute' : 'unmute');
    applyAudio();
    sendVoiceState();
    renderControls();
  };

  $('#btn-deafen').onclick = () => {
    state.deafened = !state.deafened;
    Sounds.play(state.deafened ? 'deafen' : 'undeafen');
    applyAudio();
    sendVoiceState();
    renderControls();
  };

  $('#btn-share').onclick = (e) => {
    if (!canVideo() && !state.local.screen) return;
    openShareMenu(e.currentTarget);
  };
  $('#btn-camera').onclick = () => (state.local.camera ? stopVideo('camera') : startVideo('camera'));
  $('#btn-leave').onclick = () => leaveVoice();

  document.addEventListener('keydown', (e) => {
    if (!state.me) return;
    // Atalhos estilo Discord: Ctrl+Shift+M muta, Ctrl+Shift+D ensurdece.
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); $('#btn-mute').click(); }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); $('#btn-deafen').click(); }
    // Push-to-talk: fala enquanto a tecla estiver pressionada (fora de campos de texto).
    if (state.ptt.enabled && e.code === state.ptt.code && !e.repeat && !isTyping(e.target) && !capturingKey) {
      e.preventDefault();
      state.pttHeld = true;
      applyAudio();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (state.ptt.enabled && e.code === state.ptt.code && state.pttHeld) {
      state.pttHeld = false;
      applyAudio();
    }
  });
  window.addEventListener('blur', () => {
    if (!state.pttHeld) return;
    state.pttHeld = false;
    applyAudio();
  });

  // ---------------- configurações do usuário ----------------
  let capturingKey = false;
  const keyLabel = (e) => (e.code === 'Space' ? 'Espaço' : e.key.length === 1 ? e.key.toUpperCase() : e.key);

  function renderPttSettings() {
    $('#input-mode').value = state.ptt.enabled ? 'ptt' : 'voice';
    $('#ptt-row').classList.toggle('hidden', !state.ptt.enabled);
    $('#ptt-key').textContent = capturingKey ? 'Aperte uma tecla…' : state.ptt.label;
  }

  $('#input-mode').onchange = () => {
    state.ptt.enabled = $('#input-mode').value === 'ptt';
    state.pttHeld = false;
    localStorage.setItem('ptt', JSON.stringify(state.ptt));
    applyAudio();
    renderPttSettings();
  };

  $('#ptt-key').onclick = () => {
    capturingKey = true;
    renderPttSettings();
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      capturingKey = false;
      document.removeEventListener('keydown', onKey, true);
      if (e.key !== 'Escape') {
        state.ptt.code = e.code;
        state.ptt.label = keyLabel(e);
        localStorage.setItem('ptt', JSON.stringify(state.ptt));
      }
      renderPttSettings();
    };
    document.addEventListener('keydown', onKey, true);
  };

  $('#btn-settings').onclick = async () => {
    $('#profile-color').value = meMember().color;
    $('#sounds-toggle').checked = Sounds.enabled;
    $('#notify-toggle').checked = state.notify && 'Notification' in window && Notification.permission === 'granted';
    $('#notify-toggle').disabled = !('Notification' in window) || Notification.permission === 'denied';
    renderPttSettings();
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
    $('#upload-select').value = String(state.uploadMbps);
    $('#settings').classList.remove('hidden');
  };

  $('#upload-select').onchange = () => {
    state.uploadMbps = Number($('#upload-select').value);
    localStorage.setItem('uploadMbps', state.uploadMbps);
    tuneSenders();
  };

  $('#sounds-toggle').onchange = () => {
    Sounds.enabled = $('#sounds-toggle').checked;
    Sounds.play('message');
  };

  $('#notify-toggle').onchange = async () => {
    let on = $('#notify-toggle').checked;
    if (on && Notification.permission !== 'granted') on = (await Notification.requestPermission()) === 'granted';
    state.notify = on;
    $('#notify-toggle').checked = on;
    localStorage.setItem('notify', on);
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

  window.addEventListener('beforeunload', () => leaveVoice(true, false));
})();
