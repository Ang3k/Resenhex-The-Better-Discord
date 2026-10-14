const { PNG } = require('pngjs');

const MAX_AVATAR_BYTES = 350 * 1024;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Validates a PNG before decoding it (size, dimensions, one IHDR only) and re-encodes it,
// which drops any extra chunks (metadata, text, embedded data).
function decodePng(input, { maxBytes, maxWidth, maxHeight, invalid }) {
  if (input.length < 33 || input.length > maxBytes || !input.subarray(0, 8).equals(SIGNATURE)) invalid();
  if (input.readUInt32BE(8) !== 13 || input.toString('ascii', 12, 16) !== 'IHDR') invalid();
  const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
  if (!width || !height || width > maxWidth || height > maxHeight || input[24] !== 8 || ![2, 6].includes(input[25]) || input[28] !== 0) invalid();
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

// The browser crops/resizes to PNG; decode again on the server and strip metadata.
function decodeAvatar(value) {
  const invalid = () => { throw new Error('Foto inválida. Escolha uma imagem PNG, JPG ou WebP novamente.'); };
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 22) invalid();
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) invalid();
  return decodePng(Buffer.from(match[1], 'base64'), { maxBytes: MAX_AVATAR_BYTES, maxWidth: 256, maxHeight: 256, invalid });
}

// ---- Banner de perfil: PNG recortado pelo navegador (5:2) ou GIF animado enviado inteiro ----
const MAX_BANNER_PNG_BYTES = 1536 * 1024;
const MAX_BANNER_GIF_BYTES = 5 * 1024 * 1024;
const MAX_GIF_SIDE = 1500;
const MAX_GIF_FRAMES = 500;

// Percorre o GIF bloco a bloco. O arquivo é guardado como veio (para manter a animação),
// então só aceitamos se a estrutura inteira for válida e terminar no marcador de fim.
function checkGif(input, invalid, { maxBytes = MAX_BANNER_GIF_BYTES, maxSide = MAX_GIF_SIDE, maxFrames = MAX_GIF_FRAMES, maxPixels = Infinity } = {}) {
  if (input.length < 14 || input.length > maxBytes) invalid();
  const header = input.toString('ascii', 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') invalid();
  const width = input.readUInt16LE(6), height = input.readUInt16LE(8);
  if (!width || !height || width > maxSide || height > maxSide) invalid();
  const byte = (i) => (i < input.length ? input[i] : invalid());
  const skipSubBlocks = (from) => {
    let pos = from;
    for (let size = byte(pos++); size; size = byte(pos++)) pos += size;
    return pos;
  };
  const tableSize = (flags) => (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0);
  let pos = 13 + tableSize(input[10]);
  let frames = 0;
  for (;;) {
    const block = byte(pos++);
    if (block === 0x3b) break; // fim do arquivo
    if (block === 0x21) { // extensão (legenda, controle de animação, comentário…)
      byte(pos++);
      pos = skipSubBlocks(pos);
    } else if (block === 0x2c) { // quadro
      if (++frames > maxFrames || frames * width * height > maxPixels || pos + 9 > input.length) invalid();
      const left = input.readUInt16LE(pos), top = input.readUInt16LE(pos + 2);
      const frameWidth = input.readUInt16LE(pos + 4), frameHeight = input.readUInt16LE(pos + 6);
      if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height) invalid();
      pos += 9 + tableSize(byte(pos + 8));
      const codeSize = byte(pos++);
      if (codeSize < 2 || codeSize > 8) invalid();
      pos = skipSubBlocks(pos);
    } else invalid();
    if (pos > input.length) invalid();
  }
  if (!frames || pos !== input.length) invalid();
  return input;
}

// GIFs stay animated; their square framing is applied consistently by the client.
function decodeProfilePhoto(input) {
  const invalid = () => { throw new Error('Foto inválida. Use PNG, JPG, WebP ou GIF de até 5 MB.'); };
  if (!Buffer.isBuffer(input) || input.length < 14) invalid();
  if (input.subarray(0, 8).equals(SIGNATURE)) {
    return { ext: 'png', data: decodePng(input, { maxBytes: MAX_AVATAR_BYTES, maxWidth: 256, maxHeight: 256, invalid }) };
  }
  return { ext: 'gif', data: checkGif(input, invalid, { maxBytes: 5 * 1024 * 1024, maxSide: 1024, maxFrames: 200, maxPixels: 40_000_000 }) };
}

function validateAvatarCrop(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || !['x', 'y', 'zoom'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
      || value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1 || value.zoom < 1 || value.zoom > 4) throw new Error('Enquadramento da foto inválido.');
  return { x: value.x, y: value.y, zoom: value.zoom };
}

// Recebe os bytes enviados pelo navegador e devolve { ext, data } prontos para gravar.
function decodeBanner(input) {
  const invalid = () => { throw new Error('Banner inválido. Escolha uma imagem PNG, JPG, WebP ou GIF novamente.'); };
  if (!Buffer.isBuffer(input) || input.length < 14) invalid();
  if (input.subarray(0, 8).equals(SIGNATURE)) {
    return { ext: 'png', data: decodePng(input, { maxBytes: MAX_BANNER_PNG_BYTES, maxWidth: 640, maxHeight: 256, invalid }) };
  }
  return { ext: 'gif', data: checkGif(input, invalid) };
}

// Fundo do perfil (atrás do nome e das informações): PNG recortado em 4:5 ou GIF animado inteiro.
function decodeProfileBackground(input) {
  const invalid = () => { throw new Error('Fundo inválido. Escolha uma imagem PNG, JPG, WebP ou GIF novamente.'); };
  if (!Buffer.isBuffer(input) || input.length < 14) invalid();
  if (input.subarray(0, 8).equals(SIGNATURE)) {
    return { ext: 'png', data: decodePng(input, { maxBytes: 2 * 1024 * 1024, maxWidth: 480, maxHeight: 600, invalid }) };
  }
  return { ext: 'gif', data: checkGif(input, invalid) };
}

module.exports = { decodeAvatar, decodeBanner, decodeProfileBackground, decodeProfilePhoto, validateAvatarCrop };
