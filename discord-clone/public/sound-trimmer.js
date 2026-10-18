// Recorte do efeito sonoro, no jeito do Discord: a onda do arquivo, duas bordas para escolher até
// 8 s e um play que toca só o trecho. Arquivo longo mostra 20 s por vez, com uma faixa embaixo
// com o arquivo inteiro para ir até a parte certa. As regras ficam sem DOM para os testes.
(() => {
  const MAX = 8, MIN = 0.3, VIEW = 20;
  const round = (v) => Math.round(v * 1000) / 1000;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const decimal = (v) => v.toFixed(1).replace('.', ',');
  // 0:07,4 — o mesmo formato para arquivos curtos e longos.
  const clock = (t) => {
    const tenths = Math.round(t * 10), minutes = Math.floor(tenths / 600), seconds = (tenths % 600) / 10;
    return `${minutes}:${seconds < 10 ? '0' : ''}${decimal(seconds)}`;
  };

  // MIN ≤ duração ≤ MAX dentro do arquivo. A borda arrastada manda: passar do limite empurra a outra.
  function clampRange({ start, end }, { total, moving = 'end', min = MIN, max = MAX }) {
    const longest = Math.min(max, total), shortest = Math.min(min, longest);
    if (moving === 'both') {
      const length = clamp(end - start, shortest, longest);
      start = clamp(start, 0, total - length);
      end = start + length;
    } else if (moving === 'start') {
      start = clamp(start, 0, total - shortest);
      end = clamp(end, start + shortest, Math.min(total, start + longest));
    } else {
      end = clamp(end, shortest, total);
      start = clamp(start, Math.max(0, end - longest), end - shortest);
    }
    return { start: round(start), end: round(end) };
  }

  // Até 8 s entra inteiro. Mais longo: os 8 s a partir de onde o som começa, pulando o silêncio do início.
  function initialRange({ pcm, peak, sampleRate, duration }) {
    if (duration <= MAX) return { start: 0, end: round(duration) };
    let first = 0;
    while (first < pcm.length && Math.abs(pcm[first]) < peak * 0.05) first++;
    const start = Math.max(0, first / sampleRate - 0.05);
    return clampRange({ start, end: start + MAX }, { total: duration, moving: 'both' });
  }

  // Começo da janela de 20 s: centrada no trecho ao abrir, depois só anda o necessário para mostrá-lo.
  const viewLength = (total) => Math.min(total, VIEW);
  const centered = (range, total) => round(clamp((range.start + range.end - viewLength(total)) / 2, 0, total - viewLength(total)));
  function follow(view, range, total) {
    const length = viewLength(total);
    if (range.start < view) view = range.start;
    if (range.end > view + length) view = range.end - length;
    return round(clamp(view, 0, total - length));
  }

  // Maior amplitude de cada barra entre as amostras from e to.
  function peaks(pcm, from, to, buckets) {
    const out = new Float32Array(buckets), size = (to - from) / buckets;
    for (let b = 0; b < buckets; b++) {
      const first = Math.max(0, Math.floor(from + b * size)), last = Math.min(pcm.length, Math.max(first + 1, Math.floor(from + (b + 1) * size)));
      let top = 0;
      for (let i = first; i < last; i++) { const v = Math.abs(pcm[i]); if (v > top) top = v; }
      out[b] = top;
    }
    return out;
  }

  // source vem do Sounds.decodeFile; encode é o Sounds.encodeClip; audio é o player da pré-escuta
  // (já na saída e no volume escolhidos pela pessoa).
  function create({ el, Icon, source, audio, encode, onChange = () => {}, onError = () => {} }) {
    const total = source.duration, length = viewLength(total), long = total > VIEW;
    let range = initialRange(source), view = centered(range, total);
    let drag = null, playing = null, url = null, frame = 0;
    const cache = new Map();

    const bars = el('canvas', { class: 'sound-trim-bars', ariaHidden: 'true' });
    const shadeLeft = el('div', { class: 'sound-trim-shade left' }), shadeRight = el('div', { class: 'sound-trim-shade right' });
    const edge = (which, label) => el('div', {
      class: 'sound-trim-handle ' + which, role: 'slider', tabIndex: 0, ariaLabel: label,
      ariaValuemin: '0', ariaValuemax: String(round(total)), onkeydown: (e) => nudge(e, which),
    });
    const startHandle = edge('start', 'Início do trecho'), endHandle = edge('end', 'Fim do trecho');
    const selection = el('div', { class: 'sound-trim-window' }, startHandle, endHandle);
    const playhead = el('div', { class: 'sound-trim-playhead hidden' });
    const track = el('div', { class: 'sound-trim-track' }, bars, shadeLeft, shadeRight, selection, playhead);
    const wave = el('div', { class: 'sound-trim-wave' }, track);
    const play = el('button', { type: 'button', class: 'sound-trim-play', ariaLabel: 'Ouvir o trecho', onclick: () => toggle() }, Icon('play', 20));
    const span = el('strong', { class: 'sound-trim-length' });
    const times = el('span', { class: 'sound-trim-times' });
    const hint = el('span', { class: 'sound-trim-hint', textContent: long ? 'Arraste as bordas, o trecho ou a faixa de baixo' : 'Arraste as bordas ou o trecho' });

    const overBars = long ? el('canvas', { class: 'sound-trim-bars', ariaHidden: 'true' }) : null;
    const lens = long ? el('div', {
      class: 'sound-trim-lens', role: 'slider', tabIndex: 0, ariaLabel: 'Parte do arquivo à mostra',
      ariaValuemin: '0', ariaValuemax: String(round(total)), onkeydown: (e) => panKey(e),
    }) : null;
    const overview = long ? el('div', { class: 'sound-trim-overview' }, el('div', { class: 'sound-trim-track' }, overBars, lens)) : null;

    const node = el('div', { class: 'sound-trim' },
      el('div', { class: 'sound-trim-side' }, play, span), wave, overview,
      el('p', { class: 'sound-trim-caption' }, times, hint));

    const box = () => track.getBoundingClientRect();
    const timeAt = (x, rect) => view + (clamp(x - rect.left, 0, rect.width) / rect.width) * length;
    const pct = (t) => ((t - view) / length) * 100 + '%';

    // Perto de uma borda: arrasta a borda. Dentro do trecho: arrasta o trecho. Fora: o trecho passa a começar ali.
    function hit(x, rect, touch) {
      const a = rect.left + ((range.start - view) / length) * rect.width, b = rect.left + ((range.end - view) / length) * rect.width;
      const reach = touch ? 24 : 14, nearStart = x >= a - reach && x <= a + 6, nearEnd = x >= b - 6 && x <= b + reach;
      if (nearStart && nearEnd) return x < (a + b) / 2 ? 'start' : 'end';
      if (nearStart) return 'start';
      if (nearEnd) return 'end';
      return x > a && x < b ? 'both' : 'outside';
    }

    function moveBoth(start) {
      const size = range.end - range.start;
      start = clamp(start, view, view + length - size);
      set({ start, end: start + size }, 'both');
    }

    wave.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || drag) return;
      const rect = box();
      if (!rect.width) return;
      e.preventDefault();
      const mode = hit(e.clientX, rect, e.pointerType === 'touch'), t = timeAt(e.clientX, rect);
      if (mode === 'outside') moveBoth(t);
      // A distância até a borda fica guardada para ela não pular para baixo do dedo.
      drag = { mode: mode === 'outside' ? 'both' : mode, id: e.pointerId, offset: mode === 'outside' ? 0 : t - (mode === 'end' ? range.end : range.start) };
      wave.setPointerCapture?.(e.pointerId);
      wave.classList.add('dragging');
    });
    wave.addEventListener('pointermove', (e) => {
      const rect = box();
      if (!rect.width) return;
      if (!drag) {
        const mode = hit(e.clientX, rect, false);
        wave.style.cursor = mode === 'start' || mode === 'end' ? 'ew-resize' : mode === 'both' ? 'grab' : 'pointer';
        return;
      }
      if (e.pointerId !== drag.id) return;
      const t = timeAt(e.clientX, rect) - drag.offset;
      if (drag.mode === 'both') moveBoth(t);
      else set({ ...range, [drag.mode]: clamp(t, view, view + length) }, drag.mode);
    });

    // A faixa de baixo leva a janela de 20 s (e o trecho junto) para outra parte do arquivo.
    overview?.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || drag) return;
      const rect = overview.firstChild.getBoundingClientRect();
      if (!rect.width) return;
      e.preventDefault();
      const at = (x) => (clamp(x - rect.left, 0, rect.width) / rect.width) * total;
      const t = at(e.clientX), inside = t >= view && t <= view + length;
      drag = { mode: 'view', id: e.pointerId, offset: inside ? t - view : length / 2, at };
      if (!inside) moveView(t - length / 2);
      overview.setPointerCapture?.(e.pointerId);
      overview.classList.add('dragging');
    });
    overview?.addEventListener('pointermove', (e) => {
      if (drag?.mode === 'view' && e.pointerId === drag.id) moveView(drag.at(e.clientX) - drag.offset);
    });

    const release = (e) => {
      if (drag?.id !== e.pointerId) return;
      drag = null;
      wave.classList.remove('dragging'); overview?.classList.remove('dragging');
    };
    for (const target of [wave, overview].filter(Boolean)) for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(type, release);

    function set(next, moving) {
      const before = range;
      range = clampRange(next, { total, moving });
      if (range.start === before.start && range.end === before.end) return;
      stop();
      view = follow(view, range, total);
      update();
      onChange(range);
    }

    function moveView(start) {
      const next = round(clamp(start, 0, total - length)), shift = next - view;
      if (!shift) return;
      stop();
      view = next;
      range = clampRange({ start: range.start + shift, end: range.end + shift }, { total, moving: 'both' });
      update();
      onChange(range);
    }

    // Setas: 0,1 s; com Shift, 1 s. Espaço toca o trecho.
    const steps = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
    function nudge(e, which) {
      if (e.key === ' ') { e.preventDefault(); toggle(); return; }
      if (!(e.key in steps)) return;
      e.preventDefault();
      set({ ...range, [which]: range[which] + steps[e.key] * (e.shiftKey ? 1 : 0.1) }, which);
    }
    function panKey(e) {
      if (!(e.key in steps)) return;
      e.preventDefault();
      moveView(view + steps[e.key] * (e.shiftKey ? 10 : 1));
    }

    function update() {
      shadeLeft.style.width = pct(range.start);
      shadeRight.style.left = pct(range.end);
      selection.style.left = pct(range.start);
      selection.style.width = ((range.end - range.start) / length) * 100 + '%';
      for (const [handle, t] of [[startHandle, range.start], [endHandle, range.end]]) {
        handle.setAttribute('aria-valuenow', String(t));
        handle.setAttribute('aria-valuetext', clock(t));
      }
      span.textContent = decimal(range.end - range.start) + ' s';
      times.textContent = `${clock(range.start)} – ${clock(range.end)}`;
      if (lens) {
        lens.style.left = (view / total) * 100 + '%';
        lens.style.width = (length / total) * 100 + '%';
        lens.setAttribute('aria-valuenow', String(view));
        lens.setAttribute('aria-valuetext', `${clock(view)} a ${clock(view + length)}`);
      }
      draw();
    }

    // Barras arredondadas: dentro do trecho na cor da marca, fora apagadas. Cores do tema atual.
    function paint(canvas, from, to, size) {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const gap = size > 2 ? 2 : 1, count = Math.max(1, Math.floor((width + gap) / (size + gap))), step = width / count;
      const key = `${from}:${to}:${count}`;
      if (!cache.has(key)) { if (cache.size > 8) cache.clear(); cache.set(key, peaks(source.pcm, from * source.sampleRate, to * source.sampleRate, count)); }
      const values = cache.get(key), style = getComputedStyle(node);
      const on = style.getPropertyValue('--brand').trim() || '#8277fa', off = style.getPropertyValue('--text-muted').trim() || '#a5adbe';
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      values.forEach((v, i) => {
        const t = from + ((i + 0.5) / count) * (to - from), inside = t >= range.start && t <= range.end;
        ctx.fillStyle = inside ? on : off;
        ctx.globalAlpha = inside ? 1 : 0.35;
        const h = Math.max(2, Math.min(1, v / source.peak) * (height - 4)), x = i * step + (step - size) / 2;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, (height - h) / 2, size, h, size / 2); ctx.fill(); }
        else ctx.fillRect(x, (height - h) / 2, size, h);
      });
      ctx.globalAlpha = 1;
    }
    function draw() {
      paint(bars, view, view + length, 3);
      if (overBars) paint(overBars, 0, total, 2);
    }
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
    resize?.observe(track);

    // Toca exatamente o WAV que vai para o servidor, com a linha branca andando pela onda.
    async function toggle() {
      if (playing) { stop(); return; }
      let clip;
      try { clip = encode(source, range.start, range.end); }
      catch (error) { onError(error.message); return; }
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(clip.blob);
      audio.src = url;
      const current = playing = { start: range.start, duration: clip.duration };
      play.replaceChildren(Icon('stop', 20)); play.setAttribute('aria-label', 'Parar');
      playhead.classList.remove('hidden');
      playhead.style.left = pct(range.start);
      try { await audio.play(); } catch { if (playing === current) stop(); return; }
      const tick = () => {
        if (playing !== current) return;
        playhead.style.left = pct(current.start + Math.min(audio.currentTime, current.duration));
        frame = requestAnimationFrame(tick);
      };
      tick();
    }
    function stop() {
      if (!playing) return;
      playing = null;
      cancelAnimationFrame(frame);
      audio.pause();
      playhead.classList.add('hidden');
      play.replaceChildren(Icon('play', 20)); play.setAttribute('aria-label', 'Ouvir o trecho');
    }
    audio.addEventListener('ended', stop);

    update();
    return {
      node,
      range: () => range,
      stop,
      destroy() {
        stop();
        resize?.disconnect();
        audio.removeEventListener('ended', stop);
        audio.removeAttribute('src'); audio.load();
        if (url) URL.revokeObjectURL(url);
        url = null;
      },
    };
  }

  const api = { MAX, MIN, VIEW, clock, clampRange, initialRange, centered, follow, peaks, create };
  if (typeof window !== 'undefined') window.SoundTrimmer = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
