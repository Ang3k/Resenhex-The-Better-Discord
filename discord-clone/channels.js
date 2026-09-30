// Organização persistente dos canais. A autorização das ações fica no servidor.
const MAX_GROUPS = 100;
const MAX_CHANNELS = 500;
const fail = (message) => { throw new Error(message); };

function migrateChannels(db) {
  if (!Array.isArray(db.categories)) {
    db.categories = [{ id: 'text', name: 'Canais de texto' }, { id: 'voice', name: 'Canais de voz' }];
    for (const channel of db.channels) channel.categoryId = channel.type === 'voice' ? 'voice' : 'text';
  }
  for (const channel of db.channels) {
    channel.allowedRoles = Array.isArray(channel.allowedRoles) ? channel.allowedRoles : [];
    // Dados antigos não distinguem "privado vazio" de público. Preserva o acesso gravado.
    channel.private = typeof channel.private === 'boolean' ? channel.private : channel.allowedRoles.length > 0;
    channel.topic = typeof channel.topic === 'string' ? channel.topic.slice(0, 512) : '';
    if (!db.categories.some((g) => g.id === channel.categoryId)) channel.categoryId = null;
  }
}

function channelActions(db, newId) {
  const cleanName = (value, type) => {
    if (typeof value !== 'string') fail('Nome inválido.');
    let name = value.trim().replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').slice(0, 64);
    if (type === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
    if (!name) fail('Digite um nome.');
    return name;
  };
  const categoryId = (id) => {
    if (id === null || id === '') return null;
    if (typeof id !== 'string' || !db.categories.some((g) => g.id === id)) fail('Grupo não encontrado. Atualize a lista.');
    return id;
  };
  const channel = (id) => db.channels.find((c) => c.id === id) || fail('Canal não encontrado.');
  const access = (payload, previous = null) => {
    if (payload.private !== undefined && typeof payload.private !== 'boolean') fail('Privacidade inválida.');
    let roles = payload.allowedRoles === undefined ? [...(previous?.allowedRoles || [])] : payload.allowedRoles;
    if (!Array.isArray(roles) || roles.some((id) => !db.roles.some((r) => r.id === id && id !== 'everyone'))) {
      fail('Cargo não encontrado. Confira as permissões e tente novamente.');
    }
    roles = [...new Set(roles)];
    const isPrivate = payload.private ?? (previous?.private || roles.length > 0);
    return { private: isPrivate, allowedRoles: isPrivate ? roles : [] };
  };
  const topic = (value) => {
    if (typeof value !== 'string' || value.length > 512) fail('A descrição deve ter até 512 caracteres.');
    return value.trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  };
  // Valida tudo antes de modificar o array. IDs de canais e salas nunca mudam.
  const move = (items, item, beforeId, siblings = items) => {
    if (beforeId === item.id) return;
    const before = beforeId == null ? null : siblings.find((s) => s.id === beforeId);
    if (beforeId != null && !before) fail('Posição não encontrada. Atualize a lista.');
    const remaining = items.filter((s) => s.id !== item.id);
    const last = siblings.filter((s) => s.id !== item.id).at(-1);
    const index = before ? remaining.indexOf(before) : last ? remaining.indexOf(last) + 1 : remaining.length;
    remaining.splice(index, 0, item);
    items.splice(0, items.length, ...remaining);
  };

  return {
    category(payload) {
      const { action, id, name, beforeId = null } = payload;
      if (action === 'create') {
        if (db.categories.length >= MAX_GROUPS) fail('Limite de 100 grupos atingido.');
        const group = { id: newId(), name: cleanName(name) };
        db.categories.push(group);
        return { id: group.id };
      }
      const group = db.categories.find((g) => g.id === id) || fail('Grupo não encontrado.');
      if (action === 'update') group.name = cleanName(name);
      else if (action === 'move') move(db.categories, group, beforeId);
      else if (action === 'delete') {
        // Apenas desagrupa. Não altera acesso, histórico ou presença nas salas.
        for (const c of db.channels) if (c.categoryId === id) c.categoryId = null;
        db.categories = db.categories.filter((g) => g.id !== id);
      } else fail('Ação desconhecida.');
      return { ok: true };
    },

    channel(payload) {
      const { action, id, type, name } = payload;
      if (action === 'create' || action === 'duplicate') {
        if (db.channels.length >= MAX_CHANNELS) fail('Limite de 500 canais atingido.');
        const source = action === 'duplicate' ? channel(id) : null;
        const nextType = source?.type || type;
        if (!['text', 'voice'].includes(nextType)) fail('Tipo inválido.');
        const next = {
          id: newId(), type: nextType, name: cleanName(name, nextType),
          categoryId: categoryId(payload.categoryId === undefined ? source?.categoryId ?? null : payload.categoryId),
          topic: source ? source.topic : topic(payload.topic ?? ''),
          ...(source ? { private: source.private, allowedRoles: [...source.allowedRoles] } : access(payload)),
        };
        db.channels.push(next);
        if (nextType === 'text') db.messages[next.id] = [];
        return { id: next.id };
      }
      const current = channel(id);
      if (action === 'update') {
        const patch = {
          name: name === undefined ? current.name : cleanName(name, current.type),
          topic: payload.topic === undefined ? current.topic : topic(payload.topic),
          categoryId: payload.categoryId === undefined ? current.categoryId : categoryId(payload.categoryId),
          ...access(payload, current),
        };
        Object.assign(current, patch);
      } else if (action === 'move') {
        const target = categoryId(payload.categoryId === undefined ? current.categoryId : payload.categoryId);
        if (payload.beforeId === id && target !== current.categoryId) fail('Posição inválida.');
        move(db.channels, current, payload.beforeId ?? null, db.channels.filter((c) => c.categoryId === target));
        current.categoryId = target;
      } else if (action === 'delete') {
        if (current.type === 'text' && db.channels.filter((c) => c.type === 'text').length === 1) fail('O servidor precisa de pelo menos um canal de texto.');
        db.channels = db.channels.filter((c) => c.id !== id);
        delete db.messages[id];
      } else fail('Ação desconhecida.');
      return { ok: true };
    },
  };
}

module.exports = { migrateChannels, channelActions };
