// Mensagem de áudio, como no WhatsApp: gravar pelo campo de mensagem e tocar no chat com a onda, o tempo e a
// velocidade. O áudio vai como um anexo comum (.weba, .ogg ou .m4a, o que o navegador gravar); a duração e a
// onda seguem junto na mensagem, para o player aparecer pronto sem baixar o arquivo.
window.VoiceMessage = ({ el, Icon, setSinkId }) => {
  const MAX_SECONDS = 5 * 60;
  const BARS = 48;
  const TYPES = [['audio/webm;codecs=opus', 'weba'], ['audio/ogg;codecs=opus', 'ogg'], ['audio/mp4', 'm4a']];
  const SPEEDS = [1, 1.5, 2];
  const clock = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const pick = () => (typeof MediaRecorder === 'undefined' ? null : TYPES.find(([type]) => MediaRecorder.isTypeSupported(type)));
  const supported = () => !!(navigator.mediaDevices?.getUserMedia && pick());

  // Junta as leituras de volume (20 por segundo) em BARS barras de 0 a 100. A mais alta vale 100 e a curva
  // levanta os trechos baixos, para a fala normal não virar uma linha reta.
  function waveform(levels, bars = BARS) {
    if (!levels.length) return new Array(bars).fill(0);
    const out = [];
    for (let i = 0; i < bars; i++) {
      const from = Math.floor(i * levels.length / bars);
      const to = Math.max(from + 1, Math.floor((i + 1) * levels.length / bars));
      let peak = 0;
      for (let j = from; j < Math.min(to, levels.length); j++) peak = Math.max(peak, levels[j]);
      out.push(peak);
    }
    const top = Math.max(...out) || 1;
    return out.map((v) => Math.round(Math.pow(v / top, 0.7) * 100));
  }

  // Uma gravação começa ao chamar e termina em stop() (devolve o arquivo, a duração e a onda) ou cancel().
  // onTick recebe os segundos gravados e o volume do momento (0 a 1); onLimit avisa quando passa de 5 minutos.
  async function record({ deviceId, onTick, onLimit }) {
    const [mimeType, ext] = pick();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { ideal: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const levels = [];
    const started = performance.now();
    let limited = false;
    recorder.start(250);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      const rms = Math.sqrt(sum / data.length);
      levels.push(rms);
      const seconds = (performance.now() - started) / 1000;
      onTick?.(seconds, Math.min(1, rms * 5));
      if (seconds >= MAX_SECONDS && !limited) { limited = true; onLimit?.(); }
    }, 50);
    const release = () => {
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      ctx.close().catch(() => {});
    };
    return {
      stop: () => new Promise((resolve) => {
        const duration = Math.min(MAX_SECONDS, (performance.now() - started) / 1000);
        recorder.onstop = () => {
          release();
          resolve({ blob: new Blob(chunks, { type: mimeType.split(';')[0] }), name: 'mensagem-de-voz.' + ext, duration, waveform: waveform(levels) });
        };
        recorder.stop();
      }),
      cancel: () => {
        recorder.onstop = release;
        try { recorder.stop(); } catch { release(); }
      },
    };
  }

  // Player no chat: um por vez toca. O arquivo só é baixado no primeiro play.
  let current = null;
  function player({ url, duration, waveform: wave }) {
    const total = Math.max(0.1, Number(duration) || 0);
    const heights = Array.isArray(wave) && wave.length ? wave : new Array(BARS).fill(35);
    let audio = null;
    let speed = 0;
    let frame = 0;
    const playButton = el('button', { type: 'button', class: 'vm-play', ariaLabel: 'Tocar mensagem de áudio' }, Icon('play', 18));
    const bars = el('div', { class: 'vm-wave', role: 'slider', tabIndex: 0, ariaLabel: 'Posição do áudio', ariaValuemin: '0', ariaValuemax: String(Math.round(total)), ariaValuenow: '0' },
      heights.map((h) => el('span', { style: { height: Math.max(12, Math.min(100, h)) + '%' } })));
    const time = el('span', { class: 'vm-time', textContent: clock(total) });
    const speedButton = el('button', { type: 'button', class: 'vm-speed', tip: 'Velocidade', ariaLabel: 'Velocidade 1x', textContent: '1x' });
    const root = el('div', { class: 'voice-message' }, playButton, el('div', { class: 'vm-track' }, bars, time), speedButton);

    const at = () => (audio ? audio.currentTime : 0);
    function paint() {
      const progress = Math.min(1, at() / total);
      root.style.setProperty('--vm-progress', progress);
      const lit = Math.round(progress * heights.length);
      [...bars.children].forEach((bar, i) => bar.classList.toggle('on', i < lit));
      time.textContent = audio && (!audio.paused || at() > 0) ? clock(at()) : clock(total);
      bars.setAttribute('aria-valuenow', String(Math.round(at())));
    }
    function loop() {
      paint();
      if (audio && !audio.paused) frame = requestAnimationFrame(loop);
    }
    function setPlaying(on) {
      root.classList.toggle('playing', on);
      playButton.replaceChildren(Icon(on ? 'pause' : 'play', 18));
      playButton.setAttribute('aria-label', on ? 'Pausar mensagem de áudio' : 'Tocar mensagem de áudio');
    }
    function load() {
      if (audio) return audio;
      audio = new Audio(url);
      audio.preload = 'auto';
      audio.playbackRate = SPEEDS[speed];
      setSinkId?.(audio);
      audio.onplay = () => {
        if (current && current !== api) current.pause();
        current = api;
        setPlaying(true);
        cancelAnimationFrame(frame);
        loop();
      };
      audio.onpause = () => { setPlaying(false); paint(); };
      audio.onended = () => { audio.currentTime = 0; setPlaying(false); paint(); if (current === api) current = null; };
      audio.onerror = () => { setPlaying(false); root.classList.add('failed'); time.textContent = 'Não carregou'; };
      return audio;
    }
    function seek(fraction) {
      const a = load();
      const go = () => { a.currentTime = Math.max(0, Math.min(1, fraction)) * (Number.isFinite(a.duration) ? a.duration : total); paint(); };
      if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
    }
    const api = { pause: () => audio?.pause() };

    playButton.onclick = () => {
      const a = load();
      if (a.paused) a.play().catch(() => setPlaying(false));
      else a.pause();
    };
    bars.onclick = (event) => {
      const rect = bars.getBoundingClientRect();
      seek((event.clientX - rect.left) / rect.width);
      if (audio.paused) audio.play().catch(() => {});
    };
    bars.onkeydown = (event) => {
      const step = { ArrowRight: 5, ArrowLeft: -5 }[event.key];
      if (!step) return;
      event.preventDefault();
      seek((at() + step) / total);
    };
    speedButton.onclick = () => {
      speed = (speed + 1) % SPEEDS.length;
      speedButton.textContent = SPEEDS[speed] + 'x';
      speedButton.setAttribute('aria-label', 'Velocidade ' + SPEEDS[speed] + 'x');
      root.classList.toggle('fast', speed > 0);
      if (audio) audio.playbackRate = SPEEDS[speed];
    };
    paint();
    return root;
  }

  return { supported, record, player, clock, waveform, MAX_SECONDS };
};
