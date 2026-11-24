const test = require('node:test');
const assert = require('node:assert/strict');
const { montar, fotoDe } = require('../tools/mudae-fontes/vndb');
const { validateRows } = require('../tools/mudae-fontes/coleta');
const { parseInfo, semSufixo, roletaDe } = require('../tools/mudae-comparar-wiki');

// Uma tabela no formato COPY do PostgreSQL: cabeçalho de colunas + linhas separadas por tab, \N = nulo.
const table = (cols, rows) => ({ cols, text: rows.map((r) => r.map((v) => (v === null ? '\\N' : v)).join('\t')).join('\n') + '\n' });

function fixture() {
  return {
    chars: table(['id', 'image', 'main', 'sex', 'gender', 'age'], [
      ['c1', 'ch1', null, 'f', null, null], // aceito
      ['c2', 'ch102', null, 'm', 'f', '30'], // "gender" vence "sex"
      ['c3', null, null, 'f', null, null], // sem imagem
      ['c4', 'ch4', 'c1', 'f', null, null], // variante de outro personagem
      ['c5', 'ch5', null, 'f', null, null], // imagem explícita
      ['c6', 'ch6', null, 'f', null, null], // só aparece em VN adulta
      ['c7', 'ch7', null, 'b', null, null], // sexo "b" não vira gênero
      ['c8', 'ch8', null, 'f', null, '16'], // menor em VN adulta
      ['c9', 'ch9', null, 'f', null, null], // traço de criança em VN adulta
      ['c10', 'ch10', null, 'f', null, '10'], // menor em VN comum, imagem segura: fica
    ]),
    chars_names: table(['id', 'lang', 'name', 'latin'], [
      ['c1', 'ja', 'フォーニ', 'Phorni'], ['c2', 'ja', '渡良瀬 準', 'Watarase Jun'], ['c2', 'en', 'Jun Watarase', null],
      ['c4', 'ja', 'x', 'X'], ['c5', 'ja', 'y', 'Y'], ['c6', 'ja', 'z', 'Z'], ['c7', 'ja', 'w', 'W'], ['c8', 'ja', 'm', 'M8'], ['c9', 'ja', 'n', 'N9'], ['c10', 'ja', 'o', 'O10'],
    ]),
    chars_vns: table(['id', 'vid', 'role'], [
      ['c1', 'v1', 'side'], ['c1', 'v2', 'primary'], ['c2', 'v1', 'primary'], ['c5', 'v1', 'primary'], ['c6', 'v3', 'primary'], ['c7', 'v1', 'appears'], ['c8', 'v3', 'primary'], ['c9', 'v3', 'primary'], ['c10', 'v1', 'primary'],
    ]),
    images: table(['id', 'c_sexual_avg', 'c_violence_avg', 'c_votecount'], [
      ['ch1', '0', '0', '5'], ['ch102', '10', '0', '5'], ['ch4', '0', '0', '5'], ['ch5', '200', '0', '5'], ['ch6', '0', '0', '5'], ['ch7', '0', '0', '5'], ['ch8', '0', '0', '5'], ['ch9', '0', '0', '5'], ['ch10', '0', '0', '5'],
    ]),
    vn: table(['id', 'olang', 'c_votecount'], [['v1', 'ja', '1000'], ['v2', 'ja', '50'], ['v3', 'ja', '9000']]),
    vn_titles: table(['id', 'lang', 'official', 'title', 'latin'], [
      ['v1', 'ja', 't', 'ネコ', 'Neko'], ['v1', 'en', 't', "Let's Meow", null], ['v2', 'ja', 't', 'ふたつ', 'Futatsu'], ['v3', 'ja', 't', 'アダルト', 'Adult Game'],
    ]),
    chars_traits: table(['id', 'tid'], [['c9', 'i856'], ['c1', 'i1']]),
    releases: table(['id', 'minage'], [['r1', '0'], ['r2', '18'], ['r3', null]]),
    releases_vn: table(['id', 'vid', 'rtype'], [['r1', 'v1', 'complete'], ['r2', 'v3', 'complete'], ['r3', 'v2', 'complete']]),
  };
}

test('VNDB: a miniatura vem dos dois últimos dígitos do número da imagem', () => {
  assert.equal(fotoDe('ch175652'), 'https://t.vndb.org/ch/52/175652.jpg');
  assert.equal(fotoDe('ch34'), 'https://t.vndb.org/ch/34/34.jpg');
  assert.equal(fotoDe('ch5'), 'https://t.vndb.org/ch/05/5.jpg');
});

test('VNDB: monta linhas de 7 colunas e descarta o que não serve, dizendo por quê', () => {
  const { rows, report } = montar(fixture());
  validateRows(rows, 'v');
  assert.deepEqual(rows.map((r) => r[0]).sort(), ['vndb1', 'vndb10', 'vndb2', 'vndb7']);
  assert.deepEqual(report.descartados, { semImagem: 1, variante: 1, imagemSexual: 1, vnAdulta: 3 });
  assert.equal(report.vnsAdultas, 1);
});

