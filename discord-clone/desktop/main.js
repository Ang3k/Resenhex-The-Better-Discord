// Resenhex para Windows: uma janela que abre o site do Resenhex.
// A interface vem do servidor, então cada deploy do site já chega em quem usa o app.
// Este processo só cuida do que o navegador não faz: bandeja, selos na barra de tarefas,
// escolha da tela para transmitir, push-to-talk com o app em segundo plano e atualização do próprio app.

// Cada thread do pool do Node reserva 8 MB de memória no Windows (4 threads = 32 MB) desde a primeira
// operação assíncrona de arquivo. Aqui só o atualizador usa esse pool, e uma thread dá conta.
// Precisa vir antes de qualquer uso do pool.
process.env.UV_THREADPOOL_SIZE ||= '1';
const { app, BrowserWindow, WebContentsView, Menu, Tray, nativeImage, session, shell, ipcMain, desktopCapturer, net, Notification, screen } = require('electron');
const path = require('node:path');
const { createStore } = require('./lib/store');
const { parseTitle, badgeName } = require('./lib/title-badge');
const { uiohookKeycode } = require('./lib/ptt-keys');
const { globalBindings, matchBinding } = require('./lib/keybinds');
const { createLog } = require('./lib/log');
const { execFile } = require('node:child_process');
const { systemAudioDevice, appAudioSupported, appAudioDevice, AUDIO_APPS_SCRIPT, encodeScript, parseAudioApps, windowHandle } = require('./lib/system-audio');
const { AppAudioPlans, selectedAudioApps, MAX_AUDIO_APPS } = require('./lib/app-audio');
const { createOverlay } = require('./lib/overlay');
if (!app.isPackaged && process.env.RESENHEX_USER_DATA_DIR) app.setPath('userData', path.resolve(process.env.RESENHEX_USER_DATA_DIR));

const APP_URL = new URL(process.env.RESENHEX_URL || 'https://resenhex.duckdns.org/');
const ORIGIN = APP_URL.origin;
const TITLEBAR = 30;
const ASSETS = path.join(__dirname, 'assets');
const APP_ICON = process.platform === 'win32'
  ? path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build'), 'icon.ico')
  : path.join(ASSETS, 'icon.png');
const DEFAULT_THEME = { background: '#141417', foreground: '#b3b5bc' }; // tema escuro padrão do site (--bg-rail, --interactive)
// Instalado pela Microsoft Store: a loja atualiza o app e o Windows controla a inicialização.
const STORE = process.windowsStore === true;

// Na versão da loja o Windows já dá ao app a identidade do pacote (barra de tarefas e notificações).
// Em dev (electron.exe) usa outra identidade: um atalho do Electron com a mesma ID
// faz o Windows mostrar o ícone do Electron na barra de tarefas do app instalado.
if (!STORE) app.setAppUserModelId(app.isPackaged ? 'com.resenhex.desktop' : 'com.resenhex.desktop.dev');
const log = createLog(path.join(app.getPath('userData'), 'resenhex.log'));
log.info(`Iniciando a versão ${app.getVersion()}`, process.argv.slice(1).join(' '));
if (!acquireLock()) {
  log.info('Outra janela do Resenhex já está aberta; ela foi trazida para a frente.');
  app.exit(0);
}

// Logo depois de uma atualização, a versão antiga pode ainda estar terminando de fechar.
function acquireLock() {
  if (app.requestSingleInstanceLock()) return true;
  if (!process.argv.includes('--updated')) return false;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 40; attempt++) {
    Atomics.wait(pause, 0, 0, 250);
    if (app.requestSingleInstanceLock()) return true;
  }
  return false;
}

const store = createStore(path.join(app.getPath('userData'), 'preferencias.json'), {
  bounds: null, maximized: false, closeToTray: true, trayHintShown: false,
});
// Os selos e ícones da bandeja trocam a cada mudança de título; cada um é lido do disco uma vez só.
const images = new Map();
const image = (name) => {
  if (!images.has(name)) images.set(name, nativeImage.createFromPath(path.join(ASSETS, name + '.png')));
  return images.get(name);
};

