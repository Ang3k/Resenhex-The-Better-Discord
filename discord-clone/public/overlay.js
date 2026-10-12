// Overlay de voz em jogos (janela do app de desktop por cima do jogo).
// O app manda o resumo da chamada: { channel, users: [{ id, name, color, avatarUrl, avatarCrop, speaking,
// muted, deafened, serverMuted, serverDeafened }], more } e esta página só desenha.
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

  function avatar(user) {
    const node = el('span', 'ov-avatar');
    node.style.background = user.color;
    if (user.avatarUrl) {
      const image = el('img');
      image.alt = '';
      image.src = user.avatarUrl;
      frame(image, user.avatarCrop);
      image.onerror = () => node.replaceChildren(initials(user.name));
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
  function row(user) {
    const key = [user.name, user.color, user.avatarUrl, JSON.stringify(user.avatarCrop)].join('|');
    let entry = rows.get(user.id);
    if (!entry || entry.key !== key) {
      const node = el('li', 'ov-user');
      const label = el('span', 'ov-label');
      label.append(el('span', 'ov-name', user.name), el('span', 'ov-flags'));
      node.append(avatar(user), label);
      entry = { node, key };
      rows.set(user.id, entry);
    }
    const micOff = user.serverMuted || user.muted, deaf = user.serverDeafened || user.deafened;
    entry.node.classList.toggle('speaking', user.speaking);
    entry.node.classList.toggle('silent', micOff || deaf);
    const flags = [];
    if (micOff) flags.push(flag('micOff', user.serverMuted));
    if (deaf) flags.push(flag('headphonesOff', user.serverDeafened));
    const flagsNode = entry.node.querySelector('.ov-flags');
    const flagsKey = `${+user.muted}${+user.serverMuted}${+user.deafened}${+user.serverDeafened}`;
    if (flagsNode.dataset.key !== flagsKey) { flagsNode.dataset.key = flagsKey; flagsNode.replaceChildren(...flags); }
    entry.node.setAttribute('aria-label', user.name + (user.speaking ? ', falando' : '') + (micOff ? ', mutado' : '') + (deaf ? ', ensurdecido' : ''));
    return entry.node;
  }

  function render(state) {
    const users = state?.users || [];
    const ids = new Set(users.map((user) => user.id));
    for (const id of rows.keys()) if (!ids.has(id)) rows.delete(id);
    const nodes = users.map(row);
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
    render({ users });
    // Alterna quem fala, para ver o anel verde mudando.
    let turn = 0;
    setInterval(() => { turn = (turn + 1) % 2; render({ users: users.map((user, i) => ({ ...user, speaking: i === turn })) }); }, 1200);
  }
})();
