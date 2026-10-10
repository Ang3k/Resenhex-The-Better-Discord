// Audio thread: bounded capture/playback, never waits for inference or performs network work.
class ResenhexVoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.blockSize = options.processorOptions.blockMs * 48;
    this.blocked = true; this.mode = 'waiting'; this.epoch = 0;
    this.capture = new Float32Array(this.blockSize); this.used = 0; this.captureFrame = 0;
    this.queue = []; this.offset = 0; this.buffered = 0; this.sequence = 0; this.lastSequence = -1;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'gate') {
        if (this.blocked !== !!data.blocked || data.flush) {
          this.blocked = !!data.blocked; this.epoch++; this.clear();
          this.port.postMessage({ type: 'epoch', epoch: this.epoch });
        }
      } else if (data.type === 'configure' && [80, 120, 160].includes(data.blockMs)) {
        this.blockSize = data.blockMs * 48; this.capture = new Float32Array(this.blockSize); this.epoch++; this.clear();
        this.port.postMessage({ type: 'epoch', epoch: this.epoch });
      } else if (data.type === 'mode') {
        this.mode = data.mode; this.epoch++; this.clear();
        this.port.postMessage({ type: 'epoch', epoch: this.epoch });
      } else if (data.type === 'consumed' && data.epoch === this.epoch && data.sequence === this.inflight) {
        this.inflight = null;
      } else if (data.type === 'audio' && !this.blocked && this.mode === 'active' && data.epoch === this.epoch && data.sequence > this.lastSequence) {
        const pcm = data.pcm;
        if (!(pcm instanceof Float32Array) || pcm.length !== this.blockSize || !pcm.every(Number.isFinite)) return;
        this.lastSequence = data.sequence;
        if (currentFrame - data.captureFrame > sampleRate * .65 || this.buffered + pcm.length > this.blockSize * 2) {
          this.port.postMessage({ type: 'overrun' }); return;
        }
        this.queue.push({ pcm, captureFrame: data.captureFrame, measured: false }); this.buffered += pcm.length;
      }
    };
  }
  clear() { this.used = 0; this.queue = []; this.offset = 0; this.buffered = 0; this.lastSequence = -1; this.inflight = null; }
  process(inputs, outputs) {
    const input = inputs[0]?.[0], output = outputs[0]?.[0];
    if (!output) return true;
    output.fill(0);
    if (this.blocked || !input) return true;
    // Enquanto o personagem carrega, silêncio (a voz real não vaza); se falhar, volta a voz normal.
    if (this.mode === 'waiting') { output.fill(0); return true; }
    if (this.mode !== 'active') { output.set(input); return true; }
    for (let i = 0; i < input.length;) {
      if (!this.used) this.captureFrame = currentFrame + i;
      const count = Math.min(input.length - i, this.blockSize - this.used);
      this.capture.set(input.subarray(i, i + count), this.used);
      this.used += count; i += count;
      if (this.used === this.blockSize) {
        if (this.inflight == null) {
          const pcm = this.capture, sequence = this.sequence++;
          this.inflight = sequence;
          this.port.postMessage({ type: 'capture', pcm, epoch: this.epoch, sequence, captureFrame: this.captureFrame }, [pcm.buffer]);
          this.capture = new Float32Array(this.blockSize);
        } else this.port.postMessage({ type: 'skipped', epoch: this.epoch });
        this.used = 0;
      }
    }
    let written = 0;
    while (written < output.length && this.queue.length) {
      const head = this.queue[0];
      if (!head.measured) { head.measured = true; this.port.postMessage({ type: 'latency', ms: (currentFrame + written - head.captureFrame) / sampleRate * 1000 }); }
      const count = Math.min(output.length - written, head.pcm.length - this.offset);
      output.set(head.pcm.subarray(this.offset, this.offset + count), written);
      written += count; this.offset += count; this.buffered -= count;
      if (this.offset === head.pcm.length) { this.queue.shift(); this.offset = 0; }
    }
    return true;
  }
}
registerProcessor('resenhex-voice-ai', ResenhexVoiceProcessor);