let win = null;
let site = null;
let tray = null;
let quitting = false;
let theme = DEFAULT_THEME;
let unread = { mentions: 0, unread: false };
let update = null; // { version } quando uma atualização já foi baixada
let offline = false;
let retryTimer = null;
let overlay = null; // criado quando o app fica pronto (o módulo screen só existe depois disso)

const isAppUrl = (url) => { try { return new URL(url).origin === ORIGIN; } catch { return false; } };
const fromSite = (event) => isAppUrl(event.senderFrame?.url || '');
// Só a janela principal do site (não iframes nem outras janelas) controla o overlay.
const fromVoiceSite = (event) => fromSite(event) && event.sender === site?.webContents && event.senderFrame === site.webContents.mainFrame;
ipcMain.handle('desktop:media-capabilities', (event) => {
  if (!fromSite(event)) throw new Error('Origem não autorizada.');
  return { videoEncode: app.getGPUFeatureStatus().video_encode || 'unknown' };
});

// ---------------- janela ----------------
function createWindow(hidden) {
  const bounds = store.get('bounds');
  win = new BrowserWindow({
    ...(bounds || { width: 1280, height: 800 }),
    minWidth: 940, minHeight: 560, show: false, title: 'Resenhex',
    icon: APP_ICON, backgroundColor: theme.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: theme.background, symbolColor: theme.foreground, height: TITLEBAR },
    webPreferences: { preload: path.join(__dirname, 'titlebar-preload.js'), sandbox: true, contextIsolation: true },
  });
  // A barra de tarefas pode usar o ícone associado à identidade do app em vez do
  // ícone da janela. O ICO fica fora do ASAR para o Windows ler os tamanhos nativos.
  if (process.platform === 'win32' && app.isPackaged && !STORE) {
    win.setAppDetails({
      appId: 'com.resenhex.desktop', appIconPath: APP_ICON,
      relaunchCommand: `"${process.execPath}"`, relaunchDisplayName: 'Resenhex',
    });
  }
  win.loadFile(path.join(__dirname, 'titlebar.html'));

  site = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, spellcheck: true,
      backgroundThrottling: false, // a chamada continua fluida com a janela minimizada ou na bandeja
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: ['--resenhex-origin=' + ORIGIN],
    },
  });
  site.setBackgroundColor(theme.background);
  win.contentView.addChildView(site);
  layout();

  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  win.on('focus', () => { site.webContents.focus(); win.flashFrame(false); });
  win.on('maximize', sendTitlebar);
  win.on('unmaximize', sendTitlebar);
  win.once('ready-to-show', () => {
    if (store.get('maximized')) win.maximize();
    if (!hidden) win.show();
  });
  win.on('close', (event) => {
    saveBounds();
    if (quitting) return;
    if (!store.get('closeToTray')) {
      quitting = true;
      app.quit();
      return;
    }
    event.preventDefault();
    win.hide();
    if (!store.get('trayHintShown') && Notification.isSupported()) {
      store.set('trayHintShown', true);
      new Notification({ title: 'O Resenhex continua aberto', body: 'Ele fica na bandeja, perto do relógio. Para fechar de vez, clique com o botão direito no ícone e escolha Sair.', icon: path.join(ASSETS, 'icon.png') }).show();
    }
  });
  win.on('closed', () => { win = null; site = null; });

  wireSite(site.webContents);
  loadSite();
}

function layout() {
  if (!win || !site) return;
  const [width, height] = win.getContentSize();
  const top = win.isFullScreen() ? 0 : TITLEBAR;
  site.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
}

function saveBounds() {
  if (!win || win.isFullScreen()) return;
  store.set('maximized', win.isMaximized());
  if (!win.isMaximized() && !win.isMinimized()) store.set('bounds', win.getBounds());
}

function showWindow() {
  if (!win) return createWindow(false);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendTitlebar() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('titlebar:state', { theme, update, maximized: win.isMaximized() });
}

// ---------------- site ----------------
function loadSite() {
  clearTimeout(retryTimer);
  offline = false;
  site.webContents.loadURL(APP_URL.href).catch(() => { /* tratado em did-fail-load */ });
}

// Sem conexão: mostra a tela local de "reconectando" e tenta de novo sozinho.
function showOffline() {
  if (offline || !site) return;
  offline = true;
  win?.setTitle('Resenhex');
  setUnread({ mentions: 0, unread: false });
  site.webContents.loadFile(path.join(__dirname, 'offline.html'));
  scheduleRetry(5000);
}

