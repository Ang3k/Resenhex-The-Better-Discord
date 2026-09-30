// Ponte entre o site do Resenhex e o app de desktop. Só é exposta para o próprio site.
const { contextBridge, ipcRenderer } = require('electron');

const originArg = process.argv.find((arg) => arg.startsWith('--resenhex-origin='));
const ORIGIN = originArg ? originArg.slice('--resenhex-origin='.length) : '';

if (location.protocol === 'file:') {
  // Tela local de "sem conexão".
  contextBridge.exposeInMainWorld('resenhexOffline', { retry: () => ipcRenderer.send('offline:retry') });
} else if (location.origin === ORIGIN) {
  let pickSource = null;
  let pttListener = null;

  ipcRenderer.on('desktop:pick-source', async (_event, id, sources, options) => {
    let choice = { unhandled: true };
    if (pickSource) {
      try { choice = (await pickSource(sources, options)) || null; } catch { choice = null; }
    }
    ipcRenderer.send('desktop:pick-source:result', id, choice);
  });
  ipcRenderer.on('desktop:ptt', (_event, pressed) => pttListener?.(!!pressed));

  contextBridge.exposeInMainWorld('resenhexDesktop', {
    platform: process.platform,
    // handler(sources, { audio }) → Promise<{ id, audio } | null>
    onPickSource: (handler) => { pickSource = typeof handler === 'function' ? handler : null; },
    setPushToTalk: (config) => ipcRenderer.send('desktop:set-ptt', { enabled: !!config?.enabled, code: String(config?.code || '') }),
    onPushToTalk: (listener) => { pttListener = typeof listener === 'function' ? listener : null; },
    setTheme: (colors) => ipcRenderer.send('desktop:set-theme', { background: String(colors?.background || ''), foreground: String(colors?.foreground || '') }),
    focus: () => ipcRenderer.send('desktop:focus'),
  });
}
