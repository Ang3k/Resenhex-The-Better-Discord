// Enquetes do chat da chamada. Nascem no chat da sala de voz (o "+" do chat) e, enquanto estão
// abertas, aparecem num cartão por cima da chamada: quem está assistindo ou jogando vota com um toque,
// sem abrir o chat. Um voto por pessoa, que dá para trocar; as fotos mostram quem votou em quê.
// As regras ficam no servidor (server/polls.js); aqui é só a tela.
window.PollUI = ({ state, el, Icon, avatar, member, call, toast, Sounds, Motion, canManage }) => {
  const DURATIONS = [[60 * 1000, '1 min'], [5 * 60 * 1000, '5 min'], [0, 'Até encerrar']];
  const MAX_OPTIONS = 6;
  const SHOWN_VOTERS = 3;

  const isOpen = (poll, now = Date.now()) => !!poll && !poll.ended && (!poll.endsAt || poll.endsAt > now);
  const total = (poll) => poll.options.reduce((n, o) => n + o.votes.length, 0);
  const winners = (poll) => {
    const top = Math.max(0, ...poll.options.map((o) => o.votes.length));
    return top ? poll.options.flatMap((o, i) => (o.votes.length === top ? [i] : [])) : [];
  };
  const votes = (n) => n + (n === 1 ? ' voto' : ' votos');
  const clock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  // "termina em 3:12" enquanto corre; o relógio de baixo atualiza só esse texto, sem redesenhar.
  const timeLeft = (poll) => (poll.endsAt ? 'termina em ' + clock(poll.endsAt - Date.now()) : 'aberta até alguém encerrar');
  // short: só o relógio ("0:42"), para o cartão da chamada, onde a pergunta precisa do espaço.
  const timer = (poll, cls, short = false) => el('span', {
    class: cls,
    data: poll.endsAt && isOpen(poll) ? { pollEnds: String(poll.endsAt), ...(short ? { pollShort: '1' } : {}) } : {},
    textContent: short ? clock(poll.endsAt - Date.now()) : timeLeft(poll),
  });
  setInterval(() => {
    for (const node of document.querySelectorAll('[data-poll-ends]')) {
      const left = Number(node.dataset.pollEnds) - Date.now();
      node.textContent = node.dataset.pollShort ? clock(left) : left > 0 ? 'termina em ' + clock(left) : 'encerrando…';
    }
  }, 1000);

  const voters = (ids, cls) => {
    if (!ids.length) return null;
    const shown = ids.slice(-SHOWN_VOTERS).reverse();
    return el('span', { class: cls, ariaHidden: 'true' },
      shown.map((id) => avatar(member(id) || { name: '?', color: '#5c5e66' }, 'poll-avatar')),
      ids.length > SHOWN_VOTERS ? el('span', { class: 'poll-more', textContent: '+' + (ids.length - SHOWN_VOTERS) }) : null);
  };

  async function vote(channel, msg, option, viaCall = false) {
    const res = await call(viaCall ? 'poll:callVote' : 'poll:vote', { channel, id: msg.id, option });
    if (res?.error) toast(res.error, 'error');
  }

  async function endPoll(channel, msg) {
    const res = await call('poll:end', { channel, id: msg.id });
    if (res?.error) toast(res.error, 'error');
  }

  // As opções, iguais no chat e no cartão da chamada: a barra enche com a porcentagem, as fotos de quem
  // votou ficam à direita e a sua escolha ganha o contorno. Fechada, a vencedora fica em destaque.
  function optionList(msg, channel, { viaCall = false, cls = 'poll-options' } = {}) {
    const poll = msg.poll;
    const open = isOpen(poll);
    const sum = total(poll);
    const best = open ? [] : winners(poll);
    const me = state.me?.accountId;
    return el('div', { class: cls, role: 'group', ariaLabel: poll.question },
      poll.options.map((o, i) => {
        const pct = sum ? Math.round((o.votes.length / sum) * 100) : 0;
        const mine = o.votes.includes(me);
        const names = o.votes.map((id) => member(id)?.name || '?').join(', ');
        const button = el('button', {
          type: 'button',
          class: 'poll-option' + (mine ? ' mine' : '') + (best.includes(i) ? ' winner' : ''),
          disabled: !open,
          ariaPressed: String(mine),
          ariaLabel: `${o.text}: ${votes(o.votes.length)} (${pct}%)${names ? ', ' + names : ''}${mine ? '. Seu voto' : ''}`,
          ...(names ? { tip: names } : {}),
          onclick: (e) => { e.stopPropagation(); vote(channel, msg, i, viaCall); },
        },
        el('span', { class: 'poll-bar', ariaHidden: 'true' }),
        el('span', { class: 'poll-check', ariaHidden: 'true' }, mine || best.includes(i) ? Icon('check', 14) : null),
        el('span', { class: 'poll-text', textContent: o.text }),
        voters(o.votes, 'poll-voters'),
        el('span', { class: 'poll-count', textContent: sum ? pct + '%' : '' }));
        button.style.setProperty('--poll-pct', pct + '%');
        return button;
      }));
  }

  // A enquete dentro da mensagem do chat.
  function body(msg, channel) {
    const poll = msg.poll;
    const open = isOpen(poll);
    const sum = total(poll);
    const best = winners(poll);
    const foot = [el('span', { textContent: votes(sum) }), el('span', { class: 'poll-dot', ariaHidden: 'true', textContent: '·' })];
    if (open) foot.push(timer(poll, 'poll-time'));
    else foot.push(el('span', { textContent: best.length === 1 ? 'Encerrada: venceu ' + poll.options[best[0]].text : best.length ? 'Encerrada: empate' : 'Encerrada sem votos' }));
    const canEnd = open && (msg.authorId === state.me?.accountId || canManage());
    return el('div', { class: 'poll' + (open ? '' : ' ended') },
      el('div', { class: 'poll-head' }, el('span', { class: 'poll-icon', ariaHidden: 'true' }, Icon('poll', 16)), el('span', { class: 'poll-label', textContent: 'Enquete' })),
      el('div', { class: 'poll-question', textContent: poll.question }),
      optionList(msg, channel),
      el('div', { class: 'poll-foot' }, el('span', { class: 'poll-meta' }, foot),
        canEnd ? el('button', { type: 'button', class: 'poll-end', textContent: 'Encerrar', onclick: () => endPoll(channel, msg) }) : null));
  }

  // ---------------- criar ----------------
  function openCreator(channel) {
    let duration = 5 * 60 * 1000;
    const question = el('input', { type: 'text', class: 'poll-input', maxLength: 200, placeholder: 'O que você quer perguntar?', ariaLabel: 'Pergunta' });
    const list = el('div', { class: 'poll-creator-options' });
    const addBtn = el('button', { type: 'button', class: 'poll-add', onclick: () => addOption(true) }, Icon('plus', 16), el('span', { textContent: 'Adicionar opção' }));
    const error = el('div', { class: 'poll-error', role: 'alert' });
    const inputs = () => [...list.querySelectorAll('input')];
    const sync = () => {
      const all = inputs();
      all.forEach((input, i) => { input.placeholder = 'Opção ' + (i + 1); input.setAttribute('aria-label', 'Opção ' + (i + 1)); });
      list.querySelectorAll('.poll-remove').forEach((b) => { b.hidden = all.length <= 2; });
      addBtn.hidden = all.length >= MAX_OPTIONS;
    };
    function addOption(focus = false) {
      if (inputs().length >= MAX_OPTIONS) return null;
      const input = el('input', { type: 'text', class: 'poll-input', maxLength: 80 });
      // Enter passa para a próxima opção (ou cria uma), como numa lista.
      input.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        const all = inputs();
        const next = all[all.indexOf(input) + 1] || (input.value.trim() && addOption());
        if (next) next.focus(); else submit();
      };
      const row = el('div', { class: 'poll-creator-row' }, input,
        el('button', { type: 'button', class: 'poll-remove', ariaLabel: 'Tirar esta opção', onclick: () => { row.remove(); sync(); inputs().at(-1)?.focus(); } }, Icon('x', 16)));
      list.append(row);
      sync();
      if (focus) input.focus();
      return input;
    }
    addOption();
    addOption();
    question.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); inputs()[0].focus(); } };
    const durations = el('div', { class: 'poll-durations', role: 'radiogroup', ariaLabel: 'Duração' },
      DURATIONS.map(([ms, label]) => el('label', { class: 'poll-duration' },
        el('input', { type: 'radio', name: 'poll-duration', value: String(ms), checked: ms === duration, onchange: () => { duration = ms; } }),
        el('span', { textContent: label }))));
    const create = el('button', { type: 'button', class: 'btn-primary', textContent: 'Criar enquete', onclick: () => submit() });

    let busy = false;
    async function submit() {
      if (busy) return;
      const options = inputs().map((i) => i.value.trim()).filter(Boolean);
      if (!question.value.trim()) { error.textContent = 'Escreva a pergunta.'; question.focus(); return; }
      if (options.length < 2) { error.textContent = 'Escreva pelo menos 2 opções.'; inputs().find((i) => !i.value.trim())?.focus(); return; }
      busy = true;
      create.disabled = true;
      const res = await call('poll:create', { channel, question: question.value, options, duration });
      busy = false;
      create.disabled = false;
      if (res?.error) { error.textContent = res.error; return; }
      done();
    }
    const done = () => { Motion.leave(overlay); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } };
    const overlay = el('div', { class: 'confirm-overlay poll-overlay', onmousedown: (e) => e.target === overlay && done() },
      el('div', { class: 'confirm-card poll-creator', role: 'dialog', ariaModal: 'true', ariaLabel: 'Criar enquete' },
        el('h2', { textContent: 'Criar enquete' }),
        el('p', { class: 'poll-creator-hint', textContent: 'Ela aparece no chat e na tela da chamada, para todo mundo votar com um toque.' }),
        el('div', { class: 'poll-creator-body' },
          el('label', { class: 'poll-field-label', textContent: 'Pergunta' }), question,
          el('label', { class: 'poll-field-label', textContent: 'Opções' }), list, addBtn,
          el('label', { class: 'poll-field-label', textContent: 'Duração' }), durations,
          error),
        el('div', { class: 'confirm-actions' },
          el('button', { type: 'button', class: 'btn-ghost', textContent: 'Cancelar', onclick: () => done() }),
          create)));
    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);
    question.focus();
  }

  // ---------------- a enquete da chamada ----------------
  // A aberta (ou a que acabou de fechar, mostrando o resultado por uns segundos) na sala em que você está.
  let current = null; // { channel, msg }
  let fetchedFor = null;
  let resultTimer = 0;
  const collapsed = new Set(); // enquetes que a pessoa encolheu no cartão
  let onChange = () => {};

  const set = (next) => { current = next; onChange(); };

  async function syncCall() {
    const channel = state.voiceChannel && !String(state.voiceChannel).startsWith('dm-') ? state.voiceChannel : null;
    if (channel === fetchedFor) return;
    fetchedFor = channel;
    clearTimeout(resultTimer);
    set(null);
    if (!channel) return;
    const res = await call('poll:active', { channel });
    if (fetchedFor !== channel || !res?.msg) return;
    for (const a of res.authors || []) state.messageAuthors.set(a.id, a);
    set({ channel, msg: res.msg });
  }

  function onMessage(channel, msg) {
    if (!msg.poll || channel !== fetchedFor) return;
    clearTimeout(resultTimer);
    set({ channel, msg });
    if (msg.authorId !== state.me?.accountId) Sounds.play('pollOpen');
  }

  function onUpdate(channel, msg) {
    if (!msg.poll || channel !== fetchedFor) return;
    const was = current?.msg.id === msg.id ? current.msg.poll : null;
    if (!was && !isOpen(msg.poll)) return; // uma enquete antiga mexida no chat não volta para a chamada
    set({ channel, msg });
    // Acabou agora: o resultado fica no cartão por uns segundos, com o somzinho, e o cartão some.
    if (was && isOpen(was) && !isOpen(msg.poll)) {
      Sounds.play('pollEnd');
      clearTimeout(resultTimer);
      resultTimer = setTimeout(() => { if (current?.msg.id === msg.id) set(null); }, 6000);
    }
  }

  function onDelete(channel, id) {
    if (current?.channel === channel && current.msg.id === id) set(null);
  }

  // O cartão por cima da chamada. Encolhido, vira uma pílula com a pergunta e o tempo.
  function callCard() {
    if (!current) return null;
    const { channel, msg } = current;
    const poll = msg.poll;
    const open = isOpen(poll);
    const small = open && collapsed.has(msg.id);
    const best = winners(poll);
    const status = open ? (poll.endsAt ? timer(poll, 'cp-time', true) : el('span', { class: 'cp-time', textContent: votes(total(poll)) }))
      : el('span', { class: 'cp-time', textContent: best.length === 1 ? 'Venceu: ' + poll.options[best[0]].text : best.length ? 'Empate' : 'Sem votos' });
    const toggle = () => { if (collapsed.has(msg.id)) collapsed.delete(msg.id); else collapsed.add(msg.id); onChange(); };
    return el('div', { id: 'call-poll', class: (small ? 'small' : '') + (open ? '' : ' ended'), role: 'region', ariaLabel: 'Enquete: ' + poll.question },
      el('button', { type: 'button', class: 'cp-head', ariaExpanded: String(!small), ariaLabel: (small ? 'Mostrar' : 'Encolher') + ' a enquete', onclick: toggle },
        el('span', { class: 'cp-icon', ariaHidden: 'true' }, Icon('poll', 15)),
        el('span', { class: 'cp-question', textContent: poll.question }),
        status,
        el('span', { class: 'cp-chevron', ariaHidden: 'true' }, Icon(small ? 'chevronDown' : 'minimize', 14))),
      small ? null : optionList(msg, channel, { viaCall: true, cls: 'poll-options cp-options' }));
  }

  return {
    body, openCreator, syncCall, onMessage, onUpdate, onDelete, callCard,
    isOpen,
    hasOpenCallPoll: () => !!current && isOpen(current.msg.poll),
    myCallVote: () => current?.msg.poll.options.some((o) => o.votes.includes(state.me?.accountId)),
    preview: (msg) => '📊 Enquete: ' + msg.poll.question,
    onCallChange: (fn) => { onChange = fn; },
  };
};
