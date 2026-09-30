// Optional browser smoke test. Synthetic media; no microphone/camera permissions.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Map([
  ['/', path.join(__dirname, 'media-smoke.html')],
  ['/media-policy.js', path.join(__dirname, '../public/media-policy.js')],
  ['/media-session.js', path.join(__dirname, '../public/media-session.js')],
]);
const port = Number(process.env.MEDIA_TEST_PORT) || 37914;
http.createServer((req, res) => {
  const file = files.get(req.url);
  if (!file) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Teste WebRTC: http://127.0.0.1:${port}/`));
