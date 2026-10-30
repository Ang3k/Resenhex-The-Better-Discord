// Popula um servidor local do Resenhex com contas, servidor, canais, mensagens, amigos e DMs para a auditoria visual.
// Uso: node seed.js http://localhost:3000 out.json
const path = require('path');
const fs = require('fs');
const APP = '/home/user/Resenhex-The-Better-Discord/discord-clone';
const { io } = require(path.join(APP, 'node_modules/socket.io-client'));
const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || 'seed-out.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  const s = io(BASE, { transports: ['websocket'], forceNew: true });
  s.last = {};
  s.onAny((ev, data) => { s.last[ev] = data; });
  return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
}
function call(s, ev, payload) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout ' + ev)), 15000);
    s.emit(ev, payload, (r) => { clearTimeout(t); if (r && r.error) rej(new Error(ev + ': ' + r.error)); else res(r); });
  });
}
async function waitState(s, pred = () => true, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (s.last.state && pred(s.last.state)) return s.last.state; await sleep(100); }
  return s.last.state;
}
async function register(name, color) {
  const s = await connect();
  const r = await call(s, 'auth', { mode: 'register', name, password: 'senha123', confirmPassword: 'senha123', color, version: '2.2.0', patches: 1 });
  s.acc = r; return s;
}
async function upload(token, channelId, file, name) {
  const body = fs.readFileSync(file);
  const res = await fetch(BASE + '/upload', { method: 'POST', headers: { 'x-token': token, 'x-channel-id': channelId, 'x-filename': encodeURIComponent(name) }, body });
  const j = await res.json(); if (j.error) throw new Error('upload: ' + j.error); return j;
}
// Envia respeitando o limite de 10 mensagens a cada 5 s por conta.
const sent = new Map();
async function send(s, channel, text, extra = {}) {
  const now = Date.now(); const list = (sent.get(s) || []).filter((t) => now - t < 5200);
  if (list.length >= 9) await sleep(5300 - (now - list[0]));
  list.push(Date.now()); sent.set(s, list.filter((t) => Date.now() - t < 5200));
  await call(s, 'chat:send', { channel, text, ...extra });
  return { id: s.last['chat:message']?.msg?.id };
}

