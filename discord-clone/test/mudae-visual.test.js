// Imagens extras, título, cor, textos de casamento e a ordem por arrastar do álbum.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, CLAIM_RESET_MS } = require('../server/mudae');
const { imageLink, IMG_MAX } = require('../server/mudae-visual');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
];
const LINK = (n) => `https://i.imgur.com/Abc${String(n).padStart(3, '0')}x.png`;

function setup({ random = () => 0, mine = [1, 2, 3, 4] } = {}) {
  let t = 10 * CLAIM_RESET_MS + 1000;
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random, refSize: CATALOG.length });
  const store = { claims: {}, usage: {} };
  for (const id of mine) { t += CLAIM_RESET_MS; mudae.claim(store, 'a', id, { revealAt: t }); }
  return { mudae, store, visual: mudae.visual, tools: mudae.haremTools };
}
const imageOf = (mudae, store, name = 'Satoru Gojou') => mudae.album(store, 'a').chars.find((c) => c.name === name).image;

test('imageLink: qualquer link http(s) público', () => {
  assert.equal(imageLink('https://i.imgur.com/AbC123x.png'), 'https://i.imgur.com/AbC123x.png');
  assert.equal(imageLink(' https://i.imgur.com/AbC123x.JPEG '), 'https://i.imgur.com/AbC123x.JPEG');
  assert.equal(imageLink('https://i.imgur.com/AbC123x.png?x=1#y'), 'https://i.imgur.com/AbC123x.png', 'no imgur a busca e o # saem');
  assert.equal(imageLink('https://cdn.site.com/a/b.webp?w=300#topo'), 'https://cdn.site.com/a/b.webp?w=300', 'nos outros só o # sai');
  assert.equal(imageLink('http://exemplo.com.br/foto'), 'http://exemplo.com.br/foto');
  for (const bad of ['https://i.imgur.com/AbC123x', 'https://i.imgur.com/a/AbC123x.png', 'https://user:pw@site.com/a.png', 'https://site.com:22/a.png',
    'javascript:alert(1)', 'ftp://site.com/a.png', 'https://127.0.0.1/a.png', 'http://localhost/a.png', 'https://[::1]/a.png', 'https://intranet/a.png',
    'https://x.local/a.png', '/mudae-img/' + 'ab'.repeat(32) + '.png', '/avatars/a.png', 'https://site.com/' + 'a'.repeat(600), '', 'lixo']) {
    assert.equal(imageLink(bad), null, bad);
  }
});

test('links de fora (menos imgur) aparecem pelo proxy do servidor', () => {
  const mudae = createMudae({ catalog: CATALOG, now: () => 10 * CLAIM_RESET_MS, refSize: CATALOG.length, showImage: (u) => '/link-image?u=' + encodeURIComponent(u) });
  const store = { claims: {}, usage: {} };
  mudae.claim(store, 'a', 1, { revealAt: 10 * CLAIM_RESET_MS });
  const local = '/mudae-img/' + 'cd'.repeat(32) + '.gif';
  assert.equal(mudae.visual.addImage(store, 'a', `Gojo $ https://site.com/g.png $ ${LINK(1)}`).added, 2);
  assert.deepEqual(mudae.album(store, 'a').chars[0].images.list, ['/link-image?u=' + encodeURIComponent('https://site.com/g.png'), LINK(1)]);
  mudae.visual.changeImage(store, 'a', 'Gojo $ 2');
  assert.equal(mudae.album(store, 'a').chars[0].image, '/link-image?u=' + encodeURIComponent('https://site.com/g.png'));
  assert.equal(store.images['1'].list[0], 'https://site.com/g.png', 'o store guarda o link original');
});

