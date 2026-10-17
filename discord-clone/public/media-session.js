window.MediaSession = function ({ state, socket, call, el, toast, voiceEntry, member, render, renderStage, sendVoiceState, preferCodec, ownAudio, sfu }) {
  const $ = (selector) => document.querySelector(selector);
  const presets = MediaPolicy.presets;
  const epochs = { screen: 0, camera: 0 };
  const watchingRequests = new Set();
  const samples = new Map();
  const demands = new Map();
  const watchQuality = new Map();
  const sentQuality = new Map();
  const qualityRequests = new Set();
  const observed = new Set();
  let qualityTimer;
  let statsBusy = false;
  let constraintsQueue = Promise.resolve();
  let lastNotice = '';
  let noticeAt = 0;
  const isWatching = (sid) => !!voiceEntry(sid)?.viewers?.includes(state.me?.sid);
  const viewers = () => voiceEntry(state.me?.sid)?.viewers || [];
  sfu?.configureSubscriptions(() => sfu.subscriptions(isWatching, requestedQuality));
  const active = (peer) => state.peers.get(peer.sid) === peer && peer.pc.signalingState !== 'closed';

  const getWatchQuality = (sid) => watchQuality.get(sid) || 'auto';
  function requestedQuality(sid) {
    const video = document.querySelector(`[data-key="screen-${sid}"] video`);
    const rect = video?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const pip = !!video && document.pictureInPictureElement === video;
    const size = pip && state.pipSize ? state.pipSize : rect;
    return MediaPolicy.viewerDemand({ mode: getWatchQuality(sid), width: size.width, height: size.height,
      aspect: video?.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9,
      pixelRatio: window.devicePixelRatio || 1, background: !pip && (document.hidden || state.view !== 'voice'), codecs: state.decodeCodecs || [] });
  }
  function setWatchQuality(sid, mode) {
    if (!MediaPolicy.watchModes[mode]) return;
    watchQuality.set(sid, mode);
    syncViewerQuality();
    if (state.view === 'voice') renderStage();
  }
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => syncViewerQuality()) : null;
  function requestQuality(target, quality) {
    if (socket.connected === false) return Promise.resolve(null);
    if (!socket.timeout) return call('screen:quality', { target, quality });
    // Automatic updates can race with stop/leave or a reconnect. Retry quietly
    // on the next sample rather than interrupting the viewer with toasts.
    return new Promise((resolve) => socket.timeout(5000).emit('screen:quality', { target, quality }, (error, result) => resolve(!error && !result?.error ? result : null)));
  }
  function syncViewerQuality() {
    if (qualityTimer) return;
    qualityTimer = setTimeout(async () => {
      qualityTimer = null;
      if (sfu?.active()) sfu.subscriptions(isWatching, requestedQuality);
      for (const video of observed) if (!video.isConnected) { resizeObserver?.unobserve(video); observed.delete(video); }
      for (const [sid] of state.peers) {
        if (!isWatching(sid)) { sentQuality.delete(sid); continue; }
        const video = document.querySelector(`[data-key="screen-${sid}"] video`);
        if (video && !observed.has(video)) {
          observed.add(video); resizeObserver?.observe(video);
          video.addEventListener?.('enterpictureinpicture', (event) => {
            state.pipSize = { width: event.pictureInPictureWindow.width, height: event.pictureInPictureWindow.height };
            event.pictureInPictureWindow.addEventListener('resize', () => { state.pipSize = { width: event.pictureInPictureWindow.width, height: event.pictureInPictureWindow.height }; syncViewerQuality(); });
            syncViewerQuality();
          });
          video.addEventListener?.('leavepictureinpicture', () => { state.pipSize = null; syncViewerQuality(); });
        }
        const quality = requestedQuality(sid), signature = JSON.stringify(quality);
        if (sentQuality.get(sid) === signature || qualityRequests.has(sid)) continue;
        qualityRequests.add(sid);
        try {
          if (await requestQuality(sid, quality)) sentQuality.set(sid, signature);
        } finally {
          qualityRequests.delete(sid);
          if (isWatching(sid) && JSON.stringify(requestedQuality(sid)) !== signature) syncViewerQuality();
        }
      }
      for (const map of [sentQuality, watchQuality]) for (const sid of map.keys()) if (!state.peers.has(sid)) map.delete(sid);
    }, 250);
  }
  document.addEventListener?.('visibilitychange', syncViewerQuality);
  window.addEventListener?.('resize', syncViewerQuality);
  socket.on?.('screen:quality', ({ viewer, demand }) => {
    if (demand) demands.set(viewer, demand); else demands.delete(viewer);
    tuneSenders();
  });

  function mediaNotice(message) {
    state.mediaHealth = message;
    if (message !== lastNotice || Date.now() - noticeAt > 15000) { toast(message, 'info'); lastNotice = message; noticeAt = Date.now(); }
    renderDiagnostics();
  }
  async function setWatching(sid, watching) {
    if (watchingRequests.has(sid)) return;
    watchingRequests.add(sid);
    try {
      const quality = requestedQuality(sid);
      const result = await call('screen:watch', { target: sid, watching, ...(watching ? { quality } : {}) });
      if (!result) return;
      if (sfu?.active()) sfu.subscriptions((target) => target === sid ? watching : isWatching(target), requestedQuality);
      if (watching) sentQuality.set(sid, JSON.stringify(quality)); else sentQuality.delete(sid);
      if (!watching && state.pinned === 'screen-' + sid) state.pinned = null;
      if (state.view === 'voice') renderStage();
    } finally { watchingRequests.delete(sid); }
  }

  const screenCodecs = (sid) => MediaPolicy.screenCodecs(presets[state.sharePreset], demands.get(sid)?.codecs, state.screenCodecFallback);
  // O pedido do espectador, a 30 fps quando a escada do Movimento precisou liberar processador para o 1080p.
  const demandOf = (sid) => state.peers.get(sid)?.adaptation?.half ? { ...demands.get(sid), fps: 30 } : demands.get(sid);
  // Jogo ou vídeo detectado num perfil de texto: cada espectador volta a receber o tamanho do seu bloco.
  const activePreset = () => state.screenMotion ? { ...presets[state.sharePreset], motion: true } : presets[state.sharePreset];
  // Tipo do que um sender leva (audio/video), mesmo parado em replaceTrack(null).
  const senderKind = (peer, sender) => sender.track?.kind || peer.pc.getTransceivers().find((t) => t.sender === sender)?.receiver.track.kind;
  // Adiciona as trilhas que ainda não têm sender nesta conexão: uma tela que ganhou áudio numa troca
  // de fonte chega com o som para quem volta a assistir.
  function addVideoTracks(peer, kind) {
    if (sfu?.active()) return;
    const stream = state.local[kind];
    if (!stream || !active(peer)) return;
    const sending = new Set(peer.senders[kind].map((sender) => senderKind(peer, sender)));
    for (const track of stream.getTracks()) {
      if (sending.has(track.kind)) continue;
      const sender = peer.pc.addTrack(track, stream);
      peer.senders[kind].push(sender);
      if (track.kind === 'video') preferCodec(peer.pc, sender, kind === 'screen' ? screenCodecs(peer.sid) : ['video/VP8']);
    }
  }

  // Troca o codec de envio sem renegociar (encodings[0].codec), entre os que a conexão já negociou:
  // o espectador informou outro codec preferido, o processador não deu conta do AV1/VP9 ou o H.264 pode
  // ir para um perfil que a placa de vídeo codifica (MediaPolicy.pickCodec). Fora do H.264, o perfil
  // do codec não muda (o VP9 de 10 bits, por exemplo, nunca entra no lugar do perfil 0).
  async function setCodec(sender, wanted) {
    const params = sender.getParameters();
    if (!params.codecs?.length || !params.encodings?.length) return;
    const codec = MediaPolicy.pickCodec(params.codecs, wanted, sender.softwareH264);
    const current = params.encodings[0].codec || params.codecs[0];
    const mime = codec?.mimeType.toLowerCase();
    if (!codec || (current?.mimeType.toLowerCase() === mime && (mime !== 'video/h264' || current.sdpFmtpLine === codec.sdpFmtpLine))) return;
    params.encodings[0].codec = codec;
    try { await sender.setParameters(params); }
    catch (error) { if (!['NotSupportedError', 'TypeError', 'InvalidModificationError'].includes(error.name)) throw error; }
  }
  function heavyContent() {
    if (state.screenMotion) return;
    state.screenMotion = true;
    tuneSenders();
  }
  function lighterCodec(codec) {
    const fallback = MediaPolicy.cpuFallback(codec);
    if (!fallback || state.screenCodecFallback) return;
    state.screenCodecFallback = fallback;
    for (const peer of state.peers.values()) { peer.cpu = {}; peer.adaptation = {}; peer.encodeSample = null; }
    state.mediaHealth = 'Seu processador ficou no limite com o codec mais nítido. A transmissão passou para um mais leve.';
    renderDiagnostics();
    tuneSenders();
  }

  function syncScreenSubscriptions() {
    if (sfu?.active()) {
      sfu.subscriptions(isWatching, requestedQuality);
      const key = `${state.local.screen?.id}:${viewers().length > 0}:${state.sharePreset}`;
      if (state.sfuCaptureKey !== key) { state.sfuCaptureKey = key; applySharePreset(); }
      syncViewerQuality();
      return;
    }
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
        if (watching) addVideoTracks(peer, 'screen');
        for (const sender of peer.senders.screen) {
          const kind = senderKind(peer, sender);
          const track = watching ? current.getTracks().find((t) => t.kind === kind) || null : null;
          if (sender.track !== track) await sender.replaceTrack(track);
        }
        // Quem para de assistir zera as medições: as contagens de 5 s (processador, conteúdo pesado)
        // recomeçam quando a pessoa volta, em vez de somar o tempo em que ela não estava assistindo.
        if (!watching) { peer.adaptation = {}; peer.estimate = null; peer.cpu = {}; peer.heavy = {}; peer.encodeSample = null; peer.softwareSamples = 0; }
      }).then(tuneSenders).catch(() => {
        peer.screenKey = null;
        if (active(peer)) mediaNotice('Não foi possível atualizar um espectador. Tentaremos novamente.');
      });
    }
    for (const sid of demands.keys()) if (!voiceEntry(sid) || voiceEntry(sid).channel !== state.voiceChannel) demands.delete(sid);
    syncViewerQuality();
  }

  function videoBitrates() {
    return MediaPolicy.allocate(state.uploadMbps, [...state.peers].map(([sid, peer]) => ({ sid, watching: viewers().includes(sid),
      demand: demandOf(sid), level: peer.adaptation.level || 0 })),
    { screen: !!state.local.screen, screenAudio: !!state.local.screen?.getAudioTracks().length, camera: !!state.local.camera, preset: activePreset() });
  }
  // Resposta do espectador com a taxa inicial da tela em H.264 (MediaPolicy.startBitrate): 90% do que
  // ele vai receber. O valor fica fixo por trilha, porque trocá-lo numa renegociação seguinte recriaria
  // o codificador. Com a câmera ligada a estimativa já está aquecida e nada muda.
  function remoteDescription(peer, description) {
    if (description?.type !== 'answer' || sfu?.active() || !state.local.screen) return description;
    const rates = {};
    for (const transceiver of peer.pc.getTransceivers()) {
      const { sender, mid } = transceiver;
      if (mid == null || sender.track?.kind !== 'video' || !peer.senders.screen.includes(sender)) continue;
      if (sender.startKbps === undefined) sender.startKbps = state.local.camera ? 0 : Math.max(300, Math.round((videoBitrates().get(peer.sid)?.screen || 0) * .9 / 1000));
      if (sender.startKbps) rates[mid] = sender.startKbps;
    }
    return Object.keys(rates).length ? { type: 'answer', sdp: MediaPolicy.startBitrate(description.sdp, rates) } : description;
  }

  async function setEncoding(sender, encoding, degradation) {
    encoding = { ...encoding };
    if (sender.scalingUnsupported) delete encoding.scaleResolutionDownBy;
    // "maintain-framerate-and-resolution" é recente; quem não conhece recebe o comportamento anterior.
    if (degradation === 'maintain-framerate-and-resolution' && sender.keepBothUnsupported) degradation = 'maintain-framerate';
    let params = sender.getParameters();
    if (!params.encodings?.length) return;
    const same = Object.entries(encoding).every(([key, value]) => params.encodings[0][key] === value);
    if (same && (!degradation || params.degradationPreference === degradation)) return;
    Object.assign(params.encodings[0], encoding);
    if (degradation) params.degradationPreference = degradation;
    try {
      await sender.setParameters(params);
      const appliedScale = sender.getParameters().encodings?.[0]?.scaleResolutionDownBy;
      if (encoding.scaleResolutionDownBy > 1 && Number.isFinite(appliedScale) && Math.abs(appliedScale - encoding.scaleResolutionDownBy) > .02) sender.scalingUnsupported = true;
    }
    catch (error) {
      if (!['NotSupportedError', 'TypeError', 'InvalidModificationError'].includes(error.name)) throw error;
      if (degradation === 'maintain-framerate-and-resolution') { sender.keepBothUnsupported = true; return setEncoding(sender, encoding, 'maintain-framerate'); }
      // Optional controls differ across browsers. Preserve bitrate/active limits and
      // never constrain a shared track to one viewer's smaller resolution.
      params = sender.getParameters();
      if (!params.encodings?.length) return;
      delete encoding.priority;
      Object.assign(params.encodings[0], encoding);
      delete params.degradationPreference;
      try { await sender.setParameters(params); }
      catch (fallbackError) {
        if (!('scaleResolutionDownBy' in encoding) || !['NotSupportedError', 'TypeError', 'InvalidModificationError'].includes(fallbackError.name)) throw fallbackError;
        params = sender.getParameters();
        delete encoding.scaleResolutionDownBy;
        Object.assign(params.encodings[0], encoding);
        await sender.setParameters(params);
        sender.scalingUnsupported = true;
      }
    }
  }

  function tuneSenders(onlyPeer) {
    if (sfu?.active()) { sfu.tune(); return; }
    for (const peer of onlyPeer?.pc ? [onlyPeer] : state.peers.values()) {
      peer.tuneAgain = true;
      if (peer.tuning) continue;
      peer.tuning = true;
      MediaPolicy.enqueue(peer, async () => {
        if (!active(peer)) return;
        do {
          peer.tuneAgain = false;
          const rates = videoBitrates().get(peer.sid);
          const preset = activePreset();
          const mic = peer.pc.getSenders().find((sender) => sender.track?.kind === 'audio' && !peer.senders.screen.includes(sender));
          if (mic) await setEncoding(mic, { maxBitrate: 64000, priority: 'high' });
          for (const kind of ['screen', 'camera']) {
            for (const sender of peer.senders[kind]) {
              if (sender.track?.kind === 'audio' && kind === 'screen') { await setEncoding(sender, { maxBitrate: 96000, priority: 'high' }); continue; }
              if (sender.track?.kind !== 'video') continue;
              if (kind === 'screen') await setCodec(sender, screenCodecs(peer.sid));
              const encoding = kind === 'screen' ? MediaPolicy.screenEncoding(preset, rates.screen, demandOf(peer.sid), sender.track.getSettings?.(), peer.adaptation.level || 0)
                : MediaPolicy.encoding({ fps: 30 }, rates.camera);
              await setEncoding(sender, encoding, kind === 'screen' ? preset.degradation : 'balanced');
            }
          }
          peer.mediaError = peer.senders.screen.some((sender) => sender.scalingUnsupported) ? 'Este navegador ajusta banda e FPS, mas não a resolução por espectador.' : '';
        } while (active(peer) && peer.tuneAgain);
      }).catch((error) => {
        if (!active(peer)) return;
        peer.mediaError = 'Limites de qualidade não confirmados pelo navegador.';
        mediaNotice('Um ajuste de qualidade não pôde ser aplicado. Consulte Conexão e diagnóstico.');
        console.warn('Media parameters:', error.name);
      }).finally(() => { peer.tuning = false; if (peer.tuneAgain && active(peer)) tuneSenders(peer); });
    }
  }

  function captureAspect(track, preset) {
    const settings = track.getSettings?.() || {};
    const aspect = settings.width && settings.height ? settings.width / settings.height : preset.width / preset.height;
    // A troca de fonte pelo navegador pode mudar a proporção sem trocar o ID da trilha.
    if (!track.captureAspect || Math.abs(aspect / track.captureAspect - 1) > .02) track.captureAspect = aspect;
    return track.captureAspect;
  }

  // A captura fica no perfil escolhido, igual para todos. Cada espectador recebe sua resolução pelo
  // próprio codificador (scaleResolutionDownBy), sem recapturar a tela quando alguém redimensiona.
  function applySharePreset() {
    constraintsQueue = constraintsQueue.catch(() => {}).then(async () => {
      const track = state.local.screen?.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') return;
      const preset = presets[state.sharePreset];
      const aspect = captureAspect(track, preset);
      const height = Math.max(2, Math.floor(Math.min(preset.height, preset.width / aspect)));
      const width = Math.max(2, Math.round(height * aspect));
      track.contentHint = preset.hint;
      const fps = MediaPolicy.captureFps(sfu?.active() && !viewers().length ? 5 : preset.fps);
      try { await track.applyConstraints({ width: { ideal: width, max: width }, height: { ideal: height, max: height }, frameRate: { ideal: fps, max: fps } }); }
      catch { if (track.readyState !== 'ended') mediaNotice('A captura manteve a qualidade disponível. O navegador não aceitou o perfil completo.'); }
      tuneSenders();
    });
    return constraintsQueue;
  }
  function setSharePreset(key) {
    if (!presets[key]) return;
    state.sharePreset = key;
    state.screenCodecFallback = state.screenMotion = null;
    localStorage.setItem('sharePreset', key);
    for (const peer of state.peers.values()) peer.adaptation = {};
    applySharePreset();
    if (state.view === 'voice') renderStage();
  }

  function releaseCapture(stream) {
    stream?.desktopAudioCleanup?.();
    stream?.getTracks().forEach(track => { track.onended = track.onmute = track.onunmute = null; track.stop(); });
  }

  async function captureScreen() {
    const preset = presets[state.sharePreset];
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Seu navegador não oferece captura de tela.');
    const fps = MediaPolicy.captureFps(preset.fps);
    const capture = () => navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: fps, max: fps } },
      // restrictOwnAudio: o som do computador vai sem as vozes da própria chamada (evita eco para quem assiste).
      audio: state.shareAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true } : false,
      selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: state.shareAudio ? 'include' : 'exclude',
    });
    const stream = await (window.DesktopApp?.captureScreen ? window.DesktopApp.captureScreen(capture) : capture());
    // A qualidade pode ter sido trocada na janela de escolha do app, depois de pedir a captura.
    try {
      const chosen = presets[state.sharePreset];
      if (chosen !== preset) {
        const chosenFps = MediaPolicy.captureFps(chosen.fps);
        try { await stream.getVideoTracks()[0]?.applyConstraints({ width: { ideal: chosen.width }, height: { ideal: chosen.height }, frameRate: { ideal: chosenFps, max: chosenFps } }); }
        catch { /* o perfil completo é aplicado de novo quando a transmissão começa */ }
      }
      stream.audioMode = await audioMode(stream);
      return stream;
    } catch (error) { releaseCapture(stream); throw error; }
  }
  // O som do computador leva junto o que o próprio Resenhex toca (as vozes da chamada), a menos que
  // o navegador (restrictOwnAudio, no Windows 11) ou o app de Windows o deixem de fora ('native');
  // senão o filtro do Resenhex o tira ('filter'), ou, sem filtro, ele vai junto ('mixed'). O som
  // de uma aba do navegador é só daquela aba ('tab'), e o app de Windows pode levar o som de um
  // app só ('app'). Sem som: null.
  async function audioMode(stream) {
    const audio = stream.getAudioTracks?.()[0];
    if (!audio) return null;
    if (['app', 'native'].includes(stream.desktopAudioMode)) return stream.desktopAudioMode;
    const settings = audio.getSettings?.() || {};
    if (stream.getVideoTracks()[0]?.getSettings?.().displaySurface === 'browser') return 'tab';
    if (String(settings.deviceId || '').startsWith('applicationLoopback:')) return 'app';
    if (settings.restrictOwnAudio === true || settings.deviceId === 'loopbackWithoutChrome') return 'native';
    return (await ownAudio?.clean(stream)) ? 'filter' : 'mixed';
  }
  // Quem transmite fica sabendo quando as vozes da chamada podem ir junto, e como evitar.
  let filterNoticeShown = false;
  function setAudioMode(mode) {
    state.shareAudioMode = mode;
    if (mode === 'mixed') mediaNotice('As vozes da chamada vão junto com o som do computador. Para transmitir sem eco, use o app do Resenhex ou compartilhe uma aba.');
    if (mode !== 'filter' || filterNoticeShown) return;
    filterNoticeShown = true;
    mediaNotice(window.resenhexDesktop
      ? 'Neste Windows o som do computador vem com as vozes da chamada. O Resenhex as tira, mas pode sobrar um pouco. No Windows 10 22H2 ou 11 elas ficam de fora.'
      : 'Este navegador manda o som do computador com as vozes da chamada. O Resenhex as tira, mas pode sobrar um pouco. No app do Resenhex elas ficam de fora.');
  }
  function watchScreenTrack(track) {
    track.contentHint = presets[state.sharePreset].hint;
    track.onended = () => {
      // App do Windows seguindo a partida: a janela do jogo fechou e o app volta sozinho para o
      // launcher. Enquanto isso, quem assiste vê a transmissão pausada.
      const hold = window.DesktopApp?.holdScreen?.();
      if (!hold) { stopVideo('screen'); return; }
      const stream = state.local.screen;
      hold.then((held) => {
        if (state.local.screen !== stream || stream?.getVideoTracks()[0] !== track) return;
        if (!held) { stopVideo('screen'); return; }
        state.sharePaused = true;
        sendVoiceState();
      });
    };
    track.onmute = () => { state.sharePaused = true; sendVoiceState(); mediaNotice('A captura foi pausada. Restaure a fonte ou escolha outra tela.'); };
    track.onunmute = () => { state.sharePaused = false; sendVoiceState(); };
  }
  function captureError(error) {
    if (error.name === 'ShareCancelledError') return;
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') { mediaNotice('Compartilhamento cancelado ou não autorizado. Você pode tentar novamente.'); return; }
    mediaNotice(error.name === 'NotReadableError' ? 'Não foi possível ler essa fonte. Tente outra janela ou tela.' : 'Não foi possível iniciar a captura. Verifique as permissões e a disponibilidade do dispositivo.');
  }

  // "captured" é uma câmera já aberta pela prévia: vira a câmera da chamada sem pedir de novo.
  async function startVideo(kind, captured = null) {
    if (state.captureBusy || state.local[kind] || !state.voiceChannel) { releaseCapture(captured); return; }
    const channel = state.voiceChannel, epoch = epochs[kind];
    state.captureBusy = true;
    let stream;
    try {
      stream = kind === 'screen' ? await captureScreen() : captured || await navigator.mediaDevices.getUserMedia({ video: { deviceId: state.cameraDeviceId ? { exact: state.cameraDeviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      if (state.voiceChannel !== channel || epoch !== epochs[kind]) { releaseCapture(stream); return; }
      state.local[kind] = stream;
      if (sfu?.active()) await sfu.publish(kind, stream);
      if (state.voiceChannel !== channel || epoch !== epochs[kind]) { releaseCapture(stream); return; }
      const track = stream.getVideoTracks()[0];
      if (kind === 'screen') {
        state.sharePaused = false;
        state.mediaHealth = '';
        watchScreenTrack(track);
        syncScreenSubscriptions();
        Sounds.play('stream');
        if (state.shareAudio && !stream.getAudioTracks().length) mediaNotice('Sua tela está sendo compartilhada sem áudio. Essa fonte ou navegador não forneceu som.');
        setAudioMode(stream.audioMode);
      } else {
        track.onended = () => stopVideo(kind);
        for (const peer of state.peers.values()) addVideoTracks(peer, kind);
      }
      sendVoiceState();
      state.view = 'voice';
      render();
      tuneSenders();
    } catch (error) { if (stream) { if (state.local[kind] === stream) stopVideo(kind); else releaseCapture(stream); } captureError(error); }
    finally {
      state.captureBusy = false;
      if (kind === 'screen') ownAudio?.sync(state.local.screen);
    }
  }

  // follow: troca pedida pelo app que segue a partida ({ to: 'game' | 'home', name }), sem o seletor.
  async function switchScreen(follow = null) {
    const current = state.local.screen;
    if (!current || state.captureBusy) return;
    state.captureBusy = true;
    const epoch = epochs.screen;
    let next;
    const changed = [];
    try {
      next = await captureScreen();
      if (state.local.screen !== current || epoch !== epochs.screen) { releaseCapture(next); return; }
      if (sfu?.active()) await sfu.publish('screen', next);
      for (const peer of state.peers.values()) {
        if (sfu?.active()) continue;
        await MediaPolicy.enqueue(peer, async () => {
          if (!active(peer) || !viewers().includes(peer.sid)) return;
          for (const kind of ['video', 'audio']) {
            const track = next.getTracks().find((t) => t.kind === kind) || null;
            const sender = peer.senders.screen.find((s) => senderKind(peer, s) === kind);
            if (sender) { const old = sender.track; await sender.replaceTrack(track); changed.push({ peer, sender, old }); }
            else if (track) { const added = peer.pc.addTrack(track, current); peer.senders.screen.push(added); changed.push({ peer, sender: added, added: true }); }
          }
        });
      }
      if (state.local.screen !== current || epoch !== epochs.screen) throw new Error('Capture ended');
      current.desktopAudioCleanup?.();
      current.getTracks().forEach((track) => { track.onended = track.onmute = track.onunmute = null; current.removeTrack(track); track.stop(); });
      next.getTracks().forEach((track) => current.addTrack(track));
      // Quem começou a assistir enquanto a troca percorria as conexões recebeu as trilhas antigas,
      // que acabaram de parar: confere todo mundo de novo com as novas.
      for (const peer of state.peers.values()) peer.screenKey = null;
      syncScreenSubscriptions();
      current.desktopAudioCleanup = next.desktopAudioCleanup;
      current.desktopAudioMode = next.desktopAudioMode;
      watchScreenTrack(current.getVideoTracks()[0]);
      state.sharePaused = false;
      await applySharePreset();
      sendVoiceState();
      renderStage();
      mediaNotice(follow ? (follow.to === 'game' ? `A transmissão foi para a partida: ${follow.name}.` : `A partida acabou. A transmissão voltou para ${follow.name}.`)
        : state.shareAudio && !current.getAudioTracks().length ? 'Tela trocada. A nova fonte não forneceu áudio.' : 'Tela trocada. Sua chamada continua conectada.');
      setAudioMode(next.audioMode);
    } catch (error) {
      if (error.name === 'ShareCancelledError') return;
      // A janela anterior já fechou (fim da partida): sem a nova, não há o que manter.
      if (follow && state.local.screen === current && current.getVideoTracks()[0]?.readyState === 'ended') { releaseCapture(next); stopVideo('screen'); return; }
      if (sfu?.active() && state.local.screen === current) await sfu.publish('screen', current).catch(() => {});
      for (const { peer, sender, old, added } of changed.reverse()) {
        await MediaPolicy.enqueue(peer, async () => {
          if (!active(peer)) return;
          if (added) { peer.pc.removeTrack(sender); peer.senders.screen = peer.senders.screen.filter((s) => s !== sender); }
          else await sender.replaceTrack(state.local.screen === current && viewers().includes(peer.sid) ? old : null);
        }).catch(() => { peer.screenKey = null; });
      }
      releaseCapture(next);
      if (state.local.screen === current) mediaNotice('Não foi possível trocar a fonte. A transmissão anterior foi mantida; tente novamente.');
      syncScreenSubscriptions();
    } finally {
      state.captureBusy = false;
      ownAudio?.sync(state.local.screen);
    }
  }

  function stopVideo(kind, notify = true) {
    epochs[kind]++;
    const stream = state.local[kind];
    state.local[kind] = null;
    if (sfu?.active()) sfu.stop(kind).catch(() => {});
    if (!stream) return;
    releaseCapture(stream);
    if (kind === 'screen') { window.DesktopApp?.shareStopped?.(); state.sharePaused = false; state.shareAudioMode = null; state.screenCodecFallback = state.screenMotion = null; state.videoEncoder = ''; ownAudio?.sync(null); syncScreenSubscriptions(); }
    else for (const peer of state.peers.values()) {
      for (const sender of peer.senders.camera) { if (active(peer)) peer.pc.removeTrack(sender); }
      peer.senders.camera = [];
    }
    if (notify) sendVoiceState();
    tuneSenders();
    render();
  }

  // Conexão com alguém caiu. De "disconnected" o navegador volta sozinho quando a rede volta; de
  // "failed", só reiniciando o ICE. Tenta 5 s depois de cair (2 s se já falhou) e segue tentando enquanto
  // a pessoa estiver na chamada: a cada 5 s no primeiro minuto, depois a cada 15 s, por até 5 minutos.
  // Assim a rede que volta depois de 30 s ou mais encontra uma tentativa em andamento. A partir da
  // terceira tentativa, avisa e mostra "Reconectar".
  function scheduleRecovery(peer) {
    if (sfu?.active() || peer.recoveryTimer || (peer.recoveryAttempts || 0) >= 28) return;
    const attempts = peer.recoveryAttempts || 0;
    const delay = !attempts && peer.pc.connectionState === 'failed' ? 2000 : attempts < 12 ? 5000 : 15000;
    peer.recoveryTimer = setTimeout(() => {
      peer.recoveryTimer = null;
      if (!active(peer) || peer.pc.connectionState === 'connected') return;
      peer.recoveryAttempts = (peer.recoveryAttempts || 0) + 1;
      peer.pc.restartIce();
      if (peer.recoveryAttempts === 3) mediaNotice('Uma conexão não se recuperou. Use Reconectar em Conexão e diagnóstico.');
      scheduleRecovery(peer);
      renderDiagnostics();
    }, delay);
  }
  // Chamado a cada mudança de estado da conexão (public/app.js). Quando ela volta, a espera é
  // apagada de verdade: um timer cancelado que continuasse em peer.recoveryTimer bloquearia todas
  // as recuperações seguintes com essa pessoa.
  function connectionChanged(peer) {
    if (sfu?.active()) return;
    if (peer.pc.connectionState === 'connected') { clearTimeout(peer.recoveryTimer); peer.recoveryTimer = null; peer.recoveryAttempts = 0; }
    else if (['failed', 'disconnected'].includes(peer.pc.connectionState)) scheduleRecovery(peer);
  }
  // A internet voltou (o sistema avisa): tenta já, sem esperar a próxima tentativa.
  window.addEventListener?.('online', () => {
    for (const peer of state.peers.values()) {
      if (!active(peer) || !['failed', 'disconnected'].includes(peer.pc.connectionState)) continue;
      clearTimeout(peer.recoveryTimer); peer.recoveryTimer = null;
      peer.pc.restartIce();
      scheduleRecovery(peer);
    }
  });

  function renderDiagnostics() {
    const root = $('#diagnostics-peers');
    if (!root) return;
    $('#media-health').textContent = state.mediaHealth;
    const sound = { native: 'som sem as vozes da chamada', filter: 'vozes da chamada tiradas pelo filtro do Resenhex', mixed: 'som com as vozes da chamada', tab: 'som da aba', app: 'som dos aplicativos selecionados' }[state.local.screen && state.shareAudioMode];
    $('#diagnostics-summary').textContent = !state.voiceChannel ? 'Entre em uma chamada para ver as conexões.' : [sfu?.active() ? 'SFU · Uma conexão com o servidor de mídia' : `${state.peers.size} conexões`, `${viewers().length} espectadores da sua tela`, sound, state.videoEncoder, state.gpuCapabilities?.videoEncode ? `GPU no app: ${state.gpuCapabilities.videoEncode}` : ''].filter(Boolean).join(' · ');
    const states = { connected: 'Conectado', connecting: 'Conectando', new: 'Preparando', disconnected: 'Reconectando', failed: 'Falha na conexão', closed: 'Encerrado' };
    root.replaceChildren(...[...state.peers].map(([sid, peer]) => {
      const stats = peer.stats || {};
      const line = el('div', { class: 'diagnostic-peer' }, el('strong', { textContent: `${member(voiceEntry(sid)?.accountId)?.name || 'Participante'} · ${states[peer.pc.connectionState] || 'Preparando'}` }),
        el('span', { textContent: [stats.rtt != null ? `${Math.round(stats.rtt * 1000)} ms` : 'Latência ainda indisponível', stats.path || '', stats.video || '', peer.mediaError || ''].filter(Boolean).join(' · ') }));
      if (!sfu?.active() && ['failed', 'disconnected'].includes(peer.pc.connectionState)) line.append(el('button', { type: 'button', textContent: 'Reconectar', onclick: () => { clearTimeout(peer.recoveryTimer); peer.recoveryTimer = null; peer.recoveryAttempts = 0; peer.pc.restartIce(); scheduleRecovery(peer); } }));
      return line;
    }));
  }

  function videoMeasurement(sid, report, r, bytes) {
    const key = sid + ':' + r.id;
    const previous = samples.get(key);
    samples.set(key, { bytes, time: r.timestamp, frames: r.framesSent ?? r.framesDecoded });
    const bitrate = previous && r.timestamp > previous.time && bytes >= previous.bytes ? (bytes - previous.bytes) * 8000 / (r.timestamp - previous.time) : null;
    const progressing = previous ? bytes > previous.bytes || (r.framesSent ?? r.framesDecoded) > previous.frames : (r.framesSent ?? r.framesDecoded) > 0;
    return { width: r.frameWidth, height: r.frameHeight, fps: r.framesPerSecond, bitrate, progressing, codec: report.get(r.codecId)?.mimeType?.split('/')[1] || '' };
  }

  // H.264 no processador (OpenH264) em vez da placa de vídeo: o perfil não tem codificador de hardware
  // (42e01f) ou a placa não abriu mais uma sessão de codificação naquele momento. Troca, sem
  // renegociar, para outro perfil negociado que a placa codifica; no máximo duas trocas por conexão.
  // Vale para NVIDIA, AMD e Intel: no Windows todas passam pelo Media Foundation do Chromium.
  function escapeSoftwareH264(peer, sender, fmtp) {
    peer.softwareSamples = 0;
    const avoid = sender.softwareH264 ||= [];
    if (!fmtp || avoid.length >= 2 || avoid.includes(fmtp)) return;
    const next = MediaPolicy.pickCodec(sender.getParameters().codecs, screenCodecs(peer.sid), [...avoid, fmtp]);
    if (!MediaPolicy.hardwareH264(next) || next.sdpFmtpLine === fmtp) return;
    avoid.push(fmtp);
    tuneSenders(peer);
  }

  let stepDownAt = -Infinity; // última descida da escada do Movimento, entre todos os espectadores
  async function updateStreamStats() {
    if (statsBusy) return;
    if (!state.voiceChannel) { samples.clear(); return; }
    statsBusy = true;
    const now = performance.now();
    try {
      if (sfu?.active()) { await sfu.stats(); syncScreenSubscriptions(); if (!$('#settings')?.classList.contains('hidden')) renderDiagnostics(); return; }
      const ladders = [];
      await Promise.allSettled([...state.peers].map(async ([sid, peer]) => {
        const report = await peer.pc.getStats();
        if (!active(peer)) return;
        const stats = {};
        let outbound;
        let outboundReport = report;
        const selected = new Set();
        report.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) selected.add(r.selectedCandidatePairId); });
        report.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && (selected.size ? selected.has(r.id) : r.nominated)) {
            stats.rtt = r.currentRoundTripTime;
            // Só informativa: decide se dá para subir um degrau, nunca limita o codificador.
            if (Number.isFinite(r.availableOutgoingBitrate)) peer.estimate = { bitrate: r.availableOutgoingBitrate, at: now };
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
        if (!outbound && screenSender) {
          outboundReport = await screenSender.getStats();
          outboundReport.forEach((r) => { if (r.type === 'outbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) outbound = r; });
        }
        if (outbound && viewers().includes(sid)) {
          const r = outbound;
          const source = outboundReport.get(r.mediaSourceId) || report.get(r.mediaSourceId);
          stats.screen = { ...videoMeasurement(sid, outboundReport, r, r.bytesSent), sourceFps: source?.framesPerSecond };
          stats.video = MediaPolicy.formatVideoStats([stats.screen]);
          const preset = activePreset();
          const codecStats = outboundReport.get(r.codecId) || report.get(r.codecId);
          const codec = codecStats?.mimeType;
          const previous = peer.encodeSample;
          peer.encodeSample = { time: r.totalEncodeTime, frames: r.framesEncoded };
          const encodeMs = previous && r.framesEncoded > previous.frames ? (r.totalEncodeTime - previous.time) / (r.framesEncoded - previous.frames) * 1000 : null;
          const load = MediaPolicy.encoderLoad({ reason: r.qualityLimitationReason, encodeMs, fps: MediaPolicy.screenTarget(preset, demandOf(sid), peer.adaptation.level || 0).fps,
            bitrate: stats.screen.bitrate, target: r.targetBitrate });
          state.videoEncoder = [r.powerEfficientEncoder === true ? 'Codificação por hardware' : r.encoderImplementation ? `Codificador: ${r.encoderImplementation}` : '',
            codec?.split('/')[1], load.cpu ? 'limitado pelo processador' : ''].filter(Boolean).join(' · ');
          // H.264 no processador em vez da placa de vídeo, por duas amostras seguidas do perfil pedido
          // (logo depois de uma troca, a amostra ainda pode ser do codificador anterior).
          const asked = screenSender.getParameters().encodings?.[0]?.codec?.sdpFmtpLine;
          const software = codec === 'video/H264' && r.powerEfficientEncoder === false && (!asked || asked === codecStats?.sdpFmtpLine);
          peer.softwareSamples = software ? (peer.softwareSamples || 0) + 1 : 0;
          if (peer.softwareSamples >= 2) escapeSoftwareH264(peer, screenSender, codecStats.sdpFmtpLine);
          // Processador no limite com AV1/VP9: primeiro troca para o codec leve, mantendo a resolução.
          peer.cpu = MediaPolicy.cpuStrain(peer.cpu, { limited: load.cpu && !state.screenCodecFallback, codec }, now);
          if (peer.cpu.fallback) lighterCodec(codec);
          peer.heavy = MediaPolicy.sustained(peer.heavy, load.heavy && preset.hint === 'detail' && !state.screenMotion, now);
          if (peer.heavy.reached) heavyContent();
          const awaitingCodec = peer.cpu.since != null;
          if (preset.adaptive && !awaitingCodec) {
            const demand = demandOf(sid), level = peer.adaptation.level || 0;
            const target = MediaPolicy.screenTarget(preset, demand, level);
            if (preset.steps) {
              // Escada fina do Movimento (MediaPolicy.ladder), aplicada depois de medir todos (abaixo).
              const heights = MediaPolicy.stepHeights(preset, demand);
              const estimate = peer.estimate && now - peer.estimate.at < 8000 ? peer.estimate.bitrate : null;
              ladders.push({ peer, height: heights[level], sample: { active: stats.screen.progressing, sentFps: r.framesPerSecond, sourceFps: source?.framesPerSecond, targetFps: target.fps,
                heights, encodeMs, available: estimate, upBitrate: level ? MediaPolicy.screenTarget(preset, demand, level - 1).bitrate : 0 } });
            } else {
              const strained = MediaPolicy.strained({ reason: r.qualityLimitationReason, sentFps: r.framesPerSecond, sourceFps: source?.framesPerSecond, targetFps: target.fps });
              const fresh = peer.estimate && now - peer.estimate.at < 8000 ? peer.estimate.bitrate : null;
              const upper = level ? MediaPolicy.screenTarget(preset, demand, level - 1).bitrate : 0;
              const headroom = level && fresh != null ? fresh - 176_000 >= upper * 1.25 : undefined;
              peer.adaptation = MediaPolicy.adapt(peer.adaptation, { active: stats.screen.progressing, strained, headroom, heights: MediaPolicy.stepHeights(preset, demand) }, now);
            }
          } else if (!preset.adaptive) peer.adaptation = {};
        }
        peer.stats = stats;
        const tile = document.querySelector(`[data-key="screen-${sid}"]`);
        if (tile && isWatching(sid)) {
          const quality = requestedQuality(sid);
          const health = tile.querySelector('.stream-health');
          if (health) health.textContent = quality.background ? 'Economia em segundo plano · áudio conectado' : `${MediaPolicy.watchModes[getWatchQuality(sid)].label} · Qualidade por espectador`;
          const track = peer.remote.screen?.getVideoTracks()[0];
          const receiver = track && peer.pc.getReceivers().find((r) => r.track === track);
          if (receiver) {
            const incoming = await receiver.getStats();
            incoming.forEach((r) => {
              if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) tile.querySelector('.stats').textContent = MediaPolicy.formatVideoStats([videoMeasurement(sid, incoming, r, r.bytesReceived)]);
            });
          }
        }
      }));
      // O processador e a internet de envio são de todos os espectadores. Quando vários engasgam juntos,
      // desce primeiro o bloco menor, que libera processador e banda com a menor perda visível; um de cada
      // vez, com ~3 s entre uma descida e outra. Assim o 1080p só desce se ainda faltar. Na volta, o maior
      // sobe primeiro (quem está em segundo plano ou com a tela parada não segura os outros), e só um
      // tenta subir por vez.
      ladders.sort((a, b) => a.height - b.height);
      const climbing = (o) => (o.peer.adaptation.level || 0) > 0 && o.sample.targetFps >= 20 && !(o.sample.sourceFps < 20)
        && !(o.peer.adaptation.failures?.[(o.peer.adaptation.level || 0) - 1]?.until > now);
      // Blocos sem degraus (720p ou menos) vão antes a 30 fps: liberam processador e banda para o 1080p,
      // como a camada de miniaturas do SFU. Só depois disso o 1080p desce para 900p.
      const stepless = ladders.filter((o) => new Set(o.sample.heights).size === 1);
      for (const { peer, height, sample } of ladders) {
        const probing = [...state.peers.values()].some((other) => other !== peer && other.adaptation?.probe && now - other.adaptation.probe.at < 10_000);
        const bigger = ladders.some((o) => o.peer !== peer && o.height > height && climbing(o));
        const before = peer.adaptation, level = before.level || 0;
        let next = MediaPolicy.ladder(before, { ...sample, canProbe: !probing && !bigger, canStepDown: !(now - stepDownAt < 3000) }, now);
        if ((next.level || 0) > level) {
          const full = stepless.filter((o) => o.peer !== peer && !o.peer.adaptation.half && o.sample.targetFps >= 40);
          if (full.length) {
            next = { ...before, fps: [], changedAt: now };
            for (const o of full) o.peer.adaptation = { ...o.peer.adaptation, half: true };
          }
          stepDownAt = now;
        }
        peer.adaptation = next;
      }
      // Os blocos voltam a 60 fps com todos de volta ao seu tamanho e 30 s sem aperto.
      if (now - stepDownAt >= 30_000 && ladders.every((o) => !(o.peer.adaptation.level > 0))) {
        for (const o of stepless) if (o.peer.adaptation.half) o.peer.adaptation = { ...o.peer.adaptation, half: false };
      }
      const own = document.querySelector(`[data-key="screen-${state.me?.sid}"]`);
      if (own) {
        const connections = viewers().map((sid) => state.peers.get(sid)).filter(Boolean);
        const reduced = connections.some((peer) => peer.adaptation.level > 0);
        own.querySelector('.stream-health').textContent = connections.length ? `${connections.length} assistindo · ${reduced ? 'Qualidade adaptada' : 'Qualidade por espectador'}` : 'Pronto · Aguardando espectadores';
        const measured = connections.map((peer) => peer.stats?.screen).filter(Boolean);
        own.querySelector('.stats').textContent = !connections.length ? 'Sem espectadores · 0,0 Mbps' : measured.length !== connections.length ? 'Medindo qualidade…' : MediaPolicy.formatVideoStats(measured, connections.length > 1);
      }
      syncScreenSubscriptions();
      tuneSenders();
      if (!$('#settings').classList.contains('hidden')) renderDiagnostics();
      const validIds = new Set(state.peers.keys());
      for (const key of samples.keys()) if (!validIds.has(key.split(':')[0])) samples.delete(key);
    } finally { statsBusy = false; }
  }
  setInterval(updateStreamStats, 1500);
  return { isWatching, setWatching, getWatchQuality, setWatchQuality, syncViewerQuality, addVideoTracks, syncScreenSubscriptions, videoBitrates, remoteDescription, tuneSenders, applySharePreset, setSharePreset, captureScreen, watchScreenTrack, switchScreen, startVideo, stopVideo, scheduleRecovery, connectionChanged, renderDiagnostics, updateStreamStats, mediaNotice };
};
