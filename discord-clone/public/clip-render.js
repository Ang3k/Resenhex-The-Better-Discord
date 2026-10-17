// CLIPAR: monta o vídeo do clipe no próprio aparelho. Cada quadro é desenhado num canvas
// (perfis em grade, anel verde em quem fala) e codificado com WebCodecs em H.264 + AAC num MP4.
window.ClipRender = (() => {
  const W = 1280, H = 720, FPS = 30, RATE = 48000;
  const GREEN = '#23a55a', BRAND = '#8e2fd8';
  let support = null, muxerReady = null;

  function supported() {
    support ||= (async () => {
      try {
        if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return false;
        const [video, audio] = await Promise.all([
          VideoEncoder.isConfigSupported({ codec: 'avc1.4d0028', width: W, height: H, bitrate: 2_500_000, framerate: FPS }),
          AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate: 128_000 }),
        ]);
        return !!(video.supported && audio.supported);
      } catch { return false; }
    })();
    return support;
  }

  // Mesmo recorte do editor de foto (photo-editor.js): área quadrada da imagem original.
  function cropRect(image, crop) {
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const c = { x: clamp(Number(crop?.x ?? 0.5), 0, 1), y: clamp(Number(crop?.y ?? 0.5), 0, 1), zoom: clamp(Number(crop?.zoom ?? 1), 1, 4) };
    const side = Math.min(image.width, image.height) / c.zoom;
    return { x: (image.width - side) * c.x, y: (image.height - side) * c.y, side };
  }

  function drawAvatar(ctx, { profile, image, circle: { x, y, r } }) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (image) {
      const s = cropRect(image, profile.avatarCrop);
      ctx.drawImage(image, s.x, s.y, s.side, s.side, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = profile.color || '#5865f2';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(r * 0.8)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((profile.name || '?').trim().charAt(0).toUpperCase() || '?', x, y + r * 0.04);
    }
    ctx.restore();
  }

  function drawFrame(ctx, { width = W, height = H, people, label, progress }) {
    const bg = ctx.createRadialGradient(width / 2, height * 0.38, 40, width / 2, height * 0.38, width * 0.75);
    bg.addColorStop(0, '#1d1428');
    bg.addColorStop(1, '#0d0b12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    for (const p of people) {
      const { x, y, r } = p.circle;
      if (p.speaking) {
        ctx.save();
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 6;
        ctx.shadowColor = 'rgba(35, 165, 90, .7)';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawAvatar(ctx, p);
      ctx.fillStyle = p.speaking ? '#fff' : '#dbdce0';
      ctx.font = `600 ${Math.max(16, Math.round(r * 0.22))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(p.profile.name || '', x, y + r + 14);
    }
    // Marca discreta: "Resenhex · Sala 1 · 17/10 22:14".
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillStyle = '#f3f3f5';
    ctx.fillText('Resenhex', 24, height - 24);
    const brand = ctx.measureText('Resenhex').width;
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillStyle = '#8d8f98';
    ctx.fillText(' · ' + label, 24 + brand, height - 24);
    ctx.fillStyle = 'rgba(255, 255, 255, .1)';
    ctx.fillRect(0, height - 3, width, 3);
    ctx.fillStyle = BRAND;
    ctx.fillRect(0, height - 3, Math.round(progress * width), 3);
  }

  // Mistura de quem entra no clipe, no volume original, com um limitador para não estourar.
  async function mix(people, snapshot, { start, end }) {
    const length = Math.max(1, Math.round((end - start) * RATE));
    const ctx = new OfflineAudioContext(2, length, RATE);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    limiter.connect(ctx.destination);
    const sr = snapshot.sampleRate, from = Math.round(start * sr), to = Math.round(end * sr);
    for (const p of people) {
      const slice = p.pcm.subarray(from, to);
      if (!slice.length) continue;
      const buffer = ctx.createBuffer(1, slice.length, sr);
      buffer.copyToChannel(slice, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(limiter);
      source.start();
    }
    return ctx.startRendering();
  }

  function loadMuxer() {
    if (window.Mp4Muxer) return Promise.resolve();
    muxerReady ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/mp4-muxer.js';
      script.onload = resolve;
      script.onerror = () => { muxerReady = null; reject(new Error('Não foi possível carregar o gerador de vídeo.')); };
      document.head.append(script);
    });
    return muxerReady;
  }

  const makeCanvas = (w, h) => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  const toBlob = (canvas, type, quality) => canvas.convertToBlob ? canvas.convertToBlob({ type, quality }) : new Promise((r) => canvas.toBlob(r, type, quality));

  // Miniatura do primeiro quadro: 320×180, JPEG de até 40 KB.
  async function thumbnail(source) {
    const small = makeCanvas(320, 180);
    small.getContext('2d').drawImage(source, 0, 0, 320, 180);
    let quality = 0.7, blob = await toBlob(small, 'image/jpeg', quality);
    while (blob.size > 40 * 1024 && quality > 0.25) { quality -= 0.1; blob = await toBlob(small, 'image/jpeg', quality); }
    return blob;
  }

  async function render({ snapshot, people, start, end, label, loadImage }) {
    await loadMuxer();
    const duration = end - start, frames = Math.max(1, Math.round(duration * FPS));
    const images = await Promise.all(people.map((p) => (p.profile.avatarUrl ? loadImage(p.profile.avatarUrl).catch(() => null) : null)));
    const circles = window.ClipModel.layout(people.length, W, H);
    const speaking = people.map((p) => window.ClipModel.speakingFrames(p, snapshot, { start, end, fps: FPS }));
    const audio = await mix(people, snapshot, { start, end });
    const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H, frameRate: FPS },
      audio: { codec: 'aac', sampleRate: RATE, numberOfChannels: 2 },
      fastStart: 'in-memory',
    });
    let failure = null;
    const video = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
    video.configure({ codec: 'avc1.4d0028', width: W, height: H, bitrate: 2_500_000, framerate: FPS, avc: { format: 'avc' } });
    const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
    let thumb = null;
    for (let f = 0; f < frames && !failure; f++) {
      drawFrame(ctx, {
        width: W, height: H, label, progress: (f + 1) / frames,
        people: people.map((p, i) => ({ profile: p.profile, image: images[i], circle: circles[i], speaking: !!speaking[i][f] })),
      });
      if (f === 0) thumb = await thumbnail(canvas);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      video.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
      frame.close();
      if (video.encodeQueueSize > 8) await new Promise((r) => video.addEventListener('dequeue', r, { once: true }));
    }
    await video.flush();
    const sound = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
    sound.configure({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate: 128_000 });
    const left = audio.getChannelData(0), right = audio.getChannelData(1), step = 4800;
    for (let i = 0; i < audio.length && !failure; i += step) {
      const n = Math.min(step, audio.length - i), data = new Float32Array(n * 2);
      data.set(left.subarray(i, i + n), 0);
      data.set(right.subarray(i, i + n), n);
      const chunk = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i * 1e6) / RATE), data });
      sound.encode(chunk);
      chunk.close();
    }
    await sound.flush();
    video.close();
    sound.close();
    if (failure) throw failure;
    muxer.finalize();
    return { mp4: new Blob([muxer.target.buffer], { type: 'video/mp4' }), thumb, duration };
  }

  return { supported, drawFrame, mix, render };
})();
