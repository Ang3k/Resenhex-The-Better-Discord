const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { conferir, marcarForaDaRoleta, lerFichas, lerEpisodios } = require('../tools/mudae-fontes/limpeza');
const { normalize } = require('../tools/mudae-fontes/coleta');

const wiki = (host, file) => `https://static.wikia.nocookie.net/${host}/images/0/00/${file}/revision/latest/scale-to-width-down/400`;
// Personagens de verdade do catálogo de 30/10/2026, com a ficha e a frase da wiki que o cache tinha.
const EXEMPLOS = [
  [['d-adventuretime-157520', 'T.V.', 'Hora de Aventura', wiki('adventuretime', 'TVdefault.png'), 'M', 50, 'd'],
    { cats: ['Pups', 'Recurring Characters', 'Dogs', 'Characters'], fields: ['name', 'gender', 'species', 'occup', 'relatives'],
      desc: "T.V. is a pup and middle sibling of Jake and Lady Rainicorn's five children." }],
  [['d-powerpuffgirls-12693', 'DC The Powerpuff Girls Issue 20', 'As Meninas Superpoderosas', wiki('powerpuff', 'Bow_Jest_HQ.jpg'), '', 49, 'd'],
    { cats: ['1998 series'], fields: [], desc: '' }],
  [['d-disney-55388', 'Chip and Dale', "Mickey's Once Upon a Christmas", wiki('disney', 'ChipAndDale.png'), 'M', 48, 'd'],
    { cats: ['Anti-heroes', 'Chipmunks', 'Anthropomorphic characters'], fields: ['films', 'shorts', 'voice'],
      desc: "Chip and Dale are a pair of anthropomorphic chipmunks, who made their debut in 1943's Private Pluto." }],
  [['d-simpsons-7632', 'Ann Landers', 'Os Simpsons', wiki('simpsons', 'Ann_Landers.png'), 'F', 47, 'd'],
    { cats: ['Real world characters', 'Female characters', 'Characters'], fields: ['sex', 'hair', 'job', 'voiced by'],
      desc: 'Ann Landers and her identical twin sister Dear Abby were popular syndicated advice columnists.' }],
  [['d-futurama-15008', 'Floyd Farnsworth', 'Futurama', wiki('enfuturama', 'Mentioned.png'), 'M', 46, 'd'],
    { cats: ['Humans', 'Characters'], fields: ['age', 'species', 'job'], desc: 'Floyd Farnsworth Ph.D. is the son of Ned and Velma Farnsworth.' }],
  [['g-zelda-5975', 'Ice Keese', 'The Legend of Zelda', wiki('zelda_gamepedia_en', 'Ice_Keese_Echo.png'), '', 50, 'g'],
    { cats: [], fields: ['race', 'habitat', 'health', 'attack'],
      desc: 'Ice Keese are recurring Enemys in The Legend of Zelda series.[1][2] They are a variation of the Keese.' }],
  [['g-zelda-100835', 'Lakna Rokee Shrine', 'The Legend of Zelda', wiki('zelda_gamepedia_en', 'BotW_Blessing_Shrine_Interior_5.png'), '', 49, 'g'],
    { cats: ['Ancient Shrines', 'Locations', 'Shrines'], fields: ['location', 'game', 'item', 'quest'],
      desc: 'The Lakna Rokee Shrine,[1] designated by the Trial name Lakna Rokee\'s Blessing,[1] is an Ancient Shrine in Breath of the Wild.' }],
  [['g-zelda-200', 'Beedle', 'The Legend of Zelda', wiki('zelda_gamepedia_en', 'Beedle.png'), 'M', 48, 'g'],
    { cats: ['Shopkeepers'], fields: [], desc: 'Beedle is a recurring merchant NPC in The Legend of Zelda series.' }],
  [['g-apexlegends-1731', 'Wattson', 'Apex Legends', wiki('apexlegends_gamepedia_en', 'Wattson_icon_tier1.png'), 'F', 47, 'g'],
    { cats: ['Legends', 'Locked legends'], fields: [], desc: 'Wattson is a Controller Legend. She was introduced in Season 2.' }],
  [['g-sonic-20203', 'Sonic Sem Foto', 'Sonic', wiki('sonic', 'No_image.png'), 'M', 46, 'g'], { cats: ['Characters'], fields: ['species'], desc: '' }],
  [['c12123', 'Hitman', 'DC Comics', 'https://comicvine.gamespot.com/a/uploads/scale_large/12/124259/10190531-1000194560.jpg', 'M', 50, 'c']],
  [['s84958-1674162-378b1ce10441', 'Time Keepers', 'Loki', 'https://image.tmdb.org/t/p/w342/nsxnMbkl9Lpc12AmYwKi9SmsJ7e.jpg', 'M', 50, 's']],
  [['s1413-34847-cdd9c40f8c3e', 'Serena Belinda', 'American Horror Story', 'https://image.tmdb.org/t/p/w342/rUK616pPe8VGvAK0qmKOEbA3iIx.jpg', 'F', 49, 's']],
  [['s1416-156689', "Shannon's Mom", "Grey's Anatomy", 'https://image.tmdb.org/t/p/w342/lXpxXSuLtOxSTOLZ6KKqdE8XnK1.jpg', 'F', 48, 's']],
];
const EPISODIOS = { 's84958-1674162-378b1ce10441': { eps: 1 }, 's1413-34847-cdd9c40f8c3e': { eps: 1 }, ['s1416-156689|' + normalize("Shannon's Mom")]: { eps: 1 } };
// Os mais populares de cada fonte (sem ficha): os exemplos ficam fora do terço mais conhecido.
const FAMOSOS = ['d', 'g', 'c', 's'].flatMap((s) => Array.from({ length: 30 }, (_, i) => [s + '-famoso-' + i, 'Famoso ' + i, 'Obra', 'https://example.com/' + s + i + '.png', 'F', 1000 - i, s]));
const ROWS = [...FAMOSOS, ...EXEMPLOS.map(([r]) => r)];
const FICHAS = Object.fromEntries(EXEMPLOS.filter(([, f]) => f).map(([r, f]) => [r[0], f]));

