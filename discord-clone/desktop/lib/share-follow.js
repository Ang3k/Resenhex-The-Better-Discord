// Transmissão que segue a partida, como no Discord: quem transmite a janela do client do LoL vê a
// transmissão ir sozinha para a janela do jogo quando a partida abre, e voltar para o client quando
// ela acaba. Vale para qualquer launcher que abre o jogo de dentro da própria pasta.
//
// - O jogo é a janela em primeiro plano de outro executável, instalado dentro da pasta do app
//   transmitido ("…/League of Legends/LeagueClientUx.exe" → "…/League of Legends/Game/League of
//   Legends.exe") e reconhecido como jogo (lista do Discord, ou pasta de loja com janela grande).
//   Passar por uma biblioteca (a Steam abrindo um jogo de "steamapps/common/") não conta.
// - Quando a janela do jogo fecha, volta para a mesma janela do launcher, assim que ela aparecer de
//   novo, ou para outra do mesmo executável (o client reaberto). Sem ela em 1 minuto, para.
// - O som de um app que seguia o app transmitido passa a ser o do jogo, e volta depois.
// - A troca usa o mesmo pedido de captura do site: o seletor não abre, e esta escolha é entregue
//   no lugar dele, só depois que o site confirmar que o pedido é dela (accept).

const POLL_MS = 1000;
const PICK_MS = 15000; // o site tem esse tempo para pedir a captura da troca
const RETURN_MS = 60000; // depois da partida, espera o launcher voltar
const CLOSED_MS = 30000; // launcher fechado na partida (opção do LoL): espera o jogo abrir

const normalize = (file) => String(file || '').toLowerCase().split('\\').join('/');
const handleOf = (sourceId) => Number(/^window:(\d+):/.exec(String(sourceId))?.[1]) || 0;

// O executável "exe" é um jogo aberto pelo app transmitido ("home")?
function isGameOf(home, exe, matcher) {
  const from = normalize(home), file = normalize(exe);
  if (!from || !file || from === file || !matcher) return false;
  const dir = from.slice(0, from.lastIndexOf('/') + 1);
  // Pelo menos uma pasta abaixo do disco ("c:/jogo/"), para não valer o disco inteiro.
  if (dir.split('/').filter(Boolean).length < 2 || !file.startsWith(dir)) return false;
  if (matcher.inLibrary?.(file.slice(dir.length))) return false;
  return !!matcher.match(exe);
}

