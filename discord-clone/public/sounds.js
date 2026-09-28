// Sons curtos gerados na hora com Web Audio (sem arquivos de áudio).
window.Sounds = (() => {
  let ctx = null;
  let enabled = localStorage.getItem('sounds') !== 'false';

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
        osc.connect(gain).connect(ctx.destination);
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
  }

  const SYNTH = {
    grilo(c, out, t) {
      // "cri-cri-cri": pulsos agudos em trios, repetidos
      for (let chirp = 0; chirp < 6; chirp++) {
        const base = t + chirp * 0.42 + (chirp % 2) * 0.05;
        for (let p = 0; p < 4; p++) tone(c, out, { freq: 4400, start: base + p * 0.028, dur: 0.022, vol: 0.12, attack: 0.004 });
      }
    },
    trovao(c, out, t) {
      noise(c, out, { start: t, dur: 0.35, vol: 0.5, filter: 'lowpass', freq: 1800, attack: 0.002 });
      noise(c, out, { start: t + 0.05, dur: 3.2, vol: 0.9, filter: 'lowpass', freq: 260, brown: true, attack: 0.08 });
      noise(c, out, { start: t + 0.9, dur: 2.2, vol: 0.6, filter: 'lowpass', freq: 160, brown: true, attack: 0.3 });
    },
    aplausos(c, out, t) {
      for (let i = 0; i < 90; i++) {
        const at = t + Math.random() * 2.4;
        noise(c, out, { start: at, dur: 0.03 + Math.random() * 0.03, vol: 0.05 + Math.random() * 0.12, freq: 1200 + Math.random() * 1800, q: 0.8 });
      }
    },
    badumtss(c, out, t) {
      tone(c, out, { freq: 180, to: 90, start: t, dur: 0.18, vol: 0.5 });
      tone(c, out, { freq: 140, to: 70, start: t + 0.2, dur: 0.22, vol: 0.5 });
      noise(c, out, { start: t + 0.45, dur: 1.2, vol: 0.25, filter: 'highpass', freq: 6000, attack: 0.002 });
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

  function playBoard(id, volume = 1) {
    if (!SYNTH[id] || volume <= 0) return;
    try {
      ctx ||= new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      const out = ctx.createGain();
      out.gain.value = volume;
      out.connect(ctx.destination);
      SYNTH[id](ctx, out, ctx.currentTime + 0.02);
      setTimeout(() => out.disconnect(), 5000);
    } catch {}
  }

  return {
    play,
    board: BOARD,
    playBoard,
    get enabled() { return enabled; },
    set enabled(v) {
      enabled = !!v;
      localStorage.setItem('sounds', enabled);
    },
  };
})();
