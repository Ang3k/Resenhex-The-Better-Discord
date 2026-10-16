// Streamer role: captures the fake "screen", sends it to each viewer over P2P (one PeerConnection
// per viewer, like the app's mesh) or publishes it once to LiveKit. Collects send-side stats and CPU.
/* global cfg, labNow, log, measureWindow, setGo, mean, pct, LivekitClient */
function codecList(wanted) {
  const caps = RTCRtpSender.getCapabilities('video').codecs;
  const order = Array.isArray(wanted) ? wanted : [wanted];
  const pick = (m) => caps.filter((c) => c.mimeType.toLowerCase() === m.toLowerCase() && (m !== 'video/VP9' || (c.sdpFmtpLine || '').includes('profile-id=0'))
    && (m !== 'video/H264' || ((c.sdpFmtpLine || '').includes('packetization-mode=1') && (c.sdpFmtpLine || '').includes('42e01f'))));
  const first = order.flatMap(pick);
  return [...first, ...caps.filter((c) => !first.includes(c))];
}
const munge = (sdp) => cfg.startBitrateKbps ? sdp.replace(/a=fmtp:(\d+) (.*)/g, (line) => line + `;x-google-start-bitrate=${cfg.startBitrateKbps}`) : sdp;

// cfg.audioFirst (ms): como numa chamada de verdade, a conexão nasce só com o microfone e a tela entra
// depois; a medição começa no instante em que a tela é adicionada.
function oscillator() {
  const ctx = new AudioContext(), osc = ctx.createOscillator(), dest = ctx.createMediaStreamDestination();
  osc.connect(dest); osc.start();
  return dest.stream;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runStreamerRole() {
  const st = { senders: [], series: [], enc: [], cpu: [], pcs: new Map(), ready: new Set(), connected: new Set(), finished: false, waitScreen: !!cfg.audioFirst };
  let stream, readyAll;
  const allReady = new Promise((resolve) => { readyAll = resolve; });
  async function capture() {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { exact: cfg.clipW }, height: { exact: cfg.clipH }, frameRate: { ideal: cfg.fps, max: cfg.fps } } });
    const track = stream.getVideoTracks()[0];
    track.contentHint = cfg.hint || '';
    const preview = document.createElement('video'); preview.muted = true; preview.autoplay = true; preview.srcObject = stream; document.getElementById('videos').append(preview);
    return track;
  }
  async function applyEncoding(sender, i) {
    const params = sender.getParameters();
    Object.assign(params.encodings[0], cfg.encoding || {}, cfg.viewerEncodings?.[i] || {});
    if (cfg.degradation) params.degradationPreference = cfg.degradation;
    await sender.setParameters(params);
  }
  async function p2pOffer(i) {
    const pc = new RTCPeerConnection();
    const pending = [];
    st.pcs.set(i, { pc, pending });
    pc.onicecandidate = (e) => e.candidate && lab.send(i, { type: 'candidate', c: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') { st.connected.add(i); maybeGo(); } };
    const tr = pc.addTransceiver(stream.getVideoTracks()[0], { direction: 'sendonly', streams: [stream] });
    tr.setCodecPreferences(codecList(cfg.codecs?.[i] || cfg.codec));
    const offer = await pc.createOffer();
    await pc.setLocalDescription({ type: 'offer', sdp: munge(offer.sdp) });
    lab.send(i, { type: 'offer', sdp: pc.localDescription.sdp });
    st.senders[i] = tr.sender;
  }
  // SFU app mode: the real public/media-sfu.js (baseline or current) connects and publishes.
  async function sfuApp(track) {
    const LK = window.LivekitClient;
    const load = (src) => new Promise((resolve, reject) => { const el = document.createElement('script'); el.src = src; el.onload = resolve; el.onerror = reject; document.head.append(el); });
    for (const file of ['media-policy.js', 'media-sfu.js']) await load(`/app/${cfg.app}/${file}`);
    const Original = LK.Room;
    LK.Room = class extends Original { constructor(...args) { super(...args); window.labRoom = this; } };
    const state = { sharePreset: cfg.preset, uploadMbps: cfg.upload || 10, local: { screen: stream, camera: null }, peers: new Map(), micStream: oscillator(), me: { sid: 'streamer' } };
    const sfu = window.MediaSfu({ state, renderStage() {}, applyAudio() {}, watchSpeaking() {}, unwatchSpeaking() {}, closePeer() {}, notice: (m) => log('notice', m), onLost: () => log('lost') });
    state.mediaTransport = 'sfu';
    const cred = await (await fetch(`/token?id=streamer&room=${cfg.room || 'lab'}`)).json();
    await sfu.connect(cred);
    if (cfg.audioFirst) { await allReady; await sleep(cfg.audioFirst); for (const i of st.ready) st.connected.add(i); screenStarts(); }
    await sfu.publish('screen', stream);
    track.contentHint = window.MediaPolicy.presets[cfg.preset].hint; // the app sets it right after publishing (watchScreenTrack)
    const publication = [...window.labRoom.localParticipant.trackPublications.values()].find((p) => p.source === LK.Track.Source.ScreenShare);
    st.senders = [publication.track.sender];
    app = { state, sfu };
    setInterval(() => sfu.stats({ render: false }).catch(() => {}), 1500);
    log('app sfu published', JSON.stringify(publication.track.sender.getParameters().encodings), track.contentHint);
  }
  const setup = (async () => {
    try {
      const track = await capture();
      if (cfg.mode === 'sfu' && cfg.app) await sfuApp(track);
      else if (cfg.mode === 'sfu') await sfuPublish(track);
    } catch (e) { log('streamer error', String(e.stack || e)); throw e; }
  })();
  // App mode: the real MediaSession/MediaPolicy/preferCodec (baseline = git HEAD, current = working copy)
  // manage one PeerConnection per viewer, exactly as public/app.js wires them.
  let app = null;
  async function startApp() {
    if (app) return;
    const load = (src) => new Promise((resolve, reject) => { const el = document.createElement('script'); el.src = src; el.onload = resolve; el.onerror = reject; document.head.append(el); });
    for (const file of ['media-policy.js', 'media-session.js', 'prefer-codec.js']) await load(`/app/${cfg.app}/${file}`);
    const handlers = {}, sids = Array.from({ length: cfg.viewers }, (_, i) => 'v' + i);
    const entries = { streamer: { sid: 'streamer', channel: 'room', viewers: [] } };
    sids.forEach((sid) => { entries[sid] = { sid, channel: 'room', viewers: [] }; });
    const state = { me: { sid: 'streamer' }, peers: new Map(), voiceChannel: 'room', view: 'voice', local: { screen: stream, camera: null }, sharePreset: cfg.preset, uploadMbps: cfg.upload || 10, mediaHealth: '', shareAudio: false };
    const el = (tag, props) => Object.assign(document.createElement(tag), props || {});
    const mic = cfg.audioFirst ? oscillator() : null;
    sids.forEach((sid, i) => {
      const pc = new RTCPeerConnection();
      if (mic) pc.addTrack(mic.getAudioTracks()[0], mic);
      state.peers.set(sid, { sid, pc, senders: { screen: [], camera: [] }, remote: {}, adaptation: {}, stats: {}, recoveryAttempts: 0 });
      st.pcs.set(i, { pc, pending: [] });
      pc.onicecandidate = (e) => e.candidate && lab.send(i, { type: 'candidate', c: e.candidate.toJSON() });
      pc.onnegotiationneeded = async () => { await pc.setLocalDescription(); lab.send(i, { type: 'offer', sdp: pc.localDescription.sdp }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') { st.connected.add(i); maybeGo(); } };
    });
    const session = window.MediaSession({ state, socket: { connected: true, on: (event, cb) => { handlers[event] = cb; } }, call: async () => ({}), el, toast: (m) => log('toast', m),
      voiceEntry: (sid) => entries[sid], member: () => ({ name: 'lab' }), render() {}, renderStage() {}, sendVoiceState() {}, preferCodec: window.preferCodec, ownAudio: null, sfu: null });
    app = { session, state, handlers };
    window.appState = state;
    if (cfg.audioFirst) {
      while (st.connected.size < cfg.viewers) await sleep(100);
      await sleep(cfg.audioFirst);
      screenStarts();
    }
    session.watchScreenTrack(stream.getVideoTracks()[0]);
    await session.applySharePreset();
    entries.streamer.viewers = sids;
    sids.forEach((sid, i) => handlers['screen:quality']?.({ viewer: sid, demand: window.MediaPolicy.viewerDemand({ width: Math.round(cfg.compareHeights[i] * 16 / 9), height: cfg.compareHeights[i] }) }));
    session.syncScreenSubscriptions();
    for (const [i, sid] of sids.entries()) {
      const peer = state.peers.get(sid);
      for (let k = 0; k < 50 && !peer.senders.screen.some((x) => x.track?.kind === 'video'); k++) await new Promise((r) => setTimeout(r, 100));
      st.senders[i] = peer.senders.screen.find((x) => x.track?.kind === 'video');
    }
  }
  function screenStarts() { st.waitScreen = false; maybeGo(); }
  let went = false;
  async function maybeGo() {
    if (went || st.connected.size < cfg.viewers || st.waitScreen) return;
    went = true;
    if (cfg.mode !== 'sfu' && !cfg.app) for (const [i, s] of st.senders.entries()) await applyEncoding(s, i).catch((e) => log('encoding error', String(e)));
    const at = labNow();
    setGo(at);
    for (let i = 0; i < cfg.viewers; i++) lab.send(i, { type: 'go', at });
    fetch('/go', { method: 'POST', body: String(at) }).catch(() => {});
    if (cfg.events) for (const ev of cfg.events) setTimeout(() => runEvent(ev), ev.at * 1000);
  }
  async function runEvent(ev) {
    try {
      if (ev.type === 'encoding') for (const [i, s] of st.senders.entries()) { const p = s.getParameters(); Object.assign(p.encodings[0], ev.encoding, ev.viewerEncodings?.[i] || {}); await s.setParameters(p); }
      if (ev.type === 'codec') for (const s of st.senders) { const p = s.getParameters(); p.encodings[0].codec = p.codecs.find((c) => c.mimeType === ev.codec); await s.setParameters(p); }
      if (ev.type === 'hint') stream.getVideoTracks()[0].contentHint = ev.hint;
      // Espectadores mudam o pedido no meio da medição (ex.: { background: true } libera o processador).
      if (ev.type === 'demand') for (const i of ev.viewers) app?.handlers?.['screen:quality']?.({ viewer: 'v' + i,
        demand: { ...window.MediaPolicy.viewerDemand({ width: Math.round(cfg.compareHeights[i] * 16 / 9), height: cfg.compareHeights[i] }), ...ev.demand } });
    } catch (e) { log('event error', String(e)); }
  }
  lab.onMessage(async (from, msg) => {
    try {
      if (msg.type === 'ready') {
        const first = !st.ready.has(msg.i);
        st.ready.add(msg.i);
        if (st.ready.size === cfg.viewers) readyAll();
        await setup;
        if (!first) return;
        if (cfg.mode === 'sfu') { st.connected.add(msg.i); maybeGo(); }
        else if (cfg.app) { if (st.ready.size === cfg.viewers) await startApp(); }
        else await p2pOffer(msg.i);
      } else if (msg.type === 'answer') {
        const p = st.pcs.get(msg.i), answer = { type: 'answer', sdp: msg.sdp };
        // A resposta passa pelo app, como em public/app.js (taxa inicial da tela; versões novas).
        await p.pc.setRemoteDescription(app?.session?.remoteDescription?.(app.state.peers.get('v' + msg.i), answer) || answer);
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c);
      } else if (msg.type === 'candidate') {
        const p = st.pcs.get(msg.i);
        if (p?.pc.remoteDescription) await p.pc.addIceCandidate(msg.c); else p?.pending.push(msg.c);
      }
    } catch (e) { log('streamer msg error', String(e.stack || e)); }
  });
  async function sfuPublish(track) {
    const LK = window.LivekitClient;
    const cred = await (await fetch(`/token?id=streamer&room=${cfg.room || 'lab'}`)).json();
    const room = new LK.Room(cfg.roomOptions || { adaptiveStream: false, dynacast: true });
    await room.connect(cred.url, cred.token, { autoSubscribe: false });
    const opts = JSON.parse(JSON.stringify(cfg.publish || {}));
    for (const key of ['screenShareSimulcastLayers', 'videoSimulcastLayers']) if (opts[key]) opts[key] = opts[key].map((l) => new LK.VideoPreset(l.width, l.height, l.maxBitrate, l.maxFramerate));
    opts.source = LK.Track.Source.ScreenShare;
    const publication = await room.localParticipant.publishTrack(track, opts);
    st.senders = [publication.track.sender];
    st.publication = publication;
    window.streamerRoom = room;
    log('published', JSON.stringify(publication.track.sender.getParameters().encodings), track.contentHint);
  }
  async function collect() {
    const t = labNow();
    for (const [i, s] of st.senders.entries()) {
      if (!s) continue;
      try {
        const report = await s.getStats();
        const outs = []; let aob = null, src = null;
        report.forEach((r) => {
          if (r.type === 'outbound-rtp' && r.kind === 'video') outs.push({ rid: r.rid, ssrc: r.ssrc, framesEncoded: r.framesEncoded, totalEncodeTime: r.totalEncodeTime, qpSum: r.qpSum, bytesSent: r.bytesSent,
            rtx: r.retransmittedBytesSent, target: r.targetBitrate, w: r.frameWidth, h: r.frameHeight, fps: r.framesPerSecond, qlr: r.qualityLimitationReason, qld: r.qualityLimitationDurations,
            impl: r.encoderImplementation, keyFrames: r.keyFramesEncoded, huge: r.hugeFramesSent, nack: r.nackCount, pli: r.pliCount, sendDelay: r.totalPacketSendDelay, packetsSent: r.packetsSent,
            sm: r.scalabilityMode, codec: report.get(r.codecId)?.mimeType, active: r.active });
          if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') { aob = r.availableOutgoingBitrate; const lc = report.get(r.localCandidateId), rc = report.get(r.remoteCandidateId); st.path = `${lc?.protocol}/${lc?.candidateType}->${rc?.candidateType}:${rc?.port}`; }
          if (r.type === 'media-source' && r.kind === 'video') src = { frames: r.frames, fps: r.framesPerSecond };
        });
        st.series.push({ t, i, outs, aob, src });
      } catch {}
    }
    if (window.lab?.metrics) st.cpu.push({ t, m: await window.lab.metrics() });
  }
  const timer = setInterval(collect, 1000);
  async function encSampler() {
    if (!cfg.encSampler) return;
    let prev = null;
    while (!st.finished) {
      const s = st.senders[0];
      if (s) {
        const r = await s.getStats(); let o;
        r.forEach((x) => { if (x.type === 'outbound-rtp' && x.kind === 'video' && (!o || (x.frameWidth || 0) > (o.frameWidth || 0))) o = x; });
        const t = labNow(), w = measureWindow();
        if (o && prev && o.framesEncoded > prev.framesEncoded && w && t >= w.from) st.enc.push([Math.round(t - w.from), o.framesEncoded - prev.framesEncoded, +(((o.totalEncodeTime - prev.totalEncodeTime) / (o.framesEncoded - prev.framesEncoded)) * 1000).toFixed(1), o.bytesSent - prev.bytesSent]);
        prev = o;
      }
      await new Promise((r) => setTimeout(r, cfg.encSampler));
    }
  }
  function summary() {
    const w = measureWindow(), out = { senders: [], path: st.path };
    if (app) out.app = { variant: cfg.app, preset: app.state.sharePreset, fallback: app.state.screenCodecFallback ?? null, encoder: app.state.videoEncoder ?? null, health: app.state.mediaHealth,
      levels: [...app.state.peers.values()].map((p) => p.adaptation?.level || 0), degradation: st.senders.map((x) => x?.getParameters().degradationPreference), sfuPath: app.state.sfuPath ?? null,
      encodings: st.senders.map((x) => x?.getParameters().encodings.map((e) => ({ rid: e.rid, maxBitrate: e.maxBitrate, maxFramerate: e.maxFramerate, scale: e.scaleResolutionDownBy, sm: e.scalabilityMode, active: e.active }))) };
    for (let i = 0; i < st.senders.length; i++) {
      const ss = st.series.filter((x) => x.i === i), first = ss.find((x) => x.t >= w.from), last = [...ss].reverse().find((x) => x.t <= w.to + 1500);
      if (!first || !last || first === last) continue;
      const dt = (last.t - first.t) / 1000;
      const layers = last.outs.map((o) => {
        const p = first.outs.find((x) => x.ssrc === o.ssrc) || {}, fe = (o.framesEncoded ?? 0) - (p.framesEncoded ?? 0), qld = {};
        for (const k of Object.keys(o.qld || {})) qld[k] = +((o.qld[k] - (p.qld?.[k] || 0)) / dt).toFixed(3);
        return { rid: o.rid, codec: o.codec, impl: o.impl, res: `${o.w}x${o.h}`, encFps: fe / dt, encodeMs: fe ? ((o.totalEncodeTime - (p.totalEncodeTime || 0)) / fe) * 1000 : null,
          qpAvg: fe ? (o.qpSum - (p.qpSum || 0)) / fe : null, kbps: ((o.bytesSent - (p.bytesSent || 0)) * 8) / dt / 1000, rtxKbps: ((o.rtx - (p.rtx || 0)) * 8) / dt / 1000,
          targetKbps: o.target / 1000, qld, keyFrames: (o.keyFrames ?? 0) - (p.keyFrames ?? 0), huge: (o.huge ?? 0) - (p.huge ?? 0), pli: (o.pli ?? 0) - (p.pli ?? 0), nack: (o.nack ?? 0) - (p.nack ?? 0),
          sm: o.sm, active: o.active, sendDelayMs: o.packetsSent - (p.packetsSent || 0) ? ((o.sendDelay - (p.sendDelay || 0)) / (o.packetsSent - (p.packetsSent || 0))) * 1000 : null };
      });
      const aob = ss.filter((x) => x.t >= w.from && x.aob).map((x) => x.aob);
      const srcFps = first.src && last.src ? (last.src.frames - first.src.frames) / dt : null;
      out.senders.push({ i, layers, aobKbps: aob.length ? mean(aob) / 1000 : null, srcFps });
    }
    const cpu = st.cpu.filter((c) => c.t >= w.from && c.t <= w.to + 1500);
    if (cpu.length > 1) {
      const a = cpu[0], b = cpu.at(-1), dt = (b.t - a.t) / 1000, by = {};
      for (const m of b.m) { const p = a.m.find((x) => x.pid === m.pid); if (p && m.cumulative != null) by[m.role] = +((by[m.role] || 0) + (m.cumulative - p.cumulative) / dt * 100).toFixed(1); }
      out.cpu = by;
    }
    if (st.enc.length) { const per = st.enc.map((e) => e[2]); out.encode = { p50: pct(per, .5), p95: pct(per, .95), max: pct(per, 1), top: [...st.enc].sort((x, y) => y[2] - x[2]).slice(0, 10) }; }
    out.timeline = st.series.map((x) => ({ t: Math.round(x.t - w.from), i: x.i, aob: x.aob, src: x.src?.fps, layers: x.outs.map((o) => ({ rid: o.rid, fps: o.fps, h: o.h, bytes: o.bytesSent, qlr: o.qlr, target: o.target, codec: o.codec })) }));
    return out;
  }
  encSampler();
  return { async finish() { await collect(); st.finished = true; clearInterval(timer); return summary(); } };
}
