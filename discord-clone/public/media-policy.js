/* Decisões de mídia puras e determinísticas: sem captura, rede ou DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MediaPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // "adaptive": quando a transmissão engasga, a resolução desce um degrau e o FPS fica.
  // Nitidez mantém a resolução escolhida. Movimento mantém resolução e 60 fps enquanto o computador
  // e a conexão dão conta (maintain-framerate-and-resolution) e desce degraus só quando os quadros
  // começam a cair: o ajuste do navegador (maintain-framerate) baixava para 540p ou 360p mesmo com
  // banda sobrando, e a mesma taxa rendeu ~3 dB a mais mantendo a resolução.
  // "steps" (só no Movimento): 1080p → 900p → 720p, escolhidos pela fluidez (ladder, abaixo). O 1080p é
  // o alvo: fica enquanto a transmissão mantém 45–60 fps, e os degraus de baixo só entram quando faltam.
  // Telas com texto ("detail") vão em AV1: com as ferramentas de conteúdo de tela ele deixa o texto
  // bem mais nítido que o VP8 gastando menos internet (docs/relatorios/TRANSMISSAO-2026-10-14.md).
  // Quem não decodifica AV1 negocia o próximo da lista; processador no limite passa para o VP8.
  const TEXT_CODECS = ['video/AV1', 'video/VP9', 'video/VP8', 'video/H264'];
  const presets = {
    auto: { label: 'Automática', desc: 'Fluida para cada espectador: reduz a resolução antes do FPS', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'maintain-resolution', adaptive: true, bitrate: 4_000_000, codecs: TEXT_CODECS },
    p720: { label: 'Economia · 720p / 30', desc: 'Menor uso de internet e processamento', width: 1280, height: 720, fps: 30, hint: 'detail', degradation: 'maintain-resolution', adaptive: true, bitrate: 2_500_000, codecs: TEXT_CODECS },
    p1080: { label: 'Nitidez · 1080p / 30', desc: 'Textos, trabalho e apresentações', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'maintain-resolution', adaptive: false, bitrate: 4_000_000, codecs: TEXT_CODECS },
    p1080_60: { label: 'Movimento · 1080p / 60', desc: 'Jogos e vídeos; exige mais do computador', width: 1920, height: 1080, fps: 60, hint: 'motion', degradation: 'maintain-framerate-and-resolution', adaptive: true, steps: [1080, 900, 720], bitrate: 8_000_000, codecs: ['video/H264', 'video/VP8'] },
  };

  // Quadros por segundo pedidos à captura de tela. O Chromium agenda cada quadro da captura só depois
  // de terminar o anterior, com timer em milissegundos, e perde um pouco em cada um: pedindo 60, a
  // captura do app entregou 55,8 fps; pedindo 64, 59 (docs/relatorios/CAPTURA-60FPS-2026-10-16.md). No
  // perfil de 60 a captura pede 64 e o codificador continua limitado a 60 (maxFramerate). Nos de 30 a
  // perda é pequena (29,4 fps), e pedir 32 entregou 31,2: o codificador descartaria a sobra.
  const captureFps = (fps) => (fps >= 60 ? fps + 4 : fps);

  const watchModes = {
    auto: { label: 'Automática', desc: 'Acompanha o tamanho do vídeo e sua conexão' },
    economy: { label: 'Economia', desc: 'Até 720p e 15 fps, para gastar menos internet' },
    source: { label: 'Mais nitidez', desc: 'Solicita a resolução da fonte, dentro da banda disponível' },
  };

  // Degraus fixos de resolução. Valores estáveis evitam reconfigurar o codificador a cada amostra.
  const STEPS = [1080, 720, 540, 360];
  const CODECS = ['video/H264', 'video/VP9', 'video/VP8', 'video/AV1'];
  const MAX_LEVEL = STEPS.length - 1;

  function viewerDemand({ mode = 'auto', width = 0, height = 0, pixelRatio = 1, aspect = 16 / 9, background = false, codecs = [] } = {}) {
    if (!watchModes[mode]) mode = 'auto';
    const pixels = Math.min(height, width / aspect) * Math.min(2, Math.max(1, pixelRatio));
    const maxHeight = mode === 'source' || !pixels ? 1080 : [180, 360, 540, 720, 1080].find((h) => h >= pixels) || 1080;
    const demand = { mode, maxHeight: mode === 'economy' ? Math.min(720, maxHeight) : maxHeight, background: !!background };
    if (codecs.length) demand.codecs = codecs.filter((c) => CODECS.includes(c)).slice(0, 4);
    return demand;
  }

  // Desce "level" degraus a partir do primeiro degrau que cabe na altura pedida.
  function stepHeight(height, level, steps = STEPS) {
    const start = steps.findIndex((h) => h <= height), last = steps.length - 1;
    return Math.min(height, steps[Math.min(last, (start < 0 ? last : start) + level)]);
  }

  // Meta de um espectador. O pedido dele é um teto; a adaptação (level) só reduz resolução.
  // Em telas com texto, reduzir a imagem no envio borra as letras bem mais do que a redução feita
  // na tela de quem assiste (1080p reduzido para 720p no envio perdeu ~13 dB nas medições) e
  // economiza pouco com AV1/VP9. Por isso só miniaturas recebem a imagem menor. Com conteúdo pesado
  // (preset.motion: jogo ou vídeo detectado), cada bloco volta a receber o seu tamanho.
  function screenTarget(preset, demand = {}, level = 0) {
    const requested = demand.mode === 'source' ? preset.height : demand.maxHeight || preset.height;
    let height = Math.min(preset.height, preset.hint === 'detail' && !preset.motion && requested > 360 ? preset.height : requested);
    let fps = preset.fps;
    if (demand.mode === 'economy') { height = Math.min(720, height); fps = Math.min(15, fps); }
    if (demand.background) { height = Math.min(360, height); fps = Math.min(5, fps); }
    if (demand.fps > 0) fps = Math.min(fps, demand.fps); // bloco sem degraus a 30 fps para o 1080p manter os quadros
    if (level && preset.adaptive) height = stepHeight(height, level, preset.steps);
    const bitrate = Math.max(150_000, Math.round(preset.bitrate * (height / preset.height) ** 1.5 * (fps / preset.fps) ** .7));
    return { height, fps, bitrate };
  }

  // Altura de cada degrau para um espectador, do maior para o menor (os últimos podem se repetir).
  const stepHeights = (preset, demand) => (preset.steps || STEPS).map((_, level) => screenTarget(preset, demand, level).height);

  // Divisão max-min: atende primeiro quem precisa de pouco e redistribui o que sobra.
  function distribute(pool, caps) {
    const rates = caps.map(() => 0);
    let remaining = caps.map((cap, i) => i).filter((i) => caps[i] > 0);
    while (pool > 0 && remaining.length) {
      const share = pool / remaining.length;
      const satisfied = remaining.filter((i) => caps[i] <= share);
      if (!satisfied.length) { for (const i of remaining) rates[i] = Math.floor(share); break; }
      for (const i of satisfied) { rates[i] = Math.floor(caps[i]); pool -= rates[i]; }
      remaining = remaining.filter((i) => !satisfied.includes(i));
    }
    return rates;
  }

  // Tetos de bitrate a partir do upload informado. A estimativa de banda do navegador NÃO entra
  // aqui: limitar o codificador a ela impede a própria estimativa de subir (o erro da 0.9).
  // O controle de congestionamento do WebRTC já mantém o envio abaixo do que a rede aguenta.
  function allocate(uploadMbps, peers, { screen = false, screenAudio = false, camera = false, preset = presets.auto } = {}) {
    const upload = Math.min(100, Math.max(1, Number(uploadMbps) || 10)) * 1e6;
    const reserves = peers.map((p) => 80_000 + (screenAudio && screen && p.watching ? 96_000 : 0));
    const pool = Math.max(0, upload * .85 - reserves.reduce((a, b) => a + b, 0));
    const targets = peers.map((p) => screen && p.watching ? screenTarget(preset, p.demand, p.level || 0) : null);
    const screenCaps = targets.map((target) => target ? target.bitrate : 0);
    const screens = distribute(pool * (camera && screenCaps.some((cap) => cap > 0) ? .8 : 1), screenCaps);
    const cameras = camera ? distribute(pool - screens.reduce((a, b) => a + b, 0), peers.map(() => 1_200_000)) : peers.map(() => 0);
    return new Map(peers.map((p, i) => [p.sid, { screen: screens[i], camera: cameras[i], target: targets[i] }]));
  }

  // O FPS pedido nunca é cortado pela banda: essa era a causa da transmissão "travada" da 0.9.
  // A resolução vem de degraus fixos e nunca aumenta a imagem capturada.
  function screenEncoding(preset, bitrate, demand, settings = {}, level = 0) {
    const target = screenTarget(preset, demand, level);
    const source = settings.height || preset.height;
    const scale = Math.max(1, source / Math.min(source, target.height));
    return { maxBitrate: Math.max(10_000, Math.round(bitrate)), maxFramerate: target.fps, scaleResolutionDownBy: Math.ceil(scale * 100) / 100, active: bitrate > 0 };
  }

  // Ligação pelo retransmissor (candidato "relay"): a transmissão inteira passa pela rede do servidor, que
  // tem limite no mês. Para esse espectador ela vai em até 720p e 1,5 Mbps; quem conecta direto segue cheia.
  const RELAY = { height: 720, bitrate: 1_500_000 };
  function relayCap(encoding, sourceHeight) {
    const scale = Math.ceil(Math.max(1, (sourceHeight || RELAY.height) / RELAY.height) * 100) / 100;
    return { ...encoding, maxBitrate: Math.min(encoding.maxBitrate, RELAY.bitrate), scaleResolutionDownBy: Math.max(encoding.scaleResolutionDownBy || 1, scale) };
  }

  // A transmissão está engasgando? O próprio codificador diz (banda ou processador), ou os quadros
  // enviados ficam bem abaixo dos capturados. Tela parada captura poucos quadros e não conta.
  function strained({ reason, sentFps, sourceFps, targetFps } = {}) {
    if (reason === 'bandwidth' || reason === 'cpu') return true;
    const expected = Math.min(Number(sourceFps) || 0, Number(targetFps) || Infinity);
    return expected >= 8 && Number.isFinite(sentFps) && sentFps < expected * .65;
  }

  // Desce um degrau após 4 s de engasgo (no máximo a cada 6 s) e sobe um degrau após 12 s bons,
  // se a conexão comporta o degrau acima (headroom false bloqueia; sem estimativa, só o tempo decide).
  // Para no último degrau que ainda reduz a resolução deste espectador ("heights", de stepHeights):
  // um degrau a mais seria a mesma imagem e só atrasaria a volta em 12 s.
  function adapt(previous = {}, sample, now) {
    const next = { level: 0, badSince: null, goodSince: null, changedAt: -Infinity, ...previous };
    let last = MAX_LEVEL;
    if (sample.heights?.length) { last = 0; for (let k = 1; k < sample.heights.length; k++) if (sample.heights[k] < sample.heights[last]) last = k; }
    next.level = Math.min(next.level, last);
    if (!sample.active) return { ...next, badSince: null, goodSince: null };
    if (sample.strained) {
      next.goodSince = null;
      next.badSince ??= now;
      if (now - next.badSince >= 4_000 && now - next.changedAt >= 6_000 && next.level < last) {
        next.level++;
        next.changedAt = now;
        next.badSince = now;
      }
    } else {
      next.badSince = null;
      next.goodSince ??= now;
      if (next.level > 0 && sample.headroom !== false && now - next.goodSince >= 12_000 && now - next.changedAt >= 12_000) {
        next.level--;
        next.changedAt = now;
        next.goodSince = now;
      }
    }
    return next;
  }

  // Escada do Movimento: o 1080p é o alvo e fica o máximo possível, com o máximo de FPS que der. A cada
  // amostra (~1,5 s) compara os quadros enviados com os que a fonte entrega ("heights" são os degraus
  // deste espectador, do maior para o menor):
  // - desce um degrau (1080p → 900p → 720p) quando a mediana das últimas 4 amostras (~6 s) fica abaixo
  //   de 25 fps e a mais recente também. A mediana ignora uma engasgada isolada (uma amostra a 1 fps não
  //   derruba), mas engasgos repetidos descem. Uma queda curta da internet, que volta sozinha, não troca.
  //   Depois de mudar, espera ~3 s para assentar;
  // - sobe um degrau quando as últimas 4 amostras ficaram acima desse piso, há ~8 s da última troca, e o
  //   degrau de cima cabe: o tempo de codificação previsto mantém pelo menos 35 fps e a banda estimada
  //   comporta 75% da taxa dele, sem passar de 4,5 Mbps (uma taxa máxima maior não dificulta a volta). O tempo de codificação cresce menos que os pixels (H.264 em software,
  //   medido: 720p 11 ms, 900p 13 ms, 1080p 15–16 ms), por isso a previsão usa pixels^0,6. Só um
  //   espectador por vez tenta subir (canProbe);
  // - uma subida que volta a cair em até 15 s desce de novo, e aquele degrau espera 15, 30, 60 e até
  //   120 s para outra tentativa. A espera cai quando a folga melhora: codificação 25% mais rápida ou
  //   banda 30% maior.
  // Os 25 e 35 fps valem para fonte a 60 fps; com o jogo rodando abaixo disso, valem 80% e 90% do FPS
  // dele. Tela parada (menos de 20 fps na fonte) não conta, e o aviso do navegador (banda/processador)
  // não entra: só os quadros que de fato saem. Com vários espectadores, quem chama decide a vez.
  const LADDER = { window: 4, floor: 25, climb: 35, band: 4_500_000, settle: 3_000, up: 8_000, keep: 15_000, retry: [15_000, 30_000, 60_000, 120_000] };
  function ladder(previous = {}, { active, sentFps, sourceFps, targetFps, heights = [], encodeMs, available, upBitrate, canProbe = true, canStepDown = true } = {}, now) {
    const next = { level: 0, fps: [], changedAt: -Infinity, probe: null, failures: {}, ...previous };
    if (!active) return { ...next, fps: [] };
    let last = 0;
    for (let k = 1; k < heights.length; k++) if (heights[k] < heights[last]) last = k;
    next.level = Math.min(next.level, last);
    if (now - next.changedAt < LADDER.settle) return next;
    if (next.probe && now - next.probe.at >= LADDER.keep) { next.failures = { ...next.failures }; delete next.failures[next.probe.level]; next.probe = null; }
    next.fps = [...next.fps, Number.isFinite(sentFps) ? sentFps : 0].slice(-LADDER.window);
    const target = Number(targetFps) || 0;
    const expected = Math.min(Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : target, target);
    if (expected < 20) return next;
    const floor = Math.min(LADDER.floor, expected * .8), climbFps = Math.min(LADDER.climb, expected * .9);
    const median = (values) => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
    const gain = (from, to) => (heights[from] / heights[to]) ** 2; // pixels de um degrau sobre o outro
    const change = (level, extra) => ({ ...next, level, fps: [], changedAt: now, probe: null, ...extra });
    const full = next.fps.length === LADDER.window, latest = next.fps[next.fps.length - 1];
    if (canStepDown && full && median(next.fps) < floor && latest < floor && next.level < last) {
      const failures = { ...next.failures }, failed = next.probe?.level;
      if (failed != null) {
        const count = (failures[failed]?.count || 0) + 1;
        failures[failed] = { count, until: now + LADDER.retry[Math.min(count, LADDER.retry.length) - 1], encodeMs: next.probe.encodeMs, available: next.probe.available };
      }
      return change(next.level + 1, { failures });
    }
    if (next.level > 0 && canProbe && full && Math.min(...next.fps) >= floor && now - next.changedAt >= LADDER.up) {
      const up = next.level - 1, budget = 1000 / climbFps, failed = next.failures[up];
      const cpuFits = !Number.isFinite(encodeMs) || encodeMs * gain(up, next.level) ** .6 <= budget;
      const bandFits = !(available > 0) || !(upBitrate > 0) || available >= Math.min(upBitrate * .75, LADDER.band);
      const better = failed && ((Number.isFinite(encodeMs) && failed.encodeMs > 0 && encodeMs < failed.encodeMs * .75) || (available > 0 && failed.available > 0 && available > failed.available * 1.3));
      if (cpuFits && bandFits && (!failed || now >= failed.until || better)) return change(up, { probe: { level: up, at: now, encodeMs, available } });
    }
    return next;
  }

  function encoding(preset, bitrate, level = 0) {
    return { maxBitrate: Math.max(10_000, Math.round(bitrate)), maxFramerate: Math.min(preset.fps, [preset.fps, 24, 15][level]), scaleResolutionDownBy: [1, 1.5, 2][level], active: bitrate > 0 };
  }

  // Codec da tela para um espectador. Celulares informam quais codecs decodificam por hardware
  // (mais fluido e sem esquentar); o perfil escolhido vence se um dos codecs dele estiver nessa lista.
  // Depois que o processador de quem transmite não deu conta (cpuFallback), o codec leve vem primeiro.
  function screenCodecs(preset, efficient = [], fallback = null) {
    const known = (Array.isArray(efficient) ? efficient : []).filter((c) => CODECS.includes(c));
    const list = fallback && preset.codecs.includes(fallback) ? [fallback, ...preset.codecs.filter((c) => c !== fallback)] : preset.codecs;
    if (!known.length) return list;
    const first = list.find((c) => known.includes(c)) || known[0];
    return [first, ...list.filter((c) => c !== first)];
  }

  // H.264 no Windows: o Chromium só tem codificador de hardware (NVIDIA, AMD ou Intel, pelo Media
  // Foundation) para Baseline (42 00), Main (4d) e High (64). O Constrained Baseline (42e0) vai sempre
  // para o OpenH264, no processador: 36,4 dB com 81% de CPU contra 40,2 dB e 24% do Main na RTX 4060 Ti
  // (1080p60 a 6 Mbps). O Main rendeu +0,8 dB sobre o Baseline, empatou com o High e, se faltar a
  // placa, ainda tem o OpenH264 de reserva (o High não tem). packetization-mode=0 fica por último.
  const H264_HARDWARE = ['4d00', '4200', '6400'];
  function h264Rank(codec = {}) {
    if (String(codec.mimeType).toLowerCase() !== 'video/h264') return 0;
    const fmtp = codec.sdpFmtpLine || '';
    const index = H264_HARDWARE.indexOf(/profile-level-id=([0-9a-f]{4})/i.exec(fmtp)?.[1].toLowerCase());
    return (index < 0 ? H264_HARDWARE.length : index) + (/packetization-mode=1/.test(fmtp) ? 0 : H264_HARDWARE.length + 1);
  }
  const hardwareH264 = (codec) => String(codec?.mimeType).toLowerCase() === 'video/h264' && h264Rank(codec) < H264_HARDWARE.length;
  // Codec de envio entre os negociados (encodings[0].codec): o primeiro tipo pedido que a conexão tem;
  // no H.264, o perfil mais bem colocado que ainda não caiu no processador nesta conexão (avoid: fmtp).
  function pickCodec(codecs = [], wanted = [], avoid = []) {
    for (const mime of wanted) {
      const matches = codecs.filter((c) => c.mimeType?.toLowerCase() === mime.toLowerCase()).sort((a, b) => h264Rank(a) - h264Rank(b));
      if (matches.length) return matches.find((c) => !avoid?.includes(c.sdpFmtpLine)) || matches[0];
    }
  }

  // AV1 e VP9 deixam o texto mais nítido, mas custam mais processador em cenas com movimento.
  // Se o codificador ficar limitado pelo processador, a transmissão troca para o VP8 (sem renegociar),
  // antes de baixar a resolução.
  const CPU_FALLBACK = 'video/VP8';
  const cpuFallback = (codec) => ['video/AV1', 'video/VP9'].includes(codec) ? CPU_FALLBACK : null;
  // Só vale depois de 5 s seguidos: um pico ao trocar de janela não conta.
  function sustained(previous = {}, active, now, ms = 5_000) {
    if (!active) return { since: null, reached: false };
    const since = previous.since ?? now;
    return { since, reached: now - since >= ms };
  }
  function cpuStrain(previous = {}, { limited, codec }, now) {
    const state = sustained(previous, limited && !!cpuFallback(codec), now);
    return { since: state.since, fallback: state.reached };
  }
  // Como o codificador está: no limite do processador quando o navegador diz ou quando cada quadro
  // leva quase o intervalo inteiro para codificar (o navegador demorou mais de 20 s para avisar nas
  // medições). Pesado quando, além disso, gasta quase toda a taxa que recebe: texto usa uma fração
  // (AV1 22–35%, VP8 até ~70%), jogos e vídeos usam 80–100%.
  function encoderLoad({ reason, encodeMs, fps, bitrate, target } = {}) {
    const cpu = reason === 'cpu' || (Number.isFinite(encodeMs) && fps > 0 && encodeMs >= 800 / fps);
    return { cpu, heavy: cpu || reason === 'bandwidth' || (target > 0 && Number.isFinite(bitrate) && bitrate >= target * .8) };
  }

  // Todas as mudanças nos senders de uma conexão passam por uma fila (assistir, parar, trocar, ajustar).
  function enqueue(peer, task) {
    const result = (peer.mediaQueue || Promise.resolve()).then(task);
    peer.mediaQueue = result.catch(() => {}); // quem chamou trata o erro; a fila continua usável
    return result;
  }
  // Taxa inicial do estimador de banda (x-google-start-bitrate, em kbps) nos payloads H.264 das
  // seções de vídeo indicadas ({ mid: kbps }). O Chrome só lê esse parâmetro da descrição remota.
  // Uma tela em H.264 que entra numa conexão que só levava áudio começa a ~300 kbps e leva uns 20 s
  // para passar de 3 Mbps; VP8 e AV1 chegam lá sozinhos em 1–2 s.
  function startBitrate(sdp, rates, codec = 'H264') {
    if (typeof sdp !== 'string' || !rates || !Object.keys(rates).length) return sdp;
    const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
    return sdp.split(eol + 'm=').map((section, index) => {
      if (!index || !section.startsWith('video')) return section;
      const lines = section.split(eol), kbps = Math.round(rates[lines.find((line) => line.startsWith('a=mid:'))?.slice(6)]);
      if (!(kbps > 0)) return section;
      const types = new Set(lines.map((line) => /^a=rtpmap:(\d+) ([\w-]+)\//.exec(line)).filter((m) => m?.[2].toUpperCase() === codec.toUpperCase()).map((m) => m[1]));
      return lines.map((line) => types.has(/^a=fmtp:(\d+) /.exec(line)?.[1]) && !line.includes('x-google-start-bitrate') ? `${line};x-google-start-bitrate=${kbps}` : line).join(eol);
    }).join(eol + 'm=');
  }
  // Som da tela em estéreo no P2P. O Chrome só decodifica Opus em estéreo quando a descrição LOCAL de
  // quem recebe pede (stereo=1), e só codifica em estéreo quando a REMOTA de quem envia pede. Sem isso o
  // som do jogo ou da música chega mono. A local de quem assiste vira a remota de quem transmite, então
  // basta quem assiste pedir, nas seções de áudio que trazem a trilha da transmissão (a=msid).
  function audioMids(sdp, streamId) {
    const mids = new Set();
    if (typeof sdp !== 'string' || !streamId) return mids;
    const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
    for (const section of sdp.split(eol + 'm=').slice(1)) {
      if (!section.startsWith('audio')) continue;
      const lines = section.split(eol), mid = lines.find((line) => line.startsWith('a=mid:'))?.slice(6);
      if (mid != null && lines.some((line) => line.startsWith(`a=msid:${streamId} `))) mids.add(mid);
    }
    return mids;
  }
  function opusStereo(sdp, mids) {
    if (typeof sdp !== 'string' || !mids?.size) return sdp;
    const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
    return sdp.split(eol + 'm=').map((section, index) => {
      if (!index || !section.startsWith('audio')) return section;
      const lines = section.split(eol);
      if (!mids.has(lines.find((line) => line.startsWith('a=mid:'))?.slice(6))) return section;
      const opus = new Set(lines.map((line) => /^a=rtpmap:(\d+) opus\/48000\/2/i.exec(line)?.[1]).filter(Boolean));
      return lines.map((line) => {
        const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
        return fmtp && opus.has(fmtp[1]) && !/(^|;)\s*stereo=/.test(fmtp[2]) ? `${line};stereo=1` : line;
      }).join(eol);
    }).join(eol + 'm=');
  }
  function formatVideoStats(measurements, total = false) {
    if (!measurements.length) return 'Medindo qualidade…';
    const range = (key) => {
      const values = measurements.map((item) => item[key]).filter(Number.isFinite).map(Math.round);
      if (!values.length) return '?';
      const min = Math.min(...values), max = Math.max(...values);
      return min === max ? String(min) : `${min}–${max}`;
    };
    const size = measurements.length === 1 ? `${range('width')}×${range('height')}` : `${range('height')}p`;
    const bitrates = measurements.map((item) => item.bitrate).filter(Number.isFinite);
    const rate = bitrates.length === measurements.length ? `${(bitrates.reduce((sum, value) => sum + value, 0) / 1e6).toFixed(1).replace('.', ',')} Mbps${total ? ' total' : ''}` : 'Medindo Mbps…';
    const codecs = [...new Set(measurements.map((item) => item.codec).filter(Boolean))].join('/');
    // No envio, também os quadros que a captura entregou ao codificador (sourceFps).
    const captured = measurements.some((item) => Number.isFinite(item.sourceFps)) ? `captura ${range('sourceFps')} fps` : '';
    return [size, `${range('fps')} fps`, captured, rate, codecs].filter(Boolean).join(' · ');
  }
  return { presets, watchModes, CODECS, captureFps, viewerDemand, screenTarget, stepHeights, allocate, screenEncoding, relayCap, RELAY, screenCodecs, h264Rank, hardwareH264, pickCodec, cpuFallback, cpuStrain, sustained, encoderLoad, strained, adapt, ladder, encoding, enqueue, startBitrate, audioMids, opusStereo, formatVideoStats };
});
