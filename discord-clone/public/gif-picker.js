// Seletor de GIFs (KLIPY). Pelas regras do KLIPY a busca sai do navegador de quem usa, direto
// para a API deles, e os GIFs carregam da CDN deles; o servidor só recebe o GIF escolhido.
window.GifPicker = ({ el, Icon, getKey, getUserId, onPick }) => {
  const API = 'https://api.klipy.com/api/v1/';
  const PER_PAGE = 24;
  const CACHE_MS = 5 * 60_000;
  const cache = new Map(); // "consulta|página" -> { at, data }: reabrir o painel não gasta busca

  let root = null;
  let anchor = null;
  let query = '';
  let page = 0;
  let hasNext = true;
  let loading = false;
  let generation = 0; // descarta respostas de uma busca que já foi trocada
  let debounce = null;
  let cols = [];
  let heights = [];

  const isOpen = () => !!root && !root.classList.contains('hidden');

  async function fetchPage(q, p) {
    const key = q + '|' + p;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const params = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE), customer_id: getUserId(), locale: 'br' });
    if (q) params.set('q', q);
    const res = await fetch(`${API}${encodeURIComponent(getKey())}/gifs/${q ? 'search' : 'trending'}?${params}`);
    if (res.status === 429) throw Object.assign(new Error('limite'), { limit: true });
    if (!res.ok) throw new Error('falhou');
    const body = await res.json();
    const data = { items: (body?.data?.data || []).filter((it) => it.type !== 'ad' && it.file?.sm), hasNext: !!body?.data?.has_next };
    cache.set(key, { at: Date.now(), data });
    return data;
  }

  // GIF que vai para a mensagem: tamanho médio, webp (bem mais leve) com o .gif de reserva.
  function toMessageGif(it) {
    const md = it.file.md || it.file.hd || it.file.sm;
    const gif = md.gif || it.file.sm.gif;
    return { slug: String(it.slug), title: String(it.title || ''), url: gif.url, webp: md.webp?.url, width: gif.width, height: gif.height };
  }

  function build() {
    root = el('div', { id: 'gif-picker', class: 'hidden', role: 'dialog', ariaLabel: 'GIFs' });
    const input = el('input', { class: 'gif-search', type: 'search', placeholder: 'Pesquisar no KLIPY', maxLength: 50, autocomplete: 'off', spellcheck: false });
    input.oninput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => search(input.value.trim()), 400);
    };
    input.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const body = el('div', { class: 'gif-body' });
    body.onscroll = () => { if (body.scrollTop + body.clientHeight > body.scrollHeight - 300) loadMore(); };
    root.append(
      el('div', { class: 'gif-head' }, el('span', { class: 'gif-search-icon' }, Icon('search', 16)), input),
      body,
      el('div', { class: 'gif-foot' }, el('span', { textContent: 'GIFs via ' }), el('strong', { textContent: 'KLIPY' })));
    document.body.append(root);
    document.addEventListener('pointerdown', (e) => {
      if (isOpen() && !root.contains(e.target) && !anchor?.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
    addEventListener('resize', () => isOpen() && place());
  }

  const $body = () => root.querySelector('.gif-body');
  const $input = () => root.querySelector('.gif-search');

  function resetGrid() {
    const body = $body();
    cols = [el('div', { class: 'gif-col' }), el('div', { class: 'gif-col' })];
    heights = [0, 0];
    body.replaceChildren(el('div', { class: 'gif-grid' }, cols));
    body.scrollTop = 0;
  }

  function status(text, retry) {
    $body().querySelector('.gif-status')?.remove();
    if (!text) return;
    $body().append(el('div', { class: 'gif-status' }, el('span', { textContent: text }),
      retry ? el('button', { type: 'button', class: 'gif-retry', textContent: 'Tentar de novo', onclick: retry }) : null));
  }

  // Cada GIF vai para a coluna mais baixa, mantendo a ordem dos resultados da esquerda para a direita.
  function addItems(items) {
    for (const it of items) {
      const preview = it.file.sm.webp || it.file.sm.gif;
      const ratio = preview.height / preview.width || 1;
      const col = heights[0] <= heights[1] ? 0 : 1;
      heights[col] += ratio;
      const title = it.title || 'GIF';
      cols[col].append(el('button', {
        type: 'button', class: 'gif-item', ariaLabel: title, style: { aspectRatio: `${preview.width} / ${preview.height}`, background: it.blur_preview ? `center / cover url("${it.blur_preview}")` : '' },
        onclick: () => { close(); onPick(toMessageGif(it)); },
      }, el('img', { src: preview.url, alt: '', loading: 'lazy', decoding: 'async', draggable: false })));
    }
  }

  async function load() {
    if (loading || !hasNext) return;
    loading = true;
    const mine = generation;
    const next = page + 1;
    if (next === 1) status('Carregando GIFs…');
    try {
      const data = await fetchPage(query, next);
      if (mine !== generation) return;
      status('');
      page = next;
      hasNext = data.hasNext && data.items.length > 0;
      addItems(data.items);
      if (page === 1 && !data.items.length) status(query ? `Nenhum GIF para "${query}".` : 'Nenhum GIF por aqui.');
    } catch (err) {
      if (mine !== generation) return;
      status(err.limit ? 'Muitas buscas de GIF agora. Tente de novo daqui a pouco.' : 'Não deu para carregar os GIFs.', () => { status(''); load(); });
    } finally {
      if (mine === generation) loading = false;
    }
    // Tela alta: se a primeira página não encheu o painel, já busca a próxima.
    const body = $body();
    if (mine === generation && hasNext && body.scrollHeight <= body.clientHeight + 40) load();
  }

  const loadMore = () => load();

  function search(q) {
    if (q === query && page) return;
    query = q;
    page = 0;
    hasNext = true;
    loading = false;
    generation++;
    resetGrid();
    load();
  }

  function place() {
    const a = anchor.getBoundingClientRect();
    const p = root.getBoundingClientRect();
    root.style.left = Math.max(8, Math.min(a.right - p.width, innerWidth - p.width - 8)) + 'px';
    const top = a.top - p.height - 8 > 8 ? a.top - p.height - 8 : a.bottom + 8;
    root.style.top = Math.max(8, Math.min(top, innerHeight - p.height - 8)) + 'px';
  }

  function open(from) {
    if (!root) build();
    anchor = from;
    anchor.classList.add('active');
    root.classList.remove('hidden');
    place();
    const input = $input();
    if (!page) search(input.value.trim());
    if (window.hasMouse?.()) { input.focus(); input.select(); }
  }

  function close() {
    if (!root) return;
    root.classList.add('hidden');
    anchor?.classList.remove('active');
    clearTimeout(debounce);
  }

  const toggle = (from) => (isOpen() ? close() : open(from));

  return { open, close, toggle, isOpen };
};