test('$addimg e $changeimg: a imagem escolhida vale no álbum, no harém e no favorito', () => {
  const { mudae, store, visual } = setup();
  const original = imageOf(mudae, store);
  assert.deepEqual(visual.addImage(store, 'a', `Gojo $ ${LINK(1)} $ ${LINK(2)}`), { name: 'Satoru Gojou', count: 2, added: 2 });
  assert.equal(imageOf(mudae, store), original, 'adicionar não troca a imagem');
  assert.equal(visual.addImage(store, 'a', `Gojo $ ${LINK(1)}`).added, 0, 'link repetido não entra de novo');

  assert.equal(visual.changeImage(store, 'a', 'Gojo $ 3').pick, 3);
  assert.equal(imageOf(mudae, store), LINK(2));
  assert.equal(mudae.harem(store, 'a').chars.find((c) => c.name === 'Satoru Gojou').image, LINK(2));
  assert.equal(mudae.album(store, 'a').favorite.image, LINK(2), 'o mais valioso aparece com a imagem escolhida');
  assert.equal(mudae.info(store, 'Gojo').card.image, LINK(2));
  visual.changeImage(store, 'a', 'Gojo $ 1');
  assert.equal(imageOf(mudae, store), original, 'a 1 é a original');
});

test('$addimg: erros, limite e remoção', () => {
  const { mudae, store, visual } = setup();
  assert.match(visual.addImage(store, 'a', '').error, /Diga o nome/);
  assert.match(visual.addImage(store, 'a', 'Gojo').error, /Falta o link/);
  assert.match(visual.addImage(store, 'a', 'Gojo $ http://localhost/a.png').error, /não serve/);
  assert.match(visual.addImage(store, 'a', `Naruto $ ${LINK(1)}`).error, /não tem ninguém/);
  assert.match(visual.addImage(store, 'b', `Gojo $ ${LINK(1)}`).error, /não tem ninguém/, 'só o dono mexe nas imagens');
  assert.match(visual.changeImage(store, 'a', 'Gojo $ 2').error, /só tem a foto original/);

  const links = Array.from({ length: IMG_MAX }, (_, i) => LINK(i)).join(' $ ');
  assert.equal(visual.addImage(store, 'a', `Gojo $ ${links}`).count, IMG_MAX);
  assert.match(visual.addImage(store, 'a', `Gojo $ ${LINK(99)}`).error, /no máximo 12/);
  assert.match(visual.changeImage(store, 'a', 'Gojo $ 99').error, /Diga a posição/);

  visual.changeImage(store, 'a', 'Gojo $ 4');
  assert.deepEqual(visual.addImage(store, 'a', 'remove Gojo $ 2'), { name: 'Satoru Gojou', count: IMG_MAX - 1, removed: 1 });
  assert.equal(store.images[1].pick, 3, 'a escolhida acompanha a lista quando uma anterior sai');
  assert.match(visual.addImage(store, 'a', 'remove Gojo $ 1').error, /Diga a posição/, 'a original não sai');
  assert.equal(visual.addImage(store, 'a', 'removeall Gojo').removed, IMG_MAX - 1);
  assert.equal(store.images, undefined, 'sem extras, nada fica guardado');
});

test('as imagens saem quando o personagem muda de dono', () => {
  const { mudae, store, visual } = setup();
  for (const name of ['Gojo', 'Mikasa', 'Zero']) visual.addImage(store, 'a', `${name} $ ${LINK(1)}`);
  visual.changeImage(store, 'a', 'Gojo $ 2');
  mudae.give(store, 'a', 'b', 'Gojo');
  mudae.divorce(store, 'a', 'Mikasa');
  assert.deepEqual(Object.keys(store.images), ['3']);
  assert.equal(mudae.album(store, 'b').chars[0].image.includes('imgur'), false, 'quem recebe não herda a imagem');
  mudae.releaseAll(store, 'a');
  assert.equal(store.images, undefined);
});

test('$randomimg: sorteia entre a original e as extras só para quem ligou', () => {
  let pick = 0;
  const { mudae, store, visual } = setup({ random: () => pick, mine: [] });
  const c = { id: 1 };
  store.claims[1] = { ownerId: 'a', at: 1 };
  store.images = { 1: { list: [LINK(1), LINK(2)], pick: 1 } };
  const base = 'https://base/x.png';
  assert.equal(visual.imageFor(store, 1, base), base);
  pick = 0.5; assert.equal(visual.imageFor(store, 1, base, { random: true }), LINK(1));
  pick = 0.99; assert.equal(visual.imageFor(store, 1, base, { random: true }), LINK(2));
  pick = 0; assert.equal(visual.imageFor(store, 1, base, { random: true }), base);
  assert.equal(visual.imageFor(store, 9, base, { random: true }), base, 'sem extras, sempre a original');
  assert.ok(mudae && c);
});

