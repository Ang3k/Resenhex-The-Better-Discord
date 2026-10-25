const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { migrateChannels } = require('./channels');

const SERVER_FIELDS = new Set(['ownerId', 'serverName', 'serverIcon', 'roles', 'channels', 'categories', 'soundboardMigrated', 'soundboard', 'emojis', 'musicMigrated', 'mudae', 'mudaeMigrated']);
const MEMBER_FIELDS = new Set(['roles', 'banned', 'serverMuted', 'serverDeafened', 'timeoutUntil', 'nickname']);
const inviteCode = () => crypto.randomBytes(18).toString('base64url');

// Profiles, sessions and DMs belong to the account. Permissions belong to a membership.
// AsyncLocalStorage keeps concurrent sockets and HTTP uploads in their own server context.
// `changed(chave)` marca o pedaço do banco que mudou (server/store.js): toda escrita direta numa conta ou num
// servidor passa pelos Proxies daqui e se marca sozinha; mudanças dentro de listas e mapas são marcadas por quem muda.
function communityStore(root, newId, defaultDb, changed = () => {}) {
  if (!root.servers) {
    const id = newId();
    const legacy = { id, members: {}, inviteCode: inviteCode() };
    for (const field of SERVER_FIELDS) { legacy[field] = root[field]; delete root[field]; }
    legacy.serverName ||= 'Resenha';
    for (const account of Object.values(root.accounts)) {
      const membership = { active: !account.banned, joinedAt: account.createdAt || Date.now() };
      for (const field of MEMBER_FIELDS) { if (account[field] !== undefined) membership[field] = account[field]; delete account[field]; }
      membership.roles ||= [];
      legacy.members[account.id] = membership;
    }
    root.servers = { [id]: legacy };
    root.defaultServerId = id;
  }
  root.schemaVersion = 2;
  // Dono do Resenhex (não de um servidor): quem criou o servidor original. Fica gravado à parte,
  // para não mudar se aquele servidor trocar de dono.
  root.siteOwnerId ??= root.servers[root.defaultServerId]?.ownerId ?? null;
  for (const server of Object.values(root.servers)) {
    migrateChannels(server);
    server.members ||= {};
    server.inviteCode ||= inviteCode();
    server.soundboard ||= [];
    server.emojis ||= [];
    if (!server.soundboardMigrated) {
      const everyone = server.roles.find((role) => role.id === 'everyone');
      if (everyone && !everyone.perms.includes('SOUNDBOARD')) everyone.perms.push('SOUNDBOARD');
      server.soundboardMigrated = true;
    }
    // O DJ chegou depois: todo mundo pode usar, como nos servidores novos.
    if (!server.musicMigrated) {
      const everyone = server.roles.find((role) => role.id === 'everyone');
      if (everyone && !everyone.perms.includes('MUSIC')) everyone.perms.push('MUSIC');
      server.musicMigrated = true;
    }
    // O Mudae também chegou depois: liberado para todo mundo.
    if (!server.mudaeMigrated) {
      const everyone = server.roles.find((role) => role.id === 'everyone');
      if (everyone && !everyone.perms.includes('MUDAE')) everyone.perms.push('MUDAE');
      server.mudaeMigrated = true;
    }
    server.mudae ||= { claims: {}, usage: {} };
  }
  // Servidores de cada conta (onde ela tem registro de membro, mesmo saído ou banido), para não
  // percorrer todos os servidores do site. A lista sai na ordem de criação dos servidores, como antes.
  const serversOf = new Map();
  const position = new Map();
  let created = 0;
  const index = (server) => {
    position.set(server.id, created++);
    for (const accountId of Object.keys(server.members)) addMember(accountId, server.id);
  };
  const addMember = (accountId, serverId) => {
    let set = serversOf.get(accountId);
    if (!set) serversOf.set(accountId, (set = new Set()));
    set.add(serverId);
  };
  for (const server of Object.values(root.servers)) index(server);
  const context = new AsyncLocalStorage();
  const empty = { ownerId: null, serverName: '', serverIcon: null, roles: [], channels: [], categories: [], members: {}, soundboard: [], emojis: [] };
  const currentId = () => context.getStore() === undefined ? root.defaultServerId : context.getStore();
  const current = () => root.servers[currentId()] || empty;
  const serverChanged = (id = currentId()) => { if (root.servers[id]) changed('servers/' + id); };
  const membership = (accountId, serverId = currentId()) => root.servers[serverId]?.members[accountId];
  const joined = (accountId, serverId = currentId()) => !!membership(accountId, serverId)?.active && !membership(accountId, serverId)?.banned;
  const accountView = (account) => account && new Proxy(account, {
    get(target, key) { return MEMBER_FIELDS.has(key) ? membership(target.id)?.[key] ?? (key === 'roles' ? [] : false) : target[key]; },
    set(target, key, value) {
      if (MEMBER_FIELDS.has(key)) {
        const member = membership(target.id);
        if (!member) throw new Error('Membro não encontrado neste servidor.');
        member[key] = value;
        serverChanged();
      } else {
        target[key] = value;
        changed('accounts/' + target.id);
      }
      return true;
    },
    deleteProperty(target, key) {
      if (MEMBER_FIELDS.has(key)) {
        const member = membership(target.id);
        if (member) { delete member[key]; serverChanged(); }
      } else {
        delete target[key];
        changed('accounts/' + target.id);
      }
      return true;
    },
  });
  const accounts = new Proxy(root.accounts, {
    get(target, key) { return accountView(target[key]); },
    set(target, key, value) { target[key] = value; changed('accounts/' + key); return true; },
  });
  const db = new Proxy(root, {
    get(target, key) { return key === 'accounts' ? accounts : SERVER_FIELDS.has(key) ? current()[key] : target[key]; },
    set(target, key, value) {
      if (SERVER_FIELDS.has(key)) { current()[key] = value; serverChanged(); } else target[key] = value;
      return true;
    },
  });
  const memberServers = (accountId) => [...(serversOf.get(accountId) || [])].filter((id) => root.servers[id])
    .sort((a, b) => position.get(a) - position.get(b));
  const list = (accountId) => memberServers(accountId).filter((id) => joined(accountId, id)).map((id) => root.servers[id]).map((s) => ({
    id: s.id, name: s.serverName, icon: s.serverIcon ? '/avatars/' + s.serverIcon : null, owner: s.ownerId === accountId,
  }));
  const choose = (accountId, preferred) => typeof preferred === 'string' && joined(accountId, preferred) ? preferred : list(accountId)[0]?.id || null;
  const byInvite = (code) => typeof code === 'string' && /^[\w-]{24}$/.test(code) ? Object.values(root.servers).find((s) => s.inviteCode === code) : null;
  function join(accountId, server) {
    if (server.members[accountId]?.banned) throw new Error('Você foi banido deste servidor.');
    if (!joined(accountId, server.id) && list(accountId).length >= 100) throw new Error('Você já participa de 100 servidores.');
    if (!joined(accountId, server.id)) server.members[accountId] = { active: true, roles: [], joinedAt: Date.now() };
    addMember(accountId, server.id);
    serverChanged(server.id);
  }
  // Exclui o servidor do site (e dos índices).
  function drop(serverId) {
    const server = root.servers[serverId];
    if (!server) return;
    for (const accountId of Object.keys(server.members)) serversOf.get(accountId)?.delete(serverId);
    position.delete(serverId);
    delete root.servers[serverId];
    changed('servers/' + serverId);
  }
  function create(accountId, name) {
    if (list(accountId).length >= 100) throw new Error('Você já participa de 100 servidores.');
    if (list(accountId).filter((s) => s.owner).length >= 20) throw new Error('Você já possui 20 servidores.');
    const template = defaultDb();
    const id = newId();
    const server = { id, ownerId: accountId, serverName: name, serverIcon: null, roles: template.roles,
      channels: template.channels.map((c) => ({ ...c, id: newId() })), members: {}, inviteCode: inviteCode(), soundboardMigrated: true, musicMigrated: true, mudaeMigrated: true, soundboard: [], emojis: [], mudae: { claims: {}, usage: {} } };
    migrateChannels(server);
    root.servers[id] = server;
    index(server);
    join(accountId, server);
    return server;
  }
  return { root, db, currentId, current, membership, joined, list, choose, byInvite, join, create, drop, accountView,
    memberServers, run: (id, callback) => context.run(id, callback), inviteCode };
}

module.exports = { communityStore };
