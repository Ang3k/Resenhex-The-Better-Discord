// Memória dos últimos 30 s de uma pessoa na chamada, para o CLIPAR. Roda num AudioWorklet:
// só escuta (a saída não toca nada) e guarda PCM mono em Int16 num anel.
class ClipRing {
  constructor(sampleRate, seconds = 30) {
    this.size = Math.ceil(sampleRate * seconds);
    this.data = new Int16Array(this.size);
    this.write = 0;
    this.filled = 0;
  }

  push(block) {
    for (let i = 0; i < block.length; i++) {
      const v = Math.max(-1, Math.min(1, block[i]));
      this.data[this.write] = Math.round(v * 32767);
      this.write = (this.write + 1) % this.size;
    }
    this.filled = Math.min(this.size, this.filled + block.length);
  }

  // Da amostra mais antiga para a mais nova, só o que já foi preenchido.
  snapshot() {
    const pcm = new Int16Array(this.filled);
    const start = (this.write - this.filled + this.size) % this.size;
    const first = Math.min(this.filled, this.size - start);
    pcm.set(this.data.subarray(start, start + first), 0);
    pcm.set(this.data.subarray(0, this.filled - first), first);
    return { pcm, samples: this.filled };
  }

  clear() {
    this.write = 0;
    this.filled = 0;
  }
}
globalThis.ClipRing = ClipRing;

if (typeof registerProcessor === 'function') {
  const SILENCE = new Float32Array(128);
  registerProcessor('clip-buffer', class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.ring = new ClipRing(sampleRate, 30);
      this.port.onmessage = ({ data }) => {
        if (data.type === 'clear') this.ring.clear();
        if (data.type === 'snapshot') {
          const { pcm, samples } = this.ring.snapshot();
          this.port.postMessage({ type: 'snapshot', id: data.id, pcm, samples }, [pcm.buffer]);
        }
      };
    }

    // Sem entrada (a pessoa saiu ou o stream trocou), grava silêncio: todos os anéis andam juntos.
    process(inputs) {
      this.ring.push(inputs[0]?.[0] || SILENCE);
      return true;
    }
  });
}
