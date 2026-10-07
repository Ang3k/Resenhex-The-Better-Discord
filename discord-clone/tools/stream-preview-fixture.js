// Executado dentro do escopo de app.js somente pelo servidor de prévia.
const previewParams = new URLSearchParams(location.search);
const previewCount = Math.max(0, Math.min(6, Number(previewParams.get('streams') ?? 2)));
const previewMembers = ['Ana', 'Bruno', 'Clara', 'Diego', 'Elisa', 'Felipe', 'Gabriela'].map((name, i) => ({
  id: String(i + 1).repeat(16), name, color: ['#7c73ed', '#479d88', '#b46d91', '#578bbb', '#a58c47', '#a76c56', '#8670b3'][i],
  roles: [], online: true, timeoutUntil: 0,
}));
state.me = { accountId: previewMembers[0].id, sid: 'preview-self' };
state.voiceChannel = 'preview-voice';
state.textChannel = 'preview-chat';
state.view = 'voice';
state.showMembers = false;
state.showStreamStats = false;
state.reduceMotion = true;
document.documentElement.dataset.reduceMotion = 'true';
// As amostras não têm áudio; mudo também permite autoplay sem uma permissão do navegador.
state.streamMuted = new Set(previewMembers.slice(1).map((m) => m.id));
const previewPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  if (this.srcObject && !this.srcObject.getAudioTracks().length) this.muted = true;
  return previewPlay.call(this);
};
state.server = {
  serverId: 'preview', serverName: 'Resenha', ownerId: previewMembers[0].id, serverIcon: null,
  servers: [{ id: 'preview', name: 'Resenha', owner: true }], roles: [{ id: 'everyone', name: '@everyone', perms: [], pos: 0 }],
  categories: [{ id: 'text', name: 'Canais de texto' }, { id: 'voice', name: 'Canais de voz' }],
  channels: [{ id: 'preview-chat', name: 'geral', type: 'text', categoryId: 'text', allowedRoles: [] }, { id: 'preview-voice', name: 'Sala da galera', type: 'voice', categoryId: 'voice', allowedRoles: [] }],
  members: previewMembers, people: previewMembers, bans: [], myPerms: ['ADMIN', 'CONNECT', 'STREAM', 'SPEAK', 'SEND_MESSAGES'],
  voice: previewMembers.map((m, i) => ({ accountId: m.id, sid: i ? 'preview-' + i : 'preview-self', channel: 'preview-voice', sharing: i > 0 && i <= previewCount, viewers: i ? ['preview-self'] : [] })),
};
Sounds.play = () => {};
function previewStream(index) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const palette = index % 2 ? ['#162c37', '#377784', '#7bbac1'] : ['#262b44', '#514e82', '#9699d0'];
  const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
  gradient.addColorStop(0, palette[0]); gradient.addColorStop(1, palette[1]);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = '#ffffff0d';
  for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(980 + Math.cos(i) * 190, 340 + Math.sin(i) * 190, 120, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffffff16'; ctx.fillRect(0, 0, 1280, 52);
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#dbe7ee'; ctx.fillText(index % 2 ? 'Navegador · Projeto Aurora' : 'Editor · Novo projeto', 24, 33);
  ctx.fillStyle = palette[2]; ctx.font = 'bold 18px sans-serif'; ctx.fillText(index % 2 ? 'PROJETO AURORA' : 'ESPAÇO DE CRIAÇÃO', 70, 270);
  ctx.fillStyle = '#f4f7fb'; ctx.font = 'bold 54px sans-serif'; ctx.fillText(index % 2 ? 'Ideias ganham forma.' : 'Vamos criar juntos.', 70, 347);
  ctx.fillStyle = '#d1dce8'; ctx.font = '24px sans-serif'; ctx.fillText(index % 2 ? 'Uma nova perspectiva, a cada detalhe.' : 'Uma tela, infinitas possibilidades.', 70, 399);
  ctx.fillStyle = '#ffffff20'; ctx.fillRect(70, 450, 186, 48); ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'; ctx.fillText('Explorar projeto →', 86, 481);
  const stream = canvas.captureStream(2);
  // Mantém a fonte viva e produz quadros depois de os players serem conectados.
  setInterval(() => { ctx.fillStyle = palette[0]; ctx.fillRect(1250, 15, 10, 10); }, 500);
  return stream;
}
for (let i = 1; i <= previewCount; i++) {
  state.peers.set('preview-' + i, { remote: { screen: previewStream(i) }, pc: { connectionState: 'connected', getSenders: () => [], getStats: async () => new Map(), close() {} }, senders: { screen: [], camera: [] } });
}
state.speaking.add('preview-2');
document.documentElement.classList.remove('show-landing');
$('#login').classList.add('hidden');
$('#app').classList.remove('hidden');
startCallTime(Date.now() - 125000);
render();
if (previewParams.get('focus') === '1') togglePin('screen-preview-1', true);
if (previewParams.get('paused') === '1') { state.server.voice[1].paused = true; renderStage(); }
if (previewParams.get('hidden') === '1') { state.server.voice[1].viewers = []; renderStage(); }
if (previewParams.get('compact') === '1') {
  $('#main').classList.add('dm-call');
  $('#main').style.setProperty('--dm-call-h', '380px');
  $('#chat-view').classList.remove('hidden');
  $('#sc-chat').classList.remove('hidden');
  setControlIcon($('#sc-chat'), 'maximize', 22);
  $('#sc-chat').setAttribute('aria-label', 'Ampliar a chamada');
  $('#sc-music').classList.add('hidden');
}
