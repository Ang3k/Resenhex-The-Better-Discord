// Conexões abertas (socket.id -> sessão), com índices para não percorrer todo mundo online a cada aviso:
// por conta, por servidor aberto na tela, por servidor da chamada e por sala de voz.
// Os campos que os índices usam (serverId, voice, voiceServerId) atualizam os índices sozinhos quando
// mudam, então o resto do servidor continua escrevendo `s.voice = …` como sempre.
const TRACKED = ['serverId', 'voice', 'voiceServerId'];
const NONE = new Set();

function add(map, key, sid) {
  if (key == null) return;
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(sid);
}
function remove(map, key, sid) {
  if (key == null) return;
  const set = map.get(key);
  if (set?.delete(sid) && !set.size) map.delete(key);
}

class Online extends Map {
  constructor() {
    super();
    this.byAccount = new Map(); // conta -> conexões
    this.viewing = new Map(); // servidor aberto na tela -> conexões
    this.calling = new Map(); // servidor da chamada -> conexões em chamada nele
    this.rooms = new Map(); // sala de voz (canal ou conversa privada) -> conexões
  }

  set(sid, fields) {
    if (this.has(sid)) this.delete(sid);
    const session = { ...fields };
    const values = {};
    for (const key of TRACKED) {
      values[key] = fields[key] ?? null;
      Object.defineProperty(session, key, {
        enumerable: true,
        get: () => values[key],
        set: (next) => {
          next ??= null;
          if (next === values[key]) return;
          this.#unlink(sid, values);
          values[key] = next;
          this.#link(sid, values);
        },
      });
    }
    add(this.byAccount, session.accountId, sid);
    this.#link(sid, values);
    return super.set(sid, session);
  }

  delete(sid) {
    const session = this.get(sid);
    if (!session) return false;
    remove(this.byAccount, session.accountId, sid);
    this.#unlink(sid, session);
    return super.delete(sid);
  }

  #link(sid, { serverId, voice, voiceServerId }) {
    add(this.viewing, serverId, sid);
    if (voice) {
      add(this.rooms, voice, sid);
      add(this.calling, voiceServerId, sid);
    }
  }

  #unlink(sid, { serverId, voice, voiceServerId }) {
    remove(this.viewing, serverId, sid);
    if (voice) {
      remove(this.rooms, voice, sid);
      remove(this.calling, voiceServerId, sid);
    }
  }

  // Conexões (ids) de uma conta, de quem está vendo um servidor, de quem está em chamada num servidor
  // e de uma sala de voz. Devolvem o próprio índice: copie antes de mudar sessões dentro do laço.
  sidsOf(accountId) { return this.byAccount.get(accountId) || NONE; }
  viewers(serverId) { return this.viewing.get(serverId) || NONE; }
  inCalls(serverId) { return this.calling.get(serverId) || NONE; }
  inRoom(voice) { return this.rooms.get(voice) || NONE; }
  // Contas com pelo menos uma conexão (tem .has e .size, como um Set).
  get accounts() { return this.byAccount; }
}

module.exports = { Online };
