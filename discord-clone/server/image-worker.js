// Confere e recodifica fotos, banners, fundos, ícones e emojis fora da linha principal do servidor
// (server/images.js). O pngjs leva até ~60 ms por imagem no ARM, e o servidor não pode parar esse tempo.
const { parentPort } = require('node:worker_threads');
const crypto = require('node:crypto');
const { decodeAvatar, decodeBanner, decodeProfileBackground, decodeProfilePhoto } = require('./avatar');

const decoders = {
  avatar: (input) => ({ ext: 'png', data: decodeAvatar(input) }), // data URL de PNG (foto pelo socket, ícone do servidor)
  photo: decodeProfilePhoto, // foto de perfil e emoji: PNG ou GIF
  banner: decodeBanner,
  background: decodeProfileBackground,
};

parentPort.on('message', ({ id, kind, input }) => {
  try {
    const { ext, data } = decoders[kind](typeof input === 'string' ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength));
    parentPort.postMessage({ id, ext, data, hash: crypto.createHash('sha256').update(data).digest('hex') });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
