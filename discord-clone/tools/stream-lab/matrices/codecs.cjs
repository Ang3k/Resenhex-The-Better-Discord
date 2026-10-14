// Codecs e modos de degradação com um espectador, sem limite de rede (limite pelo maxBitrate do codificador).
// Mesmos cenários de docs/relatorios/TRANSMISSAO-2026-10-14.md (E1, E1b e E1c).
const codecs = ['video/VP8', 'video/VP9', 'video/AV1', 'video/H264'];
const name = (codec) => codec.split('/')[1];
const desktop = { clip: 'desktop30', hint: 'detail', degradation: 'maintain-resolution', fps: 30, warmup: 8, duration: 20 };
const g60 = { clip: 'game60', fps: 60, sampleMod: 30, sampleRem: 7, warmup: 8, duration: 20 };
const g30 = { clip: 'game60', fps: 30, sampleMod: 15, sampleRem: 7, warmup: 8, duration: 20 };
module.exports = [
  ...codecs.flatMap((codec) => [1_000_000, 2_500_000, 4_000_000].map((maxBitrate) => ({ ...desktop, name: `texto-${name(codec)}-${maxBitrate / 1e6}M`, codec, encoding: { maxBitrate, maxFramerate: 30 } }))),
  ...codecs.map((codec) => ({ ...g60, name: `jogo60-motion-mf-${name(codec)}-6M`, codec, hint: 'motion', degradation: 'maintain-framerate', encoding: { maxBitrate: 6_000_000, maxFramerate: 60 } })),
  ...codecs.map((codec) => ({ ...g60, name: `jogo60-motion-mfr-${name(codec)}-6M`, codec, hint: 'motion', degradation: 'maintain-framerate-and-resolution', encoding: { maxBitrate: 6_000_000, maxFramerate: 60 } })),
  ...codecs.map((codec) => ({ ...g30, name: `jogo30-detail-mr-${name(codec)}-4M`, codec, hint: 'detail', degradation: 'maintain-resolution', encoding: { maxBitrate: 4_000_000, maxFramerate: 30 } })),
  ...codecs.map((codec) => ({ ...g30, name: `jogo30-motion-mf-${name(codec)}-4M`, codec, hint: 'motion', degradation: 'maintain-framerate', encoding: { maxBitrate: 4_000_000, maxFramerate: 30 } })),
  { ...g30, name: 'jogo30-motion-balanced-VP8-4M', codec: 'video/VP8', hint: 'motion', degradation: 'balanced', encoding: { maxBitrate: 4_000_000, maxFramerate: 30 } },
  // Camadas temporais com conteúdo de tela: custam banda (AV1) ou nitidez (VP9).
  { ...desktop, name: 'texto-AV1-L1T3-4M', codec: 'video/AV1', encoding: { maxBitrate: 4_000_000, maxFramerate: 30, scalabilityMode: 'L1T3' } },
  { ...desktop, name: 'texto-VP9-L1T3-4M', codec: 'video/VP9', encoding: { maxBitrate: 4_000_000, maxFramerate: 30, scalabilityMode: 'L1T3' } },
];
