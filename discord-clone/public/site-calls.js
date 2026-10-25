// Painel do dono do Resenhex: quem está em chamada agora, em qual servidor e sala.
// Só pergunta ao servidor enquanto a seção está à vista (Configurações abertas e a aba do navegador visível).
window.SiteCalls = function ({ request, el, avatar }) {
  const root = document.querySelector('#site-calls');
  const page = document.querySelector('#page-calls');
  const settings = document.querySelector('#settings');
  const EVERY_MS = 4000;
  let timer = null;
  let lastKey = '';

  const visible = () => !settings.classList.contains('hidden') && !page.classList.contains('hidden') && !document.hidden;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const initials = (name) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const count = (server) => server.rooms.reduce((sum, room) => sum + room.people.length, 0);

  function elapsed(since) {
    const min = Math.floor((Date.now() - since) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), rest = min % 60;
    return rest ? `${h} h ${String(rest).padStart(2, '0')} min` : `${h} h`;
  }

  function person(p) {
    const flags = el('span', { class: 'flags' });
    if (p.sharing) flags.append(el('span', { class: 'live', textContent: 'AO VIVO', tip: 'Transmitindo a tela' }));
    if (p.camera) flags.append(el('span', { tip: 'Câmera ligada' }, Icon('camera', 16)));
    if (p.muted) flags.append(el('span', { tip: 'Mutado' }, Icon('micOff', 16)));
    if (p.deafened) flags.append(el('span', { tip: 'Ensurdecido' }, Icon('headphonesOff', 16)));
    const since = p.since ? new Date(p.since) : null;
    return el('li', { class: 'site-calls-person' },
      avatar(p, 'small'),
      el('span', { class: 'name' }, p.name, p.username !== p.name ? el('small', { textContent: p.username }) : null),
      flags,
      since ? el('time', { class: 'site-calls-time', dateTime: since.toISOString(), data: { since: p.since },
        tip: 'Entrou às ' + since.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }) : null);
  }

  function serverCard(server) {
    return el('article', { class: 'site-calls-server' },
      el('header', {},
        el('div', { class: 'site-calls-icon' }, server.icon ? el('img', { src: server.icon, alt: '', decoding: 'async', draggable: false }) : initials(server.name || '?')),
        el('h3', { textContent: server.name }),
        el('span', { class: 'site-calls-count', textContent: plural(count(server), 'pessoa', 'pessoas') })),
      ...server.rooms.map((room) => el('div', { class: 'site-calls-room', role: 'group', ariaLabel: `${room.name}, em ${server.name}` },
        el('div', { class: 'site-calls-room-name' }, Icon('volume', 16), el('span', { textContent: room.name })),
        el('ul', {}, room.people.map(person)))));
  }

  function draw({ servers, private: hidden, online }) {
    const people = servers.reduce((sum, server) => sum + count(server), 0) + hidden.people;
    const summary = people
      ? [plural(people, 'pessoa em chamada', 'pessoas em chamada'), servers.length ? plural(servers.length, 'servidor', 'servidores') : null, plural(online, 'online agora', 'online agora')]
      : ['Ninguém em chamada agora', plural(online, 'pessoa online', 'pessoas online')];
    // replaceChildren escreve "null" na tela: sem chamadas privadas, o aviso nem entra na lista.
    root.replaceChildren(
      el('p', { class: 'site-calls-summary', textContent: summary.filter(Boolean).join(' · ') }),
      ...servers.map(serverCard),
      ...(hidden.people ? [el('div', { class: 'settings-callout' }, el('span', {}, Icon('lock')),
        el('div', {},
          el('strong', { textContent: `${plural(hidden.calls, 'chamada privada', 'chamadas privadas')} · ${plural(hidden.people, 'pessoa', 'pessoas')}` }),
          el('p', { textContent: 'Chamadas entre amigos entram só na contagem, sem dizer quem está nelas.' })))] : []));
  }

  function render(res) {
    if (res.error) {
      lastKey = '';
      root.replaceChildren(el('p', { class: 'hint', textContent: res.error }));
      return;
    }
    const key = JSON.stringify(res);
    if (key !== lastKey) { lastKey = key; draw(res); }
    for (const node of root.querySelectorAll('[data-since]')) node.textContent = elapsed(Number(node.dataset.since));
  }

  async function tick() {
    clearTimeout(timer);
    timer = null;
    if (!visible()) return;
    if (!lastKey) root.replaceChildren(el('p', { class: 'hint', textContent: 'Carregando as chamadas…' }));
    const res = await request('site:calls');
    if (!visible()) return;
    render(res);
    clearTimeout(timer);
    timer = setTimeout(tick, EVERY_MS);
  }

  settings.addEventListener('settings-section', (event) => { if (event.detail === 'calls') tick(); });
  document.addEventListener('visibilitychange', () => { if (!timer) tick(); });
};
