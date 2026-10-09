// Seletor de emojis: busca em português (e inglês), categorias, usados recentemente e os
// emojis próprios do servidor. O catálogo (emoji-data.json, gerado por tools/emoji-data.js)
// só é baixado na primeira vez que o painel abre.
window.EmojiPicker = ({ el, Icon, root, getCustom }) => {
  const RECENT_KEY = 'emojiRecent';
  const RECENT_MAX = 27;
  // Enquanto a pessoa não usou nada, "Frequentes" mostra estes.
  const POPULAR = ['👍', '😂', '❤️', '🔥', '😭', '🤣', '👀', '💀', '🙏', '😎', '🤔', '🥳', '👏', '💯', '😅', '😍', '🥺', '😡', '🎉', '✅', '❌', '🗿', '🤡', '😮', '😢', '👑', '🍕'];
  const GROUPS = [
    ['smileys', 'Carinhas e emoções', '😀'],
    ['people', 'Pessoas e corpo', '👋'],
    ['nature', 'Animais e natureza', '🐻'],
    ['food', 'Comidas e bebidas', '🍔'],
    ['activities', 'Atividades', '⚽'],
    ['travel', 'Viagens e lugares', '✈️'],
    ['objects', 'Objetos', '💡'],
    ['symbols', 'Símbolos', '💕'],
    ['flags', 'Bandeiras', '🏁'],
  ];

  let data = null; // { smileys: [[emoji, nome, palavras]], ... }
  let loading = null;
  let onPick = null;
  let query = '';
  let built = null; // { search, body, tabs, preview, sections }
  const byEmoji = new Map(); // emoji -> [emoji, nome, palavras]

  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
  const writeRecent = (list) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch {} };
  const customToken = (e) => `<:${e.name}:${e.id}>`;

  function load() {
    if (data) return Promise.resolve(data);
    loading ||= fetch('emoji-data.json').then((r) => { if (!r.ok) throw new Error('falhou'); return r.json(); })
      .then((json) => { data = json; for (const list of Object.values(json)) for (const item of list) byEmoji.set(item[0], item); return data; })
      .catch(() => { loading = null; return null; });
    return loading;
  }

  const isOpen = () => !root.classList.contains('hidden');
  const close = () => root.classList.add('hidden');

  function pick(value, item) {
    writeRecent([value, ...readRecent().filter((v) => v !== value)]);
    close();
    onPick?.(value, item);
  }

  function showPreview(item) {
    if (!built) return;
    const [glyph, name] = item.custom ? [el('img', { src: item.url, alt: '' }), ':' + item.name + ':'] : [item[0], item[1]];
    built.preview.replaceChildren(el('span', { class: 'ep-preview-glyph' }, glyph), el('span', { class: 'ep-preview-name', textContent: name }));
  }

  function emojiButton(item) {
    if (item.custom) {
      return el('button', { type: 'button', class: 'ep-emoji custom', ariaLabel: ':' + item.name + ':', title: ':' + item.name + ':',
        onclick: () => pick(customToken(item), item), onmouseenter: () => showPreview(item), onfocus: () => showPreview(item) },
      el('img', { src: item.url, alt: '', loading: 'lazy', draggable: false }));
    }
    return el('button', { type: 'button', class: 'ep-emoji', textContent: item[0], ariaLabel: item[1], title: item[1],
      onclick: () => pick(item[0]), onmouseenter: () => showPreview(item), onfocus: () => showPreview(item) });
  }

  // Um item de "recentes" pode ser um emoji comum ou um do servidor (<:nome:id>).
  function recentItems() {
    const custom = getCustom();
    const list = readRecent().map((value) => {
      const m = /^<:(\w+):([0-9a-f]+)>$/.exec(value);
      if (m) { const c = custom.find((e) => e.id === m[2]); return c ? { ...c, custom: true } : null; }
      return byEmoji.get(value) || [value, '', ''];
    }).filter(Boolean);
    if (list.length) return { title: 'Usados recentemente', items: list };
    return { title: 'Frequentes', items: POPULAR.map((e) => byEmoji.get(e) || [e, '', '']) };
  }

  function section(key, title, items) {
    return el('section', { class: 'ep-section', data: { key } },
      el('h3', { class: 'ep-section-title', textContent: title }),
      el('div', { class: 'ep-grid' }, items.map(emojiButton)));
  }

  function renderBrowse() {
    const custom = getCustom().map((e) => ({ ...e, custom: true }));
    const recent = recentItems();
    const sections = [section('recent', recent.title, recent.items)];
    if (custom.length) sections.push(section('custom', 'Deste servidor', custom));
    if (data) for (const [key, title] of GROUPS) sections.push(section(key, title, data[key] || []));
    else sections.push(el('div', { class: 'ep-status' }, loading ? 'Carregando emojis…' : 'Não foi possível carregar todos os emojis.'));
    built.body.replaceChildren(...sections);
    built.body.scrollTop = 0;
    built.tabs.querySelectorAll('.ep-tab').forEach((tab) => {
      const has = !!built.body.querySelector(`.ep-section[data-key="${tab.dataset.key}"]`);
      tab.classList.toggle('hidden', !has);
    });
    syncTabs();
    showPreview(recent.items[0] || ['😀', 'rosto risonho', '']);
  }

  function renderSearch() {
    const words = norm(query).split(/\s+/).filter(Boolean);
    const matches = (text) => words.every((w) => text.includes(w));
    const custom = getCustom().filter((e) => matches(norm(e.name))).map((e) => ({ ...e, custom: true }));
    // Nome igual à busca vem primeiro, depois nome que começa com ela, depois os populares.
    const results = [];
    if (data) for (const list of Object.values(data)) for (const item of list) if (matches(item[2])) results.push(item);
    const typed = words.join(' ');
    const score = (item) => {
      const label = norm(item[1]);
      return (label === typed) * 8 + label.startsWith(typed) * 4 + label.split(' ').includes(words[0]) * 2 + POPULAR.includes(item[0]);
    };
    const scores = new Map(results.map((item) => [item, score(item)]));
    results.sort((a, b) => scores.get(b) - scores.get(a));
    const all = [...custom, ...results];
    if (!all.length) {
      built.body.replaceChildren(el('div', { class: 'ep-status' }, el('span', { class: 'ep-status-big', textContent: '🔎' }),
        el('strong', { textContent: 'Nenhum emoji encontrado' }), el('span', { textContent: 'Tente outra palavra, como "feliz", "fogo" ou "coração".' })));
      return;
    }
    built.body.replaceChildren(section('search', `Resultados para "${query.trim()}"`, all.slice(0, 300)));
    built.body.scrollTop = 0;
    showPreview(all[0]);
  }

  function render() { if (query.trim()) renderSearch(); else renderBrowse(); built.tabs.classList.toggle('searching', !!query.trim()); }

  // Marca a categoria visível enquanto a lista rola.
  function syncTabs() {
    if (!built || query.trim()) return;
    const top = built.body.getBoundingClientRect().top + 8;
    let current = null;
    for (const s of built.body.querySelectorAll('.ep-section')) if (s.getBoundingClientRect().top <= top) current = s.dataset.key;
    current ||= built.body.querySelector('.ep-section')?.dataset.key;
    built.tabs.querySelectorAll('.ep-tab').forEach((t) => t.classList.toggle('active', t.dataset.key === current));
  }

  function build() {
    const search = el('input', { type: 'search', class: 'ep-search', placeholder: 'Procure um emoji', ariaLabel: 'Procurar emoji', autocomplete: 'off', spellcheck: false });
    const body = el('div', { class: 'ep-body', onscroll: () => syncTabs() });
    const tab = (key, title, glyph) => el('button', { type: 'button', class: 'ep-tab', data: { key, tip: title }, ariaLabel: title,
      onclick: () => {
        const target = body.querySelector(`.ep-section[data-key="${key}"]`);
        if (target) body.scrollTo({ top: target.offsetTop - body.offsetTop, behavior: 'smooth' });
      } }, glyph);
    const tabs = el('nav', { class: 'ep-tabs', ariaLabel: 'Categorias de emoji' },
      tab('recent', 'Recentes', Icon('clock', 18)),
      tab('custom', 'Deste servidor', Icon('star', 18)),
      GROUPS.map(([key, title, glyph]) => tab(key, title, el('span', { class: 'ep-tab-glyph', textContent: glyph }))));
    const preview = el('div', { class: 'ep-preview', ariaHidden: 'true' });
    search.oninput = () => { query = search.value; render(); };
    search.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); body.querySelector('.ep-emoji')?.click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); body.querySelector('.ep-emoji')?.focus(); }
    };
    // Setas movem o foco pela grade.
    body.onkeydown = (e) => {
      const buttons = [...body.querySelectorAll('.ep-emoji')];
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      const cols = Math.max(1, Math.round(body.querySelector('.ep-grid').clientWidth / buttons[0].offsetWidth));
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (!move) return;
      e.preventDefault();
      const next = buttons[i + move];
      if (next) next.focus(); else if (move < 0) search.focus();
    };
    root.replaceChildren(el('div', { class: 'ep-head' }, el('span', { class: 'ep-search-icon' }, Icon('search', 16)), search),
      el('div', { class: 'ep-main' }, tabs, body), preview);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Seletor de emoji');
    built = { search, body, tabs, preview };
  }

  function position(anchor) {
    const a = anchor.getBoundingClientRect();
    const p = root.getBoundingClientRect();
    root.style.left = Math.max(8, Math.min(a.right - p.width, innerWidth - p.width - 8)) + 'px';
    const preferredTop = a.top - p.height - 8 > 8 ? a.top - p.height - 8 : a.bottom + 8;
    root.style.top = Math.max(8, Math.min(preferredTop, innerHeight - p.height - 8)) + 'px';
  }

  function open(anchor, pickFn) {
    onPick = pickFn;
    if (!built) build();
    query = ''; built.search.value = '';
    const pending = data ? null : load(); // antes do render, para ele mostrar "Carregando…"
    root.classList.remove('hidden');
    render();
    position(anchor);
    if (matchMedia('(pointer: fine)').matches) built.search.focus({ preventScroll: true });
    pending?.then(() => { if (isOpen() && root.contains(built.body)) render(); });
  }

  return { open, close, isOpen, preload: load };
};
