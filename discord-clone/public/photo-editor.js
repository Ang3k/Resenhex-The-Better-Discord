// Framing shared by profile photos (square), banners (5:2) and backgrounds (4:5).
window.PhotoEditor = (() => {
  let active = null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const normal = (crop) => ({ x: clamp(Number(crop?.x ?? .5), 0, 1), y: clamp(Number(crop?.y ?? .5), 0, 1), zoom: clamp(Number(crop?.zoom ?? 1), 1, 4) });
  // Area of the original image shown by the frame: `aspect` is width / height of the frame.
  function rect(width, height, crop, aspect = 1) {
    const c = normal(crop), cover = Math.min(width, height * aspect);
    const w = cover / c.zoom, h = cover / aspect / c.zoom;
    return { x: (width - w) * c.x, y: (height - h) * c.y, w, h, side: w };
  }
  function style(image, crop) {
    const c = normal(crop);
    Object.assign(image.style, { objectPosition: `${c.x * 100}% ${c.y * 100}%`, transformOrigin: `${c.x * 100}% ${c.y * 100}%`, transform: `scale(${c.zoom})` });
  }
  const node = (tag, props = {}, ...children) => {
    const element = document.createElement(tag);
    Object.assign(element, props); element.append(...children); return element;
  };
  function cancel() { if (active) { active.cancelled = true; active.close?.(null); } }
  const KINDS = {
    photo: { aspect: 1, width: 256, height: 256, maxGifSide: 1024, title: 'Ajustar foto', text: 'Arraste a imagem e ajuste o zoom. A área circular mostra como ficará seu perfil.' },
    banner: { aspect: 5 / 2, width: 600, height: 240, maxGifSide: 1500, title: 'Ajustar banner', text: 'Arraste a imagem e ajuste o zoom. A área destacada mostra como o banner aparece no seu perfil.' },
    background: { aspect: 4 / 5, width: 480, height: 600, maxGifSide: 1500, title: 'Ajustar fundo', text: 'Arraste a imagem e ajuste o zoom. Ela fica atrás do seu nome e das informações do perfil, abaixo do banner.' },
  };
  async function edit({ file, url, crop, kind = 'photo' }) {
    const k = KINDS[kind];
    cancel();
    const session = { cancelled: false, close: null }; active = session;
    let sourceUrl;
    try {
      const blob = file || await fetch(url).then((r) => { if (!r.ok) throw new Error('Não foi possível abrir a foto.'); return r.blob(); });
      const gif = blob.type === 'image/gif';
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type) || blob.size > (gif ? 5 : 8) * 1024 * 1024) throw new Error('Use PNG, JPG ou WebP de até 8 MB, ou GIF de até 5 MB.');
      sourceUrl = URL.createObjectURL(blob);
      const image = node('img', { src: sourceUrl, alt: { banner: 'Prévia do banner', background: 'Prévia do fundo' }[kind] || 'Prévia da foto', draggable: false });
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Não foi possível abrir essa imagem.')); });
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('A foto deve ter até 40 megapixels.');
      if (gif && Math.max(image.naturalWidth, image.naturalHeight) > k.maxGifSide) throw new Error(`O GIF deve ter até ${k.maxGifSide} pixels de largura e altura.`);
      if (session.cancelled) return null;
      return await new Promise((resolve) => {
        const returnFocus = document.activeElement, settings = document.getElementById('settings');
        const previousInert = settings.inert; settings.inert = true;
        let c = normal(crop), dragging = null, done = false;
        const view = node('div', { className: 'photo-crop-view ' + kind }, image, node('div', { className: 'photo-crop-mask' }));
        view.style.aspectRatio = String(k.aspect);
        const output = node('output');
        const zoom = node('input', { type: 'range', min: 1, max: 4, step: .01, value: c.zoom });
        const x = node('input', { type: 'range', min: 0, max: 1, step: .01, value: c.x });
        const y = node('input', { type: 'range', min: 0, max: 1, step: .01, value: c.y });
        const refresh = () => { zoom.value = c.zoom; x.value = c.x; y.value = c.y; output.textContent = `${Math.round(c.zoom * 100)}%`; style(image, c); };
        for (const [field, key] of [[zoom, 'zoom'], [x, 'x'], [y, 'y']]) field.oninput = () => { c[key] = Number(field.value); refresh(); };
        const close = (result) => {
          if (done) return; done = true; overlay.remove(); settings.inert = previousInert;
          document.removeEventListener('keydown', onKey, true); returnFocus?.focus(); resolve(result);
        };
        session.close = close;
        const onKey = (event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(null); }
          if (event.key === 'Tab') {
            const fields = [...overlay.querySelectorAll('button, input')].filter((f) => !f.disabled);
            const first = fields[0], last = fields.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        };
        const apply = node('button', { type: 'button', className: 'btn-primary', textContent: 'Usar este enquadramento', onclick: async () => {
          apply.disabled = true;
          if (gif) return close({ blob, crop: { ...c }, frame: { ...c } });
          const canvas = document.createElement('canvas'); canvas.width = k.width; canvas.height = k.height;
          const r = rect(image.naturalWidth, image.naturalHeight, c, k.aspect), ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, r.x, r.y, r.w, r.h, 0, 0, k.width, k.height);
          const result = await new Promise((r) => canvas.toBlob(r, 'image/png'));
          if (!result) { apply.disabled = false; return; }
          close({ blob: result, crop: null, frame: { ...c } });
        } });
        const overlay = node('div', { className: 'confirm-overlay photo-crop-overlay', onmousedown: (event) => { if (event.target === overlay) close(null); } },
          node('div', { className: 'photo-crop-card', role: 'dialog' },
            node('h2', { id: 'photo-crop-title', textContent: k.title }),
            node('p', { textContent: k.text }), view,
            node('label', {}, node('span', { textContent: 'Zoom' }), output, zoom),
            node('div', { className: 'photo-crop-position' }, node('label', {}, 'Posição horizontal', x), node('label', {}, 'Posição vertical', y)),
            gif ? node('p', { className: 'hint', textContent: 'A animação do GIF será mantida.' }) : node('span'),
            node('div', { className: 'confirm-actions' },
              node('button', { type: 'button', className: 'btn-ghost', textContent: 'Cancelar', onclick: () => close(null) }),
              node('button', { type: 'button', className: 'btn-ghost', textContent: 'Centralizar', onclick: () => { c = normal(null); refresh(); } }), apply)));
        overlay.firstElementChild.setAttribute('aria-modal', 'true'); overlay.firstElementChild.setAttribute('aria-labelledby', 'photo-crop-title');
        view.onpointerdown = (event) => { if (event.button !== 0) return; dragging = { px: event.clientX, py: event.clientY, ...c }; view.setPointerCapture(event.pointerId); };
        view.onpointermove = (event) => {
          if (!dragging) return;
          // Pixels of the frame per pixel of the original image, before zoom.
          const scale = view.clientWidth / Math.min(image.naturalWidth, image.naturalHeight * k.aspect);
          const dx = image.naturalWidth * scale * c.zoom - view.clientWidth, dy = image.naturalHeight * scale * c.zoom - view.clientHeight;
          c.x = dx > 0 ? clamp(dragging.x - (event.clientX - dragging.px) / dx, 0, 1) : .5;
          c.y = dy > 0 ? clamp(dragging.y - (event.clientY - dragging.py) / dy, 0, 1) : .5; refresh();
        };
        view.onpointerup = view.onpointercancel = () => { dragging = null; };
        document.body.append(overlay); document.addEventListener('keydown', onKey, true); refresh(); zoom.focus();
      });
    } finally { if (sourceUrl) URL.revokeObjectURL(sourceUrl); if (active === session) active = null; }
  }
  return { edit, cancel, style, rect };
})();
