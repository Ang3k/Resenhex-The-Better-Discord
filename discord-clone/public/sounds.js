// Sons curtos gerados na hora com Web Audio (sem arquivos de áudio).
window.Sounds = (() => {
  let ctx = null;
  let callBus = null; // saída única da chamada, quando ligada (ver callOutput no app.js)
  const destination = () => callBus || ctx.destination;
  let enabled = localStorage.getItem('sounds') !== 'false';
  let boardOutput = null;
  let boardEpoch = 0;
  const customBuffers = new Map();

  // Cada som é uma sequência de notas: [frequência em Hz, início em s, duração em s].
  const PRESETS = {
    join: [[587, 0, 0.1], [880, 0.09, 0.14]],
    leave: [[880, 0, 0.1], [587, 0.09, 0.14]],
    mute: [[440, 0, 0.07], [330, 0.06, 0.09]],
    unmute: [[330, 0, 0.07], [440, 0.06, 0.09]],
    deafen: [[392, 0, 0.08], [262, 0.07, 0.12]],
    undeafen: [[262, 0, 0.08], [392, 0.07, 0.12]],
    stream: [[523, 0, 0.08], [659, 0.07, 0.08], [784, 0.14, 0.12]],
    mention: [[988, 0, 0.08], [1319, 0.08, 0.16]],
    message: [[740, 0, 0.07]],
  };

  function play(name) {
    const notes = PRESETS[name];
    if (!enabled || !notes) return;
    try {
      ctx ||= new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime + 0.01;
      for (const [freq, start, dur] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.12, now + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(gain).connect(destination());
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      }
    } catch {
      // Sem áudio disponível: ignora.
    }
  }

  // ---------------- efeitos sonoros (soundboard) ----------------
  // Cada efeito é sintetizado aqui mesmo (osciladores + ruído), sem arquivos de áudio.
  const BOARD = {
    grilo: { label: 'Grilo', emoji: '🦗' },
    trovao: { label: 'Trovão', emoji: '⛈️' },
    aplausos: { label: 'Aplausos', emoji: '👏' },
    badumtss: { label: 'Ba dum tss', emoji: '🥁' },
    buzina: { label: 'Buzina', emoji: '📯' },
    fail: { label: 'Fracasso', emoji: '🎺' },
    vitoria: { label: 'Vitória', emoji: '🏆' },
    suspense: { label: 'Suspense', emoji: '😱' },
  };

  function noiseBuffer(c, seconds, brown = false) {
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.5; } else d[i] = white;
    }
    return buf;
  }

  function tone(c, out, { type = 'sine', freq, to, start, dur, vol = 0.3, attack = 0.01 }) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.05);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    return o;
  }

  function noise(c, out, { start, dur, vol = 0.3, filter = 'bandpass', freq = 1000, q = 1, brown = false, attack = 0.005 }) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, dur + 0.1, brown);
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(out);
    src.start(start);
    src.stop(start + dur + 0.1);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  const SYNTH = {
    grilo(c, out, t) {
      // "cri-cri-cri": pulsos agudos em trios, repetidos
      for (let chirp = 0; chirp < 6; chirp++) {
        const base = t + chirp * 0.42 + (chirp % 2) * 0.05;
        for (let p = 0; p < 4; p++) tone(c, out, { freq: 3900 + p * 75, to: 3500, start: base + p * 0.035, dur: 0.032, vol: 0.1, attack: 0.005 });
      }
    },
    trovao(c, out, t) {
      noise(c, out, { start: t, dur: 0.35, vol: 0.5, filter: 'lowpass', freq: 1800, attack: 0.002 });
      noise(c, out, { start: t + 0.05, dur: 3.2, vol: 0.9, filter: 'lowpass', freq: 260, brown: true, attack: 0.08 });
      noise(c, out, { start: t + 0.9, dur: 2.2, vol: 0.6, filter: 'lowpass', freq: 160, brown: true, attack: 0.3 });
    },
    aplausos(c, out, t) {
      for (let i = 0; i < 48; i++) {
        const at = t + i * .048 + Math.random() * .06;
        noise(c, out, { start: at, dur: 0.045 + Math.random() * 0.04, vol: 0.09 + Math.random() * 0.13, freq: 950 + Math.random() * 1700, q: 0.7, attack: .002 });
      }
      noise(c, out, { start: t + .1, dur: 2.4, vol: .045, filter: 'bandpass', freq: 1800, q: .5, attack: .2 });
    },
    badumtss(c, out, t) {
      tone(c, out, { freq: 180, to: 90, start: t, dur: 0.18, vol: 0.5 });
      tone(c, out, { freq: 140, to: 70, start: t + 0.2, dur: 0.22, vol: 0.5 });
      noise(c, out, { start: t + 0.45, dur: 1.2, vol: 0.2, filter: 'highpass', freq: 4000, attack: 0.005 });
      tone(c, out, { freq: 90, to: 50, start: t + 0.45, dur: 0.3, vol: 0.5 });
    },
    buzina(c, out, t) {
      for (const [start, dur] of [[0, 0.25], [0.32, 0.25], [0.64, 0.9]]) {
        for (const f of [440, 466, 554]) tone(c, out, { type: 'sawtooth', freq: f, start: t + start, dur, vol: 0.08, attack: 0.02 });
      }
    },
    fail(c, out, t) {
      // "wah wah wah waaah" do trombone triste
      [[311, 0], [294, 0.5], [277, 1.0]].forEach(([f, s]) => tone(c, out, { type: 'sawtooth', freq: f, start: t + s, dur: 0.45, vol: 0.12, attack: 0.05 }));
      const o = tone(c, out, { type: 'sawtooth', freq: 262, to: 240, start: t + 1.5, dur: 1.4, vol: 0.12, attack: 0.05 });
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = 6;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t + 1.5);
      lfo.stop(t + 3);
      lfo.onended = () => { lfo.disconnect(); depth.disconnect(); };
    },
    vitoria(c, out, t) {
      [[523, 0, 0.14], [659, 0.15, 0.14], [784, 0.3, 0.14], [1047, 0.45, 0.6]].forEach(([f, s, d]) => {
        tone(c, out, { type: 'square', freq: f, start: t + s, dur: d, vol: 0.08 });
        tone(c, out, { type: 'triangle', freq: f / 2, start: t + s, dur: d, vol: 0.12 });
      });
    },
    suspense(c, out, t) {
      // "dun dun duuun"
      [[0, 0.35], [0.45, 0.35], [0.9, 1.6]].forEach(([s, d], i) => {
        const f = i === 2 ? 98 : 110;
        tone(c, out, { type: 'sawtooth', freq: f, start: t + s, dur: d, vol: 0.18, attack: 0.02 });
        tone(c, out, { type: 'sawtooth', freq: f * 1.5, start: t + s, dur: d, vol: 0.1, attack: 0.02 });
      });
    },
  };

  function stopBoard() {
    boardEpoch++;
    if (!boardOutput) return;
    const current = boardOutput; boardOutput = null;
    current.gain.gain.cancelScheduledValues(ctx.currentTime);
    current.gain.gain.setTargetAtTime(0, ctx.currentTime, .01);
    setTimeout(() => { current.gain.disconnect(); current.filter.disconnect(); current.compressor.disconnect(); }, 60);
  }
  function output(volume) {
    const gain = ctx.createGain(), filter = ctx.createBiquadFilter(), compressor = ctx.createDynamicsCompressor();
    filter.type = 'lowpass'; filter.frequency.value = 9500;
    compressor.threshold.value = -12; compressor.knee.value = 8; compressor.ratio.value = 12;
    compressor.attack.value = .003; compressor.release.value = .12;
    gain.gain.setValueAtTime(Math.min(1, Math.max(0, Number(volume) || 0)) * .8, ctx.currentTime);
    filter.connect(compressor).connect(gain).connect(destination());
    boardOutput = { gain, filter, compressor };
    return filter;
  }
  function playBoard(id, volume = 1) {
    if (!SYNTH[id] || volume <= 0) return false;
    try {
      ctx ||= new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      stopBoard();
      const epoch = boardEpoch, out = output(volume);
      SYNTH[id](ctx, out, ctx.currentTime + 0.02);
      setTimeout(() => { if (epoch === boardEpoch) stopBoard(); }, 5000);
      return true;
    } catch { return false; }
  }

  async function playCustom(url, volume, token) {
    if (volume <= 0 || !/^\/servers\/[a-f0-9]{16}\/sounds\/[a-f0-9]{16}$/.test(url)) return false;
    ctx ||= new AudioContext();
    stopBoard(); const epoch = boardEpoch;
    if (ctx.state === 'suspended') await ctx.resume();
    if (epoch !== boardEpoch) return false;
    if (!customBuffers.has(url)) {
      if (customBuffers.size >= 32) customBuffers.delete(customBuffers.keys().next().value);
      customBuffers.set(url, fetch(url, { headers: { 'x-token': token } }).then((r) => {
        if (!r.ok) throw new Error('Não foi possível carregar o efeito sonoro.');
        return r.arrayBuffer();
      }).then((bytes) => ctx.decodeAudioData(bytes)));
    }
    let buffer;
    try { buffer = await customBuffers.get(url); }
    catch (error) { customBuffers.delete(url); throw error; }
    if (epoch !== boardEpoch) return false;
    if (buffer.duration > 8.01) throw new Error('Efeito sonoro muito longo.');
    const source = ctx.createBufferSource(); source.buffer = buffer;
    source.connect(output(volume));
    source.onended = () => { source.disconnect(); if (epoch === boardEpoch) stopBoard(); };
    source.start(); return true;
  }

  // Decode any format supported by this browser, then send a bounded, normalized WAV.
  async function prepareFile(file) {
    if (!file || file.size > 5 * 1024 * 1024) throw new Error('Escolha um áudio de até 5 MB e 8 segundos.');
    const url = URL.createObjectURL(file), audio = document.createElement('audio');
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Não foi possível ler esse áudio.')), 10000);
        audio.onloadedmetadata = () => { clearTimeout(timer); Number.isFinite(audio.duration) && audio.duration > 0 && audio.duration <= 8 ? resolve() : reject(new Error('O efeito deve ter até 8 segundos.')); };
        audio.onerror = () => { clearTimeout(timer); reject(new Error('Formato não suportado. Tente MP3, WAV ou OGG.')); };
        audio.preload = 'metadata'; audio.src = url;
      });
    } finally { audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); }
    ctx ||= new AudioContext();
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > 8 || !decoded.length || decoded.numberOfChannels > 8) throw new Error('O efeito deve ter até 8 segundos.');
    const rate = 48000, length = Math.floor(decoded.duration * rate), samples = new Float32Array(length);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    let peak = 0;
    for (let i = 0; i < length; i++) {
      const position = i * decoded.sampleRate / rate, index = Math.floor(position), fraction = position - index;
      let sample = 0;
      for (const data of channels) sample += (data[index] || 0) * (1 - fraction) + (data[Math.min(index + 1, data.length - 1)] || 0) * fraction;
      samples[i] = sample / channels.length; peak = Math.max(peak, Math.abs(samples[i]));
    }
    if (peak < .0001) throw new Error('Esse áudio está sem som. Escolha outro arquivo.');
    const bytes = new ArrayBuffer(44 + length * 2), view = new DataView(bytes);
    const text = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, length * 2, true);
    for (let i = 0; i < length; i++) {
      const fade = Math.min(1, i / 240, (length - 1 - i) / 240);
      view.setInt16(44 + i * 2, Math.round(samples[i] * .75 / peak * fade * 32767), true);
    }
    return { blob: new Blob([bytes], { type: 'audio/wav' }), duration: length / rate };
  }

  // Passa a tocar no contexto e na saída do app (a referência que tira o som do Resenhex da
  // transmissão); route(null, null) volta para a saída normal.
  function route(context, node) {
    if (context) ctx = context;
    callBus = node;
  }

  return {
    play,
    route,
    board: BOARD,
    playBoard,
    playCustom, prepareFile, stopBoard,
    get enabled() { return enabled; },
    set enabled(v) {
      enabled = !!v;
      localStorage.setItem('sounds', enabled);
    },
  };
})();
