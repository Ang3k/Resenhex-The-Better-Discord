import {
  Sos,
  Robot,
  Whisper,
  Drunk,
  peaking,
} from "./voice-fx-classic-core.mjs";

const CHORDS = [
  {
    notes: [48, 43, 45, 41],
    pan: 0,
    gain: 0.4,
    delay: 0,
    amp: 0.04,
    hz: 4.6,
    warp: -0.12,
  },
  {
    notes: [55, 55, 57, 57],
    pan: -0.55,
    gain: 0.38,
    delay: 7,
    amp: 0.07,
    hz: 5.2,
    warp: 0,
  },
  {
    notes: [60, 59, 60, 60],
    pan: 0.55,
    gain: 0.38,
    delay: 12,
    amp: 0.07,
    hz: 5.6,
    warp: 0,
  },
  {
    notes: [64, 62, 64, 65],
    pan: -0.25,
    gain: 0.4,
    delay: 16,
    amp: 0.08,
    hz: 5.0,
    warp: 0.08,
  },
  {
    notes: [67, 67, 69, 69],
    pan: 0.3,
    gain: 0.34,
    delay: 21,
    amp: 0.08,
    hz: 5.9,
    warp: 0.12,
  },
];
const CHOIR = [
  {
    shift: -7,
    warp: -0.3,
    gain: 0.34,
    singers: [
      [-0.2, 24, 4.7],
      [0.25, 41, 5.1],
    ],
  },
  {
    shift: 0,
    warp: -0.05,
    gain: 0.3,
    singers: [
      [-0.45, 0, 5.4],
      [0.4, 29, 4.9],
    ],
  },
  {
    shift: 2,
    warp: 0.15,
    gain: 0.26,
    singers: [
      [-0.7, 13, 5.6],
      [0.15, 37, 5.0],
      [0.6, 52, 5.9],
    ],
  },
  {
    shift: 4,
    warp: 0.3,
    gain: 0.24,
    singers: [
      [0.7, 9, 6.0],
      [-0.15, 33, 5.5],
      [0.35, 58, 6.3],
    ],
  },
];
class ClassicProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "blocked",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.id = o.id;
    this.coefficients = o.coefficients;
    this.alive = true;
    this.wasBlocked = false;
    this.voices = [];
    this.frame = 0;
    if (this.id === "robo") this.kernel = new Robot(o.coefficients, sampleRate);
    if (this.id === "fantasma") this.kernel = new Whisper(sampleRate);
    if (this.id === "bebado")
      this.kernel = new Drunk(o.coefficients, sampleRate);
    if (["autotune", "acordes", "coral"].includes(this.id)) {
      this.wasm = new WebAssembly.Instance(o.wasmModule, {}).exports;
      this.wasm._initialize();
      if (!this.wasm.at_setup(sampleRate))
        throw Error("Unsupported Autotalent sample rate");
      const add = (
        mode,
        shift,
        warp,
        amp,
        hz,
        smooth,
        notes,
        pan,
        gain,
        delay,
      ) => {
        const slot = this.wasm.at_new(
          mode,
          shift,
          warp,
          amp,
          hz,
          smooth,
          ...(notes || [0, 0, 0, 0]),
        );
        if (slot < 0) throw Error("Autotalent allocation failed");
        this.voices.push({
          slot,
          input: new Float32Array(
            this.wasm.memory.buffer,
            this.wasm.at_input_ptr(slot),
            128,
          ),
          output: new Float32Array(
            this.wasm.memory.buffer,
            this.wasm.at_output_ptr(slot),
            128,
          ),
          left: Math.cos(((pan + 1) * Math.PI) / 4) * gain,
          right: Math.sin(((pan + 1) * Math.PI) / 4) * gain,
          delay: Math.round((delay * sampleRate) / 1000),
          history: new Float32Array(8192),
        });
      };
      if (this.id === "autotune") add(0, 0, 0, 0, 0, 0, null, 0, Math.SQRT2, 0);
      if (this.id === "acordes")
        for (const v of CHORDS)
          for (const multiplier of [1, 1.13])
            add(
              2,
              0,
              v.warp,
              v.amp,
              v.hz * multiplier,
              0.01,
              v.notes,
              v.pan,
              v.gain * 0.62,
              v.delay,
            );
      if (this.id === "coral")
        for (const section of CHOIR)
          for (const [pan, delay, hz] of section.singers)
            add(
              1,
              section.shift,
              section.warp,
              0.09,
              hz,
              0.18,
              null,
              pan,
              section.gain,
              delay,
            );
      this.latency = 2047;
      this.autotuneHistory = new Float32Array(8192);
      if (this.id === "coral") {
        this.leftFilter = new Sos(o.coefficients.choirLowpass);
        this.rightFilter = new Sos(o.coefficients.choirLowpass);
      }
    } else this.latency = this.kernel?.latency || 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === "dispose") {
        this.alive = false;
        for (const v of this.voices) this.wasm.at_release(v.slot);
      }
      if (data.type === "reset") this.reset();
      if (data.type === "stats")
        this.port.postMessage({
          type: "stats",
          latencyFrames: this.latency,
          queuedDelaySeconds: this.kernel?.delay / sampleRate || 0,
          maximumDelaySeconds:
            this.kernel?.maximumActualDelay || this.latency / sampleRate,
          minimumDelaySeconds:
            this.kernel?.minimumActualDelay || this.latency / sampleRate,
          voices: this.voices.length,
        });
    };
  }
  reset() {
    this.kernel?.reset();
    this.frame = 0;
    this.autotuneHistory?.fill(0);
    this.leftFilter?.reset();
    this.rightFilter?.reset();
    for (const v of this.voices) {
      this.wasm.at_reset(v.slot);
      v.history.fill(0);
    }
  }
  process(inputs, outputs, parameters) {
    const out = outputs[0],
      left = out[0],
      right = out[1] || left;
    if (!left) return this.alive;
    const blocked = parameters.blocked[0] > 0.5;
    if (blocked) {
      if (!this.wasBlocked) this.reset();
      left.fill(0);
      right.fill(0);
      this.wasBlocked = true;
      return this.alive;
    }
    this.wasBlocked = false;
    const input = inputs[0]?.[0];
    left.fill(0);
    if (right !== left) right.fill(0);
    if (this.kernel) {
      for (let i = 0; i < left.length; i++) {
        const y = this.kernel.tick(input?.[i] || 0);
        left[i] = y;
        right[i] = y;
      }
      return this.alive;
    }
    for (const voice of this.voices) {
      voice.input.fill(0);
      if (input) voice.input.set(input);
      if (!this.wasm.at_run(voice.slot, left.length, currentFrame))
        return false;
      for (let i = 0; i < left.length; i++) {
        const position = this.frame + i;
        voice.history[position & 8191] = voice.output[i];
        const value = voice.history[(position - voice.delay) & 8191];
        left[i] += value * voice.left;
        right[i] += value * voice.right;
      }
    }
    if (this.id === "autotune")
      for (let i = 0; i < left.length; i++) {
        const position = this.frame + i,
          y = left[i];
        this.autotuneHistory[position & 8191] = y;
        left[i] = y + 0.35 * this.autotuneHistory[(position - 864) & 8191];
        right[i] = y + 0.35 * this.autotuneHistory[(position - 1075) & 8191];
      }
    if (this.leftFilter)
      for (let i = 0; i < left.length; i++) {
        left[i] = this.leftFilter.tick(left[i]);
        right[i] = this.rightFilter.tick(right[i]);
      }
    this.frame += left.length;
    return this.alive;
  }
}

class LeadProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "blocked", defaultValue: 0, automationRate: "k-rate" }];
  }
  constructor(options) {
    super();
    const c = options.processorOptions.coefficients;
    this.high = new Sos(c.leadHighpass);
    this.presence = new Sos(peaking(3000, 3.5, 0.9, sampleRate));
    this.mud = new Sos(peaking(250, -2, 1, sampleRate));
    this.history = new Float64Array(8192);
    this.frame = 0;
    this.wasBlocked = false;
    this.alive = true;
    this.reflections = [
      [912, 0.1],
      [1488, 0.07],
      [2256, 0.05],
      [3408, 0.03],
    ];
    this.port.onmessage = ({ data }) => {
      if (data.type === "dispose") this.alive = false;
      if (data.type === "reset") this.reset();
    };
  }
  reset() {
    this.high.reset();
    this.presence.reset();
    this.mud.reset();
    this.history.fill(0);
    this.frame = 0;
  }
  process(inputs, outputs, parameters) {
    const left = outputs[0][0],
      right = outputs[0][1],
      input = inputs[0]?.[0];
    if (parameters.blocked[0] > 0.5) {
      if (!this.wasBlocked) {
        this.high.reset();
        this.presence.reset();
        this.mud.reset();
        this.history.fill(0);
        this.frame = 0;
      }
      left.fill(0);
      right.fill(0);
      this.wasBlocked = true;
      return this.alive;
    }
    this.wasBlocked = false;
    for (let i = 0; i < left.length; i++) {
      const frame = this.frame++,
        y = this.mud.tick(this.presence.tick(this.high.tick(input?.[i] || 0)));
      this.history[frame & 8191] = y;
      let l = 0,
        r = 0;
      for (const [delay, gain] of this.reflections) {
        l += this.history[(frame - delay) & 8191] * gain;
        r += this.history[(frame - delay - 37) & 8191] * gain;
      }
      left[i] = y + 0.9 * l;
      right[i] = y + 0.9 * r;
    }
    return this.alive;
  }
}

