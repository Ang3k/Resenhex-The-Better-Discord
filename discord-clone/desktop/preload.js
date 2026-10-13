// Ponte entre o site do Resenhex e o app de desktop. Só é exposta para o próprio site.
const { contextBridge, ipcRenderer } = require('electron');

const originArg = process.argv.find((arg) => arg.startsWith('--resenhex-origin='));
const ORIGIN = originArg ? originArg.slice('--resenhex-origin='.length) : '';

if (location.protocol === 'file:') {
  // Tela local de "sem conexão".
  contextBridge.exposeInMainWorld('resenhexOffline', { retry: () => ipcRenderer.send('offline:retry') });
} else if (location.origin === ORIGIN) {
  let pickSource = null;
  let updateSource = null;
  let activePick = null;
  let pttListener = null;
  let keybindListener = null;

  ipcRenderer.on('desktop:pick-source', async (_event, id, sources, options) => {
    activePick = id;
    let choice = { unhandled: true };
    if (pickSource) {
      try { choice = (await pickSource(sources, options)) || null; } catch { choice = null; }
    }
    ipcRenderer.send('desktop:pick-source:result', id, choice);
    if (activePick === id) activePick = null;
  });
  ipcRenderer.on('desktop:pick-source:update', (_event, id, sources, options) => {
    if (activePick === id) updateSource?.(sources, options);
  });
  ipcRenderer.on('desktop:ptt', (_event, pressed) => pttListener?.(!!pressed));
  ipcRenderer.on('desktop:keybind', (_event, id) => keybindListener?.(String(id)));

  contextBridge.exposeInMainWorld('resenhexDesktop', {
    platform: process.platform,
    mediaCapabilities: () => ipcRenderer.invoke('desktop:media-capabilities'),
    // handler(sources, { audio, apps }) → Promise<{ id, audio, app? } | null>; app é o ID do processo cujo som vai na transmissão.
    onPickSource: (handler, updater) => {
      pickSource = typeof handler === 'function' ? handler : null;
      updateSource = typeof updater === 'function' ? updater : null;
      ipcRenderer.send('desktop:pick-source:ready', !!pickSource && !!updateSource);
    },
    setPushToTalk: (config) => ipcRenderer.send('desktop:set-ptt', { enabled: !!config?.enabled, code: String(config?.code || '') }),
    onPushToTalk: (listener) => { pttListener = typeof listener === 'function' ? listener : null; },
    // list: [{ id, combo }] dos atalhos que valem com o app em segundo plano.
    setKeybinds: (list) => ipcRenderer.send('desktop:set-keybinds', Array.isArray(list) ? list.map((item) => ({ id: String(item?.id || ''), combo: String(item?.combo || '') })) : []),
    onKeybind: (listener) => { keybindListener = typeof listener === 'function' ? listener : null; },
    setTheme: (colors) => ipcRenderer.send('desktop:set-theme', { background: String(colors?.background || ''), foreground: String(colors?.foreground || '') }),
    focus: () => ipcRenderer.send('desktop:focus'),
    // Overlay de voz em jogos. state: { channel, users: [...] } ou null fora da chamada.
    overlay: {
      available: () => ipcRenderer.invoke('desktop:overlay:available'),
      customizable: true, // repassa a aparência (opacidade, nomes, quem aparece, fotos animadas); desde o app 1.1.4
      // Posição em frações da tela (x, y de 0 a 1): 0 = esquerda/topo, 1 = direita/embaixo.
      configure: (config) => ipcRenderer.send('desktop:overlay:config', { enabled: !!config?.enabled, x: Number(config?.x), y: Number(config?.y) }),
      setState: (state) => ipcRenderer.send('desktop:overlay:state', state ?? null),
      preview: (position, state) => ipcRenderer.send('desktop:overlay:preview', { position: { x: Number(position?.x), y: Number(position?.y) }, state }),
    },
  });
}
