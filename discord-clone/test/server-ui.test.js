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

async function ui(t, invited = false) {
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'), {
    url: 'https://resenhex.test/' + (invited ? '?invite=' + code : ''), runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  const w = dom.window;
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
  w.fetch = async (url) => ({ json: async () => url === '/config' ? { hasOwner: true, passwordRequired: false, maxUploadMb: 25 } : { id: 'invited', name: 'Turma convidada', members: 3, icon: null } });
  let copied = '';
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (text) => { copied = text; } } });
  for (const file of ['icons.js', 'format.js', 'sounds.js', 'media-policy.js', 'settings.js', 'media-session.js', 'mobile-stream.js', 'changelog.js', 'channel-navigation.js', 'app.js']) w.eval(fs.readFileSync(path.join(publicDir, file), 'utf8'));
  w.localStorage.setItem('seenVersion', w.APP_VERSION);
  t.after(() => { dom.window.close(); assert.deepEqual(errors.map((e) => e.message), []); });
  await settle();
  const d = w.document;
  const clickText = async (text) => { const element = [...d.querySelectorAll('button, a')].find((el) => el.textContent.trim() === text); assert.ok(element, 'Control missing: ' + text); element.click(); await settle(); };
  async function register() {
    d.querySelector('#login-switch').click();
    d.querySelector('#login-name').value = 'Ana';
    d.querySelector('#login-password').value = 'test-only';
    d.querySelector('#login-confirm-password').value = 'test-only';
    d.querySelector('#login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  }
  return { w, d, events, clickText, register, deliver: (event, payload) => handlers.get(event)?.(payload), get copied() { return copied; } };
}

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
