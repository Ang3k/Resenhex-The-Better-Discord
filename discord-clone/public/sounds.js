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

  return {
    play,
    get enabled() { return enabled; },
    set enabled(v) {
      enabled = !!v;
      localStorage.setItem('sounds', enabled);
    },
  };
})();