test('limpeza: tira o que não é personagem e deixa os personagens', () => {
  const marcas = conferir(ROWS, { fichas: FICHAS, episodios: EPISODIOS });
  const sai = (name) => marcas.get(String(ROWS.find((r) => r[1] === name)[0]))?.sai || [];
  const duvida = (name) => marcas.get(String(ROWS.find((r) => r[1] === name)[0]))?.revisar || [];
  for (const name of ['T.V.', 'Chip and Dale', 'Ann Landers', 'Beedle', 'Wattson', 'Famoso 0']) assert.deepEqual(sai(name), [], name + ' fica');
  assert.deepEqual(sai('DC The Powerpuff Girls Issue 20'), ['nao_personagem_midia']);
  assert.deepEqual(sai('Ice Keese'), ['tipo_no_plural']);
  assert.deepEqual(sai('Lakna Rokee Shrine'), ['nao_personagem_lugar']);
  assert.deepEqual(sai('Floyd Farnsworth'), ['foto_padrao']);
  assert.deepEqual(sai('Time Keepers'), ['serie_1_episodio']);
  assert.deepEqual(sai("Shannon's Mom"), ['nome_por_relacao', 'serie_1_episodio']);
  // Na dúvida, fica na roleta: codinome de quadrinho, antologia e foto-padrão com outra foto na página.
  assert.deepEqual([sai('Hitman'), duvida('Hitman')], [[], ['nome_generico']]);
  assert.deepEqual([sai('Serena Belinda'), duvida('Serena Belinda')], [[], ['serie_1_episodio']]);
  assert.deepEqual([sai('Sonic Sem Foto'), duvida('Sonic Sem Foto')], [[], ['foto_padrao_tem_outra']]);
});

test('limpeza: marca na 8ª coluna sem perder ninguém e refaz a marca a cada montagem', () => {
  const antes = ROWS.map((r) => (r[1] === 'T.V.' ? [...r, 1] : r)); // marca velha num personagem que fica
  const { rows, report } = marcarForaDaRoleta(antes, { fichas: FICHAS, episodios: EPISODIOS });
  assert.deepEqual(rows.map((r) => r[0]), ROWS.map((r) => r[0]));
  assert.deepEqual(rows.map((r) => r.slice(0, 7)), ROWS);
  const fora = rows.filter((r) => r.length === 8).map((r) => r[1]).sort();
  assert.deepEqual(fora, ['DC The Powerpuff Girls Issue 20', 'Floyd Farnsworth', 'Ice Keese', 'Lakna Rokee Shrine', "Shannon's Mom", 'Time Keepers']);
  assert.ok(rows.filter((r) => r.length === 8).every((r) => r[7] === 1));
  assert.equal(rows.find((r) => r[1] === 'T.V.').length, 7);
  assert.deepEqual([report.total, report.foraDaRoleta, report.naRoleta, report.emDuvida], [ROWS.length, 6, ROWS.length - 6, 3]);
});

test('limpeza: lê fichas e episódios do cache com os IDs do catálogo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mudae-limpeza-'));
  const salva = (sub, nome, key, data) => {
    fs.mkdirSync(path.join(dir, 'consultas', sub), { recursive: true });
    fs.writeFileSync(path.join(dir, 'consultas', sub, nome), JSON.stringify({ key, data }));
  };
  try {
    assert.throws(() => marcarForaDaRoleta(ROWS, { cacheDir: dir }), /consultas\/desenhos/);
    salva('desenhos', 'a.json', 'adventuretime:' + JSON.stringify({ generator: 'categorymembers', gcmtitle: 'Category:Dogs' }), { query: { pages: [{ pageid: 157520 }] } });
    salva('desenhos', 'b.json', 'adventuretime:' + JSON.stringify({ prop: 'pageimages|pageprops' }), { query: { pages: [{ pageid: 157520, pageprops: {
      fandomdescription: 'T.V. is a <b>pup</b>.', infoboxes: JSON.stringify([{ data: [{ type: 'data', data: { source: 'Gender', value: 'Male' } }, { type: 'data', data: { source: 'Vazio', value: '' } }] }]) } }] } });
    salva('jogos-fandom', 'c.json', 'zelda:' + JSON.stringify({ generator: 'categorymembers', gcmtitle: 'Category:Shrines' }), { query: { pages: [{ pageid: 100835 }] } });
    salva('series', 'd.json', 'tv/84958:' + JSON.stringify({ append_to_response: 'aggregate_credits' }), { aggregate_credits: { cast: [{ id: 1674162, roles: [{ character: 'Time Keepers', episode_count: 1 }] }] } });
    assert.deepEqual(lerFichas(dir), { 'd-adventuretime-157520': { cats: ['Dogs'], fields: ['gender'], desc: 'T.V. is a pup.' }, 'g-zelda-100835': { cats: ['Shrines'] } });
    const eps = lerEpisodios(dir);
    assert.deepEqual(eps['s84958-1674162-378b1ce10441'], { eps: 1 }, 'mesmo sufixo do tmdb.js');
    assert.deepEqual(eps['s84958-1674162|time keepers'], { eps: 1 });
    assert.equal(marcarForaDaRoleta(ROWS, { cacheDir: dir }).rows.find((r) => r[1] === 'Time Keepers')[7], 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
