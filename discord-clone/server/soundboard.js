const MAX_SOUND_SECONDS = 8;
const SOUND_RATE = 48000;
const MAX_SOUND_BYTES = 44 + SOUND_RATE * MAX_SOUND_SECONDS * 2;
const MAX_SERVER_SOUNDS = 32;

// Only canonical mono PCM WAV reaches disk. Compressed audio is decoded in the browser.
function decodeSound(input) {
  const invalid = () => { throw new Error('Som inválido. Escolha um áudio de até 8 segundos.'); };
  if (!Buffer.isBuffer(input) || input.length < 46 || input.length > MAX_SOUND_BYTES) invalid();
  if (input.toString('ascii', 0, 4) !== 'RIFF' || input.toString('ascii', 8, 12) !== 'WAVE'
      || input.readUInt32LE(4) !== input.length - 8 || input.toString('ascii', 12, 16) !== 'fmt '
      || input.readUInt32LE(16) !== 16 || input.readUInt16LE(20) !== 1 || input.readUInt16LE(22) !== 1
      || input.readUInt32LE(24) !== SOUND_RATE || input.readUInt32LE(28) !== SOUND_RATE * 2
      || input.readUInt16LE(32) !== 2 || input.readUInt16LE(34) !== 16 || input.toString('ascii', 36, 40) !== 'data'
      || input.readUInt32LE(40) !== input.length - 44 || (input.length - 44) % 2) invalid();
  return { data: input, duration: (input.length - 44) / (SOUND_RATE * 2) };
}

function soundName(value) {
  if (typeof value !== 'string') throw new Error('Dê um nome ao efeito sonoro.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 32 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('O nome do efeito deve ter de 1 a 32 caracteres.');
  return name;
}

module.exports = { decodeSound, soundName, MAX_SOUND_BYTES, MAX_SERVER_SOUNDS };
