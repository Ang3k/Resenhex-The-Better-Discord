// Prévia local da UI real com mídia sintética, sem contas ou permissões de captura.
// node tools/stream-preview.cjs → http://127.0.0.1:38148/?streams=2
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const app = express();
const publicDir = path.join(__dirname, '../public');
app.get('/config', (_req, res) => res.json({ hasOwner: true, maxUploadMb: 25 }));
app.get('/socket.io/socket.io.js', (_req, res) => res.type('js').send(`
window.io = () => ({ connected: false, on() {}, connect() {}, disconnect() {}, timeout() { return this; },
emit(event, payload, callback) { callback?.(null, { ok: true, unread: {}, messages: [] }); } });
`));
app.get('/app.js', (_req, res) => {
  const source = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
  const fixture = fs.readFileSync(path.join(__dirname, 'stream-preview-fixture.js'), 'utf8');
  res.type('js').send(source.replace(/\}\)\(\);\s*$/, fixture + '\n})();'));
});
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  res.type('html').send(html.replace('<head>', '<head><script>localStorage.removeItem("token"); localStorage.setItem("name", "Prévia visual");</script>'));
});
app.use(express.static(publicDir));
app.listen(Number(process.env.STREAM_PREVIEW_PORT) || 38148, '127.0.0.1', () => console.log('Prévia de transmissões: http://127.0.0.1:38148/?streams=2'));
