const loaded = new WeakMap(),
  buffers = new WeakMap();
let coefficients, wasm, levels;
const ASSETS = "/voice-fx-assets/";
export const CHOSEN = new Set([
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
]);
async function json(name) {
  const response = await fetch(ASSETS + name);
  if (!response.ok) throw Error("Voice effect asset unavailable: " + name);
  return response.json();
}
async function load(ctx, id) {
  if (!loaded.has(ctx)) {
    const promise = ctx.audioWorklet
      .addModule("/voice-fx-classic-worklet.mjs")
      .catch((error) => {
        loaded.delete(ctx);
        throw error;
      });
    loaded.set(ctx, promise);
  }
  coefficients ||= json("coefficients.json").catch((error) => {
    coefficients = null;
    throw error;
  });
  levels ||= json("levels.json").catch((error) => {
    levels = null;
    throw error;
  });
  const needsWasm = ["autotune", "acordes", "coral"].includes(id);
  if (needsWasm)
    wasm ||= fetch("/vendor/autotalent/autotalent.wasm")
      .then((response) => {
        if (!response.ok) throw Error("Autotalent unavailable");
        return response.arrayBuffer();
      })
      .then((bytes) => WebAssembly.compile(bytes))
      .catch((error) => {
        wasm = null;
        throw error;
      });
  const [c, w, l] = await Promise.all([
    coefficients,
    needsWasm ? wasm : null,
    levels,
    loaded.get(ctx),
  ]);
  return { coefficients: c, wasmModule: w, levels: l };
}
async function impulse(ctx, name) {
  let cache = buffers.get(ctx);
  if (!cache) {
    cache = new Map();
    buffers.set(ctx, cache);
  }
  if (!cache.has(name))
    cache.set(
      name,
      fetch(ASSETS + name + ".wav")
        .then((response) => {
          if (!response.ok) throw Error("Room unavailable: " + name);
          return response.arrayBuffer();
        })
        .then((bytes) => ctx.decodeAudioData(bytes))
        .catch((error) => {
          cache.delete(name);
          throw error;
        }),
    );
  return cache.get(name);
}

