// Busca de músicas no YouTube para o DJ. Usa a mesma API interna que o site do YouTube usa para
// pesquisar (InnerTube): não tem cota e funciona de servidor. O áudio NÃO passa por aqui: cada
// pessoa toca o vídeo no player oficial do YouTube, no próprio navegador.
const CLIENT = { clientName: 'WEB', clientVersion: '2.20260901.00.00', hl: 'pt', gl: 'BR' };
const ONLY_VIDEOS = 'EgIQAQ%3D%3D';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const MAX_RESULTS = 8;
const SEARCH_TTL = 30 * 60_000;
const VIDEO_TTL = 6 * 60 * 60_000;

const VIDEO_ID = /^[\w-]{11}$/;

// Aceita links de vídeo, shorts, lives, youtu.be e YouTube Music. Devolve o id ou null.
function videoIdFrom(text) {
  let url;
  try { url = new URL(String(text).trim()); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') || (/^\/(shorts|live|embed)\/([^/?#]+)/.exec(url.pathname) || [])[2];
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

// "4:41" -> 281; "1:02:03" -> 3723.
function parseDuration(text) {
  if (!/^\d+(:\d{1,2}){0,2}$/.test(text || '')) return null;
  return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

const textOf = (node) => node?.simpleText ?? (node?.runs || []).map((run) => run.text).join('');

function trackFrom(renderer) {
  if (!VIDEO_ID.test(renderer?.videoId || '')) return null;
  const live = !renderer.lengthText || (renderer.badges || []).some((b) => b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW');
  const duration = live ? null : parseDuration(textOf(renderer.lengthText));
  const title = textOf(renderer.title).trim().slice(0, 200);
  if (!title || (!live && !duration)) return null;
  return { videoId: renderer.videoId, title, author: textOf(renderer.ownerText || renderer.longBylineText).trim().slice(0, 100), duration, live };
}

// Os resultados vêm como "videoRenderer" no meio de uma árvore grande; anúncios e
// prateleiras ("shelves") têm outros nomes e ficam de fora.
function parseSearch(json) {
  const found = [];
  const seen = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object' || found.length >= 40) return;
    if (node.videoRenderer) {
      const track = trackFrom(node.videoRenderer);
      if (track && !seen.has(track.videoId)) { seen.add(track.videoId); found.push(track); }
      return;
    }
    for (const value of Array.isArray(node) ? node : Object.values(node)) walk(value);
  })(json);
  return found;
}

function boundedSet(map, key, value, max) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
}

// origin: só os testes trocam, para um YouTube de mentira local.
function youtubeSearch({ fetch = globalThis.fetch, now = Date.now, origin = 'https://www.youtube.com' } = {}) {
  const SEARCH_URL = origin + '/youtubei/v1/search?prettyPrint=false';
  const OEMBED_URL = origin + '/oembed?format=json&url=';
  const searches = new Map(); // termo normalizado -> { items, at }
  const videos = new Map(); // videoId -> { track, at }
  const normalize = (q) => String(q || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
  const remember = (track) => boundedSet(videos, track.videoId, { track, at: now() }, 2000);

  async function request(url, init) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      const error = new Error('O YouTube não respondeu à busca. Tente de novo em instantes.');
      error.status = res.status;
      throw error;
    }
    return res.json();
  }

  async function searchText(query) {
    const json = await request(SEARCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT, 'accept-language': 'pt-BR,pt;q=0.9' },
      body: JSON.stringify({ context: { client: CLIENT }, query, params: ONLY_VIDEOS }),
    });
    return parseSearch(json);
  }

  // Link colado: procura o próprio id (traz duração e canal); se não achar, o oEmbed dá pelo
  // menos o título. O oEmbed responde 401 quando o dono não deixa tocar fora do YouTube.
  async function lookup(id) {
    const exact = (await searchText(id).catch(() => [])).find((track) => track.videoId === id);
    if (exact) return exact;
    const res = await fetch(OEMBED_URL + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) throw new Error('O dono desse vídeo não deixa ele tocar fora do YouTube.');
    if (!res.ok) throw new Error('Não encontrei esse vídeo no YouTube.');
    const info = await res.json();
    return { videoId: id, title: String(info.title || 'Vídeo do YouTube').slice(0, 200), author: String(info.author_name || '').slice(0, 100), duration: null, live: false };
  }

  async function search(raw) {
    const key = normalize(raw);
    if (!key) throw new Error('Digite o nome de uma música ou cole um link do YouTube.');
    const hit = searches.get(key);
    if (hit && now() - hit.at < SEARCH_TTL) return hit.items;
    const id = videoIdFrom(raw);
    const items = id ? [await lookup(id)] : (await searchText(key)).slice(0, MAX_RESULTS);
    items.forEach(remember);
    boundedSet(searches, key, { items, at: now() }, 300);
    return items;
  }

  // Só toca o que saiu de uma busca feita aqui: ninguém inventa título ou duração pelo socket.
  function known(videoId) {
    const hit = videos.get(videoId);
    return hit && now() - hit.at < VIDEO_TTL ? hit.track : null;
  }

  // Outras versões da mesma busca, para trocar quando um clipe não pode tocar fora do YouTube.
  function alternatives(query, videoId, max = 3) {
    const hit = searches.get(normalize(query));
    return hit ? hit.items.filter((track) => track.videoId !== videoId && !track.live).slice(0, max) : [];
  }

  return { search, known, alternatives };
}

module.exports = { youtubeSearch, parseSearch, parseDuration, videoIdFrom };
