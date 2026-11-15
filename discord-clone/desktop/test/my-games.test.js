const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { createGameMatcher, withCustom, cleanCustom } = require('../lib/game-detect');
const { createGameList } = require('../lib/game-list');
const { createMyGames, defaultName } = require('../lib/my-games');
const { EXTRA_GAMES, EXTRA_ARGS } = require('../../server/games');

const JAVA = 'C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\javaw.exe';
const MINECRAFT = '"C:\\Program Files\\Java\\bin\\javaw.exe" -Xmx2G -cp x.jar net.minecraft.client.main.Main --username Steve --version 1.20.1';
const SERVER = { games: [['VALORANT', ['win64/valorant-win64-shipping.exe']], ...EXTRA_GAMES], byArgs: EXTRA_ARGS,
  folders: ['steamapps/common/'], ignore: ['launcher'], ignorePaths: ['steamapps/common/wallpaper_engine/'] };

test('Minecraft Java pela linha de comando, com qualquer Java e qualquer launcher', () => {
  const { match } = createGameMatcher(SERVER);
  assert.deepEqual(match(JAVA, MINECRAFT), { name: 'Minecraft', exact: true }, 'TLauncher ou launcher oficial sem mods');
  assert.equal(match(JAVA, () => '"javaw.exe" -cp forge.jar cpw.mods.bootstraplauncher.BootstrapLauncher --assetsDir C:\\x --assetIndex 5')?.name, 'Minecraft', 'com Forge');
  assert.equal(match('C:\\Java\\bin\\java.exe', 'java net.fabricmc.loader.impl.launch.knot.KnotClient --assetIndex 17')?.name, 'Minecraft', 'com Fabric, pelo java.exe');
  assert.equal(match(JAVA, '"javaw.exe" -jar TLauncher.jar'), null, 'o próprio launcher em Java não é o jogo');
  assert.equal(match(JAVA), null, 'sem a linha de comando (quem chama não leu), não chuta');
  assert.equal(match(JAVA, () => { throw new Error('fechou'); }), null, 'processo que fechou no meio');
  assert.deepEqual(match('C:\\Users\\Steve\\AppData\\Roaming\\.minecraft\\runtime\\java-runtime-gamma\\windows-x64\\java-runtime-gamma\\bin\\javaw.exe'),
    { name: 'Minecraft', exact: true }, 'pelo Java do launcher, mesmo sem ler a linha de comando (apps antigos)');
});

test('a linha de comando só é lida quando o executável precisa', () => {
  const { match } = createGameMatcher(SERVER);
  let reads = 0;
  const line = () => { reads++; return MINECRAFT; };
  match('C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe', line);
  match('C:\\Windows\\explorer.exe', line);
  assert.equal(reads, 0);
  match(JAVA, line);
  assert.equal(reads, 1);
});

test('regras pela linha de comando do Discord (">hl2.exe -game tf") e entradas quebradas', () => {
  const { match } = createGameMatcher({ byArgs: [['Team Fortress 2', 'hl2.exe', ['-game tf']], ["Garry's Mod", 'hl2.exe', ['-game garrysmod']],
    null, ['Sem trecho', 'x.exe', []], ['Sem exe', '', ['a']], [5, 'y.exe', ['a']]] });
  assert.equal(match('D:\\Steam\\hl2.exe', 'hl2.exe -steam -game garrysmod')?.name, "Garry's Mod");
  assert.equal(match('D:\\Steam\\hl2.exe', 'hl2.exe -game tf')?.name, 'Team Fortress 2');
  assert.equal(match('D:\\Steam\\hl2.exe', 'hl2.exe -game outro'), null);
  assert.equal(match('C:\\x.exe', 'x.exe a'), null);
  assert.equal(match('C:\\y.exe', 'y.exe a'), null);
});

test('seus jogos valem antes de tudo, pelo caminho inteiro, até numa pasta ignorada', () => {
  const base = createGameMatcher(SERVER);
  const mine = [{ name: 'GTA San Andreas', exe: 'D:\\Jogos Piratas\\GTA SA\\gta_sa.exe' },
    { name: 'Papel de parede', exe: 'C:\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe' }];
  const { match, minScreenShare, inLibrary } = withCustom(base, mine);
  assert.deepEqual(match('d:\\jogos piratas\\gta sa\\GTA_SA.exe'), { name: 'GTA San Andreas', exact: true, custom: true });
  assert.equal(match('C:\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe')?.name, 'Papel de parede');
  assert.equal(match('E:\\Outra pasta\\gta_sa.exe'), null, 'outro caminho com o mesmo nome não conta');
  assert.equal(match(JAVA, MINECRAFT)?.name, 'Minecraft', 'o resto continua com a lista do servidor');
  assert.equal(minScreenShare, base.minScreenShare);
  assert.equal(inLibrary('C:\\Steam\\steamapps\\common\\Jogo\\x.exe'), true);
  assert.equal(withCustom(base, []), base, 'sem jogos adicionados, é o mesmo reconhecedor');
  assert.equal(withCustom(null, mine).match('D:\\Jogos Piratas\\GTA SA\\gta_sa.exe')?.name, 'GTA San Andreas', 'funciona antes da lista do servidor chegar');
  assert.equal(withCustom(null, mine).match(JAVA, MINECRAFT), null);
});

