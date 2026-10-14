// GIFs do KLIPY. A busca acontece no navegador de quem usa (exigência do KLIPY); o servidor só
// recebe o GIF escolhido e guarda os links na mensagem, aceitando apenas a CDN deles.
const MEDIA_HOST = /^static\d*\.klipy\.com$/;
const MAX_URL = 512;
const MAX_SIDE = 4096;

function mediaUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MEDIA_HOST.test(url.hostname) && !url.username && !url.port ? url.href : null;
  } catch {
    return null;
  }
}

const side = (n) => Number.isInteger(n) && n > 0 && n <= MAX_SIDE;

function cleanGif(input) {
  const fail = () => { throw new Error('GIF inválido.'); };
  if (!input || typeof input !== 'object') fail();
  const url = mediaUrl(input.url);
  const webp = input.webp === undefined ? undefined : mediaUrl(input.webp);
  if (!url || webp === null || !side(input.width) || !side(input.height)) fail();
  if (typeof input.slug !== 'string' || !/^[\w-]{1,128}$/.test(input.slug)) fail();
  const gif = { slug: input.slug, title: String(input.title || '').trim().slice(0, 120), url };
  if (webp) gif.webp = webp;
  gif.width = input.width;
  gif.height = input.height;
  return gif;
}

module.exports = { cleanGif };
