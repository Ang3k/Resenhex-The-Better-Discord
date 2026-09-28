const { PNG } = require('pngjs');

const MAX_AVATAR_BYTES = 350 * 1024;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// The browser crops/resizes to PNG; decode again on the server and strip metadata.
function decodeAvatar(value) {
  const invalid = () => { throw new Error('Foto inválida. Escolha uma imagem PNG, JPG ou WebP novamente.'); };
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 22) invalid();
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) invalid();
  const input = Buffer.from(match[1], 'base64');
  if (input.length < 33 || input.length > MAX_AVATAR_BYTES || !input.subarray(0, 8).equals(SIGNATURE)) invalid();
  if (input.readUInt32BE(8) !== 13 || input.toString('ascii', 12, 16) !== 'IHDR') invalid();
  const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
  if (!width || !height || width > 256 || height > 256 || input[24] !== 8 || ![2, 6].includes(input[25]) || input[28] !== 0) invalid();
  // A second header could override the size/format checks before decompression.
  for (let offset = 33; offset < input.length;) {
    if (offset + 12 > input.length) invalid();
    const size = input.readUInt32BE(offset);
    if (offset + size + 12 > input.length || input.toString('ascii', offset + 4, offset + 8) === 'IHDR') invalid();
    offset += size + 12;
  }
  try {
    const decoded = PNG.sync.read(input, { checkCRC: true });
    return PNG.sync.write({ width: decoded.width, height: decoded.height, data: decoded.data }, { colorType: 6 });
  } catch { invalid(); }
}

module.exports = { decodeAvatar };