test('VNDB: nome, obra, gênero e score vêm das regras documentadas', () => {
  const { rows } = montar(fixture());
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  // c1: o papel "primary" na VN de 50 votos (50) perde para "side" na de 1000 votos (400); fica a VN com mais peso.
  assert.equal(by.vndb1[1], 'Phorni');
  assert.equal(by.vndb1[2], "Let's Meow");
  assert.equal(by.vndb1[5], 400);
  assert.equal(by.vndb1[4], 'F');
  // c2: o nome em inglês vence o romanizado; "gender" vence "sex".
  assert.equal(by.vndb2[1], 'Jun Watarase');
  assert.equal(by.vndb2[4], 'F');
  assert.equal(by.vndb2[5], 1000);
  // c7: sexo "b" não vira gênero; papel "appears" pesa 0,1.
  assert.equal(by.vndb7[4], '');
  assert.equal(by.vndb7[5], 100);
  assert.equal(by.vndb1[6], 'v');
});

test('VNDB: --incluir-adulto traz de volta as VNs 18+ e a letra de fonte é configurável', () => {
  const { rows } = montar(fixture(), { incluirAdulto: true, source: 'g' });
  assert.ok(rows.some((r) => r[0] === 'vndb6' && r[2] === 'Adult Game' && r[6] === 'g'));
});

test('VNDB: no modo máximo entra o conteúdo adulto, mas menores de idade continuam de fora dele', () => {
  const { rows, report, extras } = montar(fixture(), { incluirAdulto: true, maxSexual: 200, maxViolence: 200 });
  const ids = rows.map((r) => r[0]);
  assert.ok(ids.includes('vndb5'), 'imagem explícita entra no modo máximo');
  assert.ok(ids.includes('vndb6'), 'VN adulta entra no modo máximo');
  assert.ok(!ids.includes('vndb8') && !ids.includes('vndb9'), 'idade < 18 ou traço de criança em VN adulta não entra');
  assert.ok(ids.includes('vndb10'), 'menor em obra e imagem seguras não é afetado');
  assert.equal(report.descartados.menorEmConteudoAdulto, 2);
  assert.deepEqual(extras.find((e) => e.id === 'vndb6'), { id: 'vndb6', adulto: true, sexual: 0, violencia: 0 });
  assert.equal(extras.find((e) => e.id === 'vndb5').sexual, 200);
});

test('VNDB: ordena do score maior para o menor e não repete id', () => {
  const { rows } = montar(fixture());
  assert.deepEqual(rows.map((r) => r[5]), [...rows.map((r) => r[5])].sort((a, b) => b - a));
  assert.equal(new Set(rows.map((r) => r[0])).size, rows.length);
});

test('wiki do Mudae: lê o template Character Info com o "}}" na última linha de campo', () => {
  const text = '{{WIP}}\n{{Character Info\n|name = 2B\n|series = NieR: Automata\n|gender = Female\n|roulette = Game & Animanga roulette\n|aliases = YoRHa No.2 Type B, 2E\n|images =  <gallery>\n2B1.png|1\n</gallery>}}\n{{Character Intro}}';
  assert.deepEqual(parseInfo(text, '2B'), { name: '2B', series: 'NieR: Automata', gender: 'Female', roulette: 'ambas', aliases: ['YoRHa No.2 Type B', '2E'], serieSuspeita: false });
  const last = '{{Character Info\n|name = X\n|series = Y\n|images = <gallery>\na.png|1\n</gallery>\n|gender = Male\n|roulette = Animanga}}\ntexto da página que não é campo';
  const info = parseInfo(last, 'X');
  assert.equal(info.roulette, 'animanga');
  assert.equal(info.gender, 'Male');
});

test('wiki do Mudae: sem "name" usa o título da página; sem template devolve null', () => {
  assert.equal(parseInfo('{{Character Info\n|series = Naruto\n|roulette = Animanga}}', 'Naruto Uzumaki').name, 'Naruto Uzumaki');
  assert.equal(parseInfo('só texto', 'Qualquer'), null);
});

test('wiki do Mudae: tira o sufixo de desambiguação e normaliza a roleta', () => {
  assert.equal(semSufixo('Maya (AL)'), 'Maya');
  assert.equal(semSufixo('Absorbing Man (Carl Creel)'), 'Absorbing Man');
  assert.equal(semSufixo('Rem'), 'Rem');
  for (const [raw, want] of [['Game roulette', 'games'], ['Animanga', 'animanga'], ['Animange roulette', 'animanga'], ['Game & Animanga', 'ambas'], ['', '(vazia)']]) assert.equal(roletaDe(raw), want, raw);
});
