const test = require('node:test');
const assert = require('node:assert/strict');
const { createDj, MAX_QUEUE, IDLE_MS } = require('../dj');
const { parseSearch, parseDuration, videoIdFrom, youtubeSearch } = require('../youtube');

// Relógio e timers falsos: dá para "avançar" minutos sem esperar.
function clock() {
  let t = 1_000_000;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
  };
}

function setup() {
  const c = clock();
  const changes = [];
  let n = 0;
  const dj = createDj({ newId: () => 'id' + ++n, onChange: (key) => changes.push(key), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  return { dj, c, changes };
}

const song = (videoId, duration = 200, extra = {}) => ({ videoId, title: 'Música ' + videoId, author: 'Canal', duration, live: false, ...extra });
const joao = { id: 'a1', name: 'João' };
const maria = { id: 'a2', name: 'Maria' };

test('a primeira música toca na hora e as outras entram na fila', () => {
  const { dj, c } = setup();
  assert.deepEqual(dj.add('s:sala', song('aaaaaaaaaaa'), joao), { place: 0, title: 'Música aaaaaaaaaaa' });
  assert.deepEqual(dj.add('s:sala', song('bbbbbbbbbbb'), maria), { place: 1, title: 'Música bbbbbbbbbbb' });
  const view = dj.view('s:sala');
  assert.equal(view.current.videoId, 'aaaaaaaaaaa');
  assert.equal(view.current.byName, 'João');
  assert.equal(view.startedAt, c.now());
  assert.equal(view.pausedAt, null);
  assert.deepEqual(view.queue.map((t) => t.videoId), ['bbbbbbbbbbb']);
  assert.match(view.last.text, /Maria adicionou/);
  assert.equal(view.current.alts, undefined, 'as versões alternativas ficam só no servidor');
});

test('a música acaba sozinha no servidor e a próxima começa', () => {
  const { dj, c, changes } = setup();
  dj.add('k', song('aaaaaaaaaaa', 100), joao);
  dj.add('k', song('bbbbbbbbbbb', 100), joao);
  changes.length = 0;
  c.advance(100_000);
  assert.equal(dj.view('k').current.videoId, 'aaaaaaaaaaa', 'espera a folga antes de trocar');
  c.advance(3000);
  assert.equal(dj.view('k').current.videoId, 'bbbbbbbbbbb');
  assert.equal(dj.view('k').startedAt, c.now() - 500);
  assert.deepEqual(changes, ['k']);
  c.advance(103_000);
  assert.equal(dj.view('k'), null, 'a fila acabou');
});

test('pausar guarda o ponto e continuar retoma dele, sem a música acabar no meio da pausa', () => {
  const { dj, c } = setup();
  dj.add('k', song('aaaaaaaaaaa', 60), joao);
  c.advance(20_000);
  dj.pause('k', maria);
  assert.equal(dj.view('k').pausedAt, 20_000);
  c.advance(10 * 60_000);
  assert.equal(dj.view('k').current.videoId, 'aaaaaaaaaaa');
  dj.resume('k', joao);
  assert.equal(dj.view('k').pausedAt, null);
  assert.equal(c.now() - dj.view('k').startedAt, 20_000);
  c.advance(42_000);
  assert.equal(dj.view('k').current.videoId, 'aaaaaaaaaaa');
  c.advance(1000);
  assert.equal(dj.view('k'), null);
});

test('pular, tirar da fila e parar', () => {
  const { dj } = setup();
  dj.add('k', song('aaaaaaaaaaa'), joao);
  dj.add('k', song('bbbbbbbbbbb'), joao);
  dj.add('k', song('ccccccccccc'), joao);
  const second = dj.view('k').queue[0];
  dj.remove('k', second.id, maria);
  assert.throws(() => dj.remove('k', second.id, maria), /já saiu da fila/);
  dj.skip('k', maria);
  assert.equal(dj.view('k').current.videoId, 'ccccccccccc');
  assert.match(dj.view('k').last.text, /Maria pulou “Música aaaaaaaaaaa”/);
  dj.stop('k', joao);
  assert.equal(dj.view('k'), null);
  assert.throws(() => dj.skip('k', joao), /Não tem nenhuma música/);
});

test('a fila tem limite', () => {
  const { dj } = setup();
  dj.add('k', song('aaaaaaaaaaa'), joao);
  for (let i = 0; i < MAX_QUEUE; i++) dj.add('k', song('bbbbbbbbbbb'), joao);
  assert.throws(() => dj.add('k', song('ccccccccccc'), joao), /A fila já tem 50/);
});

test('fim avisado pelos players: só o primeiro aviso conta e só perto do fim', () => {
  const { dj, c } = setup();
  dj.add('k', song('aaaaaaaaaaa', 100), joao);
  dj.add('k', song('bbbbbbbbbbb', 100), joao);
  const first = dj.view('k').current.id;
  c.advance(30_000);
  dj.ended('k', first);
  assert.equal(dj.view('k').current.videoId, 'aaaaaaaaaaa', 'aviso de fim no meio da música é ignorado');
  c.advance(68_000);
  dj.ended('k', first);
  dj.ended('k', first);
  assert.equal(dj.view('k').current.videoId, 'bbbbbbbbbbb');
  assert.deepEqual(dj.view('k').queue, []);
});

test('clipe bloqueado fora do YouTube: troca por outra versão da mesma busca e, sem opções, pula', () => {
  const { dj } = setup();
  dj.add('k', song('aaaaaaaaaaa'), joao, [song('xxxxxxxxxxx'), song('yyyyyyyyyyy')]);
  dj.add('k', song('bbbbbbbbbbb'), joao);
  const blocked = dj.view('k').current.id;
  dj.failed('k', blocked, 5, 's1');
  assert.equal(dj.view('k').current.id, blocked, 'erro do player local não troca a música de todo mundo');
  dj.failed('k', blocked, 150, 's1');
  dj.failed('k', blocked, 150, 's1');
  assert.equal(dj.view('k').current.videoId, 'xxxxxxxxxxx');
  assert.equal(dj.view('k').current.alt, true);
  assert.equal(dj.view('k').current.byName, 'João');
  dj.failed('k', dj.view('k').current.id, 101, 's1');
  assert.equal(dj.view('k').current.videoId, 'yyyyyyyyyyy');
  dj.failed('k', dj.view('k').current.id, 150, 's1');
  assert.equal(dj.view('k').current.videoId, 'bbbbbbbbbbb');
  assert.match(dj.view('k').last.text, /Pulando/);
});

test('bloqueio que só um aparelho vê não troca a música da sala toda', () => {
  const { dj } = setup();
  dj.add('k', song('aaaaaaaaaaa'), joao, [song('xxxxxxxxxxx')]);
  dj.occupancy('k', 3);
  const id = dj.view('k').current.id;
  dj.failed('k', id, 150, 'sock1');
  dj.failed('k', id, 150, 'sock1');
  assert.equal(dj.view('k').current.videoId, 'aaaaaaaaaaa', 'um aparelho (mesmo avisando duas vezes) não basta');
  dj.failed('k', id, 101, 'sock2');
  assert.equal(dj.view('k').current.videoId, 'xxxxxxxxxxx', 'a maior parte da sala avisou');
  dj.occupancy('k', 2);
  dj.failed('k', dj.view('k').current.id, 150, 'sock1');
  assert.equal(dj.view('k').current.videoId, 'xxxxxxxxxxx', 'com duas pessoas, precisa das duas');
});

test('link sem duração: o primeiro player informa e o fim passa a ser automático', () => {
  const { dj, c } = setup();
  dj.add('k', song('aaaaaaaaaaa', null), joao);
  const id = dj.view('k').current.id;
  dj.measured('k', id, -1);
  dj.measured('k', id, 61.4);
  dj.measured('k', id, 999);
  assert.equal(dj.view('k').current.duration, 61);
  c.advance(64_000);
  assert.equal(dj.view('k'), null);
});

test('ao vivo não acaba sozinho, só quando o player avisa', () => {
  const { dj, c } = setup();
  dj.add('k', song('aaaaaaaaaaa', null, { live: true }), joao);
  c.advance(5 * 60 * 60_000);
  const id = dj.view('k').current.id;
  dj.measured('k', id, 100);
  assert.equal(dj.view('k').current.duration, null);
  dj.ended('k', id);
  assert.equal(dj.view('k'), null);
});

test('sala vazia: o DJ segura o ponto, volta sozinho se a turma voltar e esquece depois de 5 minutos', () => {
  const { dj, c, changes } = setup();
  dj.add('k', song('aaaaaaaaaaa', 300), joao);
  c.advance(10_000);
  dj.occupancy('k', 0);
  assert.equal(dj.view('k').pausedAt, 10_000);
  assert.equal(dj.view('k').held, true);
  c.advance(60_000);
  dj.occupancy('k', 0);
  dj.occupancy('k', 1);
  assert.equal(dj.view('k').pausedAt, null);
  assert.equal(c.now() - dj.view('k').startedAt, 10_000);

  dj.pause('k', joao);
  dj.occupancy('k', 0);
  dj.occupancy('k', 2);
  assert.equal(dj.view('k').pausedAt, 10_000, 'pausa de alguém continua pausa quando a sala volta');

  dj.occupancy('k', 0);
  changes.length = 0;
  c.advance(IDLE_MS);
  assert.equal(dj.view('k'), null);
  assert.deepEqual(changes, ['k']);
  assert.deepEqual(dj.keys(), []);
});

test('busca: lê os resultados de vídeo, inclusive ao vivo, e ignora o resto', () => {
  const video = (videoId, title, length, extra = {}) => ({ videoRenderer: {
    videoId, title: { runs: [{ text: title }] }, ownerText: { runs: [{ text: 'Canal ' + videoId }] },
    ...(length ? { lengthText: { simpleText: length } } : {}), ...extra } });
  const json = { contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
    { itemSectionRenderer: { contents: [
      { adSlotRenderer: { videoId: 'ad123456789' } },
      video('ePjtnSPFWK8', 'Chitãozinho & Xororó - Evidências', '4:41'),
      video('jfKfPfyJRdk', 'lofi hip hop radio', null, { badges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW' } }] }),
      video('ePjtnSPFWK8', 'Repetido', '4:41'),
      video('bad', 'Id inválido', '1:00'),
      video('Y59pC4FcBxM', 'Longa', '1:02:03'),
      { shelfRenderer: { title: 'Outros' } },
    ] } },
  ] } } } } };
  assert.deepEqual(parseSearch(json), [
    { videoId: 'ePjtnSPFWK8', title: 'Chitãozinho & Xororó - Evidências', author: 'Canal ePjtnSPFWK8', duration: 281, live: false },
    { videoId: 'jfKfPfyJRdk', title: 'lofi hip hop radio', author: 'Canal jfKfPfyJRdk', duration: null, live: true },
    { videoId: 'Y59pC4FcBxM', title: 'Longa', author: 'Canal Y59pC4FcBxM', duration: 3723, live: false },
  ]);
  assert.equal(parseDuration('0:07'), 7);
  assert.equal(parseDuration('AO VIVO'), null);
});

