// UI real do Salão, com rede de imagens controlada e sem contas ou catálogo externo.
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const app = express();
const publicDir = path.join(__dirname, '../public');
const imageRequests = new Map();
const catalog = require('../mudae-catalogo.json');
const previewMudae = require('../mudae').createMudae({ catalog });
app.get('/preview-cards', (_req, res) => res.json([176754, 127691, 40, 'g-mario-178619'].map(previewMudae.card).filter(Boolean)));
app.get('/preview-stats', (req, res) => res.json(Object.fromEntries([...imageRequests].filter(([url]) =>
  new URL(url, 'http://preview.local').searchParams.get('session') === req.query.session))));
app.get('/config', (_req, res) => res.json({ hasOwner: true, maxUploadMb: 25 }));
app.get('/socket.io/socket.io.js', (_req, res) => res.type('js').send(`
window.previewSocketHandlers = new Map();
window.io = () => ({ connected: true, on(event, handler) { previewSocketHandlers.set(event, handler); },
connect() {}, disconnect() {}, timeout() { return this; }, emit(event, payload, callback) {
  let result = { ok: true, unread: {}, messages: [] };
  if (event === 'mudae:presence') result = { rollsLeft: 10, rollsMax: 10, claimReady: true, sources: { a: 20 } };
  if (event === 'mudae:profile') result = { summary: null };
  if (event === 'mudae:harem') result = window.salonPreviewHarem?.(payload.ownerId) || { ownerId: payload.ownerId, chars: [], total: 0, value: 0 };
  if (event === 'chat:send') window.salonPreviewRoll?.();
  callback?.(null, result);
} });`));
app.get('/portrait/:id.svg', (req, res) => {
  imageRequests.set(req.originalUrl, (imageRequests.get(req.originalUrl) || 0) + 1);
  const send = () => {
    res.set('Cache-Control', 'no-store');
    if (req.query.fail === '1') return res.status(404).end();
    const id = Number(req.params.id) || 1;
    const palettes = [['#9b78d4', '#1d2444'], ['#61b9af', '#162d42'], ['#ecb674', '#66436d'], ['#db83a2', '#2b2e62']];
    const [light, dark] = palettes[id % palettes.length];
    res.type('svg').send(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
      <path fill="url(#g)" d="M0 0h400v600H0z"/><circle cx="310" cy="125" r="90" fill="#fff" opacity=".12"/>
      <path d="M0 440 130 310 260 450 400 340V600H0" fill="${dark}" opacity=".6"/>
      <path d="M65 570q0-190 135-190t135 190" fill="${dark}"/><ellipse cx="200" cy="260" rx="90" ry="120" fill="#f2cfb6"/>
      <path d="M105 310V185q0-100 95-100t95 100v125l-30-140-55 70-50-40-35 110" fill="${dark}"/>
      <path d="m151 270 28 0m42 0 28 0" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>
      <path d="M181 320q19 16 38 0" fill="none" stroke="#c28586" stroke-width="5" stroke-linecap="round"/>
      <text x="24" y="555" fill="#fff" font-size="21" font-family="sans-serif" font-weight="bold">SALÃO · CARTA ${id}</text>
      <text x="24" y="581" fill="#fff" opacity=".7" font-size="14" font-family="sans-serif">Arte sintética para validação visual</text></svg>`);
  };
  setTimeout(send, Math.min(8000, Number(req.query.delay) || 0));
});
app.get('/mudae-salao.js', (req, res, next) => {
  if (req.query.baseline !== '1') return next();
  res.sendFile(path.join(__dirname, '../../artifacts/salon-showcase-qa/before/mudae-salao.js'));
});
app.get('/app.js', (_req, res) => {
  const source = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
  const fixture = fs.readFileSync(path.join(__dirname, 'salon-preview-fixture.js'), 'utf8');
  res.type('js').send(source.replace(/\}\)\(\);\s*$/, fixture + '\n})();'));
});
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  if (req.query.baseline === '1') html = html.replace('mudae-salao.js"', 'mudae-salao.js?baseline=1"');
  res.type('html').send(html.replace('<head>', '<head><script>localStorage.removeItem("token"); localStorage.setItem("name", "Prévia visual");localStorage.removeItem("mudaeSimple");</script>'));
});
app.use(express.static(publicDir));
app.listen(38149, '127.0.0.1', () => console.log('Prévia do Salão: http://127.0.0.1:38149/'));
