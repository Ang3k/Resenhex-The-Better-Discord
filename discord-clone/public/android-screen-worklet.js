// Som do celular na transmissão de tela (app de Android, public/android-screen.js). O app manda PCM
// de 16 bits, estéreo, 48 kHz, em pedaços de 10 ms; aqui eles entram numa fila e saem no ritmo do
// Web Audio. A fila segura ~60 ms antes de tocar e, se crescer além de ~250 ms (a página ficou um tempo
// sem processar), pula para o mais recente: atraso baixo vale mais que um pedaço de som antigo.
const RATE = 48000;
const SIZE = RATE;                 // 1 s de fila
const START = RATE * 0.06;         // começa a tocar com 60 ms guardados
const MAX = RATE * 0.25;           // acima disso, descarta o mais antigo...
const TARGET = RATE * 0.08;        // ...até sobrarem 80 ms

class AndroidScreenAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = new Float32Array(SIZE);
    this.right = new Float32Array(SIZE);
    this.read = 0;
    this.write = 0;
    this.count = 0;
    this.playing = false;
    this.port.onmessage = (event) => { if (event.data instanceof ArrayBuffer) this.push(new Int16Array(event.data)); };
  }

  push(pcm) {
    const frames = pcm.length >> 1;
    for (let i = 0; i < frames; i++) {
      this.left[this.write] = pcm[2 * i] / 32768;
      this.right[this.write] = pcm[2 * i + 1] / 32768;
      this.write = (this.write + 1) % SIZE;
    }
    this.count += frames;
    if (this.count > MAX) {
      const skip = this.count - TARGET;
      this.read = (this.read + skip) % SIZE;
      this.count = TARGET;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    if (!this.playing) {
      if (this.count < START) return true;
      this.playing = true;
    }
    if (this.count < n) { this.playing = false; return true; } // faltou som: silêncio até juntar de novo
    const left = out[0], right = out[1] || out[0];
    for (let i = 0; i < n; i++) {
      left[i] = this.left[this.read];
      right[i] = this.right[this.read];
      this.read = (this.read + 1) % SIZE;
    }
    this.count -= n;
    return true;
  }
}

registerProcessor('android-screen-audio', AndroidScreenAudio);
