// Modificador de voz: efeitos ao vivo no microfone, antes de a voz ir para a chamada.
// O tom (esquilo, gigante, alien) muda com o Signalsmith Stretch (MIT, WebAssembly num AudioWorklet,
// servido em /vendor/stretch.mjs); robô, rádio e caverna usam só nós nativos do Web Audio (sem atraso).
window.VoiceFx = (() => {
  const PRESETS = {
    none: { label: 'Desligado', emoji: '🎙️', desc: 'Sua voz de sempre' },
    esquilo: { label: 'Esquilo', emoji: '🐿️', desc: 'Fininha e elétrica', pitch: 8 },
    gigante: { label: 'Gigante', emoji: '👹', desc: 'Grave e pesada', pitch: -7 },
    robo: { label: 'Robô', emoji: '🤖', desc: 'Metálica, de máquina' },
    radio: { label: 'Rádio', emoji: '📻', desc: 'Comunicador chiado' },
    caverna: { label: 'Caverna', emoji: '🦇', desc: 'Eco de lugar enorme' },
    alien: { label: 'Alien', emoji: '👽', desc: 'Aguda e ondulada', pitch: 4 },
  };

  let stretchLib = null;
  const loadStretch = () => (stretchLib ||= import('/vendor/stretch.mjs').then((m) => m.default).catch((error) => { stretchLib = null; throw error; }));

  // Saturação suave (tanh): esquenta sem estalar.
  function softClip(amount) {
    const size = 2048, curve = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1)) * 2 - 1;
      curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
    }
    return curve;
  }
  // Resposta de uma sala grande: ruído que some aos poucos.
  function roomImpulse(ctx, seconds, decay) {
    const length = Math.round(ctx.sampleRate * seconds), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    return buffer;
  }

  // Monta a parte nativa de um efeito entre "from" e "to"; devolve os nós criados, para desmontar depois.
  function build(ctx, id, from, to) {
    const nodes = [];
    const add = (node) => (nodes.push(node), node);
    const gain = (value) => { const node = add(ctx.createGain()); node.gain.value = value; return node; };
    const filter = (type, frequency, Q = 0.7, boost = 0) => {
      const node = add(ctx.createBiquadFilter());
      node.type = type; node.frequency.value = frequency; node.Q.value = Q; node.gain.value = boost;
      return node;
    };
    const oscillator = (type, frequency) => { const node = add(ctx.createOscillator()); node.type = type; node.frequency.value = frequency; node.start(); return node; };
    const shaper = (amount) => { const node = add(ctx.createWaveShaper()); node.curve = softClip(amount); node.oversample = '2x'; return node; };
    // Modulação em anel: a voz multiplicada por uma onda (o som metálico).
    const ring = (frequency) => { const node = gain(0); oscillator('sine', frequency).connect(node.gain); return node; };

    if (id === 'robo') {
      // Anel grave + um pente curto (ressonância de lata) + saturação leve.
      const mod = ring(52);
      const comb = add(ctx.createDelay(0.05));
      comb.delayTime.value = 0.009;
      const feedback = gain(0.55), mix = gain(1.25);
      from.connect(mod);
      mod.connect(comb).connect(feedback).connect(comb);
      mod.connect(mix);
      comb.connect(mix);
      mix.connect(filter('highpass', 140)).connect(shaper(2.2)).connect(to);
    } else if (id === 'radio') {
      // Só a faixa do meio, com ganho e distorção, como um comunicador.
      from.connect(filter('highpass', 450, 0.9)).connect(filter('lowpass', 2800, 0.9)).connect(filter('peaking', 1600, 1.1, 7))
        .connect(gain(3.2)).connect(shaper(3)).connect(gain(0.55)).connect(to);
    } else if (id === 'caverna') {
      // Voz direta, ecos que se repetem e escurecem, e a reverberação da sala.
      from.connect(gain(0.8)).connect(to);
      const delay = add(ctx.createDelay(1));
      delay.delayTime.value = 0.32;
      const tone = filter('lowpass', 2200);
      from.connect(delay).connect(tone).connect(gain(0.42)).connect(delay);
      tone.connect(gain(0.5)).connect(to);
      const room = add(ctx.createConvolver());
      room.buffer = roomImpulse(ctx, 2.6, 2.4);
      from.connect(room).connect(gain(0.32)).connect(to);
    } else if (id === 'alien') {
      // Vibrato rápido (atraso modulado) + um toque de anel agudo, sobre o tom mais alto.
      const vibrato = add(ctx.createDelay(0.02));
      vibrato.delayTime.value = 0.004;
      oscillator('sine', 7).connect(gain(0.0018)).connect(vibrato.delayTime);
      from.connect(vibrato);
      vibrato.connect(gain(0.85)).connect(to);
      vibrato.connect(ring(420)).connect(gain(0.35)).connect(to);
    } else if (id === 'gigante') {
      from.connect(filter('lowshelf', 180, 0.7, 4)).connect(to);
    } else from.connect(to);
    return nodes;
  }

  // Cria o efeito num AudioContext: input → (tom) → efeito → limitador → output.
  async function create(ctx, id) {
    const input = ctx.createGain(), output = ctx.createGain();
    // Limitador no fim: eco e distorção não estouram o volume.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.15;
    limiter.connect(output);
    let stretch = null, nodes = [], current = null, latency = 0;

    async function set(next) {
      const preset = PRESETS[next];
      if (!preset || next === 'none') throw new Error('Efeito de voz inválido.');
      if (preset.pitch && !stretch) {
        const createStretch = await loadStretch();
        stretch = await createStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        // Blocos curtos: menos atraso na conversa (a qualidade para voz continua boa).
        await stretch.configure({ blockMs: 70, intervalMs: 15 });
        stretch.start();
        latency = await stretch.latency();
      }
      input.disconnect();
      stretch?.disconnect();
      for (const node of nodes) { node.stop?.(); node.disconnect(); }
      let from = input;
      if (preset.pitch) {
        stretch.schedule({ semitones: preset.pitch, formantCompensation: false, formantSemitones: 0 });
        input.connect(stretch);
        from = stretch;
      }
      nodes = build(ctx, next, from, limiter);
      current = next;
    }

    function destroy() {
      input.disconnect();
      for (const node of nodes) { node.stop?.(); node.disconnect(); }
      if (stretch) { stretch.stop(); stretch.disconnect(); }
      limiter.disconnect();
      output.disconnect();
    }

    await set(id);
    return { input, output, set, destroy, get id() { return current; }, get latency() { return PRESETS[current]?.pitch ? latency : 0; } };
  }

  return { PRESETS, create, valid: (id) => Object.hasOwn(PRESETS, id) };
})();
