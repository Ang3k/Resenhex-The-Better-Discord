// Ponte da janela do overlay de jogos: recebe o resumo da chamada e devolve o tamanho da lista.
const { contextBridge, ipcRenderer } = require('electron');

const originArg = process.argv.find((arg) => arg.startsWith('--resenhex-origin='));
const ORIGIN = originArg ? originArg.slice('--resenhex-origin='.length) : '';

if (location.origin === ORIGIN) {
  let listener = null;
  let last = null;
  ipcRenderer.on('overlay:state', (_event, state) => { last = state; listener?.(state); });
  contextBridge.exposeInMainWorld('resenhexOverlay', {
    onState: (fn) => { listener = typeof fn === 'function' ? fn : null; if (listener && last !== null) listener(last); },
    resize: (width, height) => ipcRenderer.send('overlay:resize', { width: Number(width) || 0, height: Number(height) || 0 }),
  });
}
