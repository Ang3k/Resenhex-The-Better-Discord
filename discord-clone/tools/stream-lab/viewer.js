// Viewer role: receives the screen (P2P or LiveKit), scores frames against the reference clip
// in a worker (luma PSNR/SSIM at the viewer's display size), and collects receive-side stats.
/* global cfg, labNow, log, postResult, measureWindow, mean, pct, delta, LivekitClient */
const workerSource = `
const refCache = new Map(), scaled = new Map();
let origin = '';
function refLuma(clip, i, W, H) {
  const key = clip + ':' + i;
  if (!refCache.has(key)) refCache.set(key, fetch(origin + '/ref?clip=' + clip + '&i=' + i).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b, 0, W * H)));
  return refCache.get(key);
}
async function lumaOf(frame) {
  const rect = frame.visibleRect, buf = new Uint8Array(frame.allocationSize({ rect }));
  const layout = await frame.copyTo(buf, { rect });
  return { data: buf, offset: layout[0].offset, stride: layout[0].stride, w: rect.width, h: rect.height };
}
function resample(src, W, H) {
  const out = new Uint8Array(W * H), d = src.data, o = src.offset, st = src.stride;
  if (src.w === W && src.h === H) { for (let y = 0; y < H; y++) out.set(d.subarray(o + y * st, o + y * st + W), y * W); return out; }
  const sx = src.w / W, sy = src.h / H;
  if (sx <= 1 && sy <= 1) { // bilinear upscale
    for (let y = 0; y < H; y++) {
      const fy = Math.max(0, (y + 0.5) * sy - 0.5), y0 = Math.floor(fy), y1 = Math.min(src.h - 1, y0 + 1), wy = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.max(0, (x + 0.5) * sx - 0.5), x0 = Math.floor(fx), x1 = Math.min(src.w - 1, x0 + 1), wx = fx - x0;
        out[y * W + x] = (d[o + y0 * st + x0] * (1 - wx) + d[o + y0 * st + x1] * wx) * (1 - wy) + (d[o + y1 * st + x0] * (1 - wx) + d[o + y1 * st + x1] * wx) * wy + 0.5;
      }
    }
    return out;
  }
  for (let y = 0; y < H; y++) { // area average downscale
    const y0 = y * sy, y1 = y0 + sy;
    for (let x = 0; x < W; x++) {
      const x0 = x * sx, x1 = x0 + sx; let acc = 0, ws = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy), row = o + Math.min(src.h - 1, yy) * st;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) { const w = wy * (Math.min(x1, xx + 1) - Math.max(x0, xx)); acc += d[row + Math.min(src.w - 1, xx)] * w; ws += w; }
      }
      out[y * W + x] = acc / ws + 0.5;
    }
  }
  return out;
}
function score(ref, img, W, H) {
  let se = 0;
  for (let k = 0; k < W * H; k++) { const e = ref[k] - img[k]; se += e * e; }
  const mse = se / (W * H), psnr = mse === 0 ? 99 : 10 * Math.log10(65025 / mse);
  const C1 = 6.5025, C2 = 58.5225; let sum = 0, n = 0;
  const skipW = Math.ceil(168 * W / 1920), skipH = Math.ceil(48 * H / 1080);
  for (let by = 0; by + 8 <= H; by += 8) for (let bx = 0; bx + 8 <= W; bx += 8) {
    if (by < skipH && bx < skipW) continue;
    let mx = 0, my = 0, xx = 0, yy = 0, xy = 0;
    for (let y = 0; y < 8; y++) { const row = (by + y) * W + bx; for (let x = 0; x < 8; x++) { const a = ref[row + x], b = img[row + x]; mx += a; my += b; xx += a * a; yy += b * b; xy += a * b; } }
    mx /= 64; my /= 64; const vx = xx / 64 - mx * mx, vy = yy / 64 - my * my, cxy = xy / 64 - mx * my;
    sum += ((2 * mx * my + C1) * (2 * cxy + C2)) / ((mx * mx + my * my + C1) * (vx + vy + C2)); n++;
  }
  return { psnr, ssim: sum / n };
}
onmessage = async ({ data }) => {
  const { frame, clip, W, H, idx } = data; origin = data.origin;
  try {
    const luma = await lumaOf(frame); frame.close();
    const H2 = data.compareHeight || H, W2 = Math.round(H2 * W / H), key = idx + ':' + H2;
    if (!scaled.has(key)) { const ref = await refLuma(clip, idx, W, H); scaled.set(key, H2 === H ? ref : resample({ data: ref, offset: 0, stride: W, w: W, h: H }, W2, H2)); }
    postMessage({ at: data.at, idx, height: data.height, ...score(scaled.get(key), resample(luma, W2, H2), W2, H2) });
  } catch (e) { try { frame.close(); } catch {} postMessage({ error: String(e) }); }
};`;

