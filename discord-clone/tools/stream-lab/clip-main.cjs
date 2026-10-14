// Electron (processo principal) que renderiza um clipe quadro a quadro e grava Y4M via ffmpeg.
// Chamado por clips.cjs dentro do xvfb-run; não use direto.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { desktopPage, GAME, GAME_HARD } = require('./clip-pages.cjs');

const { kind, out, frames, fps } = JSON.parse(process.env.CLIP_JOB);
const ROOT = path.join(__dirname, '../..');
const THREE = path.join(ROOT, 'node_modules/three/build');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

function page() {
  if (kind === 'desktop') {
    const lines = (file, count) => fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').slice(0, count);
    return desktopPage(lines('public/app.js', 1600), lines('server.js', 900));
  }
  return kind === 'game-hard' ? GAME_HARD : GAME;
}

app.whenReady().then(async () => {
  const html = page();
  const server = http.createServer((req, res) => {
    if (req.url === '/three.module.js' || req.url === '/three.core.js') { res.setHeader('Content-Type', 'text/javascript'); fs.createReadStream(path.join(THREE, req.url)).pipe(res); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const win = new BrowserWindow({ width: 1920, height: 1080, useContentSize: true, frame: false, show: true, x: 0, y: 0, webPreferences: { backgroundThrottling: false } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  await win.webContents.executeJavaScript(`new Promise((resolve) => { const ready = () => typeof window.setFrame === 'function' ? document.fonts.ready.then(resolve) : setTimeout(ready, 50); ready(); })`);
  const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-pix_fmt', 'yuv420p', '-f', 'yuv4mpegpipe', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < frames; i++) {
    // Dois quadros de animação garantem que a cena desenhada já foi composta antes da captura.
    await win.webContents.executeJavaScript(`window.setFrame(${i}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1920, height: 1080 });
    const size = image.getSize();
    if (size.width !== 1920 || size.height !== 1080) throw new Error(`Quadro ${i} saiu com ${size.width}x${size.height}; confira a tela do Xvfb.`);
    if (!ffmpeg.stdin.write(image.toPNG())) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`${kind}: quadro ${i}/${frames}`);
  }
  ffmpeg.stdin.end();
  await new Promise((r) => ffmpeg.on('close', r));
  server.close();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
