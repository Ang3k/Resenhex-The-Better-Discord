// Overlay de voz em jogos (janela do app de desktop por cima do jogo).
// O app manda o resumo da chamada: { channel, users: [{ id, name, color, avatarUrl, avatarCrop, speaking,
// muted, deafened, serverMuted, serverDeafened }], more, style: { opacity, names, show, animated } } e esta página só desenha.
// O app 1.1.3 não repassa o style; aí vale o padrão (todos, com nome, opaco e animado).
(() => {
  const bridge = window.resenhexOverlay;
  const list = document.getElementById('overlay-list');
  const rows = new Map(); // id -> { node, key }

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  // Mesmo enquadramento da foto de perfil no site (PhotoEditor.style).
  function frame(image, crop) {
    if (!crop) return;
    Object.assign(image.style, { objectPosition: `${crop.x * 100}% ${crop.y * 100}%`, transformOrigin: `${crop.x * 100}% ${crop.y * 100}%`, transform: `scale(${crop.zoom})` });
  }

  // Foto parada: o primeiro quadro do GIF vira uma imagem fixa (a foto vem do próprio site, então o canvas pode ler).
  function freeze(image) {
    const still = () => {
      if (image.dataset.still || !image.naturalWidth) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        image.dataset.still = '1';
        image.src = canvas.toDataURL('image/png');
      } catch { image.style.visibility = ''; /* fica como veio */ }
    };
    if (image.complete) still(); else image.addEventListener('load', still, { once: true });
  }

  function avatar(user, animated) {
    const node = el('span', 'ov-avatar');
    node.style.background = user.color;
    if (user.avatarUrl) {
      const image = el('img');
      image.alt = '';
      image.src = user.avatarUrl;
      frame(image, user.avatarCrop);
      image.onerror = () => node.replaceChildren(initials(user.name));
      if (!animated) {
        image.style.visibility = 'hidden'; // até virar a imagem parada, para não mostrar um instante animado
        image.addEventListener('load', () => { if (image.dataset.still) image.style.visibility = ''; });
        freeze(image);
      }
      node.append(image);
    } else node.textContent = initials(user.name);
    return node;
  }

  function flag(name, server) {
    const icon = Icon(name, 14);
    if (server) icon.classList.add('server');
    return icon;
  }

  // Linhas reaproveitadas por pessoa: a foto não pisca a cada mudança de quem fala.
  function row(user, style) {
    const key = [user.name, user.color, user.avatarUrl, JSON.stringify(user.avatarCrop), style.animated].join('|');
    let entry = rows.get(user.id);
    if (!entry || entry.key !== key) {
      const node = el('li', 'ov-user');
      const face = el('span', 'ov-face');
      face.append(avatar(user, style.animated), el('span', 'ov-badge'));
      const label = el('span', 'ov-label');
      label.append(el('span', 'ov-name', user.name), el('span', 'ov-flags'));
      node.append(face, label);
      entry = { node, key };
      rows.set(user.id, entry);
    }
    const micOff = !!(user.serverMuted || user.muted), deaf = !!(user.serverDeafened || user.deafened);
    entry.node.classList.toggle('speaking', !!user.speaking);
    entry.node.classList.toggle('silent', micOff || deaf);
    const flagsKey = `${+user.muted}${+user.serverMuted}${+user.deafened}${+user.serverDeafened}`;
    const flagsNode = entry.node.querySelector('.ov-flags');
    if (flagsNode.dataset.key !== flagsKey) {
      flagsNode.dataset.key = flagsKey;
      const flags = [];
      if (micOff) flags.push(flag('micOff', user.serverMuted));
      if (deaf) flags.push(flag('headphonesOff', user.serverDeafened));
      flagsNode.replaceChildren(...flags);
      // Sem os nomes, o ícone mais forte (ensurdecido vence mutado) vira um selo na foto.
      const badge = entry.node.querySelector('.ov-badge');
      badge.replaceChildren(...(deaf ? [flag('headphonesOff', user.serverDeafened)] : micOff ? [flag('micOff', user.serverMuted)] : []));
      badge.classList.toggle('on', micOff || deaf);
    }
    entry.node.setAttribute('aria-label', user.name + (user.speaking ? ', falando' : '') + (micOff ? ', mutado' : '') + (deaf ? ', ensurdecido' : ''));
    return entry.node;
  }

  // "Só quem fala": quem para de falar fica mais um pouco, para a lista não piscar entre uma frase e outra.
  const LINGER_MS = 1500;
  const spokeAt = new Map(); // id -> última vez que estava falando
  let last = null;
  let lingerTimer = 0;
  const silenced = (user) => user.muted || user.serverMuted || user.deafened || user.serverDeafened;
  function visible(users, show) {
    const now = Date.now();
    for (const user of users) if (user.speaking) spokeAt.set(user.id, now);
    clearTimeout(lingerTimer);
    if (show === 'unmuted') return users.filter((user) => !silenced(user));
    if (show !== 'speaking') return users;
    const shown = users.filter((user) => user.speaking || now - (spokeAt.get(user.id) || -Infinity) < LINGER_MS);
    const next = Math.min(...shown.filter((user) => !user.speaking).map((user) => spokeAt.get(user.id) + LINGER_MS - now));
    if (Number.isFinite(next)) lingerTimer = setTimeout(() => render(last), Math.max(50, next));
    return shown;
  }

  const DEFAULT_STYLE = { opacity: 1, names: true, show: 'all', animated: true };
  function render(state) {
    last = state;
    const style = { ...DEFAULT_STYLE, ...state?.style };
    document.documentElement.style.setProperty('--ov-opacity', String(style.opacity));
    list.classList.toggle('names-off', !style.names);
    const all = state?.users || [];
    const ids = new Set(all.map((user) => user.id));
    for (const id of rows.keys()) if (!ids.has(id)) rows.delete(id);
    for (const id of spokeAt.keys()) if (!ids.has(id)) spokeAt.delete(id);
    const nodes = visible(all, style.show).map((user) => row(user, style));
    if (state?.more) nodes.push(el('li', 'ov-more', `+${state.more}`));
    // Só mexe no que mudou: recolocar uma linha reinicia a animação de entrada dela.
    nodes.forEach((node, i) => { if (list.children[i] !== node) list.insertBefore(node, list.children[i] || null); });
    while (list.children.length > nodes.length) list.lastChild.remove();
    report();
  }
  function report() {
    const box = list.getBoundingClientRect();
    bridge?.resize(Math.ceil(box.width), Math.ceil(box.height));
  }

  if (bridge) {
    // A fonte carrega depois do primeiro desenho e muda a altura das linhas.
    document.fonts?.ready.then(report);
    bridge.onState(render);
  } else if (new URLSearchParams(location.search).has('demo')) {
    document.documentElement.classList.add('demo');
    const users = [
      { id: '1', name: 'Angel', color: '#5865f2', speaking: true },
      { id: '2', name: 'Fulano com nome bem comprido demais', color: '#eb459e' },
      { id: '3', name: 'Mutado', color: '#3ba55c', muted: true },
      { id: '4', name: 'Ensurdecido', color: '#faa61a', muted: true, deafened: true },
      { id: '5', name: 'Silenciado', color: '#ed4245', serverMuted: true },
    ];
    // Aparência pelo endereço, ex.: ?demo&opacity=0.5&names=0&show=speaking&animated=0
    const query = new URLSearchParams(location.search);
    const style = { opacity: Number(query.get('opacity')) || 1, names: query.get('names') !== '0', show: query.get('show') || 'all', animated: query.get('animated') !== '0' };
    render({ users, style });
    // Alterna quem fala, para ver o anel verde mudando.
    let turn = 0;
    setInterval(() => { turn = (turn + 1) % 2; render({ users: users.map((user, i) => ({ ...user, speaking: i === turn })), style }); }, 1200);
  }
})();