async function readBarcode(frame, clipW) {
  const fw = frame.visibleRect.width, fh = frame.visibleRect.height, s = fw / clipW;
  const rect = { x: frame.visibleRect.x, y: frame.visibleRect.y, width: Math.min(fw, Math.ceil(170 * s / 2) * 2), height: Math.min(fh, Math.ceil(44 * s / 2) * 2) };
  const buf = new Uint8Array(frame.allocationSize({ rect }));
  const layout = await frame.copyTo(buf, { rect });
  const st = layout[0].stride, off = layout[0].offset;
  let code = 0;
  for (let b = 0; b < 16; b++) {
    const cx = Math.round(((b % 8) * 20 + 10) * s), cy = Math.round((Math.floor(b / 8) * 20 + 10) * s), r = Math.max(1, Math.round(4 * s));
    let acc = 0, cnt = 0;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { acc += buf[off + y * st + x]; cnt++; }
    if (acc / cnt > 125) code |= 1 << b;
  }
  const idx = code & 2047;
  return (code >> 11) === ((idx * 13 + 7) & 31) ? idx : -1;
}

function runViewerRole(index, clip) {
  const v = { frames: [], quality: [], display: [], latency: [], net: [], spikes: [], heights: {}, bad: 0, busy: false, stats: [], getStats: null, finished: false };
  const worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })));
  worker.onmessage = ({ data }) => { v.busy = false; if (data.error) log('quality error', data.error); else v.quality.push(data); };
  const inWindow = (t) => { const w = measureWindow(); return w && t >= w.from && t <= w.to; };

  function attach(track, getStats, receiver) {
    if (v.attached) return;
    v.attached = true;
    v.getStats = getStats;
    if (cfg.jitterBufferTarget != null && receiver) receiver.jitterBufferTarget = cfg.jitterBufferTarget;
    const video = document.createElement('video');
    video.muted = true; video.autoplay = true; video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    document.getElementById('videos').append(video);
    let last = null;
    const onFrame = (t, md) => {
      const at = labNow();
      if (inWindow(at)) {
        if (last != null) v.display.push(t - last);
        if (md.captureTime) v.latency.push(md.expectedDisplayTime - md.captureTime);
        if (md.captureTime && md.receiveTime) { const nl = md.receiveTime - md.captureTime; v.net.push(nl); if (nl > 90) v.spikes.push([Math.round(at), Math.round(nl)]); }
      }
      last = t;
      if (!v.finished) video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
    const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    (async () => {
      for (;;) {
        const { value: frame, done } = await reader.read();
        if (done || v.finished) { frame?.close(); break; }
        const at = labNow();
        let idx = -1;
        try { idx = await readBarcode(frame, clip.W); } catch { idx = -1; }
        const height = frame.visibleRect.height;
        if (idx < 0) { v.bad++; frame.close(); continue; }
        if (inWindow(at)) { v.frames.push([at, idx, height]); v.heights[height] = (v.heights[height] || 0) + 1; }
        if (inWindow(at) && idx % cfg.sampleMod === cfg.sampleRem && !v.busy) {
          v.busy = true;
          worker.postMessage({ frame, at, idx, height, clip: cfg.clip, W: clip.W, H: clip.H, origin: location.origin, compareHeight: cfg.compareHeights?.[index] }, [frame]);
        } else frame.close();
      }
    })();
  }

  async function collect() {
    if (!v.getStats) return;
    try {
      const report = await v.getStats();
      const t = labNow();
      report.forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'video') v.stats.push({ t, framesDecoded: r.framesDecoded, framesDropped: r.framesDropped, fps: r.framesPerSecond, w: r.frameWidth, h: r.frameHeight,
          qpSum: r.qpSum, totalDecodeTime: r.totalDecodeTime, jbd: r.jitterBufferDelay, jbe: r.jitterBufferEmittedCount, freezeCount: r.freezeCount, freezeDur: r.totalFreezesDuration,
          lost: r.packetsLost, recv: r.packetsReceived, nack: r.nackCount, pli: r.pliCount, bytes: r.bytesReceived, impl: r.decoderImplementation, codec: report.get(r.codecId)?.mimeType, keyFrames: r.keyFramesDecoded });
        if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') { const lc = report.get(r.localCandidateId), rc = report.get(r.remoteCandidateId); v.path = `${lc?.protocol}/${lc?.candidateType}->${rc?.candidateType}:${rc?.port}`; v.rtt = r.currentRoundTripTime; }
      });
    } catch {}
  }
  const timer = setInterval(collect, 1000);

  function perSecond(from, to) {
    const out = Array.from({ length: Math.max(0, Math.ceil((to - from) / 1000)) }, () => ({ frames: 0, psnr: [] }));
    let prev = null;
    for (const [at, idx] of v.frames) { const bucket = out[Math.floor((at - from) / 1000)]; if (bucket && idx !== prev) bucket.frames++; prev = idx; }
    for (const q of v.quality) out[Math.floor((q.at - from) / 1000)]?.psnr.push(q.psnr);
    return out.map((b) => [b.frames, b.psnr.length ? +mean(b.psnr).toFixed(2) : null]);
  }
  function summary() {
    const w = measureWindow(), from = w.from, to = w.to, rs = v.stats;
    const fd = delta(rs, 'framesDecoded', from, to), dec = delta(rs, 'totalDecodeTime', from, to), qp = delta(rs, 'qpSum', from, to), by = delta(rs, 'bytes', from, to);
    const jb = delta(rs, 'jbd', from, to), je = delta(rs, 'jbe', from, to), fz = delta(rs, 'freezeCount', from, to), fzd = delta(rs, 'freezeDur', from, to);
    const lost = delta(rs, 'lost', from, to), recv = delta(rs, 'recv', from, to), pli = delta(rs, 'pli', from, to), kf = delta(rs, 'keyFrames', from, to);
    const psnr = v.quality.map((q) => q.psnr), ssim = v.quality.map((q) => q.ssim), nominal = 1000 / cfg.fps;
    let distinct = 0, stalls = 0, stallMs = 0, prev = null;
    for (const [at, idx] of v.frames) { if (!prev || idx !== prev[1]) { distinct++; if (prev && at - prev[0] > Math.max(3 * nominal, 100)) { stalls++; stallMs += at - prev[0]; } prev = [at, idx]; } }
    const span = v.frames.length ? (v.frames.at(-1)[0] - v.frames[0][0]) / 1000 : 0;
    return { i: index, samples: v.quality.length, psnr: mean(psnr), psnrP10: pct(psnr, 0.1), psnrMin: pct(psnr, 0), ssim: mean(ssim), ssimP10: pct(ssim, 0.1),
      deliveredFps: span ? distinct / span : null, stalls, stallMs: Math.round(stallMs), decodeFps: fd ? fd.d / fd.dt : null, decodeMs: fd && dec && fd.d ? dec.d / fd.d * 1000 : null,
      qpAvg: fd && qp && fd.d ? qp.d / fd.d : null, kbps: by ? by.d * 8 / by.dt / 1000 : null, jitterBufferMs: jb && je && je.d ? jb.d / je.d * 1000 : null,
      freezes: fz?.d ?? null, freezeSec: fzd?.d ?? null, lossPct: lost && recv && (recv.d + lost.d) ? 100 * lost.d / (recv.d + lost.d) : 0, pli: pli?.d ?? null, keyFrames: kf?.d ?? null,
      heights: v.heights, badBarcodes: v.bad, latencyMs: mean(v.latency), latencyP95: pct(v.latency, 0.95), netLatencyMs: mean(v.net), netLatencyP95: pct(v.net, 0.95), spikes: v.spikes.slice(0, 20),
      displayP99: pct(v.display, 0.99), displayLong: v.display.filter((d) => d > nominal * 2.5).length / Math.max(1, v.display.length),
      decoder: rs.at(-1)?.impl, codec: rs.at(-1)?.codec, rtt: v.rtt, path: v.path,
      // Por segundo desde o início da medição: quadros diferentes entregues e PSNR médio das amostras.
      perSecond: perSecond(from, to),
      timeline: rs.map((r) => ({ t: Math.round(r.t - from), fps: r.fps, h: r.h, bytes: r.bytes, freezes: r.freezeCount })) };
  }

  // ---- transport ----
  async function p2p() {
    const pc = new RTCPeerConnection();
    pc.onicecandidate = (e) => e.candidate && lab.send('streamer', { type: 'candidate', i: index, c: e.candidate.toJSON() });
    pc.ontrack = (e) => { if (e.track.kind === 'video') attach(e.track, () => e.receiver.getStats(), e.receiver); };
    const pending = [];
    let offered = false;
    const readyTimer = setInterval(() => { if (offered) clearInterval(readyTimer); else lab.send('streamer', { type: 'ready', i: index }); }, 1000);
    lab.onMessage(async (from, msg) => {
      if (msg.type === 'offer') {
        offered = true;
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        await pc.setLocalDescription();
        lab.send('streamer', { type: 'answer', i: index, sdp: pc.localDescription.sdp });
        for (const c of pending.splice(0)) await pc.addIceCandidate(c);
      } else if (msg.type === 'candidate') { if (pc.remoteDescription) await pc.addIceCandidate(msg.c); else pending.push(msg.c); }
    });
    lab.send('streamer', { type: 'ready', i: index });
  }
  async function sfu() {
    const LK = window.LivekitClient;
    const cred = await (await fetch(`/token?id=viewer${index}&room=${cfg.room || 'lab'}`)).json();
    const room = new LK.Room(cfg.viewerRoomOptions || { adaptiveStream: false, dynacast: true });
    room.on(LK.RoomEvent.TrackSubscribed, (t, pubn) => {
      if (t.kind !== 'video') return;
      const dim = cfg.viewerDims?.[index] ?? cfg.viewerDim;
      if (dim) pubn.setVideoDimensions(dim);
      if (cfg.viewerFps) pubn.setVideoFPS(cfg.viewerFps);
      attach(t.mediaStreamTrack, () => t.receiver.getStats(), t.receiver);
    });
    room.on(LK.RoomEvent.TrackPublished, (pubn) => pubn.setSubscribed(true));
    await room.connect(cred.url, cred.token, { autoSubscribe: false });
    for (const p of room.remoteParticipants.values()) for (const pubn of p.trackPublications.values()) pubn.setSubscribed(true);
    window.viewerRoom = room;
    const readyTimer = setInterval(() => { if (measureWindow()) clearInterval(readyTimer); else lab.send('streamer', { type: 'ready', i: index }); }, 1000);
    lab.send('streamer', { type: 'ready', i: index });
  }
  (cfg.mode === 'sfu' ? sfu() : p2p()).catch((e) => log('viewer error', String(e.stack || e)));
  return {
    async finish() { await collect(); v.finished = true; clearInterval(timer); return summary(); },
  };
}
