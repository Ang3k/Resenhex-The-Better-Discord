// Clipes da chamada: o registro de cada vídeo, quem pode baixar (quem estava na chamada) e os
// tokens de download. Os tokens ficam só em memória: valem uma vez, por 2 minutos.
const crypto = require('node:crypto');

const CLIP_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 120_000;
// O app de Android abre o link no WebView e depois no navegador (DownloadListener): poucos usos, no mesmo prazo.
const TOKEN_USES = 3;
const MAX_CLIP_BYTES = 25 * 1024 * 1024;
const MAX_THUMB_BYTES = 40 * 1024;
const MAX_CLIP_SECONDS = 31;

// `changed(chave)` marca o pedaço do banco que mudou (server/store.js).
function createClipStore({ root, now = Date.now, randomId, serverExists = () => true, changed = () => {} }) {
  root.clips ||= {};
  const tokens = new Map(); // token -> { id, accountId, expires }

  function add({ file, voice, serverId, creatorId, duration, channelName, recipients, thumb }) {
    const clip = { id: randomId(), file, voice, serverId, creatorId, duration, channelName, recipients: [...new Set(recipients)], thumb, createdAt: now() };
    root.clips[clip.id] = clip;
    changed('clips/' + clip.id);
    return clip;
  }

  const listFor = (accountId, voice) => Object.values(root.clips)
    .filter((c) => c.voice === voice && c.recipients.includes(accountId))
    .sort((a, b) => b.createdAt - a.createdAt);

  function issueToken(id, accountId) {
    const clip = root.clips[id];
    if (!clip || !clip.recipients.includes(accountId)) return null;
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, { id, accountId, expires: now() + TOKEN_TTL_MS, uses: TOKEN_USES });
    return token;
  }

  function consumeToken(id, token) {
    const entry = tokens.get(token);
    if (!entry) return null;
    if (--entry.uses <= 0) tokens.delete(token);
    if (entry.id !== id || entry.expires < now()) return null;
    return root.clips[id] || null;
  }

  function prune() {
    const limit = now() - CLIP_TTL_MS, removed = [];
    for (const clip of Object.values(root.clips)) {
      if (clip.createdAt < limit || (clip.serverId && !serverExists(clip.serverId))) {
        delete root.clips[clip.id];
        changed('clips/' + clip.id);
        removed.push(clip.file);
      }
    }
    for (const [token, entry] of tokens) if (entry.expires < now() || !root.clips[entry.id]) tokens.delete(token);
    return removed;
  }

  const publicView = ({ id, creatorId, duration, channelName, createdAt, thumb }) => ({ id, creatorId, duration, channelName, createdAt, thumb });

  return { add, listFor, issueToken, consumeToken, prune, publicView };
}

module.exports = { createClipStore, CLIP_TTL_MS, TOKEN_TTL_MS, MAX_CLIP_BYTES, MAX_THUMB_BYTES, MAX_CLIP_SECONDS };