test('links do YouTube viram o id do vídeo', () => {
  for (const link of ['https://www.youtube.com/watch?v=ePjtnSPFWK8&list=RD', 'https://youtu.be/ePjtnSPFWK8?si=x', 'https://m.youtube.com/shorts/ePjtnSPFWK8',
    'https://music.youtube.com/watch?v=ePjtnSPFWK8', 'https://www.youtube.com/live/ePjtnSPFWK8', 'https://www.youtube-nocookie.com/embed/ePjtnSPFWK8']) {
    assert.equal(videoIdFrom(link), 'ePjtnSPFWK8', link);
  }
  for (const text of ['evidências', 'https://example.com/watch?v=ePjtnSPFWK8', 'https://youtube.com/watch?v=curto', 'javascript:alert(1)']) assert.equal(videoIdFrom(text), null, text);
});

test('busca guarda o resultado, só deixa tocar o que buscou e oferece outras versões', async () => {
  const calls = [];
  const video = (videoId) => ({ videoRenderer: { videoId, title: { runs: [{ text: 'T ' + videoId }] }, lengthText: { simpleText: '3:00' } } });
  const fetch = async (url, init) => {
    calls.push(JSON.parse(init.body).query);
    return { ok: true, json: async () => ({ contents: [video('aaaaaaaaaaa'), video('bbbbbbbbbbb'), video('ccccccccccc')] }) };
  };
  const yt = youtubeSearch({ fetch });
  const items = await yt.search('  Evidências   AO vivo ');
  assert.equal(items.length, 3);
  await yt.search('evidências ao vivo');
  assert.deepEqual(calls, ['evidências ao vivo'], 'a mesma busca vem do cache');
  assert.equal(yt.known('bbbbbbbbbbb').title, 'T bbbbbbbbbbb');
  assert.equal(yt.known('zzzzzzzzzzz'), null);
  assert.deepEqual(yt.alternatives('Evidências ao vivo', 'bbbbbbbbbbb').map((t) => t.videoId), ['aaaaaaaaaaa', 'ccccccccccc']);
  await assert.rejects(yt.search('   '), /Digite o nome/);
});

test('link colado: acha pelo id; o oEmbed avisa quando o dono bloqueou fora do YouTube', async () => {
  const blocked = youtubeSearch({ fetch: async (url) => (String(url).includes('oembed')
    ? { ok: false, status: 401 } : { ok: true, json: async () => ({}) }) });
  await assert.rejects(blocked.search('https://youtu.be/ePjtnSPFWK8'), /não deixa ele tocar fora do YouTube/);
  const titled = youtubeSearch({ fetch: async (url) => (String(url).includes('oembed')
    ? { ok: true, status: 200, json: async () => ({ title: 'Evidências', author_name: 'ClassicoVEVO' }) } : { ok: true, json: async () => ({}) }) });
  assert.deepEqual(await titled.search('https://youtu.be/ePjtnSPFWK8'), [{ videoId: 'ePjtnSPFWK8', title: 'Evidências', author: 'ClassicoVEVO', duration: null, live: false }]);
});
