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
  let keybindListener = null;
  let voiceAiListener = null;
  ipcRenderer.on('desktop:voice-ai:state', (_event, state) => voiceAiListener?.(state));

  ipcRenderer.on('desktop:pick-source', async (_event, id, sources, options) => {
    let choice = { unhandled: true };
    if (pickSource) {
      try { choice = (await pickSource(sources, options)) || null; } catch { choice = null; }
    }
    ipcRenderer.send('desktop:pick-source:result', id, choice);
  });
  ipcRenderer.on('desktop:ptt', (_event, pressed) => pttListener?.(!!pressed));
  ipcRenderer.on('desktop:keybind', (_event, id) => keybindListener?.(String(id)));

  contextBridge.exposeInMainWorld('resenhexDesktop', {
    platform: process.platform,
    mediaCapabilities: () => ipcRenderer.invoke('desktop:media-capabilities'),
    voiceAi: {
      status: () => ipcRenderer.invoke('desktop:voice-ai:status'),
      install: (id) => ipcRenderer.invoke('desktop:voice-ai:install', String(id)),
      cancel: () => ipcRenderer.invoke('desktop:voice-ai:cancel'),
      remove: (id) => ipcRenderer.invoke('desktop:voice-ai:remove', String(id)),
      configure: (values) => ipcRenderer.invoke('desktop:voice-ai:configure', { model: values?.model, backend: values?.backend, performance: values?.performance, pitchShift: values?.pitchShift }),
      open: () => ipcRenderer.invoke('desktop:voice-ai:open'),
      convert: (frame) => ipcRenderer.invoke('desktop:voice-ai:convert', { stream: String(frame?.stream || ''), epoch: frame?.epoch, pcm: frame?.pcm }),
      close: (id) => ipcRenderer.invoke('desktop:voice-ai:close', String(id)),
      onState: (listener) => { voiceAiListener = typeof listener === 'function' ? listener : null; },
    },
    // handler(sources, { audio }) → Promise<{ id, audio } | null>
    onPickSource: (handler) => { pickSource = typeof handler === 'function' ? handler : null; },
    setPushToTalk: (config) => ipcRenderer.send('desktop:set-ptt', { enabled: !!config?.enabled, code: String(config?.code || '') }),
    onPushToTalk: (listener) => { pttListener = typeof listener === 'function' ? listener : null; },
    // list: [{ id, combo }] dos atalhos que valem com o app em segundo plano.
    setKeybinds: (list) => ipcRenderer.send('desktop:set-keybinds', Array.isArray(list) ? list.map((item) => ({ id: String(item?.id || ''), combo: String(item?.combo || '') })) : []),
    onKeybind: (listener) => { keybindListener = typeof listener === 'function' ? listener : null; },
    setTheme: (colors) => ipcRenderer.send('desktop:set-theme', { background: String(colors?.background || ''), foreground: String(colors?.foreground || '') }),
    focus: () => ipcRenderer.send('desktop:focus'),
  });
}
