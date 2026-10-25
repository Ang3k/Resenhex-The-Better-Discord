// Avisos pequenos do servidor (state:patch): o que mudou numa sala de voz ou no perfil de alguém, aplicado no
// estado que o app já tem. O estado inteiro só chega ao entrar, ao trocar de servidor e nas mudanças raras.
// O socket.io entrega tudo na ordem, e quem reconecta recebe o estado inteiro de novo: os avisos nunca pulam um.
// Cada aviso traz o valor novo inteiro (a sala, o perfil), então aplicar o mesmo aviso duas vezes não estraga nada.
(() => {
  const replaceById = (list, item) => {
    const i = list ? list.findIndex((x) => x.id === item.id) : -1;
    if (i >= 0) list[i] = item;
    return i >= 0;
  };

  // Devolve true se o estado mudou (e precisa ser redesenhado).
  function applyPatch(state, patch, myAccountId) {
    if (!state || !patch) return false;
    const call = state.call;
    const callIn = (serverId) => !!call && !call.dm && call.serverId === serverId;
    let changed = false;
    if (patch.type === 'voice') {
      // A sala inteira: quem está nela e como (mutado, transmitindo, quem assiste…).
      if (state.serverId === patch.serverId) {
        state.voice = state.voice.filter((v) => v.channel !== patch.channel).concat(patch.entries);
        changed = true;
      }
      if (callIn(patch.serverId) && call.channel.id === patch.channel) {
        call.voice = patch.entries;
        // A chamada de quem olha outro servidor só tem os membros da sala.
        const inRoom = new Set([myAccountId, ...patch.entries.map((v) => v.accountId)]);
        const fresh = new Set(patch.members.map((m) => m.id));
        call.members = call.members.filter((m) => inRoom.has(m.id) && !fresh.has(m.id)).concat(patch.members);
        changed = true;
      }
    } else if (patch.type === 'member') {
      // O perfil da pessoa neste servidor (apelido, cargos, status, foto…).
      if (state.serverId === patch.serverId) changed = replaceById(state.members, patch.member) || changed;
      if (callIn(patch.serverId)) changed = replaceById(call.members, patch.member) || changed;
    } else if (patch.type === 'music') {
      // O DJ de uma sala: o resumo na lista de canais e o player de quem está nela.
      if (state.serverId === patch.serverId && state.music) {
        if (patch.summary) state.music[patch.channel] = patch.summary;
        else delete state.music[patch.channel];
        changed = true;
      }
      if (callIn(patch.serverId) && call.channel.id === patch.channel) {
        call.music = patch.view;
        changed = true;
      }
    } else if (patch.type === 'person') {
      // O perfil fora dos servidores: amigos, conversas e quem a pessoa bloqueou.
      changed = replaceById(state.people, patch.person) || changed;
      if (call?.dm) changed = replaceById(call.members, patch.person) || changed;
    }
    return changed;
  }

  const api = { applyPatch };
  if (typeof window !== 'undefined') window.StatePatch = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