test('título, cor e textos: validação e padrão', () => {
  const { mudae, store, visual } = setup({ mine: [1] });
  assert.deepEqual(visual.rename(store, 'a', '  Meu   cantinho  '), { title: 'Meu cantinho' });
  assert.deepEqual(mudae.harem(store, 'a').look, { title: 'Meu cantinho' });
  assert.equal(visual.rename(store, 'a', 'x'.repeat(100)).title.length, 40);
  assert.match(visual.rename(store, 'a', '').error, /Diga o título/);
  assert.deepEqual(visual.rename(store, 'a', 'none'), { title: null });
  assert.equal(store.prefs, undefined, 'voltar ao padrão não deixa lixo no banco');

  assert.deepEqual(visual.color(store, 'a', '#AABBCC'), { color: '#aabbcc' });
  assert.deepEqual(visual.color(store, 'a', 'ff4d94'), { color: '#ff4d94' });
  for (const bad of ['rosa', '#fff', '#gggggg', 'red;x', '#ff4d94; background:url(x)']) assert.match(visual.color(store, 'a', bad).error, /hexadecimal/, bad);
  assert.deepEqual(mudae.album(store, 'a').look, { color: '#ff4d94' });

  assert.equal(visual.messageText(store, 'a', 'claimText', '{usuario} ama {personagem}').text, '{usuario} ama {personagem}');
  assert.match(visual.messageText(store, 'a', 'claimText', 'só texto').error, /precisa ter/);
  assert.match(visual.messageText(store, 'a', 'claimText', '{personagem} {nome}').error, /Não conheço \*\*\{nome\}\*\*/);
  assert.equal(visual.messageText(store, 'a', 'claimText', '<b>{personagem}</b>').text, '<b>{personagem}</b>', 'o HTML fica como texto: o cliente só usa textContent');
  assert.equal(visual.messageText(store, 'a', 'claimText', 'x{personagem}'.repeat(60)).text.length <= 120, true);
  assert.equal(visual.messageText(store, 'a', 'claimText', 'none').text, null);
  assert.equal(visual.prefsOf(store, 'a').claimText, undefined);
  assert.equal(visual.prefsOf(store, 'zzz').claimText, undefined);
});

test('álbum: gênero em cada carta e a marca de ordem guardada', () => {
  const { mudae, store, tools } = setup();
  const chars = mudae.album(store, 'a').chars;
  assert.equal(chars.find((c) => c.name === 'Mikasa Ackerman').gender, 'F');
  assert.equal(chars.find((c) => c.name === 'Satoru Gojou').gender, 'M');
  assert.equal(chars.find((c) => c.name === 'Kyubey').gender, '');
  assert.equal(mudae.album(store, 'a').ordered, false);
  tools.sort(store, 'a', 'name');
  assert.equal(mudae.album(store, 'a').ordered, true);
});

test('mudae:order (setOrder) e mudae:note (noteById): só cartas suas, sem repetir', () => {
  const { mudae, store, tools } = setup();
  const first = mudae.album(store, 'a').chars.map((c) => c.id);
  assert.deepEqual(first, [1, 2, 3, 4]);
  assert.deepEqual(tools.setOrder(store, 'a', ['4', 3, 3, 'lixo', 99]), { total: 4 });
  assert.deepEqual(mudae.album(store, 'a').chars.map((c) => c.id), [4, 3, 1, 2], 'quem ficou de fora segue no fim, na ordem de antes');
  assert.deepEqual(tools.setOrder(store, 'a', 'não é lista'), { total: 4 });
  assert.deepEqual(mudae.album(store, 'a').chars.map((c) => c.id), [4, 3, 1, 2], 'pedido inválido não bagunça a ordem');
  assert.equal(store.stats.a.organized, 2);

  assert.equal(tools.noteById(store, 'a', 1, '  oi  \n você ').text, 'oi você');
  assert.match(tools.noteById(store, 'b', 1, 'x').error, /não é seu/);
  assert.match(tools.noteById(store, 'a', 'nao-existe', 'x').error, /não é seu/);
  assert.equal(tools.noteById(store, 'a', 1, '').text, '');
  assert.equal(store.notes, undefined);
});
