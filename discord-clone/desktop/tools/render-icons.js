// Gera os ícones do app (instalador, janela, bandeja, selos da barra de tarefas e
// blocos do pacote da Microsoft Store) a partir do logo do Resenhex. Rode com: npm run icons
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#c64cf0"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><path fill="white" d="M16 6c-5.5 0-10 4-10 8.9 0 2.7 1.3 5 3.4 6.7l-.9 3.6a.6.6 0 0 0 .9.7l4.1-2.1c.8.2 1.6.2 2.5.2 5.5 0 10-4 10-8.9S21.5 6 16 6z"/><path stroke="#8a55f5" stroke-width="2.2" stroke-linecap="round" d="M12.5 11.5l7 6M19.5 11.5l-7 6"/></svg>`;

// Roda dentro da página: desenha cada imagem num canvas e devolve PNGs em base64.
async function draw(logo) {
  const img = new Image();
  img.src = 'data:image/svg+xml,' + encodeURIComponent(logo);
  await img.decode();
  const out = {};
  const canvas = (size) => { const c = document.createElement('canvas'); c.width = c.height = size; return [c, c.getContext('2d')]; };
  const png = (c) => c.toDataURL('image/png').split(',')[1];
  const dot = (ctx, x, y, r, ring) => {
    ctx.beginPath(); ctx.arc(x, y, r + ring, 0, Math.PI * 2); ctx.fillStyle = '#1e1f22'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#f23f43'; ctx.fill();
  };
  for (const [name, size] of [['icon-512', 512], ['icon-256', 256], ['tray', 32]]) {
    const [c, ctx] = canvas(size);
    ctx.drawImage(img, 0, 0, size, size);
    out[name] = png(c);
  }
  { // Bandeja com bolinha vermelha de não lidas.
    const [c, ctx] = canvas(32);
    ctx.drawImage(img, 0, 0, 32, 32);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(25, 25, 9, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.arc(25, 25, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#f23f43'; ctx.fill();
    out['tray-unread'] = png(c);
  }
  // Selos da barra de tarefas (16 px na tela, desenhados em 32 para telas de alta densidade).
  const labels = { 'badge-dot': '', 'badge-9plus': '9+' };
  for (let n = 1; n <= 9; n++) labels['badge-' + n] = String(n);
  for (const [name, label] of Object.entries(labels)) {
    const [c, ctx] = canvas(32);
    if (!label) dot(ctx, 16, 16, 9, 0);
    else {
      dot(ctx, 16, 16, 15, 0);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${label.length > 1 ? 17 : 21}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 16, 17);
    }
    out[name] = png(c);
  }
  // Pacote da Microsoft Store: ícones em cada escala do Windows, sobre fundo transparente.
  const tile = (width, height, logoSize) => {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d').drawImage(img, (width - logoSize) / 2, (height - logoSize) / 2, logoSize, logoSize);
    return png(c);
  };
  for (const scale of [100, 200, 400]) {
    const k = scale / 100;
    out[`appx/Square44x44Logo.scale-${scale}`] = tile(44 * k, 44 * k, 44 * k);
    out[`appx/StoreLogo.scale-${scale}`] = tile(50 * k, 50 * k, 50 * k);
    out[`appx/Square150x150Logo.scale-${scale}`] = tile(150 * k, 150 * k, 80 * k);
    out[`appx/Wide310x150Logo.scale-${scale}`] = tile(310 * k, 150 * k, 80 * k);
  }
  // Barra de tarefas e menu Iniciar usam os tamanhos exatos, sem a placa colorida atrás.
  for (const size of [16, 24, 32, 48, 256]) {
    out[`appx/Square44x44Logo.targetsize-${size}`] = tile(size, size, size);
    out[`appx/Square44x44Logo.targetsize-${size}_altform-unplated`] = tile(size, size, size);
  }
  out['store/logo-1080'] = tile(1080, 1080, 1080); // logo da página na loja
  return out;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const images = await win.webContents.executeJavaScript(`(${draw})(${JSON.stringify(LOGO)})`);
  const root = path.join(__dirname, '..');
  const target = (name) => {
    if (name === 'icon-512') return path.join(root, 'build', 'icon.png');
    if (name.startsWith('appx/')) return path.join(root, 'build', name + '.png');
    if (name.startsWith('store/')) return path.join(root, name + '.png');
    return path.join(root, 'assets', (name === 'icon-256' ? 'icon' : name) + '.png');
  };
  for (const [name, data] of Object.entries(images)) {
    fs.mkdirSync(path.dirname(target(name)), { recursive: true });
    fs.writeFileSync(target(name), Buffer.from(data, 'base64'));
    console.log('gerado', path.relative(root, target(name)));
  }
  app.quit();
});
