const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lab', {
  send: (to, msg) => ipcRenderer.send('lab:send', to, msg),
  onMessage: (cb) => ipcRenderer.on('lab:msg', (_e, from, msg) => cb(from, msg)),
  metrics: () => ipcRenderer.invoke('lab:metrics'),
});
