// Relações entre contas (amizades e pedidos, conversas privadas, bloqueios) com índices por conta, para
// não percorrer as relações do site inteiro a cada aviso. Toda mudança nessas relações passa por aqui:
// assim o banco e os índices nunca ficam diferentes.
const pairKey = (a, b) => [a, b].sort().join('-');
const NONE = new Set();

// `changed(chave)` marca o pedaço do banco que mudou (server/store.js).
function socialStore(db, changed = () => {}) {
  db.friendships ||= {}; // "idA-idB" (em ordem) -> { status: 'friends' | 'pending', from, ts }
  db.dms ||= {}; // "dm-idA-idB" -> { id, users: [idA, idB], closed: { idDaConta: true } }
  db.blocks ||= {}; // idDeQuemBloqueou -> [ids bloqueados]
  const related = new Map(); // conta -> contas com amizade ou pedido de amizade (em qualquer sentido)
  const conversations = new Map(); // conta -> ids das suas conversas privadas
  const blockers = new Map(); // conta -> quem a bloqueou
  const link = (map, key, value) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(value);
  };
  const unlink = (map, key, value) => {
    const set = map.get(key);
    if (set?.delete(value) && !set.size) map.delete(key);
  };
  for (const key of Object.keys(db.friendships)) {
    const [a, b] = key.split('-');
    link(related, a, b);
    link(related, b, a);
  }
  for (const dm of Object.values(db.dms)) for (const id of dm.users) link(conversations, id, dm.id);
  for (const [blocker, list] of Object.entries(db.blocks)) for (const id of list) link(blockers, id, blocker);

  return {
    pairKey,
    friendship: (a, b) => db.friendships[pairKey(a, b)],
    // Contas com quem a conta tem amizade ou pedido pendente (o status fica em friendship()).
    relatedTo: (id) => related.get(id) || NONE,
    dmIdsOf: (id) => conversations.get(id) || NONE,
    blockersOf: (id) => blockers.get(id) || NONE,
    setFriendship(a, b, value) {
      db.friendships[pairKey(a, b)] = value;
      changed('friendships/' + pairKey(a, b));
      link(related, a, b);
      link(related, b, a);
    },
    removeFriendship(a, b) {
      delete db.friendships[pairKey(a, b)];
      changed('friendships/' + pairKey(a, b));
      unlink(related, a, b);
      unlink(related, b, a);
    },
    addDm(dm) {
      db.dms[dm.id] = dm;
      changed('dms/' + dm.id);
      for (const id of dm.users) link(conversations, id, dm.id);
    },
    block(blocker, id) {
      const list = (db.blocks[blocker] ||= []);
      if (!list.includes(id)) list.push(id);
      changed('blocks/' + blocker);
      link(blockers, id, blocker);
    },
    unblock(blocker, id) {
      const list = (db.blocks[blocker] || []).filter((b) => b !== id);
      if (list.length) db.blocks[blocker] = list;
      else delete db.blocks[blocker];
      changed('blocks/' + blocker);
      unlink(blockers, id, blocker);
    },
  };
}

module.exports = { socialStore, pairKey };
