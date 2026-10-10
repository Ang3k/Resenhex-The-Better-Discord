window.VoiceAI = (() => {
  const bridge = window.resenhexDesktop?.voiceAi;
  const listeners = new Set(), controllers = new Set(), contexts = new WeakMap();
  let state = null, metrics = null;
  function changed() { for (const listener of listeners) listener(state, metrics); }
  function update(next) {
    const previous = state;
    state = next; changed();
    if (next.state === 'error' || !next.preferences.model) for (const controller of controllers) controller.fallback(next.error || 'Escolha uma voz para ativar a conversão.');
    else if (previous && JSON.stringify(previous.preferences) !== JSON.stringify(next.preferences)) for (const controller of controllers) controller.reload();
  }
  bridge?.onState(update);
  async function refresh() { if (bridge) update(await bridge.status()); return state; }
  async function command(name, value) { if (!bridge) throw new Error('A conversão por IA está disponível no aplicativo Windows.'); const result = await bridge[name](value); if (result?.preferences) update(result); return result; }
  async function create(ctx) {
    if (!bridge) throw new Error('Abra o aplicativo Windows para usar Voz por IA.');
    if (ctx.sampleRate !== 48000) throw new Error('Voz por IA precisa de áudio a 48 kHz.');
    await refresh();
    if (!contexts.has(ctx)) contexts.set(ctx, ctx.audioWorklet.addModule('/voice-ai-worklet.js').catch((error) => { contexts.delete(ctx); throw error; }));
    await contexts.get(ctx);
    const node = new AudioWorkletNode(ctx, 'resenhex-voice-ai', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { blockMs: state.blockMs } });
    let session = null, destroyed = false, blocked = true, epoch = 0, busy = false, failures = 0, missed = 0, drops = 0, opening = 0;
    let latencies = [], active = false, convertedBlocks = 0, notification = null;
    const notify = (value, immediate = false) => {
      controller.metrics = value; metrics = value;
      if (immediate) { clearTimeout(notification); notification = null; changed(); }
      else if (!notification) notification = setTimeout(() => { notification = null; if (!destroyed) changed(); }, 250);
    };
    const controller = {
      input: node, output: node,
      get id() { return active ? 'ai' : null; },
      get latency() { return controller.metrics?.latencyP95 || 0; },
      async set(id) { if (id !== 'ai') throw new Error('Troque a cadeia de microfone para usar outro efeito.'); await controller.reload(); },
      setBlocked(value) { value = !!value; if (blocked !== value) { blocked = value; node.port.postMessage({ type: 'gate', blocked }); } },
      fallback(error) {
        active = false; epoch++; failures = 0; missed = 0;
        node.port.postMessage({ type: 'mode', mode: 'fallback' });
        if (session) { bridge.close(session.stream).catch(() => {}); session = null; }
        notify({ active: false, error, drops, backend: state?.backend }, true);
      },
      async reload() {
        const token = ++opening;
        active = false; epoch++; node.port.postMessage({ type: 'mode', mode: 'waiting' });
        if (session) { bridge.close(session.stream).catch(() => {}); session = null; }
        try {
          const next = await bridge.open();
          if (destroyed || token !== opening) { await bridge.close(next.stream); return; }
          session = next; active = true; failures = 0; missed = 0; drops = 0; latencies = []; convertedBlocks = 0;
          node.port.postMessage({ type: 'configure', blockMs: next.blockMs });
          node.port.postMessage({ type: 'mode', mode: 'active' });
          notify({ active: true, backend: next.backend, drops: 0 }, true);
        } catch (error) { if (!destroyed && token === opening) controller.fallback(error.message); }
      },
      destroy() { destroyed = true; clearTimeout(notification); opening++; controllers.delete(controller); active = false; node.port.onmessage = null; node.port.postMessage({ type: 'gate', blocked: true, flush: true }); node.disconnect(); if (session) bridge.close(session.stream).catch(() => {}); session = null; metrics = [...controllers].at(-1)?.metrics || null; changed(); },
    };
    node.port.onmessage = async ({ data }) => {
      if (destroyed) return;
      if (data.type === 'epoch') { epoch = data.epoch; return; }
      if (data.type === 'latency') {
        latencies.push(data.ms); if (latencies.length > 100) latencies.shift();
        const sorted = [...latencies].sort((a, b) => a - b);
        notify({ ...controller.metrics, latencyP95: sorted[Math.ceil(sorted.length * .95) - 1] }); return;
      }
      if (data.type === 'overrun') { if (++failures >= 3) controller.fallback('Conversão lenta; sua voz voltou ao normal.'); return; }
      if (data.type === 'skipped') {
        if (active && !blocked && session && data.epoch === epoch) { drops++; if (++missed * session.blockMs >= 600) controller.fallback('O computador não acompanha esta qualidade; sua voz voltou ao normal.'); }
        return;
      }
      const consumed = () => node.port.postMessage({ type: 'consumed', epoch: data.epoch, sequence: data.sequence });
      if (data.type !== 'capture' || !active || blocked || !session) return;
      if (busy) { consumed(); drops++; if (++missed * session.blockMs >= 600) controller.fallback('O computador não acompanha esta qualidade; sua voz voltou ao normal.'); return; }
      const current = session;
      busy = true;
      try {
        const reply = await bridge.convert({ stream: current.stream, epoch: data.epoch, pcm: data.pcm });
        missed = 0;
        if (destroyed || blocked || !active || session !== current || data.epoch !== epoch || reply.generation !== current.generation) return;
        if (reply.rtf > .95) { if (++failures >= 3) { controller.fallback('Conversão lenta; tente GPU ou outra qualidade. Sua voz voltou ao normal.'); return; } }
        else failures = 0;
        const pcm = reply.pcm instanceof Float32Array ? reply.pcm : new Float32Array(reply.pcm);
        node.port.postMessage({ type: 'audio', pcm, epoch: data.epoch, sequence: data.sequence, captureFrame: data.captureFrame }, [pcm.buffer]);
        notify({ ...controller.metrics, active: true, inferenceMs: reply.inferenceMs, rtf: reply.rtf, backend: reply.backend, silent: reply.silent, drops, convertedBlocks: ++convertedBlocks });
      } catch (error) { if (!destroyed && session === current) controller.fallback(error.message); }
      finally { busy = false; if (!destroyed) consumed(); }
    };
    controllers.add(controller);
    // O personagem carrega em segundo plano (conferir arquivos, abrir o motor e aquecer a GPU leva
    // alguns segundos): entrar na call não espera por isso. Falhas caem na voz normal, no mesmo track.
    controller.reload();
    return controller;
  }
  // Populate both effect pickers on startup, before the first preview or call.
  if (typeof bridge?.status === 'function') refresh().catch(() => {});
  return { supported: !!bridge, get state() { return state; }, create, refresh, command, retry: () => Promise.all([...controllers].map((controller) => controller.reload())), subscribe(listener) { listeners.add(listener); listener(state, metrics); return () => listeners.delete(listener); } };
})();
