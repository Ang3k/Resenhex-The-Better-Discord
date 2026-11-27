// Harém pelo servidor de verdade: notas, ordem, imagens, textos e divórcio em lote, pelo chat e pelo álbum do Salão.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPatch } = require('../public/state-patch');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, timeout = 3000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-harem-'));
  const catalog = path.join(dir, 'catalogo.json');
  fs.writeFileSync(catalog, JSON.stringify([[40882, 'Eren Yeager', 'Attack on Titan', 'b40882-x.jpg', 'M', 31784]]));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), MUDAE_CATALOG: catalog },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
    proc.stdout.on('data', (data) => { if (String(data).includes('rodando')) { clearTimeout(timer); resolve(); } });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  const clients = [];
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    const exit = new Promise((r) => proc.once('exit', r)); proc.kill(); await exit;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] });
  clients.push(socket);
  socket.on('state', (s) => { socket.last = s; });
  socket.on('state:patch', (p) => applyPatch(socket.last, p));
  socket.messages = [];
  socket.on('chat:message', (m) => socket.messages.push(m.msg));
  socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
  socket.auth = await socket.call('auth', { mode: 'register', name: 'Ana', password: '1234', confirmPassword: '1234' });
  assert.ok(!socket.auth.error, socket.auth.error);
  await wait();
  return socket;
}

test('harém: notas, ordem, imagens, textos, perfil e divórcio em lote pelo servidor', async (t) => {
  const ana = await fixture(t);
  const created = await ana.call('channel', { action: 'create', type: 'mudae', name: 'Salão Mudae' });
  assert.ok(!created.error, created.error);
  const send = async (text) => { await wait(650); return (await ana.call('chat:send', { channel: created.id, text })).ephemeral; }; // o bot limita 8 comandos a cada 5 s
  const botLines = () => ana.messages.filter((m) => m.bot === 'mudae');
  const album = async () => ana.call('mudae:harem', {});

  // Um texto de casamento só nosso, antes de casar.
  assert.equal((await send('$renameclaim {usuario} agora tem {personagem}!')).kind, 'notice');
  assert.match((await send('$renameclaim sem o nome')).text, /precisa ter/);
  assert.match((await send('$renameclaim {personagem} {foo}')).text, /Não conheço/);

  await wait(650);
  await ana.call('chat:send', { channel: created.id, text: '$w' });
  const roll = await eventually(() => { const m = botLines().find((x) => x.mudae.kind === 'roll'); assert.ok(m); return m; });
  await wait(roll.mudae.revealAt - Date.now() + 100);
  assert.ok(!(await ana.call('mudae:claim', { channel: created.id, id: roll.id })).error);
  const married = await eventually(() => { const m = botLines().find((x) => x.mudae.kind === 'married'); assert.ok(m); return m; });
  assert.equal(married.mudae.template, '{usuario} agora tem {personagem}!');

  // Notas pelo chat e pelo álbum.
  assert.match((await send('$note Eren $ meu preferido')).text, /Nota guardada/);
  assert.equal((await album()).chars[0].note, 'meu preferido');
  assert.equal((await ana.call('mudae:note', { charId: 40882, text: 'outra nota' })).text, 'outra nota');
  assert.match((await send('$fn outra')).text, /1.*nota/);
  assert.match((await ana.call('mudae:note', { charId: 999, text: 'x' })).error, /não é seu/);
  assert.equal((await ana.call('mudae:note', { charId: 40882, text: '' })).text, '');
  assert.equal((await album()).chars[0].note, undefined);

  // Ordem: pelo chat e arrastando no álbum; mandar ids de fora não quebra nada.
  assert.match((await send('$sm abc')).text, /de A a Z/);
  assert.equal((await album()).ordered, true);
  assert.deepEqual(await ana.call('mudae:order', { ids: [40882, 40882, 'nao-existe'] }), { total: 1 });
  assert.match((await send('$sm xyz')).text, /Como ordenar/);
  assert.match((await send('$sm valor')).text, /pelo valor/);
  assert.equal((await album()).ordered, false);

  // Filtros do $mm.
  await send('$mm husbandos anime');
  assert.equal(botLines().findLast((x) => x.mudae.kind === 'harem').mudae.total, 1);
  await send('$mm waifus');
  assert.equal(botLines().findLast((x) => x.mudae.kind === 'harem').mudae.total, 0);

  // Imagens extras: qualquer link público (não da rede local); a escolhida aparece no álbum.
  assert.match((await send('$addimg Eren $ http://localhost/a.png')).text, /não serve/);
  assert.match((await send('$addimg Eren $ https://i.imgur.com/AbC123x.png')).text, /ganhou \*\*1\*\*/);
  assert.match((await album()).chars[0].image, /anilist/, 'a escolhida ainda é a original');
  assert.match((await send('$changeimg Eren $ 2')).text, /imagem \*\*2\*\*/);
  assert.equal((await album()).chars[0].image, 'https://i.imgur.com/AbC123x.png');
  assert.match((await send('$randomimg 1')).text, /sorteada/);
  assert.match((await send('$randomimg 7')).text, /Use/);
  await send('$randomimg 0');

  // Título, cor e perfil.
  assert.match((await send('$renameharem Meu cantinho')).text, /Meu cantinho/);
  assert.match((await send('$colormm #FF4D94')).text, /#ff4d94/);
  assert.match((await send('$colormm rosa')).text, /hexadecimal/);
  assert.deepEqual((await album()).look, { title: 'Meu cantinho', color: '#ff4d94' });
  await send('$profile');
  const profile = botLines().findLast((x) => x.mudae.kind === 'profile').mudae;
  assert.equal(profile.total, 1);
  assert.equal(profile.title, 'Meu cantinho');
  assert.equal(profile.stats.claims, 1);

  // Conquistas pelo servidor de verdade: a aba, o $conquistas e o $titulo.
  const ach = await ana.call('mudae:achievements', {});
  assert.equal(ach.total, 100);
  assert.ok(ach.items.length >= 27 && ach.items.every((i) => i.cat && i.name), 'cada trilha vem com nome e categoria');
  assert.equal(ach.items.find((i) => i.trail === 'madrugada').locked, true, 'as escondidas vêm fechadas');
  // A 1ª avaliação foi no primeiro roll (tudo zerado); o $sm e as notas daqui abriram conquistas de verdade, e o kakera já entrou.
  assert.ok(ach.done >= 1 && ach.queue === 0, 'abriu o que a pessoa fez e pagou na hora (cabe no teto do dia)');
  assert.match((await send('$conquistas')).text, new RegExp('Conquistas:'+String.fromCharCode(92)+'*'+String.fromCharCode(92)+'* ' + ach.done + ' de 100'));
  assert.match((await send('$titulo')).text, /Seus títulos:/, 'quem abriu alguma conquista tem título para escolher');
  assert.match((await ana.call('mudae:achievement:title', { key: 'giro:1' })).error, /ainda não abriu/);

  // Divórcio em lote: pede confirmação, e as imagens saem junto.
  assert.match((await send('$divorceall')).text, /\$confirmar/);
  assert.equal((await album()).total, 1, 'ainda não soltou');
  await send('$confirmar');
  const batch = await eventually(() => { const m = botLines().findLast((x) => x.mudae.kind === 'notice'); assert.match(m.mudae.text, /se divorciou de \*\*1\*\*/); return m; });
  assert.ok(batch);
  assert.equal((await album()).total, 0);
  assert.match((await send('$confirmar')).text, /Não há divórcio/);
  assert.match((await send('$divorceall')).text, /vazio/);
});
