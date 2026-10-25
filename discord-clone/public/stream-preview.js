// Prévia da transmissão, como no Discord: quem transmite manda, de tempos em tempos, uma foto pequena
// da própria tela, e quem está na chamada sem assistir vê essa foto no quadrado da transmissão (com um
// esmaecido de uma foto para a próxima) em vez de um bloco parado.
// Quem transmite só tira fotos enquanto alguém da sala não está assistindo, e o servidor só as repassa a
// quem não assiste; quem entra na sala (ou para de assistir) recebe do servidor a última foto guardada.
window.StreamPreview = function ({ state, socket, el, voiceEntry, roomEntries, onPreview }) {
  // 640 px em WebP: ~8 KB por foto (eram ~25 KB em JPEG de 768 px) e quase a mesma nitidez no quadrado grande.
  const MAX_WIDTH = 640, MAX_HEIGHT = 360;
  const QUALITY = 0.7, SMALLER = 0.5;
  const MAX_BYTES = 200_000; // o servidor recusa acima disso
  const FIRST = 1500;  // a primeira foto sai logo depois de começar (os primeiros quadros podem vir pretos)
  const EVERY = 15000; // depois, uma a cada 15 s
  const GAP = 3000;    // nunca duas em menos de 3 s, mesmo quando chega alguém novo
  const DARK_TRIES = 3; // tela preta: tenta de novo algumas vezes antes de mandar assim mesmo
  const now = () => Date.now();

  // ---------- Quem transmite ----------
  let timer = null, busy = false, source = null, reader = null, lastSent = 0, lastBytes = null, darkTries = 0;

  // Alguém da sala (fora eu) ainda não está assistindo à minha tela.
  function audience() {
    const me = state.me?.sid;
    const watching = new Set(voiceEntry(me)?.viewers || []);
    return roomEntries().some((v) => v.sid !== me && !watching.has(v.sid));
  }
  function sync() {
    const track = state.local.screen?.getVideoTracks()[0] || null;
    const live = !!track && track.readyState === 'live';
    if (source !== track) { release(); source = live ? track : null; lastBytes = null; darkTries = 0; if (source) schedule(FIRST); }
    if (!live || state.sharePaused || !audience()) { clearTimeout(timer); timer = null; return; }
    if (!timer && !busy) schedule(Math.max(0, lastSent + GAP - now()));
  }
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }
  function release() {
    clearTimeout(timer); timer = null;
    if (reader) { reader.pause?.(); reader.srcObject = null; reader = null; }
    source = null;
  }
  async function tick() {
    timer = null;
    const track = source;
    if (!track || track.readyState !== 'live' || state.sharePaused || !audience() || socket.connected === false) return;
    busy = true;
    let next = EVERY;
    try {
      const shot = await snapshot(track);
      if (track !== source) return;
      if (!shot) next = 1000;
      else if (shot.dark && darkTries < DARK_TRIES) { darkTries++; next = 1000; }
      else {
        const bytes = new Uint8Array(await shot.blob.arrayBuffer());
        // Tela parada: a foto sai igual, e não há nada novo para mandar.
        if (!same(bytes, lastBytes)) {
          socket.emit('screen:preview', { image: bytes.buffer });
          lastBytes = bytes;
          lastSent = now();
        }
      }
    } catch { next = EVERY; }
    finally {
      busy = false;
      if (track === source) { schedule(next); sync(); }
    }
  }
  // Um <video> só para ler os quadros da captura: funciona com a janela em segundo plano e mantém o
  // último quadro mesmo quando a tela fica parada (a captura só manda quadros quando algo muda).
  async function snapshot(track) {
    if (!reader) {
      reader = document.createElement('video');
      reader.muted = true;
      reader.playsInline = true;
      reader.srcObject = new MediaStream([track]);
      reader.play().catch(() => {});
    }
    if (!reader.videoWidth) await new Promise((resolve) => { reader.addEventListener('loadeddata', resolve, { once: true }); setTimeout(resolve, 2000); });
    if (!reader?.videoWidth) return null;
    return encode(reader, reader.videoWidth, reader.videoHeight);
  }
  // O Safari não gera WebP (devolve PNG): a partir daí fica no JPEG.
  let type = 'image/webp';
  async function encode(image, width, height) {
    const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dark = isDark(ctx, canvas.width, canvas.height);
    const shoot = (quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    let blob = await shoot(QUALITY);
    if (blob && blob.type !== type) { type = 'image/jpeg'; blob = await shoot(QUALITY); }
    if (blob && blob.size > MAX_BYTES * 0.7) blob = await shoot(SMALLER);
    return blob && blob.size <= MAX_BYTES ? { blob, dark } : null;
  }
  // Brilho médio de algumas centenas de pontos: os primeiros quadros de uma captura costumam vir pretos.
  function isDark(ctx, width, height) {
    const data = ctx.getImageData(0, 0, width, height).data;
    const step = Math.max(4, Math.floor(data.length / 4 / 600)) * 4;
    let sum = 0, count = 0;
    for (let i = 0; i < data.length; i += step) { sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; count++; }
    return count > 0 && sum / count < 8;
  }
  function same(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  // Numa conexão nova o servidor não tem a última foto: a próxima sai mesmo que a tela não tenha mudado.
  socket.on('connect', () => { lastBytes = null; });

  // ---------- Quem está na chamada ----------
  const previews = new Map(); // sid -> { url, at }
  // A foto guardada no servidor ("saved": ao entrar na sala ou parar de assistir) conta como a mais antiga:
  // o último quadro visto ao vivo (keep) vale mais que ela.
  socket.on('screen:preview', ({ sid, image, saved } = {}) => {
    if (typeof sid !== 'string' || !image) return;
    receive(sid, new Blob([image], { type: imageType(image) }), saved ? 0 : now());
  });
  // WebP começa com "RIFF....WEBP"; o resto é JPEG (o servidor só repassa esses dois).
  function imageType(image) {
    const bytes = ArrayBuffer.isView(image) ? new Uint8Array(image.buffer, image.byteOffset, image.byteLength) : new Uint8Array(image);
    return String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP' ? 'image/webp' : 'image/jpeg';
  }
  async function receive(sid, blob, at) {
    const url = URL.createObjectURL(blob);
    // Decodificada antes de entrar na tela: a troca de uma foto para a outra não pisca.
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { URL.revokeObjectURL(url); return; }
    const current = previews.get(sid);
    if (current && current.at > at) { URL.revokeObjectURL(url); return; }
    previews.set(sid, { url, at });
    if (current) retire(current.url);
    onPreview(sid);
  }
  // A foto antiga ainda aparece durante o esmaecido.
  const retire = (url) => setTimeout(() => URL.revokeObjectURL(url), 2000);
  function drop(sid) {
    const current = previews.get(sid);
    if (!current) return;
    previews.delete(sid);
    retire(current.url);
  }
  // Transmissões que acabaram (ou salas de que saí) não guardam foto.
  function prune() {
    for (const sid of [...previews.keys()]) if (!state.voiceChannel || !voiceEntry(sid)?.sharing) drop(sid);
  }
  // Ao parar de assistir, o último quadro visto vira a prévia até a próxima foto chegar.
  function keep(sid, video) {
    if (!video?.videoWidth || video.readyState < 2) return;
    const at = now();
    encode(video, video.videoWidth, video.videoHeight).then((shot) => { if (shot && !shot.dark) receive(sid, shot.blob, at); }, () => {});
  }

  // Desenha a prévia no quadrado da transmissão. "show": a pessoa não está vendo o vídeo ao vivo.
  function paint(tile, sid, show) {
    let box = tile.querySelector('.stream-preview');
    if (!box) {
      box = el('div', { class: 'stream-preview', ariaHidden: 'true' });
      tile.querySelector('video').after(box);
    }
    const preview = show ? previews.get(sid) : null;
    tile.classList.toggle('has-preview', !!preview);
    box.classList.toggle('shown', !!preview);
    if (!preview || box.dataset.url === preview.url) return;
    box.dataset.url = preview.url;
    const frame = el('div', { class: 'sp-frame' },
      el('img', { class: 'sp-fill', src: preview.url, alt: '', draggable: false }),
      el('img', { class: 'sp-img', src: preview.url, alt: '', draggable: false }));
    const older = [...box.children];
    box.append(frame);
    // Janela escondida: sem esmaecido (os quadros de animação só voltam quando ela aparece, e a
    // prévia ficaria preta até lá). Visível: dois quadros de animação, para o navegador desenhar a
    // foto nova invisível antes de esmaecer; a anterior só sai depois que a nova apareceu.
    if (document.hidden) { frame.classList.add('in'); older.forEach((node) => node.remove()); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      frame.classList.add('in');
      setTimeout(() => older.forEach((node) => node.remove()), 900);
    }));
  }

  return { sync, paint, prune, keep, has: (sid) => previews.has(sid) };
};
