// Front-end do clone do Discord.
// Chat de texto via Socket.IO; voz e tela via WebRTC em malha (cada pessoa
// conecta diretamente com as outras da sala; o servidor só repassa a sinalização).
(() => {
  const $ = (sel) => document.querySelector(sel);
  const socket = io({ autoConnect: false });

  const state = {
    me: null,
    config: null,
    messages: {},
    users: [],
    textChannel: 'geral',
    view: 'chat', // 'chat' | 'voice'
    voiceChannel: null,
    muted: false,
    deafened: false,
    micStream: null,
    screenStream: null,
    peers: new Map(), // id -> { pc, polite, makingOffer, ignoreOffer, micStream, screenStream, audioEl, screenSenders }
    micDeviceId: localStorage.getItem('micDeviceId') || '',
    speakerDeviceId: localStorage.getItem('speakerDeviceId') || '',
    noiseSuppression: localStorage.getItem('noiseSuppression') !== 'false',
    speaking: new Set(),
  };

  let audioCtx = null;
  const analysers = new Map(); // id -> { analyser, data }

  // ---------------- utilidades ----------------
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function initials(name) {
    return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function avatar(user, cls = '') {
    const el = document.createElement('div');
    el.className = 'avatar ' + cls;
    el.style.background = user.color;
    el.textContent = initials(user.name);
    el.dataset.userId = user.id || '';
    return el;
  }

  function userById(id) {
    return state.users.find((u) => u.id === id);
  }

  function linkify(text) {
    const frag = document.createDocumentFragment();
    const re = /(https?:\/\/[^\s]+)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      frag.append(text.slice(last, m.index));
      const a = document.createElement('a');
      a.href = m[1];
      a.textContent = m[1];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      frag.append(a);
      last = m.index + m[1].length;
    }
    frag.append(text.slice(last));
    return frag;
  }

  // ---------------- login ----------------
  const savedName = localStorage.getItem('name');
  if (savedName) $('#login-name').value = savedName;
  $('#login-color').value = localStorage.getItem('color') || '#5865f2';

  fetch('/config').then((r) => r.json()).then((config) => {
    state.config = config;
    $('#login-password-label').classList.toggle('hidden', !config.passwordRequired);
    $('#login-password').required = config.passwordRequired;
  });

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#login-name').value.trim();
    const color = $('#login-color').value;
    const password = $('#login-password').value;
    if (!name || !state.config) return;
    localStorage.setItem('name', name);
    localStorage.setItem('color', color);
    socket.connect();
    socket.emit('login', { name, color, password }, (res) => {
      if (res.error) {
        socket.disconnect();
        return toast(res.error);
      }
      state.me = { id: res.id, name, color };
      state.messages = res.messages;
      state.config.iceServers = res.iceServers;
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      $('#me-name').textContent = name;
      $('#me-avatar').replaceWith(Object.assign(avatar(state.me), { id: 'me-avatar' }));
      render();
    });
  });

  // Se a conexão cair, o servidor esquece a pessoa: recarrega para entrar de novo.
  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') return;
    toast('Conexão perdida. Reconectando…');
    leaveVoice();
  });
  socket.io.on('reconnect', () => location.reload());

  // ---------------- renderização ----------------
  function render() {
    renderChannels();
    renderMembers();
    renderMain();
    renderControls();
  }

  function renderChannels() {
    const tl = $('#text-channels');
    tl.innerHTML = '';
    for (const c of state.config.textChannels) {
      const li = document.createElement('li');
      li.className = 'channel' + (state.view === 'chat' && state.textChannel === c ? ' active' : '');
      li.innerHTML = '<span class="icon">#</span>';
      li.append(c);
      li.onclick = () => { state.textChannel = c; state.view = 'chat'; render(); };
      tl.append(li);
    }

    const vl = $('#voice-channels');
    vl.innerHTML = '';
    for (const c of state.config.voiceChannels) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'channel' + (state.view === 'voice' && state.voiceChannel === c ? ' active' : '');
      row.innerHTML = '<span class="icon">🔊</span>';
      row.append(c);
      row.onclick = () => {
        if (state.voiceChannel === c) { state.view = 'voice'; render(); } else joinVoice(c);
      };
      li.append(row);

      const ul = document.createElement('ul');
      ul.className = 'voice-users';
      for (const u of state.users.filter((u) => u.voice === c)) {
        const item = document.createElement('li');
        item.className = 'voice-user';
        item.append(avatar(u, 'small' + (state.speaking.has(u.id) ? ' speaking' : '')), u.name);
        const flags = document.createElement('span');
        flags.className = 'flags';
        if (u.sharing) flags.innerHTML += '<span class="live">AO VIVO</span> ';
        if (u.muted) flags.append('🔇');
        if (u.deafened) flags.append('🙉');
        item.append(flags);
        ul.append(item);
      }
      li.append(ul);
      vl.append(li);
    }
  }

  function renderMembers() {
    $('#online-count').textContent = state.users.length;
    const ul = $('#member-list');
    ul.innerHTML = '';
    for (const u of state.users) {
      const li = document.createElement('li');
      li.className = 'member';
      const info = document.createElement('div');
      info.innerHTML = '<div></div><div class="sub"></div>';
      info.firstChild.textContent = u.name;
      info.lastChild.textContent = u.voice ? (u.sharing ? '🖥️ Transmitindo em ' : '🔊 ') + u.voice : '';
      li.append(avatar(u), info);
      ul.append(li);
    }
  }

  function renderMain() {
    const inVoiceView = state.view === 'voice' && state.voiceChannel;
    $('#chat-view').classList.toggle('hidden', inVoiceView);
    $('#voice-view').classList.toggle('hidden', !inVoiceView);
    if (inVoiceView) {
      $('#main-header').textContent = '🔊 ' + state.voiceChannel;
      renderStage();
    } else {
      $('#main-header').textContent = '# ' + state.textChannel;
      $('#chat-input').placeholder = 'Conversar em #' + state.textChannel;
      renderMessages();
    }
  }

  function renderMessages() {
    const box = $('#messages');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 50;
    box.innerHTML = '';
    let prev = null;
    for (const m of state.messages[state.textChannel] || []) {
      const continued = prev && prev.author === m.author && m.ts - prev.ts < 5 * 60 * 1000;
      const div = document.createElement('div');
      div.className = 'msg' + (continued ? ' continued' : '');
      const body = document.createElement('div');
      if (!continued) {
        div.append(avatar({ name: m.author, color: m.color }));
        const head = document.createElement('div');
        const author = document.createElement('span');
        author.className = 'msg-author';
        author.style.color = m.color;
        author.textContent = m.author;
        const time = document.createElement('span');
        time.className = 'msg-time';
        time.textContent = new Date(m.ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        head.append(author, time);
        body.append(head);
      }
      const text = document.createElement('div');
      text.className = 'msg-text';
      text.append(linkify(m.text));
      body.append(text);
      div.append(body);
      box.append(div);
      prev = m;
    }
    if (atBottom || !renderMessages.done) box.scrollTop = box.scrollHeight;
    renderMessages.done = true;
  }

  // Palco de voz: um bloco por participante + um bloco grande por tela compartilhada.
  function renderStage() {
    const stage = $('#stage');
    const participants = state.users.filter((u) => u.voice === state.voiceChannel);
    const wanted = new Set();

    for (const u of participants) {
      const screenStream = u.id === state.me.id ? state.screenStream : state.peers.get(u.id)?.screenStream;
      if (u.sharing && screenStream) {
        const key = 'screen-' + u.id;
        wanted.add(key);
        let tile = stage.querySelector(`[data-key="${key}"]`);
        if (!tile) {
          tile = document.createElement('div');
          tile.className = 'tile screen';
          tile.dataset.key = key;
          const video = document.createElement('video');
          video.autoplay = true;
          video.playsInline = true;
          video.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen());
          const label = document.createElement('div');
          label.className = 'label';
          tile.append(video, label);
          stage.prepend(tile);
        }
        const video = tile.querySelector('video');
        // O próprio áudio da tela não deve voltar para quem está compartilhando.
        video.muted = u.id === state.me.id || state.deafened;
        if (video.srcObject !== screenStream) {
          video.srcObject = screenStream;
          setSinkId(video);
        }
        tile.querySelector('.label').textContent = '🖥️ Tela de ' + u.name;
      }

      const key = 'user-' + u.id;
      wanted.add(key);
      let tile = stage.querySelector(`[data-key="${key}"]`);
      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.key = key;
        const label = document.createElement('div');
        label.className = 'label';
        tile.append(avatar(u), label);
        stage.append(tile);
      }
      tile.classList.toggle('speaking', state.speaking.has(u.id));
      tile.querySelector('.label').textContent = u.name + (u.muted ? ' 🔇' : '') + (u.deafened ? ' 🙉' : '');
    }

    for (const tile of [...stage.children]) {
      if (!wanted.has(tile.dataset.key)) tile.remove();
    }
  }

  function renderControls() {
    const inVoice = !!state.voiceChannel;
    $('#voice-panel').classList.toggle('hidden', !inVoice);
    $('#voice-room-name').textContent = state.voiceChannel || '';
    $('#btn-mute').classList.toggle('off', state.muted);
    $('#btn-mute').textContent = state.muted ? '🔇' : '🎤';
    $('#btn-deafen').classList.toggle('off', state.deafened);
    $('#btn-deafen').textContent = state.deafened ? '🙉' : '🎧';
    $('#btn-share').classList.toggle('on', !!state.screenStream);
    $('#btn-share').title = state.screenStream ? 'Parar de compartilhar' : 'Compartilhar tela';
  }

  // ---------------- chat ----------------
  socket.on('presence', (users) => {
    state.users = users;
    if (!state.me) return;
    // Remove conexões com quem saiu da nossa sala.
    for (const id of state.peers.keys()) {
      const u = userById(id);
      if (!u || u.voice !== state.voiceChannel) closePeer(id);
    }
    render();
  });

  socket.on('chat:message', ({ channel, msg }) => {
    (state.messages[channel] ||= []).push(msg);
    if (channel === state.textChannel && state.view === 'chat') renderMessages();
  });

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat:send', { channel: state.textChannel, text });
    input.value = '';
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
      const ctx = getAudioCtx();
      const dest = ctx.createMediaStreamDestination();
      return dest.stream;
    }
  }

  function getAudioCtx() {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function applyMute() {
    state.micStream?.getAudioTracks().forEach((t) => (t.enabled = !state.muted && !state.deafened));
  }

  function applyDeafen() {
    for (const p of state.peers.values()) {
      if (p.audioEl) p.audioEl.muted = state.deafened;
    }
    document.querySelectorAll('#stage video').forEach((v) => {
      if (!v.closest('[data-key="screen-' + state.me.id + '"]')) v.muted = state.deafened;
    });
  }

  function sendVoiceState() {
    socket.emit('voice:state', {
      muted: state.muted || state.deafened,
      deafened: state.deafened,
      sharing: !!state.screenStream,
    });
  }

  function setSinkId(el) {
    if (state.speakerDeviceId && el.setSinkId) el.setSinkId(state.speakerDeviceId).catch(() => {});
  }

  // Indicador de quem está falando (círculo verde).
  function watchSpeaking(id, stream) {
    if (!stream.getAudioTracks().length) return;
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analysers.set(id, { analyser, source, data: new Uint8Array(analyser.fftSize) });
  }

  function unwatchSpeaking(id) {
    const a = analysers.get(id);
    if (a) a.source.disconnect();
    analysers.delete(id);
    state.speaking.delete(id);
  }

  setInterval(() => {
    let changed = false;
    for (const [id, { analyser, data }] of analysers) {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const muted = id === state.me?.id ? state.muted || state.deafened : userById(id)?.muted;
      const speaking = rms > 4 && !muted;
      if (speaking !== state.speaking.has(id)) {
        speaking ? state.speaking.add(id) : state.speaking.delete(id);
        changed = true;
      }
    }
    if (changed) {
      document.querySelectorAll('.avatar[data-user-id]').forEach((el) => {
        el.classList.toggle('speaking', state.speaking.has(el.dataset.userId));
      });
      document.querySelectorAll('#stage .tile[data-key^="user-"]').forEach((el) => {
        el.classList.toggle('speaking', state.speaking.has(el.dataset.key.slice(5)));
      });
    }
  }, 100);

  // ---------------- voz (WebRTC) ----------------
  async function joinVoice(channel) {
    if (state.voiceChannel) leaveVoice();
    state.micStream = await getMicStream();
    applyMute();
    watchSpeaking(state.me.id, state.micStream);
    socket.emit('voice:join', { channel }, ({ peers }) => {
      state.voiceChannel = channel;
      state.view = 'voice';
      // Quem entra inicia a conexão com todos que já estavam na sala.
      for (const id of peers) getPeer(id);
      sendVoiceState();
      render();
    });
  }

  function leaveVoice() {
    if (!state.voiceChannel) return;
    stopScreenShare(false);
    for (const id of [...state.peers.keys()]) closePeer(id);
    state.micStream?.getTracks().forEach((t) => t.stop());
    state.micStream = null;
    unwatchSpeaking(state.me.id);
    state.voiceChannel = null;
    state.view = 'chat';
    if (socket.connected) socket.emit('voice:leave');
    render();
  }

  function getPeer(id) {
    let peer = state.peers.get(id);
    if (peer) return peer;

    const pc = new RTCPeerConnection({ iceServers: state.config.iceServers });
    peer = {
      pc,
      polite: state.me.id < id, // "perfect negotiation": o educado cede em caso de colisão
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      micStream: null,
      screenStream: null,
      audioEl: null,
      remoteScreenId: null,
      screenSenders: [],
    };
    state.peers.set(id, peer);

    for (const track of state.micStream.getTracks()) pc.addTrack(track, state.micStream);
    if (state.screenStream) addScreenTracks(peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('signal', { to: id, data: { description: pc.localDescription, screen: state.screenStream?.id } });
      } catch (err) {
        console.error(err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('signal', { to: id, data: { candidate } });
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
      peer.audioEl.muted = state.deafened;
      peer.audioEl.play().catch(() => {});
      unwatchSpeaking(id);
      watchSpeaking(id, stream);
    };

    return peer;
  }

  function closePeer(id) {
    const peer = state.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    if (peer.audioEl) peer.audioEl.srcObject = null;
    unwatchSpeaking(id);
    state.peers.delete(id);
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
    applyMute();
    applyDeafen();
    sendVoiceState();
    renderControls();
  };

  $('#btn-deafen').onclick = () => {
    state.deafened = !state.deafened;
    applyMute();
    applyDeafen();
    sendVoiceState();
    renderControls();
  };

  $('#btn-share').onclick = () => (state.screenStream ? stopScreenShare() : startScreenShare());
  $('#btn-leave').onclick = () => leaveVoice();

  // Atalho estilo Discord: Ctrl+Shift+M muta, Ctrl+Shift+D ensurdece.
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey) return;
    if (e.key.toLowerCase() === 'm') { e.preventDefault(); $('#btn-mute').click(); }
    if (e.key.toLowerCase() === 'd') { e.preventDefault(); $('#btn-deafen').click(); }
  });

  // ---------------- configurações de dispositivos ----------------
  $('#btn-settings').onclick = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const fill = (select, kind, current) => {
      select.innerHTML = '<option value="">Padrão</option>';
      for (const d of devices.filter((d) => d.kind === kind)) {
        const opt = new Option(d.label || kind, d.deviceId);
        opt.selected = d.deviceId === current;
        select.append(opt);
      }
    };
    fill($('#mic-select'), 'audioinput', state.micDeviceId);
    fill($('#speaker-select'), 'audiooutput', state.speakerDeviceId);
    $('#speaker-select').disabled = !('setSinkId' in HTMLMediaElement.prototype);
    $('#noise-toggle').checked = state.noiseSuppression;
    $('#settings').classList.remove('hidden');
  };

  $('#settings-close').onclick = async () => {
    $('#settings').classList.add('hidden');
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
      applyMute();
      unwatchSpeaking(state.me.id);
      watchSpeaking(state.me.id, state.micStream);
    }
  };

  window.addEventListener('beforeunload', () => leaveVoice());
})();
