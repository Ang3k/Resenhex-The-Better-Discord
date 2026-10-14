// Electron 44 (o mesmo do app de Windows) com uma janela por papel: quem transmite e cada espectador.
// Cada janela usa sua faixa de portas UDP do WebRTC, para o tc limitar a banda de cada papel.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const cfg = JSON.parse(process.env.LAB_CONFIG || '{}');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-file-for-fake-video-capture', cfg.clipFile);
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-gpu'); // codificadores e decodificadores em software, como numa máquina sem aceleração
const PORT_BASE = 40000, BLOCK = 64;
const windows = [], roleOf = new Map();
ipcMain.on('lab:send', (event, to, msg) => {
  const target = to === 'streamer' ? windows[0] : windows[1 + Number(to)];
  target?.webContents.send('lab:msg', roleOf.get(event.sender.id), msg);
});
ipcMain.handle('lab:metrics', () => {
  const pidRole = new Map();
  for (const w of windows) { try { pidRole.set(w.webContents.getOSProcessId(), roleOf.get(w.webContents.id)); } catch {} }
  return app.getAppMetrics().map((m) => ({ pid: m.pid, role: pidRole.get(m.pid) || m.type, cumulative: m.cpu.cumulativeCPUUsage ?? null }));
});
app.whenReady().then(() => {
  const roles = [{ role: 'streamer', i: -1 }, ...Array.from({ length: cfg.viewers }, (_, i) => ({ role: 'viewer', i }))];
  roles.forEach((r, k) => {
    const w = new BrowserWindow({ x: (k % 3) * 640, y: Math.floor(k / 3) * 420, width: 620, height: 400, show: true, webPreferences: {
      backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false } });
    w.webContents.setWebRTCUDPPortRange({ min: PORT_BASE + k * BLOCK, max: PORT_BASE + k * BLOCK + BLOCK - 1 });
    roleOf.set(w.webContents.id, r.role === 'streamer' ? 'streamer' : 'viewer' + r.i);
    windows.push(w);
    w.webContents.on('render-process-gone', (_e, d) => console.log('renderer gone', r.role, r.i, JSON.stringify(d)));
    w.loadURL(`${cfg.url}lab/lab.html?role=${r.role}&i=${r.i}`);
  });
});
