// Front-end do Resenhex (plataforma de chat e voz inspirada no Discord).
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
  const SHARE_PRESETS = MediaPolicy.presets;

  const NOISE_MODES = {
    ai: 'IA avançada (recomendado)',
    'ai-lite': 'IA leve (para computadores mais fracos)',
    browser: 'Padrão do navegador',
    off: 'Desligada',
  };

  function savedJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; }
  }
  const appearance = savedJson('appearance', {});
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
    sharePreset: SHARE_PRESETS[localStorage.getItem('sharePreset')] ? localStorage.getItem('sharePreset') : 'auto',
    sharePaused: false,
    uploadMbps: Math.min(100, Math.max(3, Number(localStorage.getItem('uploadMbps')) || 10)),
    cameraDeviceId: localStorage.getItem('cameraDeviceId') || '',
    outputVolume: Math.min(100, Math.max(0, Number(localStorage.getItem('outputVolume') ?? 100))),
    shareAudio: localStorage.getItem('shareAudio') !== 'false',
    showStreamStats: localStorage.getItem('showStreamStatsDefault') !== 'visible-v2' || localStorage.getItem('showStreamStats') !== 'false',
    theme: ['dark', 'midnight', 'contrast'].includes(appearance.theme) ? appearance.theme : 'dark',
    density: appearance.density === 'compact' ? 'compact' : 'comfortable',
    fontSize: Math.min(20, Math.max(14, Number(appearance.fontSize) || 16)),
    reduceMotion: appearance.reduceMotion === true,
    mediaHealth: '',
    captureBusy: false,
    peers: new Map(), // sid -> conexão WebRTC com cada participante da sala
    micDeviceId: localStorage.getItem('micDeviceId') || '',
    speakerDeviceId: localStorage.getItem('speakerDeviceId') || '',
    // Supressão de ruído: 'ai' (GTCRN), 'ai-lite' (RNNoise), 'browser' (do navegador) ou 'off'.
    noiseMode: NOISE_MODES[localStorage.getItem('noiseMode')] ? localStorage.getItem('noiseMode') : localStorage.getItem('noiseSuppression') === 'false' ? 'off' : 'ai',
    lastAiMode: localStorage.getItem('lastAiMode') === 'ai-lite' ? 'ai-lite' : 'ai',
    echoCancellation: localStorage.getItem('echoCancellation') !== 'false',
    // Sensibilidade de entrada: abaixo do limite (em dB) o microfone fica fechado.
    sensAuto: localStorage.getItem('sensAuto') !== 'false',
    sensThreshold: Number(localStorage.getItem('sensThreshold') || -50),
    // Efeitos sonoros (soundboard) tocados pelos outros
    sbMuted: localStorage.getItem('sbMuted') === 'true',
    sbVolume: Number(localStorage.getItem('sbVolume') ?? 0.6),
    ptt: savedJson('ptt', { enabled: false, code: 'Backquote', label: '`' }),
    pttHeld: false,
    notify: localStorage.getItem('notify') !== 'false',
    localVolume: savedJson('localVolume', {}), // accountId -> 0..1
    localMuted: new Set(savedJson('localMuted', [])),
    speaking: new Set(), // sids
    editing: null, // id da mensagem sendo editada
    replyTo: null, // mensagem sendo respondida
    pending: [], // anexos do rascunho
    voiceSnapshot: null, // para tocar sons quando alguém entra/sai da sala
    removed: false,
    showMembers: localStorage.getItem('showMembers') !== 'false',
    pinned: null, // bloco fixado no palco da chamada ('screen-<sid>' ou 'user-<sid>')
    streamVolume: savedJson('streamVolume', {}), // accountId -> 0..1 (áudio da transmissão)
    streamMuted: new Set(savedJson('streamMuted', [])),
    hiddenStreams: new Set(), // sids das transmissões que parei de assistir
    collapsed: new Set(savedJson('collapsed', [])), // categorias recolhidas
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
      if (!socket.connected) { toast('Você está desconectado. Tente novamente quando a conexão voltar.'); return resolve(null); }
      socket.timeout(10000).emit(event, payload, (error, res) => {
        if (error) { toast('A operação demorou mais que o esperado. Verifique a conexão antes de tentar novamente.'); return resolve(null); }
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
      else if (k === 'tip') node.dataset.tip = v;
      else if (k.startsWith('aria')) node.setAttribute(k.replace(/^aria([A-Z])/, (_, c) => 'aria-' + c.toLowerCase()), v);
      else node[k] = v;
    }
    node.append(...children.flat().filter((c) => c != null && c !== false));
    return node;
  }

  const initials = (name) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  function avatar(member, cls = '', sid = '') {
    const node = el('div', {
      class: 'avatar ' + cls,
      style: { background: member.color || '#5865f2' },
      data: sid ? { sid } : {},
    });
    setAvatarContents(node, member.avatarUrl, member.name);
    return node;
  }

  function setAvatarContents(node, url, name) {
    const key = (url || '') + ':' + (name || '');
    if (node.dataset.avatarKey === key) return;
    node.dataset.avatarKey = key;
    if (url) {
      const image = el('img', { src: url, alt: '', decoding: 'async', draggable: false });
      image.onerror = () => { if (image.parentNode === node) node.replaceChildren(initials(name || '?')); };
      node.replaceChildren(image);
    } else node.replaceChildren(initials(name || '?'));
  }

  const formatUntil = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  // Preenche os ícones declarados no HTML (data-icon / data-logo).
  for (const node of document.querySelectorAll('[data-icon]')) node.prepend(Icon(node.dataset.icon, Number(node.dataset.size) || 20));
  for (const node of document.querySelectorAll('[data-logo]')) node.append(Icon.logo(Number(node.dataset.logo)));

  // Dicas flutuantes (tooltip) para qualquer elemento com data-tip.
  let tipTarget = null;
  function showTip(target) {
    const tip = $('#tooltip');
    tipTarget = target;
    tip.textContent = target.dataset.tip;
    const pos = target.dataset.tipPos || 'top';
    tip.className = pos;
    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2;
    let y = r.top - t.height - 8;
    if (pos === 'right') { x = r.right + 12; y = r.top + r.height / 2 - t.height / 2; }
    if (pos === 'bottom') y = r.bottom + 8;
    tip.style.left = Math.max(4, Math.min(x, innerWidth - t.width - 4)) + 'px';
    tip.style.top = Math.max(4, y) + 'px';
  }
  function hideTip() {
    tipTarget = null;
    $('#tooltip').className = 'hidden';
  }
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest?.('[data-tip]');
    if (target === tipTarget) return;
    if (target && target.dataset.tip) showTip(target);
    else hideTip();
  });
  document.addEventListener('mousedown', hideTip, true);
  const refreshTip = (node) => { if (tipTarget === node) showTip(node); };

  // Datas no estilo do Discord: "Hoje às 18:14", "Ontem às 09:02", "27/09/2026 18:14".
  const hhmm = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dayKey = (ts) => new Date(ts).toDateString();
  function formatStamp(ts) {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    if (dayKey(ts) === today.toDateString()) return 'Hoje às ' + hhmm(ts);
    if (dayKey(ts) === yesterday.toDateString()) return 'Ontem às ' + hhmm(ts);
    return new Date(ts).toLocaleDateString('pt-BR') + ' ' + hhmm(ts);
  }
  const formatDay = (ts) => new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

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
      ? (config.hasOwner ? 'Escolha um nome e uma senha.' : 'Você é o primeiro! Esta conta será a dona do servidor Resenha.')
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

  // opts.reconnect: a conexão caiu e voltou; entra de novo em silêncio, busca o que
  // chegou nesse meio tempo e volta para a chamada em que a pessoa estava.
  function authenticate(payload, opts = {}) {
    // "active" = o Socket.IO já está conectando/reconectando; chamar connect() de novo
    // mandaria um segundo pedido de conexão e o servidor derrubaria a sessão.
    if (!socket.connected && !socket.active) socket.connect();
    socket.emit('auth', payload, (res) => {
      if (res.error) {
        if (payload.token) localStorage.removeItem('token');
        setConnBanner(null);
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
      if (opts.reconnect) {
        // Descarta o histórico em cache: as mensagens perdidas vêm na próxima leitura.
        state.messages = {};
        $('#messages').dataset.channel = '';
        setConnBanner(null);
        toast('Reconectado!', 'info');
        if (opts.rejoin) joinVoice(opts.rejoin, { keepView: opts.view !== 'voice' });
      }
      call('chat:unread').then((r) => {
        if (!r) return;
        state.unread = r.unread;
        // O canal aberto na tela não conta como "não lido".
        if (state.view === 'chat' && state.unread[state.textChannel]) markRead(state.textChannel);
        if (state.server) render();
      });
      if (state.server) render();
    });
  }

  function setConnBanner(text) {
    const banner = $('#conn-banner');
    banner.textContent = text || '';
    banner.classList.toggle('hidden', !text);
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

  // Se a conexão cair, o app tenta voltar sozinho, sem recarregar a página.
  let reconnecting = false;
  let rejoinVoice = null;
  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect' || state.removed || !state.me) return;
    reconnecting = true;
    if (state.voiceChannel) rejoinVoice = { channel: state.voiceChannel, view: state.view };
    leaveVoice(false, false);
    setConnBanner('Conexão perdida. Tentando reconectar…');
  });
  socket.on('connect', () => {
    const token = localStorage.getItem('token');
    if (!reconnecting || state.removed || !token) return;
    reconnecting = false;
    const rejoin = rejoinVoice;
    rejoinVoice = null;
    authenticate({ token }, { reconnect: true, rejoin: rejoin?.channel, view: rejoin?.view });
  });

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
    syncScreenSubscriptions();
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
  // Devolve true se o valor mudou desde a última chamada com a mesma chave. Usado para
  // pular o redesenho de listas que não mudaram (o estado chega a cada mute/unmute).
  const lastRender = new Map();
  function changed(key, value) {
    const sig = JSON.stringify(value);
    if (lastRender.get(key) === sig) return false;
    lastRender.set(key, sig);
    return true;
  }

  function render() {
    if (!state.server || !state.me || !meMember()) return;
    const me = meMember();
    $('#me-name').textContent = me.name;
    $('#me-name').style.color = nameColor(me);
    $('#me-avatar').replaceWith(Object.assign(avatar(me), { id: 'me-avatar' }));
    $('#me-sub').textContent = state.voiceChannel ? 'Em chamada' : 'Online';
    $('#app').classList.toggle('hide-members', !state.showMembers);
    $('#btn-members').classList.toggle('active', state.showMembers);
    $('#btn-members').dataset.tip = state.showMembers ? 'Ocultar lista de membros' : 'Mostrar lista de membros';
    for (const btn of document.querySelectorAll('.cat-add')) btn.classList.toggle('hidden', !hasPerm('MANAGE_CHANNELS'));
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
    const badge = $('#server-badge');
    badge.textContent = mentions > 99 ? '99+' : String(mentions);
    badge.classList.toggle('hidden', !mentions);
    const where = state.view === 'voice' && state.voiceChannel ? channelById(state.voiceChannel)?.name : '#' + (channelById(state.textChannel)?.name || '');
    document.title = (mentions ? `(${mentions}) ` : entries.length ? '• ' : '') + `${where} | Resenha | Resenhex`;
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
    closePanels();
    $('#chat-input').focus();
  }

  function renderChannels() {
    const s = state.server;
    if (!changed('channels', [s.channels, s.voice, s.members.map((m) => [m.id, m.name, m.color, m.avatarUrl, m.serverMuted, m.serverDeafened, m.timeoutUntil]),
      state.unread, state.textChannel, state.view, state.voiceChannel, [...state.collapsed], [...state.localMuted], s.myPerms])) return;
    const canManage = hasPerm('MANAGE_CHANNELS');
    const gear = () => canManage ? el('button', {
      class: 'channel-gear', tip: 'Editar canal', ariaLabel: 'Editar canal',
      onclick: (e) => { e.stopPropagation(); openServerSettings('channels'); },
    }, Icon('settings', 16)) : null;
    for (const cat of document.querySelectorAll('.category[data-cat]')) cat.classList.toggle('collapsed', state.collapsed.has(cat.dataset.cat));

    const tl = $('#text-channels');
    tl.innerHTML = '';
    const textCollapsed = state.collapsed.has('text');
    for (const c of state.server.channels.filter((c) => c.type === 'text')) {
      const u = state.unread[c.id];
      const active = state.view === 'chat' && state.textChannel === c.id;
      if (textCollapsed && !active && !u) continue;
      tl.append(el('li', {
        class: 'channel' + (active ? ' active' : '') + (u ? ' unread' : ''),
        onclick: () => openTextChannel(c.id),
      }, el('span', { class: 'icon' }, Icon('hash')), el('span', { class: 'channel-name', textContent: c.name }),
      c.allowedRoles.length ? el('span', { class: 'lock', tip: 'Canal privado' }, Icon('lock', 14)) : null,
      u?.mentions ? el('span', { class: 'badge', textContent: u.mentions > 99 ? '99+' : String(u.mentions) }) : null,
      gear()));
    }

    const vl = $('#voice-channels');
    vl.innerHTML = '';
    const voiceCollapsed = state.collapsed.has('voice');
    for (const c of state.server.channels.filter((c) => c.type === 'voice')) {
      if (voiceCollapsed && state.voiceChannel !== c.id) continue;
      const users = voiceEntries(c.id).map((v) => {
        const m = member(v.accountId);
        if (!m) return null;
        const flags = el('span', { class: 'flags' });
        if (v.sharing) flags.append(el('span', { class: 'live', textContent: 'AO VIVO' }));
        if (v.camera) flags.append(el('span', { tip: 'Câmera ligada' }, Icon('camera', 16)));
        if (state.localMuted.has(m.id)) flags.append(el('span', { tip: 'Mutado para você' }, Icon('volumeX', 16)));
        if (m.serverMuted || timedOut(m)) flags.append(el('span', { class: 'server-flag', tip: timedOut(m) ? 'De castigo' : 'Silenciado pelo servidor' }, Icon('micOff', 16)));
        else if (v.muted) flags.append(el('span', { tip: 'Mutado' }, Icon('micOff', 16)));
        if (m.serverDeafened) flags.append(el('span', { class: 'server-flag', tip: 'Ensurdecido pelo servidor' }, Icon('headphonesOff', 16)));
        else if (v.deafened) flags.append(el('span', { tip: 'Ensurdecido' }, Icon('headphonesOff', 16)));
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
        }, el('span', { class: 'icon' }, Icon('volume')), el('span', { class: 'channel-name', textContent: c.name }),
        c.allowedRoles.length ? el('span', { class: 'lock', tip: 'Canal privado' }, Icon('lock', 14)) : null, gear()),
        el('ul', { class: 'voice-users' }, users)));
    }
  }

  function renderMembers() {
    const s = state.server;
    if (!changed('members', [s.members, s.roles, s.ownerId, s.voice.map((v) => [v.accountId, v.channel, v.sharing]), s.channels.map((c) => [c.id, c.name])])) return;
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
        if (timedOut(m)) sub = 'De castigo até ' + formatUntil(m.timeoutUntil);
        else if (v) sub = (v.sharing ? 'Transmitindo em ' : 'Em ') + (channelById(v.channel)?.name || 'um canal de voz');
        list.append(el('div', {
          class: 'member' + (m.online ? '' : ' offline'),
          onclick: (e) => openMemberMenu(m.id, e),
          oncontextmenu: (e) => openMemberMenu(m.id, e),
        }, el('div', { class: 'avatar-wrap' }, avatar(m), el('span', { class: 'status ' + (m.online ? 'online' : 'offline') })),
        el('div', { class: 'member-info' },
          el('div', { class: 'member-name', style: { color: nameColor(m) } }, el('span', { textContent: m.name }),
            isOwner(m.id) ? el('span', { class: 'owner-crown', tip: 'Dono do servidor' }, Icon('crown', 14)) : null),
          sub ? el('div', { class: 'sub', textContent: sub }) : null)));
      }
    }
  }

  function setHeader(icon, text, sub) {
    $('#header-title').replaceChildren(Icon(icon, 24), el('span', { class: 'title-text', textContent: text }),
      sub ? el('span', { class: 'title-sub', textContent: sub }) : '');
  }

  function renderMain() {
    const inVoiceView = state.view === 'voice' && state.voiceChannel;
    $('#btn-return-call').classList.toggle('hidden', !state.voiceChannel || !!inVoiceView);
    $('#chat-view').classList.toggle('hidden', !!inVoiceView);
    $('#voice-view').classList.toggle('hidden', !inVoiceView);
    if (inVoiceView) {
      const n = voiceEntries(state.voiceChannel).length;
      setHeader('volume', channelById(state.voiceChannel)?.name || '', `${n} ${n === 1 ? 'pessoa' : 'pessoas'} na chamada`);
      renderStage();
      return;
    }
    const c = channelById(state.textChannel);
    if (!c) return $('#header-title').replaceChildren();
    setHeader('hash', c.name, c.allowedRoles.length ? 'Canal privado' : '');
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
  const extraNodes = new Map(); // boas-vindas e divisores de data, por chave

  function cachedNode(key, build) {
    if (!extraNodes.has(key)) extraNodes.set(key, build());
    return extraNodes.get(key);
  }

  const welcomeNode = (c) => cachedNode('welcome:' + c.id + ':' + c.name, () => el('div', { class: 'welcome' },
    el('div', { class: 'welcome-icon' }, Icon('hash', 42)),
    el('h2', { textContent: `Bem-vindo(a) a #${c.name}!` }),
    el('p', { textContent: `Este é o começo do canal #${c.name}.` })));

  const dayNode = (ts) => cachedNode('day:' + dayKey(ts), () => el('div', { class: 'day-divider' }, el('span', { textContent: formatDay(ts) })));
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
    const channel = channelById(state.textChannel);
    if (!channel) return;
    if (box.dataset.channel !== state.textChannel) {
      box.innerHTML = '';
      msgNodes.clear();
      box.dataset.channel = state.textChannel;
      scrollToEnd = true;
    }
    const list = state.messages[state.textChannel] || [];
    const epoch = JSON.stringify([state.server.members.map((m) => [m.id, m.name, m.color, m.avatarUrl, m.roles]), state.server.roles.map((r) => [r.id, r.name, r.color]),
      hasPerm('MANAGE_MESSAGES'), canSend(), state.replyTo?.id, dayKey(Date.now())]);
    const nodes = [welcomeNode(channel)];
    let prev = null;
    for (const msg of list) {
      const newDay = !prev || dayKey(prev.ts) !== dayKey(msg.ts);
      if (newDay) nodes.push(dayNode(msg.ts));
      const continued = !!(prev && !newDay && !msg.replyTo && prev.authorId === msg.authorId && (msg.authorId || prev.authorName === msg.authorName) && msg.ts - prev.ts < 5 * 60 * 1000);
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
    for (const [key, node] of extraNodes) if (!wanted.has(node) && !node.isConnected) extraNodes.delete(key);
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
    const row = el('div', {
      class: 'msg' + (continued ? ' continued' : '') + (mentionsMe(msg) ? ' mentioned' : '') + (state.replyTo?.id === msg.id ? ' replying' : ''),
      data: { id: msg.id },
    });
    const openMenu = (e) => author && openMemberMenu(author.id, e);

    if (replied || replyMissing) {
      const ra = replied && member(replied.authorId);
      row.append(el('div', { class: 'reply-ref', onclick: () => replied && jumpTo(replied.id) },
        el('span', { class: 'reply-curve' }),
        replied
          ? [el('span', { class: 'reply-author', style: { color: nameColor(ra) }, textContent: '@' + (ra?.name || replied.authorName || '?') }),
            el('span', { class: 'reply-snippet', textContent: Format.plain(replied.text, fmtCtx) || 'Clique para ver o anexo' })]
          : el('span', { class: 'reply-snippet', textContent: 'Mensagem original apagada' })));
    }

    const body = el('div', { class: 'msg-body' });
    if (continued) {
      row.append(el('span', { class: 'hover-time', textContent: hhmm(msg.ts), tip: formatStamp(msg.ts) }));
    } else {
      const av = avatar(author || { name, color: msg.authorColor });
      av.onclick = openMenu;
      av.oncontextmenu = openMenu;
      row.append(av);
      body.append(el('div', {},
        el('span', { class: 'msg-author', style: { color: nameColor(author) || msg.authorColor || '' }, textContent: name, onclick: openMenu, oncontextmenu: openMenu }),
        el('span', { class: 'msg-time', textContent: formatStamp(msg.ts), tip: new Date(msg.ts).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' }) })));
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
        msg.edited ? el('span', { class: 'edited', textContent: ' (editado)', tip: formatStamp(msg.edited) }) : null));
    }

    if (msg.attachments?.length) body.append(el('div', { class: 'attachments' }, msg.attachments.map(attachmentNode)));

    const reactions = Object.entries(msg.reactions || {});
    if (reactions.length) {
      body.append(el('div', { class: 'reactions' },
        reactions.map(([emoji, users]) => el('button', {
          class: 'reaction' + (users.includes(state.me.accountId) ? ' mine' : ''),
          tip: users.map((id) => member(id)?.name || '?').join(', '),
          onclick: () => react(msg.id, emoji),
        }, emoji, el('span', { textContent: String(users.length) }))),
        canSend() ? el('button', { class: 'reaction add', tip: 'Adicionar reação', ariaLabel: 'Adicionar reação', onclick: (e) => openEmojiPicker(e.currentTarget, (em) => react(msg.id, em)) }, Icon('smilePlus', 16)) : null));
    }
    row.append(body);

    const actions = el('div', { class: 'msg-actions' });
    const action = (label, icon, onclick, cls = '') => el('button', { class: cls, tip: label, ariaLabel: label, onclick }, Icon(icon, 20));
    if (canSend()) {
      actions.append(action('Adicionar reação', 'smilePlus', (e) => openEmojiPicker(e.currentTarget, (em) => react(msg.id, em))));
      actions.append(action('Responder', 'reply', () => startReply(msg)));
    }
    if (mine && canSend()) actions.append(action('Editar', 'pencil', () => { state.editing = msg.id; renderMessages(); }));
    if (mine || hasPerm('MANAGE_MESSAGES')) {
      actions.append(action('Apagar (Shift+clique apaga sem perguntar)', 'trash', (e) => {
        if (e.shiftKey || confirm('Apagar esta mensagem?')) call('chat:delete', { channel: state.textChannel, id: msg.id });
      }, 'danger'));
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
    const file = el('a', { class: 'att-file', href: a.url, download: a.name },
      el('span', { class: 'att-icon' }, Icon(a.type.startsWith('audio/') ? 'music' : 'file', 30)),
      el('div', { class: 'att-info' }, el('div', { class: 'att-name', textContent: a.name }), el('div', { class: 'muted-text', textContent: formatSize(a.size) })),
      el('span', { class: 'att-dl', tip: 'Baixar' }, Icon('download', 22)));
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
      p.preview ? el('img', { src: p.preview, alt: '' }) : el('div', { class: 'att-icon' }, Icon('file', 48)),
      el('div', { class: 'pending-name', textContent: p.name }),
      el('div', { class: 'muted-text', textContent: p.uploading ? 'enviando…' : formatSize(p.size) }),
      el('button', { type: 'button', class: 'pending-remove', tip: 'Remover anexo', ariaLabel: 'Remover anexo', onclick: () => removePending(p) }, Icon('trash', 18)))));
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
    }, item.member ? avatar(item.member, 'small') : el('span', { class: 'ac-at' }, Icon('at', 18)),
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
    if (state.unread[channel] && socket.connected) {
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
      if (!v.sharing) state.hiddenStreams.delete(v.sid);
      if (v.sharing) {
        const key = 'screen-' + v.sid;
        wanted.add(key);
        let tile = stage.querySelector(`[data-key="${key}"]`);
        if (!tile) {
          tile = el('div', { class: 'tile screen', data: { key, sid: v.sid } }, el('video', { autoplay: true, playsInline: true }),
            el('div', { class: 'paused-overlay hidden' }, Icon('pause', 44), el('div', { class: 'paused-title', textContent: 'Transmissão pausada' }),
              el('div', { class: 'muted-text', textContent: 'A captura foi interrompida temporariamente. Restaure a fonte ou escolha outra tela.' })),
            el('div', { class: 'watch-overlay hidden' }),
            el('div', { class: 'stats' }), el('div', { class: 'stream-health' }), el('div', { class: 'label' }), el('div', { class: 'tile-controls' }));
          setupTile(tile);
          tile.oncontextmenu = (e) => openStreamMenu(tile, e);
          stage.prepend(tile);
        }
        const hidden = !self && !isWatching(v.sid);
        const waiting = !hidden && !self && (!remote.screen || remote.screen.getVideoTracks()[0]?.muted);
        tile.querySelector('.paused-overlay').classList.toggle('hidden', !v.paused || hidden);
        const watch = tile.querySelector('.watch-overlay');
        watch.classList.toggle('hidden', !hidden && !waiting);
        const watchState = hidden ? 'idle' : waiting ? 'loading' : 'playing';
        if (watch.dataset.state !== watchState) {
          watch.dataset.state = watchState;
          watch.replaceChildren();
          if (hidden || waiting) watch.append(Icon('screen', 36), el('div', { class: 'paused-title', textContent: hidden ? 'Tela de ' + m.name : 'Conectando à transmissão…' }),
            el('div', { class: 'muted-text', textContent: hidden ? 'Entre para assistir e ouvir a tela compartilhada.' : 'A voz continua conectada. Você pode parar e tentar novamente.' }),
            el('button', { class: 'watch-btn', textContent: hidden ? 'Assistir transmissão' : 'Parar de assistir', onclick: (e) => { e.stopPropagation(); setWatching(v.sid, hidden); } }));
        }
        const video = tile.querySelector('video');
        const src = hidden ? null : remote.screen || null;
        if (video.srcObject !== src) {
          video.srcObject = src;
          setSinkId(video);
          if (src) video.play().catch(() => { if (video.srcObject === src) mediaNotice('O navegador pausou a reprodução. Clique no vídeo para retomar.'); });
        }
        video.onclick = () => video.play().catch(() => {});
        tile.querySelector('.label').replaceChildren(Icon('screen', 16), self ? `Sua transmissão · ${SHARE_PRESETS[state.sharePreset].label}` : 'Tela de ' + m.name);
        tile.querySelector('.label .ico').style.color = '#fff';
        renderTileControls(tile, { kind: 'screen', self, sid: v.sid, accountId: m.id, hidden });
      }

      const key = 'user-' + v.sid;
      wanted.add(key);
      let tile = stage.querySelector(`[data-key="${key}"]`);
      if (!tile) {
        tile = el('div', {
          class: 'tile',
          data: { key, sid: v.sid },
          style: { '--tile': m.color },
          oncontextmenu: (e) => openMemberMenu(m.id, e),
        }, avatar(m, '', v.sid), el('video', { class: 'cam hidden' + (self ? ' mirror' : ''), autoplay: true, playsInline: true, muted: true }),
        el('div', { class: 'label' }), el('div', { class: 'tile-controls' }));
        setupTile(tile);
        stage.append(tile);
      }
      const cam = tile.querySelector('video.cam');
      const camStream = v.camera ? remote.camera : null;
      if (cam.srcObject !== camStream) cam.srcObject = camStream;
      cam.classList.toggle('hidden', !camStream);
      setAvatarContents(tile.querySelector('.avatar'), m.avatarUrl, m.name);
      tile.querySelector('.avatar').style.background = m.color;
      tile.querySelector('.avatar').classList.toggle('hidden', !!camStream);
      tile.classList.toggle('speaking', state.speaking.has(v.sid));
      const silenced = m.serverMuted || timedOut(m);
      tile.style.setProperty('--tile', m.color);
      tile.querySelector('.label').replaceChildren(m.name,
        silenced || v.muted ? Icon('micOff', 16) : '',
        m.serverDeafened || v.deafened ? Icon('headphonesOff', 16) : '');
      renderTileControls(tile, { kind: 'user', self, sid: v.sid, accountId: m.id, camera: !!camStream });
    }

    for (const tile of [...stage.children]) {
      if (!wanted.has(tile.dataset.key)) tile.remove();
    }

    // Destaque: o bloco fixado; sem fixar, as telas compartilhadas ficam em destaque.
    if (state.pinned && !wanted.has(state.pinned)) state.pinned = null;
    const tiles = [...stage.children];
    for (const t of tiles) {
      t.classList.toggle('pinned', t.dataset.key === state.pinned);
      t.classList.toggle('focus', state.pinned ? t.dataset.key === state.pinned : t.classList.contains('screen'));
    }
    const order = [...tiles.filter((t) => t.classList.contains('focus')), ...tiles.filter((t) => !t.classList.contains('focus'))];
    order.forEach((t, i) => { if (stage.children[i] !== t) stage.insertBefore(t, stage.children[i] || null); });
    applyAudio();
  }

  // ---------------- controles dos blocos da chamada (estilo Discord) ----------------
  function setupTile(tile) {
    // Clique fixa/solta; clique duplo abre em tela cheia.
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.tile-controls, .watch-btn')) return;
      togglePin(tile.dataset.key);
    });
    tile.addEventListener('dblclick', (e) => {
      if (e.target.closest('.tile-controls, .watch-btn')) return;
      togglePin(tile.dataset.key, true);
      toggleFullscreen(tile);
    });
  }

  function togglePin(key, forcePin = false) {
    state.pinned = forcePin || state.pinned !== key ? key : null;
    renderStage();
  }

  function toggleFullscreen(tile) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else tile.requestFullscreen?.().catch(() => {});
  }

  async function togglePip(video) {
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      toast('Seu navegador não permitiu abrir em janela flutuante.');
    }
  }

  function setStreamVolume(accountId, value) {
    state.streamVolume[accountId] = value;
    if (value > 0) state.streamMuted.delete(accountId);
    localStorage.setItem('streamVolume', JSON.stringify(state.streamVolume));
    localStorage.setItem('streamMuted', JSON.stringify([...state.streamMuted]));
    applyAudio();
  }

  function toggleStreamMute(accountId) {
    state.streamMuted.has(accountId) ? state.streamMuted.delete(accountId) : state.streamMuted.add(accountId);
    localStorage.setItem('streamMuted', JSON.stringify([...state.streamMuted]));
    applyAudio();
    renderStage();
  }

  // Botões que aparecem ao passar o mouse sobre um bloco.
  function renderTileControls(tile, o) {
    const pinned = state.pinned === tile.dataset.key;
    const muted = state.streamMuted.has(o.accountId);
    const vol = state.streamVolume[o.accountId] ?? 1;
    const sig = JSON.stringify([o, pinned, muted, !!document.fullscreenElement]);
    if (tile.dataset.ctl === sig) return;
    tile.dataset.ctl = sig;
    const box = tile.querySelector('.tile-controls');
    const btn = (label, icon, onclick, cls = '') => el('button', { class: 'tc-btn ' + cls, tip: label, ariaLabel: label, onclick: (e) => { e.stopPropagation(); onclick(e); } }, Icon(icon, 18));
    const video = o.kind === 'screen' ? tile.querySelector('video') : tile.querySelector('video.cam');
    const items = [];
    if (o.kind === 'screen' && !o.self && !o.hidden) {
      const slider = el('input', { type: 'range', class: 'tc-slider', min: 0, max: 100, value: Math.round((muted ? 0 : vol) * 100), ariaLabel: 'Volume da transmissão' });
      slider.oninput = (e) => { e.stopPropagation(); setStreamVolume(o.accountId, slider.value / 100); };
      slider.onclick = (e) => e.stopPropagation();
      items.push(el('div', { class: 'tc-volume' },
        btn(muted ? 'Ativar som da transmissão' : 'Silenciar transmissão', muted ? 'volumeX' : 'volume', () => toggleStreamMute(o.accountId), 'tc-mute' + (muted ? ' off' : '')), slider));
    }
    if (o.kind === 'screen' && o.self) {
      items.push(btn('Qualidade / trocar tela', 'settings', (e) => openShareMenu(e.currentTarget), 'tc-quality'));
    }
    items.push(btn(pinned ? 'Desafixar' : 'Fixar', pinned ? 'pinOff' : 'pin', () => togglePin(tile.dataset.key), 'tc-pin' + (pinned ? ' active' : '')));
    if ((o.kind === 'screen' && !o.hidden) || o.camera) {
      if (document.pictureInPictureEnabled) items.push(btn('Abrir em janela flutuante', 'pip', () => togglePip(video), 'tc-pip'));
      items.push(btn(document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia', document.fullscreenElement ? 'minimize' : 'maximize', () => toggleFullscreen(tile), 'tc-full'));
    }
    if (o.kind === 'screen' && !o.self && !o.hidden) {
      items.push(btn('Parar de assistir', 'eyeOff', () => { setWatching(o.sid, false); }, 'tc-stop'));
    }
    box.replaceChildren(...items);
  }
  document.addEventListener('fullscreenchange', () => { if (state.view === 'voice') renderStage(); });

  // Clique direito numa transmissão: as mesmas opções num menu.
  function openStreamMenu(tile, e) {
    e.preventDefault();
    e.stopPropagation();
    const v = voiceEntry(tile.dataset.sid);
    const m = v && member(v.accountId);
    if (!m) return;
    const self = v.sid === state.me.sid;
    const hidden = !self && !isWatching(v.sid);
    const pinned = state.pinned === tile.dataset.key;
    const menu = $('#context-menu');
    const items = [el('div', { class: 'menu-section', textContent: self ? 'SUA TRANSMISSÃO' : 'TRANSMISSÃO DE ' + m.name.toUpperCase() })];
    if (!self && !hidden) {
      const vol = Math.round((state.streamMuted.has(m.id) ? 0 : state.streamVolume[m.id] ?? 1) * 100);
      const label = el('span', { textContent: `Volume da transmissão: ${vol}%` });
      const range = el('input', { type: 'range', min: 0, max: 100, value: vol });
      range.oninput = () => {
        label.textContent = `Volume da transmissão: ${range.value}%`;
        setStreamVolume(m.id, range.value / 100);
        tile.dataset.ctl = '';
        renderStage();
      };
      items.push(el('div', { class: 'menu-range' }, label, range),
        menuItem(state.streamMuted.has(m.id) ? 'Ativar som da transmissão' : 'Silenciar transmissão', state.streamMuted.has(m.id) ? 'volume' : 'volumeX', () => toggleStreamMute(m.id)));
    }
    items.push(menuItem(pinned ? 'Desafixar' : 'Fixar', pinned ? 'pinOff' : 'pin', () => togglePin(tile.dataset.key)));
    if (!hidden) {
      if (document.pictureInPictureEnabled) items.push(menuItem('Abrir em janela flutuante', 'pip', () => togglePip(tile.querySelector('video'))));
      items.push(menuItem('Tela cheia', 'maximize', () => toggleFullscreen(tile)));
    }
    if (!self) {
      items.push(el('div', { class: 'menu-sep' }), hidden
        ? menuItem('Assistir transmissão', 'eye', () => { setWatching(v.sid, true); })
        : menuItem('Parar de assistir', 'eyeOff', () => { setWatching(v.sid, false); }, 'danger'));
    }
    menu.replaceChildren(...items);
    showMenuAt(e.clientX, e.clientY);
  }

  function renderControls() {
    const me = meMember();
    const inVoice = !!state.voiceChannel;
    const forcedMute = me.serverMuted || timedOut(me) || !hasPerm('SPEAK');
    const micOff = state.muted || state.deafened || forcedMute;
    const deaf = state.deafened || me.serverDeafened;
    $('#voice-panel').classList.toggle('hidden', !inVoice);
    $('#voice-room-name').textContent = inVoice ? `${channelById(state.voiceChannel)?.name || ''} / Resenha` : '';

    const mute = $('#btn-mute');
    mute.replaceChildren(Icon(micOff ? 'micOff' : 'mic'));
    mute.classList.toggle('off', micOff && !forcedMute);
    mute.classList.toggle('locked', forcedMute);
    mute.dataset.tip = forcedMute ? 'Silenciado pelo servidor' : micOff ? 'Ativar microfone' : 'Silenciar';
    refreshTip(mute);
    const deafen = $('#btn-deafen');
    deafen.replaceChildren(Icon(deaf ? 'headphonesOff' : 'headphones'));
    deafen.classList.toggle('off', state.deafened && !me.serverDeafened);
    deafen.classList.toggle('locked', !!me.serverDeafened);
    deafen.dataset.tip = me.serverDeafened ? 'Ensurdecido pelo servidor' : deaf ? 'Desativar surdez' : 'Ensurdecer';
    refreshTip(deafen);

    const video = {
      camera: { btn: $('#btn-camera'), sc: $('#sc-cam'), label: 'Câmera', on: 'Desligar câmera', off: 'Ligar câmera', icon: 'camera', iconOff: 'cameraOff' },
      screen: { btn: $('#btn-share'), sc: $('#sc-screen'), label: 'Tela', on: 'Qualidade / parar transmissão', off: 'Compartilhar tela', icon: 'screenShare', iconOff: 'screenShare' },
    };
    for (const [kind, v] of Object.entries(video)) {
      const active = !!state.local[kind];
      const disabled = !active && !canVideo();
      const tip = active ? v.on : disabled ? 'Sem permissão para vídeo' : v.off;
      v.btn.replaceChildren(Icon(v.icon, 18), v.label);
      v.sc.replaceChildren(Icon(active || kind === 'screen' ? v.icon : v.iconOff, 24));
      for (const b of [v.btn, v.sc]) {
        b.classList.toggle('on', active);
        b.disabled = disabled;
        b.dataset.tip = tip;
        refreshTip(b);
      }
    }
    const aiOn = state.noiseMode === 'ai' || state.noiseMode === 'ai-lite';
    const nb = $('#btn-noise');
    nb.replaceChildren(Icon('waves', 20));
    nb.classList.toggle('active', aiOn);
    nb.dataset.tip = aiOn ? 'Supressão de ruído por IA: ligada' : 'Supressão de ruído por IA: desligada';
    refreshTip(nb);
    const scDeaf = $('#sc-deaf');
    scDeaf.replaceChildren(Icon(deaf ? 'headphonesOff' : 'headphones', 24));
    scDeaf.classList.toggle('off', deaf);
    scDeaf.dataset.tip = deafen.dataset.tip;
    refreshTip(scDeaf);
    const scSb = $('#sc-sounds');
    scSb.replaceChildren(Icon(state.sbMuted ? 'volumeX' : 'music', 24));
    scSb.classList.toggle('off', state.sbMuted);
    scSb.dataset.tip = state.sbMuted ? 'Efeitos sonoros (silenciados)' : 'Efeitos sonoros';
    refreshTip(scSb);
    const scMic = $('#sc-mic');
    scMic.replaceChildren(Icon(micOff ? 'micOff' : 'mic', 24));
    scMic.classList.toggle('off', micOff);
    scMic.dataset.tip = mute.dataset.tip;
    refreshTip(scMic);
  }

  // ---------------- menu de membro (clique direito) ----------------
  function closeMenu() {
    const menu = $('#context-menu');
    if (!menu.classList.contains('hidden') && $('#server-header').classList.contains('open')) $('#server-header').dataset.closedAt = Date.now();
    menu.classList.add('hidden');
    menu.style.width = '';
    $('#server-header').classList.remove('open');
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
    $('#create-channel').classList.add('hidden');
    if (!$('#server-settings').classList.contains('hidden')) $('#server-settings').classList.add('hidden');
    else if (!$('#settings').classList.contains('hidden')) $('#settings-close').click();
  });

  // Clicar no fundo escuro fecha a janela (as configurações de usuário são salvas).
  for (const id of ['#server-settings', '#create-channel']) {
    $(id).addEventListener('mousedown', (e) => {
      if (e.target !== e.currentTarget) return;
      $(id).classList.add('hidden');
    });
  }

  const menuItem = (label, icon, onclick, cls = '') => el('button', { class: 'menu-item ' + cls, onclick: async () => { closeMenu(); await onclick(); } },
    el('span', { textContent: label }), icon ? Icon(icon, 18) : null);

  // Menu do servidor (clicar no nome "Resenha").
  $('#server-header').onclick = () => {
    const header = $('#server-header');
    if (Date.now() - Number(header.dataset.closedAt || 0) < 300) return; // o clique fechou o menu
    const items = [];
    if (['MANAGE_ROLES', 'MANAGE_CHANNELS', 'BAN'].some(hasPerm)) items.push(menuItem('Configurações do servidor', 'settings', () => openServerSettings()));
    if (hasPerm('MANAGE_CHANNELS')) items.push(menuItem('Criar canal', 'plusCircle', () => openCreateChannel('text')));
    items.push(menuItem('Copiar link de convite', 'link', copyInvite));
    items.push(el('div', { class: 'menu-sep' }), menuItem('Configurações de usuário', 'userCog', () => $('#btn-settings').click()));
    const menu = $('#context-menu');
    menu.replaceChildren(...items);
    header.classList.add('open');
    const r = header.getBoundingClientRect();
    menu.style.width = (r.width - 16) + 'px';
    showMenuAt(r.left + 8, r.bottom + 8);
  };

  async function copyInvite() {
    const text = location.origin;
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copiado! Mande para os amigos junto com a senha do servidor.', 'info');
    } catch {
      prompt('Copie o link de convite:', text);
    }
  }

  // Categorias recolhíveis
  for (const cat of document.querySelectorAll('.category[data-cat]')) {
    cat.querySelector('.cat-toggle').onclick = () => {
      const key = cat.dataset.cat;
      state.collapsed.has(key) ? state.collapsed.delete(key) : state.collapsed.add(key);
      localStorage.setItem('collapsed', JSON.stringify([...state.collapsed]));
      renderChannels();
    };
    cat.querySelector('.cat-add').onclick = () => openCreateChannel(cat.dataset.cat);
  }

  $('#btn-members').onclick = () => {
    state.showMembers = !state.showMembers;
    localStorage.setItem('showMembers', state.showMembers);
    render();
    refreshTip($('#btn-members'));
  };

  // Janela "Criar canal"
  function openCreateChannel(type) {
    const form = $('#create-channel-form');
    form.reset();
    form.querySelector(`input[name=ctype][value=${type}]`).checked = true;
    $('#create-channel-sub').textContent = type === 'voice' ? 'em Canais de voz' : 'em Canais de texto';
    $('#create-channel-roles').classList.add('hidden');
    $('#create-channel-role-list').replaceChildren(...state.server.roles.slice(1).map((r) => {
      const box = el('input', { type: 'checkbox' });
      box.dataset.role = r.id;
      return el('label', { class: 'chip selectable' }, box, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), r.name);
    }));
    $('#create-channel').classList.remove('hidden');
    $('#create-channel-name').focus();
  }
  const closeCreateChannel = () => $('#create-channel').classList.add('hidden');
  $('#create-channel-close').onclick = closeCreateChannel;
  $('#create-channel-cancel').onclick = closeCreateChannel;
  $('#create-channel-private').onchange = (e) => $('#create-channel-roles').classList.toggle('hidden', !e.target.checked);
  $('#create-channel-name').oninput = (e) => {
    // Canais de texto usam nomes-com-hifen, como no Discord.
    if ($('#create-channel-form').ctype.value === 'text') e.target.value = e.target.value.toLowerCase().replace(/\s/g, '-');
  };
  $('#create-channel-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const type = form.ctype.value;
    const allowedRoles = $('#create-channel-private').checked
      ? [...$('#create-channel-role-list').querySelectorAll('input:checked')].map((b) => b.dataset.role) : [];
    const res = await call('channel', { action: 'create', type, name: $('#create-channel-name').value, allowedRoles });
    if (!res) return;
    closeCreateChannel();
    if (type === 'text') openTextChannel(res.id);
  };

  function openMemberMenu(accountId, e) {
    e.preventDefault();
    e.stopPropagation();
    const m = member(accountId);
    if (!m) return;
    const menu = $('#context-menu');
    menu.innerHTML = '';
    const self = m.id === state.me.accountId;
    const v = state.server.voice.find((x) => x.accountId === m.id);
    const item = (label, onclick, cls = '') => menuItem(label, null, onclick, cls);
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
        el('div', { class: 'member-name', style: { color: nameColor(m) } }, m.name, isOwner(m.id) ? el('span', { class: 'owner-crown' }, Icon('crown', 14)) : ''),
        timedOut(m) ? el('div', { class: 'sub', textContent: '⏳ Castigo até ' + formatUntil(m.timeoutUntil) }) : null,
        el('div', { class: 'chips' }, roleChips.length ? roleChips : el('span', { class: 'muted-text', textContent: 'Sem cargos' })))));

    if (!self && canSend() && state.view === 'chat') {
      menu.append(item('Mencionar', () => insertAtCursor('@' + m.name + ' ')));
    }

    // Controles locais (só afetam o que eu ouço)
    if (!self && v && v.channel === state.voiceChannel) {
      const vol = Math.round((state.localVolume[m.id] ?? 1) * 100);
      const label = el('span', { textContent: `Volume do usuário: ${vol}%` });
      const range = el('input', { type: 'range', min: 0, max: 100, value: vol });
      range.oninput = () => {
        label.textContent = `Volume do usuário: ${range.value}%`;
        state.localVolume[m.id] = range.value / 100;
        localStorage.setItem('localVolume', JSON.stringify(state.localVolume));
        applyAudio();
      };
      menu.append(sep(), el('div', { class: 'menu-range' }, label, range));
    }
    if (!self) {
      const localMuted = state.localMuted.has(m.id);
      menu.append(item(localMuted ? 'Desmutar para mim' : 'Mutar para mim', () => {
        localMuted ? state.localMuted.delete(m.id) : state.localMuted.add(m.id);
        localStorage.setItem('localMuted', JSON.stringify([...state.localMuted]));
        applyAudio();
        render();
      }));
    }

    const actOn = canActOn(m);
    const modItems = [];
    if (hasPerm('MUTE_MEMBERS') && actOn) {
      modItems.push(item(m.serverMuted ? 'Remover silêncio do servidor' : 'Silenciar no servidor', () => mod('serverMute', !m.serverMuted)));
      modItems.push(item(m.serverDeafened ? 'Remover surdez do servidor' : 'Ensurdecer no servidor', () => mod('serverDeafen', !m.serverDeafened)));
    }
    if (hasPerm('MOVE_MEMBERS') && actOn && v) {
      modItems.push(item('Desconectar da voz', () => mod('disconnect')));
      const others = state.server.channels.filter((c) => c.type === 'voice' && c.id !== v.channel);
      if (others.length) {
        modItems.push(section('MOVER PARA'));
        for (const c of others) modItems.push(item(c.name, () => mod('move', c.id), 'indent'));
      }
    }
    if (modItems.length) menu.append(sep(), ...modItems);

    if (hasPerm('TIMEOUT') && !self && iOutrank(m)) {
      menu.append(sep());
      if (timedOut(m)) menu.append(item('Remover castigo', () => mod('timeout', 0)));
      else {
        menu.append(section('CASTIGO (não fala nem escreve)'));
        const options = [['60 segundos', 1], ['5 minutos', 5], ['10 minutos', 10], ['1 hora', 60], ['1 dia', 1440], ['1 semana', 10080]];
        for (const [label, min] of options) menu.append(item(label, () => mod('timeout', min), 'indent'));
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
      danger.push(item(`Expulsar ${m.name}`, () => confirm(`Expulsar ${m.name}? A pessoa vai precisar entrar de novo.`) && mod('kick'), 'danger'));
    }
    if (hasPerm('BAN') && !self && iOutrank(m)) {
      danger.push(item(`Banir ${m.name}`, () => confirm(`Banir ${m.name}? A pessoa não vai conseguir entrar mais.`) && mod('ban'), 'danger'));
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

  function openServerSettings(tab) {
    const tabs = { roles: 'MANAGE_ROLES', channels: 'MANAGE_CHANNELS', bans: 'BAN' };
    if (tab) settingsTab = tab;
    if (!hasPerm(tabs[settingsTab])) settingsTab = Object.keys(tabs).find((t) => hasPerm(tabs[t]));
    $('#server-settings').classList.remove('hidden');
    renderServerSettings();
  }
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
    // Se o cargo escolhido ainda não chegou (acabou de ser criado), mostra o mais alto sem esquecer a escolha.
    const shownRole = roles.some((r) => r.id === selectedRole) ? selectedRole : roles[roles.length - 1].id;
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
          class: 'role-row' + (r.id === shownRole ? ' active' : ''),
          onclick: () => { selectedRole = r.id; renderServerSettings(); },
        }, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), el('span', { class: 'grow', textContent: r.name }),
        r.id === 'everyone' ? null : el('span', { class: 'muted-text', textContent: String(count) }));
      }));

    const i = roleIdx(shownRole);
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
          el('span', { class: 'icon' }, Icon(c.type === 'text' ? 'hash' : 'volume', 18)), name,
          el('button', { type: 'button', textContent: 'Salvar', onclick: () => call('channel', { action: 'update', id: c.id, name: name.value, allowedRoles: picked(boxes) }).then((r) => r && toast('Canal salvo', 'info')) }),
          el('button', { type: 'button', class: 'secondary danger-text', textContent: 'Apagar', onclick: () => confirm(`Apagar o canal ${c.name}?` + (c.type === 'text' ? ' As mensagens serão perdidas.' : '')) && call('channel', { action: 'delete', id: c.id }) })),
        el('div', { class: 'muted-text', textContent: 'Privado — só estes cargos veem (nenhum marcado = todos veem):' }),
        boxes);
    });

    const type = el('select', {}, el('option', { value: 'text', textContent: 'Texto' }), el('option', { value: 'voice', textContent: 'Voz' }));
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
  async function getMicStream(options = state, strict = false) {
    const ai = options.noiseMode === 'ai' || options.noiseMode === 'ai-lite';
    const constraints = {
      audio: {
        deviceId: options.micDeviceId ? { exact: options.micDeviceId } : undefined,
        channelCount: 1,
        echoCancellation: options.echoCancellation,
        // Com a IA ligada, o filtro do navegador fica desligado: processar duas vezes piora a voz.
        noiseSuppression: options.noiseMode === 'browser',
        autoGainControl: true,
      },
    };
    let raw;
    try {
      raw = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (strict) throw err;
      console.warn('Microfone indisponível:', err);
      toast('Microfone indisponível — você entrou só para ouvir.');
      // Trilha silenciosa para manter a negociação WebRTC igual para todos.
      return getAudioCtx().createMediaStreamDestination().stream;
    }
    return ai ? suppressNoise(raw, options.noiseMode) : raw;
  }

  // ---------------- supressão de ruído por IA (estilo Krisp) ----------------
  // O microfone passa por uma rede neural numa thread de áudio separada (AudioWorklet)
  // antes de ir para a chamada: fica só a voz. Tudo roda no seu computador.
  const noise = { ctx: null, lib: null, wasm: {}, modules: new Set(), pipes: new Map() };
  const NOISE_FILES = {
    ai: { worklet: 'gtcrn/workletProcessor.js', load: (lib) => lib.loadGtcrn({ url: '/vendor/noise/gtcrn.wasm' }), Node: 'GtcrnWorkletNode' },
    'ai-lite': { worklet: 'rnnoise/workletProcessor.js', load: (lib) => lib.loadRnnoise({ url: '/vendor/noise/rnnoise.wasm', simdUrl: '/vendor/noise/rnnoise_simd.wasm' }), Node: 'RnnoiseWorkletNode' },
  };

  async function suppressNoise(raw, mode) {
    try {
      const f = NOISE_FILES[mode];
      // Os modelos trabalham a 48 kHz (a taxa do Opus), então o contexto é criado nessa taxa.
      noise.ctx ||= new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      if (noise.ctx.state === 'suspended') noise.ctx.resume();
      noise.lib ||= await import('/vendor/noise/index.js');
      if (!noise.modules.has(mode)) {
        await noise.ctx.audioWorklet.addModule('/vendor/noise/' + f.worklet);
        noise.modules.add(mode);
      }
      noise.wasm[mode] ||= await f.load(noise.lib);
      const source = noise.ctx.createMediaStreamSource(raw);
      // Converte para mono antes da IA: o modelo processa um canal só e, se o microfone
      // chegasse em estéreo, o canal vazio na saída cortaria o volume da voz pela metade (-6 dB).
      const mono = noise.ctx.createGain();
      mono.channelCount = 1;
      mono.channelCountMode = 'explicit';
      const node = new noise.lib[f.Node](noise.ctx, { maxChannels: 1, wasmBinary: noise.wasm[mode] });
      const dest = noise.ctx.createMediaStreamDestination();
      dest.channelCount = 1;
      source.connect(mono).connect(node).connect(dest);
      const out = dest.stream;
      noise.pipes.set(out, { raw, source, mono, node, dest });
      return out;
    } catch (err) {
      console.warn('Supressão de ruído por IA indisponível:', err);
      toast('Não consegui ligar a supressão de ruído por IA neste navegador; usando o microfone normal.');
      return raw;
    }
  }

  // Para o microfone e desmonta a supressão de ruído ligada a ele.
  function releaseMic(stream) {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    const pipe = noise.pipes.get(stream);
    if (!pipe) return;
    pipe.raw.getTracks().forEach((t) => t.stop());
    pipe.source.disconnect();
    pipe.mono.disconnect();
    pipe.node.disconnect();
    pipe.node.destroy?.();
    noise.pipes.delete(stream);
  }

  // Troca o microfone (outro dispositivo ou outra supressão) sem derrubar a chamada.
  async function restartMic(options = state) {
    if (!state.voiceChannel) return;
    const old = state.micStream;
    const next = await getMicStream(options, true);
    if (state.micStream !== old || !state.voiceChannel) { releaseMic(next); throw new Error('A chamada mudou durante a troca do microfone. Tente novamente.'); }
    const replaced = [];
    try {
      for (const peer of state.peers.values()) {
        await MediaPolicy.enqueue(peer, async () => {
          if (peer.pc.signalingState === 'closed') return;
          const sender = peer.pc.getSenders().find((item) => old.getTracks().includes(item.track));
          if (sender) { const track = sender.track; await sender.replaceTrack(next.getAudioTracks()[0]); replaced.push({ sender, track }); }
        });
      }
      if (state.micStream !== old || !state.voiceChannel) throw new Error('A chamada foi encerrada.');
    } catch (error) {
      await Promise.allSettled(replaced.map(({ sender, track }) => sender.replaceTrack(state.micStream === old ? track : null)));
      releaseMic(next);
      throw error;
    }
    state.micStream = next;
    releaseMic(old);
    attachGate(next);
    applyAudio();
    unwatchSpeaking(state.me.sid);
    watchSpeaking(state.me.sid, next);
  }

  function setNoiseMode(mode) {
    if (!NOISE_MODES[mode] || mode === state.noiseMode) return;
    state.noiseMode = mode;
    if (mode === 'ai' || mode === 'ai-lite') {
      state.lastAiMode = mode;
      localStorage.setItem('lastAiMode', mode);
    }
    localStorage.setItem('noiseMode', mode);
    renderControls();
    return restartMic();
  }

  function getAudioCtx() {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Estou impedido de falar agora? (mudo, surdo, servidor, castigo ou push-to-talk solto)
  function selfSilent() {
    const me = meMember();
    return state.muted || state.deafened || !!me?.serverDeafened || !!me?.serverMuted || timedOut(me) || !hasPerm('SPEAK')
      || (state.ptt.enabled && !state.pttHeld)
      || !!micTest // testando o microfone: os outros não te ouvem
      || (!state.ptt.enabled && !gate.open); // abaixo da sensibilidade de entrada
  }

  // ---------------- sensibilidade de entrada ----------------
  // Mede o microfone por uma cópia da trilha (a original é desligada quando o "portão" fecha).
  const gate = { open: true, meter: null, level: -100, floor: -60, lastLoud: 0 };
  function levelMeter(stream) {
    const track = stream.getAudioTracks()[0];
    if (!track) return null;
    const copy = track.clone();
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(new MediaStream([copy]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    return {
      read() {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const x of data) sum += x * x;
        return 20 * Math.log10(Math.sqrt(sum / data.length) + 1e-6);
      },
      stop() { source.disconnect(); copy.stop(); },
    };
  }
  function attachGate(stream) {
    gate.meter?.stop();
    // Mede o microfone bruto (antes da IA), como a sensibilidade do Discord: a fala abre o
    // corte mesmo quando a supressão já limpou o ruído.
    gate.meter = stream ? levelMeter(noise.pipes.get(stream)?.raw || stream) : null;
    gate.open = true;
    gate.lastLoud = performance.now();
  }
  // Limite automático: acompanha o ruído de fundo e abre ~12 dB acima dele.
  const gateThreshold = () => (state.sensAuto ? Math.min(-25, Math.max(-65, gate.floor + 12)) : state.sensThreshold);
  function updateGate() {
    if (!gate.meter) return;
    const now = performance.now();
    const level = gate.meter.read();
    gate.level = level;
    gate.floor = level < gate.floor ? gate.floor * 0.7 + level * 0.3 : gate.floor + 0.02; // sobe devagar, desce rápido
    // No mínimo manual (-80 dB) o corte fica desligado: microfone sempre aberto.
    if (level > gateThreshold() || (!state.sensAuto && state.sensThreshold <= -80)) gate.lastLoud = now;
    const open = now - gate.lastLoud < 400; // segura aberto um pouco depois da fala
    if (open !== gate.open) {
      gate.open = open;
      applyAudio();
    }
  }
  setInterval(updateGate, 50);

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
        p.audioEl.volume = volume * state.outputVolume / 100;
      }
      // Áudio da transmissão tem volume próprio, separado da voz (como no Discord).
      const video = document.querySelector(`[data-key="screen-${sid}"] video`);
      if (video) {
        video.muted = iCantHear || !v || state.localMuted.has(v.accountId) || state.streamMuted.has(v.accountId) || !isWatching(sid);
        video.volume = (v ? state.streamVolume[v.accountId] ?? 1 : 1) * state.outputVolume / 100;
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
    lastLoud.delete(sid);
    state.speaking.delete(sid);
  }

  // Mantém o círculo verde por um instante depois da última sílaba, para não piscar entre palavras.
  const lastLoud = new Map(); // sid -> hora do último som
  setInterval(() => {
    if (!state.server || !analysers.size) return;
    let changed = false;
    const now = performance.now();
    for (const [sid, { analyser, data }] of analysers) {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const x of data) sum += (x - 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const v = voiceEntry(sid);
      const muted = sid === state.me?.sid
        ? selfSilent()
        : !v || v.muted || v.silenced || state.localMuted.has(v.accountId);
      if (rms > 4 && !muted) lastLoud.set(sid, now);
      const speaking = !muted && now - (lastLoud.get(sid) || 0) < 300;
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
  let joining = false;
  // opts.keepView: entra na chamada sem trocar a tela (usado ao reconectar).
  async function joinVoice(channel, opts = {}) {
    if (joining) return; // clique duplo ou entrada já em andamento
    joining = true;
    try {
      if (state.voiceChannel) leaveVoice(true, false);
      state.micStream = await getMicStream();
      const res = await call('voice:join', { channel });
      if (!res) {
        releaseMic(state.micStream);
        state.micStream = null;
        return;
      }
      startVoice(channel, res.peers, opts);
    } finally {
      joining = false;
    }
  }

  function startVoice(channel, peers, opts = {}) {
    state.voiceChannel = channel;
    state.voiceSnapshot = null;
    if (!opts.keepView) { state.view = 'voice'; closePanels(); }
    Sounds.play('join');
    watchSpeaking(state.me.sid, state.micStream);
    attachGate(state.micStream);
    applyAudio();
    // Quem entra inicia a conexão com todos que já estavam na sala.
    for (const sid of peers) getPeer(sid);
    sendVoiceState();
    render();
  }

  function leaveVoice(notify = true, sound = true) {
    if (!state.voiceChannel) return;
    stopVideo('screen', false);
    stopVideo('camera', false);
    for (const sid of [...state.peers.keys()]) closePeer(sid);
    releaseMic(state.micStream);
    state.micStream = null;
    attachGate(null);
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
      sid,
      adaptation: {},
      stats: {},
      recoveryAttempts: 0,
    };
    state.peers.set(sid, peer);

    for (const track of state.micStream.getTracks()) preferAudioCodecs(pc, pc.addTrack(track, state.micStream));
    if (state.local.camera) addVideoTracks(peer, 'camera');

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
      if (pc.connectionState === 'connected') { peer.recoveryAttempts = 0; clearTimeout(peer.recoveryTimer); tuneSenders(); }
      else if (['failed', 'disconnected'].includes(pc.connectionState)) scheduleRecovery(peer);
      renderDiagnostics();
    };

    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] || new MediaStream([track]);
      const kind = stream.id === peer.remoteIds.camera ? 'camera'
        : stream.id === peer.remoteIds.screen || track.kind === 'video' ? 'screen' : 'mic';
      if (kind !== 'mic') {
        peer.remote[kind] = stream;
        track.onmute = track.onunmute = () => { if (state.view === 'voice') renderStage(); };
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
    clearTimeout(peer.recoveryTimer);
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

  socket.on('sound', ({ sound, from }) => {
    if (!state.voiceChannel || state.deafened || meMember()?.serverDeafened || state.sbMuted || state.localMuted.has(from)) return;
    Sounds.playBoard(sound, state.sbVolume);
    const b = Sounds.board[sound];
    if (b && from !== state.me.accountId) toast(`${member(from)?.name || 'Alguém'} tocou ${b.emoji} ${b.label}`, 'info');
  });

  function setSbMuted(v) {
    state.sbMuted = v;
    localStorage.setItem('sbMuted', v);
    renderControls();
  }

  function openSoundboard(anchor) {
    const menu = $('#context-menu');
    const allowed = hasPerm('SOUNDBOARD') && !timedOut(meMember());
    const grid = el('div', { class: 'sb-grid' }, Object.entries(Sounds.board).map(([id, s]) => el('button', {
      class: 'sb-btn', disabled: !allowed, tip: allowed ? 'Tocar para a sala' : 'Sem permissão para efeitos sonoros',
      onclick: () => call('sound:play', { sound: id }),
    }, el('span', { class: 'sb-emoji', textContent: s.emoji }), el('span', { textContent: s.label }))));
    const vol = el('input', { type: 'range', min: 0, max: 100, value: Math.round(state.sbVolume * 100) });
    const volLabel = el('span', { textContent: `Volume dos efeitos: ${vol.value}%` });
    vol.oninput = () => {
      state.sbVolume = vol.value / 100;
      volLabel.textContent = `Volume dos efeitos: ${vol.value}%`;
      localStorage.setItem('sbVolume', state.sbVolume);
    };
    menu.replaceChildren(el('div', { class: 'menu-section', textContent: 'EFEITOS SONOROS' }), grid,
      el('div', { class: 'menu-sep' }), el('div', { class: 'menu-range' }, volLabel, vol),
      menuItem(state.sbMuted ? 'Ativar efeitos sonoros dos outros' : 'Silenciar efeitos sonoros', state.sbMuted ? 'volume' : 'volumeX', () => setSbMuted(!state.sbMuted)));
    menu.style.width = '320px';
    const r = anchor.getBoundingClientRect();
    menu.classList.remove('hidden');
    showMenuAt(r.left + r.width / 2 - 160, r.top - menu.getBoundingClientRect().height - 8);
  }

  socket.on('voice:peer-left', ({ id }) => {
    closePeer(id);
    if (state.view === 'voice') renderStage();
  });

  // ---------------- câmera e compartilhamento de tela ----------------
  // Codec preferido para cada tipo: VP9 tem ferramentas para conteúdo de tela (texto nítido
  // com pouca banda); H.264 costuma ter codificação por hardware (leve para quem está jogando).
  // Voz: RED manda cada pedacinho de áudio duas vezes, então a fala não "picota" quando
  // a internet perde pacotes. Se o outro lado não suportar, a negociação cai para Opus.
  function preferAudioCodecs(pc, sender) {
    const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
    const caps = window.RTCRtpReceiver?.getCapabilities?.('audio');
    if (!transceiver?.setCodecPreferences || !caps) return;
    const red = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/red');
    const opus = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus');
    if (!opus.length) return;
    try {
      transceiver.setCodecPreferences([...red, ...opus, ...caps.codecs.filter((c) => !red.includes(c) && !opus.includes(c))]);
    } catch {}
  }

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

  const { isWatching, setWatching, addVideoTracks, syncScreenSubscriptions, videoBitrates, tuneSenders, applySharePreset, setSharePreset, captureScreen, watchScreenTrack, switchScreen, startVideo, stopVideo, scheduleRecovery, renderDiagnostics, updateStreamStats, mediaNotice } = MediaSession({ state, socket, call, el, toast, voiceEntry, member, render, renderStage, sendVoiceState, preferCodec });

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
        ? [el('div', { class: 'menu-sep' }),
          menuItem('Trocar tela/aplicativo', 'refresh', () => switchScreen()),
          el('button', { class: 'menu-item danger', textContent: '⏹ Parar transmissão', onclick: () => { closeMenu(); stopVideo('screen'); } })]
        : [el('div', { class: 'menu-tip', textContent: 'Dica: para jogos, escolha "Tela inteira" e use o jogo em modo janela sem bordas. Se você compartilhar só uma janela e minimizá-la, a transmissão pausa.' })]));
    const rect = anchor.getBoundingClientRect();
    menu.classList.remove('hidden');
    showMenuAt(rect.left, rect.top - menu.getBoundingClientRect().height - 8);
  }

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
  $('#sc-leave').onclick = () => leaveVoice();
  $('#sc-mic').onclick = () => $('#btn-mute').click();
  $('#sc-deaf').onclick = () => $('#btn-deafen').click();
  $('#sc-sounds').onclick = (e) => openSoundboard(e.currentTarget);
  $('#sc-cam').onclick = () => $('#btn-camera').click();
  $('#sc-screen').onclick = (e) => {
    if (!canVideo() && !state.local.screen) return;
    openShareMenu(e.currentTarget);
  };

  // Ping da chamada (tempo de ida e volta até os outros participantes).
  async function updatePing() {
    const status = $('#vp-status');
    if (!state.voiceChannel) return;
    const rtts = [];
    for (const peer of state.peers.values()) {
      try {
        (await peer.pc.getStats()).forEach((r) => {
          if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && r.currentRoundTripTime != null) rtts.push(r.currentRoundTripTime * 1000);
        });
      } catch {}
    }
    const ms = rtts.length ? Math.round(Math.max(...rtts)) : null;
    status.classList.toggle('bad', ms != null && ms > 150 && ms <= 300);
    status.classList.toggle('awful', ms != null && ms > 300);
    status.dataset.tip = ms != null ? `Ping: ${ms} ms` : state.peers.size ? 'Conectando…' : 'Você está sozinho na sala';
    refreshTip(status);
  }
  setInterval(updatePing, 2000);

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

  // ---------------- preferências e navegação ----------------
  let capturingKey = false;
  let captureKeyHandler = null;
  let micTestEpoch = 0;
  let cameraTestEpoch = 0;
  let cameraPreview = null;
  let avatarReadEpoch = 0;
  const settingFields = {
    'profile-color': 'color', 'profile-avatar': 'avatar', 'mic-select': 'micDeviceId', 'speaker-select': 'speakerDeviceId',
    'camera-select': 'cameraDeviceId', 'noise-mode': 'noiseMode', 'echo-toggle': 'echoCancellation',
    'sens-auto': 'sensAuto', 'sens-range': 'sensThreshold', 'input-mode': 'inputMode',
    'ptt-code': 'pttCode', 'ptt-label': 'pttLabel', 'upload-select': 'uploadMbps',
    'share-preset': 'sharePreset', 'share-audio': 'shareAudio', 'stream-stats': 'showStreamStats',
    'sounds-toggle': 'sounds', 'notify-toggle': 'notify', 'sb-toggle': 'soundboard', 'sb-volume': 'sbVolume',
    'output-volume': 'outputVolume', 'theme-select': 'theme', 'density-select': 'density',
    'font-size': 'fontSize', 'reduce-motion': 'reduceMotion',
  };
  for (const [id, key] of Object.entries(settingFields)) {
    const field = document.getElementById(id);
    field.dataset.setting = key;
    if (field.type === 'range' || key === 'uploadMbps') field.dataset.number = '';
  }
  $('#noise-mode').replaceChildren(...Object.entries(NOISE_MODES).map(([value, label]) => new Option(label, value)));
  $('#share-preset').replaceChildren(...Object.entries(SHARE_PRESETS).map(([value, p]) => new Option(p.label, value)));
  for (const id of ['mic-select', 'speaker-select', 'camera-select']) document.getElementById(id).replaceChildren(new Option('Padrão do sistema', ''));

  function readPreferences() {
    return { ...state, color: meMember()?.color || '#5865f2', avatar: meMember()?.avatarUrl || '', sounds: Sounds.enabled,
      soundboard: !state.sbMuted, sbVolume: Math.round(state.sbVolume * 100),
      inputMode: state.ptt.enabled ? 'ptt' : 'voice', pttCode: state.ptt.code, pttLabel: state.ptt.label };
  }
  function previewAppearance(values) {
    Object.assign(document.documentElement.dataset, { theme: values.theme, density: values.density, reduceMotion: String(values.reduceMotion), streamStats: String(values.showStreamStats) });
    document.documentElement.style.setProperty('--chat-size', values.fontSize + 'px');
    if (values.avatar !== undefined) {
      setAvatarContents($('#profile-preview-avatar'), values.avatar, meMember()?.name);
      $('#profile-photo-remove').disabled ||= !values.avatar || $('#profile-avatar').disabled;
    }
  }
  previewAppearance(state);

  async function fillDevices() {
    const devices = await navigator.mediaDevices?.enumerateDevices().catch(() => []) || [];
    for (const [id, kind] of [['mic-select', 'audioinput'], ['speaker-select', 'audiooutput'], ['camera-select', 'videoinput']]) {
      const select = document.getElementById(id), selected = select.value;
      const options = [new Option('Padrão do sistema', '')];
      devices.filter((device) => device.kind === kind).forEach((device, index) => options.push(new Option(device.label || `${kind === 'videoinput' ? 'Câmera' : kind === 'audioinput' ? 'Microfone' : 'Saída'} ${index + 1}`, device.deviceId)));
      if (selected && !options.some((option) => option.value === selected)) options.push(new Option('Dispositivo salvo (indisponível)', selected));
      select.replaceChildren(...options);
      select.value = selected;
    }
    $('#speaker-select').disabled = !('setSinkId' in HTMLMediaElement.prototype);
    $('#device-help').textContent = !('setSinkId' in HTMLMediaElement.prototype) ? 'Este navegador usa a saída de áudio escolhida no sistema.' : 'Dispositivos atualizados. Permita o microfone ou a câmera para ver os nomes completos.';
  }
  function stopCameraPreview() {
    cameraTestEpoch++;
    cameraPreview?.getTracks().forEach((track) => track.stop());
    cameraPreview = null;
    $('#camera-preview').srcObject = null;
    $('#camera-preview').classList.add('hidden');
    $('#camera-test').textContent = 'Testar câmera';
  }
  function stopSettingsTests() {
    avatarReadEpoch++;
    preferences.setProcessing(false);
    $('#profile-photo-file').value = '';
    $('#profile-photo-status').textContent = 'PNG, JPG ou WebP de até 8 MB. A foto será recortada no centro. Salve para aplicar.';
    stopMicTest();
    stopCameraPreview();
    if (captureKeyHandler) document.removeEventListener('keydown', captureKeyHandler, true);
    captureKeyHandler = null;
    capturingKey = false;
    $('#ptt-key').textContent = $('#ptt-label').value;
  }
  function notificationHelp() {
    const permission = 'Notification' in window ? Notification.permission : 'unsupported';
    $('#notification-help').textContent = { granted: 'Permissão concedida. Escolha acima se quer receber menções.', denied: 'Notificações bloqueadas. Você pode liberá-las nas permissões deste site.', default: 'O navegador pedirá sua permissão ao usar o botão acima.', unsupported: 'Este navegador não oferece notificações.' }[permission];
    $('#notification-permission').disabled = permission !== 'default';
  }
  async function applyPreferences(values) {
    stopSettingsTests();
    const micChanged = ['micDeviceId', 'noiseMode', 'echoCancellation'].some((key) => values[key] !== state[key]);
    if (micChanged) {
      try { await restartMic({ ...state, ...values }); }
      catch { throw new Error('Não foi possível trocar o microfone. A chamada e o dispositivo anterior foram preservados.'); }
    }
    const avatarChanged = values.avatar !== (meMember().avatarUrl || '');
    if (values.color !== meMember().color || avatarChanged) {
      const result = await call('profile', { color: values.color, ...(avatarChanged ? { avatar: values.avatar || null } : {}) });
      if (!result) {
        if (micChanged) await restartMic(state).catch(() => mediaNotice('Confira o microfone antes de continuar.'));
        throw new Error('O perfil não foi salvo. Verifique a conexão e tente novamente.');
      }
      $('#profile-avatar').value = result.avatarUrl || '';
    }
    for (const key of ['micDeviceId', 'speakerDeviceId', 'cameraDeviceId', 'noiseMode', 'echoCancellation', 'sensAuto', 'sensThreshold', 'uploadMbps', 'shareAudio', 'showStreamStats', 'outputVolume', 'notify']) {
      state[key] = values[key]; localStorage.setItem(key, state[key]);
    }
    localStorage.setItem('showStreamStatsDefault', 'visible-v2');
    state.ptt = { enabled: values.inputMode === 'ptt', code: values.pttCode, label: values.pttLabel };
    state.pttHeld = false;
    localStorage.setItem('ptt', JSON.stringify(state.ptt));
    state.sbMuted = !values.soundboard; state.sbVolume = values.sbVolume / 100;
    localStorage.setItem('sbMuted', state.sbMuted); localStorage.setItem('sbVolume', state.sbVolume);
    Sounds.enabled = values.sounds;
    if (values.noiseMode === 'ai' || values.noiseMode === 'ai-lite') localStorage.setItem('lastAiMode', state.lastAiMode = values.noiseMode);
    for (const key of ['theme', 'density', 'fontSize', 'reduceMotion']) state[key] = values[key];
    localStorage.setItem('appearance', JSON.stringify({ theme: state.theme, density: state.density, fontSize: state.fontSize, reduceMotion: state.reduceMotion }));
    previewAppearance(state);
    setSharePreset(values.sharePreset);
    for (const peer of state.peers.values()) if (peer.audioEl) setSinkId(peer.audioEl);
    document.querySelectorAll('#stage video').forEach(setSinkId);
    applyAudio();
    renderControls();
    if (values.notify && (!('Notification' in window) || Notification.permission !== 'granted')) toast('Preferência salva. Libere as notificações no navegador para receber os avisos.', 'info');
  }
  const preferences = SettingsPanel({ read: readPreferences, apply: applyPreferences, preview: previewAppearance,
    onOpen: async () => {
      $('#profile-preview-name').textContent = meMember().name;
      setAvatarContents($('#profile-preview-avatar'), $('#profile-avatar').value, meMember().name);
      $('#ptt-key').textContent = state.ptt.label;
      $('#settings-server-link').classList.toggle('hidden', !['MANAGE_ROLES', 'MANAGE_CHANNELS', 'BAN'].some(hasPerm));
      notificationHelp();
      renderDiagnostics();
      drawMeter(-100, false);
      await fillDevices();
    }, onClose: stopSettingsTests });
  $('#btn-settings').onclick = () => { closePanels(); preferences.open(); };
  $('#profile-photo-choose').onclick = () => $('#profile-photo-file').click();
  $('#profile-photo-remove').onclick = () => {
    avatarReadEpoch++;
    $('#profile-avatar').value = '';
    $('#profile-photo-status').textContent = 'Foto removida da prévia. Salve para aplicar ou descarte para manter a foto anterior.';
    preferences.refresh();
  };
  $('#profile-photo-file').onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const epoch = ++avatarReadEpoch;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      $('#profile-photo-status').textContent = 'Escolha uma imagem PNG, JPG ou WebP de até 8 MB.';
      return;
    }
    preferences.setProcessing(true);
    $('#profile-photo-status').textContent = 'Preparando sua foto…';
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error('image-size');
      if (epoch !== avatarReadEpoch || !preferences.isOpen()) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const size = Math.min(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 256, 256);
      $('#profile-avatar').value = canvas.toDataURL('image/png');
      $('#profile-photo-status').textContent = 'Foto pronta na prévia. Clique em Salvar alterações para usar no seu perfil.';
      preferences.refresh();
    } catch {
      if (epoch === avatarReadEpoch) $('#profile-photo-status').textContent = 'Não foi possível abrir essa imagem. Tente outra foto (até 40 megapixels).';
    } finally {
      bitmap?.close();
      if (epoch === avatarReadEpoch) preferences.setProcessing(false);
    }
  };
  $('#settings-server-link').onclick = () => { if (preferences.close()) openServerSettings(); };
  $('#btn-logout').onclick = async () => { if (!preferences.close()) return; const result = await call('logout', { token: localStorage.getItem('token') }); if (result) { localStorage.removeItem('token'); location.reload(); } };
  $('#notification-permission').onclick = async () => { if ('Notification' in window) { await Notification.requestPermission(); notificationHelp(); } };
  navigator.mediaDevices?.addEventListener('devicechange', () => { if (preferences.isOpen()) fillDevices(); });
  $('#camera-test').onclick = async () => {
    if (cameraPreview) return stopCameraPreview();
    const epoch = ++cameraTestEpoch;
    $('#camera-test').disabled = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: $('#camera-select').value ? { exact: $('#camera-select').value } : undefined }, audio: false });
      if (epoch !== cameraTestEpoch || !preferences.isOpen()) return stream.getTracks().forEach((track) => track.stop());
      cameraPreview = stream;
      $('#camera-preview').srcObject = stream;
      $('#camera-preview').classList.remove('hidden');
      $('#camera-test').textContent = 'Parar prévia';
      await fillDevices();
    } catch { toast('Não foi possível acessar essa câmera. Verifique as permissões e tente outro dispositivo.'); }
    finally { $('#camera-test').disabled = false; }
  };
  $('#ptt-key').onclick = () => {
    if (capturingKey) return;
    capturingKey = true;
    $('#ptt-key').textContent = 'Aperte uma tecla…';
    captureKeyHandler = (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      document.removeEventListener('keydown', captureKeyHandler, true);
      captureKeyHandler = null; capturingKey = false;
      if (event.key !== 'Escape') { $('#ptt-code').value = event.code; $('#ptt-label').value = event.code === 'Space' ? 'Espaço' : event.key.length === 1 ? event.key.toUpperCase() : event.key; }
      $('#ptt-key').textContent = $('#ptt-label').value;
      preferences.refresh();
    };
    document.addEventListener('keydown', captureKeyHandler, true);
  };
  const dbToPct = (db) => Math.max(0, Math.min(100, ((db + 80) / 80) * 100));
  function drawMeter(db, open) {
    const threshold = $('#sens-auto').checked ? gateThreshold() : Number($('#sens-range').value);
    $('#mic-meter-fill').style.width = dbToPct(db) + '%';
    $('#mic-meter-fill').classList.toggle('closed', !open);
    $('#sens-mark').style.left = dbToPct(threshold) + '%';
  }
  setInterval(() => { if (!micTest && preferences.isOpen() && gate.meter) drawMeter(gate.level, gate.open); }, 100);

  function closePanels() {
    $('#app').classList.remove('channels-open', 'members-open');
    $('#sidebar-backdrop').classList.add('hidden');
    $('#btn-channels').setAttribute('aria-expanded', 'false');
  }
  $('#btn-channels').onclick = () => {
    const open = !$('#app').classList.contains('channels-open'); closePanels();
    $('#app').classList.toggle('channels-open', open); $('#sidebar-backdrop').classList.toggle('hidden', !open);
    $('#btn-channels').setAttribute('aria-expanded', String(open));
  };
  $('#sidebar-backdrop').onclick = closePanels;
  $('#btn-members').onclick = () => {
    if (matchMedia('(max-width:1100px)').matches) { const open = !$('#app').classList.contains('members-open'); closePanels(); $('#app').classList.toggle('members-open', open); $('#sidebar-backdrop').classList.toggle('hidden', !open); }
    else { state.showMembers = !state.showMembers; localStorage.setItem('showMembers', state.showMembers); render(); }
  };
  $('#btn-return-call').onclick = () => { state.view = 'voice'; render(); };
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanels(); });
  // Existing rows contain a separate edit button. Keep their actions keyboard-accessible.
  function keyboardRows() {
    for (const node of document.querySelectorAll('.channel, .voice-user, .member')) {
      node.tabIndex = 0; node.setAttribute('role', 'button');
      node.onkeydown = (event) => { if (event.target === node && ['Enter', ' '].includes(event.key)) { event.preventDefault(); node.click(); } };
    }
  }
  new MutationObserver(keyboardRows).observe($('#sidebar'), { childList: true, subtree: true });
  new MutationObserver(keyboardRows).observe($('#member-list'), { childList: true, subtree: true });

  // Botão rápido (painel de voz): liga/desliga a supressão por IA, como o do Krisp.
  $('#btn-noise').onclick = () => {
    const on = state.noiseMode === 'ai' || state.noiseMode === 'ai-lite';
    setNoiseMode(on ? 'off' : state.lastAiMode);
    toast(on ? 'Supressão de ruído desligada' : 'Supressão de ruído por IA ligada', 'info');
  };

  // "Testar microfone": você se ouve (com a supressão escolhida) e vê o nível do som.
  let micTest = null;
  function stopMicTest() {
    micTestEpoch++;
    if (!micTest) return;
    const wasInCall = !!state.voiceChannel;
    cancelAnimationFrame(micTest.raf);
    micTest.audio.srcObject = null;
    micTest.analyserSource.disconnect();
    releaseMic(micTest.stream);
    micTest = null;
    $('#mic-test').textContent = 'Testar microfone';
    $('#mic-meter-fill').style.width = '0%';
    applyAudio();
    if (wasInCall) toast('Teste encerrado: seu microfone voltou na chamada.', 'info');
  }
  $('#mic-test').onclick = async () => {
    if (micTest) return stopMicTest();
    const epoch = ++micTestEpoch;
    $('#mic-test').disabled = true;
    let stream;
    try { stream = await getMicStream({ ...state, noiseMode: $('#noise-mode').value, echoCancellation: $('#echo-toggle').checked, micDeviceId: $('#mic-select').value }, true); }
    catch { toast('Não foi possível testar o microfone. Verifique as permissões.'); return; }
    finally { $('#mic-test').disabled = false; }
    if (epoch !== micTestEpoch || !preferences.isOpen()) { releaseMic(stream); return; }
    fillDevices();
    const audio = new Audio();
    audio.srcObject = stream;
    setSinkId(audio);
    audio.play().catch(() => {});
    const ctx = getAudioCtx();
    const analyserSource = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyserSource.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    micTest = { stream, audio, analyserSource, raf: 0 };
    $('#mic-test').textContent = 'Parar teste';
    applyAudio();
    if (state.voiceChannel) toast('Durante o teste você fica mudo na chamada.', 'info');
    const fdata = new Float32Array(analyser.fftSize);
    const tick = () => {
      if (!micTest) return;
      analyser.getFloatTimeDomainData(fdata);
      let sum = 0;
      for (const x of fdata) sum += x * x;
      const db = 20 * Math.log10(Math.sqrt(sum / fdata.length) + 1e-6);
      drawMeter(db, db > ($('#sens-auto').checked ? gateThreshold() : Number($('#sens-range').value)));
      micTest.raf = requestAnimationFrame(tick);
    };
    tick();
  };

  window.addEventListener('beforeunload', () => leaveVoice(true, false));
  $('#noise-mode').replaceChildren(...Object.entries(NOISE_MODES).map(([value, label]) => new Option(label, value)));
})();