function scheduleRetry(delay) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(async () => {
    if (await serverOnline()) loadSite();
    else scheduleRetry(Math.min(delay * 1.5, 30000));
  }, delay);
}

async function serverOnline() {
  try { return (await net.fetch(new URL('/config', ORIGIN).href, { cache: 'no-store' })).ok; } catch { return false; }
}

function wireSite(contents) {
  contents.on('destroyed', () => appAudioPlans.clear(contents));
  contents.on('did-navigate', () => appAudioPlans.clear(contents));
  contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isAppUrl(url)) showOffline(); // -3: navegação cancelada
  });
  contents.on('render-process-gone', (_event, details) => { overlay?.setState(null); if (details.reason !== 'clean-exit') loadSite(); });
  contents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (!mainFrame) return; if (!inPlace) overlay?.setState(null); });
  contents.on('page-title-updated', (_event, title) => {
    if (offline) return;
    win?.setTitle(title);
    setUnread(parseTitle(title));
  });
  // Links externos abrem no navegador padrão; o app só navega dentro do Resenhex.
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Só vale para navegações pedidas pela página; as telas locais são abertas pelo processo principal.
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  contents.on('enter-html-full-screen', () => win?.setFullScreen(true));
  contents.on('leave-html-full-screen', () => win?.setFullScreen(false));
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (key === 'f5' || (ctrl && key === 'r')) { event.preventDefault(); offline ? loadSite() : contents.reload(); }
    else if (ctrl && input.shift && key === 'i') { event.preventDefault(); contents.toggleDevTools(); }
    else if (key === 'f11') { event.preventDefault(); win?.setFullScreen(!win.isFullScreen()); }
    else if (ctrl && (key === '=' || key === '+')) { event.preventDefault(); contents.setZoomLevel(Math.min(contents.getZoomLevel() + 0.5, 4)); }
    else if (ctrl && key === '-') { event.preventDefault(); contents.setZoomLevel(Math.max(contents.getZoomLevel() - 0.5, -3)); }
    else if (ctrl && key === '0') { event.preventDefault(); contents.setZoomLevel(0); }
  });
  contents.on('context-menu', (_event, params) => {
    const items = [];
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
    }
    if (params.misspelledWord) {
      items.push({ label: 'Adicionar ao dicionário', click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' });
    }
    if (params.isEditable) {
      items.push(
        { label: 'Recortar', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Colar', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Selecionar tudo', role: 'selectAll' },
      );
    } else if (params.selectionText.trim()) {
      items.push({ label: 'Copiar', role: 'copy' });
    }
    if (params.linkURL && /^https?:/i.test(params.linkURL)) {
      if (items.length) items.push({ type: 'separator' });
      items.push(
        { label: 'Abrir link no navegador', click: () => shell.openExternal(params.linkURL) },
        { label: 'Copiar link', click: () => require('electron').clipboard.writeText(params.linkURL) },
      );
    }
    if (params.mediaType === 'image' && params.srcURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({ label: 'Copiar imagem', click: () => contents.copyImageAt(params.x, params.y) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

// ---------------- selos, bandeja ----------------
function setUnread(next) {
  const grew = next.mentions > unread.mentions;
  unread = next;
  const badge = badgeName(unread);
  win?.setOverlayIcon(badge ? image(badge) : null, badge ? (unread.mentions ? `${unread.mentions} menções` : 'Mensagens não lidas') : '');
  if (grew && win && !win.isFocused()) win.flashFrame(true);
  updateTray();
}

function createTray() {
  tray = new Tray(image('tray'));
  tray.on('click', showWindow);
  updateTray();
}

function updateTray() {
  if (!tray) return;
  tray.setImage(image(unread.unread ? 'tray-unread' : 'tray'));
  tray.setToolTip(unread.mentions ? `Resenhex: ${unread.mentions} menções` : 'Resenhex');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir o Resenhex', click: showWindow },
    { type: 'separator' },
    ...(STORE ? [] : [update
      ? { label: `Reiniciar para atualizar (versão ${update.version})`, click: installUpdate }
      : { label: 'Procurar atualizações', click: () => checkForUpdates(true) }]),
    STORE
      // Apps da loja não gravam a inicialização por conta própria: a chave fica em Configurações > Apps > Inicialização.
      ? { label: 'Iniciar com o Windows…', click: () => shell.openExternal('ms-settings:startupapps') }
      : { label: 'Iniciar com o Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (item) => setStartup(item.checked) },
    { label: 'Fechar para a bandeja', type: 'checkbox', checked: store.get('closeToTray'), click: (item) => { store.set('closeToTray', item.checked); } },
    { type: 'separator' },
    { label: `Versão ${app.getVersion()}`, enabled: false },
    { label: 'Sair do Resenhex', click: () => { quitting = true; app.quit(); } },
  ]));
}

function setStartup(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--startup'] });
  updateTray();
}

// ---------------- permissões e escolha da tela ----------------
const ALLOWED = new Set(['media', 'notifications', 'display-capture', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'speaker-selection', 'screen-wake-lock', 'pointerLock']);

function setupSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(ALLOWED.has(permission) && isAppUrl(details.requestingUrl || contents.getURL()));
  });
  ses.setPermissionCheckHandler((_contents, permission, origin) => ALLOWED.has(permission) && isAppUrl(origin));
  ses.setSpellCheckerLanguages(['pt-BR']);
  ses.setDisplayMediaRequestHandler(pickDisplayMedia);
}

// O site mostra a própria janela de escolha (com o visual do tema) e devolve a fonte escolhida.
const pendingPicks = new Map();
const progressivePickers = new WeakSet();
const appAudioPlans = new AppAudioPlans();
const sourcePreviews = new Map();
const PREVIEW_MAX_AGE = 10000;
let sourcePreviewTask = null;
let pickSeq = 0;

function cachedPreview(source) {
  const cached = sourcePreviews.get(source.id);
  return cached && cached.source.name === source.name && Date.now() - cached.updated < PREVIEW_MAX_AGE ? cached.source : null;
}

function sourcesWithPreviews(items) {
  return items.map((source) => {
    const cached = cachedPreview(source);
    return cached ? { ...source, thumbnail: cached.thumbnail, appIcon: cached.appIcon } : source;
  });
}

function loadSourcePreviews(items) {
  if (items.every(cachedPreview)) return Promise.resolve(sourcesWithPreviews(items));
  // Reabrir durante a captura das miniaturas reaproveita o mesmo trabalho.
  if (!sourcePreviewTask) {
    sourcePreviewTask = Promise.resolve().then(() => desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 384, height: 216 }, fetchWindowIcons: true }))
      .then((previews) => {
        sourcePreviews.clear();
        const updated = Date.now();
        for (const source of previews) sourcePreviews.set(source.id, { source, updated });
      }).finally(() => { sourcePreviewTask = null; });
  }
  // Só atualiza fontes enumeradas neste pedido; não ressuscita janelas fechadas.
  return sourcePreviewTask.then(() => sourcesWithPreviews(items));
}

