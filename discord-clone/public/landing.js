// Página inicial de quem chega pela primeira vez (o index.html decide antes de pintar).
// #entrar e #criar-conta abrem o cartão de login; Voltar do navegador volta para a página inicial.
(() => {
  const root = document.documentElement;
  const landing = document.getElementById('landing');
  const MODES = { '#entrar': 'login', '#criar-conta': 'register' };
  let lastTrigger = null;

  const ua = navigator.userAgent;
  const windows = /Windows NT/i.test(ua) && !/Mobile|Xbox/i.test(ua);
  const android = /Android/i.test(ua);
  for (const link of landing.querySelectorAll('.ld-download')) {
    link.classList.toggle('hidden', !windows && !android);
    if (android) link.lastChild.textContent = 'Baixar para Android';
  }
  // Sem app para o sistema de quem visita, abrir no navegador vira o botão principal.
  if (!windows && !android) for (const open of landing.querySelectorAll('.ld-open')) open.classList.replace('ld-btn-dark', 'ld-btn-light');

  function route() {
    const mode = MODES[location.hash];
    const authenticated = !!localStorage.getItem('token');
    const wasLanding = root.classList.contains('show-landing');
    const showLanding = root.dataset.landing === 'on' && !mode && !authenticated;
    root.classList.toggle('show-landing', showLanding);
    if (mode && !authenticated) window.dispatchEvent(new CustomEvent('resenhex:auth-mode', { detail: mode }));
    if (showLanding && !wasLanding) (lastTrigger || landing.querySelector('.ld-brand')).focus({ preventScroll: true });
  }
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  route();

  landing.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    const target = link.getAttribute('href');
    if (target === '#recursos') {
      const reduceMotion = root.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('recursos').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    if (!MODES[target]) return;
    lastTrigger = link;
    // Marca a entrada vinda daqui, para "Voltar ao início" desfazer o passo em vez de empilhar outro.
    history.pushState({ fromLanding: true }, '', target);
    route();
  });

  document.getElementById('login-back').addEventListener('click', (event) => {
    event.preventDefault();
    if (history.state?.fromLanding) return history.back();
    history.replaceState(null, '', location.pathname + location.search);
    route();
  });

  // As seções entram com um leve movimento quando aparecem na tela.
  const reveal = landing.querySelectorAll('.ld-row, .ld-final');
  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in-view'); seen.unobserve(entry.target); }
    }, { root: landing, threshold: 0.15 });
    reveal.forEach((node) => seen.observe(node));
  } else {
    reveal.forEach((node) => node.classList.add('in-view'));
  }

  const reduceMotion = () => root.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Chat da prévia ao vivo: a galera continua conversando enquanto o topo está na tela.
  const PEOPLE = {
    Lu: ['#1abc9c', '#1abc9c'],
    Duda: ['#9b59b6', '#b07cd6'],
    Caio: ['#e67e22', '#e89a4f'],
    Ju: ['#3498db', '#5dade2'],
  };
  const CHAT = [
    ['Ju', 'kkkkkkkk o Caio caiu no void de novo', '💀 3'],
    ['Caio', 'foi lag, juro'],
    ['Lu', 'lag mental né', '😂 4'],
    ['Duda', 'quem perder paga o açaí'],
    ['Ju', 'fechou, tô entrando'],
    ['Lu', 'Duda teu mic tá aberto, tamo ouvindo o miojo', '🍜 2'],
    ['Duda', 'não é miojo, é lámen 😤'],
    ['Caio', 'liga a câmera pra provar', '👀 3'],
  ];
  const chat = document.getElementById('ld-chat');
  const typingName = document.getElementById('ld-typing-name');
  let step = 0;
  let minute = 3;
  let chatTimer = null;
  let heroVisible = true;
  const chatRunning = () => root.classList.contains('show-landing') && heroVisible && !document.hidden && !reduceMotion();

  function postMessage() {
    const [who, text, reaction] = CHAT[step++ % CHAT.length];
    const [avatar, nameColor] = PEOPLE[who];
    const msg = document.createElement('div');
    msg.className = 'ld-msg ld-msg-live';
    const av = document.createElement('span');
    av.className = 'ld-av big';
    av.style.setProperty('--c', avatar);
    av.textContent = who[0];
    const body = document.createElement('div');
    const name = document.createElement('b');
    name.style.color = nameColor;
    name.textContent = who;
    const time = document.createElement('small');
    time.textContent = `hoje às 21:${String(minute++ % 60).padStart(2, '0')}`;
    const p = document.createElement('p');
    p.textContent = text;
    body.append(name, time, p);
    msg.append(av, body);
    chat.append(msg);
    while (chat.children.length > 6) chat.firstElementChild.remove();
    if (reaction) setTimeout(() => {
      const pill = document.createElement('span');
      pill.className = 'ld-react pop';
      pill.textContent = reaction;
      body.append(pill);
    }, 900);
    typingName.textContent = CHAT[step % CHAT.length][0];
  }
  function scheduleChat(delay = 2600 + Math.random() * 1600) {
    if (chatTimer || !chatRunning()) return;
    chatTimer = setTimeout(() => {
      chatTimer = null;
      if (!chatRunning()) return;
      postMessage();
      scheduleChat();
    }, delay);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      scheduleChat();
    }, { root: landing }).observe(landing.querySelector('.ld-preview'));
  }
  document.addEventListener('visibilitychange', () => scheduleChat());
  window.addEventListener('hashchange', () => scheduleChat(1200));
  scheduleChat(4200);

  // Soundboard de exemplo: as gravações do app (public/sfx) e dois sons sintetizados só daqui.
  let audio = null;
  function audioOut() {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const master = audio.createGain();
    master.gain.value = 0.45;
    master.connect(audio.destination);
    return master;
  }
  // hold: fração da duração em que o volume se mantém antes de cair.
  function tone(dest, { type = 'sine', freq, to, at = 0, dur, vol = 0.2, hold = 0 }) {
    const t = audio.currentTime + 0.02 + at;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    if (hold) gain.gain.setValueAtTime(vol, t + dur * hold);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return { osc, t };
  }
  function noise(dest, { at = 0, dur, vol = 0.2, type = 'highpass', freq = 6000, q = 0.7 }) {
    const t = audio.currentTime + 0.02 + at;
    const length = Math.ceil(audio.sampleRate * dur);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    src.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(dest);
    src.start(t);
  }
  function lowpass(dest, freq) {
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    filter.connect(dest);
    return filter;
  }
  function vibrato(osc, t, rate, depth) {
    const lfo = audio.createOscillator();
    const amount = audio.createGain();
    lfo.frequency.value = rate;
    amount.gain.value = depth;
    lfo.connect(amount).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + 2);
    return amount;
  }
  const SOUNDS = {
    badumtss(out) {
      noise(out, { dur: 0.16, vol: 0.5, type: 'bandpass', freq: 1800, q: 0.8 });
      tone(out, { type: 'triangle', freq: 230, to: 120, dur: 0.12, vol: 0.4 });
      tone(out, { freq: 170, to: 75, at: 0.17, dur: 0.32, vol: 0.7 });
      noise(out, { at: 0.42, dur: 1.3, vol: 0.32, freq: 5200 });
    },
    airhorn(out) {
      const horn = lowpass(out, 2600);
      for (const [at, dur] of [[0, 0.16], [0.2, 0.16], [0.4, 0.75]]) {
        for (const freq of [370, 466, 556]) tone(horn, { type: 'sawtooth', freq: freq * (1 + Math.random() * 0.006), at, dur, vol: 0.09, hold: 0.85 });
      }
    },
    sad(out) {
      const brass = lowpass(out, 950);
      const notes = [[311, 0, 0.34], [293.7, 0.36, 0.34], [277.2, 0.72, 0.34], [261.6, 1.08, 1.2]];
      notes.forEach(([freq, at, dur], i) => {
        const { osc, t } = tone(brass, { type: 'sawtooth', freq, at, dur, vol: 0.22, hold: 0.8 });
        if (i === notes.length - 1) vibrato(osc, t + 0.15, 5.5, 7);
      });
    },
    coin(out) {
      tone(out, { type: 'square', freq: 988, dur: 0.09, vol: 0.07, hold: 0.9 });
      tone(out, { type: 'square', freq: 1319, at: 0.08, dur: 0.5, vol: 0.07, hold: 0.3 });
    },
    boing(out) {
      const { osc, t } = tone(out, { type: 'triangle', freq: 140, to: 430, dur: 0.75, vol: 0.4, hold: 0.4 });
      const wobble = vibrato(osc, t, 16, 110);
      wobble.gain.setValueAtTime(110, t);
      wobble.gain.exponentialRampToValueAtTime(1, t + 0.75);
    },
    claps(out) {
      for (let i = 0; i < 26; i++) {
        const at = Math.random() ** 1.4 * 1.6;
        noise(out, { at, dur: 0.07, vol: 0.25 + Math.random() * 0.35, type: 'bandpass', freq: 1100 + Math.random() * 900, q: 1.2 });
      }
    },
  };

  const RECORDED = { badumtss: 'badumtss', airhorn: 'buzina', sad: 'fail', claps: 'aplausos' };
  const sounds = landing.querySelector('.ld-art-sounds');
  for (const pad of landing.querySelectorAll('.ld-pad')) {
    pad.addEventListener('click', (event) => {
      // Os pads que existem no app tocam a mesma gravação; os outros seguem sintetizados aqui.
      const recorded = RECORDED[pad.dataset.sound];
      if (!(recorded && window.Sounds?.playBoard(recorded, 0.9))) {
        try { SOUNDS[pad.dataset.sound](audioOut()); } catch {}
      }
      // Contorno e barra de progresso enquanto o som toca, como no soundboard do app.
      pad.classList.remove('playing');
      void pad.offsetWidth;
      pad.classList.add('playing');
      clearTimeout(pad.playingTimer);
      pad.playingTimer = setTimeout(() => pad.classList.remove('playing'), parseFloat(pad.style.getPropertyValue('--dur')) * 1000 || 1000);
      // Teclado não tem o :active do mouse; o botão afunda igual.
      if (event.detail === 0) {
        pad.classList.add('hit');
        setTimeout(() => pad.classList.remove('hit'), 140);
      }
      if (reduceMotion()) return;
      // O emoji sobe como uma reação.
      const box = sounds.getBoundingClientRect();
      const from = pad.getBoundingClientRect();
      const burst = document.createElement('span');
      burst.className = 'ld-burst';
      burst.textContent = pad.querySelector('.ld-pad-emoji').textContent;
      burst.style.left = `${from.left - box.left + from.width / 2}px`;
      burst.style.top = `${from.top - box.top + from.height / 3}px`;
      burst.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 40)}px`);
      burst.style.setProperty('--dy', `${Math.round(70 + Math.random() * 30)}px`);
      burst.addEventListener('animationend', () => burst.remove());
      sounds.append(burst);
    });
  }
})();
