// Transmissão com o som do computador sem o som do próprio Resenhex, quando o navegador não sabe
// deixá-lo de fora sozinho (Windows 10, por exemplo). Tudo que o Resenhex toca passa por uma saída
// única, a referência; o own-audio-worklet.js subtrai da captura o eco dessa referência, com o
// atraso e o caminho medidos pelo own-audio-estimator.js num worker.
window.OwnAudio = (() => {
  const loaded = new WeakMap();
  const learned = new WeakMap(); // atraso e caminho da última transmissão, por contexto

  // Liga o filtro na captura e devolve a faixa limpa. `reference` é o nó que leva tudo que o
  // Resenhex toca; ele e a captura ficam no mesmo AudioContext.
  async function create(ctx, reference, track) {
    if (!loaded.has(ctx)) loaded.set(ctx, ctx.audioWorklet.addModule('own-audio-worklet.js'));
    await loaded.get(ctx);
    const node = new AudioWorkletNode(ctx, 'own-audio-remover', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
    const worker = new Worker('own-audio-estimator.js');
    const channel = new MessageChannel();
    node.port.postMessage({ estimator: channel.port1 }, [channel.port1]);
    worker.postMessage({ start: true, sampleRate: ctx.sampleRate, port: channel.port2, hint: learned.get(ctx) || null }, [channel.port2]);
    const stats = { delay: null, peak: 0, measurements: 0, updates: 0 };
    worker.onmessage = ({ data }) => {
      if (!data.stats) return;
      const { h, ...rest } = data.stats;
      Object.assign(stats, rest);
      if (h && rest.delay !== null) learned.set(ctx, { delay: rest.delay, h });
      else if (rest.delay === null) learned.delete(ctx);
    };

    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const output = ctx.createMediaStreamDestination();
    output.channelCount = 2;
    source.connect(node, 0, 0);
    reference.connect(node, 0, 1);
    node.connect(output);

    const clean = output.stream.getAudioTracks()[0];
    let stopped = false;
    return {
      track: clean,
      stats,
      stop() {
        if (stopped) return;
        stopped = true;
        worker.terminate();
        source.disconnect(); node.disconnect();
        try { reference.disconnect(node); } catch {}
        clean.stop(); track.stop();
      },
    };
  }

  return { create };
})();