ipcMain.handle('desktop:app-audio:prepare', (event, token, pid) => {
  if (!fromVoiceSite(event)) throw new Error('Origem não autorizada.');
  appAudioPlans.prepare(event.sender, event.senderFrame, token, pid);
});
ipcMain.handle('desktop:app-audio:release', (event, token) => {
  if (!fromVoiceSite(event)) throw new Error('Origem não autorizada.');
  appAudioPlans.release(event.sender, event.senderFrame, token);
});

ipcMain.on('desktop:pick-source:ready', (event, progressive) => {
  if (!fromSite(event)) return;
  if (progressive === true) progressivePickers.add(event.sender);
  else progressivePickers.delete(event.sender);
});

// Sem fonte de vídeo, o Electron recusa o pedido (o site recebe o erro normal de captura
// cancelada) e ainda lança um TypeError aqui, que não precisa ir adiante.
function deny(callback) {
  try { callback({}); } catch { /* pedido recusado */ }
}

// Programas com janela aberta, para transmitir o som de um só. Sem a lista (PowerShell bloqueado,
// Windows antigo), a escolha volta a ser só entre o som do computador inteiro ou nenhum.
function listAudioApps() {
  if (!appAudioSupported(process.platform, process.getSystemVersion())) return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeScript(AUDIO_APPS_SCRIPT)],
      { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) log.warn('Lista de apps para o som da transmissão:', error.message);
        resolve(parseAudioApps(stdout, app.getAppMetrics().map((metric) => metric.pid)));
      });
  });
}

