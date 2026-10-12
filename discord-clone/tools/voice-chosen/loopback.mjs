const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function peak(analyser, milliseconds = 350) {
  const samples = new Float32Array(analyser.fftSize);
  let result = 0;
  for (let time = 0; time < milliseconds; time += 50) {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) sum += value * value;
    result = Math.max(result, Math.sqrt(sum / samples.length));
    await wait(50);
  }
  return result;
}
async function processorStats(fx) {
  const p =
    fx.processors.find((node) => node.name === "resenhex-classic") ||
    fx.processors[0];
  if (!p) return null;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error("DSP stats timeout")), 3000);
    const handler = ({ data }) => {
      if (data.type !== "stats") return;
      p.port.removeEventListener("message", handler);
      clearTimeout(timeout);
      resolve(data);
    };
    p.port.addEventListener("message", handler);
    p.port.start();
    p.port.postMessage({ type: "stats" });
  });
}
export async function loopback() {
  const context = new AudioContext({ sampleRate: 48000 }),
    raw = new Float32Array(await (await fetch("/input.f32")).arrayBuffer()),
    buffer = context.createBuffer(1, raw.length, 48000);
  buffer.copyToChannel(raw, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const input = context.createGain();
  source.connect(input);
  const fx = await VoiceFx.create(context, "bebado"),
    destination = context.createMediaStreamDestination(),
    silent = context.createGain();
  silent.gain.value = 0;
  input.connect(fx.input);
  fx.output.connect(destination);
  fx.output.connect(silent).connect(context.destination);
  const a = new RTCPeerConnection({ iceServers: [] }),
    b = new RTCPeerConnection({ iceServers: [] }),
    pendingA = [],
    pendingB = [];
  const candidate = (peer, pending, c) => {
    if (c) {
      if (peer.remoteDescription) peer.addIceCandidate(c).catch(() => {});
      else pending.push(c);
    }
  };
  a.onicecandidate = (event) => candidate(b, pendingB, event.candidate);
  b.onicecandidate = (event) => candidate(a, pendingA, event.candidate);
  const received = new Promise(
    (resolve) => (b.ontrack = (event) => resolve(event.streams[0])),
  );
  a.addTrack(destination.stream.getAudioTracks()[0], destination.stream);
  await a.setLocalDescription(await a.createOffer());
  await b.setRemoteDescription(a.localDescription);
  for (const c of pendingB) await b.addIceCandidate(c);
  await b.setLocalDescription(await b.createAnswer());
  await a.setRemoteDescription(b.localDescription);
  for (const c of pendingA) await a.addIceCandidate(c);
  const remoteStream = await received,
    playback = new Audio();
  playback.srcObject = remoteStream;
  playback.muted = true;
  await playback.play();
  const remote = context.createMediaStreamSource(remoteStream),
    analyser = context.createAnalyser(),
    localAnalyser = context.createAnalyser(),
    inputAnalyser = context.createAnalyser();
  analyser.fftSize = 2048;
  remote.connect(analyser).connect(silent);
  fx.output.connect(localAnalyser).connect(silent);
  input.connect(inputAnalyser).connect(silent);
  source.start();
  await context.resume();
  const record = {
    connection: "native local RTCPeerConnection / Opus",
    voices: [],
    device: "desktop Chromium; not an Android measurement",
  };
  try {
    await wait(4000);
    record.drunkDuringSpeech = await processorStats(fx);
    if (
      record.drunkDuringSpeech.maximumDelaySeconds > 0.7 ||
      record.drunkDuringSpeech.minimumDelaySeconds < 0
    )
      throw Error("Drunk queue out of bounds");
    input.gain.value = 0;
    await wait(1300);
    record.drunkAfterPause = await processorStats(fx);
    if (record.drunkAfterPause.queuedDelaySeconds > 1 / 48000)
      throw Error("Drunk pause did not drain");
    input.gain.value = 1;
    for (const id of [
      "bebado",
      "esquilo",
      "gigante",
      "telefone",
      "megafone",
      "banheiro",
      "caverna",
      "alien",
      "robo",
      "fantasma",
      "autotune",
      "acordes",
      "coral",
      "radio",
    ]) {
      if (fx.id !== id) await fx.set(id);
      await wait(180);
      const speech = await peak(analyser, 600);
      if (speech < 1e-6 || fx.degraded) {
        const sent = [...(await a.getStats()).values()].find(
          (row) => row.type === "outbound-rtp" && row.kind === "audio",
        );
        throw Error(
          "No transformed RTP audio: " +
            id +
            " " +
            JSON.stringify({
              localRms: await peak(localAnalyser),
              inputRms: await peak(inputAnalyser),
              degraded: fx.degraded,
              context: context.state,
              a: a.connectionState,
              b: b.connectionState,
              bytes: sent?.bytesSent,
              remoteMuted: remoteStream.getAudioTracks()[0].muted,
              drunk: record.drunkDuringSpeech,
            }),
        );
      }
      fx.setBlocked(true);
      input.gain.value = 0;
      await wait(100);
      const mute = await peak(analyser, 180);
      fx.setBlocked(false);
      await wait(220);
      const after = await peak(analyser, 250),
        localAfter = await peak(localAnalyser, 100);
      if (localAfter > 1e-8 || after > 1e-5)
        throw Error(
          "History replayed after mute: " +
            id +
            " " +
            JSON.stringify({ localAfter, decodedOpus: after }),
        );
      record.voices.push({
        id,
        receivedRms: speech,
        mutedRms: mute,
        unmutedWithSilentSourceRms: after,
        localUnmutedSilenceRms: localAfter,
        decodedSilenceCeilingRms: 1e-5,
        latency: fx.latency,
        degraded: fx.degraded,
      });
      input.gain.value = 1;
    }
    const stats = [...(await a.getStats()).values()].find(
      (row) => row.type === "outbound-rtp" && row.kind === "audio",
    );
    record.packetsSent = stats?.packetsSent;
    record.bytesSent = stats?.bytesSent;
    if (!record.bytesSent) throw Error("No Opus packets");
    return record;
  } finally {
    playback.pause();
    playback.srcObject = null;
    source.stop();
    fx.destroy();
    a.close();
    b.close();
    await context.close();
  }
}
export async function failureRecovery() {
  const context = new AudioContext({ sampleRate: 48000 }),
    source = context.createOscillator(),
    sink = context.createGain(),
    analyser = context.createAnalyser();
  sink.gain.value = 0;
  source.frequency.value = 193;
  const fx = await VoiceFx.create(context, "robo");
  source.connect(fx.input);
  fx.output.connect(analyser).connect(sink).connect(context.destination);
  source.start();
  await context.resume();
  try {
    for (let i = 0; i < 100 && !fx.degraded; i++) await wait(30);
    if (!fx.degraded || fx.id !== "none")
      throw Error("Runtime DSP failure did not recover");
    const rms = await peak(analyser);
    if (rms < 0.1) throw Error("Dry recovery is silent");
    fx.setBlocked(true);
    await wait(60);
    const muted = await peak(analyser);
    if (muted > 1e-6) throw Error("Failure recovery bypassed mute");
    return {
      actualProcessorFailure: true,
      degraded: true,
      id: fx.id,
      dryRms: rms,
      mutedRms: muted,
    };
  } finally {
    source.stop();
    fx.destroy();
    await context.close();
  }
}