(async () => {
  const ana = await register('Ana', '#c64cf0');
  const st0 = await waitState(ana, (st) => st.channels && st.channels.length);
  console.log('server', st0.serverName, st0.channels.map((c) => c.type + ':' + c.name).join(', '));
  await call(ana, 'server:update', { name: 'Resenha dos Amigos' });
  const catText = (await call(ana, 'category', { action: 'create', name: 'Papo' })).id;
  const catVoice = (await call(ana, 'category', { action: 'create', name: 'Calls' })).id;
  const geral = st0.channels.find((c) => c.type === 'text');
  await call(ana, 'channel', { action: 'update', id: geral.id, name: 'geral', topic: 'Papo livre da galera', categoryId: catText });
  const memes = (await call(ana, 'channel', { action: 'create', type: 'text', name: 'memes', categoryId: catText, topic: 'Só os melhores' })).id;
  const jogos = st0.channels.find((c) => c.type === 'text' && c.name === 'jogos').id;
  await call(ana, 'channel', { action: 'update', id: jogos, categoryId: catText });
  const links = st0.channels.find((c) => c.type === 'text' && c.name === 'links');
  if (links) await call(ana, 'channel', { action: 'update', id: links.id, categoryId: catText });
  const salao = (await call(ana, 'channel', { action: 'create', type: 'mudae', name: 'salão-mudae', categoryId: catText })).id;
  const vozExist = st0.channels.find((c) => c.type === 'voice');
  let voz = vozExist ? vozExist.id : (await call(ana, 'channel', { action: 'create', type: 'voice', name: 'Sala da resenha', categoryId: catVoice })).id;
  if (vozExist) await call(ana, 'channel', { action: 'update', id: voz, name: 'Sala da resenha', categoryId: catVoice });
  const others = st0.channels.filter((c) => c.type === 'voice' && c.id !== voz);
  for (const o of others) await call(ana, 'channel', { action: 'update', id: o.id, categoryId: catVoice });
  const voz2 = others[0]?.id;
  const invite = (await call(ana, 'server:invite', {})).code;

  const bruno = await register('Bruno', '#3fbf85');
  const caio = await register('Caio', '#f0b232');
  await call(bruno, 'server:join', { code: invite });
  await call(caio, 'server:join', { code: invite });
  // Um segundo servidor do Bruno, para a faixa ter mais de um ícone.
  await call(ana, 'server:create', { name: 'Faculdade' });
  await call(ana, 'server:create', { name: 'Clube do Jogo' });
  const stA = await waitState(ana);
  const mainId = st0.serverId || (stA.servers || []).find((x) => x.name === 'Resenha dos Amigos')?.id;
  console.log('servers', JSON.stringify((stA.servers || []).map((x) => x.name)));
  // volta para o servidor principal
  const servers = stA.servers || [];
  const main = servers.find((x) => x.name === 'Resenha dos Amigos');
  if (main) await call(ana, 'server:select', { id: main.id });
  await waitState(ana, (st) => st.serverName === 'Resenha dos Amigos');

  // Amizades: Ana e Bruno amigos; Caio pediu e espera.
  await call(ana, 'friend:request', { name: 'Bruno' });
  await sleep(200);
  await call(bruno, 'friend:accept', { id: ana.acc.accountId });
  await call(caio, 'friend:request', { name: 'Ana' });

  // Perfis e presença
  await call(ana, 'profile', { bio: 'Organizo a resenha de sexta 🎮\nChama no privado!' });
  await call(bruno, 'presence', { presence: 'idle', statusText: 'Volto já, fui buscar pizza' });
  await call(caio, 'presence', { presence: 'dnd', statusText: 'Ranqueada, não perturbe' });

  const A = ana.acc.accountId, B = bruno.acc.accountId, C = caio.acc.accountId;
  // ---- #geral: conversa de verdade com respostas, menções, reações, citações, código e links ----
  const script = [
    [ana, 'Bom dia, galera! ☀️ Quem topa jogar hoje à noite?'],
    [bruno, 'Eu topo! Que horas?'],
    [caio, 'Depois das 21h eu consigo'],
    [ana, `Fechado então, 21h na <#${voz}>. <@${B}> chama o pessoal da faculdade também`],
    [bruno, 'Pode deixar 👍'],
    [caio, '> Depois das 21h eu consigo\nCorrigindo: 21h30, tenho aula até tarde'],
    [ana, 'Sem problema, a gente começa com uma partida rápida'],
    [bruno, 'Alguém viu o patch novo? Mudaram **tudo** no mapa'],
    [caio, 'Vi sim, o *meta* virou de ponta-cabeça 😂'],
    [ana, 'Vou mandar o link com as notas: https://example.com/patch-notes'],
    [bruno, '`/join sala-da-resenha` funciona no bot novo?'],
    [ana, 'Funciona! Mas usa assim:\n```js\nconst sala = await entrar("sala-da-resenha");\nsala.tocar("musica-da-vitoria");\n```'],
    [caio, '@everyone lembrete: resenha hoje às 21h30!'],
    [bruno, '||spoiler: eu vou perder de novo||'],
    [ana, 'Hahaha'],
  ];
  const ids = [];
  for (const [who, text] of script) ids.push((await send(who, geral.id, text)).id);
  // filler para passar de 200 mensagens (rolagem)
  const phrases = ['kkkkk', 'boa!', 'alguém online?', 'tô chegando', 'que jogada foi essa', 'vou pegar um café ☕', 'GG', 'partiu', 'essa foi boa demais', 'sério?', 'manda print', 'tô sem mic, já volto', 'bora mais uma', 'perdi a conexão aqui', 'agora foi', 'quem ganhou?', 'amanhã tem mais', 'o servidor tá liso hoje', 'top demais', 'vamo que vamo'];
  const people = [ana, bruno, caio];
  for (let i = 0; i < 200; i++) {
    const who = people[(i * 7 + (i >> 2)) % 3];
    const text = phrases[(i * 13) % phrases.length] + (i % 17 === 0 ? ' — ' + 'mensagem um pouco mais longa para ver como o texto quebra em várias linhas quando a conversa fica animada e todo mundo resolve contar uma história ao mesmo tempo.' : '');
    const r = await send(who, geral.id, text); if (i < 3) ids.push(r.id);
  }
  // Mensagens recentes com resposta, menção e reações (aparecem no fim da conversa)
  const q1 = (await send(ana, geral.id, 'Quem vai levar o salgadinho na sexta? 🍿')).id;
  const r1 = (await send(bruno, geral.id, 'Eu levo!', { replyTo: q1 })).id;
  const r2 = (await send(caio, geral.id, `<@${A}> eu levo o refri então`, { replyTo: q1 })).id;
  for (const [who, id, e] of [[ana, r1, '❤️'], [caio, r1, '❤️'], [bruno, r1, '😂'], [ana, r2, '👍'], [bruno, q1, '🍿'], [caio, q1, '🍿'], [ana, q1, '🍿']]) await call(who, 'chat:react', { channel: geral.id, id, emoji: e });
  // Anexos: imagem e arquivo
  const img = await upload(ana.acc.token, geral.id, path.join(APP, 'public/og-resenhex.png'), 'print-da-partida.png');
  await send(ana, geral.id, 'Olha o print da vitória 🏆', { attachments: [img.id] });
  const pdf = await upload(bruno.acc.token, geral.id, path.join(APP, 'public/fonts/OFL-Figtree.txt'), 'regras-do-campeonato.txt');
  await send(bruno, geral.id, 'Regras do campeonato aqui', { attachments: [pdf.id] });
  await send(caio, geral.id, `Ei <@${A}>, você viu isso? https://www.youtube.com/watch?v=dQw4w9WgXcQ`);

  // #memes e #jogos com pouca coisa; #jogos vazio fica para o estado vazio
  await send(bruno, memes, 'quando o ping sobe pra 999 no meio da partida 💀');
  await send(caio, memes, 'KKKKKKKK real');

  // DM Ana ↔ Bruno
  const dm = await call(ana, 'dm:open', { userId: B });
  await sleep(300);
  const dmId = dm.id || (ana.last.social?.dms || [])[0]?.id;
  console.log('dm', JSON.stringify(dm).slice(0, 200), dmId);
  if (dmId) {
    await send(ana, dmId, 'Oi Bruno! Vai dar pra ir sexta?');
    await send(bruno, dmId, 'Vai sim! Levo o violão 🎸');
    await send(ana, dmId, 'Perfeito, a galera vai amar');
  }
  fs.writeFileSync(OUT, JSON.stringify({
    base: BASE,
    accounts: { ana: { id: A, token: ana.acc.token }, bruno: { id: B, token: bruno.acc.token }, caio: { id: C, token: caio.acc.token } },
    server: { id: main?.id || st0.serverId, invite }, channels: { geral: geral.id, memes, jogos, salao, voz, voz2 }, dm: dmId,
  }, null, 2));
  console.log('ok');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
