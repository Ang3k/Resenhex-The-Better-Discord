// Regras do overlay que não dependem do Electron (testadas em test/lib.test.js).

const MARGIN = 16;
const WIDTH = 240;
const MAX_HEIGHT = 600;
const MAX_USERS = 25;
// Padrão: meio da tela, à esquerda.
const DEFAULT_POSITION = { x: 0, y: 0.5 };
// Versões anteriores do site mandavam um dos quatro cantos.
const CORNERS = { 'top-left': { x: 0, y: 0 }, 'top-right': { x: 1, y: 0 }, 'bottom-left': { x: 0, y: 1 }, 'bottom-right': { x: 1, y: 1 } };

const fraction = (value) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;

// Posição em frações (0 a 1) do espaço livre na área do jogo: 0 encosta à esquerda/no topo, 1 à
// direita/embaixo, 0,5 centraliza. Assim vale para qualquer resolução e tamanho de janela.
function overlayPosition(value) {
  const x = fraction(value?.x), y = fraction(value?.y);
  if (x !== null && y !== null) return { x, y };
  return { ...(CORNERS[value?.corner] || DEFAULT_POSITION) };
}

function overlayConfig(value) {
  return { enabled: value?.enabled === true, ...overlayPosition(value) };
}

// Janela do overlay dentro da área do jogo (em DIP), com margem e sem passar da borda.
function overlayBounds(area, position, size) {
  const width = Math.min(size.width, Math.max(0, area.width - 2 * MARGIN));
  const height = Math.min(size.height, Math.max(0, area.height - 2 * MARGIN));
  return {
    x: Math.round(area.x + MARGIN + position.x * (area.width - 2 * MARGIN - width)),
    y: Math.round(area.y + MARGIN + position.y * (area.height - 2 * MARGIN - height)),
    width: Math.round(width), height: Math.round(height),
  };
}

const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const unit = (value, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;

// O resumo da chamada vem do site; aqui só passa o que o overlay sabe desenhar.
// Imagens só do próprio site (caminho que começa com uma barra), nunca de outro endereço.
function overlayState(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.users)) return null;
  const users = value.users.slice(0, MAX_USERS).flatMap((user) => {
    if (!user || typeof user.id !== 'string' || !user.id) return [];
    const avatar = text(user.avatarUrl, 300);
    const crop = user.avatarCrop && typeof user.avatarCrop === 'object'
      ? { x: unit(user.avatarCrop.x, 0, 1), y: unit(user.avatarCrop.y, 0, 1), zoom: unit(user.avatarCrop.zoom, 1, 4) } : null;
    return [{
      id: text(user.id, 80), name: text(user.name, 64) || '?',
      color: /^#[0-9a-f]{6}$/i.test(user.color) ? user.color : '#5865f2',
      avatarUrl: avatar.startsWith('/') && !avatar.startsWith('//') ? avatar : '',
      avatarCrop: crop && crop.x !== null && crop.y !== null && crop.zoom !== null ? crop : null,
      speaking: user.speaking === true, muted: user.muted === true, deafened: user.deafened === true,
      serverMuted: user.serverMuted === true, serverDeafened: user.serverDeafened === true,
    }];
  });
  return { channel: text(value.channel, 100), users, more: Math.max(0, value.users.length - users.length) };
}

module.exports = { WIDTH, MAX_HEIGHT, overlayConfig, overlayPosition, overlayBounds, overlayState };
