// Visualizador de imagens do chat: avançar e voltar entre as fotos do canal, ampliar
// (roda do mouse, duplo clique, botões ou + e -), arrastar a foto ampliada e baixar.
window.Lightbox = ({ el, Icon, root }) => {
  const MIN = 1;
  const MAX = 5;
  let items = [];
  let index = 0;
  let scale = 1, tx = 0, ty = 0;
  let drag = null;
  let returnFocus = null;
  let ui = null;

  const isOpen = () => !root.classList.contains('hidden');

  function apply() {
    ui.img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    ui.frame.classList.toggle('zoomed', scale > 1);
    ui.zoomOut.disabled = scale <= MIN;
    ui.zoomIn.disabled = scale >= MAX;
    ui.zoomLabel.textContent = Math.round(scale * 100) + '%';
  }

  // Amplia mantendo embaixo do cursor (ou do centro) o mesmo ponto da foto.
  function zoomTo(next, cx, cy) {
    next = Math.min(MAX, Math.max(MIN, next));
    const rect = ui.frame.getBoundingClientRect();
    const ox = (cx ?? rect.left + rect.width / 2) - (rect.left + rect.width / 2);
    const oy = (cy ?? rect.top + rect.height / 2) - (rect.top + rect.height / 2);
    tx = ox - (ox - tx) * (next / scale);
    ty = oy - (oy - ty) * (next / scale);
    scale = next;
    if (scale === 1) tx = ty = 0;
    apply();
  }

  function show(i) {
    index = (i + items.length) % items.length;
    const item = items[index];
    scale = 1; tx = ty = 0;
    ui.frame.classList.add('loading');
    ui.img.onload = () => ui.frame.classList.remove('loading');
    ui.img.onerror = () => ui.frame.classList.remove('loading');
    ui.img.src = item.url;
    ui.img.alt = item.name || '';
    ui.name.textContent = item.name || 'Imagem';
    ui.meta.textContent = [items.length > 1 ? `${index + 1} de ${items.length}` : '', item.meta || ''].filter(Boolean).join(' · ');
    ui.download.href = item.url;
    ui.download.download = item.name || '';
    ui.original.href = item.url;
    ui.prev.classList.toggle('hidden', items.length < 2);
    ui.next.classList.toggle('hidden', items.length < 2);
    ui.thumbs.classList.toggle('hidden', items.length < 2);
    ui.thumbs.querySelectorAll('.lb-thumb').forEach((t, n) => t.classList.toggle('active', n === index));
    ui.thumbs.querySelector('.lb-thumb.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    apply();
  }

  function build() {
    const button = (icon, label, onclick, cls = '') => el('button', { type: 'button', class: 'lb-btn ' + cls, ariaLabel: label, data: { tip: label }, onclick: (e) => { e.stopPropagation(); onclick(); } }, Icon(icon, 20));
    const link = (icon, label, attrs) => el('a', { class: 'lb-btn', ariaLabel: label, data: { tip: label }, onclick: (e) => e.stopPropagation(), ...attrs }, Icon(icon, 20));
    const img = el('img', { class: 'lb-img', draggable: false, alt: '' });
    const frame = el('div', { class: 'lb-frame' }, img, el('div', { class: 'lb-spinner', ariaHidden: 'true' }));
    const zoomLabel = el('span', { class: 'lb-zoom-label' });
    const zoomOut = button('zoomOut', 'Diminuir', () => zoomTo(scale / 1.5));
    const zoomIn = button('zoomIn', 'Ampliar', () => zoomTo(scale * 1.5));
    const download = link('download', 'Baixar', { href: '#', download: '' });
    const original = link('externalLink', 'Abrir original', { href: '#', target: '_blank', rel: 'noopener noreferrer' });
    const name = el('strong', { class: 'lb-name' });
    const meta = el('small', { class: 'lb-meta' });
    const prev = button('chevronLeft', 'Anterior (←)', () => show(index - 1), 'lb-nav prev');
    const next = button('chevronRight', 'Próxima (→)', () => show(index + 1), 'lb-nav next');
    const thumbs = el('div', { class: 'lb-thumbs', onclick: (e) => e.stopPropagation() });
    root.replaceChildren(
      el('div', { class: 'lb-top', onclick: (e) => e.stopPropagation() },
        el('div', { class: 'lb-info' }, name, meta),
        el('div', { class: 'lb-actions' }, zoomOut, zoomLabel, zoomIn, el('span', { class: 'lb-sep' }), download, original, button('x', 'Fechar (Esc)', close))),
      el('div', { class: 'lb-stage' }, prev, frame, next),
      thumbs);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Visualizador de imagens');
    root.onclick = (e) => { if (e.target === root || e.target.classList.contains('lb-stage') || e.target === frame) close(); };
    frame.onwheel = (e) => { e.preventDefault(); zoomTo(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); };
    img.ondblclick = (e) => { e.stopPropagation(); zoomTo(scale > 1 ? 1 : 2.5, e.clientX, e.clientY); };
    img.onclick = (e) => e.stopPropagation();
    img.onpointerdown = (e) => {
      if (scale <= 1) return;
      e.preventDefault();
      drag = { x: e.clientX - tx, y: e.clientY - ty };
      img.setPointerCapture(e.pointerId);
      frame.classList.add('dragging');
    };
    img.onpointermove = (e) => { if (!drag) return; tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); };
    img.onpointerup = img.onpointercancel = () => { drag = null; frame.classList.remove('dragging'); };
    ui = { img, frame, zoomLabel, zoomOut, zoomIn, download, original, name, meta, prev, next, thumbs };
  }

  function onKey(e) {
    if (!isOpen()) return;
    const actions = { ArrowLeft: () => show(index - 1), ArrowRight: () => show(index + 1), Escape: close,
      '+': () => zoomTo(scale * 1.5), '=': () => zoomTo(scale * 1.5), '-': () => zoomTo(scale / 1.5), '0': () => zoomTo(1) };
    const run = actions[e.key];
    if (!run || e.ctrlKey || e.metaKey || e.altKey) return;
    if (items.length < 2 && e.key.startsWith('Arrow')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    run();
  }

  function open(list, start = 0) {
    if (!list.length) return;
    if (!ui) build();
    items = list;
    ui.thumbs.replaceChildren(...items.map((item, n) => el('button', { type: 'button', class: 'lb-thumb', ariaLabel: 'Ver imagem ' + (n + 1), onclick: () => show(n) },
      el('img', { src: item.thumb || item.url, alt: '', loading: 'lazy', draggable: false }))));
    returnFocus = document.activeElement;
    root.classList.remove('hidden');
    document.addEventListener('keydown', onKey, true);
    show(start);
    root.querySelector('.lb-actions .lb-btn:last-child')?.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen()) return;
    root.classList.add('hidden');
    document.removeEventListener('keydown', onKey, true);
    ui.img.removeAttribute('src');
    returnFocus?.focus?.({ preventScroll: true });
  }

  return { open, close, isOpen };
};
