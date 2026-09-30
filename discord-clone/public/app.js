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
    messageAuthors: new Map(), // identidade pública de quem escreveu, mesmo depois de sair do servidor
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
    home: false, // true = tela Início (amigos e mensagens diretas)
    serverChannel: null, // último canal do servidor aberto, para voltar do Início
    social: { friends: [], incoming: [], outgoing: [], blocked: [], dms: [] }, // enviado pelo servidor
    friendsTab: 'online', // 'online' | 'all' | 'pending' | 'blocked' | 'add'
    friendsSearch: '',
    friendsAdd: '',
    friendsNote: '', // resultado do último pedido enviado na aba "Adicionar amigo"
  };

  let audioCtx = null;
  const analysers = new Map(); // sid -> { analyser, source, data }

  // ---------------- utilidades ----------------
  function toast(text, kind = 'error') {
    const node = $('#toast');
    node.replaceChildren(Icon(kind === 'error' ? 'alert' : 'info', 18), el('span', { textContent: text }));
    node.className = 'hidden';
    void node.offsetWidth; // reinicia a animação de entrada quando um aviso substitui outro
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

  // Recorta o centro da imagem num quadrado de 256 px e devolve um PNG (data URL).
  // Usado na foto de perfil e no ícone do servidor; o servidor confere o arquivo de novo.
  async function cropToSquarePng(file, size = 256) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('type');
    const bitmap = await createImageBitmap(file);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error('image-size');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const side = Math.min(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    } finally {
      bitmap.close();
    }
  }

  // Ícone do servidor na faixa lateral e na aba do navegador.
  const DEFAULT_FAVICON = document.querySelector('link[rel=icon]')?.href;
  // Banner do perfil. Imagens comuns são recortadas no centro na proporção 5:2 (600×240) e viram PNG.
  // GIF vai inteiro, sem recorte, para não perder a animação; o servidor confere o arquivo de novo.
  const BANNER_MAX_GIF = 5 * 1024 * 1024;
  async function prepareBanner(file) {
    const isGif = file.type === 'image/gif';
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > (isGif ? BANNER_MAX_GIF : 8 * 1024 * 1024)) throw new Error('type');
    const bitmap = await createImageBitmap(file);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error('image-size');
      if (isGif) {
        if (bitmap.width > 1500 || bitmap.height > 1500) throw new Error('gif-size');
        return file;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 240;
      const ratio = 600 / 240;
      const w = bitmap.width / bitmap.height > ratio ? bitmap.height * ratio : bitmap.width;
      const h = bitmap.width / bitmap.height > ratio ? bitmap.height : bitmap.width / ratio;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, (bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h, 0, 0, 600, 240);
      return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/png'));
    } finally {
      bitmap.close();
    }
  }

  function renderServerIcon() {
    const url = state.server?.serverIcon || '';
    const key = state.server?.serverId + ':' + url + ':' + serverName();
    if (renderServerIcon.key === key) return;
    renderServerIcon.key = key;
    const node = document.querySelector('#rail-server .rail-icon.server-icon');
    if (node) {
      node.classList.toggle('has-image', !!url);
      setAvatarContents(node, url, serverName());
      node.closest('.rail-item').dataset.tip = serverName();
    }
    const link = document.querySelector('link[rel=icon]');
    if (link) link.href = url || DEFAULT_FAVICON;
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

  // Controles deslizantes: o trecho à esquerda do marcador fica colorido (controls.css desenha até --fill).
  // Os das configurações são pintados pelo settings.js; aqui ficam os criados depois (menus, cartões, palco).
  const paintRange = (range) => range.style.setProperty('--fill', `${((range.value - (range.min || 0)) / ((range.max || 100) - (range.min || 0))) * 100}%`);
  document.addEventListener('input', (e) => { if (e.target.type === 'range') paintRange(e.target); }, true);
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches('input[type=range]')) paintRange(node);
      else node.querySelectorAll('input[type=range]').forEach(paintRange);
    }
  }).observe(document.body, { childList: true, subtree: true });

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
  const member = (id) => state.server?.members.find((m) => m.id === id) || state.server?.people?.find((m) => m.id === id) || state.messageAuthors.get(id);
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

  const iOutrank = (target) => state.server.members.some((m) => m.id === target.id) && !isOwner(target.id) && topPos(meMember()) > topPos(target);
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
  // Conversa privada: id "dm-<conta>-<conta>". Aparece como um canal de texto, com a outra pessoa em "peer".
  const isDm = (id) => typeof id === 'string' && id.startsWith('dm-');
  const dmPeerId = (id) => id.slice(3).split('-').find((x) => x !== state.me?.accountId);
  function channelById(id) {
    const c = state.server.channels.find((ch) => ch.id === id);
    if (c || !isDm(id)) return c;
    const peer = member(dmPeerId(id));
    return peer ? { id, type: 'dm', name: peer.name, allowedRoles: [], peer } : undefined;
  }
  const inDm = () => isDm(state.textChannel);
  // 'friend' | 'incoming' | 'outgoing' | 'blocked' | 'none'
  function relation(id) {
    const s = state.social;
    return s.friends.includes(id) ? 'friend' : s.incoming.includes(id) ? 'incoming' : s.outgoing.includes(id) ? 'outgoing' : s.blocked.includes(id) ? 'blocked' : 'none';
  }
  // Pode escrever no chat aberto? Num canal depende do cargo; numa conversa privada, de ainda serem amigos.
  const canWrite = () => (inDm() ? !!member(dmPeerId(state.textChannel)) && state.social.friends.includes(dmPeerId(state.textChannel)) : canSend());

  const fmtCtx = { member: (id) => member(id), role: (id) => roleById(id), onUser: (id, e) => (e.type === 'contextmenu' ? openMemberMenu(id, e) : (e.stopPropagation(), openProfile(id, e.currentTarget || e.target))) };

  function mentionsMe(msg) {
    const m = msg.mentions;
    if (!m || !state.me || msg.authorId === state.me.accountId) return false;
    const mine = meMember();
    return m.everyone || m.users.includes(state.me.accountId) || (mine && m.roles.some((r) => mine.roles.includes(r)));
  }

  // ---------------- login / cadastro ----------------
  let config = { passwordRequired: false, hasOwner: true };
  let loginMode = 'login';
  let pendingInviteCode = new URLSearchParams(location.search).get('invite') || '';
  let pendingInvitePreview = null;
  let inviteShown = false;

  function setLoginMode(mode) {
    loginMode = mode;
    const register = mode === 'register';
    $('#login-title').textContent = register ? 'Criar uma conta' : 'Bem-vindo de volta!';
    $('#login-subtitle').textContent = register
      ? 'Escolha seu nome de usuário, crie uma senha e confirme. Sem e-mail.'
      : 'Entre com sua conta.';
    $('#login-submit').textContent = register ? 'Criar conta' : 'Entrar';
    $('#login-switch-text').textContent = register ? 'Já tem uma conta?' : 'Precisa de uma conta?';
    $('#login-switch').textContent = register ? 'Entrar' : 'Registre-se';
    $('#login-color-label').classList.toggle('hidden', !register);
    $('#confirm-password-label').classList.toggle('hidden', !register);
    $('#login-confirm-password').required = register;
    $('#login-password').autocomplete = register ? 'new-password' : 'current-password';
  }

  function showLogin(notice) {
    setLoginMode('login');
    $('#login-name').value = localStorage.getItem('name') || '';
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    const message = notice || (pendingInvitePreview ? `Você recebeu um convite para ${pendingInvitePreview.name}. Entre ou crie sua conta para aceitar.` : '');
    $('#login-notice').textContent = message;
    $('#login-notice').classList.toggle('hidden', !message);
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
      confirmPassword: $('#login-confirm-password').value,
      color: $('#login-color').value,
    });
  });

  // opts.reconnect: a conexão caiu e voltou; entra de novo em silêncio, busca o que
  // chegou nesse meio tempo e volta para a chamada em que a pessoa estava.
  function authenticate(payload, opts = {}) {
    // "active" = o Socket.IO já está conectando/reconectando; chamar connect() de novo
    // mandaria um segundo pedido de conexão e o servidor derrubaria a sessão.
    if (!socket.connected && !socket.active) socket.connect();
    socket.emit('auth', { ...payload, serverId: localStorage.getItem('serverId'), invite: pendingInviteCode }, (res) => {
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
      $('#login-confirm-password').value = '';
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      if (!opts.reconnect) setTimeout(showChangelogIfNew, 600);
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

  Promise.all([fetch('/config').then((r) => r.json()), pendingInviteCode ? fetch('/invites/' + encodeURIComponent(pendingInviteCode)).then((r) => r.json()).catch(() => ({ error: 'Não foi possível consultar o convite. Tente novamente.' })) : null]).then(([c, invite]) => {
    config = c;
    pendingInvitePreview = invite && !invite.error ? invite : null;
    setLoginMode(c.hasOwner ? 'login' : 'register');
    if (invite) {
      $('#login-notice').textContent = invite.error || `Convite para ${invite.name}. Entre ou crie sua conta para aceitar.`;
      $('#login-notice').classList.remove('hidden');
    }
    $('#login-name').value = localStorage.getItem('name') || '';
    const token = localStorage.getItem('token');
    if (token) authenticate({ token });
  }).catch(() => showLogin('Não foi possível conectar. Recarregue a página para tentar novamente.'));

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
  socket.on('server:removed', ({ reason }) => toast(reason, 'info'));

  // ---------------- estado do servidor ----------------
  socket.on('state', (s) => {
    const switching = state.server && state.server.serverId !== s.serverId;
    if (switching) {
      saveComposerDraft();
      leaveVoice(false, false);
      state.home = !s.serverId;
      state.textChannel = null;
      state.serverChannel = null;
      state.editing = state.replyTo = null;
      closeProfile();
      closeMenu();
      clearDraft();
      $('#server-settings').classList.add('hidden');
      lastRender.clear();
      $('#messages').dataset.channel = '';
    }
    state.server = s;
    if (!state.me) return;
    if (!s.serverId) state.home = true;
    if (s.serverId) localStorage.setItem('serverId', s.serverId); else localStorage.removeItem('serverId');
    const textChannels = s.channels.filter((c) => c.type === 'text');
    if (!state.home && !textChannels.some((c) => c.id === state.textChannel)) state.textChannel = textChannels[0]?.id || null;
    if (switching) restoreComposerDraft(state.textChannel);
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
    if (pendingInviteCode && !inviteShown) { inviteShown = true; showInviteAcceptance(pendingInviteCode, pendingInvitePreview); }
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
    // Entrar numa chamada a partir do Início leva de volta para o servidor.
    if (state.home && state.view === 'voice' && state.voiceChannel) leaveHome();
    $('#app').classList.toggle('hide-members', !state.showMembers || state.home);
    $('#btn-members').classList.toggle('hidden', state.home);
    $('#btn-members').classList.toggle('active', state.showMembers);
    $('#rail-home').classList.toggle('active', state.home);
    renderServerRail();
    $('#server-header').classList.toggle('hidden', state.home);
    $('#server-nav').classList.toggle('hidden', state.home);
    $('#home-nav').classList.toggle('hidden', !state.home);
    $('#btn-members').dataset.tip = state.showMembers ? 'Ocultar lista de membros' : 'Mostrar lista de membros';
    renderChannels();
    renderHomeNav();
    renderMembers();
    renderMain();
    renderControls();
    updateTitle();
    // Só redesenha as configurações se algo delas mudou; senão perderia o que está sendo editado.
    $('#server-header span').textContent = serverName();
    renderServerIcon();
    if (profileFor) renderProfile();
    const settingsKey = JSON.stringify([state.server.serverName, state.server.roles, state.server.channels, state.server.categories, state.server.bans, state.server.myPerms,
      state.server.members.map((m) => [m.id, m.name, m.color, m.avatarUrl, m.roles, m.online])]);
    if (!$('#server-settings').classList.contains('hidden') && settingsKey !== render.settingsKey) renderServerSettings();
    render.settingsKey = settingsKey;
  }

  function updateTitle() {
    const entries = Object.entries(state.unread).filter(([id]) => channelById(id));
    const serverMentions = entries.filter(([id]) => !isDm(id)).reduce((n, [, u]) => n + u.mentions, 0);
    const dmMessages = entries.filter(([id]) => isDm(id)).reduce((n, [, u]) => n + u.mentions, 0);
    const badge = $('#server-badge');
    if (badge) {
      badge.textContent = serverMentions > 99 ? '99+' : String(serverMentions);
      badge.classList.toggle('hidden', !serverMentions);
    }
    // No Início, a bolinha soma mensagens diretas novas e pedidos de amizade.
    const homeCount = dmMessages + state.social.incoming.length;
    const homeBadge = $('#home-badge');
    homeBadge.textContent = homeCount > 99 ? '99+' : String(homeCount);
    homeBadge.classList.toggle('hidden', !homeCount);
    $('#nav-home-badge').textContent = homeBadge.textContent;
    $('#nav-home-badge').classList.toggle('hidden', !homeCount);
    const mentions = serverMentions + dmMessages;
    const peer = state.home && channelById(state.textChannel)?.name;
    const where = state.home ? (peer ? '@' + peer : 'Amigos')
      : state.view === 'voice' && state.voiceChannel ? channelById(state.voiceChannel)?.name : '#' + (channelById(state.textChannel)?.name || '');
    document.title = (mentions ? `(${mentions}) ` : entries.length ? '• ' : '') + (state.home ? `${where} | Resenhex` : `${where} | ${serverName()} | Resenhex`);
  }

  const composerDrafts = new Map();
  function saveComposerDraft() {
    if (!state.textChannel) return;
    const draft = { value: $('#chat-input').value, pending: state.pending, replyTo: state.replyTo };
    if (draft.value || draft.pending.length || draft.replyTo) composerDrafts.set(state.textChannel, draft);
    else composerDrafts.delete(state.textChannel);
  }
  function restoreComposerDraft(id) {
    const draft = composerDrafts.get(id);
    $('#chat-input').value = draft?.value || '';
    state.pending = draft?.pending || [];
    state.replyTo = draft?.replyTo || null;
    autoresize();
  }

  function openTextChannel(id) {
    saveComposerDraft();
    if (state.textChannel !== id) {
      state.editing = null;
      state.replyTo = null;
    }
    state.home = false;
    state.textChannel = id;
    restoreComposerDraft(id);
    state.view = 'chat';
    markRead(id);
    render();
    closePanels();
    $('#chat-input').focus();
  }

  // Início: a tela de amigos (sem conversa aberta) e a lista de mensagens diretas.
  function goHome() {
    saveComposerDraft();
    if (!state.home) state.serverChannel = state.textChannel;
    state.home = true;
    state.textChannel = null;
    restoreComposerDraft(null);
    state.editing = null;
    state.replyTo = null;
    if (state.view === 'voice') state.view = 'chat';
    render();
    closePanels();
  }

  function leaveHome() {
    saveComposerDraft();
    const texts = state.server.channels.filter((c) => c.type === 'text');
    state.home = false;
    state.textChannel = texts.some((c) => c.id === state.serverChannel) ? state.serverChannel : texts[0]?.id || null;
    restoreComposerDraft(state.textChannel);
    state.editing = null;
    state.replyTo = null;
  }

  function goServer() {
    if (!state.server.serverId) return openServerPicker();
    if (!state.home) return;
    leaveHome();
    markRead(state.textChannel);
    render();
    closePanels();
  }

  function serverIcon(name, url) {
    const icon = el('span', { class: 'rail-icon server-icon' + (url ? ' has-image' : '') });
    setAvatarContents(icon, url, name);
    return icon;
  }

  function renderServerRail() {
    const servers = state.server.servers || [];
    if (!changed('servers', [servers, state.server.serverId, state.home])) return;
    $('#server-list').replaceChildren(...servers.map((server) => {
      const selected = server.id === state.server.serverId;
      return el('button', { type: 'button', id: selected ? 'rail-server' : '', class: 'rail-item server-entry' + (selected && !state.home ? ' active' : ''),
        ariaLabel: server.name, ariaCurrent: selected && !state.home ? 'true' : 'false', data: { tip: server.name, tipPos: 'right', serverId: server.id },
        onclick: () => switchServer(server.id) }, el('span', { class: 'rail-pill' }), serverIcon(server.name, server.icon),
      selected ? el('span', { id: 'server-badge', class: 'badge rail-badge hidden' }) : null);
    }));
    $('#nav-to-server .channel-name').textContent = state.server.serverId ? 'Voltar ao servidor' : 'Criar ou entrar em servidor';
  }

  async function switchServer(id) {
    if (id === state.server.serverId) { goServer(); return true; }
    if (!guardLeave()) return false;
    const result = await call('server:select', { id });
    if (result) { closePanels(); refreshServerUnread(); }
    return !!result;
  }

  function refreshServerUnread() {
    const serverId = state.server.serverId;
    call('chat:unread').then((result) => {
      if (!result || state.server.serverId !== serverId) return;
      state.unread = result.unread;
      render();
    });
  }

  let serverDialogClose = null;
  // Janela dos fluxos de servidor. "icon" mostra um selo acima do título; tone: 'danger' deixa o selo vermelho.
  function serverDialog(title, subtitle = '', { icon = '', tone = '' } = {}) {
    serverDialogClose?.();
    const opener = document.activeElement;
    const body = el('div');
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      if (serverDialogClose === close) serverDialogClose = null;
      if (opener?.isConnected) opener.focus();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== 'Tab') return;
      const fields = [...overlay.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
      if (!fields.length) return;
      const first = fields[0], last = fields.at(-1);
      if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const overlay = el('div', { id: 'server-dialog', class: 'modal', role: 'dialog', ariaModal: 'true', ariaLabelledby: 'server-dialog-title',
      onmousedown: (event) => { if (event.target === overlay) close(); } },
    el('section', { class: 'server-dialog' + (tone ? ' tone-' + tone : '') },
      el('button', { type: 'button', class: 'dialog-close', ariaLabel: 'Fechar', onclick: close }, Icon('x', 20)),
      el('header', { class: 'dialog-head' },
        icon ? el('span', { class: 'dialog-hero' }, Icon(icon, 28)) : null,
        el('h2', { id: 'server-dialog-title', textContent: title }), subtitle ? el('p', { textContent: subtitle }) : null),
      body));
    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);
    serverDialogClose = close;
    queueMicrotask(() => overlay.querySelector('input, .server-choice, .btn-primary, button')?.focus());
    return { body, close, overlay };
  }

  // Opção clicável dos diálogos: selo com ícone, texto e seta.
  const serverChoice = (media, title, sub, onclick) => el('button', { type: 'button', class: 'server-choice', onclick }, media,
    el('span', { class: 'choice-text', textContent: title }, sub ? el('small', { textContent: sub }) : null), el('span', { class: 'choice-chev' }, Icon('chevronRight', 18)));
  const choiceIcon = (name, tone) => el('span', { class: 'choice-icon ' + tone }, Icon(name, 22));

  function openServerPicker() {
    const dialog = serverDialog('Seus servidores', 'Escolha um servidor ou adicione um novo.');
    dialog.body.append(el('div', { class: 'choice-list' },
      ...(state.server.servers || []).map((server) => {
        const choice = serverChoice(serverIcon(server.name, server.icon), server.name,
          server.id === state.server.serverId ? 'Servidor atual' : server.owner ? 'Seu servidor' : 'Participante',
          async () => { if (await switchServer(server.id)) dialog.close(); });
        choice.classList.toggle('current', server.id === state.server.serverId);
        return choice;
      }),
      serverChoice(choiceIcon('plus', 'green'), 'Adicionar servidor', 'Crie um novo ou entre por convite.', openAddServer)));
  }

  function openAddServer() {
    if (!guardLeave()) return;
    const dialog = serverDialog('Seu próximo encontro', 'Crie um espaço para sua turma ou entre usando um convite.', { icon: 'sparkles' });
    dialog.body.append(el('div', { class: 'choice-list' },
      serverChoice(choiceIcon('plus', 'brand'), 'Criar meu servidor', 'Dê um nome e convide seus amigos.', openCreateServer),
      serverChoice(choiceIcon('link', 'green'), 'Entrar em um servidor', 'Cole o link que alguém enviou.', openJoinServer)));
  }

  function openCreateServer() {
    const dialog = serverDialog('Criar seu servidor', 'Canais, cargos e chamadas próprios para sua turma. Você pode personalizar tudo depois.');
    const input = el('input', { id: 'new-server-name', maxLength: 32, minLength: 2, required: true, placeholder: 'Ex.: Resenha dos amigos', autocomplete: 'off' });
    const submit = el('button', { type: 'submit', class: 'btn-primary', textContent: 'Criar servidor' });
    // Prévia do ícone: as iniciais aparecem enquanto a pessoa digita o nome.
    const preview = el('span', { class: 'rail-icon server-icon create-preview' }, Icon('plus', 28));
    input.oninput = () => {
      const name = input.value.trim();
      preview.classList.toggle('filled', !!name);
      preview.replaceChildren(name ? initials(name) : Icon('plus', 28));
    };
    dialog.body.append(el('div', { class: 'create-preview-wrap' }, preview), el('form', { onsubmit: async (event) => {
      event.preventDefault();
      if (!guardLeave()) return;
      submit.disabled = true;
      const result = await call('server:create', { name: input.value.trim() });
      submit.disabled = false;
      if (!result) return;
      dialog.close(); closePanels(); refreshServerUnread();
      toast('Servidor criado! Agora é só chamar a turma.', 'info');
      await copyInvite();
    } }, el('label', { htmlFor: input.id, textContent: 'NOME DO SERVIDOR' }), input,
    el('div', { class: 'dialog-actions' }, el('button', { type: 'button', class: 'secondary', textContent: 'Voltar', onclick: openAddServer }), submit)));
  }

  function codeFromInvite(value) {
    const text = value.trim();
    if (/^[\w-]{24}$/.test(text)) return text;
    try {
      const url = new URL(text);
      if (url.origin !== location.origin) throw new Error('origin');
      const code = url.searchParams.get('invite');
      if (/^[\w-]{24}$/.test(code || '')) return code;
    } catch {}
    throw new Error('Cole um link de convite deste Resenhex ou o código do convite.');
  }

  function openJoinServer() {
    const dialog = serverDialog('Entrar em um servidor', 'Cole o convite para ver o servidor antes de entrar.', { icon: 'link' });
    const input = el('input', { id: 'server-invite-input', required: true, placeholder: location.origin + '/?invite=…', autocomplete: 'off' });
    const note = el('p', { class: 'invite-error', role: 'alert' });
    input.oninput = () => { note.textContent = ''; };
    dialog.body.append(el('form', { onsubmit: (event) => {
      event.preventDefault();
      try { showInviteAcceptance(codeFromInvite(input.value)); } catch (error) { note.textContent = error.message; input.focus(); }
    } }, el('label', { htmlFor: input.id, textContent: 'LINK OU CÓDIGO DO CONVITE' }), input, note,
    el('p', { class: 'dialog-hint' }, 'Os convites são assim: ', el('code', { textContent: location.origin + '/?invite=AbC…' })),
    el('div', { class: 'dialog-actions' }, el('button', { type: 'button', class: 'secondary', textContent: 'Voltar', onclick: openAddServer }),
      el('button', { type: 'submit', class: 'btn-primary', textContent: 'Ver convite' }))));
  }

  function clearPendingInvite() {
    pendingInviteCode = '';
    pendingInvitePreview = null;
    const url = new URL(location.href); url.searchParams.delete('invite');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  async function showInviteAcceptance(code, preview = null) {
    const dialog = serverDialog('Convite para sua próxima resenha', 'Carregando o servidor…');
    if (!preview) {
      try { preview = await (await fetch('/invites/' + encodeURIComponent(code))).json(); }
      catch { preview = { error: 'Não foi possível consultar o convite. Confira sua conexão.' }; }
    }
    if (!dialog.overlay.isConnected) return;
    dialog.overlay.querySelector('.dialog-head > p')?.remove();
    const dismiss = () => { if (code === pendingInviteCode) clearPendingInvite(); dialog.close(); };
    if (preview.error) {
      dialog.body.append(el('p', { class: 'invite-error', role: 'alert', textContent: preview.error }),
        el('div', { class: 'dialog-actions' }, el('button', { type: 'button', class: 'btn-primary', textContent: 'Fechar', onclick: dismiss })));
      return;
    }
    const already = state.server.servers.some((server) => server.id === preview.id);
    const join = el('button', { type: 'button', class: 'btn-primary', textContent: already ? 'Abrir servidor' : 'Entrar no servidor', onclick: async () => {
      if (!guardLeave()) return;
      join.disabled = true;
      const result = await call('server:join', { code });
      join.disabled = false;
      if (!result) return;
      dismiss(); closePanels(); refreshServerUnread();
      if (!already) toast(`Você entrou em ${preview.name}!`, 'info');
    } });
    dialog.body.append(el('div', { class: 'invite-identity' }, serverIcon(preview.name, preview.icon), el('strong', { class: 'invite-name', textContent: preview.name }),
      el('p', {}, el('span', { class: 'invite-dot' }), `${preview.members} ${preview.members === 1 ? 'membro' : 'membros'} · ${already ? 'Você já participa' : 'Você foi convidado'}`)),
    el('div', { class: 'dialog-actions' }, el('button', { type: 'button', class: 'secondary', textContent: 'Agora não', onclick: dismiss }), join));
    join.focus();
  }

  function openInviteLink(invite) {
    const dialog = serverDialog('Chame seus amigos', `Convide a turma para ${invite.name}. É só compartilhar este link.`, { icon: 'userPlus' });
    const input = el('input', { id: 'server-invite-link', readOnly: true, value: location.origin + '/?invite=' + invite.code, ariaLabel: 'Link de convite', onclick: (event) => event.target.select() });
    const copy = el('button', { type: 'button', class: 'btn-primary invite-copy', textContent: 'Copiar link', onclick: async () => {
      try {
        await navigator.clipboard.writeText(input.value);
        copy.textContent = 'Copiado!';
        copy.classList.add('copied');
        clearTimeout(copy.reset);
        copy.reset = setTimeout(() => { copy.textContent = 'Copiar link'; copy.classList.remove('copied'); }, 2200);
      } catch { input.focus(); input.select(); toast('O navegador não permitiu copiar automaticamente. Copie o link selecionado.', 'info'); }
    } });
    dialog.body.append(el('label', { htmlFor: input.id, textContent: 'LINK DO SERVIDOR' }), el('div', { class: 'invite-field' }, input, copy),
      el('p', { class: 'invite-note' }, Icon('info', 16), el('span', { textContent: 'O convite não expira. Quem receber pode criar uma conta e entrar neste servidor.' })));
    if (hasPerm('ADMIN')) dialog.body.append(el('button', { type: 'button', class: 'invite-revoke', textContent: 'Revogar este link e gerar outro', onclick: async () => {
      if (!await confirmDialog({ title: 'Revogar o convite atual?', text: 'O link antigo vai parar de funcionar. Quem já entrou permanece no servidor.', confirm: 'Gerar novo convite' })) return;
      const next = await call('server:invite', { rotate: true });
      if (next) { input.value = location.origin + '/?invite=' + next.code; copy.textContent = 'Copiar link'; copy.classList.remove('copied'); toast('Novo convite criado. O anterior foi revogado.', 'info'); }
    } }));
  }

  async function leaveCurrentServer() {
    if (!guardLeave()) return;
    if (!await confirmDialog({ title: `Sair de ${serverName()}?`, text: 'Para voltar, você precisará de um convite. Suas mensagens diretas e seus outros servidores continuam disponíveis.', confirm: 'Sair do servidor' })) return;
    if (await call('server:leave')) refreshServerUnread();
  }

  function deleteCurrentServer() {
    if (!isOwner(state.me.accountId) || !guardLeave()) return;
    const id = state.server.serverId, name = serverName();
    const dialog = serverDialog('Excluir servidor', 'Esta ação é permanente e não pode ser desfeita.', { icon: 'trash', tone: 'danger' });
    const input = el('input', { id: 'delete-server-name', required: true, autocomplete: 'off', spellcheck: false, placeholder: name });
    const submit = el('button', { type: 'submit', class: 'btn-danger', disabled: true }, Icon('trash', 16), 'Excluir servidor');
    const field = el('div', { class: 'confirm-field' }, input, el('span', { class: 'confirm-ok', ariaHidden: 'true' }, Icon('check', 16)));
    input.oninput = () => {
      submit.disabled = input.value !== name;
      field.classList.toggle('match', input.value === name);
    };
    const members = state.server.members.length, channels = state.server.channels.length;
    const losses = ['Canais, grupos e cargos', 'Mensagens, arquivos e anexos', 'Convites (os links param de funcionar)', 'Chamadas em andamento são encerradas'];
    dialog.body.append(
      el('div', { class: 'delete-summary' },
        el('div', { class: 'delete-target' }, serverIcon(name, state.server.serverIcon),
          el('div', {}, el('strong', { textContent: name }),
            el('small', { textContent: `${members} ${members === 1 ? 'membro' : 'membros'} · ${channels} ${channels === 1 ? 'canal' : 'canais'}` }))),
        el('div', { class: 'delete-list-title', textContent: 'SERÁ APAGADO' }),
        el('ul', { class: 'delete-list' }, losses.map((text) => el('li', {}, Icon('x', 14), el('span', { textContent: text })))),
        el('p', { class: 'delete-keep' }, Icon('info', 15), el('span', { textContent: 'Contas, amizades e mensagens diretas dos membros continuam intactas.' }))),
      el('form', { onsubmit: async (event) => {
      event.preventDefault();
      if (submit.disabled || input.value !== name) return;
      submit.disabled = true;
      input.disabled = true;
      const result = await call('server:delete', { id, name: input.value });
      if (result) { dialog.close(); refreshServerUnread(); }
      else { input.disabled = false; submit.disabled = input.value !== name; input.focus(); }
    } },
      el('label', { htmlFor: input.id, class: 'confirm-label' }, 'Digite ', el('strong', { textContent: name }), ' para confirmar'), field,
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'btn-ghost', textContent: 'Cancelar', onclick: dialog.close }), submit)));
  }

  $('#btn-add-server').onclick = openAddServer;
  $('#btn-switch-server').onclick = openServerPicker;

  function openDm(id) {
    saveComposerDraft();
    if (state.textChannel !== id) {
      state.editing = null;
      state.replyTo = null;
    }
    if (!state.home) state.serverChannel = state.textChannel;
    state.home = true;
    state.textChannel = id;
    restoreComposerDraft(id);
    state.view = 'chat';
    markRead(id);
    render();
    closePanels();
    $('#chat-input').focus();
  }

  const openChat = (id) => (isDm(id) ? openDm(id) : openTextChannel(id));

  // Abre (ou cria) a conversa privada com um amigo.
  async function messageUser(userId) {
    const res = await call('dm:open', { userId });
    if (res) openDm(res.id);
  }

  async function closeDm(id) {
    if (state.textChannel === id) goHome();
    await call('dm:close', { id });
  }

  $('#rail-home').onclick = goHome;
  $('#rail-server').onclick = goServer;
  $('#nav-friends').onclick = goHome;
  $('#nav-to-home').onclick = goHome;
  $('#nav-to-server').onclick = goServer;
  for (const node of [$('#rail-home'), $('#rail-server')]) { node.tabIndex = 0; node.setAttribute('role', 'button'); node.onkeydown = (e) => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); node.click(); } }; }

  // Lista de conversas privadas na lateral do Início.
  function renderHomeNav() {
    const s = state.server;
    if (!changed('home-nav', [state.social, state.unread, state.home, state.textChannel, s.people, s.members.map((m) => [m.id, m.name, m.color, m.avatarUrl, m.online])])) return;
    $('#nav-friends').classList.toggle('active', state.home && !state.textChannel);
    const pending = state.social.incoming.length;
    $('#friends-badge').textContent = String(pending);
    $('#friends-badge').classList.toggle('hidden', !pending);
    const dms = state.social.dms.slice();
    if (inDm() && !dms.some((d) => d.id === state.textChannel)) dms.unshift({ id: state.textChannel, userId: dmPeerId(state.textChannel) });
    const rows = dms.map((dm) => {
      const peer = member(dm.userId);
      if (!peer) return null;
      const u = state.unread[dm.id];
      return el('li', {
        class: 'channel dm' + (state.home && state.textChannel === dm.id ? ' active' : '') + (u ? ' unread' : ''),
        onclick: () => openDm(dm.id),
        oncontextmenu: (e) => openMemberMenu(peer.id, e),
      }, el('div', { class: 'avatar-wrap' }, avatar(peer, 'small'), el('span', { class: 'status ' + (peer.online ? 'online' : 'offline') })),
      el('span', { class: 'channel-name', textContent: peer.name }),
      u?.mentions ? el('span', { class: 'badge', textContent: u.mentions > 99 ? '99+' : String(u.mentions) }) : null,
      el('button', { type: 'button', class: 'dm-close', tip: 'Fechar conversa', ariaLabel: 'Fechar conversa com ' + peer.name, onclick: (e) => { e.stopPropagation(); closeDm(dm.id); } }, Icon('x', 14)));
    }).filter(Boolean);
    $('#dm-list').replaceChildren(...rows);
    $('#dm-empty').classList.toggle('hidden', rows.length > 0);
  }

  const channelNavigation = window.ChannelNavigation({
    state, el, Icon, call, toast, hasPerm,
    refresh: () => { lastRender.delete('channels'); renderChannels(); },
    open: (c) => c.type === 'text' ? openTextChannel(c.id) : (state.voiceChannel === c.id ? (state.view = 'voice', render()) : joinVoice(c.id)),
    voiceUsers: channelVoiceUsers, createChannel: openCreateChannel,
    editChannel: (id) => { if (guardLeave()) openChannelSettings(id); },
    deleteChannel, markRead, guard: () => guardLeave(),
    confirm: (options) => confirmDialog(options), action: (...args) => menuItem(...args),
    menu: (event, items) => {
      closeMenu();
      const box = $('#context-menu');
      box.style.width = '';
      box.replaceChildren(...items);
      const rect = event.currentTarget.getBoundingClientRect();
      showMenuAt(event.type === 'contextmenu' ? event.clientX : rect.left, event.type === 'contextmenu' ? event.clientY : rect.bottom);
      box.querySelector('button')?.focus();
    },
  });

  function renderChannels() {
    const s = state.server;
    if (!s || channelNavigation.dragging) return;
    if (!changed('channels', [s.channels, s.categories, s.voice, state.me.accountId,
      s.members.map((m) => [m.id, m.name, m.color, m.avatarUrl, m.serverMuted, m.serverDeafened, m.timeoutUntil]),
      state.unread, state.textChannel, state.view, state.voiceChannel, [...state.collapsed], [...state.localMuted], s.myPerms])) return;
    channelNavigation.render();
  }

  function channelVoiceUsers(c) {
    if (c.type !== 'voice') return null;
    return el('ul', { class: 'voice-users' }, voiceEntries(c.id).map((v) => {
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
          onclick: (e) => { e.stopPropagation(); openProfile(m.id, e.currentTarget); },
          oncontextmenu: (e) => openMemberMenu(m.id, e),
        }, avatar(m, 'small' + (state.speaking.has(v.sid) ? ' speaking' : ''), v.sid), el('span', { class: 'name', textContent: m.name }), flags);
    }));
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
          onclick: (e) => { e.stopPropagation(); openProfile(m.id, e.currentTarget); },
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
      sub ? el('span', { class: 'title-sub', textContent: sub, title: sub }) : '');
  }

  function renderMain() {
    const inVoiceView = state.view === 'voice' && state.voiceChannel;
    const friendsPage = state.home && !state.textChannel;
    $('#btn-return-call').classList.toggle('hidden', !state.voiceChannel || !!inVoiceView);
    $('#chat-view').classList.toggle('hidden', !!inVoiceView || friendsPage);
    $('#friends-view').classList.toggle('hidden', !friendsPage);
    $('#voice-view').classList.toggle('hidden', !inVoiceView);
    if (friendsPage) {
      setHeader('users', 'Amigos');
      renderFriends();
      return;
    }
    if (inVoiceView) {
      const n = voiceEntries(state.voiceChannel).length;
      setHeader('volume', channelById(state.voiceChannel)?.name || '', `${n} ${n === 1 ? 'pessoa' : 'pessoas'} na chamada`);
      renderStage();
      return;
    }
    const c = channelById(state.textChannel);
    if (!c) return $('#header-title').replaceChildren();
    if (c.type === 'dm') {
      $('#header-title').replaceChildren(
        el('div', { class: 'avatar-wrap' }, avatar(c.peer, 'small'), el('span', { class: 'status ' + (c.peer.online ? 'online' : 'offline') })),
        el('span', { class: 'title-text', textContent: c.peer.name }),
        el('span', { class: 'title-sub', textContent: c.peer.online ? 'Online' : 'Offline' }));
    } else setHeader('hash', c.name, c.topic || (c.private ? 'Canal privado' : ''));
    if (!state.messages[c.id]) {
      state.messages[c.id] = [];
      call('chat:history', { channel: c.id }).then((res) => {
        if (!res) return;
        for (const author of res.authors || []) state.messageAuthors.set(author.id, author);
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

  const welcomeNode = (c) => cachedNode('welcome:' + c.id + ':' + c.name, () => (c.type === 'dm'
    ? el('div', { class: 'welcome' },
      el('div', { class: 'dm-welcome-avatar' }, avatar(c.peer)),
      el('h2', { textContent: c.name }),
      el('p', { textContent: `Este é o começo da sua conversa privada com ${c.name}.` }))
    : el('div', { class: 'welcome' },
      el('div', { class: 'welcome-icon' }, Icon('hash', 42)),
      el('h2', { textContent: `Bem-vindo(a) a #${c.name}!` }),
      el('p', { textContent: `Este é o começo do canal #${c.name}.` }))));

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
    const firstPaint = box.dataset.channel !== state.textChannel;
    if (firstPaint) {
      box.innerHTML = '';
      msgNodes.clear();
      box.dataset.channel = state.textChannel;
      scrollToEnd = true;
    }
    const list = state.messages[state.textChannel] || [];
    const epoch = JSON.stringify([state.server.members.map((m) => [m.id, m.name, m.color, m.avatarUrl, m.roles]), [...new Set(list.map((msg) => msg.authorId))].map((id) => state.messageAuthors.get(id)), state.server.roles.map((r) => [r.id, r.name, r.color]),
      hasPerm('MANAGE_MESSAGES'), canWrite(), inDm(), state.replyTo?.id, dayKey(Date.now())]);
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
        // Só a mensagem que acabou de chegar entra deslizando; histórico e reconstruções aparecem direto.
        const arriving = !entry && !firstPaint && Date.now() - msg.ts < 15000;
        entry = { sig, node: buildMessage(msg, continued, replied, msg.replyTo && !replied) };
        if (arriving) {
          const node = entry.node;
          node.classList.add('msg-new');
          node.addEventListener('animationend', () => node.classList.remove('msg-new'), { once: true });
        }
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
      class: 'msg' + (continued ? ' continued' : '') + (mentionsMe(msg) && !inDm() ? ' mentioned' : '') + (state.replyTo?.id === msg.id ? ' replying' : ''),
      data: { id: msg.id },
    });
    const openMenu = (e) => author && (e.type === 'contextmenu' ? openMemberMenu(author.id, e) : (e.stopPropagation(), openProfile(author.id, e.currentTarget)));

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
        canWrite() ? el('button', { class: 'reaction add', tip: 'Adicionar reação', ariaLabel: 'Adicionar reação', onclick: (e) => openEmojiPicker(e.currentTarget, (em) => react(msg.id, em)) }, Icon('smilePlus', 16)) : null));
    }
    row.append(body);

    const actions = el('div', { class: 'msg-actions' });
    const action = (label, icon, onclick, cls = '') => el('button', { class: cls, tip: label, ariaLabel: label, onclick }, Icon(icon, 20));
    if (canWrite()) {
      actions.append(action('Adicionar reação', 'smilePlus', (e) => openEmojiPicker(e.currentTarget, (em) => react(msg.id, em))));
      actions.append(action('Responder', 'reply', () => startReply(msg)));
    }
    if (mine && canWrite()) actions.append(action('Editar', 'pencil', () => { state.editing = msg.id; renderMessages(); }));
    if (mine || (!inDm() && hasPerm('MANAGE_MESSAGES'))) {
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
    if (inDm()) {
      input.disabled = !canWrite();
      input.placeholder = input.disabled ? 'Você só pode conversar em privado com amigos.' : 'Conversar com @' + (c?.name || '');
    } else if (timedOut(me)) {
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
    if (!canWrite()) return toast('Você não pode enviar arquivos agora.');
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
        headers: { 'x-token': localStorage.getItem('token'), 'x-filename': encodeURIComponent(item.name), 'content-type': 'application/octet-stream', 'x-server-id': state.server.serverId || '', 'x-channel-id': state.textChannel || '' },
        body: file,
      })
        .then((r) => r.json().catch(() => ({ error: 'Falha no envio (' + r.status + ')' })))
        .catch(() => ({ error: 'Falha no envio' }))
        .then((res) => {
          const current = state.pending.includes(item);
          if (!current && ![...composerDrafts.values()].some((draft) => draft.pending.includes(item))) return;
          if (res.error) {
            toast(res.error);
            if (current) removePending(item);
            for (const draft of composerDrafts.values()) draft.pending = draft.pending.filter((p) => p !== item);
            return;
          }
          Object.assign(item, res, { uploading: false });
          if (current) renderComposer();
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
    if (!res && (state.textChannel !== payload.channel || !input.value)) {
      // Deu erro: devolve o rascunho.
      if (state.textChannel === payload.channel) {
        input.value = draft.value;
        state.pending = draft.pending;
        state.replyTo = draft.replyTo;
        autoresize();
        renderComposer();
      } else composerDrafts.set(payload.channel, draft);
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
    for (const r of inDm() ? [] : state.server.roles.slice(1)) {
      if (r.name.toLowerCase().includes(q)) items.push({ insert: '@' + r.name, label: '@' + r.name, color: r.color, note: 'cargo' });
    }
    if (hasPerm('MENTION_EVERYONE') && !inDm()) {
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
      renderHomeNav();
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
    const n = new Notification(isDm(channel) ? `${author} (mensagem direta)` : `${author} em #${channelById(channel)?.name || ''}`, {
      body: Format.plain(msg.text, fmtCtx).slice(0, 200) || '📎 Anexo',
      tag: channel,
      silent: true,
    });
    n.onclick = () => {
      window.focus();
      window.resenhexDesktop?.focus();
      openChat(channel);
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
  socket.on('chat:message', ({ channel, msg, author }) => {
    if (author) state.messageAuthors.set(author.id, author);
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
        renderHomeNav();
        updateTitle();
      }
    }
    // A conversa que acabou de receber mensagem sobe para o topo da lista.
    const dm = isDm(channel) && state.social.dms.find((d) => d.id === channel);
    if (dm) {
      dm.last = msg.ts;
      state.social.dms.sort((a, b) => b.last - a.last);
      renderHomeNav();
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
    syncViewerQuality();
    mobileStream.sync();
  }

  // ---------------- controles dos blocos da chamada (estilo Discord) ----------------
  function setupTile(tile) {
    // Clique fixa/solta; clique duplo abre em tela cheia.
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.tile-controls, .watch-btn, .imm-bar')) return;
      if (mobileStream.handleTap(tile)) return;
      togglePin(tile.dataset.key);
    });
    tile.addEventListener('dblclick', (e) => {
      if (mobileStream.touch || e.target.closest('.tile-controls, .watch-btn')) return;
      togglePin(tile.dataset.key, true);
      toggleFullscreen(tile);
    });
  }

  function togglePin(key, forcePin = false) {
    state.pinned = forcePin || state.pinned !== key ? key : null;
    renderStage();
  }

  function toggleFullscreen(tile) {
    // No celular, a tela compartilhada abre no modo imersivo (zoom por pinça, controles por toque).
    if (mobileStream.touch && tile.classList.contains('screen')) return mobileStream.isOpen() ? mobileStream.close() : mobileStream.open(tile);
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
    if (o.kind === 'screen' && !o.self && !o.hidden) {
      items.push(btn('Qualidade para assistir', 'settings', (e) => openWatchQualityMenu(o.sid, e.currentTarget), 'tc-quality'));
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
      items.push(menuItem('Qualidade para assistir', 'settings', () => openWatchQualityMenu(v.sid, tile)));
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

  // Troca o ícone só quando ele muda: a animação de ligar/desligar (motion.css) toca uma vez por
  // clique, e não a cada nova renderização.
  function setControlIcon(button, name, size = 20, label = '') {
    const key = `${name}:${size}:${label}`;
    if (button.dataset.iconKey === key) return;
    const svg = Icon(name, size);
    if (button.dataset.iconKey) svg.classList.add('ico-swap');
    button.dataset.iconKey = key;
    button.replaceChildren(svg, label);
  }

  function renderControls() {
    const me = meMember();
    const inVoice = !!state.voiceChannel;
    const forcedMute = me.serverMuted || timedOut(me) || !hasPerm('SPEAK');
    const micOff = state.muted || state.deafened || forcedMute;
    const deaf = state.deafened || me.serverDeafened;
    $('#voice-panel').classList.toggle('hidden', !inVoice);
    $('#voice-room-name').textContent = inVoice ? `${channelById(state.voiceChannel)?.name || ''} / ${serverName()}` : '';

    const mute = $('#btn-mute');
    setControlIcon(mute, micOff ? 'micOff' : 'mic');
    mute.classList.toggle('off', micOff && !forcedMute);
    mute.classList.toggle('locked', forcedMute);
    mute.dataset.tip = forcedMute ? 'Silenciado pelo servidor' : micOff ? 'Ativar microfone' : 'Silenciar';
    refreshTip(mute);
    const deafen = $('#btn-deafen');
    setControlIcon(deafen, deaf ? 'headphonesOff' : 'headphones');
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
      setControlIcon(v.btn, v.icon, 18, v.label);
      setControlIcon(v.sc, active || kind === 'screen' ? v.icon : v.iconOff, 24);
      for (const b of [v.btn, v.sc]) {
        b.classList.toggle('on', active);
        b.disabled = disabled;
        b.dataset.tip = tip;
        refreshTip(b);
      }
    }
    const aiOn = state.noiseMode === 'ai' || state.noiseMode === 'ai-lite';
    const nb = $('#btn-noise');
    setControlIcon(nb, 'waves');
    nb.classList.toggle('active', aiOn);
    nb.dataset.tip = aiOn ? 'Supressão de ruído por IA: ligada' : 'Supressão de ruído por IA: desligada';
    refreshTip(nb);
    const scDeaf = $('#sc-deaf');
    setControlIcon(scDeaf, deaf ? 'headphonesOff' : 'headphones', 24);
    scDeaf.classList.toggle('off', deaf);
    scDeaf.dataset.tip = deafen.dataset.tip;
    refreshTip(scDeaf);
    const scSb = $('#sc-sounds');
    setControlIcon(scSb, state.sbMuted ? 'volumeX' : 'music', 24);
    scSb.classList.toggle('off', state.sbMuted);
    scSb.dataset.tip = state.sbMuted ? 'Efeitos sonoros (silenciados)' : 'Efeitos sonoros';
    refreshTip(scSb);
    const scMic = $('#sc-mic');
    setControlIcon(scMic, micOff ? 'micOff' : 'mic', 24);
    scMic.classList.toggle('off', micOff);
    scMic.dataset.tip = mute.dataset.tip;
    refreshTip(scMic);
  }

  // ---------------- amigos ----------------
  socket.on('social', (social) => {
    state.social = social;
    if (state.me && state.server) render();
  });

  async function friendRequest(payload) {
    const res = await call('friend:request', payload);
    if (res) toast(res.status === 'friends' ? `Você e ${res.name} agora são amigos!` : `Pedido de amizade enviado para ${res.name}.`, 'info');
    return res;
  }
  const acceptFriend = (m) => call('friend:accept', { id: m.id }).then((res) => res && toast(`Você e ${m.name} agora são amigos!`, 'info'));
  const declineFriend = (m) => call('friend:decline', { id: m.id });
  const unblockUser = (m) => call('friend:unblock', { id: m.id });
  async function removeFriend(m) {
    if (await confirmDialog({ title: `Remover ${m.name}`, text: `${m.name} sai da sua lista de amigos. A conversa continua salva, mas vocês só voltam a trocar mensagens privadas depois de serem amigos de novo.`, confirm: 'Remover amigo' })) call('friend:remove', { id: m.id });
  }
  async function blockUser(m) {
    if (await confirmDialog({ title: `Bloquear ${m.name}`, text: 'Vocês deixam de ser amigos, e a pessoa não poderá mais enviar pedidos de amizade nem mensagens privadas para você. Você pode desbloquear quando quiser.', confirm: 'Bloquear' })) call('friend:block', { id: m.id });
  }

  // Ações sociais de uma pessoa, usadas no menu do clique direito e no botão "⋯" da lista de amigos.
  function socialMenuItems(m) {
    const rel = relation(m.id);
    return [
      rel === 'friend' ? menuAction('Enviar mensagem', 'message', () => messageUser(m.id)) : null,
      rel === 'none' ? menuAction('Adicionar amigo', 'userPlus', () => friendRequest({ id: m.id })) : null,
      rel === 'incoming' ? menuAction('Aceitar pedido de amizade', 'check', () => acceptFriend(m)) : null,
      rel === 'incoming' ? menuAction('Recusar pedido de amizade', 'x', () => declineFriend(m)) : null,
      rel === 'outgoing' ? menuAction('Cancelar pedido de amizade', 'x', () => declineFriend(m)) : null,
      rel === 'friend' ? menuAction('Remover amigo', 'userMinus', () => removeFriend(m), 'danger') : null,
      rel === 'blocked' ? menuAction('Desbloquear', 'ban', () => unblockUser(m)) : menuAction('Bloquear', 'ban', () => blockUser(m), 'danger'),
    ];
  }

  const FRIEND_TABS = [['online', 'Online'], ['all', 'Todos'], ['pending', 'Pendentes'], ['blocked', 'Bloqueados']];
  const friendStatus = (m) => {
    const v = voiceOf(m);
    return !m.online ? 'Offline' : v ? 'Em ' + (channelById(v.channel)?.name || 'um canal de voz') : 'Online';
  };

  function friendButton(icon, label, onclick, cls = '') {
    return el('button', { type: 'button', class: 'friend-btn ' + cls, tip: label, ariaLabel: label, onclick: (e) => { e.stopPropagation(); onclick(e); } }, Icon(icon, 20));
  }

  function friendRow(m, sub, actions, onclick) {
    return el('div', { class: 'friend-row' + (onclick ? ' clickable' : ''), onclick, oncontextmenu: (e) => openMemberMenu(m.id, e) },
      el('div', { class: 'avatar-wrap' }, avatar(m), el('span', { class: 'status ' + (m.online ? 'online' : 'offline') })),
      el('div', { class: 'friend-info' },
        el('div', { class: 'friend-name', style: { color: nameColor(m) || '' }, textContent: m.name }),
        el('div', { class: 'friend-sub', textContent: sub })),
      el('div', { class: 'friend-actions' }, actions));
  }

  function friendMoreButton(m) {
    return friendButton('moreHorizontal', 'Mais', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      openMemberMenu(m.id, { preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 6 });
    });
  }

  function friendsSection(title, rows) {
    return [el('div', { class: 'friends-section', textContent: `${title} — ${rows.length}` }), ...rows];
  }

  function friendsEmpty(title, text) {
    return el('div', { class: 'friends-empty' }, el('div', { class: 'friends-empty-icon' }, Icon('users', 44)), el('strong', { textContent: title }), el('span', { textContent: text }));
  }

  // Monta a lista da aba atual (a caixa de busca fica fora, para não perder o foco ao digitar).
  function friendsList() {
    const { friends, incoming, outgoing, blocked } = state.social;
    const byName = (a, b) => a.name.localeCompare(b.name);
    const people = (ids) => ids.map(member).filter(Boolean).sort(byName);
    const q = state.friendsSearch.trim().toLowerCase();
    const search = (list) => (q ? list.filter((m) => m.name.toLowerCase().includes(q)) : list);
    const tab = state.friendsTab;
    if (tab === 'online' || tab === 'all') {
      const all = people(friends);
      if (!all.length && !state.server.servers.length && !q) {
        const welcome = friendsEmpty('Sua turma começa aqui', 'Crie um servidor para seus amigos ou entre usando um convite.');
        welcome.classList.add('server-welcome');
        welcome.append(el('div', { class: 'server-welcome-actions' },
          el('button', { type: 'button', class: 'btn-primary', textContent: 'Criar meu servidor', onclick: openCreateServer }),
          el('button', { type: 'button', class: 'secondary', textContent: 'Entrar por convite', onclick: openJoinServer })));
        return [welcome];
      }
      const list = search(tab === 'online' ? all.filter((m) => m.online) : all);
      if (!list.length) {
        if (q) return [friendsEmpty('Ninguém encontrado', 'Nenhum amigo com esse nome.')];
        return [tab === 'online'
          ? friendsEmpty('Ninguém online agora', all.length ? 'Seus amigos aparecem aqui quando entrarem.' : 'Você ainda não tem amigos. Use "Adicionar amigo" ou clique em alguém na lista de membros.')
          : friendsEmpty('Nenhum amigo ainda', 'Use "Adicionar amigo" ou clique em alguém na lista de membros do servidor.')];
      }
      return friendsSection(tab === 'online' ? 'ONLINE' : 'TODOS OS AMIGOS', list.map((m) => friendRow(m, friendStatus(m),
        [friendButton('message', 'Enviar mensagem', () => messageUser(m.id)), friendMoreButton(m)], () => messageUser(m.id))));
    }
    if (tab === 'pending') {
      const inRows = people(incoming).map((m) => friendRow(m, 'Pedido de amizade recebido',
        [friendButton('check', 'Aceitar', () => acceptFriend(m), 'accept'), friendButton('x', 'Recusar', () => declineFriend(m), 'decline')]));
      const outRows = people(outgoing).map((m) => friendRow(m, 'Pedido de amizade enviado', [friendButton('x', 'Cancelar pedido', () => declineFriend(m), 'decline')]));
      if (!inRows.length && !outRows.length) return [friendsEmpty('Nenhum pedido pendente', 'Pedidos de amizade enviados e recebidos aparecem aqui.')];
      return [...(inRows.length ? friendsSection('RECEBIDOS', inRows) : []), ...(outRows.length ? friendsSection('ENVIADOS', outRows) : [])];
    }
    const rows = people(blocked).map((m) => friendRow(m, 'Bloqueado', [el('button', { type: 'button', class: 'friend-text-btn', textContent: 'Desbloquear', onclick: (e) => { e.stopPropagation(); unblockUser(m); } })]));
    return rows.length ? friendsSection('BLOQUEADOS', rows) : [friendsEmpty('Ninguém bloqueado', 'Quem você bloquear aparece aqui, e você pode desbloquear quando quiser.')];
  }

  function friendsAddForm() {
    const input = el('input', { id: 'friends-add-input', type: 'text', maxLength: 32, autocomplete: 'off', placeholder: 'Digite o nome de usuário', value: state.friendsAdd, ariaLabel: 'Nome de usuário' });
    const submit = el('button', { type: 'submit', class: 'friends-add-submit', textContent: 'Enviar pedido de amizade', disabled: !state.friendsAdd.trim() });
    const note = el('div', { class: 'friends-add-note' + (state.friendsNote ? ' ok' : ''), role: 'status', textContent: state.friendsNote });
    input.oninput = () => { state.friendsAdd = input.value; state.friendsNote = ''; submit.disabled = !input.value.trim(); note.textContent = ''; note.className = 'friends-add-note'; };
    const form = el('form', { class: 'friends-add', onsubmit: async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      submit.disabled = true;
      const res = await friendRequest({ name });
      if (res) {
        state.friendsAdd = '';
        state.friendsNote = res.status === 'friends' ? `Você e ${res.name} agora são amigos!` : `Pedido enviado para ${res.name}.`;
      }
      // A lista de amigos já foi redesenhada quando o servidor respondeu: refaz o formulário com o estado novo.
      renderFriends(true);
      document.getElementById('friends-add-input')?.focus();
    } },
    el('h2', { textContent: 'Adicionar amigo' }),
    el('p', { textContent: 'Digite o nome de usuário da pessoa. Você também pode clicar em alguém na lista de membros e escolher "Adicionar amigo".' }),
    el('div', { class: 'friends-add-box' }, input, submit), note);
    return form;
  }

  function renderFriends(force = false) {
    const { incoming } = state.social;
    const s = state.server;
    if (!changed('friends', [state.friendsTab, state.social, s.people, s.members.map((m) => [m.id, m.name, m.color, m.avatarUrl, m.online, m.roles]), s.roles.map((r) => [r.id, r.color]),
      s.voice.map((v) => [v.accountId, v.channel]), s.channels.map((c) => [c.id, c.name])]) && !force) return;
    const focused = document.activeElement?.id;
    const tabs = $('#friends-tabs');
    tabs.replaceChildren(
      ...FRIEND_TABS.map(([key, label]) => el('button', {
        type: 'button', role: 'tab', ariaSelected: String(state.friendsTab === key), class: 'ft-tab' + (state.friendsTab === key ? ' active' : ''),
        onclick: () => { state.friendsTab = key; renderFriends(); },
      }, label, key === 'pending' && incoming.length ? el('span', { class: 'badge', textContent: String(incoming.length) }) : null)),
      el('button', {
        type: 'button', role: 'tab', ariaSelected: String(state.friendsTab === 'add'), class: 'ft-tab add' + (state.friendsTab === 'add' ? ' active' : ''),
        onclick: () => { state.friendsTab = 'add'; renderFriends(); },
      }, 'Adicionar amigo'));

    const body = $('#friends-body');
    if (state.friendsTab === 'add') body.replaceChildren(friendsAddForm());
    else {
      const list = el('div', { class: 'friends-list' }, friendsList());
      const parts = [list];
      if (['online', 'all'].includes(state.friendsTab)) {
        const box = el('input', { id: 'friends-search', type: 'search', placeholder: 'Buscar amigo', value: state.friendsSearch, autocomplete: 'off', ariaLabel: 'Buscar amigo' });
        box.oninput = () => { state.friendsSearch = box.value; list.replaceChildren(...friendsList()); };
        parts.unshift(el('div', { class: 'friends-search' }, box, Icon('search', 18)));
      }
      body.replaceChildren(...parts);
    }
    if (focused === 'friends-search' || focused === 'friends-add-input') {
      const field = document.getElementById(focused);
      if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
    }
  }

  // ---------------- menu de membro (clique direito) ----------------
  function closeMenu() {
    const menu = $('#context-menu');
    if (!menu.classList.contains('hidden') && $('#server-header').classList.contains('open')) $('#server-header').dataset.closedAt = Date.now();
    menu.classList.add('hidden');
    menu.classList.remove('member-menu');
    menu.style.width = '';
    closeSubmenu();
    $('#server-header').classList.remove('open');
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu, #context-submenu')) closeMenu();
    if (!e.target.closest('#emoji-picker')) $('#emoji-picker').classList.add('hidden');
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeMenu();
    $('#emoji-picker').classList.add('hidden');
    $('#lightbox').classList.add('hidden');
    if (!$('#create-channel').classList.contains('hidden')) return closeCreateChannel();
    if (document.querySelector('.confirm-overlay')) return;
    if (!$('#changelog').classList.contains('hidden')) return closeChangelog();
    if (adminOpen()) closeServerSettings();
    else if (!$('#settings').classList.contains('hidden')) $('#settings-close').click();
  });

  // Clicar no fundo escuro fecha a janela (as configurações de usuário são salvas).
  for (const id of ['#server-settings', '#create-channel']) {
    $(id).addEventListener('mousedown', (e) => {
      if (e.target !== e.currentTarget) return;
      if (id === '#server-settings') closeServerSettings();
      else closeCreateChannel();
    });
  }

  const menuItem = (label, icon, onclick, cls = '') => el('button', { class: 'menu-item ' + cls, onclick: async () => { closeMenu(); await onclick(); } },
    el('span', { textContent: label }), icon ? Icon(icon, 18) : null);
  $('#context-menu').addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...e.currentTarget.querySelectorAll('button:not(:disabled)')];
    if (!items.length) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });

  // ---------------- novidades (changelog) ----------------
  // Janela no estilo do "Novidades" do Discord: versões à esquerda, detalhes à direita.
  // Abre sozinha uma vez quando chega uma versão nova (guardado neste navegador).
  const CHANGE_KINDS = {
    new: { label: 'NOVIDADES', cls: 'new' },
    improved: { label: 'MELHORIAS', cls: 'improved' },
    fixed: { label: 'CORREÇÕES', cls: 'fixed' },
  };
  const formatReleaseDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  function openChangelog(version = window.APP_VERSION) {
    const list = window.CHANGELOG || [];
    const release = list.find((r) => r.version === version) || list[0];
    if (!release) return;
    try { localStorage.setItem('seenVersion', window.APP_VERSION); } catch {}
    const box = $('#changelog');
    const nav = el('nav', { class: 'cl-versions', ariaLabel: 'Versões' },
      el('div', { class: 'cl-versions-title', textContent: 'VERSÕES' }),
      list.map((r, i) => el('button', {
        type: 'button', class: 'cl-version' + (r === release ? ' active' : ''), onclick: () => openChangelog(r.version),
      }, el('span', { class: 'cl-dot' + (i === 0 ? ' current' : '') }),
      el('span', { class: 'cl-version-text' },
        el('strong', {}, 'v' + r.version, i === 0 ? el('span', { class: 'cl-badge', textContent: 'ATUAL' }) : null),
        el('small', { textContent: r.name })))));
    const body = el('div', { class: 'cl-body' },
      el('div', { class: 'cl-hero' },
        el('div', { class: 'cl-hero-glow' }),
        el('div', { class: 'cl-hero-top' },
          el('span', { class: 'cl-pill', textContent: 'v' + release.version }),
          el('span', { class: 'cl-date', textContent: formatReleaseDate(release.date) })),
        el('h2', { id: 'changelog-title', textContent: release.name }),
        el('p', { textContent: release.summary })),
      release.sections.map((sec) => el('section', { class: 'cl-section ' + CHANGE_KINDS[sec.kind].cls },
        el('h3', {}, el('span', { textContent: CHANGE_KINDS[sec.kind].label })),
        el('ul', {}, sec.items.map((item) => el('li', { textContent: item }))))),
      release === list[list.length - 1] ? null : el('p', { class: 'cl-footnote', textContent: 'Resenhex ainda está antes da versão 1.0: ideias e bugs são bem-vindos no chat.' }));
    box.querySelector('.cl-card').replaceChildren(
      el('button', { type: 'button', class: 'cl-close', ariaLabel: 'Fechar novidades', tip: 'Fechar', onclick: closeChangelog }, Icon('x', 20)),
      nav, body);
    box.classList.remove('hidden');
    body.scrollTop = 0;
  }
  function closeChangelog() { $('#changelog').classList.add('hidden'); }
  function showChangelogIfNew() {
    if (pendingInviteCode || document.getElementById('server-dialog')) return;
    let seen = null;
    try { seen = localStorage.getItem('seenVersion'); } catch {}
    if (seen !== window.APP_VERSION && $('#settings').classList.contains('hidden') && !adminOpen()) openChangelog();
  }
  $('#changelog').addEventListener('mousedown', (e) => e.target === e.currentTarget && closeChangelog());
  $('#settings-version').replaceChildren(`Resenhex v${window.APP_VERSION} · `, el('u', { textContent: 'Novidades' }));
  $('#settings-version').onclick = () => openChangelog();

  // Menu do servidor (clicar no nome "Resenha").
  $('#server-header').onclick = () => {
    const header = $('#server-header');
    if (Date.now() - Number(header.dataset.closedAt || 0) < 300) return; // o clique fechou o menu
    // Grupos separados como no Discord: convite em destaque, administração, geral e, por último, a ação destrutiva.
    const sep = () => el('div', { class: 'menu-sep' });
    const items = [menuItem('Convidar amigos', 'userPlus', copyInvite, 'accent'), sep()];
    if (canAdmin()) items.push(menuItem('Configurações do servidor', 'settings', () => openServerSettings()));
    if (hasPerm('MANAGE_CHANNELS')) items.push(menuItem('Criar canal', 'plusCircle', () => openCreateChannel('text')),
      menuItem('Criar grupo de canais', 'hash', () => channelNavigation.editGroup()));
    if (items.length > 2) items.push(sep());
    items.push(menuItem('Criar ou entrar em servidor', 'plus', openAddServer),
      menuItem(`Novidades · v${window.APP_VERSION}`, 'sparkles', () => openChangelog()),
      menuItem('Configurações de usuário', 'userCog', () => $('#btn-settings').click()), sep());
    if (isOwner(state.me.accountId)) items.push(menuItem('Excluir servidor', 'trash', deleteCurrentServer, 'danger'));
    else items.push(menuItem('Sair do servidor', 'logout', leaveCurrentServer, 'danger'));
    const menu = $('#context-menu');
    menu.replaceChildren(...items);
    header.classList.add('open');
    const r = header.getBoundingClientRect();
    menu.style.width = (r.width - 16) + 'px';
    showMenuAt(r.left + 8, r.bottom + 8);
  };

  async function copyInvite() {
    const invite = await call('server:invite');
    if (invite) openInviteLink(invite);
  }

  $('#btn-members').onclick = () => {
    state.showMembers = !state.showMembers;
    localStorage.setItem('showMembers', state.showMembers);
    render();
    refreshTip($('#btn-members'));
  };

  // Janela "Criar canal"
  function openCreateChannel(type, categoryId = null) {
    if (!hasPerm('MANAGE_CHANNELS') || !guardLeave()) return;
    const form = $('#create-channel-form');
    form.previousFocus = document.activeElement;
    form.reset();
    form.querySelector(`input[name=ctype][value=${type}]`).checked = true;
    const select = channelNavigation.categorySelect(categoryId);
    select.id = 'create-channel-group';
    $('#create-channel-group').replaceWith(select);
    const updateGroup = () => { $('#create-channel-sub').textContent = 'em ' + select.selectedOptions[0].textContent; };
    select.onchange = updateGroup;
    updateGroup();
    $('#create-channel-roles').classList.add('hidden');
    $('#create-channel-role-list').replaceChildren(...state.server.roles.slice(1).map((r) => {
      const box = el('input', { type: 'checkbox' });
      box.dataset.role = r.id;
      return el('label', { class: 'chip selectable' }, box, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), r.name);
    }));
    $('#create-channel').classList.remove('hidden');
    $('#create-channel-name').focus();
  }
  const closeCreateChannel = () => {
    if ($('#create-channel-form').busy) return;
    $('#create-channel').classList.add('hidden');
    const previous = $('#create-channel-form').previousFocus;
    if (previous?.isConnected && previous.getClientRects().length) previous.focus();
    else $('#server-header').focus();
  };
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
    if (form.busy) return;
    const type = form.ctype.value;
    const allowedRoles = $('#create-channel-private').checked
      ? [...$('#create-channel-role-list').querySelectorAll('input:checked')].map((b) => b.dataset.role) : [];
    form.busy = true;
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    let res;
    try {
      res = await call('channel', { action: 'create', type, name: $('#create-channel-name').value, allowedRoles,
        private: $('#create-channel-private').checked, categoryId: $('#create-channel-group').value || null, topic: $('#create-channel-topic').value });
    } finally { form.busy = false; submit.disabled = false; }
    if (!res) return;
    closeCreateChannel();
    if (type === 'text') openTextChannel(res.id);
  };
  $('#create-channel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeCreateChannel(); }
    if (e.key !== 'Tab') return;
    const focusable = [...e.currentTarget.querySelectorAll('button, input, select, textarea')].filter((n) => !n.disabled && n.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------------- perfil e ações de um membro (estilo Discord) ----------------
  // Clique: cartão de perfil. Clique direito ou "⋯": menu de ações com submenus.
  const TIMEOUTS = [['60 segundos', 1], ['5 minutos', 5], ['10 minutos', 10], ['1 hora', 60], ['1 dia', 1440], ['1 semana', 10080]];
  const modAction = (m, action, value) => call('mod', { action, target: m.id, value });
  const voiceOf = (m) => state.server.voice.find((x) => x.accountId === m.id);
  const sameCall = (m) => { const v = voiceOf(m); return !!v && !!state.voiceChannel && v.channel === state.voiceChannel; };
  const sortedRoles = (m) => m.roles.map((id) => roleById(id)).filter(Boolean).sort((a, b) => roleIdx(b.id) - roleIdx(a.id));

  function setLocalMute(m, on) {
    on ? state.localMuted.add(m.id) : state.localMuted.delete(m.id);
    localStorage.setItem('localMuted', JSON.stringify([...state.localMuted]));
    applyAudio();
    render();
  }
  function setLocalVolume(m, value) {
    state.localVolume[m.id] = value;
    localStorage.setItem('localVolume', JSON.stringify(state.localVolume));
    applyAudio();
  }
  function mention(m) {
    if (state.view !== 'chat') { state.view = 'chat'; render(); }
    if (state.home && !state.textChannel) return messageUser(m.id);
    insertAtCursor('@' + m.name + ' ');
  }
  async function kickMember(m) {
    if (await confirmDialog({ title: `Expulsar ${m.name}`, text: `${m.name} vai sair do servidor, mas pode entrar de novo com a mesma conta.`, confirm: 'Expulsar' })) modAction(m, 'kick');
  }
  async function banMember(m) {
    if (await confirmDialog({ title: `Banir ${m.name}`, text: `${m.name} não vai conseguir entrar mais no servidor. Dá para desfazer em Configurações do servidor → Banimentos.`, confirm: 'Banir' })) modAction(m, 'ban');
  }

  // ----- Submenu (fica fora do menu principal para não ser cortado pela rolagem) -----
  let submenuTimer = null;
  function closeSubmenu() {
    clearTimeout(submenuTimer);
    $('#context-submenu').classList.add('hidden');
    document.querySelectorAll('#context-menu .menu-item.sub-open').forEach((n) => n.classList.remove('sub-open'));
  }
  function menuSub(label, icon, build) {
    const item = el('button', { type: 'button', class: 'menu-item has-sub' },
      el('span', { class: 'mi-label' }, icon ? Icon(icon, 18) : null, el('span', { textContent: label })), el('span', { class: 'mi-chev' }, Icon('chevronDown', 16)));
    const open = () => {
      clearTimeout(submenuTimer);
      const sub = $('#context-submenu');
      if (item.classList.contains('sub-open') && !sub.classList.contains('hidden')) return;
      closeSubmenu();
      item.classList.add('sub-open');
      sub.replaceChildren(...build());
      sub.classList.remove('hidden');
      const r = item.getBoundingClientRect();
      const w = sub.offsetWidth, h = sub.offsetHeight;
      const left = r.right + 6 + w > innerWidth - 8 ? r.left - w - 6 : r.right + 6;
      sub.style.left = Math.max(8, left) + 'px';
      sub.style.top = Math.max(8, Math.min(r.top - 6, innerHeight - h - 8)) + 'px';
    };
    item.addEventListener('mouseenter', open);
    item.addEventListener('mouseleave', () => { submenuTimer = setTimeout(closeSubmenu, 250); });
    item.addEventListener('click', (e) => { e.stopPropagation(); open(); });
    return item;
  }
  $('#context-submenu').addEventListener('mouseenter', () => clearTimeout(submenuTimer));
  $('#context-submenu').addEventListener('mouseleave', () => { submenuTimer = setTimeout(closeSubmenu, 250); });

  // Item com marcação à direita (como "Silenciar no servidor ✓" no Discord).
  const menuToggle = (label, icon, on, onclick, cls = '') => el('button', { type: 'button', class: 'menu-item toggle ' + cls, role: 'menuitemcheckbox', ariaChecked: String(on), onclick: async () => { closeMenu(); await onclick(); } },
    el('span', { class: 'mi-label' }, icon ? Icon(icon, 18) : null, el('span', { textContent: label })), el('span', { class: 'mi-check' + (on ? ' on' : '') }));
  const menuAction = (label, icon, onclick, cls = '') => el('button', { type: 'button', class: 'menu-item ' + cls, onclick: async () => { closeMenu(); await onclick(); } },
    el('span', { class: 'mi-label' }, icon ? Icon(icon, 18) : null, el('span', { textContent: label })));

  function openMemberMenu(accountId, e) {
    e.preventDefault();
    e.stopPropagation();
    const m = member(accountId);
    if (!m) return;
    closeProfile();
    const menu = $('#context-menu');
    const self = m.id === state.me.accountId;
    const v = voiceOf(m);
    const sep = () => el('div', { class: 'menu-sep' });
    const groups = [];

    groups.push([
      menuAction('Perfil', 'userCog', () => openProfile(m.id, { x: e.clientX, y: e.clientY })),
      !self && canSend() && !state.home ? menuAction('Mencionar', 'at', () => mention(m)) : null,
    ]);
    if (!self) groups.push(socialMenuItems(m));

    if (!self) {
      const local = [];
      if (sameCall(m)) {
        const vol = Math.round((state.localVolume[m.id] ?? 1) * 100);
        const label = el('span', { textContent: `${vol}%` });
        const range = el('input', { type: 'range', min: 0, max: 100, value: vol, ariaLabel: 'Volume do usuário' });
        range.oninput = () => { label.textContent = range.value + '%'; setLocalVolume(m, range.value / 100); };
        local.push(el('div', { class: 'menu-range' }, el('div', { class: 'menu-range-head' }, el('span', { textContent: 'Volume do usuário' }), label), range));
      }
      local.push(menuToggle('Mutar para mim', 'volumeX', state.localMuted.has(m.id), () => setLocalMute(m, !state.localMuted.has(m.id))));
      groups.push(local);
    }

    const actOn = canActOn(m);
    const mod = [];
    if (hasPerm('MUTE_MEMBERS') && actOn) {
      mod.push(menuToggle('Silenciar no servidor', 'micOff', !!m.serverMuted, () => modAction(m, 'serverMute', !m.serverMuted), 'danger-check'));
      mod.push(menuToggle('Ensurdecer no servidor', 'headphonesOff', !!m.serverDeafened, () => modAction(m, 'serverDeafen', !m.serverDeafened), 'danger-check'));
    }
    if (hasPerm('MOVE_MEMBERS') && actOn && v) {
      const others = state.server.channels.filter((c) => c.type === 'voice' && c.id !== v.channel);
      if (others.length) mod.push(menuSub('Mover para', 'volume', () => others.map((c) => menuAction(c.name, 'volume', () => modAction(m, 'move', c.id)))));
      mod.push(menuAction('Desconectar da voz', 'phone', () => modAction(m, 'disconnect'), 'danger'));
    }
    if (hasPerm('TIMEOUT') && !self && iOutrank(m)) {
      mod.push(timedOut(m)
        ? menuAction('Remover castigo', 'refresh', () => modAction(m, 'timeout', 0))
        : menuSub(`Castigar ${m.name}`, 'pause', () => [el('div', { class: 'menu-section', textContent: 'NÃO FALA NEM ESCREVE POR' }), ...TIMEOUTS.map(([label, min]) => menuAction(label, null, () => modAction(m, 'timeout', min)))]));
    }
    if (hasPerm('MANAGE_ROLES') && actOn && state.server.roles.length > 1) {
      mod.push(menuSub('Cargos', 'crown', () => {
        const myTop = topPos(meMember());
        return state.server.roles.slice(1).map((r, i) => ({ r, i: i + 1 })).reverse().map(({ r, i }) => {
          const current = member(m.id) || m;
          const has = current.roles.includes(r.id);
          const box = el('input', { type: 'checkbox', class: 'ds-check', checked: has, disabled: i >= myTop });
          box.onchange = () => {
            const now = member(m.id) || m;
            modAction(m, 'setRoles', box.checked ? [...now.roles, r.id] : now.roles.filter((x) => x !== r.id));
          };
          return el('label', { class: 'menu-check' + (i >= myTop ? ' disabled' : '') }, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), el('span', { class: 'grow', textContent: r.name }), box);
        });
      }));
    }
    if (mod.length) groups.push(mod);

    const danger = [];
    if (hasPerm('KICK') && !self && iOutrank(m)) danger.push(menuAction(`Expulsar ${m.name}`, 'x', () => kickMember(m), 'danger'));
    if (hasPerm('BAN') && !self && iOutrank(m)) danger.push(menuAction(`Banir ${m.name}`, 'lock', () => banMember(m), 'danger'));
    if (danger.length) groups.push(danger);

    const items = [];
    for (const g of groups.map((list) => list.filter(Boolean)).filter((list) => list.length)) {
      if (items.length) items.push(sep());
      items.push(...g);
    }
    menu.replaceChildren(...items);
    menu.classList.add('member-menu');
    showMenuAt(e.clientX, e.clientY);
  }

  // ----- Cartão de perfil -----
  let profileFor = null;
  function closeProfile() {
    profileFor = null;
    $('#profile-card').classList.add('hidden');
  }
  function openProfile(accountId, anchor) {
    const m = member(accountId);
    if (!m) return;
    closeMenu();
    profileFor = { id: accountId, anchor };
    renderProfile();
    placeProfile(anchor);
  }
  // Abre ao lado do que foi clicado (à esquerda da lista de membros, à direita do chat).
  function placeProfile(anchor) {
    const card = $('#profile-card');
    const w = card.offsetWidth, h = card.offsetHeight;
    let x, y;
    if (anchor instanceof Element) {
      const r = anchor.getBoundingClientRect();
      x = r.left > innerWidth / 2 ? r.left - w - 12 : r.right + 12;
      y = r.top - 12;
    } else {
      x = anchor.x + 12;
      y = anchor.y - 40;
    }
    card.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
    card.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  }
  function renderProfile() {
    const card = $('#profile-card');
    const m = profileFor && member(profileFor.id);
    if (!m) return closeProfile();
    const self = m.id === state.me.accountId;
    const v = voiceOf(m);
    const room = v && channelById(v.channel);
    const color = m.color || '#5865f2';
    const presence = !m.online ? ['offline', 'Offline'] : room ? ['online', 'Em ' + room.name] : ['online', 'Online'];
    const canManageRoles = hasPerm('MANAGE_ROLES') && canActOn(m);
    const myTop = topPos(meMember());
    const roles = sortedRoles(m);
    const removeRole = (r) => modAction(m, 'setRoles', m.roles.filter((x) => x !== r.id));

    const roleChips = roles.map((r) => el('span', { class: 'pc-role' },
      el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), el('span', { textContent: r.name }),
      canManageRoles && roleIdx(r.id) < myTop ? el('button', { type: 'button', class: 'pc-role-x', ariaLabel: 'Tirar o cargo ' + r.name, tip: 'Tirar cargo', onclick: () => removeRole(r) }, Icon('x', 12)) : null));
    const addable = canManageRoles ? state.server.roles.slice(1).filter((r) => !m.roles.includes(r.id) && roleIdx(r.id) < myTop) : [];
    if (addable.length) {
      roleChips.push(el('button', { type: 'button', class: 'pc-role add', tip: 'Adicionar cargo', ariaLabel: 'Adicionar cargo', onclick: (e) => {
        e.stopPropagation();
        const menu = $('#context-menu');
        menu.replaceChildren(el('div', { class: 'menu-section', textContent: 'ADICIONAR CARGO' }),
          ...addable.slice().reverse().map((r) => el('button', { type: 'button', class: 'menu-item', onclick: () => { closeMenu(); modAction(m, 'setRoles', [...m.roles, r.id]); } },
            el('span', { class: 'mi-label' }, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), el('span', { textContent: r.name })))));
        menu.classList.add('member-menu');
        const rect = e.currentTarget.getBoundingClientRect();
        showMenuAt(rect.left, rect.bottom + 6);
      } }, Icon('plus', 14)));
    }

    const voiceBox = !self && sameCall(m) ? (() => {
      const vol = Math.round((state.localVolume[m.id] ?? 1) * 100);
      const value = el('span', { class: 'pc-vol-value', textContent: vol + '%' });
      const range = el('input', { type: 'range', min: 0, max: 100, value: vol, ariaLabel: 'Volume de ' + m.name });
      range.oninput = () => { value.textContent = range.value + '%'; setLocalVolume(m, range.value / 100); };
      return el('div', { class: 'pc-section' },
        el('div', { class: 'pc-label', textContent: 'VOLUME PARA VOCÊ' }),
        el('div', { class: 'pc-volume' }, Icon('volume', 18), range, value),
        el('label', { class: 'pc-switch' }, el('span', { textContent: 'Mutar para mim' }),
          (() => { const t = el('input', { type: 'checkbox', class: 'ds-switch', checked: state.localMuted.has(m.id) }); t.onchange = () => setLocalMute(m, t.checked); return t; })()));
    })() : null;

    const actions = [];
    if (self) actions.push(el('button', { type: 'button', class: 'pc-btn primary', onclick: () => { closeProfile(); $('#btn-settings').click(); } }, Icon('pencil', 16), 'Editar perfil'));
    else {
      const rel = relation(m.id);
      const social = (icon, label, run, primary = true) => actions.push(el('button', { type: 'button', class: 'pc-btn' + (primary ? ' primary' : ''), onclick: () => { closeProfile(); run(); } }, Icon(icon, 16), label));
      if (rel === 'friend') social('message', 'Enviar mensagem', () => messageUser(m.id));
      else if (rel === 'none') social('userPlus', 'Adicionar amigo', () => friendRequest({ id: m.id }));
      else if (rel === 'incoming') social('check', 'Aceitar pedido', () => acceptFriend(m));
      else if (rel === 'outgoing') social('x', 'Cancelar pedido', () => declineFriend(m), false);
      else social('ban', 'Desbloquear', () => unblockUser(m), false);
      if (canSend() && !state.home) actions.push(el('button', { type: 'button', class: 'pc-btn', onclick: () => { closeProfile(); mention(m); } }, Icon('at', 16), 'Mencionar'));
      if (!sameCall(m)) actions.push(el('button', { type: 'button', class: 'pc-btn', onclick: () => { setLocalMute(m, !state.localMuted.has(m.id)); renderProfile(); } },
        Icon(state.localMuted.has(m.id) ? 'volume' : 'volumeX', 16), state.localMuted.has(m.id) ? 'Desmutar para mim' : 'Mutar para mim'));
    }

    card.style.setProperty('--pc-color', color);
    // O banner é reaproveitado enquanto for o mesmo: refazê-lo reiniciaria a animação de um GIF a cada atualização.
    let banner = card.querySelector(':scope > .pc-banner');
    const bannerKey = m.id + '|' + (m.bannerUrl || '');
    if (!banner || banner.dataset.key !== bannerKey) {
      banner = el('div', { class: 'pc-banner', data: { key: bannerKey }, style: m.bannerUrl ? { backgroundImage: `url("${m.bannerUrl}")` } : {} },
        el('div', { class: 'pc-top-actions' },
          el('button', { type: 'button', class: 'pc-icon-btn', tip: 'Mais', ariaLabel: 'Mais ações', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); openMemberMenu(m.id, { preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 6 }); } }, el('span', { class: 'kebab', textContent: '⋯' }))));
    }
    // Só o que vem depois do banner é refeito; o banner nunca sai da tela enquanto for o mesmo.
    for (const child of [...card.children]) if (child !== banner) child.remove();
    if (banner.parentNode !== card) card.prepend(banner);
    card.append(
      el('div', { class: 'pc-avatar-row' },
        el('div', { class: 'pc-avatar' }, avatar(m), el('span', { class: 'pc-status ' + presence[0], tip: presence[1] }))),
      el('div', { class: 'pc-body' },
        el('div', { class: 'pc-name', textContent: m.name, style: { color: nameColor(m) || '' } }),
        el('div', { class: 'pc-tags' },
          isOwner(m.id) ? el('span', { class: 'pc-tag owner' }, Icon('crown', 12), 'Dono do servidor') : null,
          el('span', { class: 'pc-tag ' + presence[0] }, el('span', { class: 'pc-dot ' + presence[0] }), presence[1]),
          m.serverMuted ? el('span', { class: 'pc-tag warn' }, Icon('micOff', 12), 'Silenciado') : null,
          m.serverDeafened ? el('span', { class: 'pc-tag warn' }, Icon('headphonesOff', 12), 'Ensurdecido') : null),
        timedOut(m) ? el('div', { class: 'pc-timeout' }, Icon('pause', 14), el('span', { textContent: 'De castigo até ' + formatUntil(m.timeoutUntil) })) : null,
        el('div', { class: 'pc-panel' },
          m.since ? el('div', { class: 'pc-section' }, el('div', { class: 'pc-label', textContent: 'MEMBRO DESDE' }),
            el('div', { class: 'pc-since' }, el('span', { class: 'pc-server-mini', textContent: initials(serverName()) }), new Date(m.since).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }))) : null,
          el('div', { class: 'pc-section' }, el('div', { class: 'pc-label', textContent: roles.length ? `CARGOS — ${roles.length}` : 'CARGOS' }),
            el('div', { class: 'pc-roles' }, roleChips.length ? roleChips : el('span', { class: 'muted-text', textContent: 'Sem cargos' }))),
          voiceBox),
        actions.length ? el('div', { class: 'pc-actions' }, actions) : null));
    card.classList.remove('hidden');
  }
  document.addEventListener('mousedown', (e) => {
    if (!profileFor || e.target.closest('#profile-card, #context-menu, #context-submenu, .confirm-overlay')) return;
    closeProfile();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && profileFor) closeProfile(); });

  function showMenuAt(x, y) {
    const menu = $('#context-menu');
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, innerWidth - rect.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - rect.height - 8)) + 'px';
  }

  // ---------------- configurações do servidor e do canal (estilo Discord) ----------------
  // Uma tela cheia com menu lateral. Edições de nome, cor, permissões e acesso ficam num
  // rascunho: a barra "alterações não salvas" aparece e só "Salvar alterações" envia.
  const PERM_INFO = {
    ADMIN: ['Administrador', 'Dá todas as permissões e ignora as restrições dos canais. Cuidado: é uma permissão perigosa.'],
    MANAGE_ROLES: ['Gerenciar cargos', 'Permite criar, editar e apagar cargos abaixo do cargo mais alto do membro, e dar ou tirar esses cargos.'],
    MANAGE_CHANNELS: ['Gerenciar canais', 'Permite criar, renomear, tornar privados e excluir canais.'],
    KICK: ['Expulsar membros', 'Permite remover membros do servidor. Eles podem entrar de novo.'],
    BAN: ['Banir membros', 'Permite banir membros de forma permanente e ver a lista de banimentos.'],
    TIMEOUT: ['Castigar membros', 'Quem está de castigo não envia mensagens, não fala e não transmite por um tempo.'],
    SEND_MESSAGES: ['Enviar mensagens', 'Permite enviar mensagens, arquivos e reações nos canais de texto.'],
    MANAGE_MESSAGES: ['Gerenciar mensagens', 'Permite apagar mensagens de outros membros.'],
    MENTION_EVERYONE: ['Mencionar @everyone e @here', 'Permite notificar todo mundo do servidor de uma vez.'],
    CONNECT: ['Conectar', 'Permite entrar nos canais de voz.'],
    SPEAK: ['Falar', 'Permite falar nos canais de voz. Sem ela, o membro só escuta.'],
    STREAM: ['Vídeo', 'Permite ligar a câmera e compartilhar a tela nos canais de voz.'],
    SOUNDBOARD: ['Usar efeitos sonoros', 'Permite tocar os efeitos do soundboard (grilo, trovão…) na chamada.'],
    MUTE_MEMBERS: ['Silenciar e ensurdecer membros', 'Permite silenciar ou ensurdecer outras pessoas para todo o servidor.'],
    MOVE_MEMBERS: ['Mover membros', 'Permite mover e desconectar membros entre canais de voz.'],
  };
  const PERM_GROUPS = [
    ['Permissões gerais do servidor', ['ADMIN', 'MANAGE_ROLES', 'MANAGE_CHANNELS']],
    ['Permissões de membros', ['KICK', 'BAN', 'TIMEOUT']],
    ['Permissões de canais de texto', ['SEND_MESSAGES', 'MANAGE_MESSAGES', 'MENTION_EVERYONE']],
    ['Permissões de canais de voz', ['CONNECT', 'SPEAK', 'STREAM', 'SOUNDBOARD', 'MUTE_MEMBERS', 'MOVE_MEMBERS']],
  ];
  const ROLE_COLORS = ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63', '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#607d8b',
    '#11806a', '#1f8b4c', '#206694', '#71368a', '#ad1457', '#c27c0e', '#a84300', '#992d22', '#979c9f', '#546e7a'];
  const SERVER_PAGES = [
    { id: 'overview', label: 'Visão geral', icon: 'settings', perm: null },
    { id: 'roles', label: 'Cargos', icon: 'crown', perm: 'MANAGE_ROLES' },
    { id: 'channels', label: 'Canais', icon: 'hash', perm: 'MANAGE_CHANNELS' },
    { id: 'members', label: 'Membros', icon: 'users', perm: null },
    { id: 'bans', label: 'Banimentos', icon: 'lock', perm: 'BAN', group: 'MODERAÇÃO' },
  ];
  const ADMIN_PERMS = ['ADMIN', 'MANAGE_ROLES', 'MANAGE_CHANNELS', 'BAN', 'KICK', 'TIMEOUT'];
  const admin = { mode: 'server', page: 'overview', channelId: null, roleId: null, roleTab: 'display', draft: null, base: null, draftKey: null, search: {}, busy: false };
  const serverName = () => state.server?.serverName || 'Resenha';
  const canAdmin = () => ADMIN_PERMS.some(hasPerm);
  const adminOpen = () => !$('#server-settings').classList.contains('hidden');
  const dirty = () => !!admin.draft && JSON.stringify(admin.draft) !== JSON.stringify(admin.base);

  // Rascunho do editor atual. Se ninguém mexeu, acompanha o que chega do servidor.
  function useDraft(key, fromServer) {
    const base = fromServer();
    if (admin.draftKey !== key || !dirty()) {
      admin.draftKey = key;
      admin.base = base;
      admin.draft = structuredClone(base);
    } else {
      admin.base = base;
    }
    return admin.draft;
  }
  function resetDraft() {
    admin.draft = admin.base ? structuredClone(admin.base) : null;
    renderServerSettings(true);
  }
  // Com alterações pendentes, sair da tela não é permitido: a barra chacoalha, como no Discord.
  function guardLeave() {
    if (!dirty()) return true;
    const bar = $('#admin-savebar');
    bar.classList.remove('shake');
    void bar.offsetWidth;
    bar.classList.add('shake');
    return false;
  }
  function clearDraft() {
    admin.draft = admin.base = admin.draftKey = null;
  }
  function go(update) {
    if (!guardLeave()) return;
    clearDraft();
    Object.assign(admin, update);
    renderServerSettings(true);
    $('#settings-body').scrollTop = 0;
  }

  function openServerSettings(page) {
    if (!canAdmin()) return;
    clearDraft();
    Object.assign(admin, { mode: 'server', page: page || 'overview', roleId: null, roleTab: 'display', search: {} });
    $('#server-settings').classList.remove('hidden');
    renderServerSettings(true);
  }
  function openChannelSettings(id, page = 'overview') {
    if (!hasPerm('MANAGE_CHANNELS')) return;
    clearDraft();
    Object.assign(admin, { mode: 'channel', channelId: id, page, search: {} });
    $('#server-settings').classList.remove('hidden');
    renderServerSettings(true);
  }
  function closeServerSettings() {
    if (!guardLeave()) return false;
    clearDraft();
    $('#server-settings').classList.add('hidden');
    return true;
  }
  $('#server-settings-close').onclick = () => closeServerSettings();

  // Confirmação dentro do app (no lugar do confirm() do navegador).
  function confirmDialog({ title, text, confirm = 'Confirmar', danger = true }) {
    return new Promise((resolve) => {
      const done = (value) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      };
      const overlay = el('div', { class: 'confirm-overlay', onmousedown: (e) => e.target === overlay && done(false) },
        el('div', { class: 'confirm-card', role: 'alertdialog', ariaModal: 'true' },
          el('h2', { textContent: title }),
          el('p', { textContent: text }),
          el('div', { class: 'confirm-actions' },
            el('button', { type: 'button', class: 'btn-ghost', textContent: 'Cancelar', onclick: () => done(false) }),
            el('button', { type: 'button', class: danger ? 'btn-danger' : 'btn-primary', textContent: confirm, onclick: () => done(true) }))));
      document.body.append(overlay);
      document.addEventListener('keydown', onKey, true);
      overlay.querySelector('.confirm-actions button:last-child').focus();
    });
  }

  // Interruptor no estilo Discord.
  function toggle(checked, onchange, disabled = false, label = '') {
    const input = el('input', { type: 'checkbox', class: 'ds-switch', checked, disabled, ariaLabel: label });
    input.onchange = () => onchange(input.checked);
    return input;
  }

  function pageHead(title, description, ...actions) {
    return el('div', { class: 'admin-head' },
      el('div', {}, el('h1', { textContent: title }), description ? el('p', { class: 'section-description', textContent: description }) : null),
      actions.length ? el('div', { class: 'admin-head-actions' }, actions) : null);
  }
  function searchBox(key, placeholder, onInput) {
    const input = el('input', { type: 'search', class: 'admin-search', placeholder, value: admin.search[key] || '', ariaLabel: placeholder });
    input.oninput = () => { admin.search[key] = input.value; onInput(); };
    return input;
  }
  const matches = (text, key) => !admin.search[key] || text.toLowerCase().includes(admin.search[key].trim().toLowerCase());
  const membersWith = (roleId) => state.server.members.filter((m) => m.roles.includes(roleId));

  function renderServerSettings(force = false) {
    if (!state.server || !adminOpen()) return;
    if (!canAdmin()) { clearDraft(); return $('#server-settings').classList.add('hidden'); }
    const body = $('#settings-body');
    // Não redesenha embaixo de quem está digitando (o rascunho guarda o valor, mas o foco se perderia).
    if (!force && body.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=search], input:not([type]), textarea, select')) return;
    if (admin.mode === 'channel' && !channelById(admin.channelId)) { admin.mode = 'server'; admin.page = 'channels'; clearDraft(); }
    if (admin.mode === 'server') {
      const page = SERVER_PAGES.find((p) => p.id === admin.page);
      if (!page || (page.perm && !hasPerm(page.perm))) admin.page = 'overview';
    }
    const scroll = body.scrollTop;
    renderAdminNav();
    const content = admin.mode === 'channel' ? channelPage() : {
      overview: overviewPage, roles: rolesPage, channels: channelsPage, members: membersPage, bans: bansPage,
    }[admin.page]();
    body.replaceChildren(content);
    body.scrollTop = scroll;
    renderSavebar();
  }

  function renderAdminNav() {
    const nav = $('#admin-nav');
    const navButton = (label, icon, active, onclick, cls = '') => el('button', { type: 'button', ariaLabel: label, class: (active ? 'active ' : '') + cls, onclick }, icon ? Icon(icon, 18) : null, el('span', { textContent: label }));
    if (admin.mode === 'channel') {
      const c = channelById(admin.channelId);
      nav.replaceChildren(
        el('div', { class: 'admin-nav-title' }, Icon(c.type === 'text' ? 'hash' : 'volume', 16), el('span', { textContent: c.name })),
        el('div', { class: 'settings-nav-label', textContent: c.type === 'text' ? 'CANAL DE TEXTO' : 'CANAL DE VOZ' }),
        el('nav', { ariaLabel: 'Seções do canal' },
          navButton('Visão geral', 'settings', admin.page === 'overview', () => go({ page: 'overview' })),
          navButton('Permissões', 'lock', admin.page === 'permissions', () => go({ page: 'permissions' }))),
        el('div', { class: 'settings-nav-bottom' },
          canAdmin() ? navButton('Voltar ao servidor', 'chevronDown', false, () => go({ mode: 'server', page: 'channels' }), 'admin-back') : null,
          navButton('Excluir canal', 'trash', false, () => deleteChannel(c), 'danger')));
      return;
    }
    const items = [];
    let group = null;
    for (const p of SERVER_PAGES) {
      if (p.perm && !hasPerm(p.perm)) continue;
      if (p.group && p.group !== group) items.push(el('div', { class: 'settings-nav-label', textContent: (group = p.group) }));
      items.push(navButton(p.label, p.icon, admin.page === p.id, () => go({ page: p.id, roleId: null })));
    }
    nav.replaceChildren(
      el('div', { class: 'admin-nav-title' }, el('span', { textContent: serverName().toUpperCase() })),
      el('div', { class: 'settings-nav-label', textContent: 'CONFIGURAÇÕES DO SERVIDOR' }),
      el('nav', { ariaLabel: 'Seções do servidor' }, items),
      isOwner(state.me.accountId) ? el('div', { class: 'settings-nav-bottom' },
        navButton('Excluir servidor', 'trash', false, deleteCurrentServer, 'danger')) : null);
  }

  function renderSavebar() {
    const bar = $('#admin-savebar');
    const show = dirty();
    bar.classList.toggle('hidden', !show);
    bar.querySelector('#admin-save').disabled = admin.busy;
  }
  $('#admin-reset').onclick = () => resetDraft();
  $('#admin-savebar').addEventListener('animationend', (e) => e.animationName === 'savebar-shake' && $('#admin-savebar').classList.remove('shake'));
  $('#admin-save').onclick = () => saveDraft();

  async function saveDraft() {
    if (!dirty() || admin.busy) return;
    const d = admin.draft;
    admin.busy = true;
    renderSavebar();
    let res;
    try {
      if (admin.draftKey === 'server') {
        const iconChanged = d.icon !== admin.base.icon;
        res = await call('server:update', { name: d.name, ...(iconChanged ? { icon: d.icon || null } : {}) });
      }
      else if (admin.draftKey.startsWith('role:')) res = await call('role', { action: 'update', id: d.id, name: d.name, color: d.color, hoist: d.hoist, perms: d.perms });
      else if (admin.draftKey.startsWith('channel:')) res = await call('channel', { action: 'update', id: d.id, name: d.name,
        private: d.private, allowedRoles: d.private ? d.allowedRoles : [], categoryId: d.categoryId, topic: d.topic });
    } finally {
      admin.busy = false;
    }
    if (!res) return renderSavebar();
    // O servidor já mandou o estado novo antes da confirmação: o rascunho vira a base.
    admin.draftKey = null;
    toast('Alterações salvas', 'info');
    renderServerSettings(true);
  }

  // ----- Visão geral -----
  function overviewPage() {
    const d = useDraft('server', () => ({ name: serverName(), icon: state.server.serverIcon || '' }));
    const s = state.server;
    const owner = member(s.ownerId);
    const name = el('input', { type: 'text', value: d.name, maxLength: 32, disabled: !hasPerm('ADMIN'), ariaLabel: 'Nome do servidor' });
    name.oninput = () => { d.name = name.value; renderSavebar(); };
    const stat = (value, label, icon) => el('div', { class: 'admin-stat' }, Icon(icon, 20), el('strong', { textContent: String(value) }), el('span', { textContent: label }));
    return el('section', {},
      pageHead('Visão geral do servidor', 'Informações básicas do servidor e de quem está nele.'),
      serverIconEditor(d),
      el('div', { class: 'admin-field' },
        el('label', { class: 'admin-label', textContent: 'NOME DO SERVIDOR' }), name,
        hasPerm('ADMIN') ? null : el('span', { class: 'hint', textContent: 'Só administradores podem mudar o nome e o ícone.' })),
      el('div', { class: 'admin-stats' },
        stat(s.members.length, 'membros', 'users'),
        stat(s.members.filter((m) => m.online).length, 'online agora', 'signal'),
        stat(s.channels.length, 'canais', 'hash'),
        stat(s.roles.length - 1, 'cargos', 'crown')),
      owner ? el('div', { class: 'setting-group admin-owner' },
        el('h3', { textContent: 'Dono do servidor' }),
        el('div', { class: 'admin-member-line' }, avatar(owner), el('span', { class: 'grow', textContent: owner.name }), Icon('crown', 16))) : null);
  }

  // Ícone grande clicável, como no Discord: "ALTERAR ÍCONE" ao passar o mouse.
  function serverIconEditor(d) {
    const canEdit = hasPerm('ADMIN');
    const preview = el('div', { class: 'server-icon-big' + (d.icon ? ' has-image' : '') });
    setAvatarContents(preview, d.icon, d.name || serverName());
    const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
    const status = el('span', { class: 'hint icon-status' });
    file.onchange = async () => {
      const chosen = file.files[0];
      file.value = '';
      if (!chosen) return;
      status.textContent = 'Preparando a imagem…';
      try {
        d.icon = await cropToSquarePng(chosen);
        status.textContent = '';
        renderServerSettings(true);
      } catch {
        status.textContent = 'Use uma imagem PNG, JPG, WebP ou GIF de até 8 MB.';
      }
    };
    const pick = () => canEdit && file.click();
    return el('div', { class: 'server-icon-editor' },
      el('button', { type: 'button', class: 'server-icon-button', disabled: !canEdit, ariaLabel: 'Alterar ícone do servidor', onclick: pick },
        preview, canEdit ? el('span', { class: 'server-icon-hover' }, Icon('camera', 20), el('span', { textContent: 'ALTERAR ÍCONE' })) : null),
      canEdit ? el('div', { class: 'server-icon-actions' },
        el('strong', { textContent: 'Ícone do servidor' }),
        el('span', { class: 'hint', textContent: 'Aparece na faixa de servidores e na aba do navegador. Use uma imagem quadrada de pelo menos 256×256; o centro é recortado.' }),
        el('div', { class: 'row-actions' },
          el('button', { type: 'button', class: 'btn-primary small', textContent: 'Enviar imagem', onclick: pick }),
          d.icon ? el('button', { type: 'button', class: 'link-btn', textContent: 'Remover', onclick: () => { d.icon = ''; renderServerSettings(true); } }) : null),
        status) : null,
      file);
  }

  // ----- Cargos -----
  function rolesPage() {
    if (admin.roleId && roleById(admin.roleId)) return roleEditor();
    admin.roleId = null;
    const roles = state.server.roles;
    const myTop = topPos(meMember());
    const list = el('div', { class: 'admin-table' });
    const fill = () => {
      const rows = [...roles].reverse().filter((r) => r.id !== 'everyone' && matches(r.name, 'roles'));
      list.replaceChildren(
        el('div', { class: 'admin-table-head' }, el('span', { class: 'grow', textContent: `CARGOS — ${roles.length - 1}` }), el('span', { class: 'col-members', textContent: 'MEMBROS' }), el('span', { class: 'col-actions' })),
        ...rows.map((r) => {
          const count = membersWith(r.id).length;
          const locked = roleIdx(r.id) >= myTop;
          return el('div', { class: 'admin-row clickable', tabIndex: 0, onclick: () => go({ roleId: r.id, roleTab: 'display' }), onkeydown: (e) => e.key === 'Enter' && go({ roleId: r.id, roleTab: 'display' }) },
            el('span', { class: 'role-shield', style: { color: r.color || '#99aab5' } }, Icon('crown', 18)),
            el('span', { class: 'grow role-name', textContent: r.name }, locked ? el('span', { class: 'admin-badge', textContent: 'acima de você' }) : null),
            el('span', { class: 'col-members' }, el('span', { textContent: String(count) }), Icon('users', 16)),
            el('span', { class: 'col-actions' }, el('button', { type: 'button', class: 'icon-btn', tip: 'Editar', ariaLabel: 'Editar ' + r.name, onclick: (e) => { e.stopPropagation(); go({ roleId: r.id, roleTab: 'display' }); } }, Icon('pencil', 16))));
        }),
        ...(rows.length ? [] : [el('div', { class: 'admin-empty', textContent: 'Nenhum cargo encontrado.' })]));
    };
    fill();
    const everyone = roleById('everyone');
    return el('section', {},
      pageHead('Cargos', 'Use cargos para organizar os membros e definir o que cada um pode fazer. O cargo mais alto da lista manda nos de baixo.'),
      el('button', { type: 'button', class: 'admin-callout clickable', onclick: () => go({ roleId: 'everyone', roleTab: 'permissions' }) },
        el('span', { class: 'callout-icon' }, Icon('users', 22)),
        el('span', { class: 'grow' }, el('strong', { textContent: 'Permissões padrão' }), el('small', { textContent: `@everyone · vale para todos os membros do servidor (${everyone.perms.length} permissões)` })),
        Icon('chevronDown', 18)),
      el('div', { class: 'admin-toolbar' },
        searchBox('roles', 'Pesquisar cargos', fill),
        el('button', { type: 'button', class: 'btn-primary', textContent: 'Criar cargo', onclick: createRole })),
      list,
      el('p', { class: 'hint', textContent: 'Membros usam a cor do cargo mais alto que tiverem.' }));
  }

  async function createRole() {
    if (!guardLeave()) return;
    const res = await call('role', { action: 'create', name: 'novo cargo', color: '#99aab5', perms: [] });
    if (res) go({ roleId: res.id, roleTab: 'display' });
  }

  function roleEditor() {
    const roles = state.server.roles;
    const role = roleById(admin.roleId);
    const i = roleIdx(role.id);
    const editable = i < topPos(meMember());
    const everyone = role.id === 'everyone';
    const d = useDraft('role:' + role.id, () => ({ id: role.id, name: role.name, color: role.color || '', hoist: !!role.hoist, perms: [...role.perms] }));
    if (everyone && admin.roleTab === 'display') admin.roleTab = 'permissions';

    // Coluna com os cargos (como no Discord), para pular de um para outro.
    const side = el('div', { class: 'role-side' },
      el('div', { class: 'role-side-head' },
        el('button', { type: 'button', class: 'link-btn', onclick: () => go({ roleId: null }) }, el('span', { class: 'back-arrow', textContent: '←' }), 'VOLTAR'),
        el('button', { type: 'button', class: 'icon-btn', tip: 'Criar cargo', ariaLabel: 'Criar cargo', onclick: createRole }, Icon('plus', 16))),
      [...roles].reverse().map((r) => el('button', {
        type: 'button', class: 'role-side-item' + (r.id === role.id ? ' active' : ''),
        onclick: () => r.id !== role.id && go({ roleId: r.id }),
      }, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), el('span', { textContent: r.id === 'everyone' ? '@everyone' : r.name }))));

    const tabs = el('div', { class: 'admin-tabs', role: 'tablist' },
      [['display', 'Exibição'], ['permissions', 'Permissões'], ['members', `Gerenciar membros (${membersWith(role.id).length})`]]
        .filter(([id]) => !everyone || id === 'permissions')
        .map(([id, label]) => el('button', { type: 'button', role: 'tab', class: admin.roleTab === id ? 'active' : '', textContent: label, onclick: () => { admin.roleTab = id; renderServerSettings(true); } })));

    const more = editable && !everyone ? el('div', { class: 'role-hierarchy' },
      el('button', { type: 'button', class: 'icon-btn', tip: 'Subir na hierarquia', ariaLabel: 'Subir na hierarquia', disabled: i + 1 >= topPos(meMember()), onclick: () => call('role', { action: 'move', id: role.id, dir: 1 }) }, el('span', { textContent: '▲' })),
      el('button', { type: 'button', class: 'icon-btn', tip: 'Descer na hierarquia', ariaLabel: 'Descer na hierarquia', disabled: i <= 1, onclick: () => call('role', { action: 'move', id: role.id, dir: -1 }) }, el('span', { textContent: '▼' }))) : null;

    let panel;
    if (admin.roleTab === 'display') panel = roleDisplayTab(role, d, editable);
    else if (admin.roleTab === 'permissions') panel = rolePermsTab(role, d, editable, everyone);
    else panel = roleMembersTab(role, editable);

    return el('section', { class: 'role-layout' }, side,
      el('div', { class: 'role-main' },
        el('div', { class: 'role-main-head' },
          el('h2', { textContent: 'EDITAR CARGO — ' + (everyone ? '@everyone' : d.name || role.name).toUpperCase() }), more),
        !editable ? el('div', { class: 'admin-notice' }, Icon('lock', 16), el('span', { textContent: 'Este cargo está no mesmo nível ou acima do seu cargo mais alto, então você só pode vê-lo.' })) : null,
        tabs, panel));
  }

  function roleDisplayTab(role, d, editable) {
    const name = el('input', { type: 'text', value: d.name, maxLength: 32, disabled: !editable, ariaLabel: 'Nome do cargo' });
    name.oninput = () => { d.name = name.value; renderSavebar(); };
    const setColor = (c) => { d.color = c; renderServerSettings(true); };
    const custom = el('input', { type: 'color', value: d.color || '#99aab5', disabled: !editable, ariaLabel: 'Cor personalizada' });
    custom.oninput = () => { d.color = custom.value; renderSavebar(); swatches.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected')); customWrap.classList.add('selected'); };
    const customWrap = el('label', { class: 'swatch big custom' + (d.color && !ROLE_COLORS.includes(d.color) ? ' selected' : ''), tip: 'Cor personalizada', style: { background: d.color && !ROLE_COLORS.includes(d.color) ? d.color : '' } }, custom, Icon('pencil', 14));
    const swatches = el('div', { class: 'swatches' },
      el('button', { type: 'button', class: 'swatch big default' + (!d.color ? ' selected' : ''), tip: 'Padrão (sem cor)', disabled: !editable, onclick: () => setColor('') }),
      customWrap,
      el('div', { class: 'swatch-grid' }, ROLE_COLORS.map((c) => el('button', { type: 'button', class: 'swatch' + (d.color === c ? ' selected' : ''), style: { background: c }, ariaLabel: 'Cor ' + c, disabled: !editable, onclick: () => setColor(c) }))));
    const preview = el('div', { class: 'role-preview' }, avatar(meMember()),
      el('div', {}, el('strong', { textContent: meMember().name, style: { color: d.color || 'var(--text-strong)' } }), el('span', { textContent: 'É assim que o nome aparece com esse cargo.' })));
    return el('div', { class: 'admin-panel' },
      el('div', { class: 'admin-field' }, el('label', { class: 'admin-label', textContent: 'NOME DO CARGO *' }), name),
      el('div', { class: 'admin-divider' }),
      el('div', { class: 'admin-field' }, el('label', { class: 'admin-label', textContent: 'COR DO CARGO *' }),
        el('span', { class: 'hint', textContent: 'Membros usam a cor do cargo mais alto que tiverem.' }), swatches, preview),
      el('div', { class: 'admin-divider' }),
      el('label', { class: 'admin-switch-row' },
        el('span', {}, el('strong', { textContent: 'Exibir membros deste cargo separadamente dos outros membros online' }),
          el('small', { textContent: 'Cria um grupo próprio para o cargo na lista de membros.' })),
        toggle(d.hoist, (v) => { d.hoist = v; renderSavebar(); }, !editable, 'Exibir separadamente')),
      editable ? el('div', { class: 'admin-danger-zone' },
        el('div', {}, el('strong', { textContent: 'Excluir cargo' }), el('small', { textContent: 'Tira o cargo de todos os membros e dos canais privados.' })),
        el('button', { type: 'button', class: 'btn-danger-outline', textContent: 'Excluir cargo', onclick: () => deleteRole(role) })) : null);
  }

  async function deleteRole(role) {
    const ok = await confirmDialog({ title: `Excluir o cargo "${role.name}"`, text: `Tem certeza? ${membersWith(role.id).length} membro(s) vão perder esse cargo. Não dá para desfazer.`, confirm: 'Excluir cargo' });
    if (!ok) return;
    if (await call('role', { action: 'delete', id: role.id })) { clearDraft(); admin.roleId = null; renderServerSettings(true); }
  }

  function rolePermsTab(role, d, editable, everyone) {
    const box = el('div', { class: 'perm-groups' });
    const fill = () => {
      box.replaceChildren(...PERM_GROUPS.map(([title, keys]) => {
        const rows = keys.filter((k) => state.permNames[k] && matches(PERM_INFO[k][0] + ' ' + PERM_INFO[k][1], 'perms'));
        if (!rows.length) return null;
        return el('div', { class: 'perm-group' }, el('h3', { class: 'admin-label', textContent: title.toUpperCase() }),
          rows.map((k) => {
            const has = d.perms.includes(k);
            const cantGive = !has && !hasPerm(k);
            return el('label', { class: 'admin-switch-row perm-row' + (k === 'ADMIN' ? ' dangerous' : '') },
              el('span', {}, el('strong', { textContent: PERM_INFO[k][0] }), el('small', { textContent: PERM_INFO[k][1] }),
                cantGive && editable ? el('small', { class: 'perm-lock', textContent: 'Você não pode dar uma permissão que não tem.' }) : null),
              toggle(has, (v) => {
                d.perms = v ? [...d.perms, k] : d.perms.filter((p) => p !== k);
                renderSavebar();
              }, !editable || cantGive, PERM_INFO[k][0]));
          }));
      }).filter(Boolean));
      if (!box.childElementCount) box.append(el('div', { class: 'admin-empty', textContent: 'Nenhuma permissão encontrada.' }));
    };
    fill();
    return el('div', { class: 'admin-panel' },
      everyone ? el('div', { class: 'admin-notice info' }, Icon('users', 16), el('span', { textContent: 'Isso vale para todos os membros. Tire uma permissão daqui para restringir quem não tem outro cargo com ela.' })) : null,
      el('div', { class: 'admin-toolbar' },
        searchBox('perms', 'Pesquisar permissões', fill),
        editable ? el('button', { type: 'button', class: 'link-btn', textContent: 'Limpar permissões', onclick: () => { d.perms = []; fill(); renderSavebar(); } }) : null),
      box);
  }

  function roleMembersTab(role, editable) {
    const withRole = membersWith(role.id);
    const setRole = (m, on) => call('mod', { action: 'setRoles', target: m.id, value: on ? [...m.roles, role.id] : m.roles.filter((r) => r !== role.id) });
    const list = el('div', { class: 'admin-list' });
    const fill = () => list.replaceChildren(...withRole.filter((m) => matches(m.name, 'roleMembers')).map((m) => el('div', { class: 'admin-member-line' },
      avatar(m), el('span', { class: 'grow', textContent: m.name, style: { color: nameColor(m) } }),
      editable ? el('button', { type: 'button', class: 'icon-btn', tip: 'Remover membro', ariaLabel: 'Tirar o cargo de ' + m.name, onclick: () => setRole(m, false) }, Icon('x', 16)) : null)),
    ...(withRole.length ? [] : [el('div', { class: 'admin-empty', textContent: 'Ninguém tem este cargo ainda.' })]));
    fill();
    const others = state.server.members.filter((m) => !m.roles.includes(role.id)).sort((a, b) => a.name.localeCompare(b.name));
    const pick = el('select', { ariaLabel: 'Membro para adicionar' }, el('option', { value: '', textContent: 'Escolha um membro…' }), others.map((m) => el('option', { value: m.id, textContent: m.name })));
    return el('div', { class: 'admin-panel' },
      el('div', { class: 'admin-toolbar' },
        searchBox('roleMembers', 'Pesquisar membros', fill),
        editable && others.length ? el('div', { class: 'admin-add' }, pick,
          el('button', { type: 'button', class: 'btn-primary', textContent: 'Adicionar membro', onclick: () => pick.value && setRole(member(pick.value), true) })) : null),
      list);
  }

  // ----- Canais -----
  function channelsPage() {
    const wrap = el('div', { class: 'admin-stack' });
    const fill = () => wrap.replaceChildren(channelNavigation.adminList(admin.search.channels || ''));
    fill();
    return el('section', {},
      pageHead('Canais e grupos', 'Organize texto e voz juntos. Arraste para ordenar ou use o menu ⋯ de cada item.'),
      el('div', { class: 'admin-toolbar' },
        searchBox('channels', 'Pesquisar canais', fill),
        el('button', { type: 'button', class: 'btn-secondary', textContent: 'Criar grupo', onclick: () => channelNavigation.editGroup() }),
        el('button', { type: 'button', class: 'btn-primary', textContent: 'Criar canal', onclick: () => openCreateChannel('text') })),
      wrap);
  }

  async function deleteChannel(c) {
    if (!guardLeave()) return;
    const ok = await confirmDialog({
      title: `Excluir ${c.type === 'text' ? '#' : ''}${c.name}`,
      text: c.type === 'text' ? 'Tem certeza? Todas as mensagens e arquivos deste canal serão apagados para sempre.' : 'Tem certeza? Quem estiver no canal será desconectado.',
      confirm: 'Excluir canal',
    });
    if (!ok) return;
    if (await call('channel', { action: 'delete', id: c.id })) {
      clearDraft();
      if (admin.mode === 'channel') {
        if (canAdmin() && hasPerm('MANAGE_CHANNELS')) Object.assign(admin, { mode: 'server', page: 'channels' });
        else return $('#server-settings').classList.add('hidden');
      }
      renderServerSettings(true);
      toast('Canal excluído', 'info');
    }
  }

  // ----- Configurações de um canal -----
  function channelPage() {
    const c = channelById(admin.channelId);
    const d = useDraft('channel:' + c.id, () => ({ id: c.id, name: c.name, categoryId: c.categoryId, topic: c.topic,
      private: c.private, allowedRoles: [...c.allowedRoles] }));
    if (admin.page === 'permissions') {
      const roles = state.server.roles.slice(1).reverse();
      const roleList = d.private ? el('div', { class: 'setting-group' },
        el('h3', { textContent: 'Quem pode acessar este canal?' }),
        el('span', { class: 'hint', textContent: 'Escolha os cargos. Administradores sempre veem todos os canais.' }),
        el('div', { class: 'admin-list' }, roles.map((r) => {
          const box = el('input', { type: 'checkbox', class: 'ds-check', checked: d.allowedRoles.includes(r.id) });
          box.onchange = () => { d.allowedRoles = box.checked ? [...d.allowedRoles, r.id] : d.allowedRoles.filter((id) => id !== r.id); renderSavebar(); };
          return el('label', { class: 'admin-member-line clickable' }, box,
            el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }),
            el('span', { class: 'grow', textContent: r.name }),
            el('span', { class: 'muted-text', textContent: `${membersWith(r.id).length} membro(s)` }));
        })),
        d.allowedRoles.length ? null : el('div', { class: 'admin-notice' }, Icon('lock', 16), el('span', { textContent: 'Nenhum cargo escolhido: só administradores vão ver este canal. Marque pelo menos um cargo ou desligue "Canal privado".' }))) : null;
      return el('section', {},
        pageHead('Permissões do canal', 'Controle quem pode ver este canal.'),
        el('div', { class: 'setting-group' },
          el('label', { class: 'admin-switch-row' },
            el('span', {}, el('strong', {}, Icon('lock', 16), ' Canal privado'),
              el('small', { textContent: 'Ao tornar o canal privado, só os cargos escolhidos (e administradores) conseguem ver e entrar nele.' })),
            toggle(d.private, (v) => { d.private = v; renderServerSettings(true); }, false, 'Canal privado'))),
        roleList);
    }
    const name = el('input', { type: 'text', value: d.name, maxLength: 64, ariaLabel: 'Nome do canal' });
    const group = channelNavigation.categorySelect(d.categoryId, (id) => { d.categoryId = id; renderSavebar(); });
    const topic = el('textarea', { value: d.topic, maxLength: 512, rows: 3, ariaLabel: 'Descrição do canal',
      placeholder: 'Para que serve este canal?', oninput: (e) => { d.topic = e.target.value; renderSavebar(); } });
    // Canais de texto viram minúsculas com hífens, como no Discord: mostra o resultado enquanto digita.
    const preview = el('span', { class: 'hint' });
    const showPreview = () => {
      const shown = d.name.trim().toLowerCase().replace(/\s+/g, '-');
      preview.textContent = c.type === 'text' && shown !== d.name ? `Vai aparecer como #${shown}` : '';
    };
    name.oninput = () => { d.name = name.value; showPreview(); renderSavebar(); };
    showPreview();
    return el('section', {},
      pageHead('Visão geral', c.type === 'text' ? 'Canal de texto: mensagens, imagens, arquivos e reações.' : 'Canal de voz: voz, câmera e compartilhamento de tela.'),
      el('div', { class: 'admin-field' }, el('label', { class: 'admin-label', textContent: 'NOME DO CANAL' }),
        el('div', { class: 'input-prefix' }, Icon(c.type === 'text' ? 'hash' : 'volume', 18), name),
        preview),
      el('div', { class: 'admin-field' }, el('label', { class: 'admin-label', textContent: 'GRUPO DE CANAIS' }), group,
        el('span', { class: 'hint', textContent: 'Mover de grupo mantém as permissões, as mensagens e a chamada.' })),
      el('div', { class: 'admin-field' }, el('label', { class: 'admin-label', textContent: 'DESCRIÇÃO DO CANAL' }), topic,
        el('span', { class: 'hint', textContent: 'Até 512 caracteres. Aparece no cabeçalho do chat e ao passar o mouse sobre o canal.' })),
      el('div', { class: 'admin-divider' }),
      el('div', { class: 'admin-field' }, el('label', { class: 'admin-label', textContent: 'ACESSO' }),
        el('button', { type: 'button', class: 'admin-callout clickable', onclick: () => go({ page: 'permissions' }) },
          el('span', { class: 'callout-icon' }, Icon(d.private ? 'lock' : 'users', 20)),
          el('span', { class: 'grow' }, el('strong', { textContent: d.private ? 'Canal privado' : 'Todos os membros podem ver' }),
            el('small', { textContent: d.private ? 'Visível para: ' + (d.allowedRoles.map((id) => roleById(id)?.name).filter(Boolean).join(', ') || 'somente administradores') : 'Clique para tornar este canal privado.' })),
          Icon('chevronDown', 18))));
  }

  // ----- Membros -----
  function membersPage() {
    const list = el('div', { class: 'admin-table' });
    const fill = () => {
      const rows = [...state.server.members].sort((a, b) => (b.online - a.online) || topPos(b) - topPos(a) || a.name.localeCompare(b.name)).filter((m) => matches(m.name, 'members'));
      list.replaceChildren(
        el('div', { class: 'admin-table-head' }, el('span', { class: 'grow', textContent: `MEMBROS — ${rows.length}` }), el('span', { class: 'col-roles', textContent: 'CARGOS' }), el('span', { class: 'col-actions' })),
        ...rows.map((m) => el('div', { class: 'admin-row', oncontextmenu: (e) => openMemberMenu(m.id, e) },
          el('span', { class: 'member-cell' }, avatar(m),
            el('span', { class: 'member-cell-text' },
              el('span', { class: 'role-name', textContent: m.name, style: { color: nameColor(m) } }, isOwner(m.id) ? Icon('crown', 14) : null),
              el('small', { textContent: m.online ? 'Online' : 'Offline' }))),
          el('span', { class: 'col-roles' }, m.roles.length
            ? [...m.roles].sort((a, b) => roleIdx(b) - roleIdx(a)).map((id) => roleById(id)).filter(Boolean).map((r) => el('span', { class: 'role-pill' }, el('span', { class: 'dot', style: { background: r.color || '#99aab5' } }), r.name))
            : el('span', { class: 'muted-text', textContent: 'Sem cargos' })),
          el('span', { class: 'col-actions' },
            m.id === state.me.accountId ? null : el('button', { type: 'button', class: 'icon-btn', tip: 'Ações', ariaLabel: 'Ações para ' + m.name, onclick: (e) => openMemberMenu(m.id, e) }, el('span', { class: 'kebab', textContent: '⋯' }))))));
    };
    fill();
    return el('section', {},
      pageHead('Membros', 'Veja quem está no servidor, os cargos de cada um e as ações de moderação (clique em ⋯).'),
      el('div', { class: 'admin-toolbar' }, searchBox('members', 'Pesquisar membros', fill)),
      list);
  }

  // ----- Banimentos -----
  function bansPage() {
    const bans = state.server.bans;
    const list = el('div', { class: 'admin-table' });
    const fill = () => {
      const rows = bans.filter((b) => matches(b.name, 'bans'));
      list.replaceChildren(...rows.map((b) => el('div', { class: 'admin-row' },
        el('span', { class: 'member-cell' }, el('div', { class: 'avatar', style: { background: '#4e5058' }, textContent: initials(b.name) }), el('span', { class: 'role-name', textContent: b.name })),
        el('span', { class: 'col-actions wide' }, el('button', { type: 'button', class: 'btn-danger-outline', textContent: 'Revogar banimento',
          onclick: async () => { if (await confirmDialog({ title: `Revogar o banimento de ${b.name}?`, text: 'A pessoa vai poder entrar no servidor de novo.', confirm: 'Revogar', danger: false })) call('mod', { action: 'unban', target: b.id }); } })))),
      ...(rows.length ? [] : [el('div', { class: 'admin-empty', textContent: 'Nenhum banimento encontrado.' })]));
    };
    fill();
    return el('section', {},
      pageHead('Banimentos', 'Quem foi banido não consegue mais entrar no servidor com a própria conta.'),
      bans.length ? el('div', { class: 'admin-toolbar' }, searchBox('bans', 'Pesquisar banimentos', fill)) : null,
      bans.length ? list : el('div', { class: 'admin-empty big' }, Icon('lock', 40), el('strong', { textContent: 'Nenhum banimento' }), el('span', { textContent: 'Quando alguém for banido, vai aparecer aqui.' })));
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

    pc.ontrack = ({ track, streams, receiver }) => {
      const stream = streams[0] || new MediaStream([track]);
      const kind = stream.id === peer.remoteIds.camera ? 'camera'
        : stream.id === peer.remoteIds.screen || track.kind === 'video' ? 'screen' : 'mic';
      if (kind !== 'mic') {
        if (kind === 'screen') mobileStream.tuneReceiver(receiver);
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

  const { isWatching, setWatching, getWatchQuality, setWatchQuality, syncViewerQuality, addVideoTracks, syncScreenSubscriptions, videoBitrates, tuneSenders, applySharePreset, setSharePreset, captureScreen, watchScreenTrack, switchScreen, startVideo, stopVideo, scheduleRecovery, renderDiagnostics, updateStreamStats, mediaNotice } = MediaSession({ state, socket, call, el, toast, voiceEntry, member, render, renderStage, sendVoiceState, preferCodec });
  const mobileStream = MobileStream({ state, el, Icon, toast, member, voiceEntry, syncViewerQuality, openWatchQualityMenu, toggleStreamMute, togglePip });

  function openWatchQualityMenu(sid, anchor) {
    const menu = $('#context-menu');
    menu.replaceChildren(el('div', { class: 'menu-section', textContent: 'QUALIDADE PARA ASSISTIR' }),
      ...Object.entries(MediaPolicy.watchModes).map(([key, mode]) => el('button', {
        class: 'menu-item preset' + (key === getWatchQuality(sid) ? ' selected' : ''),
        onclick: () => { closeMenu(); setWatchQuality(sid, key); },
      }, el('div', { textContent: mode.label }), el('div', { class: 'muted-text', textContent: mode.desc }))),
      el('div', { class: 'menu-tip', textContent: 'A qualidade acompanha sua reprodução. Em segundo plano o vídeo economiza recursos e o áudio continua.' }));
    const rect = anchor.getBoundingClientRect();
    menu.classList.remove('hidden');
    showMenuAt(rect.left, rect.top - menu.getBoundingClientRect().height - 8);
  }

  function openShareMenu(anchor) {
    const menu = $('#context-menu');
    const live = !!state.local.screen;
    if (!live && !navigator.mediaDevices?.getDisplayMedia) {
      // Sem https o navegador esconde a captura; no celular (Chrome Android, Safari do iPhone) ela não existe.
      const why = !window.isSecureContext
        ? `A transmissão de tela só funciona em conexão segura. Abra o site por https://${location.host}${location.pathname} e tente de novo.`
        : mobileStream.touch
          ? 'Navegadores de celular não permitem transmitir a tela. Pelo celular você pode assistir às transmissões em tela cheia (pince para aproximar) e ligar a câmera; para transmitir, use um computador.'
          : 'Este navegador não permite transmitir a tela. Use o Chrome, Edge ou Firefox atualizado no computador (navegadores embutidos em outros apps não funcionam).';
      menu.replaceChildren(el('div', { class: 'menu-section', textContent: 'COMPARTILHAR TELA' }),
        el('div', { class: 'menu-tip', textContent: why }),
        ...(state.local.camera || !canVideo() ? [] : [menuItem('Ligar câmera', 'camera', () => startVideo('camera'))]));
      const rect = anchor.getBoundingClientRect();
      menu.classList.remove('hidden');
      showMenuAt(rect.left, rect.top - menu.getBoundingClientRect().height - 8);
      return;
    }
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
  // App de desktop: com o Resenhex em segundo plano, a tecla chega pelo gancho global do app.
  // Com a janela em foco, quem cuida da tecla são os eventos acima (e eles respeitam campos de texto).
  const desktopApp = window.resenhexDesktop;
  const syncDesktopPtt = () => desktopApp?.setPushToTalk(state.ptt);
  desktopApp?.onPushToTalk((pressed) => {
    if (!state.ptt.enabled || document.hasFocus() || state.pttHeld === pressed || capturingKey) return;
    state.pttHeld = pressed;
    applyAudio();
  });
  syncDesktopPtt();

  // ---------------- preferências e navegação ----------------
  let capturingKey = false;
  let captureKeyHandler = null;
  let micTestEpoch = 0;
  let cameraTestEpoch = 0;
  let cameraPreview = null;
  let avatarReadEpoch = 0;
  let bannerReadEpoch = 0;
  const BANNER_HINT = 'Imagem PNG, JPG ou WebP (recortada no centro) ou GIF animado de até 5 MB. Salve para aplicar.';
  let pendingBanner = null; // { blob, url }: banner escolhido e ainda não enviado
  function setPendingBanner(blob) {
    if (pendingBanner) URL.revokeObjectURL(pendingBanner.url);
    pendingBanner = blob ? { blob, url: URL.createObjectURL(blob) } : null;
    return pendingBanner?.url || '';
  }
  // O banner é enviado por HTTP (imagens são maiores que o limite das mensagens do socket).
  async function saveBanner(value) {
    const headers = { 'x-token': localStorage.getItem('token') };
    if (value && !pendingBanner) throw new Error('Escolha o banner de novo antes de salvar.');
    let res;
    try {
      res = await fetch('/profile/banner', value ? { method: 'POST', headers, body: pendingBanner.blob } : { method: 'DELETE', headers });
    } catch { throw new Error('Não foi possível enviar o banner. Verifique a conexão e tente novamente.'); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'O banner não foi salvo. Tente novamente.');
    $('#profile-banner').value = body.bannerUrl || '';
    setPendingBanner(null);
  }
  const settingFields = {
    'profile-color': 'color', 'profile-avatar': 'avatar', 'profile-banner': 'banner', 'mic-select': 'micDeviceId', 'speaker-select': 'speakerDeviceId',
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
    return { ...state, color: meMember()?.color || '#5865f2', avatar: meMember()?.avatarUrl || '', banner: meMember()?.bannerUrl || '', sounds: Sounds.enabled,
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
    if (values.banner !== undefined) {
      $('#profile-preview-banner').style.backgroundImage = values.banner ? `url("${values.banner}")` : '';
      $('#profile-banner-remove').disabled ||= !values.banner || $('#profile-banner').disabled;
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
    bannerReadEpoch++;
    $('#profile-banner-file').value = '';
    $('#profile-banner-status').textContent = BANNER_HINT;
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
    if (values.banner !== (meMember().bannerUrl || '')) {
      try { await saveBanner(values.banner); }
      catch (error) {
        if (micChanged) await restartMic(state).catch(() => mediaNotice('Confira o microfone antes de continuar.'));
        throw error;
      }
    }
    for (const key of ['micDeviceId', 'speakerDeviceId', 'cameraDeviceId', 'noiseMode', 'echoCancellation', 'sensAuto', 'sensThreshold', 'uploadMbps', 'shareAudio', 'showStreamStats', 'outputVolume', 'notify']) {
      state[key] = values[key]; localStorage.setItem(key, state[key]);
    }
    localStorage.setItem('showStreamStatsDefault', 'visible-v2');
    state.ptt = { enabled: values.inputMode === 'ptt', code: values.pttCode, label: values.pttLabel };
    state.pttHeld = false;
    localStorage.setItem('ptt', JSON.stringify(state.ptt));
    syncDesktopPtt();
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
      $('#profile-preview-banner').style.backgroundImage = $('#profile-banner').value ? `url("${$('#profile-banner').value}")` : '';
      $('#ptt-key').textContent = state.ptt.label;
      $('#settings-server-link').classList.toggle('hidden', !canAdmin());
      notificationHelp();
      renderDiagnostics();
      drawMeter(-100, false);
      navigator.mediaDevices?.addEventListener('devicechange', fillDevices);
      await fillDevices();
    }, onClose: () => {
      stopSettingsTests();
      setPendingBanner(null);
      // Ouvir devicechange mantém o serviço de câmeras do navegador aberto (dezenas de MB);
      // só vale enquanto a lista de dispositivos está na tela. Descartar chama onClose com o painel aberto.
      queueMicrotask(() => { if (!preferences.isOpen()) navigator.mediaDevices?.removeEventListener('devicechange', fillDevices); });
    } });
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
    try {
      const png = await cropToSquarePng(file);
      if (epoch !== avatarReadEpoch || !preferences.isOpen()) return;
      $('#profile-avatar').value = png;
      $('#profile-photo-status').textContent = 'Foto pronta na prévia. Clique em Salvar alterações para usar no seu perfil.';
      preferences.refresh();
    } catch {
      if (epoch === avatarReadEpoch) $('#profile-photo-status').textContent = 'Não foi possível abrir essa imagem. Tente outra foto (até 40 megapixels).';
    } finally {
      if (epoch === avatarReadEpoch) preferences.setProcessing(false);
    }
  };
  $('#profile-banner-choose').onclick = () => $('#profile-banner-file').click();
  $('#profile-banner-remove').onclick = () => {
    bannerReadEpoch++;
    setPendingBanner(null);
    $('#profile-banner').value = '';
    $('#profile-banner-status').textContent = 'Banner removido da prévia. Salve para aplicar ou descarte para manter o banner anterior.';
    preferences.refresh();
  };
  $('#profile-banner-file').onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const epoch = ++bannerReadEpoch;
    const status = $('#profile-banner-status');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { status.textContent = 'Escolha uma imagem PNG, JPG, WebP ou GIF.'; return; }
    if (file.size > (file.type === 'image/gif' ? BANNER_MAX_GIF : 8 * 1024 * 1024)) {
      status.textContent = file.type === 'image/gif' ? 'O GIF do banner deve ter até 5 MB.' : 'Escolha uma imagem de até 8 MB.';
      return;
    }
    preferences.setProcessing(true);
    status.textContent = 'Preparando seu banner…';
    try {
      const blob = await prepareBanner(file);
      if (epoch !== bannerReadEpoch || !preferences.isOpen()) return;
      $('#profile-banner').value = setPendingBanner(blob);
      status.textContent = 'Banner pronto na prévia. Clique em Salvar alterações para usar no seu perfil.';
      preferences.refresh();
    } catch (error) {
      if (epoch === bannerReadEpoch) status.textContent = error.message === 'gif-size' ? 'Esse GIF é grande demais. Use até 1500 × 1500 px.' : 'Não foi possível abrir essa imagem. Tente outra (até 40 megapixels).';
    } finally {
      if (epoch === bannerReadEpoch) preferences.setProcessing(false);
    }
  };
  $('#settings-server-link').onclick = () => { if (preferences.close()) openServerSettings(); };
  $('#btn-logout').onclick = async () => { if (!preferences.close()) return; const result = await call('logout', { token: localStorage.getItem('token') }); if (result) { localStorage.removeItem('token'); location.reload(); } };
  $('#notification-permission').onclick = async () => { if ('Notification' in window) { await Notification.requestPermission(); notificationHelp(); } };
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
  // No celular o dock fica por cima da gaveta dos canais: a lista reserva a altura dele.
  new ResizeObserver(([entry]) => document.documentElement.style.setProperty('--dock-h', Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight) + 'px')).observe($('#dock'));
  $('#btn-members').onclick = () => {
    if (matchMedia('(max-width:1100px)').matches) { const open = !$('#app').classList.contains('members-open'); closePanels(); $('#app').classList.toggle('members-open', open); $('#sidebar-backdrop').classList.toggle('hidden', !open); }
    else { state.showMembers = !state.showMembers; localStorage.setItem('showMembers', state.showMembers); render(); }
  };
  $('#btn-return-call').onclick = () => { if (state.home) leaveHome(); state.view = 'voice'; render(); };
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanels(); });
  // Existing rows contain a separate edit button. Keep their actions keyboard-accessible.
  function keyboardRows() {
    for (const node of document.querySelectorAll('.channel:not(.grouped-channel), .voice-user, .member')) {
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
