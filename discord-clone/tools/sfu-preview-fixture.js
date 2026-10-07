// Only injected by the local QA server; uses production MediaSfu and app UI.
state.mediaTransport = 'sfu';
state.showStreamStats = true;
LivekitClient.setLogLevel('debug');
const qaControllers = [], qaStates = [];
let qaExtra;
const qaPanel = el('div', { style: { cssText: 'position:fixed;bottom:8px;left:250px;z-index:10000;background:#171824;padding:12px;border:1px solid #777;border-radius:10px;max-width:900px' } });
const qaResult = el('output', { textContent: 'Validação SFU · Aguardando início', style: { cssText: 'display:block;font-size:12px;margin-top:8px' } });
const qaAudio = new AudioContext();
const qaTrace = el('pre', { style: { cssText: 'display:none' } });
LivekitClient.setLogExtension((_level, message, context) => {
  if (/candidate|connection state|transport connection/.test(message)) qaTrace.textContent += message + ' ' + JSON.stringify(context) + '\n';
});
const qaEmit = socket.emit.bind(socket);
socket.emit = (event, payload, callback) => {
  if (event === 'screen:watch') {
    const voice = state.server.voice.find((v) => v.sid === payload.target);
    voice.viewers = payload.watching ? [state.me.sid] : [];
    callback?.(null, { ok: true });
    return;
  }
  return qaEmit(event, payload, callback);
};
function qaMic(frequency = 440) {
  const oscillator = qaAudio.createOscillator(), gain = qaAudio.createGain(), output = qaAudio.createMediaStreamDestination();
  oscillator.frequency.value = frequency; gain.gain.value = .01; oscillator.connect(gain).connect(output); oscillator.start();
  return output.stream;
}
async function qaCredentials(sid) { return (await fetch('/qa/token/' + sid)).json(); }
const qaRun = el('button', { textContent: 'Iniciar validação SFU', onclick: async () => {
  qaRun.disabled = true;
  try {
    await qaAudio.resume();
    state.micStream = qaMic();
    qaResult.textContent = 'Conectando espectador principal…';
    await sfu.connect(await qaCredentials('preview-self'));
    qaResult.textContent = 'Espectador conectado. Iniciando transmissores…';
    for (let i = 1; i <= 2; i++) {
      const local = { mediaTransport: 'sfu', peers: new Map(), micStream: qaMic(440 + i * 110), local: { screen: previewStream(i) }, me: { sid: 'preview-' + i }, sharePreset: 'p720', uploadMbps: 10 };
      const controller = MediaSfu({ state: local, renderStage() {}, applyAudio() {}, watchSpeaking() {}, unwatchSpeaking() {}, closePeer(sid) { local.peers.delete(sid); }, notice(message) { qaResult.textContent = message; } });
      controller.configureSubscriptions(() => controller.subscriptions(() => false, () => ({ maxHeight: 720, background: false })));
      qaStates.push(local); qaControllers.push(controller);
      await controller.connect(await qaCredentials(local.me.sid));
      local.local.screen.addTrack(qaMic(220 + i * 55).getAudioTracks()[0]);
      await controller.publish('screen', local.local.screen);
    }
    syncScreenSubscriptions(); renderStage();
    qaResult.textContent = 'SFU conectado · 2 transmissores · mídia sintética';
  } catch (error) { qaResult.textContent = 'FALHA: ' + error.message; }
} });
const qaAdd = el('button', { textContent: 'Adicionar espectador', onclick: async () => {
  try {
    qaExtra = new LivekitClient.Room({ singlePeerConnection: false, adaptiveStream: false });
    const credentials = await qaCredentials('preview-extra');
    await qaExtra.connect(credentials.url, credentials.token);
    qaAdd.disabled = true; qaResult.textContent = 'Espectador adicional conectado';
  } catch (error) { qaResult.textContent = 'FALHA: ' + error.message; }
} });
const qaStop = el('button', { textContent: 'Parar primeira tela', onclick: async () => {
  await qaControllers[0]?.stop('screen');
  state.server.voice.find((v) => v.sid === 'preview-1').sharing = false;
  renderStage(); qaResult.textContent = 'Primeira tela encerrada';
} });
const qaSwitch = el('button', { textContent: 'Trocar segunda fonte', onclick: async () => {
  const old = qaStates[1].local.screen, next = previewStream(4);
  qaStates[1].local.screen = next;
  await qaControllers[1].publish('screen', next);
  old.getTracks().forEach((t) => t.stop());
  qaResult.textContent = 'Segunda fonte trocada · áudio antigo removido';
} });
const qaLeave = el('button', { textContent: 'Encerrar validação', onclick: () => {
  for (const controller of qaControllers) controller.disconnect();
  qaExtra?.disconnect(); sfu.disconnect();
  for (const local of qaStates) { local.micStream.getTracks().forEach((t) => t.stop()); local.local.screen.getTracks().forEach((t) => t.stop()); }
  qaAudio.close(); state.peers.clear(); renderStage(); qaResult.textContent = 'Validação encerrada';
} });
qaPanel.append(qaRun, qaAdd, qaSwitch, qaStop, qaLeave, qaResult, qaTrace);
document.body.append(qaPanel);
setInterval(async () => {
  if (!qaStates.length) return;
  const publishers = [];
  for (let i = 0; i < qaControllers.length; i++) {
    await qaControllers[i].stats({ render: false });
    const video = qaStates[i].sfuVideoStats || [];
    publishers.push(`P${i + 1}: ${video.length} camadas, ${Math.round(video.reduce((sum, v) => sum + (v.bitrate || 0), 0) / 1000)} kbps`);
  }
  const players = [...document.querySelectorAll('#stage-primary video')].map((v) => `${v.videoWidth}×${v.videoHeight}`);
  const audio = [...state.peers.values()].map((p) => `voz ${p.micStream?.getAudioTracks().length || 0}/tela ${p.remote.screen?.getAudioTracks().length || 0}`).join(', ');
  qaResult.textContent = `${publishers.join(' · ')} · ${state.peers.size} participantes remotos · players ${players.join(', ')} · ${qaExtra ? '2 espectadores' : '1 espectador'} · áudio ${audio}`;
}, 2500);
