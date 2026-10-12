const RATE = 48000,
  ids = [
    "esquilo",
    "gigante",
    "telefone",
    "megafone",
    "banheiro",
    "caverna",
    "alien",
    "robo",
    "fantasma",
    "bebado",
    "autotune",
    "acordes",
    "coral",
  ];
const cards = document.getElementById("cards"),
  status = document.getElementById("status");
for (const id of ids) {
  const card = document.createElement("article");
  card.className = "card";
  card.id = id;
  const heading = document.createElement("h2");
  const art = document.createElement('img');
  art.src = VoiceFx.PRESETS[id].icon;
  art.alt = '';
  art.width = art.height = 56;
  art.decoding = 'async';
  heading.append(art, document.createTextNode(VoiceFx.PRESETS[id].label));
  card.append(heading);
  for (const [label, url] of [
    ["Escolhido · referência", "/reference/" + id + ".wav"],
    ["App · resultado novo", "/rendered/" + id + ".wav"],
  ]) {
    const l = document.createElement("label");
    l.textContent = label;
    const a = document.createElement("audio");
    a.controls = true;
    a.preload = "metadata";
    a.src = url;
    a.volume = 0.25;
    a.setAttribute("aria-label", id + " " + label);
    card.append(l, a);
  }
  cards.append(card);
}
const players = [...document.querySelectorAll("audio")];
for (const p of players)
  p.addEventListener("play", () => {
    if (p.paused) return;
    for (const other of players) if (other !== p) other.pause();
  });
document.getElementById("stop").onclick = () => {
  for (const p of players) {
    p.pause();
    p.currentTime = 0;
  }
};
document.getElementById("volume").oninput = (event) => {
  document.getElementById("value").value = event.target.value + "%";
  for (const p of players) p.volume = Number(event.target.value) / 100;
};
async function decode(url) {
  const c = new OfflineAudioContext(1, 1, RATE);
  return c.decodeAudioData(await (await fetch(url)).arrayBuffer());
}
function wav(channels) {
  const bytes = new Uint8Array(44 + channels[0].length * channels.length * 2),
    v = new DataView(bytes.buffer),
    text = (offset, s) => {
      for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i);
    };
  text(0, "RIFF");
  v.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels.length, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * channels.length * 2, true);
  v.setUint16(32, channels.length * 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, bytes.length - 44, true);
  for (let i = 0; i < channels[0].length; i++)
    for (let c = 0; c < channels.length; c++) {
      const value = channels[c][i];
      if (!Number.isFinite(value) || Math.abs(value) >= 1)
        throw Error("Invalid sample");
      v.setInt16(
        44 + (i * channels.length + c) * 2,
        Math.round(value * 32767),
        true,
      );
    }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
async function weighted(channels) {
  const n = channels[0].length,
    c = new OfflineAudioContext(1, n, RATE),
    b = c.createBuffer(1, n, RATE),
    mono = b.getChannelData(0);
  for (let i = 0; i < n; i++)
    for (const channel of channels) mono[i] += channel[i] / channels.length;
  const source = c.createBufferSource();
  source.buffer = b;
  const k = Math.tan((Math.PI * 100) / RATE),
    q = Math.SQRT1_2,
    norm = 1 / (1 + k / q + k * k),
    hp = c.createIIRFilter(
      [norm, -2 * norm, norm],
      [1, 2 * (k * k - 1) * norm, (1 - k / q + k * k) * norm],
    );
  source.connect(hp).connect(c.destination);
  source.start();
  const output = (await c.startRendering()).getChannelData(0);
  let sum = 0,
    count = 0;
  for (let start = 0; start + 960 <= n; start += 960) {
    let energy = 0;
    for (let i = start; i < start + 960; i++) energy += mono[i] ** 2;
    if (energy / 960 > 10 ** (-45 / 10))
      for (let i = start; i < start + 960; i++) {
        sum += output[i] ** 2;
        count++;
      }
  }
  return sum / Math.max(1, count);
}
async function peak4x(channels) {
  const c = new OfflineAudioContext(
      channels.length,
      channels[0].length * 4,
      RATE * 4,
    ),
    b = c.createBuffer(channels.length, channels[0].length, RATE);
  for (let i = 0; i < channels.length; i++) b.copyToChannel(channels[i], i);
  const source = c.createBufferSource();
  source.buffer = b;
  source.connect(c.destination);
  source.start();
  const result = await c.startRendering();
  let peak = 0;
  for (let i = 0; i < result.numberOfChannels; i++)
    for (const x of result.getChannelData(i))
      peak = Math.max(peak, Math.abs(x));
  return peak;
}
export async function renderAll(selected = ids) {
  const original = await decode("/reference/original.wav"),
    raw = new Float32Array(await (await fetch("/input.f32")).arrayBuffer()),
    dry = [raw],
    dryEnergy = await weighted(dry),
    results = [];
  for (const id of selected) {
    status.textContent = "Renderizando " + VoiceFx.PRESETS[id].label + "…";
    const c = new OfflineAudioContext(2, original.length + RATE * 11, RATE),
      source = c.createBufferSource();
    source.buffer = ["esquilo", "gigante"].includes(id)
      ? original
      : c.createBuffer(1, raw.length, RATE);
    if (!["esquilo", "gigante"].includes(id))
      source.buffer.copyToChannel(raw, 0);
    const fx = await VoiceFx.create(c, id);
    source.connect(fx.input);
    fx.output.connect(c.destination);
    source.start();
    const begun = performance.now(),
      audio = await c.startRendering(),
      elapsed = performance.now() - begun,
      trim = Math.round(fx.latency * RATE),
      length = original.length + Math.round(Math.min(4, fx.tailSeconds) * RATE),
      channels = [
        audio.getChannelData(0).slice(trim, trim + length),
        audio.getChannelData(1).slice(trim, trim + length),
      ];
    const peak = await peak4x(channels),
      energy = await weighted(channels),
      reference = await decode("/reference/" + id + ".wav"),
      rchannels = Array.from({ length: reference.numberOfChannels }, (_, i) =>
        reference.getChannelData(i).slice(),
      ),
      referenceEnergy = await weighted(rchannels);
    results.push({
      id,
      inputPrecision: ["esquilo", "gigante"].includes(id)
        ? "same PCM16 as the published online proof"
        : "original float32 reference input",
      latencySeconds: fx.latency,
      tailSeconds: fx.tailSeconds,
      duration: channels[0].length / RATE,
      renderMilliseconds: elapsed,
      levelVsOriginalDb: 10 * Math.log10(energy / dryEnergy),
      levelVsReferenceDb: 10 * Math.log10(energy / referenceEnergy),
      peak4xDb: 20 * Math.log10(peak),
      finite: channels.every((channel) => channel.every(Number.isFinite)),
      wav: wav(channels),
    });
    fx.destroy();
  }
  status.textContent = "Resultados renderizados";
  return results;
}
window.renderAll = renderAll;
window.labReady = true;
fetch("/rendered/metrics.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (data) {
      for (const row of data) {
        const p = document.createElement("p");
        p.textContent = `Atraso fixo ${(row.latencySeconds * 1000).toFixed(1)} ms · nível ${row.levelVsOriginalDb.toFixed(2)} dB · pico ${row.peak4xDb.toFixed(2)} dBFS`;
        document.getElementById(row.id).append(p);
      }
      status.textContent = "Escolha um áudio";
    } else status.textContent = "Aguardando a renderização";
  })
  .catch(() => {});
