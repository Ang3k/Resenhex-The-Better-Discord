// Servidor do laboratório: página e papéis, quadros de referência dos clipes, módulos de mídia do app
// (da árvore de trabalho ou de um commit), SDK e tokens do LiveKit, e coleta dos resultados.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { ROOT, clipFile } = require('./paths.cjs');
const { AccessToken } = require(require.resolve('livekit-server-sdk', { paths: [ROOT] }));

const clips = new Map();
function clip(name) {
  if (clips.has(name)) return clips.get(name);
  const file = clipFile(name), fd = fs.openSync(file, 'r'), head = Buffer.alloc(256);
  fs.readSync(fd, head, 0, 256, 0);
  const headerEnd = head.indexOf(10), header = head.subarray(0, headerEnd).toString();
  const W = Number(/ W(\d+)/.exec(header)[1]), H = Number(/ H(\d+)/.exec(header)[1]), frameBytes = W * H * 3 / 2;
  const info = { fd, W, H, frameBytes, offset: headerEnd + 1, stride: frameBytes + 6, count: Math.floor((fs.statSync(file).size - headerEnd - 1) / (frameBytes + 6)) };
  clips.set(name, info);
  return info;
}

// "working" = public/ atual; qualquer outro nome é uma referência do git (ex.: um commit anterior).
const modules = new Map();
function appModule(variant, file) {
  if (!/^[\w.-]+\.js$/.test(file) || !/^[\w.~^-]+$/.test(variant)) throw new Error('Módulo inválido.');
  const key = variant + ':' + file;
  if (!modules.has(key)) {
    const source = (name) => variant === 'working' ? fs.readFileSync(path.join(ROOT, 'public', name), 'utf8')
      : execFileSync('git', ['show', `${variant}:discord-clone/public/${name}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
    if (file === 'prefer-codec.js') { // preferCodec vive dentro do app.js
      const src = source('app.js'), start = src.indexOf('  function preferCodec(pc, sender, mimes) {');
      let depth = 0, end = start;
      for (let i = src.indexOf('{', start); i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i + 1; break; } }
      modules.set(key, src.slice(start, end) + '\nwindow.preferCodec = preferCodec;');
    } else modules.set(key, source(file));
  }
  return modules.get(key);
}

let current = {}, parts = null, wanted = 0, done = null, onGo = null;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://lab');
  const body = async () => { let text = ''; for await (const chunk of req) text += chunk; return text; };
  try {
    if (url.pathname.startsWith('/lab/')) {
      const file = url.pathname.slice(5);
      if (!['lab.html', 'viewer.js', 'streamer.js'].includes(file)) throw new Error('Arquivo inválido.');
      res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript');
      return res.end(fs.readFileSync(path.join(__dirname, file)));
    }
    if (url.pathname === '/ref') { // quadro i do clipe, I420 cru
      const c = clip(url.searchParams.get('clip')), i = Number(url.searchParams.get('i')) % c.count, buf = Buffer.alloc(c.frameBytes);
      fs.readSync(c.fd, buf, 0, c.frameBytes, c.offset + i * c.stride + 6);
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.end(buf);
    }
    if (url.pathname === '/clipinfo') { const c = clip(url.searchParams.get('clip')); return res.end(JSON.stringify({ W: c.W, H: c.H, count: c.count })); }
    if (url.pathname.startsWith('/app/')) { const [, , variant, file] = url.pathname.split('/'); res.setHeader('Content-Type', 'text/javascript'); return res.end(appModule(variant, file)); }
    if (url.pathname === '/livekit-client.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(path.dirname(require.resolve('livekit-client', { paths: [ROOT] })), 'livekit-client.umd.js'))); }
    if (url.pathname === '/token') {
      const token = new AccessToken('lab-key', 'lab-secret-only-for-local-tests-1234567890', { identity: url.searchParams.get('id'), ttl: '10m' });
      token.addGrant({ roomJoin: true, room: url.searchParams.get('room') || 'lab', canPublish: true, canSubscribe: true });
      return res.end(JSON.stringify({ url: 'ws://127.0.0.1:7880', token: await token.toJwt() }));
    }
    if (url.pathname === '/config') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(current)); }
    if (url.pathname === '/go' && req.method === 'POST') { const at = Number(await body()); res.end('ok'); onGo?.(at); return; }
    if (url.pathname === '/result' && req.method === 'POST') {
      const text = await body(); res.end('ok');
      if (parts) { parts[url.searchParams.get('role') + url.searchParams.get('i')] = JSON.parse(text); if (Object.keys(parts).length >= wanted) done?.(parts); }
      return;
    }
    if (url.pathname === '/log' && req.method === 'POST') { console.log('[página]', (await body()).slice(0, 400)); return res.end('ok'); }
    res.statusCode = 404; res.end();
  } catch (error) { res.statusCode = 500; res.end(String(error.stack || error)); }
});

module.exports = {
  start: (port) => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server.address().port))),
  stop: () => server.close(),
  setConfig: (cfg) => { current = cfg; },
  onGo: (fn) => { onGo = fn; },
  waitParts: (count, ms) => new Promise((resolve, reject) => {
    parts = {}; wanted = count;
    const timer = setTimeout(() => { const partial = parts; parts = null; done = null; reject(Object.assign(new Error('tempo esgotado'), { partial })); }, ms);
    done = (result) => { clearTimeout(timer); parts = null; done = null; resolve(result); };
  }),
};