test('a lista salva é limpa: sem repetidos, sem nome vazio e só .exe', () => {
  assert.deepEqual(cleanCustom([{ name: '  Jogo   A ', exe: 'C:\\a.exe' }, { name: 'Repetido', exe: 'c:/A.EXE' }, { name: '', exe: 'C:\\b.exe' },
    { name: 'Não é exe', exe: 'C:\\c.bat' }, null, 'x', { name: 'x'.repeat(80), exe: 'C:\\d.exe' }]),
  [{ name: 'Jogo A', exe: 'C:\\a.exe' }, { name: 'x'.repeat(60), exe: 'C:\\d.exe' }]);
  assert.deepEqual(cleanCustom(null), []);
});

function fakeStore(initial) {
  const data = { myGames: initial };
  return { data, get: (key) => data[key], set: (key, value) => { data[key] = value; } };
}

test('lista os programas abertos e deixa adicionar, renomear e remover', async () => {
  const store = fakeStore([{ name: 'Antigo', exe: 'C:\\Jogos\\antigo.exe' }]);
  const owners = {
    1: { pid: 100, exe: 'D:\\Jogos Piratas\\GTA SA\\gta_sa.exe' },
    2: { pid: 200, exe: JAVA },
    3: { pid: 300, exe: 'C:\\Windows\\explorer.exe' },
    4: { pid: 999, exe: 'C:\\Resenhex\\Resenhex.exe' },
    5: { pid: 101, exe: 'D:\\Jogos Piratas\\GTA SA\\gta_sa.exe' },
    6: { pid: 400, exe: 'C:\\Jogos\\antigo.exe' },
  };
  const windows = { processOf: (hwnd) => owners[hwnd] || null, commandLine: (pid) => (pid === 200 ? MINECRAFT : '') };
  let mine = store.get('myGames');
  const games = { matcher: () => withCustom(createGameMatcher(SERVER), mine) };
  const sources = async () => [1, 2, 3, 4, 5, 6, 7].map((hwnd) => ({ id: `window:${hwnd}:0`, name: 'Janela ' + hwnd })).concat({ id: 'screen:0:0', name: 'Tela' });
  const my = createMyGames({ store, windows, games, sources, self: 999 });
  const open = await my.open();
  assert.deepEqual(open, [
    { title: 'Janela 1', exe: 'D:\\Jogos Piratas\\GTA SA\\gta_sa.exe', file: 'gta_sa.exe', game: '', mine: false },
    { title: 'Janela 2', exe: JAVA, file: 'javaw.exe', game: 'Minecraft', mine: false },
    { title: 'Janela 6', exe: 'C:\\Jogos\\antigo.exe', file: 'antigo.exe', game: 'Antigo', mine: true },
  ], 'sem Windows, sem o próprio Resenhex e um por executável');

  assert.deepEqual(my.add('C:\\Nao\\aberto.exe', 'Qualquer'), store.get('myGames'), 'só entra programa da lista de abertos');
  mine = my.add('D:\\Jogos Piratas\\GTA SA\\gta_sa.exe', '');
  assert.deepEqual(mine.at(-1), { name: 'gta_sa', exe: 'D:\\Jogos Piratas\\GTA SA\\gta_sa.exe' }, 'sem nome, fica o do arquivo');
  mine = my.add('d:/jogos piratas/gta sa/gta_sa.exe', '  GTA   San Andreas ');
  assert.deepEqual(mine.at(-1), { name: 'GTA San Andreas', exe: 'D:\\Jogos Piratas\\GTA SA\\gta_sa.exe' }, 'renomear mantém o caminho');
  assert.equal(my.add('D:\\Jogos Piratas\\GTA SA\\gta_sa.exe', '   ').at(-1).name, 'GTA San Andreas', 'nome vazio não apaga');
  assert.deepEqual(store.data.myGames, my.list(), 'fica salvo nas preferências');
  mine = my.remove('C:\\Jogos\\antigo.exe');
  assert.deepEqual(mine.map((game) => game.name), ['GTA San Andreas']);
  assert.equal(my.remove('C:\\nao\\existe.exe'), mine);
  assert.deepEqual(await createMyGames({ store: fakeStore(), windows: null, games, sources }).open(), [], 'fora do Windows não lista nada');
  assert.equal(defaultName('C:\\x\\Meu Jogo.EXE'), 'Meu Jogo');
});

test('a lista de jogos junta a do servidor com os seus, e refaz só quando uma muda', () => {
  let mine = [];
  const list = createGameList({ cacheFile: path.join(os.tmpdir(), `resenhex-sem-lista-${process.pid}.json`),
    origin: 'http://127.0.0.1:1', fetch: () => new Promise(() => {}), log: { info() {}, warn() {} }, custom: () => mine });
  assert.equal(list.matcher(), null, 'sem lista do servidor e sem jogos adicionados');
  mine = [{ name: 'Meu', exe: 'C:\\meu.exe' }];
  const first = list.matcher();
  assert.equal(first.match('C:\\meu.exe')?.name, 'Meu');
  assert.equal(list.matcher(), first, 'a mesma lista, o mesmo reconhecedor');
  mine = [];
  assert.equal(list.matcher(), null);
});
