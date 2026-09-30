const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('titlebar', {
  onState: (listener) => ipcRenderer.on('titlebar:state', (_event, state) => listener(state)),
  ready: () => ipcRenderer.send('titlebar:ready'),
  installUpdate: () => ipcRenderer.send('titlebar:install-update'),
});
