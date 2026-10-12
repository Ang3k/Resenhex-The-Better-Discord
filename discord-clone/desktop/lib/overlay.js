// Overlay de voz em jogos: a lista da chamada (quem fala, quem está mutado) no canto do jogo.
// É uma janela transparente, sempre no topo e que deixa o clique passar. Não injeta nada no jogo,
// então não aparece em jogos de tela cheia exclusiva, só nos de janela ou tela cheia sem borda.
// O site manda o resumo da chamada; aqui só se decide quando e onde mostrar.
const fs = require('node:fs');
const { createGameMatcher } = require('./game-detect');
const { WIDTH, MAX_HEIGHT, overlayConfig, overlayBounds, overlayState } = require('./overlay-layout');

const POLL_MS = 1500;
const PREVIEW_MS = 6000;
const LIST_MAX_AGE = 24 * 60 * 60 * 1000;

function createOverlay({ BrowserWindow, screen, origin, preload, cacheFile, fetch, log }) {
  let config = overlayConfig(null);
  let call = null; // resumo da chamada, ou null fora dela
  let preview = null; // { area, corner, timer } enquanto o teste das configurações está na tela
  let size = { width: WIDTH, height: 60 };
  let win = null;
  let ready = false;
  let timer = null;
  let matcher = null;
  let listLoading = null;
  let foreground;
  let gameArea = null; // área do jogo em primeiro plano (DIP), ou null

  function getForeground() {
    if (foreground === undefined) {
      try { foreground = require('./foreground').createForeground(); }
      catch (error) { foreground = null; log.warn('Overlay indisponível:', error.message); }
    }
    return foreground;
  }

  // ---------------- lista de jogos ----------------
  function loadList() {
    if (matcher || listLoading) return;
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* primeira vez */ }
    if (Array.isArray(saved?.games)) matcher = createGameMatcher(saved.games);
    if (saved && Date.now() - (saved.savedAt || 0) < LIST_MAX_AGE) return;
    listLoading = (async () => {
      try {
        const response = await fetch(new URL('/api/games/detectable', origin).href);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const body = await response.json();
        if (!Array.isArray(body.games) || !body.games.length) throw new Error('lista vazia');
        matcher = createGameMatcher(body.games);
        fs.writeFileSync(cacheFile + '.tmp', JSON.stringify({ savedAt: Date.now(), games: body.games }));
        fs.renameSync(cacheFile + '.tmp', cacheFile);
        log.info(`Overlay: ${body.games.length} jogos conhecidos`);
      } catch (error) {
        log.warn('Overlay: lista de jogos não foi baixada:', error.message);
      } finally { listLoading = null; }
    })();
  }

  // ---------------- janela ----------------
  function ensureWindow() {
    if (win && !win.isDestroyed()) return win;
    ready = false;
    win = new BrowserWindow({
      width: size.width, height: size.height, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      focusable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true, title: 'Resenhex Overlay',
      webPreferences: { preload, sandbox: true, contextIsolation: true, spellcheck: false, additionalArguments: ['--resenhex-origin=' + origin] },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.on('did-finish-load', () => { ready = true; send(); });
    win.webContents.on('render-process-gone', () => { win?.destroy(); });
    win.on('closed', () => { win = null; ready = false; });
    win.loadURL(new URL('/overlay.html', origin).href).catch((error) => log.warn('Overlay:', error.message));
    return win;
  }

  function send() {
    if (!ready || !win || win.isDestroyed()) return;
    win.webContents.send('overlay:state', preview ? preview.state : call);
  }

  // Mostra no canto da área (jogo ou, no teste, a tela do app) ou esconde.
  function place() {
    const area = preview?.area || gameArea;
    const users = (preview ? preview.state : call)?.users.length;
    if (!area || !users) { if (win && !win.isDestroyed() && win.isVisible()) win.hide(); return; }
    const overlay = ensureWindow();
    overlay.setBounds(overlayBounds(area, preview?.corner || config.corner, size));
    if (!overlay.isVisible()) {
      overlay.showInactive();
      overlay.setAlwaysOnTop(true, 'screen-saver'); // reafirma o topo: alguns jogos sobem a própria janela
    }
  }

  // ---------------- jogo em primeiro plano ----------------
  function check() {
    const current = config.enabled && call ? getForeground()?.() : null;
    let area = null;
    if (current && current.pid !== process.pid && matcher?.match(current.exe)) {
      const rect = process.platform === 'win32' ? screen.screenToDipRect(null, current.rect) : current.rect;
      area = rect.width > 0 && rect.height > 0 ? rect : null;
    }
    const changed = JSON.stringify(area) !== JSON.stringify(gameArea);
    gameArea = area;
    if (changed || preview) place();
  }

  function schedule() {
    const needed = config.enabled && !!call && !!getForeground();
    if (needed && !timer) { loadList(); timer = setInterval(check, POLL_MS); check(); }
    else if (!needed && timer) { clearInterval(timer); timer = null; gameArea = null; place(); }
  }

  return {
    available: () => !!getForeground(),
    owns: (contents) => !!win && !win.isDestroyed() && contents === win.webContents,
    setConfig(value) {
      config = overlayConfig(value);
      schedule();
      place();
    },
    // null: fora da chamada.
    setState(value) {
      const next = value ? overlayState(value) : null;
      call = next && next.users.length ? next : null;
      send();
      schedule();
      if (!preview) place();
    },
    // A página manda o tamanho que a lista ocupa; a janela acompanha (no canto direito, encosta na borda).
    resize(value) {
      const width = Math.round(Number(value?.width)), height = Math.round(Number(value?.height));
      if (!(width >= 1 && height >= 1)) return;
      size = { width: Math.min(width, WIDTH), height: Math.min(height, MAX_HEIGHT) };
      if (win && !win.isDestroyed() && win.isVisible()) place();
    },
    // Teste das configurações: mostra por alguns segundos no canto escolhido da tela do app (fora da barra de tarefas).
    preview({ corner, state, display }) {
      const shown = overlayState(state);
      if (!shown?.users.length) return;
      clearTimeout(preview?.timer);
      preview = { area: display.workArea, corner: overlayConfig({ corner }).corner, state: shown, timer: setTimeout(() => { preview = null; send(); place(); }, PREVIEW_MS) };
      ensureWindow();
      send();
      place();
    },
    destroy() {
      clearInterval(timer);
      clearTimeout(preview?.timer);
      timer = null;
      if (win && !win.isDestroyed()) win.destroy();
    },
  };
}

module.exports = { createOverlay };
