// Prévias de links: título, descrição e imagem (Open Graph) da página, como os cartões do Discord.
// O servidor busca a página, então nada de alcançar a rede interna: endereços privados, portas
// estranhas e redirecionamentos para eles são recusados em cada salto.
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const crypto = require('node:crypto');

const PORTS = new Set(['', '80', '443', '8080', '8443']);
const UA = 'Mozilla/5.0 (compatible; ResenhexBot/1.0; +https://resenhex.duckdns.org) link preview';
const MAX_HTML = 768 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;
const TIMEOUT = 6000;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // url -> { at, value: Promise }

const toInt = (ip) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
const V4_BLOCKED = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]];
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const n = toInt(ip);
    return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (toInt(base) >>> (32 - bits)));
  }
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivate(mapped[1]);
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('64:ff9b') || v.startsWith('2001:db8');
}

// Resolve o nome e recusa se qualquer endereço for interno (evita DNS que aponta para a rede local).
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some((a) => isPrivate(a.address))) return callback(Object.assign(new Error('Endereço bloqueado'), { code: 'EBLOCKED' }));
    if (options?.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

function checkUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !PORTS.has(url.port)) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (net.isIP(host) && isPrivate(host)) return null;
  return url;
}

// GET com limite de tamanho e de tempo, seguindo até 4 redirecionamentos (cada um conferido de novo).
function fetchLimited(raw, { maxBytes, accept }, hops = 0) {
  return new Promise((resolve, reject) => {
    const url = checkUrl(raw);
    if (!url) return reject(new Error('URL não permitida'));
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(url, { lookup: safeLookup, timeout: TIMEOUT, headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (hops >= 4) return reject(new Error('Redirecionamentos demais'));
        return resolve(fetchLimited(new URL(res.headers.location, url).href, { maxBytes, accept }, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes))); res.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('close', () => resolve({ url: url.href, type: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks), truncated: size > maxBytes }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado')));
    req.on('error', reject);
    // Tempo total, não só de inatividade: um site lento não segura a prévia para sempre.
    setTimeout(() => req.destroy(new Error('Tempo esgotado')), TIMEOUT * 2).unref();
  });
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code) => {
  if (code[0] === '#') {
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
  }
  return ENTITIES[code.toLowerCase()] ?? all;
});
const clean = (s, max) => {
  const text = decodeEntities(String(s || '')).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
};

function decodeHtml(buffer, type) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(type)?.[1];
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buffer.subarray(0, 4096).toString('latin1'))?.[1];
  for (const charset of [fromHeader, fromMeta, 'utf-8']) {
    if (!charset) continue;
    try { return new TextDecoder(charset.toLowerCase()).decode(buffer); } catch {}
  }
  return buffer.toString('utf8');
}

function parseMeta(html) {
  const end = html.search(/<\/head>/i);
  const head = end > 0 ? html.slice(0, end) : html;
  const meta = {};
  for (const [tag] of head.matchAll(/<meta\s[^>]*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content != null && !(key in meta)) meta[key] = attrs.content;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  return { meta, title };
}

const YOUTUBE = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)$/i;
function youtubeId(url) {
  if (!YOUTUBE.test(url.hostname)) return null;
  if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1, 12) || null;
  return url.searchParams.get('v') || /^\/(?:shorts|live|embed)\/([\w-]{11})/.exec(url.pathname)?.[1] || null;
}

async function build(raw) {
  const url = checkUrl(raw);
  if (!url) return null;
  const id = youtubeId(url);
  if (id) {
    // O YouTube responde a prévia pelo oEmbed, sem baixar a página inteira.
    const res = await fetchLimited(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { maxBytes: 64 * 1024, accept: 'application/json' });
    const data = JSON.parse(res.body.toString('utf8'));
    return { url: url.href, kind: 'video', siteName: 'YouTube', title: clean(data.title, 200), author: clean(data.author_name, 100),
      image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, large: true, color: '#ff0033' };
  }
  const res = await fetchLimited(url.href, { maxBytes: MAX_HTML, accept: 'text/html,application/xhtml+xml;q=0.9,image/*;q=0.8,*/*;q=0.5' });
  const type = res.type.toLowerCase();
  if (/^image\/(png|jpe?g|gif|webp|avif)/.test(type)) return { url: url.href, kind: 'image', image: res.url, large: true };
  if (!type.includes('html')) return null;
  const { meta, title } = parseMeta(decodeHtml(res.body, res.type));
  const pick = (...keys) => keys.map((k) => meta[k]).find((v) => v && v.trim());
  const name = clean(pick('og:title', 'twitter:title') || title, 200);
  const description = clean(pick('og:description', 'twitter:description', 'description'), 350);
  let image = pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  try { image = image ? new URL(decodeEntities(image.trim()), res.url).href : null; } catch { image = null; }
  if (image && !checkUrl(image)) image = null;
  if (!name && !description && !image) return null;
  const card = pick('twitter:card');
  const width = Number(pick('og:image:width')) || 0;
  const color = /^#[0-9a-f]{6}$/i.test(pick('theme-color') || '') ? pick('theme-color') : null;
  return { url: url.href, kind: 'link', siteName: clean(pick('og:site_name', 'application-name') || new URL(res.url).hostname.replace(/^www\./, ''), 80),
    title: name, description, image, large: !!image && card !== 'summary' && !(width && width < 300), color };
}

function preview(raw) {
  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = build(raw).catch(() => null);
  cache.set(raw, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

// Links da mensagem que ganham prévia: fora de blocos de código e sem <> em volta (como no Discord).
function linksIn(text) {
  const plain = String(text || '').replace(/```[\s\S]*?```|`[^`\n]+`/g, ' ');
  const links = [];
  for (const m of plain.matchAll(/(<)?(https?:\/\/[^\s<>]+[^\s<>.,:;"')\]!?])(>)?/g)) {
    if (m[1] && m[3]) continue;
    if (!links.includes(m[2])) links.push(m[2]);
    if (links.length >= 3) break;
  }
  return links;
}

async function previews(text) {
  const results = await Promise.all(linksIn(text).map(preview));
  return results.filter(Boolean);
}

// Imagens das prévias passam pelo servidor (assinadas), para a página de quem lê não revelar o IP
// a cada site citado e para não virar um proxy aberto.
function imageProxy(secret) {
  const sign = (url) => crypto.createHmac('sha256', secret).update(url).digest('base64url').slice(0, 32);
  const proxied = (url) => (url ? `/link-image?u=${encodeURIComponent(url)}&s=${sign(url)}` : null);
  async function handle(req, res) {
    const url = String(req.query.u || '');
    const sig = String(req.query.s || '');
    const expected = sign(url);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return res.status(403).end();
    try {
      const image = await fetchLimited(url, { maxBytes: MAX_IMAGE, accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9' });
      const type = image.type.split(';')[0].trim().toLowerCase();
      if (image.truncated || !/^image\/(png|jpeg|gif|webp|avif)$/.test(type)) return res.status(415).end();
      res.set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'public, max-age=86400' });
      res.end(image.body);
    } catch { res.status(502).end(); }
  }
  return { proxied, handle };
}

module.exports = { previews, linksIn, imageProxy, isPrivate, checkUrl };
