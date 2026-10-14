// P2P × SFU com três espectadores cujos blocos pedem 1080, 720 e 540 px (palco grande, médio e grade).
// "P2P" usa as codificações por espectador da política atual; "SFU-antigo" reproduz o options() do
// public/media-sfu.js da versão 1.4.6 (camadas de 720p a 600 kbps/20 fps e 360p a 150 kbps/10 fps).
const policy = require('../../../public/media-policy.js');
const dims = [1080, 720, 540];
const base = { viewers: 3, warmup: 10, duration: 24, compareHeights: dims, viewerDims: dims.map((h) => ({ width: Math.round(h * 16 / 9), height: h })), viewerFps: 60 };
function p2pEncodings(presetKey) {
  const preset = policy.presets[presetKey];
  const peers = dims.map((h, i) => ({ sid: 'v' + i, watching: true, demand: { mode: 'auto', maxHeight: h, background: false } }));
  const rates = policy.allocate(10, peers, { screen: true, preset });
  return peers.map((p) => { const e = policy.screenEncoding(preset, rates.get(p.sid).screen, p.demand, { height: 1080 }); return { maxBitrate: e.maxBitrate, maxFramerate: e.maxFramerate, scaleResolutionDownBy: e.scaleResolutionDownBy }; });
}
function oldSfu(bitrate, fps, degradation, codec) { // 1.4.6: Math.min(preset.bitrate, cap) * 0.75 e camadas de 360p/720p
  const top = bitrate * .75;
  return { videoCodec: codec, backupCodec: false, simulcast: true, degradationPreference: degradation, screenShareEncoding: { maxBitrate: top, maxFramerate: fps },
    screenShareSimulcastLayers: [360, 720].map((h, i) => ({ width: Math.round(h * 16 / 9), height: h, maxBitrate: Math.min(i ? 600_000 : 150_000, top * (i ? .2 : .1)), maxFramerate: Math.min(i ? 20 : 10, fps) })) };
}
const room = { adaptiveStream: false, dynacast: true, stopLocalTrackOnUnpublish: false };
const sfu = (publish) => ({ mode: 'sfu', roomOptions: room, viewerRoomOptions: room, publish });
const text = { clip: 'desktop30', hint: 'detail', fps: 30 };
const game60 = { clip: 'game60', hint: 'motion', fps: 60, sampleMod: 30, sampleRem: 7 };
module.exports = [
  { ...base, ...text, name: 'texto-P2P-VP8', codec: 'video/VP8', degradation: 'maintain-resolution', viewerEncodings: p2pEncodings('auto') },
  { ...base, ...text, name: 'texto-P2P-AV1', codec: 'video/AV1', degradation: 'maintain-resolution', viewerEncodings: p2pEncodings('auto') },
  { ...base, ...text, name: 'texto-SFU-antigo', ...sfu(oldSfu(4_000_000, 30, 'maintain-resolution', 'vp8')) },
  { ...base, ...text, name: 'texto-SFU-AV1-padrao-livekit', ...sfu({ videoCodec: 'av1', backupCodec: false, simulcast: false, screenShareEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 }, degradationPreference: 'maintain-resolution' }) },
  { ...base, ...text, name: 'texto-SFU-AV1-camada-unica', ...sfu({ videoCodec: 'av1', backupCodec: false, simulcast: true, scalabilityMode: 'L1T1', screenShareSimulcastLayers: [], screenShareEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 }, degradationPreference: 'maintain-resolution' }) },
  { ...base, ...game60, name: 'jogo60-P2P-H264-mf', codec: 'video/H264', degradation: 'maintain-framerate', viewerEncodings: p2pEncodings('p1080_60') },
  { ...base, ...game60, name: 'jogo60-P2P-H264-mfr', codec: 'video/H264', degradation: 'maintain-framerate-and-resolution', viewerEncodings: p2pEncodings('p1080_60') },
  { ...base, ...game60, name: 'jogo60-SFU-antigo', ...sfu(oldSfu(6_000_000, 60, 'maintain-framerate', 'h264')) },
  { ...base, ...game60, name: 'jogo60-SFU-H264-2camadas', ...sfu({ videoCodec: 'h264', backupCodec: false, simulcast: true, screenShareSimulcastLayers: [{ width: 960, height: 540, maxBitrate: 1_500_000, maxFramerate: 60 }], screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 60 }, degradationPreference: 'maintain-framerate-and-resolution' }) },
];
