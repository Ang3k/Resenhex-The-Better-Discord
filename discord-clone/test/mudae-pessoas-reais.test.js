const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyFandomBiography, realPeopleExclusions } = require('../tools/mudae-fontes/pessoas-reais');
const { fandom } = require('../tools/mudae-fontes/fandom');
const { preserveRows } = require('../tools/mudae-fontes/coleta');
const { correctCatalog } = require('../tools/mudae-fontes/qualidade');

const box = (header, fields = []) => JSON.stringify([{ data: [
  ...(header ? [{ type: 'header', data: { value: header } }] : []),
  ...fields.map(([source, label, value]) => ({ type: 'data', data: { source, label, value } })),
] }]);
const page = (description, header, fields) => ({ pageprops: { fandomdescription: description, infoboxes: box(header, fields) } });
const row = (id, name, source = 'd') => [id, name, 'Obra', 'https://example.com/a.jpg', '', 10, source];

test('biografias de profissionais saem, mas humanos fictícios e seus intérpretes permanecem distintos', () => {
  for (const description of ['Nancy Cartwright is an American voice actress.', 'John Example (born 1950) is a British historian.', 'John Example is a Japanese television producer.']) {
    assert.equal(classifyFandomBiography(page(description))?.kind, 'biografia_pessoa_real', description);
  }
  assert.ok(classifyFandomBiography(page('Rob is an animation director.', 'Cast/Crew Information')));
  for (const description of ['Dina is a character from The Last of Us.', 'Walter White is a fictional chemistry teacher.', 'Tae Asakura is a character from the Devil Summoner series.']) {
    assert.equal(classifyFandomBiography(page(description, '', [['born', 'Born', '1950'], ['occupation', 'Occupation', 'Historian']])), null, description);
  }
  assert.equal(classifyFandomBiography(page('John is an American historian.', 'Character Information')), null);
  assert.equal(classifyFandomBiography(page('John is an American historian.', '', [['species', 'Species', 'Human']])), null);
  assert.equal(classifyFandomBiography(page('John is an American actor. He is voiced by Phil LaMarr.')), null);
});

test('créditos Voice of identificam o dublador; Voiced by identifica o personagem, sem excluir por menções à equipe', () => {
  const actor = page('Jacob Hopkins is an American actor.', '', [['birthday', 'Born', '2002'], ['voice', 'Voice of', 'Gumball']]);
  const character = page('Jacob Hopkins is an antagonist.', '', [['voice', 'Voiced by', 'Roger Craig Smith']]);
  assert.ok(classifyFandomBiography(actor));
  assert.ok(classifyFandomBiography(page('Jacob Turner Hopkins (born March 4, 2002) is an American actor.', 'Roles', [['born', 'Born', '2002'], ['voice', 'Voice(s)', 'Gumball']])));
  assert.equal(classifyFandomBiography(character), null);
  for (const description of ['The Powerpuff Girls is an American animated television series created by animator Craig McCracken.', 'Penguin is a pet bird owned by American actor John Example.', 'Alice (born 2000) is the adopted daughter of actress Jane Example.']) {
    assert.equal(classifyFandomBiography(page(description)), null, description);
  }
  assert.equal(classifyFandomBiography(page('', '', [])), null);
});

test('coleta e montagem impedem que uma biografia nova volte pelos IDs anteriores ou pelos caches', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mudae-pessoas-'));
  const oldBiography = row('d-fixture-1', 'Dublador');
  const fictional = row('d-fixture-2', 'Dina');
  const collection = {
    cacheDir: directory, report: {}, count() {}, skip() {}, progress() {}, error(unit, err) { throw err; },
    async unit(key) {
      const params = JSON.parse(key.slice(key.indexOf(':') + 1));
      if (params.prop === 'pageimages|pageprops') return { query: { pages: [
        { pageid: 1, title: 'Dublador', original: { source: 'https://example.com/a.jpg' }, ...page('John Example is an American voice actor.') },
        { pageid: 2, title: 'Dina', original: { source: 'https://example.com/b.jpg' }, ...page('Dina is a fictional character.', 'Character Information') },
      ] } };
      if (params.generator) return { query: { pages: [{ pageid: 1, title: 'Dublador', length: 100 }, { pageid: 2, title: 'Dina', length: 20 }] } };
      return { query: { categorymembers: [] } };
    },
    finish(rows) {
      fs.mkdirSync(path.join(directory, 'relatorios'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'relatorios', 'desenhos.json'), JSON.stringify(this.report));
      return rows;
    },
  };
  try {
    const fetched = await fandom({ franchises: [{ wiki: 'fixture', series: 'Obra' }], previous: [oldBiography, fictional], collection });
    assert.deepEqual(fetched.map((r) => r[0]), ['d-fixture-2']);
    const exclusions = realPeopleExclusions(directory);
    assert.ok(exclusions.has('d-fixture-1'));
    const merged = preserveRows([oldBiography, fictional], fetched);
    const result = correctCatalog(merged, { excludedPeopleById: exclusions });
    assert.deepEqual(result.rows.map((r) => r[0]), ['d-fixture-2']);
    assert.equal(result.report.removedRealPeople.length, 1);
    // Um nome igual em outra franquia e fotos de atores nas séries continuam válidos.
    const sameName = row('d-other-3', 'Dublador');
    const walter = row('s1396-17419', 'Walter White', 's');
    assert.deepEqual(correctCatalog([sameName, walter], { excludedPeopleById: exclusions }).rows.map((r) => r[0]), [sameName[0], walter[0]]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