// Active-level matching with the same 100 Hz Butterworth weighting as the
// chosen proofs. Stereo energy is measured after mono downmix, as in the call.
// A separate balancing gain keeps the lead 0.75/0.25 dB over the musical stem.
class LevelProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "blocked", defaultValue: 0, automationRate: "k-rate" }];
  }
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.options = o;
    this.match = o.match !== false;
    this.filters = [
      new Sos(o.coefficients.levelHighpass),
      new Sos(o.coefficients.levelHighpass),
      new Sos(o.coefficients.levelHighpass),
    ];
    this.initial = o.gain ?? 1;
    this.music = o.music;
    this.target = 10 ** ((o.levelDb || 0) / 20);
    this.initialMusic = o.musicGain ?? 1;
    this.leadDb = o.leadDb || 0;
    this.delayFrames = Math.round(0.003 * sampleRate);
    this.history = [new Float64Array(512), new Float64Array(512)];
    this.peakValues = new Float64Array(512);
    this.peakFrames = new Float64Array(512);
    this.alive = true;
    this.reset();
    this.port.onmessage = ({ data }) => {
      if (data.type === "dispose") this.alive = false;
      if (data.type === "reset") this.reset();
    };
  }
  reset() {
    for (const filter of this.filters) filter.reset();
    for (const h of this.history) h.fill(0);
    this.refLevel = 0;
    this.wetLevel = 0;
    this.leadLevel = 0;
    this.musicLevel = 0;
    this.refGate = 0;
    this.frames = 0;
    this.speech = 0;
    this.gain = this.initial;
    this.musicGain = this.initialMusic;
    this.limitGain = 1;
    this.head = 0;
    this.tail = 0;
    this.wasBlocked = false;
  }
  process(inputs, outputs, parameters) {
    const left = outputs[0][0],
      right = outputs[0][1];
    if (parameters.blocked[0] > 0.5) {
      if (!this.wasBlocked) this.reset();
      left.fill(0);
      right.fill(0);
      this.wasBlocked = true;
      return this.alive;
    }
    this.wasBlocked = false;
    const wet = inputs[0] || [],
      lead = inputs[1] || [],
      ref = inputs[2]?.[0],
      rate = sampleRate,
      gateK = 1 - Math.exp(-1 / (0.02 * rate)),
      learn = 1 - Math.exp(-1 / (3 * rate)),
      glide = 1 - Math.exp(-1 / (0.08 * rate)),
      release = 1 - Math.exp(-1 / (0.08 * rate));
    for (let i = 0; i < left.length; i++) {
      let l = wet[0]?.[i] || 0,
        r = wet[1]?.[i] ?? l;
      const reference = ref?.[i] || 0;
      this.refGate += (reference * reference - this.refGate) * gateK;
      const w = this.filters[0].tick((l + r) * 0.5),
        rw = this.filters[2].tick(reference),
        leadL = lead[0]?.[i] || 0,
        leadR = lead[1]?.[i] ?? leadL,
        lw = this.filters[1].tick((leadL + leadR) * 0.5);
      if (this.refGate > 10 ** (-45 / 10)) {
        this.speech++;
        this.refLevel += (rw * rw - this.refLevel) * learn;
        if (this.music) {
          this.musicLevel += (w * w - this.musicLevel) * learn;
          this.leadLevel += (lw * lw - this.leadLevel) * learn;
          if (this.musicLevel > 1e-12 && this.speech > rate * 2) {
            const want =
              Math.sqrt(this.leadLevel / this.musicLevel) *
              10 ** (-this.leadDb / 20);
            this.musicGain +=
              (Math.min(16, Math.max(0.0625, want)) - this.musicGain) * learn;
          }
        }
      }
      if (this.music) {
        l = l * this.musicGain + leadL;
        r = r * this.musicGain + leadR;
      }
      const combined = this.music ? w * this.musicGain + lw : w;
      if (this.refGate > 10 ** (-45 / 10))
        this.wetLevel += (combined * combined - this.wetLevel) * learn;
      if (this.match && this.refLevel > 1e-12 && this.wetLevel > 1e-12) {
        const want = Math.sqrt(this.refLevel / this.wetLevel) * this.target;
        this.gain += (Math.min(16, Math.max(0.025, want)) - this.gain) * glide;
      }
      l *= this.gain;
      r *= this.gain;
      if (!Number.isFinite(l) || !Number.isFinite(r)) {
        l = 0;
        r = 0;
      }
      const frame = this.frames++,
        index = frame & 511,
        peak = Math.max(Math.abs(l), Math.abs(r));
      this.history[0][index] = l;
      this.history[1][index] = r;
      while (
        this.tail > this.head &&
        this.peakValues[(this.tail - 1) & 511] <= peak
      )
        this.tail--;
      this.peakValues[this.tail & 511] = peak;
      this.peakFrames[this.tail++ & 511] = frame;
      while (
        this.tail > this.head &&
        this.peakFrames[this.head & 511] < frame - this.delayFrames
      )
        this.head++;
      const maximum =
          this.tail > this.head ? this.peakValues[this.head & 511] : 0,
        want = Math.min(1, 0.79 / Math.max(1e-12, maximum));
      this.limitGain =
        want < this.limitGain
          ? want
          : this.limitGain + (1 - this.limitGain) * release;
      const position = (frame - this.delayFrames) & 511;
      left[i] = this.history[0][position] * this.limitGain;
      right[i] = this.history[1][position] * this.limitGain;
    }
    return this.alive;
  }
}
registerProcessor("resenhex-classic", ClassicProcessor);
registerProcessor("resenhex-classic-lead", LeadProcessor);
registerProcessor("resenhex-classic-level", LevelProcessor);
