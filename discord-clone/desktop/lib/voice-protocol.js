const MAX_PACKET = 262144;
const EMPTY = Buffer.alloc(0);
function encode(meta, pcm = EMPTY) {
  const json = Buffer.from(JSON.stringify(meta));
  const size = 4 + json.length + pcm.length;
  if (!json.length || json.length > 16384 || size > MAX_PACKET || pcm.length % 4) throw new Error('Pacote de voz inválido.');
  const packet = Buffer.allocUnsafe(size + 4);
  packet.writeUInt32LE(size); packet.writeUInt32LE(json.length, 4);
  json.copy(packet, 8); pcm.copy(packet, 8 + json.length);
  return packet;
}
class Decoder {
  constructor(onPacket) {
    this.header = Buffer.allocUnsafe(4); this.headerUsed = 0;
    this.body = null; this.used = 0; this.size = 0; this.onPacket = onPacket;
  }
  push(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      if (!this.size) {
        const count = Math.min(4 - this.headerUsed, chunk.length - offset);
        chunk.copy(this.header, this.headerUsed, offset, offset + count);
        this.headerUsed += count; offset += count;
        if (this.headerUsed !== 4) return;
        const size = this.header.readUInt32LE();
        if (size < 4 || size > MAX_PACKET) throw new Error('Resposta do motor excedeu o limite.');
        this.size = size; this.headerUsed = 0;
      }
      // A complete body is parsed directly. Fragmented bodies allocate once,
      // instead of recopying every preceding fragment on each pipe event.
      if (!this.body && chunk.length - offset >= this.size) {
        const body = chunk.subarray(offset, offset + this.size);
        offset += this.size; this.size = 0; this.packet(body);
      } else {
        if (!this.body) this.body = Buffer.allocUnsafe(this.size);
        const count = Math.min(this.size - this.used, chunk.length - offset);
        chunk.copy(this.body, this.used, offset, offset + count);
        this.used += count; offset += count;
        if (this.used !== this.size) return;
        const body = this.body;
        this.body = null; this.used = 0; this.size = 0; this.packet(body);
      }
    }
  }
  packet(body) {
    const jsonSize = body.readUInt32LE();
    if (!jsonSize || jsonSize > 16384 || jsonSize > body.length - 4 || (body.length - 4 - jsonSize) % 4) throw new Error('Resposta do motor inválida.');
    const meta = JSON.parse(body.subarray(4, 4 + jsonSize).toString('utf8'));
    // Own the PCM: callers retain it after the pipe's chunk is reused/released.
    this.onPacket(meta, Buffer.from(body.subarray(4 + jsonSize)));
  }
}
module.exports = { encode, Decoder, MAX_PACKET };
