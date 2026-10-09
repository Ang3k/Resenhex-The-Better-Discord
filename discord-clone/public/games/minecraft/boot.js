// Uses the published web build without changing its JavaScript or game assets.
(() => {
  const query = new URLSearchParams(location.search);
  let parentOrigin;
  try { parentOrigin = new URL(query.get('parentOrigin')).origin; } catch {}
  const notify = (state) => {
    if (parentOrigin && window.parent !== window) window.parent.postMessage({ type: 'resenhex:minecraft:' + state }, parentOrigin);
  };
  const wasm = query.get('runtime') !== 'js' && typeof window.WebAssembly?.Suspending === 'function' && typeof window.WebAssembly?.promising === 'function';
  const root = '/games/minecraft/assets/web_' + (wasm ? 'wasm' : 'js') + '/';
  const relayId = Math.floor(Math.random() * 3);
  let ready = false;
  const observer = new MutationObserver(() => {
    if (!ready && document.querySelector('#game_frame canvas')) {
      ready = true;
      observer.disconnect();
      notify('ready');
    }
  });
  observer.observe(document.querySelector('#game_frame'), { childList: true, subtree: true });
  function fail() {
    observer.disconnect();
    notify('error');
    const note = document.createElement('div');
    note.className = 'boot-note';
    note.textContent = 'Não foi possível carregar o Minecraft. Feche e tente novamente.';
    document.querySelector('#game_frame').replaceChildren(note);
  }
  window.eaglercraftXOpts = {
    container: 'game_frame',
    assetsURI: root + (wasm ? 'assets.epw' : 'assets.epk'),
    localesURI: '/games/minecraft/assets/web_js/lang/',
    lang: 'pt_BR',
    worldsDB: 'resenhex-minecraft-worlds',
    resourcePacksDB: 'resenhex-minecraft-packs',
    localStorageNamespace: '_resenhexMinecraft',
    // Resenhex already handles the call microphone; the game has no microphone permission.
    allowVoiceClient: false,
    enforceVSync: true,
    servers: [],
    relays: [
      { addr: 'wss://relay.deev.is/', comment: 'lax1dude relay #1', primary: relayId === 0 },
      { addr: 'wss://relay.lax1dude.net/', comment: 'lax1dude relay #2', primary: relayId === 1 },
      { addr: 'wss://relay.shhnowisnottheti.me/', comment: 'ayunami relay #1', primary: relayId === 2 },
    ],
    hooks: {
      screenChanged() {
        if (!ready && document.querySelector('#game_frame canvas')) { ready = true; observer.disconnect(); notify('ready'); }
      },
      crashReportShow() { notify('error'); },
    },
  };
  const script = document.createElement('script');
  script.src = root + (wasm ? 'bootstrap.js' : 'classes.js');
  script.onerror = fail;
  script.onload = () => {
    try {
      Promise.resolve(window.main()).catch(fail);
      // The client's own splash may wait for a key to unlock audio before creating
      // its canvas. Show it immediately so the player can provide that gesture.
      notify('started');
    } catch { fail(); }
  };
  document.head.append(script);
})();
