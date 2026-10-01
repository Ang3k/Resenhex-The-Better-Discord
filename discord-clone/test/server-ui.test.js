const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

// Run the real UI scripts against a deterministic socket contract, without opening
// a browser, contacting a website or granting microphone/camera permissions.
const publicDir = path.join(__dirname, '..', 'public');
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const userId = 'a'.repeat(16);
const person = { id: userId, name: 'Ana', color: '#5865f2', roles: [], online: true, timeoutUntil: 0 };
const code = 'a'.repeat(24);
const snapshot = (id, name, servers) => ({ serverId: id, serverName: name, ownerId: userId, serverIcon: null, servers,
  roles: [{ id: 'everyone', name: '@everyone', perms: [] }], channels: id ? [{ id: id + '-chat', name: 'geral', type: 'text', topic: '', categoryId: 'text', private: false, allowedRoles: [] }] : [],
  categories: id ? [{ id: 'text', name: 'Texto' }] : [], members: id ? [person] : [], people: [person], voice: [], bans: [], myPerms: id ? ['ADMIN', 'MANAGE_CHANNELS', 'SEND_MESSAGES', 'CONNECT', 'STREAM', 'KICK', 'BAN', 'MANAGE_ROLES', 'TIMEOUT', 'MUTE_MEMBERS'] : [] });

