// Chamadas nas conversas privadas: o toque para o amigo e a mensagem de chamada no histórico.
// A sala de voz em si (quem está conectado, sinalização) fica no server.js; este módulo só
// recebe os avisos de entrada e saída e cuida do que é próprio da chamada privada.
//
// Mensagem de chamada: { id, authorId: quem ligou, ts, call: { startedAt, endedAt, joined: [contas] } }.
// endedAt null = chamada acontecendo. joined com uma pessoa só = ninguém atendeu.
function createDmCalls({ ringMs = 30_000, messages, newId, emit, update, post, changed, now = Date.now }) {
  const active = new Map(); // id da conversa -> { msg, ring: { from, to, timer } | null }

  function stopRing(dm) {
    const entry = active.get(dm);
    if (!entry?.ring) return;
    clearTimeout(entry.ring.timer);
    emit(entry.ring.to, 'dm:ring:stop', { dm });
    entry.ring = null;
    changed();
  }

  function ring(dm, from, to) {
    const entry = active.get(dm);
    if (!entry) return;
    if (entry.ring) clearTimeout(entry.ring.timer);
    entry.ring = { from, to, timer: setTimeout(() => stopRing(dm), ringMs) };
    entry.ring.timer.unref?.();
    emit(to, 'dm:ring', { dm, from });
    changed();
  }

  // Alguém entrou na sala da conversa. first: a sala estava vazia. silent: voltando de uma
  // reconexão, sem tocar de novo e continuando a mesma mensagem se ela ainda estiver aberta.
  function joined(dm, accountId, peerId, { first, silent = false } = {}) {
    let entry = active.get(dm);
    if (first || !entry) {
      if (entry) end(dm);
      const open = silent ? messages(dm).findLast((m) => m.call && !m.call.endedAt) : null;
      if (open) {
        entry = { msg: open, ring: null };
        active.set(dm, entry);
      } else {
        const t = now();
        const msg = { id: newId(), authorId: accountId, ts: t, call: { startedAt: t, endedAt: null, joined: [accountId] } };
        entry = { msg, ring: null };
        active.set(dm, entry);
        post(dm, msg);
        if (!silent) ring(dm, accountId, peerId);
        return;
      }
    }
    if (!entry.msg.call.joined.includes(accountId)) {
      entry.msg.call.joined.push(accountId);
      update(dm, entry.msg);
    }
    if (entry.ring?.to === accountId) stopRing(dm);
  }

  // Alguém saiu. remaining: contas que continuam na sala.
  function left(dm, accountId, remaining) {
    const entry = active.get(dm);
    if (!entry) return;
    if (entry.ring && !remaining.includes(entry.ring.from)) stopRing(dm);
    if (!remaining.length) end(dm);
  }

  function end(dm) {
    const entry = active.get(dm);
    if (!entry) return;
    stopRing(dm);
    active.delete(dm);
    entry.msg.call.endedAt = Math.max(now(), entry.msg.call.startedAt);
    update(dm, entry.msg);
  }

  // Quem recebeu recusou: para de tocar e devolve quem ligou (para avisar).
  function decline(dm, accountId) {
    const entry = active.get(dm);
    if (entry?.ring?.to !== accountId) return null;
    const from = entry.ring.from;
    stopRing(dm);
    return from;
  }

  const ringing = (dm) => !!active.get(dm)?.ring;
  const ringsFor = (accountId) => [...active].filter(([, e]) => e.ring?.to === accountId).map(([dm, e]) => ({ dm, from: e.ring.from }));

  // Depois de reiniciar o servidor: chamadas que ficaram abertas e ninguém retomou terminam agora.
  function sweep(dmIds) {
    for (const dm of dmIds) {
      if (active.has(dm)) continue;
      for (const msg of messages(dm)) {
        if (msg.call && !msg.call.endedAt) { msg.call.endedAt = Math.max(now(), msg.call.startedAt); update(dm, msg); }
      }
    }
  }

  return { joined, left, ring, decline, ringing, ringsFor, sweep, stopRing };
}

module.exports = { createDmCalls };
