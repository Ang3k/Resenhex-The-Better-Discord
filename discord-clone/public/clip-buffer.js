// CLIPAR: guarda os últimos 30 s do som de cada pessoa da chamada (por conta, não por conexão:
// reconectar continua o mesmo anel). Quem desliga "Pode clipar meu áudio" é descartado na hora.
window.ClipBuffer = ({ getCtx, now = () => performance.now(), maxPeople = 12 } = {}) => {
  const WINDOW_MS = 30_000;
  const people = new Map(); // accountId -> { node, source, mute, profile, since, leftAt, lastSpoke }
  const blocked = new Set(); // contas com a opção desligada
  let states = []; // [{ t, byAccount: Map }] a cada 100 ms
  let moduleReady = null, snapSeq = 0;

  function forget(accountId) {
    const p = people.get(accountId);
    if (!p) return;
    people.delete(accountId);
    p.source?.disconnect();
    p.node.port.postMessage({ type: 'clear' });
    p.node.disconnect();
    p.mute.disconnect();
  }

  function pruneLeft() {
    for (const [id, p] of people) if (p.leftAt != null && now() - p.leftAt > WINDOW_MS) forget(id);
  }

  async function track(accountId, stream, profile) {
    if (!accountId || !stream || blocked.has(accountId)) return;
    const ctx = getCtx();
    moduleReady ||= ctx.audioWorklet.addModule('/clip-buffer-worklet.js');
    await moduleReady;
    if (blocked.has(accountId)) return;
    let p = people.get(accountId);
    if (!p) {
      if (people.size >= maxPeople) {
        const quietest = [...people].sort((a, b) => a[1].lastSpoke - b[1].lastSpoke)[0];
        forget(quietest[0]);
      }
      const node = new window.AudioWorkletNode(ctx, 'clip-buffer');
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(ctx.destination);
      p = { node, mute, source: null, since: now(), lastSpoke: now() };
      people.set(accountId, p);
    }
    p.source?.disconnect();
    p.source = ctx.createMediaStreamSource(stream);
    p.source.connect(p.node);
    p.profile = profile;
    p.leftAt = null;
  }

  function untrack(accountId) {
    const p = people.get(accountId);
    if (!p || p.leftAt != null) return;
    p.source?.disconnect();
    p.source = null;
    p.leftAt = now();
  }

  // states: Map accountId -> { muted, silenced, allowClips, speaking }
  function sample(byAccount) {
    const t = now();
    for (const [id, st] of byAccount) {
      if (st.allowClips === false) { blocked.add(id); forget(id); }
      else blocked.delete(id);
      if (st.speaking && people.has(id)) people.get(id).lastSpoke = t;
    }
    states.push({ t, byAccount: new Map(byAccount) });
    while (states.length && t - states[0].t > WINDOW_MS) states.shift();
    pruneLeft();
  }

  const recorded = () => Math.min(30, Math.max(0, ...[...people.values()].map((p) => (now() - p.since) / 1000)));

  function ringOf(p) {
    return new Promise((resolve) => {
      const id = ++snapSeq;
      const timer = setTimeout(() => resolve({ pcm: new Int16Array(0), samples: 0 }), 1000);
      p.node.port.onmessage = ({ data }) => {
        if (data.type !== 'snapshot' || data.id !== id) return;
        clearTimeout(timer);
        resolve(data);
      };
      p.node.port.postMessage({ type: 'snapshot', id });
    });
  }

  // Foto de todos os anéis no mesmo instante, alinhados pelo fim e com o mesmo tamanho.
  async function snapshot() {
    pruneLeft();
    const takenAt = now(), sampleRate = getCtx().sampleRate;
    const entries = [...people];
    const rings = await Promise.all(entries.map(([, p]) => ringOf(p)));
    const total = Math.max(0, ...rings.map((r) => r.samples));
    const out = entries.map(([accountId, p], i) => {
      const { pcm, samples } = rings[i];
      const offset = total - samples, data = new Float32Array(total);
      for (let k = 0; k < samples; k++) data[offset + k] = pcm[k] / 32767;
      return { accountId, profile: p.profile, pcm: data, offset, allowClips: !blocked.has(accountId), left: p.leftAt != null };
    });
    return { sampleRate, takenAt, seconds: total / sampleRate, people: out, states: states.slice() };
  }

  function stop() {
    for (const id of [...people.keys()]) forget(id);
    states = [];
  }

  return { track, untrack, forget, sample, recorded, snapshot, stop };
};
