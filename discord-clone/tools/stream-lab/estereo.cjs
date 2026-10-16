// O som da tela chega em estéreo? Um tom de 440 Hz só no canal esquerdo e um de 1000 Hz só no direito;
// quem recebe separa os canais e mede cada tom. Em mono, os dois canais trazem os dois tons.
// - P2P "antes": a negociação como era (setLocalDescription sem alterar a descrição).
// - P2P "agora": a applyLocalDescription do public/app.js com o MediaPolicy da árvore de trabalho, na
//   entrada da tela, depois de quem assiste renegociar (câmera) e depois de um reinício do ICE.
// - SFU: o LiveKit do laboratório com as opções de publicação do public/media-sfu.js (pula sem o LiveKit).
// Uso: node tools/stream-lab/estereo.cjs (precisa de xvfb-run e do Electron, como o run.cjs).
const fs = require('node:fs');
const path = require('node:path');
const PUBLIC = path.join(__dirname, '../../public');

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const { DATA, electronPath } = require('./paths.cjs');
  (async () => {
    const binary = path.join(DATA, 'livekit', 'livekit-server');
    let livekit = null;
    if (fs.existsSync(binary)) {
      const config = path.join(DATA, 'livekit', 'lab.yaml');
      fs.writeFileSync(config, 'port: 7880\nbind_addresses: [127.0.0.1]\nrtc:\n  tcp_port: 7881\n  udp_port: 7882\n  node_ip: 127.0.0.1\n  use_external_ip: false\n  enable_loopback_candidate: true\nkeys:\n  lab-key: lab-secret-only-for-local-tests-1234567890\nlogging:\n  level: warn\n');
      livekit = spawn(binary, ['--config', config], { stdio: 'ignore' });
      for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:7880/')).status) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
    } else console.log('LiveKit não encontrado em', binary, '(rode um cenário com SFU no run.cjs): o SFU fica de fora.');
    const child = spawn('xvfb-run', ['-a', electronPath(), '--no-sandbox', __filename], { env: { ...process.env, LAB_SFU: livekit ? '1' : '' }, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    await new Promise((resolve) => child.on('exit', resolve));
    livekit?.kill('SIGKILL');
    for (const line of output.split('\n')) if (line.startsWith('{')) console.log(line);
  })();
} else {
  const { app, BrowserWindow } = require('electron');
  const http = require('node:http');
  const ROOT = path.join(__dirname, '../..');
  const source = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
  const start = source.indexOf('  async function applyLocalDescription(peer) {');
  let end = start;
  for (let i = source.indexOf('{', start), depth = 0; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}' && --depth === 0) { end = i + 1; break; } }
  if (start < 0) throw new Error('applyLocalDescription não encontrada no public/app.js');
  const helper = source.slice(start, end);
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('disable-gpu');
  app.whenReady().then(async () => {
    const files = { '/media-policy.js': path.join(PUBLIC, 'media-policy.js'), '/livekit-client.js': path.join(path.dirname(require.resolve('livekit-client', { paths: [ROOT] })), 'livekit-client.umd.js') };
    const server = http.createServer((req, res) => {
      if (files[req.url]) { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(files[req.url])); }
      res.end('<script src="/media-policy.js"></script><script src="/livekit-client.js"></script>');
    }).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    let tokens = null;
    if (process.env.LAB_SFU) {
      const { AccessToken } = require(require.resolve('livekit-server-sdk', { paths: [ROOT] }));
      const token = (identity) => { const t = new AccessToken('lab-key', 'lab-secret-only-for-local-tests-1234567890', { identity, ttl: '10m' }); t.addGrant({ roomJoin: true, room: 'estereo', canPublish: true, canSubscribe: true }); return t.toJwt(); };
      tokens = { pub: await token('pub'), sub: await token('sub') };
    }
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
    const results = await win.webContents.executeJavaScript(`(async () => {
      ${helper}
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const ctx = new AudioContext({ sampleRate: 48000 }); await ctx.resume();
      function stereoTones() {
        const merger = ctx.createChannelMerger(2);
        for (const [hz, channel] of [[440, 0], [1000, 1]]) { const o = ctx.createOscillator(); o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = .25; o.connect(g).connect(merger, 0, channel); o.start(); }
        const dest = ctx.createMediaStreamDestination(); dest.channelCount = 2; dest.channelCountMode = 'explicit'; dest.channelInterpretation = 'discrete';
        merger.connect(dest); return dest.stream.getAudioTracks()[0];
      }
      function monoTone(hz) { const o = ctx.createOscillator(); o.frequency.value = hz; const d = ctx.createMediaStreamDestination(); d.channelCount = 1; o.connect(d); o.start(); return d.stream; }
      function canvasTrack() { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); setInterval(() => { g.fillStyle = '#' + Math.floor(Math.random() * 4095).toString(16).padStart(3, '0'); g.fillRect(0, 0, 320, 180); }, 50); return c.captureStream(20).getVideoTracks()[0]; }
      // dB de cada tom em cada canal decodificado: [440 Hz, 1000 Hz].
      async function measure(stream) {
        const el = new Audio(); el.muted = true; el.srcObject = stream; await el.play().catch(() => {}); // o Chrome só entrega o áudio do WebRTC ao Web Audio assim
        const src = ctx.createMediaStreamSource(stream), split = ctx.createChannelSplitter(2); src.connect(split);
        const an = [0, 1].map((i) => { const a = ctx.createAnalyser(); a.fftSize = 8192; a.smoothingTimeConstant = 0; split.connect(a, i); return a; });
        await sleep(3000);
        const bin = (hz) => Math.round(hz * 8192 / ctx.sampleRate);
        const [L, R] = an.map((a) => { const d = new Float32Array(a.frequencyBinCount); a.getFloatFrequencyData(d); return [440, 1000].map((hz) => Math.round(Math.max(...[-2, -1, 0, 1, 2].map((k) => d[bin(hz) + k])))); });
        src.disconnect(); el.srcObject = null;
        return { L, R, estereo: L[0] - L[1] > 40 && R[1] - R[0] > 40 };
      }
      async function p2p(useApp) {
        const S = new RTCPeerConnection(), V = new RTCPeerConnection(), screen = new MediaStream([canvasTrack(), stereoTones()]);
        const peers = { S: { pc: S, remoteIds: { screen: null }, makingOffer: false }, V: { pc: V, remoteIds: { screen: null }, makingOffer: false } }, other = { S: 'V', V: 'S' };
        const setLocal = (peer) => useApp ? applyLocalDescription(peer) : peer.pc.setLocalDescription();
        // Como a sinalização do app: a descrição vai com o id da transmissão de quem envia.
        const send = async (from, data) => {
          const to = peers[other[from]];
          if (data.candidate) return to.pc.addIceCandidate(data.candidate).catch(() => {});
          to.remoteIds = { screen: data.video?.screen || null };
          await to.pc.setRemoteDescription(data.description);
          if (data.description.type === 'offer') { await setLocal(to); await send(other[from], { description: to.pc.localDescription, video: other[from] === 'S' ? { screen: screen.id } : {} }); }
        };
        for (const [key, peer] of Object.entries(peers)) {
          peer.pc.onicecandidate = (e) => e.candidate && send(key, { candidate: e.candidate });
          peer.pc.onnegotiationneeded = async () => { try { peer.makingOffer = true; await setLocal(peer); await send(key, { description: peer.pc.localDescription, video: key === 'S' ? { screen: screen.id } : {} }); } finally { peer.makingOffer = false; } };
        }
        let screenAudio;
        V.ontrack = (e) => { if (e.track.kind === 'audio' && e.streams[0]?.id === screen.id) screenAudio = new MediaStream([e.track]); };
        const stable = async () => { for (let i = 0; i < 80 && (S.signalingState !== 'stable' || V.signalingState !== 'stable' || peers.S.makingOffer || peers.V.makingOffer); i++) await sleep(50); await sleep(300); };
        const vMic = monoTone(300), sMic = monoTone(200);
        V.addTrack(vMic.getAudioTracks()[0], vMic); // quem entra oferece
        for (let i = 0; i < 80 && V.connectionState !== 'connected'; i++) await sleep(100);
        await stable();
        S.addTrack(sMic.getAudioTracks()[0], sMic);
        for (const track of screen.getTracks()) S.addTrack(track, screen); // a tela com som entra
        for (let i = 0; i < 80 && !screenAudio; i++) await sleep(100);
        await stable();
        const result = { entrada: await measure(screenAudio) };
        V.addTrack(canvasTrack()); await sleep(300); await stable(); // quem assiste liga a câmera: oferta dele
        result.depoisDaCameraDeQuemAssiste = await measure(screenAudio);
        V.restartIce(); await sleep(300); await stable(); await sleep(1500); // recuperação iniciada por quem assiste
        result.depoisDoReinicioDoIce = await measure(screenAudio);
        const mids = MediaPolicy.audioMids(V.remoteDescription.sdp, screen.id);
        result.vozEmMono = !V.localDescription.sdp.split('m=').some((section) => section.startsWith('audio') && !mids.has(/a=mid:(\\S+)/.exec(section)?.[1]) && /stereo=1/.test(section));
        result.conexao = V.connectionState;
        S.close(); V.close();
        return result;
      }
      async function sfu(tokens) {
        const LK = window.LivekitClient;
        const roomOptions = { singlePeerConnection: false, adaptiveStream: false, dynacast: true, stopLocalTrackOnUnpublish: false, disconnectOnPageLeave: true };
        const connectOptions = { autoSubscribe: false, rtcConfig: { bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' } };
        const pub = new LK.Room(roomOptions), sub = new LK.Room(roomOptions);
        await pub.connect('ws://127.0.0.1:7880', tokens.pub, connectOptions);
        await sub.connect('ws://127.0.0.1:7880', tokens.sub, connectOptions);
        let remote;
        sub.on(LK.RoomEvent.TrackSubscribed, (track) => { remote = new MediaStream([track.mediaStreamTrack]); });
        sub.on(LK.RoomEvent.TrackPublished, (publication) => publication.setSubscribed(true));
        // As opções que o media-sfu.js usa para o som da tela.
        await pub.localParticipant.publishTrack(stereoTones(), { source: LK.Track.Source.ScreenShareAudio, audioPreset: { maxBitrate: 96000 }, dtx: false, forceStereo: true });
        for (const participant of sub.remoteParticipants.values()) for (const publication of participant.trackPublications.values()) publication.setSubscribed(true);
        for (let i = 0; i < 100 && !remote; i++) await sleep(100);
        await sleep(1500);
        const result = await measure(remote);
        await pub.disconnect(); await sub.disconnect();
        return result;
      }
      const out = { p2pAntes: await p2p(false), p2pAgora: await p2p(true) };
      if (${JSON.stringify(!!tokens)}) out.sfu = await sfu(${JSON.stringify(tokens)});
      return out;
    })()`);
    for (const [cenario, resultado] of Object.entries(results)) console.log(JSON.stringify({ cenario, resultado }));
    app.quit();
  });
}