// windows: foreground.js ({ hwnd, pid, exe, rect } em primeiro plano, mais processOf, alive e visible).
// sources(): Promise<[{ id, name }]> das janelas que dá para capturar.
// large(rect): a janela ocupa uma boa parte da tela (para jogos reconhecidos só pela pasta).
// send(contents, message): avisa o site ({ action: 'switch', to, name } ou { action: 'stop' }).
function createShareFollow({ windows, games, sources, large, send, log, now = Date.now, setInterval: every = setInterval, clearInterval: cancel = clearInterval }) {
  let share = null; // { contents, at: 'home' | 'game', home, game, audio: { enabled, pids }, lostAt, pending }
  let timer = null;
  let busy = false;
  let missing = { hwnd: 0, until: 0 }; // jogo em primeiro plano que não apareceu entre as fontes

  function stop(contents) {
    if (contents && share?.contents !== contents) return;
    share = null;
    if (timer) { cancel(timer); timer = null; }
  }

  // Uma escolha feita no seletor do site recomeça a partir dela.
  function start(contents, { source, audio }) {
    stop();
    const hwnd = handleOf(source?.id);
    const owner = hwnd && windows?.processOf(hwnd);
    if (!owner?.exe) return;
    share = { contents, at: 'home', home: { hwnd, pid: owner.pid, exe: owner.exe, id: source.id, name: source.name }, game: null,
      audio: { enabled: !!audio?.enabled, pids: Array.isArray(audio?.pids) ? audio.pids : [] }, lostAt: 0, pending: null };
    timer = every(() => { check().catch((error) => log.warn('Transmissão seguindo o jogo:', error.message)); }, POLL_MS);
  }

  const current = () => share.at === 'game' ? share.game : share.home;

  function go(at, target) {
    const from = current();
    // Só o som que seguia a janela transmitida troca de app; outros apps escolhidos continuam.
    const pids = [...new Set(share.audio.pids.map((pid) => pid === from.pid ? target.pid : pid))];
    share.pending = { at, target, pids, accepted: false, expires: now() + PICK_MS };
    log.info(`Transmissão: ${at === 'game' ? 'seguindo o jogo' : 'voltando para'} ${target.name}`);
    send(share.contents, { action: 'switch', to: at, name: target.name });
  }

  function end() {
    const { contents } = share;
    log.info('Transmissão: a janela do jogo ou do launcher não voltou');
    stop();
    send(contents, { action: 'stop' });
  }

  async function windowsOf(test) {
    const list = await sources();
    return list.map((source) => ({ id: source.id, name: source.name, hwnd: handleOf(source.id) }))
      .filter((item) => item.hwnd).map((item) => ({ ...item, ...windows.processOf(item.hwnd) })).filter(test);
  }

  async function findGame() {
    const top = windows();
    const matcher = games.matcher();
    if (!top || top.hwnd === share.home.hwnd || !isGameOf(share.home.exe, top.exe, matcher)) return null;
    if (!matcher.match(top.exe)?.exact && !large(top.rect)) return null; // pela pasta, só janela grande
    if (missing.hwnd === top.hwnd && now() < missing.until) return null;
    const [item] = await windowsOf((item) => item.hwnd === top.hwnd);
    if (!item?.exe) missing = { hwnd: top.hwnd, until: now() + 10000 };
    return item?.exe ? item : null;
  }

  // A mesma janela do launcher (escondida durante a partida) ou outra do mesmo executável.
  async function findHome() {
    const { home } = share;
    if (windows.visible(home.hwnd)) return home;
    const same = await windowsOf((item) => normalize(item.exe) === normalize(home.exe) && windows.visible(item.hwnd));
    return same.find((item) => item.name === home.name) || same[0] || null;
  }

  async function check() {
    if (!share || busy) return;
    if (share.contents.isDestroyed?.()) return stop();
    if (share.pending) {
      if (now() < share.pending.expires) return;
      share.pending = null; // o site não pediu a troca (ocupado): tenta de novo
    }
    busy = true;
    const watched = share;
    try {
      const alive = windows.alive(current().hwnd);
      if (!alive) share.lostAt ||= now();
      let target = null, at = 'home';
      if (share.at === 'home') {
        target = await findGame();
        if (target) at = 'game';
        else if (!alive) target = await findHome(); // o launcher reabriu em outra janela
      } else if (!alive) target = await findHome();
      if (share !== watched || share.pending) return;
      if (target) return go(at, target);
      if (share.lostAt && now() - share.lostAt > (share.at === 'game' ? RETURN_MS : CLOSED_MS)) end();
    } finally { busy = false; }
  }

  return {
    start,
    stop,
    // O site vai pedir a captura desta troca agora; false: a troca expirou.
    accept(contents) {
      const pending = share?.contents === contents ? share.pending : null;
      if (!pending || now() > pending.expires) return false;
      pending.accepted = true;
      return true;
    },
    // O pedido de captura da troca: { source, audio, pids } no lugar do seletor, ou null.
    takePick(contents) {
      const pending = share?.contents === contents ? share.pending : null;
      if (!pending?.accepted || now() > pending.expires) return null;
      share.pending = null;
      share.at = pending.at;
      if (pending.at === 'game') share.game = pending.target;
      else { share.home = pending.target; share.game = null; }
      share.audio.pids = pending.pids;
      share.lostAt = 0;
      return { source: { id: pending.target.id, name: pending.target.name }, audio: share.audio.enabled, pids: pending.pids };
    },
    // A captura atual acabou (a janela fechou). true: o site espera a troca em vez de parar.
    ended(contents) {
      if (share?.contents !== contents) return false;
      const matcher = games.matcher();
      // Na partida, volta para o launcher. No launcher, só espera se ele for o launcher de um jogo (fora
      // da lista de jogos, numa biblioteca): o client do LoL pode fechar durante a partida. Qualquer
      // outro app, ou o próprio jogo transmitido, para a transmissão na hora, como antes.
      const launcher = matcher && !matcher.match(share.home.exe) && matcher.inLibrary(share.home.exe);
      if (share.at !== 'game' && !launcher) { stop(); return false; }
      share.lostAt ||= now();
      check().catch((error) => log.warn('Transmissão seguindo o jogo:', error.message));
      return true;
    },
  };
}

module.exports = { createShareFollow, isGameOf };