export async function createChosen(ctx, id) {
  if (!CHOSEN.has(id)) throw Error("Unknown chosen voice");
  if (ctx.sampleRate !== 48000)
    throw Error("These voice recipes require the call audio context at 48 kHz");
  const setup = await load(ctx, id),
    nodes = [],
    resetters = [],
    processors = [];
  let alive = true,
    blocked = false,
    failure = null;
  const add = (node) => (nodes.push(node), node),
    gain = (value) => {
      const node = add(ctx.createGain());
      node.gain.value = value;
      return node;
    };
  const input = gain(1),
    output = gain(1);
  function unit(factory) {
    const inlet = gain(1),
      outlet = gain(1);
    let node = add(factory());
    inlet.connect(node);
    node.connect(outlet);
    resetters.push(() => {
      inlet.disconnect(node);
      node.disconnect();
      nodes.splice(nodes.indexOf(node), 1);
      node = add(factory());
      inlet.connect(node);
      node.connect(outlet);
    });
    return { input: inlet, output: outlet };
  }
  function connectUnit(from, factory) {
    const stage = unit(factory);
    from.connect(stage.input);
    return stage.output;
  }
  function filter(from, type, hz, q = Math.SQRT1_2, db = 0) {
    return connectUnit(from, () => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = hz;
      n.Q.value = q;
      n.gain.value = db;
      return n;
    });
  }
  function sos(from, rows) {
    let last = from;
    for (const c of rows)
      last = connectUnit(last, () =>
        ctx.createIIRFilter(c.slice(0, 3), c.slice(3)),
      );
    return last;
  }
  function delay(from, seconds) {
    return connectUnit(from, () => {
      const n = ctx.createDelay(2);
      n.delayTime.value = seconds;
      return n;
    });
  }
  function convolve(from, buffer) {
    return connectUnit(from, () => {
      const n = ctx.createConvolver();
      n.normalize = false;
      n.buffer = buffer;
      return n;
    });
  }
  function worklet(name, options, inputs = 1) {
    const n = add(
      new AudioWorkletNode(ctx, name, {
        numberOfInputs: inputs,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: "explicit",
        processorOptions: { ...setup, ...options },
      }),
    );
    n.addEventListener("processorerror", (event) => {
      failure = event;
    });
    n.addEventListener("error", (event) => {
      failure = event;
    });
    processors.push(n);
    return n;
  }
  let last = input,
    latency = 0,
    tailSeconds = 0,
    stretch = null;
  try {
    if (["telefone", "megafone"].includes(id)) {
      for (const [type, hz] of [
        ["lowpass", 2000],
        ["lowpass", 2000],
        ["highpass", 500],
        ["highpass", 500],
      ])
        last = filter(last, type, hz, 1);
      if (id === "megafone")
        last = connectUnit(last, () => {
          const n = ctx.createWaveShaper(),
            curve = new Float32Array(8193);
          for (let i = 0; i < curve.length; i++) {
            const x = (2 * i) / (curve.length - 1) - 1;
            curve[i] =
              (33 * x * ((20 * Math.PI) / 180)) / (Math.PI + 30 * Math.abs(x));
          }
          n.curve = curve;
          n.oversample = "4x";
          return n;
        });
      last = connectUnit(last, () => {
        const n = ctx.createDynamicsCompressor();
        n.threshold.value = -24;
        n.knee.value = 30;
        n.ratio.value = 12;
        n.attack.value = 0.003;
        n.release.value = 0.25;
        return n;
      });
      latency = 0.006;
    }
    if (id === "alien") {
      const createStretch = (await import("/vendor/stretch.mjs")).default;
      stretch = add(
        await createStretch(ctx, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        }),
      );
      await stretch.configure({ blockMs: 70, intervalMs: 15 });
      stretch.schedule({
        semitones: 4,
        formantCompensation: false,
        formantSemitones: 0,
      });
      stretch.start();
      input.connect(stretch);
      last = stretch;
      latency = await stretch.latency();
    }
    if (
      ["robo", "fantasma", "bebado", "autotune", "acordes", "coral"].includes(
        id,
      )
    ) {
      const kernel = worklet("resenhex-classic", { id });
      input.connect(kernel);
      last = kernel;
      latency =
        id === "fantasma"
          ? 512 / 48000
          : id === "bebado"
            ? 2304 / 48000
            : ["autotune", "acordes", "coral"].includes(id)
              ? 2047 / 48000
              : 0;
    }
    if (id === "banheiro") {
      const buffer = await impulse(ctx, "banheiro"),
        mix = gain(1),
        dry = gain(0.65),
        wet = gain(0.55);
      input.connect(dry).connect(mix);
      convolve(delay(input, 0.008), buffer).connect(wet).connect(mix);
      last = mix;
      tailSeconds = buffer.duration + 0.008;
    }
    if (["caverna", "alien", "fantasma"].includes(id)) {
      last = convolve(last, await impulse(ctx, id));
      tailSeconds = 4;
    }
    const musical = id === "acordes" || id === "coral";
    let lead = null;
    if (musical) {
      const settings =
          id === "acordes"
            ? { wet: 0.42, seconds: 2.4 }
            : { wet: 0.55, seconds: 3.2 },
        frozen = setup.levels.effects[id],
        room = await impulse(ctx, id),
        mix = gain(1),
        dry = gain(frozen.dryGain),
        wet = gain(frozen.roomWetGain);
      last.connect(dry).connect(mix);
      convolve(sos(last, setup.coefficients.musicHighpass), room)
        .connect(wet)
        .connect(mix);
      last = filter(mix, "peaking", 2500, 0.7, -4);
      lead = worklet("resenhex-classic-lead", {});
      delay(input, latency).connect(lead);
      tailSeconds = settings.seconds + 0.06;
    }
    if (id === "bebado") tailSeconds = 0.7;
    // The owner explicitly retained the louder approved Robot. Existing site
    // voices remain unchanged; all other new voices use active-level matching.
    const levelDb =
      id === "fantasma" ? -3 : musical ? 1 : id === "caverna" ? 0.5 : 0;
    const level = worklet(
      "resenhex-classic-level",
      {
        ...setup.levels.effects[id],
        music: musical,
        leadDb: id === "acordes" ? 0.75 : 0.25,
        levelDb,
        match: id !== "robo",
      },
      3,
    );
    last.connect(level, 0, 0);
    lead?.connect(level, 0, 1);
    delay(input, latency).connect(level, 0, 2);
    level.connect(output);
    latency += 0.003;
    if (failure) throw Error("Voice effect processor could not initialize");
    function setBlocked(value) {
      if (!alive || blocked === !!value) return;
      blocked = !!value;
      input.gain.setValueAtTime(blocked ? 0 : 1, ctx.currentTime);
      output.gain.setValueAtTime(blocked ? 0 : 1, ctx.currentTime);
      for (const processor of processors) {
        processor.parameters
          .get("blocked")
          .setValueAtTime(blocked ? 1 : 0, ctx.currentTime);
        if (blocked) processor.port.postMessage({ type: "reset" });
      }
      if (blocked) for (const reset of resetters) reset();
    }
    function destroy() {
      if (!alive) return;
      alive = false;
      for (const processor of processors)
        processor.port.postMessage({ type: "dispose" });
      for (const node of nodes) {
        node.stop?.();
        node.disconnect();
      }
    }
    return {
      input,
      output,
      latency,
      tailSeconds,
      setBlocked,
      destroy,
      get id() {
        return id;
      },
      get processors() {
        return processors;
      },
    };
  } catch (error) {
    for (const p of processors) p.port.postMessage({ type: "dispose" });
    for (const node of nodes) {
      node.stop?.();
      node.disconnect();
    }
    throw error;
  }
}
