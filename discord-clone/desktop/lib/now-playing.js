// "Jogando agora": qual jogo a pessoa está jogando, para o site mostrar no perfil e na lista de membros.
// O jogo é reconhecido quando a janela dele fica na frente (a mesma lista do overlay) e continua valendo
// enquanto o processo existir, mesmo com a pessoa olhando o Resenhex ou outra janela por cima. Fechou o
// jogo: some. Outro jogo na frente toma o lugar do anterior.
const POLL_MS = 5000;

// O processo ainda existe? EPERM: existe, mas é de outro usuário ou de administrador.
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

// foreground(): { pid, exe, rect } da janela da frente, ou null. large(rect): a janela é grande o bastante
// para um jogo reconhecido só pela pasta (as bibliotecas também têm ferramentas pequenas).
function createNowPlaying({ foreground, games, large, onChange, alive = isAlive, now = Date.now, every = POLL_MS, self = process.pid }) {
  let game = null; // { name, pid, since }
  let timer = null;
  const view = () => (game ? { name: game.name, since: game.since } : null);

  function check() {
    let top = null;
    try { top = foreground(); } catch { /* janela sumiu no meio da leitura */ }
    const matcher = games.matcher();
    const found = top && top.pid !== self && matcher ? matcher.match(top.exe) : null;
    if (found && (found.exact || large(top.rect)) && game?.pid !== top.pid) {
      game = { name: found.name, pid: top.pid, since: now() };
      onChange(view());
      return;
    }
    if (game && !alive(game.pid)) {
      game = null;
      onChange(null);
    }
  }

  return {
    start() { if (!timer) { timer = setInterval(check, every); check(); } },
    stop() { clearInterval(timer); timer = null; },
    check,
    current: view,
  };
}

module.exports = { createNowPlaying, isAlive, POLL_MS };
