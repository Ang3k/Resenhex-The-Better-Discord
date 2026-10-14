// Som do DJ no app de Android (DjService, processo :dj do app). Com o microfone da call aberto, o
// WebView do app manda tudo que toca para a faixa da ligação; aqui, num processo sem microfone, a
// música sai como mídia. O site da call (music.js) manda a faixa, o ponto dela e o volume; esta página
// mantém o player do YouTube nesse ponto e conta de volta quando a música toca, acaba ou dá erro.
(() => {
  let player = null;
  let ready = false;
  let want = null; // { on, trackId, videoId, live, duration, position, at, paused, volume, muted }
  let loaded = null; // faixa carregada no player
  let lastSeek = 0;
  let api = null;

  const report = (data) => { try { window.ResenhexDj?.report(JSON.stringify(data)); } catch {} };
  // Ponto da música agora: a posição chega junto com a hora (do aparelho) em que foi medida.
  const target = (s) => (s.paused ? s.position : s.position + (Date.now() - s.at) / 1000);

  function loadApi() {
    if (window.YT?.Player) return Promise.resolve();
    api ||= new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = resolve;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { api = null; script.remove(); reject(new Error('api')); };
      document.head.append(script);
    });
    return api;
  }

  function create() {
    if (player) return;
    player = new YT.Player('player', {
      width: '100%', height: '100%',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => { ready = true; drive(); },
        onStateChange: (e) => {
          if (!want?.on || want.trackId !== loaded) return;
          if (e.data === YT.PlayerState.ENDED) report({ type: 'ended', trackId: loaded });
          if (e.data === YT.PlayerState.PLAYING) report({ type: 'playing', trackId: loaded, duration: player.getDuration() || 0 });
        },
        onError: (e) => { if (want?.on && want.trackId === loaded) report({ type: 'error', trackId: loaded, code: e.data }); },
      },
    });
  }

  // Leva o player para o ponto da sala: troca de música, pausa, volume e correção de atraso.
  function drive() {
    const s = want;
    if (!ready) return;
    if (!s?.on) {
      if (loaded) player.stopVideo();
      loaded = null;
      return;
    }
    const at = target(s);
    if (loaded !== s.trackId) {
      loaded = s.trackId;
      lastSeek = Date.now();
      const options = { videoId: s.videoId, ...(s.live ? {} : { startSeconds: at }) };
      if (s.paused) player.cueVideoById(options); else player.loadVideoById(options);
    }
    if (s.muted) player.mute(); else player.unMute();
    player.setVolume(s.volume);
    const now = player.getPlayerState();
    const S = YT.PlayerState;
    if (s.paused) {
      if (now === S.PLAYING || now === S.BUFFERING) player.pauseVideo();
      if (!s.live && Math.abs(player.getCurrentTime() - at) > 1 && Date.now() - lastSeek > 1500) { lastSeek = Date.now(); player.seekTo(at, true); }
      return;
    }
    if (s.duration && at > s.duration) return; // acabou aqui; o servidor já vai trocar
    if (now !== S.PLAYING && now !== S.BUFFERING) player.playVideo();
    else if (!s.live && now === S.PLAYING && Date.now() - lastSeek > 3000 && Math.abs(player.getCurrentTime() - at) > 1) {
      lastSeek = Date.now();
      player.seekTo(at, true);
    }
  }

  window.DjSom = {
    apply(json) {
      try { want = typeof json === 'string' ? JSON.parse(json) : json; } catch { return; }
      if (want?.on && !player) loadApi().then(create).catch(() => report({ type: 'error', trackId: want?.trackId, code: 'api' }));
      drive();
    },
  };
  let ticks = 0;
  setInterval(() => {
    drive();
    // A cada 2 s conta onde o som está: o vídeo (mudo) na tela do app acompanha este ponto.
    if (++ticks % 2 === 0 && ready && loaded && want?.on && player.getPlayerState() === YT.PlayerState.PLAYING) {
      report({ type: 'time', trackId: loaded, time: player.getCurrentTime(), at: Date.now() });
    }
  }, 1000);
})();
