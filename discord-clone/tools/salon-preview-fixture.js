// Injetado apenas no servidor de prévia; o código do produto permanece o real.
const salonParams = new URLSearchParams(location.search);
const salonPreviewSession = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let salonPreviewCards = [];
const salonMember = { id: 'a'.repeat(16), name: 'Ana', color: '#9b85ed', roles: [], online: true };
state.me = { accountId: salonMember.id, sid: 'preview-self' };
state.view = 'chat'; state.textChannel = 'salon-preview'; state.showMembers = false; state.home = false;
state.server = { serverId: 'preview', serverName: 'Resenha', ownerId: salonMember.id, serverIcon: null,
  servers: [{ id: 'preview', name: 'Resenha', owner: true }], roles: [{ id: 'everyone', name: '@everyone', perms: [], pos: 0 }],
  categories: [{ id: 'text', name: 'Canais de texto' }],
  channels: [{ id: 'preview-chat', name: 'geral', type: 'text', categoryId: 'text', allowedRoles: [] },
    { id: 'salon-preview', name: 'salão-mudae', type: 'text', mudae: true, categoryId: 'text', allowedRoles: [] }],
  members: [salonMember], people: [salonMember], voice: [], bans: [], myPerms: ['ADMIN', 'SEND_MESSAGES'] };
Sounds.play = () => {};
document.documentElement.classList.remove('show-landing');
$('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
const controls = el('div', { id: 'salon-preview-controls' },
  el('label', {}, 'Rede ', el('select', { id: 'preview-network' }, ['normal', 'lenta', 'falha', 'sem fotos'].map((value) => el('option', { value, textContent: value })))),
  el('label', {}, 'Raridade ', el('select', { id: 'preview-rarity' }, ['common', 'rare', 'epic', 'legendary'].map((value) => el('option', { value, textContent: value })))),
  salonParams.has('catalog') ? el('label', {}, 'Personagem ', el('select', { id: 'preview-character' })) : null,
  el('output', { id: 'preview-report', textContent: 'Prévia local · imagens sintéticas' }),
  el('button', { type: 'button', ariaLabel: 'Ocultar controles de validação', onclick: () => controls.remove() }, '×'));
document.body.append(controls);
document.head.append(el('style', { textContent: '#salon-preview-controls{position:fixed;bottom:8px;left:12px;right:12px;z-index:999;display:flex;gap:12px;align-items:center;padding:8px 12px;border-radius:8px;background:#15121fee;color:#ddd;font:12px sans-serif}#salon-preview-controls select{background:#292331;color:#eee;border:1px solid #665781;border-radius:4px;padding:3px}#preview-report{margin-left:auto}@media(max-width:640px){#salon-preview-controls{flex-wrap:wrap;gap:6px}#preview-report{width:100%;margin:0}}' }));
$('#preview-network').value = salonParams.get('network') || 'normal';
$('#preview-rarity').value = salonParams.get('rarity') || 'common';
if (salonParams.has('catalog')) fetch('/preview-cards').then((res) => res.json()).then((cards) => {
  salonPreviewCards = cards;
  $('#preview-character').replaceChildren(...cards.map((card) => el('option', { value: card.id, textContent: card.name })));
  $('#preview-report').textContent = 'Prévia local · personagens do catálogo real';
});
let salonSequence = 0;
window.salonPreviewHarem = (ownerId) => {
  const chars = salonPreviewCards.map((card, i) => ({ ...card, rarity: ['common', 'rare', 'epic', 'legendary'][i], claimedAt: Date.now() - i * 1000 }));
  return { ownerId, chars, total: chars.length, value: chars.reduce((sum, card) => sum + card.value, 0), favorite: chars.at(-1) };
};
window.salonPreviewRoll = () => {
  const sequence = ++salonSequence, network = $('#preview-network').value, rarity = $('#preview-rarity').value;
  const duration = Number(salonParams.get('duration')) || { common: 1950, rare: 2400, epic: 2850, legendary: 3850 }[rarity];
  const portrait = (id, winner = false) => {
    const delay = network === 'sem fotos' ? 5000 : network === 'lenta' ? (winner ? 2600 : id % 2 ? 1300 : 0) : 0;
    const fail = network === 'falha' && (winner || id % 2) ? 1 : 0;
    return `/portrait/${id}.svg?roll=${sequence}&delay=${delay}&fail=${fail}&session=${salonPreviewSession}`;
  };
  const at = Date.now();
  const selected = salonPreviewCards.find((card) => String(card.id) === $('#preview-character')?.value);
  const msg = { id: 'preview-roll-' + sequence, bot: 'mudae', by: salonMember.id, ts: at, command: '$w',
    mudae: { kind: 'roll', revealAt: at + duration, expires: at + duration + 45_000, priorityUntil: at + duration + 3000,
      decoys: Array.from({ length: 8 }, (_, i) => portrait(i + 1)), ownerId: null,
      card: selected && network === 'normal' ? { ...selected, rarity } :
        { id: sequence, name: 'Estrela do Salão', series: 'Prévia visual', source: 'a', image: portrait(9, true), rank: 15, value: 1149, rarity } } };
  previewSocketHandlers.get('chat:message')({ channel: 'salon-preview', msg });
  let frames = 0, invalid = 0, maxGap = 0, last = performance.now();
  $('#preview-report').textContent = 'Medindo giro…';
  const sample = (at) => {
    maxGap = Math.max(maxGap, at - last); last = at; frames++;
    for (const img of document.querySelectorAll('.salon-reel img,.salon-card.big img.ready')) if (!img.complete || !img.naturalWidth) invalid++;
    if (Date.now() < msg.mudae.revealAt + 50) requestAnimationFrame(sample);
    else $('#preview-report').textContent = `${frames} quadros · ${invalid} imagens incompletas · maior intervalo ${Math.round(maxGap)}ms`;
  };
  requestAnimationFrame(sample);
  setTimeout(async () => {
    if (sequence !== salonSequence) return;
    const report = $('#preview-report');
    report.dataset.backdropAnimations = String(document.querySelector('.salon-showcase')?.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length || 0);
    report.dataset.requests = JSON.stringify(await (await fetch('/preview-stats?session=' + salonPreviewSession)).json());
  }, duration + 500);
};
render();