async function appIcon(item, sources) {
  const source = sources.find((s) => item.windows.includes(windowHandle(s.id)) && s.appIcon && !s.appIcon.isEmpty());
  if (source) return source.appIcon.resize({ width: 32 }).toDataURL();
  if (!item.path) return null;
  try {
    const icon = await app.getFileIcon(item.path, { size: 'normal' });
    return icon.isEmpty() ? null : icon.toDataURL();
  } catch { return null; }
}

async function pickDisplayMedia(request, callback) {
  if (!site || !isAppUrl(request.securityOrigin) || !request.videoRequested) return deny(callback);
  const contents = site.webContents;
  try {
    const extra = appAudioPlans.consume(contents, request.frame);
    if (extra) {
      if (!request.audioRequested) return deny(callback);
      callback({ video: extra.source, audio: appAudioDevice(extra.pid) });
      return;
    }
  } catch { return deny(callback); }
  appAudioPlans.clear(contents);
  const progressive = progressivePickers.has(contents);
  let sources = [], apps = [], appIcons = [];
  let loading = true, appsLoading = !!request.audioRequested;
  const id = ++pickSeq;
  const finish = (choice) => {
    if (!pendingPicks.has(id)) return;
    pendingPicks.delete(id);
    clearTimeout(timer);
    const source = choice && sources.find((item) => item.id === choice.id);
    if (!source) {
      if (progressive && !contents.isDestroyed()) contents.send('desktop:pick-source:update', id, null, { closed: true });
      return deny(callback);
    }
    const streams = { video: { id: source.id, name: source.name } };
    const audio = systemAudioDevice(process.platform, process.getSystemVersion());
    let pids;
    try { pids = request.audioRequested && choice.audio ? selectedAudioApps(choice, apps) : []; }
    catch { return deny(callback); }
    if (pids.length) streams.audio = appAudioDevice(pids[0]);
    else if (request.audioRequested && choice.audio && audio) streams.audio = audio;
    const token = appAudioPlans.create(contents, request.frame, streams.video, pids);
    contents.send('desktop:app-audio:plan', { token, pids: pids.slice(1), mode: pids.length ? 'app' : streams.audio === 'loopbackWithoutChrome' ? 'native' : null });
    try { callback(streams); } catch (error) { log.warn('Captura de tela:', error.message); }
  };
  const timer = setTimeout(() => finish(null), 120000);
  const pick = { finish, sources };
  pendingPicks.set(id, pick);
  const alive = () => {
    if (!pendingPicks.has(id)) return false;
    if (contents.isDestroyed() || site?.webContents !== contents) { finish(null); return false; }
    return true;
  };
  const send = (channel) => {
    if (!alive()) return;
    const appOfWindow = new Map(apps.flatMap((item) => item.windows.map((window) => [window, item.pid])));
    contents.send(channel, id, sources.map((source) => ({
      id: source.id, name: source.name, kind: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
      icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.resize({ width: 32 }).toDataURL() : null,
      app: appOfWindow.get(windowHandle(source.id)) || null,
    })), { audio: request.audioRequested, loading, appsLoading,
      maxAudioApps: MAX_AUDIO_APPS,
      apps: apps.map((item, index) => ({ pid: item.pid, name: item.name, icon: appIcons[index] || null })) });
  };
  // A janela abre antes de enumerar as fontes, consultar o Windows ou ler ícones.
  // Sites antigos continuam recebendo uma única lista completa.
  if (progressive) send('desktop:pick-source');
  const sourceList = Promise.resolve().then(() => desktopCapturer.getSources({ types: ['screen', 'window'],
    thumbnailSize: progressive ? { width: 0, height: 0 } : { width: 384, height: 216 }, fetchWindowIcons: !progressive }));
  const loadApps = async () => {
    // Iniciar o PowerShell pode bloquear o processo principal: primeiro entregue a lista de fontes.
    const items = await Promise.resolve().then(() => request.audioRequested ? listAudioApps() : []).catch(() => []);
    if (!alive()) return;
    apps = items;
    appsLoading = false;
    if (progressive) send('desktop:pick-source:update');
  };
  const legacyApps = progressive ? null : loadApps();
  try {
    const items = await sourceList;
    if (!alive()) return;
    const own = win?.getMediaSourceId();
    // Enumerar sem miniaturas é rápido; uma prévia vazia ainda não impede escolher a janela.
    const available = items.filter((source) => source.id !== own && source.name &&
      (progressive || source.id.startsWith('screen:') || !source.thumbnail.isEmpty()));
    sources = progressive ? sourcesWithPreviews(available) : available;
    pick.sources = sources;
    if (!sources.length) return finish(null);
    loading = false;
    if (progressive) send('desktop:pick-source:update');
    if (progressive && sources.some((source) => !cachedPreview(source))) loadSourcePreviews(sources).then((items) => {
      if (!alive()) return;
      sources = items;
      pick.sources = sources;
      send('desktop:pick-source:update');
    }).catch((error) => log.warn('Prévias para a transmissão:', error.message));
    await (legacyApps || loadApps());
    if (!alive()) return;
    if (!progressive) send('desktop:pick-source');
    // Os ícones são decorativos; nenhuma escolha precisa esperar a leitura deles.
    if (progressive) {
      appIcons = await Promise.all(apps.map((item) => appIcon(item, sources).catch(() => null)));
      send('desktop:pick-source:update');
    }
  } catch (error) {
    log.warn('Fontes para a transmissão:', error.message);
    finish(null);
  }
}

