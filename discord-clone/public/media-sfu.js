window.MediaSfu = function ({ state, renderStage, applyAudio, watchSpeaking, unwatchSpeaking, closePeer, notice, onLost }) {
  let room = null, generation = 0, profile = '';
  const queues = new Map(), samples = new Map(), layouts = new Map();
  const active = () => state.mediaTransport === 'sfu';
  const sdk = () => window.LivekitClient;
  const profileSignature = () => JSON.stringify([state.sharePreset, state.uploadMbps, !!state.local.screen, !!state.local.camera]);
  let sdkLoading;
  function loadSdk() {
    if (sdk()) return Promise.resolve();
    sdkLoading ||= new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = '/vendor/livekit-client.js';
      script.onload = resolve;
      script.onerror = () => { sdkLoading = null; script.remove(); reject(new Error('O módulo de mídia não carregou. Recarregue o Resenhex.')); };
      document.head.append(script);
    });
    return sdkLoading;
  }
  const source = (kind, track) => kind === 'microphone' ? sdk().Track.Source.Microphone : kind === 'camera' ? sdk().Track.Source.Camera : track.kind === 'audio' ? sdk().Track.Source.ScreenShareAudio : sdk().Track.Source.ScreenShare;
  // Protocol TrackSource numbers: camera 1, microphone 2, screen 3, screen audio 4.
  function allowed(value) {
    const permission = room?.localParticipant.permissions;
    return !!permission?.canPublish && (!permission.canPublishSources?.length || permission.canPublishSources.includes(value));
  }
  const canPublish = (kind) => allowed(kind === 'microphone' ? 2 : kind === 'camera' ? 1 : 3);
  const sourceNumber = (src) => ({ camera: 1, microphone: 2, screen_share: 3, screen_share_audio: 4 })[src] || 0;
  function peer(participant) {
    const sid = participant.identity;
    if (!state.peers.has(sid)) state.peers.set(sid, { sid, participant, remote: { screen: null, camera: null }, remoteIds: {}, senders: { screen: [], camera: [] }, stats: {}, adaptation: {},
      pc: { get connectionState() { return room?.state === 'connected' ? 'connected' : 'disconnected'; }, signalingState: 'stable', close() { this.signalingState = 'closed'; }, restartIce() {}, getSenders: () => [], getReceivers: () => [] } });
    return state.peers.get(sid);
  }
  const isScreen = (publication) => [sdk().Track.Source.ScreenShare, sdk().Track.Source.ScreenShareAudio].includes(publication.source);
  function subscribed(track, publication, participant) {
    const p = peer(participant), native = track.mediaStreamTrack;
    if (publication.source === sdk().Track.Source.Microphone) {
      p.micStream = new MediaStream([native]);
      p.audioEl ||= new Audio(); p.audioEl.autoplay = true; p.audioEl.srcObject = p.micStream;
      if (state.outputDeviceId && p.audioEl.setSinkId) p.audioEl.setSinkId(state.outputDeviceId).catch(() => {});
      p.audioEl.play().catch(() => {});
      unwatchSpeaking(p.sid); watchSpeaking(p.sid, p.micStream);
    } else {
      const kind = isScreen(publication) ? 'screen' : 'camera';
      p.remote[kind] ||= new MediaStream();
      p.remote[kind].addTrack(native);
      p.remoteIds[kind] = p.remote[kind].id;
    }
    renderStage(); applyAudio();
  }
  function unsubscribed(track, publication, participant) {
    const p = state.peers.get(participant.identity);
    if (!p) return;
    if (publication.source === sdk().Track.Source.Microphone) {
      if (p.audioEl) p.audioEl.srcObject = null;
      p.micStream = null; unwatchSpeaking(p.sid);
    } else {
      const kind = isScreen(publication) ? 'screen' : 'camera';
      p.remote[kind]?.removeTrack(track.mediaStreamTrack);
      if (!p.remote[kind]?.getTracks().length) p.remote[kind] = null;
    }
    renderStage(); applyAudio();
  }
  function subscriptions(isWatching, demand) {
    if (!room) return;
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        const wanted = !isScreen(publication) || isWatching(participant.identity);
        if (publication.isSubscribed !== wanted) publication.setSubscribed(wanted);
        // Cameras: small in the grid, full quality only when highlighted.
        if (publication.source === sdk().Track.Source.Camera && wanted) {
          const height = state.pinned === 'user-' + participant.identity ? 720 : 360;
          const size = publication.dimensions || { width: 16, height: 9 };
          publication.setVideoDimensions({ width: Math.round(height * size.width / size.height), height });
        }
        if (publication.source === sdk().Track.Source.ScreenShare && wanted) {
          const quality = demand(participant.identity);
          const size = publication.dimensions || { width: 16, height: 9 };
          publication.setVideoDimensions({ width: Math.round(quality.maxHeight * size.width / size.height), height: quality.maxHeight });
          publication.setVideoFPS(quality.background ? 5 : quality.mode === 'economy' ? 15 : 60);
          publication.setEnabled(!quality.background);
        }
      }
    }
  }
  let refreshSubscriptions = () => {};
  async function connect(credentials) {
    disconnect();
    const epoch = generation;
    await loadSdk();
    if (epoch !== generation) throw new Error('A chamada foi encerrada.');
    // Deferred negotiation avoids reconfiguring a pre-offer PeerConnection in
    // Chromium/Electron. Publisher and subscriber transports stay constant
    // regardless of the number of people in the room.
    const current = new (sdk().Room)({ singlePeerConnection: false, adaptiveStream: false, dynacast: true, stopLocalTrackOnUnpublish: false, disconnectOnPageLeave: true });
    room = current;
    const E = sdk().RoomEvent;
    const guard = (fn) => (...args) => { if (room === current && epoch === generation) fn(...args); };
    current.on(E.ParticipantConnected, guard((p) => { peer(p); refreshSubscriptions(); renderStage(); }));
    current.on(E.ParticipantDisconnected, guard((p) => { closePeer(p.identity); renderStage(); }));
    current.on(E.TrackPublished, guard(() => refreshSubscriptions()));
    current.on(E.TrackSubscribed, guard(subscribed));
    current.on(E.TrackUnsubscribed, guard(unsubscribed));
    current.on(E.TrackMuted, guard(() => { renderStage(); applyAudio(); }));
    current.on(E.TrackUnmuted, guard(() => { renderStage(); applyAudio(); }));
    current.on(E.ParticipantPermissionsChanged, guard((_old, participant) => {
      if (participant !== current.localParticipant) return;
      if (canPublish('microphone') && state.micStream) publish('microphone', state.micStream).catch(() => notice('Não foi possível restaurar o microfone. Entre novamente na chamada.'));
      // The server mutes forbidden tracks but cannot unmute them; restore our own
      // once moderation allows the source again. Self-mute stays in applyAudio.
      for (const publication of current.localParticipant.trackPublications.values()) {
        if (publication.isMuted && publication.track && allowed(sourceNumber(publication.source))) publication.unmute().then(applyAudio, () => {});
      }
    }));
    current.on(E.Reconnecting, guard(() => notice('Reconectando ao servidor de mídia…')));
    current.on(E.Reconnected, guard(() => { refreshSubscriptions(); notice('Conexão com o servidor de mídia restabelecida.'); }));
    current.on(E.Disconnected, guard((reason) => {
      if (reason === sdk().DisconnectReason?.CLIENT_INITIATED) return;
      if (onLost) onLost(); else notice('A conexão de mídia terminou. Saia e entre novamente na chamada.');
    }));
    await current.connect(credentials.url, credentials.token, { autoSubscribe: false, rtcConfig: { bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' } });
    if (epoch !== generation || room !== current) { await current.disconnect(false); throw new Error('A chamada foi encerrada.'); }
    for (const p of current.remoteParticipants.values()) peer(p);
    refreshSubscriptions();
    if (canPublish('microphone')) await publish('microphone', state.micStream);
    if (window.resenhexDesktop?.mediaCapabilities) state.gpuCapabilities = await window.resenhexDesktop.mediaCapabilities().catch(() => null);
    renderStage(); applyAudio();
  }
  function disconnect() {
    generation++; profile = '';
    const previous = room; room = null; queues.clear(); samples.clear(); layouts.clear();
    previous?.disconnect(false).catch(() => {});
  }
  function enqueue(kind, task) {
    const current = room, epoch = generation;
    const next = (queues.get(kind) || Promise.resolve()).catch(() => {}).then(() => {
      if (current !== room || epoch !== generation) throw new Error('A chamada mudou.');
      return task(current, epoch);
    });
    queues.set(kind, next);
    next.finally(() => { if (queues.get(kind) === next) queues.delete(kind); }).catch(() => {});
    return next;
  }
  function options(kind, track) {
    const S = sdk(), preset = MediaPolicy.presets[state.sharePreset];
    const settings = track.getSettings(), screen = kind === 'screen';
    const cap = Math.max(200_000, (Number(state.uploadMbps) || 10) * 850_000 - (state.local.camera ? 1_200_000 : 0) - 176_000);
    const bitrate = Math.min(screen ? preset.bitrate : 1_200_000, cap) * .75;
    const height = settings.height || (screen ? preset.height : 720), aspect = (settings.width || height * 16 / 9) / height;
    const layers = [360, 720].filter((h) => h < height).map((h, i) => new S.VideoPreset(Math.round(h * aspect), h, Math.min(i ? 600_000 : 150_000, bitrate * (i ? .2 : .1)), Math.min(i ? 20 : 10, preset.fps)));
    const h264 = screen && preset.fps === 60 && RTCRtpSender.getCapabilities?.('video')?.codecs.some((c) => c.mimeType.toLowerCase() === 'video/h264');
    return { source: source(kind, track), videoCodec: h264 ? 'h264' : 'vp8', backupCodec: false,
      simulcast: track.kind === 'video', screenShareSimulcastLayers: layers, videoSimulcastLayers: layers,
      screenShareEncoding: { maxBitrate: bitrate, maxFramerate: preset.fps }, videoEncoding: { maxBitrate: bitrate, maxFramerate: 30 },
      degradationPreference: screen ? preset.degradation : 'balanced', audioPreset: { maxBitrate: kind === 'microphone' ? 64000 : 96000 }, dtx: kind === 'microphone', forceStereo: kind === 'screen' };
  }
  // What forces a new publication (codec, layers, frame rate); bitrate alone does not.
  function layout(opts) {
    const screen = opts.source === sdk().Track.Source.ScreenShare;
    const top = screen ? opts.screenShareEncoding : opts.videoEncoding, layers = screen ? opts.screenShareSimulcastLayers : opts.videoSimulcastLayers;
    return { key: JSON.stringify([opts.videoCodec, layers.map((l) => [l.width, l.height, l.encoding.maxFramerate]), top.maxFramerate, opts.degradationPreference]),
      bitrates: [...layers.map((l) => l.encoding.maxBitrate), top.maxBitrate] };
  }
  // Changes only the bitrates on the live sender, so viewers keep the video.
  async function retune(track, bitrates) {
    const sender = track.sender;
    if (!sender) return false;
    const unlock = await track.senderLock?.lock?.();
    try {
      const params = sender.getParameters(), encodings = params.encodings || [];
      if (encodings.length !== bitrates.length) return false;
      const order = encodings.map((_, i) => i).sort((a, b) => (encodings[b].scaleResolutionDownBy || 1) - (encodings[a].scaleResolutionDownBy || 1));
      order.forEach((index, rank) => { encodings[index].maxBitrate = bitrates[rank]; if (track.encodings?.[index]) track.encodings[index].maxBitrate = bitrates[rank]; });
      await sender.setParameters(params);
      return true;
    } finally { unlock?.(); }
  }
  function publish(kind, stream) {
    return enqueue(kind, async (current, epoch) => {
      if (!canPublish(kind)) { if (kind === 'microphone') return; throw new Error('Você não tem permissão para transmitir.'); }
      for (const track of stream.getTracks()) {
        const src = source(kind, track);
        const existing = [...current.localParticipant.trackPublications.values()].find((p) => p.source === src);
        if (existing?.track) await existing.track.replaceTrack(track, true);
        else {
          const opts = options(kind, track);
          await current.localParticipant.publishTrack(track, opts);
          if (track.kind === 'video') layouts.set(kind, layout(opts).key);
        }
        if (current !== room || epoch !== generation) throw new Error('A chamada mudou.');
      }
      // Changing from a source with audio to one without it removes the old audio.
      if (kind === 'screen' && !stream.getAudioTracks().length) {
        const audio = [...current.localParticipant.trackPublications.values()].find((p) => p.source === sdk().Track.Source.ScreenShareAudio);
        if (audio?.track) await current.localParticipant.unpublishTrack(audio.track, false);
      }
      if (kind !== 'microphone' && current.localParticipant.videoTrackPublications.size <= 1) profile = profileSignature();
    });
  }
  function tune() {
    if (!room || queues.has('screen') || queues.has('camera')) return;
    const signature = profileSignature();
    if (signature === profile) return;
    profile = signature;
    for (const kind of ['screen', 'camera']) {
      enqueue(kind, async (current) => {
        const src = kind === 'screen' ? sdk().Track.Source.ScreenShare : sdk().Track.Source.Camera;
        const publication = [...current.localParticipant.trackPublications.values()].find((p) => p.source === src);
        const track = state.local[kind]?.getVideoTracks()[0];
        if (!publication?.track || !track) return;
        const opts = options(kind, track), next = layout(opts);
        // Camera on/off or a new upload limit only moves bitrates: no flicker for viewers.
        if (publication.track.mediaStreamTrack === track && layouts.get(kind) === next.key && await retune(publication.track, next.bitrates).catch(() => false)) return;
        await current.localParticipant.unpublishTrack(publication.track, false);
        await current.localParticipant.publishTrack(track, opts);
        layouts.set(kind, next.key);
      }).catch(() => { profile = ''; if (room) notice('Não foi possível atualizar os limites de vídeo. Tentaremos novamente.'); });
    }
  }
  function stop(kind) {
    if (!room) return Promise.resolve();
    return enqueue(kind, async (current) => {
      for (const p of [...current.localParticipant.trackPublications.values()]) {
        if (kind === 'screen' ? isScreen(p) : p.source === sdk().Track.Source.Camera) await current.localParticipant.unpublishTrack(p.track, false);
      }
    });
  }
  function measurement(report, r) {
    const old = samples.get(r.id), bytes = r.bytesSent ?? r.bytesReceived;
    samples.set(r.id, { bytes, timestamp: r.timestamp });
    return { width: r.frameWidth, height: r.frameHeight, fps: r.framesPerSecond, bitrate: old && r.timestamp > old.timestamp ? (bytes - old.bytes) * 8000 / (r.timestamp - old.timestamp) : null, codec: report.get(r.codecId)?.mimeType?.split('/')[1] || '' };
  }
  async function stats({ render = true } = {}) {
    const current = room;
    if (!current) return;
    const own = [];
    for (const p of current.localParticipant.trackPublications.values()) {
      if (p.source !== sdk().Track.Source.ScreenShare) continue;
      const report = await p.track?.getRTCStatsReport();
      report?.forEach((r) => {
        if (r.type === 'outbound-rtp' && r.kind === 'video') {
          own.push(measurement(report, r));
          state.videoEncoder = r.powerEfficientEncoder === true ? 'Codificação eficiente por hardware' : r.encoderImplementation ? `Codificador: ${r.encoderImplementation}` : 'Codificador não informado pelo navegador';
          if (r.qualityLimitationReason === 'cpu') state.videoEncoder += ' · limitado pelo processador';
        }
      });
    }
    if (current !== room) return;
    state.sfuVideoStats = own;
    const tile = render && document.querySelector(`[data-key="screen-${state.me?.sid}"]`);
    if (tile) { const output = tile.querySelector('.stats'); if (output) output.textContent = MediaPolicy.formatVideoStats(own, true); const health = tile.querySelector('.stream-health'); if (health) health.textContent = 'SFU · Um envio para todos os espectadores'; }
    for (const participant of current.remoteParticipants.values()) {
      const p = peer(participant); p.stats.path = 'Servidor de mídia (SFU)';
      for (const publication of participant.trackPublications.values()) {
        if (publication.source !== sdk().Track.Source.ScreenShare || !publication.track) continue;
        const report = await publication.track.getRTCStatsReport();
        report?.forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            p.stats.video = MediaPolicy.formatVideoStats([measurement(report, r)]);
            const output = render && document.querySelector(`[data-key="screen-${p.sid}"] .stats`); if (output) output.textContent = p.stats.video;
          }
        });
      }
    }
  }
  function configureSubscriptions(callback) { refreshSubscriptions = callback; }
  return { active, connect, disconnect, publish, stop, tune, subscriptions, configureSubscriptions, stats };
};