async function ui(t, invited = false, options = {}) {
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'), {
    url: 'https://resenhex.test/' + (invited ? '?invite=' + code : '') + (options.hash || ''), runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'userAgent', { value: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
  if (options.name) w.localStorage.setItem('name', options.name);
  if (options.token) w.localStorage.setItem('token', options.token);
  if (options.desktop) w.resenhexDesktop = { onPushToTalk() {}, setPushToTalk() {} };
  // Include the pre-paint decision and the landing script, in the HTML's real order.
  for (const script of w.document.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  const events = [], handlers = new Map();
  const servers = [];
  let current = snapshot(null, '', servers);
  const push = () => handlers.get('state')?.(structuredClone(current));
  const socket = {
    connected: false, active: false, on(event, handler) { handlers.set(event, handler); },
    connect() { this.connected = true; }, disconnect() { this.connected = false; }, timeout() { return this; },
    emit(event, payload, callback) {
      events.push({ event, payload });
      queueMicrotask(() => {
        let result = { ok: true };
        if (event === 'auth') {
          if (payload.token && options.expiredToken) { callback?.({ error: 'Sessão expirada.' }); return; }
          if (payload.mode === 'register' && payload.confirmPassword !== payload.password) { callback?.({ error: 'As senhas não coincidem.' }); return; }
          result = { token: 'fake-ui-token', accountId: userId, sid: 'ui-socket', iceServers: [], permNames: {}, maxUploadMb: 25 };
          callback?.(result); handlers.get('social')?.({ friends: [], incoming: [], outgoing: [], blocked: [], dms: [] }); push(); return;
        }
        if (event === 'server:create') {
          const id = 'server-' + (servers.length + 1);
          servers.push({ id, name: payload.name, icon: null, owner: true });
          current = snapshot(id, payload.name, servers); result = { id }; push();
        } else if (event === 'server:select') {
          const server = servers.find((s) => s.id === payload.id);
          current = snapshot(server.id, server.name, servers); push();
        } else if (event === 'server:delete') {
          servers.splice(servers.findIndex((s) => s.id === payload.id), 1);
          current = snapshot(servers[0]?.id || null, servers[0]?.name || '', servers); push();
        } else if (event === 'server:invite') result = { code, name: current.serverName };
        else if (event === 'server:join') {
          if (!servers.some((s) => s.id === 'invited')) servers.push({ id: 'invited', name: 'Turma convidada', icon: null, owner: false });
          current = snapshot('invited', 'Turma convidada', servers); result = { id: 'invited' }; push();
        } else if (event === 'chat:unread') result = { unread: {} };
        else if (event === 'chat:history') result = { messages: [] };
        callback?.(null, result);
      });
    },
  };
  w.io = () => socket;
  w.structuredClone = structuredClone;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.Element.prototype.scrollTo = function () {};
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.load = function () {};
  let releaseConfig;
  const configReady = options.deferConfig ? new Promise((resolve) => { releaseConfig = resolve; }) : Promise.resolve();
  w.fetch = async (url) => {
    if (url === '/config') await configReady;
    return { json: async () => url === '/config' ? { hasOwner: options.hasOwner ?? true, passwordRequired: false, maxUploadMb: 25 } : { id: 'invited', name: 'Turma convidada', members: 3, icon: null } };
  };
  let copied = '';
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (text) => { copied = text; } } });
  for (const file of ['icons.js', 'format.js', 'sounds.js', 'media-policy.js', 'keybinds.js', 'settings.js', 'photo-editor.js', 'media-session.js', 'mobile-stream.js', 'changelog.js', 'channel-navigation.js', 'music.js', 'app.js', 'landing.js']) w.eval(fs.readFileSync(path.join(publicDir, file), 'utf8'));
  w.localStorage.setItem('seenVersion', w.APP_VERSION);
  t.after(() => { dom.window.close(); assert.deepEqual(errors.map((e) => e.message), []); });
  await settle();
  const d = w.document;
  const clickText = async (text) => { const element = [...d.querySelectorAll('button, a')].find((el) => el.textContent.trim() === text); assert.ok(element, 'Control missing: ' + text); element.click(); await settle(); };
  async function register(confirmPassword = 'test-only') {
    if (d.documentElement.classList.contains('show-landing')) d.querySelector('.ld-hero .ld-open').click();
    if (d.querySelector('#login-submit').textContent !== 'Criar conta') d.querySelector('#login-switch').click();
    d.querySelector('#login-name').value = 'Ana';
    d.querySelector('#login-password').value = 'test-only';
    d.querySelector('#login-confirm-password').value = confirmPassword;
    d.querySelector('#login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  }
  return { w, d, events, clickText, register, releaseConfig, deliver: (event, payload) => handlers.get(event)?.(payload), get copied() { return copied; } };
}

test('first visit shows the home; login, back and forward preserve the chosen screen and focus', async (t) => {
  const app = await ui(t);
  const root = app.d.documentElement;
  assert.equal(root.classList.contains('show-landing'), true);
  assert.equal(app.events.some((e) => e.event === 'auth'), false);
  assert.equal(app.d.querySelector('.ld-hero .ld-download').classList.contains('hidden'), false);
  app.d.querySelector('.ld-login').click(); await settle();
  assert.equal(root.classList.contains('show-landing'), false);
  assert.equal(app.w.location.hash, '#entrar');
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Entrar');
  assert.equal(app.d.activeElement.id, 'login-name');
  app.d.querySelector('#login-back').click(); await settle();
  assert.equal(app.w.location.hash, '');
  assert.equal(root.classList.contains('show-landing'), true);
  assert.equal(app.d.activeElement.className, 'ld-login');
  app.w.history.forward(); await settle();
  assert.equal(root.classList.contains('show-landing'), false);
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Entrar');
});

test('browser CTA opens registration; switching forms updates deep links and preserves back navigation', async (t) => {
  const app = await ui(t);
  app.d.querySelector('.ld-hero .ld-open').click(); await settle();
  assert.equal(app.w.location.hash, '#criar-conta');
  assert.equal(app.d.querySelector('#login-confirm-password').required, true);
  app.d.querySelector('#login-switch').click(); await settle();
  assert.equal(app.w.location.hash, '#entrar');
  assert.equal(app.d.querySelector('#login-confirm-password').required, false);
  app.d.querySelector('#login-back').click(); await settle();
  assert.equal(app.d.documentElement.classList.contains('show-landing'), true);
});

test('direct registration opens with focus and can return home without adding a history entry', async (t) => {
  const app = await ui(t, false, { hash: '#criar-conta' });
  assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Criar conta');
  assert.equal(app.d.activeElement.id, 'login-name');
  const entries = app.w.history.length;
  app.d.querySelector('#login-back').click(); await settle();
  assert.equal(app.d.documentElement.classList.contains('show-landing'), true);
  assert.equal(app.w.history.length, entries);
});

test('returning visitors, desktop and invitations bypass the home; saved sessions authenticate automatically', async (t) => {
  for (const options of [{ name: 'Ana' }, { desktop: true }, { token: 'saved-token' }, { token: 'expired', expiredToken: true }]) {
    const app = await ui(t, false, options);
    assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
    assert.equal(app.d.documentElement.dataset.landing, undefined);
    if (options.token) assert.equal(app.events.find((e) => e.event === 'auth').payload.token, options.token);
    if (options.expiredToken) {
      assert.equal(app.w.localStorage.getItem('token'), null);
      assert.equal(app.d.querySelector('#login').classList.contains('hidden'), false);
    } else if (options.token) assert.equal(app.d.querySelector('#app').classList.contains('hidden'), false);
  }
  const invited = await ui(t, true);
  assert.equal(invited.d.documentElement.classList.contains('show-landing'), false);
  assert.equal(invited.d.documentElement.dataset.landing, undefined);
  assert.match(invited.d.querySelector('#login-notice').textContent, /Turma convidada/);
});

test('unsupported systems get the browser CTA as primary; download pages open the app directly', async (t) => {
  const app = await ui(t, false, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
  assert.equal(app.d.querySelector('.ld-hero .ld-download').classList.contains('hidden'), true);
  assert.equal(app.d.querySelector('.ld-hero .ld-open').classList.contains('ld-btn-light'), true);
  for (const file of ['baixar.html', 'privacidade.html']) {
    const page = new JSDOM(fs.readFileSync(path.join(publicDir, file), 'utf8'));
    assert.equal(page.window.document.querySelector('.dl-open').getAttribute('href'), '/#criar-conta');
    page.window.close();
  }
});

test('registration errors preserve the form so correcting the password can complete signup', async (t) => {
  const app = await ui(t);
  await app.register('different-password');
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Criar conta');
  assert.equal(app.d.querySelector('#login-confirm-password').required, true);
  assert.equal(app.w.localStorage.getItem('token'), null);
  await app.register();
  assert.equal(app.d.querySelector('#app').classList.contains('hidden'), false);
  assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
  assert.equal(app.d.documentElement.dataset.landing, undefined);
  assert.equal(app.w.location.hash, '');
  app.w.history.back(); await settle();
  assert.equal(app.d.documentElement.classList.contains('show-landing'), false);
});

test('late config respects the chosen form; an empty installation still starts with registration', async (t) => {
  const app = await ui(t, false, { deferConfig: true });
  app.d.querySelector('.ld-hero .ld-open').click();
  app.d.querySelector('#login-switch').click();
  app.releaseConfig(); await settle();
  assert.equal(app.d.querySelector('#login-submit').textContent, 'Entrar');
  const empty = await ui(t, false, { hash: '#entrar', hasOwner: false });
  assert.equal(empty.d.querySelector('#login-submit').textContent, 'Criar conta');
});

test('real UI registers without email, creates two servers, copies a scoped invite and restores drafts when switching', async (t) => {
  const app = await ui(t);
  await app.register();
  const auth = app.events.find((e) => e.event === 'auth').payload;
  assert.equal(auth.name, 'Ana'); assert.equal(auth.confirmPassword, 'test-only'); assert.equal(auth.email, undefined);
  assert.equal(app.d.querySelector('#app').classList.contains('hidden'), false);
  assert.equal(app.d.querySelector('#home-nav').classList.contains('hidden'), false);
  assert.match(app.d.querySelector('.server-welcome').textContent, /Entrar por convite/);
  assert.ok(app.d.querySelector('#btn-switch-server'), 'server switcher must be accessible when the rail is hidden on mobile');
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma um'; await app.clickText('Criar servidor');
  assert.equal(app.d.querySelector('#server-header span').textContent, 'Turma um');
  assert.equal(app.d.querySelector('#server-invite-link').value, 'https://resenhex.test/?invite=' + code);
  await app.clickText('Copiar link'); assert.equal(app.copied, 'https://resenhex.test/?invite=' + code);
  app.d.querySelector('#server-dialog .dialog-close').click();
  app.d.querySelector('#chat-input').value = 'rascunho da turma um';
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma dois'; await app.clickText('Criar servidor');
  app.d.querySelector('#server-dialog .dialog-close').click();
  assert.equal(app.d.querySelectorAll('#server-list .server-entry').length, 2);
  assert.equal(app.d.querySelector('#chat-input').value, '');
  app.d.querySelector('[data-server-id="server-1"]').click(); await settle();
  assert.equal(app.d.querySelector('#server-header span').textContent, 'Turma um');
  assert.equal(app.d.querySelector('#chat-input').value, 'rascunho da turma um');
  app.d.querySelector('#btn-switch-server').click(); await settle();
  assert.match(app.d.querySelector('#server-dialog').textContent, /Turma dois/);
  app.d.querySelector('#server-dialog .dialog-close').click();
  const oldAuthor = { ...person, id: 'b'.repeat(16), name: 'Amigo que saiu' };
  app.deliver('chat:message', { channel: 'server-1-chat', author: oldAuthor, msg: { id: 'historic', authorId: oldAuthor.id, text: 'mensagem preservada', ts: Date.now() } }); await settle();
  const author = app.d.querySelector('[data-id="historic"] .msg-author');
  assert.equal(author.textContent, 'Amigo que saiu');
  author.dispatchEvent(new app.w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
  assert.doesNotMatch(app.d.querySelector('#context-menu').textContent, /Banir|Expulsar|Castigar/);
});

test('server deletion is available to the owner and requires typing its name before sending', async (t) => {
  const app = await ui(t); await app.register();
  app.d.querySelector('#btn-add-server').click(); await settle();
  await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
  app.d.querySelector('#new-server-name').value = 'Turma'; await app.clickText('Criar servidor');
  app.d.querySelector('#server-dialog .dialog-close').click();
  app.d.querySelector('#server-header').click(); await settle();
  await app.clickText('Configurações do servidor');
  assert.match(app.d.querySelector('#admin-nav').textContent, /Excluir servidor/);
  await app.clickText('Excluir servidor');
  const input = app.d.querySelector('#delete-server-name');
  const submit = app.d.querySelector('#server-dialog button[type="submit"]');
  assert.equal(submit.disabled, true);
  input.value = 'errado'; input.dispatchEvent(new app.w.Event('input')); assert.equal(submit.disabled, true);
  await app.clickText('Cancelar');
  assert.equal(app.events.some((e) => e.event === 'server:delete'), false);
  await app.clickText('Excluir servidor');
  const confirmed = app.d.querySelector('#delete-server-name');
  confirmed.value = 'Turma'; confirmed.dispatchEvent(new app.w.Event('input'));
  app.d.querySelector('#server-dialog button[type="submit"]').click(); await settle();
  const deleted = app.events.find((e) => e.event === 'server:delete').payload;
  assert.equal(deleted.id, 'server-1'); assert.equal(deleted.name, 'Turma');
  assert.equal(app.d.querySelector('#server-dialog'), null);
  assert.equal(app.d.querySelectorAll('#server-list .server-entry').length, 0);
  assert.equal(app.d.querySelector('#server-settings').classList.contains('hidden'), true);
});

test('invite survives registration, shows the right preview, and joins only after acceptance', async (t) => {
  const app = await ui(t, true);
  assert.match(app.d.querySelector('#login-notice').textContent, /Turma convidada/);
  await app.register();
  assert.equal(app.events.some((e) => e.event === 'server:join'), false);
  assert.match(app.d.querySelector('#server-dialog').textContent, /3 membros/);
  await app.clickText('Entrar no servidor');
  assert.equal(app.events.find((e) => e.event === 'server:join').payload.code, code);
  assert.equal(app.d.querySelector('#server-header span').textContent, 'Turma convidada');
  assert.equal(app.w.location.search, '');
});

test('the call soundboard opens the dedicated upload dialog; ordinary members cannot manage sounds', async (t) => {
  const app = await ui(t); await app.register();
  const s = snapshot('1'.repeat(16), 'Turma', [{ id: '1'.repeat(16), name: 'Turma', owner: true }]);
  s.myPerms.push('MANAGE_SOUNDBOARD', 'SOUNDBOARD');
  app.deliver('state', s); await settle();
  app.d.querySelector('#sc-sounds').click();
  const add = app.d.querySelector('.sb-add'); assert.equal(add.disabled, false);
  assert.equal(app.d.querySelectorAll('.sb-preview').length, 8);
  add.click(); await settle();
  assert.ok(app.d.querySelector('.sound-dialog-card[aria-modal="true"]'));
  assert.match(app.d.querySelector('.sound-limit-note').textContent, /8 segundos/);
  assert.equal(app.d.querySelector('.sound-dialog-card button[type=submit]').disabled, true);
  assert.equal(app.d.querySelector('#app').inert, true);
  app.d.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  assert.equal(app.d.querySelector('.sound-dialog-card'), null);
  assert.equal(!!app.d.querySelector('#app').inert, false);
  app.deliver('state', { ...s, ownerId: 'b'.repeat(16), myPerms: ['SOUNDBOARD', 'CONNECT'] }); await settle();
  app.d.querySelector('#sc-sounds').click(); assert.equal(app.d.querySelector('.sb-add').disabled, true);
});

test('keyboard shortcuts follow Discord defaults, can be rebound in settings and resolve conflicts', async (t) => {
  const app = await ui(t);
  await app.register();
  const { d, w } = app;
  const key = (code, mods = {}, target = d.body) => {
    const event = new w.KeyboardEvent('keydown', { code, key: /^Key/.test(code) ? code.slice(3).toLowerCase() : code, bubbles: true, cancelable: true, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift });
    target.dispatchEvent(event);
    return event;
  };
  for (const name of ['Turma um', 'Turma dois']) {
    d.querySelector('#btn-add-server').click(); await settle();
    await app.clickText('Criar meu servidorDê um nome e convide seus amigos.');
    d.querySelector('#new-server-name').value = name; await app.clickText('Criar servidor');
    d.querySelector('#server-dialog .dialog-close').click();
  }
  // O som de mutar/ensurdecer mostra qual botão o atalho apertou (o fixture não tem permissão de falar).
  const played = [];
  w.Sounds.play = (name) => played.push(name);

  // Padrão do Discord: Ctrl+Shift+M muta, também com o foco na caixa de mensagem.
  assert.equal(key('KeyM', { ctrl: true, shift: true }, d.querySelector('#chat-input')).defaultPrevented, true);
  assert.deepEqual(played.splice(0), ['mute']);
  // Ctrl+Alt+↑/↓ troca de servidor.
  key('ArrowUp', { ctrl: true, alt: true }); await settle();
  assert.equal(d.querySelector('#server-header span').textContent, 'Turma um');
  key('ArrowDown', { ctrl: true, alt: true }); await settle();
  assert.equal(d.querySelector('#server-header span').textContent, 'Turma dois');

  // Ctrl+/ abre a lista de atalhos nas configurações.
  key('Slash', { ctrl: true }); await settle();
  assert.equal(d.querySelector('#settings').classList.contains('hidden'), false);
  assert.equal(d.querySelector('#page-accessibility').classList.contains('hidden'), false);
  const keyButton = (id) => d.querySelector(`#keybind-list [data-action="${id}"]`);
  assert.equal(keyButton('toggleMute').textContent, 'CtrlShiftM');
  assert.equal(keyButton('disconnect').textContent, 'Sem atalho');

  // Letra sozinha é recusada; Ctrl+Alt+M vira o novo atalho de mutar.
  keyButton('toggleMute').click(); await settle();
  key('KeyK'); await settle();
  assert.match(d.querySelector('#keybind-status').textContent, /Ctrl ou Alt/);
  key('KeyM', { ctrl: true, alt: true }); await settle();
  assert.equal(keyButton('toggleMute').textContent, 'CtrlAltM');
  assert.equal(d.querySelector('#settings-savebar').classList.contains('hidden'), false);

  // Conflito: dar Ctrl+Alt+M para ensurdecer tira o atalho de mutar.
  keyButton('toggleDeafen').click(); await settle();
  key('KeyM', { ctrl: true, alt: true }); await settle();
  assert.equal(keyButton('toggleDeafen').textContent, 'CtrlAltM');
  assert.equal(keyButton('toggleMute').textContent, 'Sem atalho');
  assert.match(d.querySelector('#keybind-status').textContent, /saiu de "Ativar ou desativar microfone"/);
  // Esc cancela a edição sem mudar nada.
  keyButton('disconnect').click(); await settle();
  key('Escape'); await settle();
  assert.equal(keyButton('disconnect').textContent, 'Sem atalho');
  assert.equal(d.querySelector('#settings').classList.contains('hidden'), false);

  d.querySelector('#settings-save').click(); await settle();
  const saved = JSON.parse(w.localStorage.getItem('keybinds'));
  assert.equal(saved.toggleMute, '');
  assert.equal(saved.toggleDeafen, 'Ctrl+Alt+KeyM');
  d.querySelector('#settings-close').click(); await settle();

  // O atalho antigo não faz mais nada; o novo ensurdece.
  played.length = 0;
  key('KeyM', { ctrl: true, shift: true });
  assert.deepEqual(played, []);
  key('KeyM', { ctrl: true, alt: true });
  assert.deepEqual(played, ['deafen']);

  // Restaurar padrões volta ao Ctrl+Shift+M.
  key('Comma', { ctrl: true }); await settle();
  d.querySelector('#keybinds-reset').click(); await settle();
  assert.equal(keyButton('toggleMute').textContent, 'CtrlShiftM');
  d.querySelector('#settings-save').click(); await settle();
  assert.equal(JSON.parse(w.localStorage.getItem('keybinds')).toggleMute, 'Ctrl+Shift+KeyM');
});