ipcMain.on('desktop:pick-source:result', (event, id, choice) => {
  if (!fromSite(event)) return;
  const pick = pendingPicks.get(id);
  if (!pick) return;
  // Site antigo, sem a janela de escolha: transmite a tela principal.
  if (choice && choice.unhandled) {
    const screen = pick.sources.find((source) => source.id.startsWith('screen:'));
    return pick.finish(screen ? { id: screen.id, audio: true } : null);
  }
  pick.finish(choice && typeof choice.id === 'string' ? { id: choice.id, audio: !!choice.audio, app: choice.app ?? null, apps: Array.isArray(choice.apps) ? choice.apps : undefined } : null);
});

// ---------------- push-to-talk e atalhos globais ----------------
// O site cuida das teclas com a janela em foco; com o app em segundo plano, o gancho global avisa o site.
// Só a tecla do push-to-talk e os atalhos que o site pediu (microfone e áudio) são repassados.
let hook = null;
let pttKey = null;
let pttDown = false;
let bindings = [];
const held = new Set(); // segurar a tecla repete o keydown: o atalho dispara uma vez por toque

function onGlobalKeydown(event) {
  if (event.keycode === pttKey && !pttDown) { pttDown = true; site?.webContents.send('desktop:ptt', true); }
  if (held.has(event.keycode)) return;
  held.add(event.keycode);
  const binding = matchBinding(bindings, event);
  if (binding) site?.webContents.send('desktop:keybind', binding.id);
}
function onGlobalKeyup(event) {
  held.delete(event.keycode);
  if (event.keycode === pttKey && pttDown) { pttDown = false; site?.webContents.send('desktop:ptt', false); }
}

function updateHook() {
  const needed = !!pttKey || bindings.length > 0;
  try {
    if (needed && !hook) {
      hook = require('uiohook-napi').uIOhook;
      hook.on('keydown', onGlobalKeydown);
      hook.on('keyup', onGlobalKeyup);
      hook.start();
    } else if (!needed && hook) {
      hook.stop();
      hook.removeAllListeners();
      hook = null;
      held.clear();
    }
  } catch (error) {
    log.warn('Atalhos globais indisponíveis:', error.message);
    hook = null;
  }
}

function setPushToTalk(config) {
  const key = config && config.enabled ? uiohookKeycode(config.code) : null;
  if (key === pttKey) return;
  pttKey = key;
  pttDown = false;
  updateHook();
}

