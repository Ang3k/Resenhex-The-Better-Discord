// Chamada nas conversas privadas: o toque (janela de atender e faixa no chat), o som de quem
// está ligando, a mensagem de chamada no histórico e o bloco de quem ainda não entrou.
// A chamada em si é a mesma das salas de voz (app.js); aqui fica só o que é próprio do privado.
window.DmCallUI = ({ state, el, Icon, avatar, person, call, toast, Sounds, join, openDm, openProfile }) => {
  const rings = new Map(); // conversa -> conta de quem está ligando
  let stopRingSound = null;
  let stopRingback = null;
  let notification = null;

  const peerOf = (dm) => person(dm.slice(3).split('-').find((x) => x !== state.me?.accountId));
  const ringing = (dm) => rings.has(dm);

  // ---------------- toque recebido ----------------
  function onRing({ dm, from }) {
    if (state.voiceChannel === dm) return; // outra sessão minha já está na chamada
    rings.set(dm, from);
    stopRingSound ||= Sounds.loop('ring', 2600);
    showOverlay();
    notifySystem(dm, from);
    window.resenhexDesktop?.flash?.();
  }

  function onRingStop({ dm }) {
    if (!rings.delete(dm)) return;
    if (!rings.size) { stopRingSound?.(); stopRingSound = null; }
    notification?.close();
    showOverlay();
  }

  const answer = async (dm, video = false) => {
    onRingStop({ dm });
    await join(dm, { video });
  };
  const decline = (dm) => {
    onRingStop({ dm });
    call('dm:ring:decline', { dm });
  };

  function notifySystem(dm, from) {
    if (!state.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    notification = new Notification(`${person(from)?.name || 'Alguém'} está ligando`, { body: 'Chamada no Resenhex. Clique para atender.', tag: 'call:' + dm, silent: true, requireInteraction: true });
    notification.onclick = () => {
      window.focus();
      window.resenhexDesktop?.focus();
      openDm(dm);
      notification?.close();
    };
  }

  // Janela "X está ligando…" no canto, em qualquer tela do app. Mostra a ligação mais recente.
  function showOverlay() {
    let box = document.getElementById('incoming-call');
    const latest = [...rings].at(-1);
    if (!latest) { box?.remove(); return; }
    const [dm, from] = latest;
    const caller = person(from);
    if (!caller) return;
    if (box?.dataset.dm === dm) return;
    box?.remove();
    box = el('div', { id: 'incoming-call', class: 'incoming-call', role: 'alertdialog', ariaLabelledby: 'incoming-call-name', data: { dm } },
      el('div', { class: 'ic-avatar' }, el('span', { class: 'ic-pulse' }), avatar(caller)),
      el('div', { class: 'ic-text' },
        el('strong', { id: 'incoming-call-name', textContent: caller.name }),
        el('span', { textContent: 'está ligando…' })),
      el('div', { class: 'ic-actions' },
        el('button', { type: 'button', class: 'ic-btn decline', tip: 'Recusar', ariaLabel: 'Recusar chamada', onclick: () => decline(dm) }, Icon('phone', 22)),
        el('button', { type: 'button', class: 'ic-btn video', tip: 'Atender com vídeo', ariaLabel: 'Atender com vídeo', onclick: () => answer(dm, true) }, Icon('camera', 22)),
        el('button', { type: 'button', class: 'ic-btn accept', tip: 'Atender', ariaLabel: 'Atender chamada', onclick: () => answer(dm) }, Icon('phone', 22))));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') decline(dm); });
    document.body.append(box);
    box.querySelector('.ic-btn.accept').focus({ preventScroll: true });
  }

  // Faixa no topo do chat da conversa: alguém ligando ou uma chamada acontecendo sem mim.
  function banner(dm) {
    if (state.voiceChannel === dm) return null;
    const peer = peerOf(dm);
    if (!peer) return null;
    if (ringing(dm)) {
      return el('div', { class: 'dm-call-banner ringing' },
        el('span', { class: 'dcb-icon' }, Icon('phone', 18)),
        el('span', { class: 'dcb-text' }, el('strong', { textContent: peer.name }), ' está ligando para você'),
        el('button', { type: 'button', class: 'dcb-btn ghost', textContent: 'Recusar', onclick: () => decline(dm) }),
        el('button', { type: 'button', class: 'dcb-btn', onclick: () => answer(dm) }, Icon('phone', 16), 'Atender'));
    }
    const open = (state.messages[dm] || []).findLast((m) => m.call);
    if (open && !open.call.endedAt && Date.now() - open.call.startedAt < 12 * 3600_000) {
      return el('div', { class: 'dm-call-banner' },
        el('span', { class: 'dcb-icon' }, Icon('phone', 18)),
        el('span', { class: 'dcb-text' }, 'Há uma chamada acontecendo nesta conversa'),
        el('button', { type: 'button', class: 'dcb-btn', onclick: () => join(dm) }, Icon('phone', 16), 'Entrar'));
    }
    return null;
  }

  // ---------------- quem ligou e está esperando ----------------
  // Toque de espera enquanto o amigo ainda não atendeu.
  function syncRingback(info) {
    const waiting = !!info?.dm && info.ringing && info.voice.length === 1;
    if (waiting && !stopRingback) stopRingback = Sounds.loop('ringback', 3200);
    if (!waiting && stopRingback) { stopRingback(); stopRingback = null; }
  }

  // Bloco de quem ainda não entrou: "Chamando…" com pulso, ou "Não atendeu" e Ligar de novo.
  function pendingTile(stage, info) {
    if (!info?.dm || info.voice.some((v) => v.accountId === info.peerId)) return null;
    const peer = info.members.find((m) => m.id === info.peerId);
    if (!peer) return null;
    const key = 'dm-pending';
    let tile = stage.querySelector(`[data-key="${key}"]`);
    if (!tile) {
      tile = el('div', { class: 'tile dm-pending', data: { key }, style: { '--tile': peer.color } },
        el('div', { class: 'dp-avatar' }, el('span', { class: 'ic-pulse' }), avatar(peer)),
        el('div', { class: 'dp-status' }), el('div', { class: 'label' }));
      stage.append(tile);
    }
    tile.classList.toggle('ringing', info.ringing);
    tile.querySelector('.label').textContent = peer.name;
    const status = tile.querySelector('.dp-status');
    const mode = info.ringing ? 'ringing' : 'idle';
    if (status.dataset.mode !== mode) {
      status.dataset.mode = mode;
      status.replaceChildren(info.ringing
        ? el('span', { textContent: 'Chamando…' })
        : el('button', { type: 'button', class: 'watch-btn', onclick: (e) => { e.stopPropagation(); call('dm:ring', { dm: info.channel.id }); } }, Icon('phone', 16), 'Ligar de novo'));
    }
    return key;
  }

  // ---------------- mensagem de chamada ----------------
  function duration(ms) {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return 'alguns segundos';
    if (minutes < 60) return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const h = hours === 1 ? '1 hora' : `${hours} horas`;
    return rest ? `${h} e ${rest === 1 ? '1 minuto' : `${rest} minutos`}` : h;
  }

  function messageNode(msg, { channel, time, stamp }) {
    const me = state.me.accountId;
    const caller = person(msg.authorId);
    const callerName = msg.authorId === me ? 'Você' : caller?.name || 'Alguém';
    const { endedAt, joined, startedAt } = msg.call;
    const missed = !!endedAt && joined.length < 2;
    let text;
    if (!endedAt) text = [strongName(caller, callerName), ' iniciou uma chamada.'];
    else if (missed && msg.authorId !== me) text = ['Você perdeu uma chamada de ', strongName(caller, callerName), '.'];
    else if (missed) text = ['Você ligou para ', strongName(peerOf(channel), peerOf(channel)?.name || 'a outra pessoa'), ', mas ninguém atendeu.'];
    else text = [strongName(caller, callerName), ` iniciou uma chamada que durou ${duration(endedAt - startedAt)}.`];
    const live = !endedAt && state.voiceChannel !== channel;
    return el('div', { class: 'msg system-msg call-msg' + (missed ? ' missed' : '') + (!endedAt ? ' ongoing' : ''), data: { id: msg.id } },
      el('span', { class: 'system-icon' }, Icon('phone', 18)),
      el('div', { class: 'system-text' }, ...text, ' ', el('span', { class: 'system-time', textContent: time, tip: stamp }),
        live ? el('button', { type: 'button', class: 'system-join', textContent: 'Entrar na chamada', onclick: () => join(channel) }) : null));
  }
  function strongName(member, name) {
    if (!member || name === 'Você') return el('strong', { textContent: name });
    return el('strong', { class: 'system-name', textContent: name, onclick: (e) => openProfile(member.id, e.currentTarget) });
  }

  return { onRing, onRingStop, ringing, banner, syncRingback, pendingTile, messageNode, answer, decline };
};
