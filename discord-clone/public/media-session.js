window.MediaSession = function ({ state, socket, call, el, toast, voiceEntry, member, render, renderStage, sendVoiceState, preferCodec }) {
  const $ = (selector) => document.querySelector(selector);
  const presets = MediaPolicy.presets;
  const epochs = { screen: 0, camera: 0 };
  const watchingRequests = new Set();
  const samples = new Map();
  let statsBusy = false;
  let constraintsQueue = Promise.resolve();
  let lastNotice = '';
  let noticeAt = 0;
  const isWatching = (sid) => !!voiceEntry(sid)?.viewers?.includes(state.me?.sid);
  const viewers = () => voiceEntry(state.me?.sid)?.viewers || [];
  const active = (peer) => state.peers.get(peer.sid) === peer && peer.pc.signalingState !== 'closed';

  function mediaNotice(message) {
    state.mediaHealth = message;
    if (message !== lastNotice || Date.now() - noticeAt > 15000) { toast(message, 'info'); lastNotice = message; noticeAt = Date.now(); }
    renderDiagnostics();
  }
  async function setWatching(sid, watching) {
    if (watchingRequests.has(sid)) return;
    watchingRequests.add(sid);
    try {
      const result = await call('screen:watch', { target: sid, watching });
      if (!result) return;
      if (!watching && state.pinned === 'screen-' + sid) state.pinned = null;
      if (state.view === 'voice') renderStage();
    } finally { watchingRequests.delete(sid); }
  }

  function addVideoTracks(peer, kind) {
    const stream = state.local[kind];
    if (!stream || !active(peer)) return;
    for (const track of stream.getTracks()) {
      const sender = peer.pc.addTrack(track, stream);
      peer.senders[kind].push(sender);
      if (track.kind === 'video') preferCodec(peer.pc, sender, kind === 'screen' ? presets[state.sharePreset].codecs : ['video/VP8']);
    }
  }

  function syncScreenSubscriptions() {
    const wanted = new Set(viewers());
    for (const peer of state.peers.values()) {
      const stream = state.local.screen;
      const enabled = !!stream && wanted.has(peer.sid);
      const key = `${stream?.id || ''}:${enabled}`;
      if (peer.screenKey === key) continue;
      peer.screenKey = key;
      MediaPolicy.enqueue(peer, async () => {
        if (!active(peer)) return;
        // Read the latest desired state inside the queue: rapid stop/start cannot resurrect old tracks.
        const current = state.local.screen;
        const watching = !!current && viewers().includes(peer.sid);
        if (peer.screenStream !== current) {
          for (const sender of peer.senders.screen) peer.pc.removeTrack(sender);
          peer.senders.screen = [];
          peer.screenStream = current;
        }
        if (watching && !peer.senders.screen.length) addVideoTracks(peer, 'screen');
        for (const sender of peer.senders.screen) {
          const kind = sender.track?.kind || peer.pc.getTransceivers().find((t) => t.sender === sender)?.receiver.track.kind;
          const track = watching ? current.getTracks().find((t) => t.kind === kind) || null : null;
          if (sender.track !== track) await sender.replaceTrack(track);
        }
        if (!watching) peer.adaptation = {};
      }).then(tuneSenders).catch(() => {
        peer.screenKey = null;
        if (active(peer)) mediaNotice('Não foi possível atualizar um espectador. Tentaremos novamente.');
      });
    }
  }

  function videoBitrates() {
    const count = viewers().filter((sid) => state.peers.has(sid)).length;
    return MediaPolicy.budget(state.uploadMbps, count, state.peers.size, !!state.local.screen, !!state.local.camera, presets[state.sharePreset]);
  }

  async function setEncoding(sender, encoding, degradation) {
    let params = sender.getParameters();
    if (!params.encodings?.length) return;
    const same = Object.entries(encoding).every(([key, value]) => params.encodings[0][key] === value);
    if (same && (!degradation || params.degradationPreference === degradation)) return;
    Object.assign(params.encodings[0], encoding);
    if (degradation) params.degradationPreference = degradation;
    try { await sender.setParameters(params); }
    catch (error) {
      if (!degradation || !['NotSupportedError', 'TypeError', 'InvalidModificationError'].includes(error.name)) throw error;
      // Some browsers support bitrate/framerate but not degradationPreference. Retain core limits.
      params = sender.getParameters();
      if (!params.encodings?.length) return;
      Object.assign(params.encodings[0], encoding);
      await sender.setParameters(params);
    }
  }

  function tuneSenders() {
    for (const peer of state.peers.values()) {
      if (peer.tuning) continue;
      peer.tuning = true;
      MediaPolicy.enqueue(peer, async () => {
        if (!active(peer)) return;
        const rates = videoBitrates();
        const preset = presets[state.sharePreset];
        const mic = peer.pc.getSenders().find((sender) => sender.track?.kind === 'audio' && !peer.senders.screen.includes(sender));
        if (mic) await setEncoding(mic, { maxBitrate: 64000 });
        for (const kind of ['screen', 'camera']) {
          for (const sender of peer.senders[kind]) {
            if (sender.track?.kind !== 'video') continue;
            const level = kind === 'screen' && state.sharePreset === 'auto' ? peer.adaptation.level || 0 : 0;
            await setEncoding(sender, MediaPolicy.encoding(kind === 'screen' ? preset : { fps: 30 }, rates[kind], level), kind === 'screen' ? preset.degradation : 'balanced');
          }
        }
        peer.mediaError = '';
      }).catch((error) => {
        if (!active(peer)) return;
        peer.mediaError = 'Limites de qualidade não confirmados pelo navegador.';
        mediaNotice('Um ajuste de qualidade não pôde ser aplicado. Consulte Conexão e diagnóstico.');
        console.warn('Media parameters:', error.name);
      }).finally(() => { peer.tuning = false; });
    }
  }

  function applySharePreset() {
    constraintsQueue = constraintsQueue.catch(() => {}).then(async () => {
      const track = state.local.screen?.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') return;
      const preset = presets[state.sharePreset];
      track.contentHint = preset.hint;
      try { await track.applyConstraints({ width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps, max: preset.fps } }); }
      catch { if (track.readyState !== 'ended') mediaNotice('A captura manteve a qualidade disponível. O navegador não aceitou o perfil completo.'); }
      tuneSenders();
    });
    return constraintsQueue;
  }
  function setSharePreset(key) {
    if (!presets[key]) return;
    state.sharePreset = key;
    localStorage.setItem('sharePreset', key);
    for (const peer of state.peers.values()) peer.adaptation = {};
    applySharePreset();
    if (state.view === 'voice') renderStage();
  }

  function captureScreen() {
    const preset = presets[state.sharePreset];
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Seu navegador não oferece captura de tela.');
    return navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps, max: preset.fps } },
      audio: state.shareAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: state.shareAudio ? 'include' : 'exclude',
    });
  }
  function watchScreenTrack(track) {
    track.contentHint = presets[state.sharePreset].hint;
    track.onended = () => stopVideo('screen');
    track.onmute = () => { state.sharePaused = true; sendVoiceState(); mediaNotice('A captura foi pausada. Restaure a fonte ou escolha outra tela.'); };
    track.onunmute = () => { state.sharePaused = false; sendVoiceState(); };
  }
  function captureError(error) {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') { mediaNotice('Compartilhamento cancelado ou não autorizado. Você pode tentar novamente.'); return; }
    mediaNotice(error.name === 'NotReadableError' ? 'Não foi possível ler essa fonte. Tente outra janela ou tela.' : 'Não foi possível iniciar a captura. Verifique as permissões e a disponibilidade do dispositivo.');
  }

  async function startVideo(kind) {
    if (state.captureBusy || state.local[kind] || !state.voiceChannel) return;
    const channel = state.voiceChannel, epoch = epochs[kind];
    state.captureBusy = true;
    let stream;
    try {
      stream = kind === 'screen' ? await captureScreen() : await navigator.mediaDevices.getUserMedia({ video: { deviceId: state.cameraDeviceId ? { exact: state.cameraDeviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      if (state.voiceChannel !== channel || epoch !== epochs[kind]) { stream.getTracks().forEach((track) => track.stop()); return; }
      state.local[kind] = stream;
      const track = stream.getVideoTracks()[0];
      if (kind === 'screen') {
        state.sharePaused = false;
        state.mediaHealth = '';
        watchScreenTrack(track);
        syncScreenSubscriptions();
        Sounds.play('stream');
        if (state.shareAudio && !stream.getAudioTracks().length) mediaNotice('Sua tela está sendo compartilhada sem áudio. Essa fonte ou navegador não forneceu som.');
      } else {
        track.onended = () => stopVideo(kind);
        for (const peer of state.peers.values()) addVideoTracks(peer, kind);
      }
      sendVoiceState();
      state.view = 'voice';
      render();
      tuneSenders();
    } catch (error) { if (stream && state.local[kind] !== stream) stream.getTracks().forEach((track) => track.stop()); captureError(error); }
    finally { state.captureBusy = false; }
  }

  async function switchScreen() {
    const current = state.local.screen;
    if (!current || state.captureBusy) return;
    state.captureBusy = true;
    const epoch = epochs.screen;
    let next;
    const changed = [];
    try {
      next = await captureScreen();
      if (state.local.screen !== current || epoch !== epochs.screen) { next.getTracks().forEach((t) => t.stop()); return; }
      for (const peer of state.peers.values()) {
        await MediaPolicy.enqueue(peer, async () => {
          if (!active(peer) || !viewers().includes(peer.sid)) return;
          for (const kind of ['video', 'audio']) {
            const track = next.getTracks().find((t) => t.kind === kind) || null;
            const sender = peer.senders.screen.find((s) => (s.track?.kind || peer.pc.getTransceivers().find((t) => t.sender === s)?.receiver.track.kind) === kind);
            if (sender) { const old = sender.track; await sender.replaceTrack(track); changed.push({ peer, sender, old }); }
            else if (track) { const added = peer.pc.addTrack(track, current); peer.senders.screen.push(added); changed.push({ peer, sender: added, added: true }); }
          }
        });
      }
      if (state.local.screen !== current || epoch !== epochs.screen) throw new Error('Capture ended');
      current.getTracks().forEach((track) => { track.onended = track.onmute = track.onunmute = null; current.removeTrack(track); track.stop(); });
      next.getTracks().forEach((track) => current.addTrack(track));
      watchScreenTrack(current.getVideoTracks()[0]);
      state.sharePaused = false;
      await applySharePreset();
      sendVoiceState();
      renderStage();
      mediaNotice(state.shareAudio && !current.getAudioTracks().length ? 'Tela trocada. A nova fonte não forneceu áudio.' : 'Tela trocada. Sua chamada continua conectada.');
    } catch (error) {
      for (const { peer, sender, old, added } of changed.reverse()) {
        await MediaPolicy.enqueue(peer, async () => {
          if (!active(peer)) return;
          if (added) { peer.pc.removeTrack(sender); peer.senders.screen = peer.senders.screen.filter((s) => s !== sender); }
          else await sender.replaceTrack(state.local.screen === current && viewers().includes(peer.sid) ? old : null);
        }).catch(() => { peer.screenKey = null; });
      }
      next?.getTracks().forEach((track) => track.stop());
      if (state.local.screen === current) mediaNotice('Não foi possível trocar a fonte. A transmissão anterior foi mantida; tente novamente.');
      syncScreenSubscriptions();
    } finally { state.captureBusy = false; }
  }

  function stopVideo(kind, notify = true) {
    epochs[kind]++;
    const stream = state.local[kind];
    state.local[kind] = null;
    if (!stream) return;
    stream.getTracks().forEach((track) => { track.onended = track.onmute = track.onunmute = null; track.stop(); });
    if (kind === 'screen') { state.sharePaused = false; syncScreenSubscriptions(); }
    else for (const peer of state.peers.values()) {
      for (const sender of peer.senders.camera) { if (active(peer)) peer.pc.removeTrack(sender); }
      peer.senders.camera = [];
    }
    if (notify) sendVoiceState();
    tuneSenders();
    render();
  }

  function scheduleRecovery(peer) {
    if (peer.recoveryTimer || peer.recoveryAttempts >= 3) return;
    peer.recoveryTimer = setTimeout(() => {
      peer.recoveryTimer = null;
      if (!active(peer) || peer.pc.connectionState === 'connected') return;
      peer.recoveryAttempts++;
      peer.pc.restartIce();
      if (peer.recoveryAttempts < 3) scheduleRecovery(peer);
      else mediaNotice('Uma conexão não se recuperou. Use Reconectar em Conexão e diagnóstico.');
      renderDiagnostics();
    }, peer.pc.connectionState === 'failed' ? 2000 : 5000);
  }

  function renderDiagnostics() {
    const root = $('#diagnostics-peers');
    if (!root) return;
    $('#media-health').textContent = state.mediaHealth;
    $('#diagnostics-summary').textContent = !state.voiceChannel ? 'Entre em uma chamada para ver as conexões.' : `${state.peers.size} conexões · ${viewers().length} espectadores da sua tela`;
    const states = { connected: 'Conectado', connecting: 'Conectando', new: 'Preparando', disconnected: 'Reconectando', failed: 'Falha na conexão', closed: 'Encerrado' };
    root.replaceChildren(...[...state.peers].map(([sid, peer]) => {
      const stats = peer.stats || {};
      const line = el('div', { class: 'diagnostic-peer' }, el('strong', { textContent: `${member(voiceEntry(sid)?.accountId)?.name || 'Participante'} · ${states[peer.pc.connectionState] || 'Preparando'}` }),
        el('span', { textContent: [stats.rtt != null ? `${Math.round(stats.rtt * 1000)} ms` : 'Latência ainda indisponível', stats.path || '', stats.video || '', peer.mediaError || ''].filter(Boolean).join(' · ') }));
      if (['failed', 'disconnected'].includes(peer.pc.connectionState)) line.append(el('button', { type: 'button', textContent: 'Reconectar', onclick: () => { clearTimeout(peer.recoveryTimer); peer.recoveryTimer = null; peer.recoveryAttempts = 0; peer.pc.restartIce(); scheduleRecovery(peer); } }));
      return line;
    }));
  }

  async function updateStreamStats() {
    if (statsBusy) return;
    if (!state.voiceChannel) { samples.clear(); return; }
    statsBusy = true;
    const now = performance.now();
    try {
      await Promise.allSettled([...state.peers].map(async ([sid, peer]) => {
        const report = await peer.pc.getStats();
        if (!active(peer)) return;
        const stats = {};
        let outbound;
        report.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
            stats.rtt = r.currentRoundTripTime;
            stats.path = report.get(r.localCandidateId)?.candidateType === 'relay' || report.get(r.remoteCandidateId)?.candidateType === 'relay' ? 'Via retransmissão' : 'Conexão direta';
          }
          const video = r.kind === 'video' || r.mediaType === 'video';
          const sender = peer.senders.screen.find((s) => s.track?.kind === 'video');
          if (r.type === 'outbound-rtp' && video && sender) {
            const source = report.get(r.mediaSourceId);
            if (source?.trackIdentifier === sender.track.id) outbound = r;
          }
        });
        // Sender reports distinguish screen from camera even on browsers without mediaSourceId.
        const screenSender = peer.senders.screen.find((s) => s.track?.kind === 'video');
        if (!outbound && screenSender) (await screenSender.getStats()).forEach((r) => { if (r.type === 'outbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) outbound = r; });
        if (outbound && viewers().includes(sid)) {
          const r = outbound;
          const key = sid + ':' + r.id;
          const previous = samples.get(key);
          samples.set(key, { bytes: r.bytesSent, time: r.timestamp });
          const bitrate = previous && r.timestamp > previous.time && r.bytesSent >= previous.bytes ? (r.bytesSent - previous.bytes) * 8000 / (r.timestamp - previous.time) : null;
          stats.video = `${r.frameWidth || '?'}×${r.frameHeight || '?'} · ${Math.round(r.framesPerSecond || 0)} fps${bitrate == null ? '' : ' · ' + (bitrate / 1e6).toFixed(1) + ' Mbps'}`;
          const remote = report.get(r.remoteId);
          peer.adaptation = MediaPolicy.adapt(peer.adaptation, { active: !!r.framesSent, reason: r.qualityLimitationReason, rtt: remote?.roundTripTime ?? stats.rtt, loss: remote?.fractionLost || 0 }, now);
        }
        peer.stats = stats;
        const tile = document.querySelector(`[data-key="screen-${sid}"]`);
        if (tile && isWatching(sid)) {
          const track = peer.remote.screen?.getVideoTracks()[0];
          const receiver = track && peer.pc.getReceivers().find((r) => r.track === track);
          if (receiver) (await receiver.getStats()).forEach((r) => {
            if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) tile.querySelector('.stats').textContent = `${r.frameWidth || '?'}×${r.frameHeight || '?'} · ${Math.round(r.framesPerSecond || 0)} fps`;
          });
        }
      }));
      const own = document.querySelector(`[data-key="screen-${state.me?.sid}"]`);
      if (own) {
        const connections = viewers().map((sid) => state.peers.get(sid)).filter(Boolean);
        const reduced = state.sharePreset === 'auto' && connections.some((peer) => peer.adaptation.level > 0);
        own.querySelector('.stream-health').textContent = connections.length ? `${connections.length} assistindo${reduced ? ' · Qualidade adaptada' : ''}` : 'Pronto · Aguardando espectadores';
        own.querySelector('.stats').textContent = connections.length === 1 ? connections[0].stats?.video || 'Medindo qualidade…' : `${presets[state.sharePreset].label} · Detalhes por pessoa em Conexão`;
      }
      syncScreenSubscriptions();
      tuneSenders();
      if (!$('#settings').classList.contains('hidden')) renderDiagnostics();
      const validIds = new Set(state.peers.keys());
      for (const key of samples.keys()) if (!validIds.has(key.split(':')[0])) samples.delete(key);
    } finally { statsBusy = false; }
  }
  setInterval(updateStreamStats, 1500);
  return { isWatching, setWatching, addVideoTracks, syncScreenSubscriptions, videoBitrates, tuneSenders, applySharePreset, setSharePreset, captureScreen, watchScreenTrack, switchScreen, startVideo, stopVideo, scheduleRecovery, renderDiagnostics, updateStreamStats, mediaNotice };
};