ipcMain.on('desktop:set-keybinds', (event, list) => {
  if (!fromSite(event)) return;
  bindings = globalBindings(list);
  updateHook();
});
ipcMain.on('desktop:set-ptt', (event, config) => { if (fromSite(event)) setPushToTalk(config); });
ipcMain.on('desktop:set-theme', (event, colors) => {
  if (!fromSite(event) || !colors) return;
  const valid = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (!valid(colors.background) || !valid(colors.foreground)) return;
  theme = { background: colors.background, foreground: colors.foreground };
  win?.setBackgroundColor(theme.background);
  win?.setTitleBarOverlay({ color: theme.background, symbolColor: theme.foreground, height: TITLEBAR });
  sendTitlebar();
});
ipcMain.on('desktop:focus', (event) => { if (fromSite(event)) showWindow(); });

// ---------------- overlay de voz em jogos ----------------
// Só a página principal do site configura o overlay e manda o resumo da chamada.
ipcMain.handle('desktop:overlay:available', (event) => fromVoiceSite(event) && !!overlay?.available());
ipcMain.on('desktop:overlay:config', (event, config) => { if (fromVoiceSite(event)) overlay?.setConfig(config); });
ipcMain.on('desktop:overlay:state', (event, state) => { if (fromVoiceSite(event)) overlay?.setState(state); });
ipcMain.on('desktop:overlay:preview', (event, value) => {
  if (!fromVoiceSite(event) || !win) return;
  overlay?.preview({ position: value?.position, state: value?.state, display: screen.getDisplayMatching(win.getBounds()) });
});
ipcMain.on('overlay:resize', (event, value) => { if (overlay?.owns(event.sender)) overlay.resize(value); });
ipcMain.on('offline:retry', () => { if (offline) loadSite(); });
ipcMain.on('titlebar:ready', sendTitlebar);
ipcMain.on('titlebar:install-update', installUpdate);

// ---------------- atualização do app ----------------
let updater = null;

function setupUpdates() {
  if (!app.isPackaged || STORE) return; // a Microsoft Store cuida das atualizações da versão da loja
  updater = require('electron-updater').autoUpdater;
  updater.logger = log;
  // As versões novas ficam no mesmo servidor do site, em /download.
  updater.setFeedURL({ provider: 'generic', url: new URL('/download/', ORIGIN).href });
  updater.autoDownload = true;
  updater.disableWebInstaller = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-downloaded', (info) => {
    update = { version: info.version };
    sendTitlebar();
    updateTray();
  });
  updater.on('error', (error) => log.warn('Atualização:', error.message));
  setTimeout(() => checkForUpdates(false), 10000);
  setInterval(() => checkForUpdates(false), 2 * 60 * 60 * 1000);
}

async function checkForUpdates(manual) {
  if (!updater) return;
  try {
    const result = await updater.checkForUpdates();
    if (manual && !result?.isUpdateAvailable && Notification.isSupported()) {
      new Notification({ title: 'Resenhex', body: `Você já está na versão mais nova (${app.getVersion()}).`, icon: path.join(ASSETS, 'icon.png') }).show();
    }
  } catch { /* sem internet: tenta de novo mais tarde */ }
}

// Fecha tudo antes de chamar o instalador: com janelas ou a bandeja ainda abertas,
// o instalador silencioso atualiza, mas não consegue abrir o app de novo.
function installUpdate() {
  if (!updater || !update) return;
  quitting = true;
  log.info(`Reiniciando para instalar a versão ${update.version}`);
  setImmediate(() => {
    app.removeAllListeners('window-all-closed');
    try { hook?.stop(); } catch { /* já parado */ }
    tray?.destroy();
    tray = null;
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    updater.quitAndInstall(true, true);
  });
}

// ---------------- ciclo de vida ----------------
app.on('second-instance', () => { if (!quitting) showWindow(); });
app.on('before-quit', () => { quitting = true; saveBounds(); });
app.on('will-quit', () => {
  overlay?.destroy();
  log.info('Encerrando');
  try { hook?.stop(); } catch { /* já parado */ }
});
app.on('window-all-closed', () => { if (quitting) app.quit(); });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  setupSession();
  overlay = createOverlay({
    BrowserWindow, screen, origin: ORIGIN, preload: path.join(__dirname, 'overlay-preload.js'),
    cacheFile: path.join(app.getPath('userData'), 'jogos.json'), fetch: (url) => net.fetch(url, { cache: 'no-store' }), log,
  });
  createTray();
  createWindow(process.argv.includes('--startup'));
  setupUpdates();
});
