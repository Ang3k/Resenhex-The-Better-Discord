// Transmitir a tela do celular pelo app de Android (APK 1.4.0+). O WebView não tem getDisplayMedia:
// quem captura é o app (MediaProjection). Ele codifica a tela em H.264 pelo chip de vídeo do celular
// (ou em JPEG, se não der) e manda os pacotes por um fetch em /__resenhex/tela/<chave>, que o próprio
// app responde, sem passar pela rede. Aqui eles viram uma MediaStream comum (vídeo e, no Android 10+,
// o som do celular), que a call transmite como a de um computador (media-session.js, captureScreen).
//
// Pacote (igual ao android/.../ScreenFeed.java): cabeçalho de 16 bytes, little-endian, e o conteúdo.
//   byte 0: tipo (1 descrição, 2 H.264, 3 JPEG, 4 som); byte 1: marcas (1 = quadro-chave);
//   bytes 2-3: geração do codificador; 4-7: tamanho do conteúdo; 8-15: instante em microssegundos.
// A descrição (JSON) abre cada geração: codec, largura, altura e fps. Girar o celular ou trocar a
// qualidade cria um codificador novo, com geração nova; pacotes de gerações antigas são ignorados.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AndroidScreen = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
  const TYPE = { INFO: 1, H264: 2, JPEG: 3, PCM: 4 };
  const FLAG_KEY = 1;
  const HEADER = 16;
  const MAX_PACKET = 16 * 1024 * 1024;
  const PATH = '/__resenhex/tela/';

  // ---------------- partes puras (test/android-screen.test.js) ----------------

  // Junta os pedaços que o fetch entrega (cortados em qualquer ponto) e chama onPacket com cada pacote inteiro.
  function packetParser(onPacket) {
    let buf = new Uint8Array(1 << 16), start = 0, end = 0;
    return function push(chunk) {
      if (end + chunk.length > buf.length) {
        const live = end - start;
        if (live + chunk.length > buf.length) {
          let size = buf.length;
          while (size < live + chunk.length) size *= 2;
          const next = new Uint8Array(size);
          next.set(buf.subarray(start, end));
          buf = next;
        } else buf.copyWithin(0, start, end);
        start = 0;
        end = live;
      }
      buf.set(chunk, end);
      end += chunk.length;
      while (end - start >= HEADER) {
        const view = new DataView(buf.buffer, buf.byteOffset + start, HEADER);
        const length = view.getUint32(4, true);
        if (length > MAX_PACKET) throw new Error('Pacote inválido da captura de tela');
        if (end - start < HEADER + length) break;
        const packet = {
          type: buf[start], flags: buf[start + 1], gen: view.getUint16(2, true),
          time: Number(view.getBigInt64(8, true)), data: buf.slice(start + HEADER, start + HEADER + length),
        };
        start += HEADER + length;
        onPacket(packet);
      }
      if (start === end) start = end = 0;
    };
  }

  // Unidades NAL de um trecho H.264 no formato Annex B (cada uma depois de 00 00 01 ou 00 00 00 01).
  function nalUnits(data) {
    const units = [];
    let begin = -1;
    for (let i = 0; i + 2 < data.length; i++) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 1) continue;
      if (begin >= 0) units.push({ start: begin, end: i > begin && data[i - 1] === 0 ? i - 1 : i });
      begin = i + 3;
      i += 2;
    }
    if (begin >= 0 && begin < data.length) units.push({ start: begin, end: data.length });
    return units.filter((u) => u.end > u.start).map((u) => ({ ...u, type: data[u.start] & 0x1f }));
  }

  // Codec para o VideoDecoder ("avc1.PPCCLL": perfil, restrições e nível), tirado do SPS do quadro-chave.
  function codecFromSps(data) {
    const sps = nalUnits(data).find((u) => u.type === 7 && u.end - u.start >= 4);
    if (!sps) return null;
    const hex = (b) => b.toString(16).padStart(2, '0').toUpperCase();
    return 'avc1.' + hex(data[sps.start + 1]) + hex(data[sps.start + 2]) + hex(data[sps.start + 3]);
  }

  // ---------------- ponte com o app ----------------

  const bridge = root.ResenhexAndroid;
  const has = (name) => !!bridge && typeof bridge[name] === 'function';
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  const available = has('screenStart') && safe(() => !!bridge.screenAvailable(), false);
  // App de Android antigo (1.3.4 ou anterior): o site pede para atualizar.
  const outdated = !!bridge && !has('screenStart');
  const audioAvailable = available && safe(() => !!bridge.screenAudioAvailable(), false);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const named = (message, name) => Object.assign(new Error(message), { name });

  let session = null;

  // O WebView decodifica H.264? Sem isso, o app manda JPEG (mais pesado, mas funciona em qualquer um).
  let h264Check = null;
  function h264Decodable() {
    h264Check ||= (async () => {
      if (typeof root.VideoDecoder !== 'function' || typeof root.EncodedVideoChunk !== 'function') return false;
      try { return !!(await root.VideoDecoder.isConfigSupported({ codec: 'avc1.42E01F', optimizeForLatency: true })).supported; }
      catch { return false; }
    })();
    return h264Check;
  }

  // Trilha de vídeo que recebe os quadros: o gerador de trilhas do Chrome ou, em WebViews antigos, um canvas.
  function videoSink(fps) {
    if (typeof root.MediaStreamTrackGenerator === 'function' && typeof root.VideoFrame === 'function') {
      const generator = new root.MediaStreamTrackGenerator({ kind: 'video' });
      const writer = generator.writable.getWriter();
      return {
        track: generator,
        write(frame) {
          // Página atrasada: descarta o quadro em vez de acumular (são quadros já decodificados).
          if (writer.desiredSize !== null && writer.desiredSize <= 0) { frame.close(); return; }
          writer.write(frame).catch(() => {}).finally(() => { try { frame.close(); } catch {} });
        },
        close() { writer.close().catch(() => {}); },
      };
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d');
    const track = canvas.captureStream(fps).getVideoTracks()[0];
    return {
      track,
      write(frame) {
        const w = frame.displayWidth || frame.width, h = frame.displayHeight || frame.height;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        context.drawImage(frame, 0, 0);
        if (typeof root.VideoFrame === 'function' && frame instanceof root.VideoFrame) frame.close();
      },
      close() {},
    };
  }

  // Som do celular: o PCM do app passa por um worklet (fila curta) e sai como trilha de áudio.
  async function audioSink() {
    if (typeof root.AudioContext !== 'function' || typeof root.AudioWorkletNode !== 'function') return null;
    let ctx;
    try {
      ctx = new root.AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      if (ctx.sampleRate !== 48000) { ctx.close().catch(() => {}); return null; }
      await ctx.audioWorklet.addModule('android-screen-worklet.js');
      const node = new root.AudioWorkletNode(ctx, 'android-screen-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      // Só para a trilha da transmissão: nunca para o alto-falante (o celular já toca esse som).
      const destination = ctx.createMediaStreamDestination();
      destination.channelCount = 2;
      node.connect(destination);
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      return { ctx, node, track: destination.stream.getAudioTracks()[0] };
    } catch {
      ctx?.close().catch(() => {});
      return null;
    }
  }

  const END_NOTICES = {
    system: 'O Android encerrou a transmissão da tela.',
    encoder: 'O celular não conseguiu continuar codificando a tela. A transmissão parou.',
    destroyed: 'A transmissão da tela parou.',
    lost: 'A captura da tela do celular parou. Tente transmitir de novo.',
  };
  const START_ERRORS = {
    busy: 'A tela do celular já está sendo transmitida.',
    unsupported: 'Este celular não permite transmitir a tela.',
    foreground: 'O Android não deixou o Resenhex abrir a captura da tela. Tente de novo.',
    projection: 'O Android não liberou a captura da tela. Tente de novo.',
    encoder: 'Este celular não conseguiu codificar a tela.',
    display: 'O Android não liberou a captura da tela. Tente de novo.',
  };

  // Pede a captura ao app e devolve a MediaStream quando o primeiro quadro chegar.
  // box: { width, height } do perfil (a imagem cabe nessa caixa, deitada ou em pé); fps; audio: levar o som do celular.
  async function capture({ width = 1280, height = 720, fps = 30, audio = true } = {}) {
    if (!available) throw named('Este app não transmite a tela. Atualize o app do Resenhex.', 'NotSupportedError');
    if (session) throw named(START_ERRORS.busy, 'InvalidStateError');
    const h264 = await h264Decodable();
    const s = {
      stopped: false, started: false, token: '', box: { width, height, fps },
      gen: -1, info: null, decoder: null, decoderCodec: '', waitKey: true, decodeErrors: 0, lastKeyAsk: 0,
      packets: 0, skips: 0, behind: [], slowedAt: -Infinity, slowCount: 0, fpsLimit: 60, wantFps: fps, frames: 0, lastFrameAt: 0, lastTs: 0, lastBitmap: null, jpegBusy: false, repeat: 0,
      settings: { width: 0, height: 0, frameRate: fps, aspectRatio: 16 / 9, displaySurface: 'monitor', deviceId: 'android-screen' },
      sink: null, audio: null, video: null, nativeStop: null, abort: null,
      onStatus: null, firstFrame: null,
    };
    session = s;
    try {
      // 1. O Android pergunta à pessoa (tela inteira ou, no Android 14+, um app só).
      const status = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(named(START_ERRORS.projection, 'NotReadableError')), 120_000);
        s.onStatus = (st) => {
          if (st.state === 'started') { clearTimeout(timeout); resolve(st); }
          else if (st.state === 'denied') { clearTimeout(timeout); reject(named('Transmissão cancelada.', 'NotAllowedError')); }
          else if (st.state === 'error' || st.state === 'stopped') {
            clearTimeout(timeout);
            // Saiu da call antes de responder: nada a avisar.
            reject(st.reason === 'not_in_call' ? named('Fora da call', 'ShareCancelledError') : named(START_ERRORS[st.reason] || START_ERRORS.projection, 'NotReadableError'));
          }
        };
        bridge.screenStart(JSON.stringify({ width, height, fps, h264, audio: !!audio && audioAvailable }));
      });
      if (s.stopped) throw named('Transmissão cancelada.', 'ShareCancelledError');
      s.started = true;
      s.token = String(status.token || '');
      s.onStatus = (st) => statusChanged(s, st);
      if (status.width && status.height) Object.assign(s.settings, { width: status.width, height: status.height, aspectRatio: status.width / status.height });

      // 2. Trilhas: vídeo (decodificado aqui) e som (quando o app conseguiu capturar).
      s.sink = videoSink(fps);
      s.video = s.sink.track;
      if (status.audio) s.audio = await audioSink();
      if (s.stopped) throw named('Transmissão cancelada.', 'ShareCancelledError');
      const firstFrame = new Promise((resolve) => { s.firstFrame = resolve; });
      readLoop(s);
      s.repeat = setInterval(() => { repeatStill(s); speedBackUp(s); }, 250);

      // 3. Espera o primeiro quadro. H.264 que não decodifica neste WebView: passa para JPEG.
      let got = await Promise.race([firstFrame.then(() => true), sleep(6000).then(() => false)]);
      if (!got && !s.stopped && s.info?.codec !== 'jpeg') {
        safe(() => bridge.screenUseJpeg());
        got = await Promise.race([firstFrame.then(() => true), sleep(6000).then(() => false)]);
      }
      if (s.stopped) throw named('Transmissão cancelada.', 'ShareCancelledError');
      if (!got) throw named('A captura da tela do celular não mandou imagem.', 'NotReadableError');

      const video = s.video;
      s.nativeStop = video.stop.bind(video);
      video.androidScreen = true;
      video.getSettings = () => ({ ...s.settings });
      // A call parou a transmissão (releaseCapture): avisa o app.
      video.stop = () => { s.nativeStop(); end(s, 'local'); };
      const tracks = [video];
      if (s.audio) tracks.push(s.audio.track);
      const stream = new MediaStream(tracks);
      stream.androidScreen = true;
      // O Android nunca entrega o som da própria call (vozes) nem o do Resenhex: sem eco para quem assiste.
      if (s.audio) stream.desktopAudioMode = 'native';
      else if (audio) stream.noAudioNotice = !audioAvailable ? 'No Android 9 ou anterior a tela vai sem o som do celular.'
        : status.audioProblem === 'permission' ? 'A tela está indo sem o som do celular: libere o microfone do Resenhex nas configurações do Android.'
          : 'A tela está indo sem o som do celular. Este app ou celular não liberou a captura do som.';
      return stream;
    } catch (error) {
      end(s, 'local');
      throw error;
    }
  }

  function statusChanged(s, status) {
    if (s.stopped) return;
    if (status.state === 'stopped' || status.state === 'error') { endFromApp(s, status.reason === 'notification' || status.reason === 'app' ? '' : END_NOTICES[status.reason] || END_NOTICES.lost); return; }
    // Android 14+, um app só: ele saiu da tela (a transmissão fica pausada até ele voltar).
    if (status.state === 'paused') s.video?.dispatchEvent(new Event('mute'));
    if (status.state === 'resumed') s.video?.dispatchEvent(new Event('unmute'));
  }

  function askKeyframe(s) {
    const now = performance.now();
    if (now - s.lastKeyAsk < 1000) return;
    s.lastKeyAsk = now;
    safe(() => bridge.screenKeyframe());
  }

  async function readLoop(s) {
    let failures = 0;
    while (!s.stopped) {
      const controller = new AbortController();
      s.abort = controller;
      try {
        const response = await fetch(PATH + s.token, { cache: 'no-store', signal: controller.signal });
        if (!response.ok || !response.body) throw new Error('HTTP ' + response.status);
        const reader = response.body.getReader();
        const push = packetParser((packet) => onPacket(s, packet));
        for (;;) {
          const { done, value } = await reader.read();
          if (done || s.stopped) break;
          failures = 0;
          push(value);
        }
      } catch {
        // Tenta abrir de novo logo abaixo.
      }
      if (s.stopped) return;
      if (++failures > 5) { endFromApp(s, END_NOTICES.lost); return; }
      await sleep(250 * failures);
    }
  }

  function onPacket(s, packet) {
    if (s.stopped) return;
    if (packet.type === TYPE.PCM) {
      if (s.audio) s.audio.node.port.postMessage(packet.data.buffer, [packet.data.buffer]);
      return;
    }
    if (packet.type === TYPE.INFO) {
      let info;
      try { info = JSON.parse(new TextDecoder().decode(packet.data)); } catch { return; }
      s.gen = packet.gen;
      s.info = info;
      s.waitKey = true;
      s.settings.frameRate = info.fps || s.settings.frameRate;
      if (info.codec === 'jpeg') closeDecoder(s);
      return;
    }
    if (packet.gen !== s.gen || !s.info) return; // pacote de um codificador que já foi trocado
    s.packets++;
    if (packet.type === TYPE.JPEG) { drawJpeg(s, packet); return; }
    if (packet.type === TYPE.H264) decodeH264(s, packet);
  }

  function configureDecoder(s, codec) {
    closeDecoder(s);
    const decoder = new root.VideoDecoder({
      output: (frame) => { if (decoder === s.decoder) emit(s, frame); else frame.close(); },
      error: () => { if (decoder === s.decoder) decodeFailed(s); },
    });
    decoder.configure({ codec, optimizeForLatency: true });
    s.decoder = decoder;
    s.decoderCodec = codec;
  }

  function closeDecoder(s) {
    const decoder = s.decoder;
    s.decoder = null;
    s.decoderCodec = '';
    if (decoder && decoder.state !== 'closed') try { decoder.close(); } catch {}
  }

  // Três erros do decodificador na mesma transmissão: este WebView não se dá com o H.264 do celular.
  function decodeFailed(s) {
    closeDecoder(s);
    s.waitKey = true;
    if (++s.decodeErrors >= 3) safe(() => bridge.screenUseJpeg());
    else askKeyframe(s);
  }

  function decodeH264(s, packet) {
    if (typeof root.VideoDecoder !== 'function') return;
    const key = !!(packet.flags & FLAG_KEY);
    if (key) {
      const codec = codecFromSps(packet.data) || s.decoderCodec || 'avc1.42E01F';
      try { if (!s.decoder || s.decoder.state !== 'configured' || codec !== s.decoderCodec) configureDecoder(s, codec); }
      catch { decodeFailed(s); return; }
      s.waitKey = false;
    } else if (s.waitKey || !s.decoder) { askKeyframe(s); return; }
    // Decodificador atrasado mais de meio segundo (celular ocupado): pula até o próximo quadro-chave em vez
    // de acumular atraso. Engasgos curtos passam: o decodificador costuma correr atrás e alcançar sozinho.
    if (s.decoder.decodeQueueSize > Math.max(8, Math.ceil(s.box.fps / 2))) { s.waitKey = true; decoderBehind(s); askKeyframe(s); return; }
    try { s.decoder.decode(new root.EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: packet.time, data: packet.data })); }
    catch { decodeFailed(s); }
  }

  // Celular fraco (ou ocupado com o jogo): o decodificador ficou para trás três vezes em 10 s. Cada vez
  // a imagem pula até o próximo quadro-chave, que pesa ainda mais; então a captura passa para metade dos
  // quadros (mínimo 10 fps).
  function decoderBehind(s) {
    s.skips++;
    const now = performance.now();
    s.behind = s.behind.filter((t) => now - t < 10_000);
    s.behind.push(now);
    if (s.behind.length < 3 || s.box.fps <= 10 || now - s.slowedAt < 10_000) return;
    s.behind = [];
    s.slowedAt = now;
    s.slowCount++;
    s.fpsLimit = Math.max(10, Math.round(s.box.fps / 2));
    s.box = { ...s.box, fps: s.fpsLimit };
    safe(() => bridge.screenQuality(s.box.width, s.box.height, s.box.fps));
  }

  // O aperto passou (um jogo abrindo, por exemplo): sem atraso por um tempo, dobra os quadros de novo até
  // voltar ao do perfil. Cada vez que precisou reduzir, espera o dobro antes de tentar (30 s, 1 min… até 5 min).
  function speedBackUp(s) {
    if (s.stopped || s.fpsLimit >= s.wantFps || s.info?.codec !== 'h264') return;
    const now = performance.now();
    const wait = Math.min(300_000, 30_000 * 2 ** Math.max(0, s.slowCount - 1));
    if (now - s.slowedAt < wait || s.behind.some((t) => now - t < 10_000)) return;
    s.slowedAt = now;
    s.fpsLimit = Math.min(s.wantFps, s.fpsLimit * 2);
    if (s.box.fps >= s.fpsLimit) return;
    s.box = { ...s.box, fps: s.fpsLimit };
    safe(() => bridge.screenQuality(s.box.width, s.box.height, s.box.fps));
  }

  async function drawJpeg(s, packet) {
    if (s.jpegBusy) return; // o anterior ainda está sendo aberto: este quadro fica de fora
    s.jpegBusy = true;
    try {
      const { width, height } = s.info;
      // O app manda a linha inteira da memória da tela (pode sobrar uma faixa à direita): recorta.
      const bitmap = await createImageBitmap(new Blob([packet.data], { type: 'image/jpeg' }), 0, 0, width, height);
      if (s.stopped || packet.gen !== s.gen) { bitmap.close(); return; }
      s.lastBitmap?.close();
      s.lastBitmap = bitmap;
      emitBitmap(s, bitmap, packet.time);
    } catch {
      // Quadro perdido; o próximo vem em seguida.
    } finally { s.jpegBusy = false; }
  }

  // Em JPEG o app só manda quadros quando a tela muda. Tela parada: repete o último a cada meio segundo,
  // para quem começa a assistir não ficar no preto.
  function repeatStill(s) {
    if (s.stopped || !s.lastBitmap || s.info?.codec !== 'jpeg' || s.jpegBusy) return;
    const idle = performance.now() - s.lastFrameAt;
    if (idle < 500) return;
    emitBitmap(s, s.lastBitmap, s.lastTs + Math.round(idle * 1000));
  }

  function emitBitmap(s, bitmap, time) {
    const timestamp = Math.max(time, s.lastTs + 1000);
    if (typeof root.VideoFrame !== 'function') { s.lastTs = timestamp; s.sink.write(bitmap); frameShown(s, bitmap.width, bitmap.height); return; }
    let frame;
    try { frame = new root.VideoFrame(bitmap, { timestamp }); } catch { return; }
    emit(s, frame);
  }

  function emit(s, frame) {
    if (s.stopped || !s.sink) { frame.close(); return; }
    s.lastTs = Math.max(s.lastTs, frame.timestamp);
    frameShown(s, frame.displayWidth, frame.displayHeight);
    s.sink.write(frame);
  }

  function frameShown(s, width, height) {
    s.frames++;
    s.lastFrameAt = performance.now();
    if (width && height && (width !== s.settings.width || height !== s.settings.height)) Object.assign(s.settings, { width, height, aspectRatio: width / height });
    s.firstFrame?.();
  }

  // Fim da transmissão. reason 'app': o app já parou (não precisa avisar); senão, pede ao app para parar.
  function end(s, reason) {
    if (s.stopped) return;
    s.stopped = true;
    if (session === s) session = null;
    if (reason !== 'app') safe(() => bridge.screenStop());
    s.abort?.abort();
    clearInterval(s.repeat);
    closeDecoder(s);
    s.lastBitmap?.close();
    s.lastBitmap = null;
    s.sink?.close();
    if (s.audio) { s.audio.track.stop(); s.audio.ctx.close().catch(() => {}); }
  }

  // O app parou a transmissão (botão da notificação, o Android, erro): a trilha termina como a de um navegador.
  function endFromApp(s, notice) {
    if (s.stopped) return;
    end(s, 'app');
    const video = s.video;
    if (!video || !s.nativeStop) return;
    video.endNotice = notice || '';
    s.nativeStop();
    video.dispatchEvent(new Event('ended'));
  }

  // Perfil de qualidade mudou durante a transmissão (ou ninguém está assistindo: 5 fps).
  function setQuality({ width, height, fps }) {
    const s = session;
    if (!s?.started || s.stopped) return;
    s.wantFps = Math.round(fps);
    const box = { width: Math.round(width), height: Math.round(height), fps: Math.min(s.wantFps, s.fpsLimit) };
    if (box.width === s.box.width && box.height === s.box.height && box.fps === s.box.fps) return;
    s.box = box;
    safe(() => bridge.screenQuality(box.width, box.height, box.fps));
  }

  // Chamado pelo app (android.js repassa o _screenState do Java).
  function stateFromApp(status) {
    if (typeof status === 'string') try { status = JSON.parse(status); } catch { return; }
    if (status && typeof status === 'object') session?.onStatus?.(status);
  }

  return {
    available, outdated, audioAvailable, capture, setQuality, _state: stateFromApp,
    get active() { return !!session; },
    // Diagnóstico (console do WebView): pacotes de vídeo recebidos, quadros entregues à trilha e o estado atual.
    get stats() {
      const s = session;
      return s && { codec: s.info?.codec, gen: s.gen, packets: s.packets, frames: s.frames, decodeQueue: s.decoder?.decodeQueueSize ?? null,
        decodeErrors: s.decodeErrors, skippedToKey: s.skips, captureFps: s.box.fps, audio: !!s.audio, ...s.settings };
    },
    // Partes puras, para os testes.
    TYPE, FLAG_KEY, HEADER, packetParser, nalUnits, codecFromSps,
  };
});
