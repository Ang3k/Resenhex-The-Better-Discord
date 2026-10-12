// Overlay de voz em jogos: a lista da chamada (quem fala, quem está mutado) no canto do jogo.
// É uma janela transparente, sempre no topo e que deixa o clique passar. Não injeta nada no jogo,
// então não aparece em jogos de tela cheia exclusiva, só nos de janela ou tela cheia sem borda.
// O site manda o resumo da chamada; aqui só se decide quando e onde mostrar.
const fs = require('node:fs');
const { createGameMatcher } = require('./game-detect');
const { WIDTH, MAX_HEIGHT, overlayConfig, overlayPosition, overlayBounds, overlayState } = require('./overlay-layout');

const POLL_MS = 1500;
const PREVIEW_MS = 6000;
const LIST_MAX_AGE = 24 * 60 * 60 * 1000;

function createOverlay({ BrowserWindow, screen, origin, preload, cacheFile, fetch, log }) {
  let config = overlayConfig(null);
  let call = null; // resumo da chamada, ou null fora dela
  let preview = null; // { area, position, state, timer } enquanto o teste das configurações está na tela
  let size = { width: WIDTH, height: 60 };
  let win = null;
  let ready = false;
  let timer = null;
  let matcher = null;
  let listSavedAt = 0; // quando a lista de jogos em uso foi baixada
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
  // Renova a cada 24 h, também com o app aberto. A cópia em disco é a resposta inteira do servidor
  // (lista e regras das pastas); uma cópia sem as regras é de versões anteriores e é baixada de novo.
  function loadList() {
    if (listLoading || (matcher && Date.now() - listSavedAt < LIST_MAX_AGE)) return;
    if (!matcher) {
      let saved = null;
      try { saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* primeira vez */ }
      if (Array.isArray(saved?.games)) {
        matcher = createGameMatcher(saved);
        listSavedAt = Array.isArray(saved.folders) ? saved.savedAt || 0 : 0;
        if (Date.now() - listSavedAt < LIST_MAX_AGE) return;
      }
    }
    listLoading = (async () => {
      try {
        const response = await fetch(new URL('/api/games/detectable', origin).href);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const body = await response.json();
        if (!Array.isArray(body.games) || !body.games.length) throw new Error('lista vazia');
        matcher = createGameMatcher(body);
        listSavedAt = Date.now();
        fs.writeFileSync(cacheFile + '.tmp', JSON.stringify({ ...body, savedAt: listSavedAt }));
        fs.renameSync(cacheFile + '.tmp', cacheFile);
        log.info(`Overlay: ${body.games.length} jogos conhecidos e ${matcher.folders} pastas de lojas`);
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

  // Mostra na posição escolhida da área (jogo ou, no teste, a tela do app) ou esconde.
  function place() {
    const area = preview?.area || gameArea;
    const users = (preview ? preview.state : call)?.users.length;
    if (!area || !users) { if (win && !win.isDestroyed() && win.isVisible()) win.hide(); return; }
    const overlay = ensureWindow();
    overlay.setBounds(overlayBounds(area, preview?.position || config, size));
    if (!overlay.isVisible()) {
      overlay.showInactive();
      overlay.setAlwaysOnTop(true, 'screen-saver'); // reafirma o topo: alguns jogos sobem a própria janela
    }
  }

  // ---------------- jogo em primeiro plano ----------------
  function check() {
    const current = config.enabled && call ? getForeground()?.() : null;
    const game = current && current.pid !== process.pid ? matcher?.match(current.exe) : null;
    let area = null;
    if (game) {
      const rect = process.platform === 'win32' ? screen.screenToDipRect(null, current.rect) : current.rect;
      area = rect.width > 0 && rect.height > 0 ? rect : null;
      // Reconhecido só pela pasta da loja: a janela precisa ser grande, para não aparecer sobre ferramentas.
      if (area && !game.exact) {
        const { width, height } = screen.getDisplayMatching(area).bounds;
        if (area.width * area.height < width * height * matcher.minScreenShare) area = null;
      }
    }
    if (area && !gameArea) log.info(`Overlay: ${game.name}${game.exact ? '' : ' (pela pasta)'}`);
    loadList(); // renova a lista se já passou um dia
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
    // Teste das configurações: mostra por alguns segundos na posição escolhida da tela do app (fora da barra de tarefas).
    preview({ position, state, display }) {
      const shown = overlayState(state);
      if (!shown?.users.length) return;
      clearTimeout(preview?.timer);
      preview = { area: display.workArea, position: overlayPosition(position), state: shown, timer: setTimeout(() => { preview = null; send(); place(); }, PREVIEW_MS) };
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
