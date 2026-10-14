const { createHash } = require('node:crypto');
const { AccessToken, RoomServiceClient, WebhookReceiver, TrackSource } = require('livekit-server-sdk');

const roomName = (server, channel) => 'resenhex-' + createHash('sha256').update(JSON.stringify([server ?? null, channel])).digest('hex').slice(0, 32);

// Credentials stay on the application server. A socket's authenticated voice
// membership is the authority, including after moderation and reconnects.
// Each room keeps one transport while occupied. If LiveKit is unreachable, rooms
// fall back to P2P and only return to the SFU after they empty.
function mediaSfu({ env = process.env, membership, service, onSwitch = () => {}, log = console.warn }) {
  const url = env.LIVEKIT_URL;
  const enabled = !!url;
  if (enabled && (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET)) throw new Error('LiveKit: configure API key and secret.');
  if (enabled && !/^wss?:\/\//.test(url)) throw new Error('LiveKit: URL must use ws:// or wss://.');
  const client = enabled ? service || new RoomServiceClient(env.LIVEKIT_INTERNAL_URL || url.replace(/^ws/, 'http'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { requestTimeout: 3 }) : null;
  const receiver = enabled ? new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET) : null;
  const queues = new Map(), signatures = new Map(), transports = new Map();
  let healthy = true;
  const isSfu = (room) => transports.get(room)?.mode === 'sfu';
  function fallback() {
    if (healthy) log('LiveKit indisponível: as chamadas passam para P2P.');
    healthy = false;
    for (const [room, entry] of transports) {
      if (entry.mode !== 'sfu') continue;
      entry.mode = 'p2p';
      for (const key of signatures.keys()) if (key.startsWith(room + ':')) signatures.delete(key);
      onSwitch(entry.server, entry.channel, 'p2p');
    }
  }
  async function check() {
    if (typeof client.listRooms !== 'function') return;
    try { await client.listRooms(); if (!healthy) log('LiveKit voltou: chamadas novas usam o SFU.'); healthy = true; }
    catch { fallback(); }
  }
  if (enabled && env.LIVEKIT_HEALTH_MS !== '0') setInterval(check, Number(env.LIVEKIT_HEALTH_MS) || 10_000).unref();
  function enqueue(room, sid, task) {
    const key = room + ':' + sid;
    const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(task);
    queues.set(key, next);
    next.catch(() => log('LiveKit: media control failed; retry on the next state update.')).finally(() => { if (queues.get(key) === next) queues.delete(key); });
    return next;
  }
  function permissions(member) {
    const sources = [];
    if (member.speak) sources.push(TrackSource.MICROPHONE);
    if (member.stream) sources.push(TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
    return { canPublish: sources.length > 0, canPublishSources: sources, canSubscribe: !member.deafened, canPublishData: false, canUpdateMetadata: false };
  }
  // fallback: this client could not reach the SFU media ports (blocked network or
  // closed firewall); its room continues in P2P, other rooms are unaffected.
  async function credentials(sid, { fallback: unreachable = false } = {}) {
    if (!enabled) return { transport: 'p2p' };
    const member = membership(sid);
    if (!member) throw new Error('Entre em uma chamada antes de conectar a mídia.');
    const room = roomName(member.server, member.channel);
    // Finish removal of an earlier incarnation before the same socket rejoins.
    await (queues.get(room + ':' + sid) || Promise.resolve()).catch(() => {});
    if (!transports.has(room)) transports.set(room, { mode: healthy ? 'sfu' : 'p2p', server: member.server, channel: member.channel });
    if (unreachable && isSfu(room)) {
      const entry = transports.get(room);
      entry.mode = 'p2p';
      for (const key of signatures.keys()) if (key.startsWith(room + ':')) signatures.delete(key);
      log('LiveKit: um cliente não alcançou o servidor de mídia; a sala passou para P2P.');
      onSwitch(entry.server, entry.channel, 'p2p');
    }
    if (!isSfu(room)) return { transport: 'p2p' };
    try { await client.createRoom({ name: room, emptyTimeout: 60, departureTimeout: 20 }); }
    catch { fallback(); return { transport: 'p2p' }; }
    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity: sid, ttl: '1m' });
    const permission = permissions(member);
    token.addGrant({ roomJoin: true, room, ...permission, canUpdateOwnMetadata: false });
    const jwt = await token.toJwt();
    const current = membership(sid);
    if (!current || roomName(current.server, current.channel) !== room) throw new Error('A chamada mudou. Conecte novamente.');
    return { transport: 'sfu', url, token: jwt, room };
  }
  function sync(sid, force = false) {
    if (!enabled) return Promise.resolve();
    const member = membership(sid);
    if (!member) return Promise.resolve();
    const room = roomName(member.server, member.channel), permission = permissions(member);
    if (!isSfu(room)) return Promise.resolve();
    const key = room + ':' + sid, signature = JSON.stringify(permission);
    if (!force && signatures.get(key) === signature) return Promise.resolve();
    signatures.set(key, signature);
    return enqueue(room, sid, async () => {
      try {
        const participant = await client.updateParticipant(room, sid, { permission });
        // Removing publication permission must also silence existing tracks. LiveKit
        // refuses remote unmute by default, so the client unmutes its own tracks once
        // the permission returns (public/media-sfu.js).
        for (const track of participant.tracks || []) {
          if (!permission.canPublishSources.includes(track.source) && !track.muted) await client.mutePublishedTrack(room, sid, track.sid, true);
        }
      } catch (error) { signatures.delete(key); throw error; }
    });
  }
  function leave(sid, server, channel) {
    if (!enabled) return Promise.resolve();
    const room = roomName(server, channel);
    signatures.delete(room + ':' + sid);
    if (!isSfu(room)) return Promise.resolve();
    return enqueue(room, sid, () => client.removeParticipant(room, sid));
  }
  async function webhook(body, authorization) {
    if (!enabled) throw new Error('LiveKit desativado.');
    const event = await receiver.receive(body, authorization);
    if (!['participant_joined', 'track_published'].includes(event.event)) return;
    const sid = event.participant?.identity, room = event.room?.name;
    if (!sid || !room) return;
    const member = membership(sid);
    if (!member || roomName(member.server, member.channel) !== room) {
      await enqueue(room, sid, () => client.removeParticipant(room, sid));
    } else await sync(sid, true);
  }
  // The room emptied: the next call chooses its transport again.
  const vacate = (server, channel) => { transports.delete(roomName(server, channel)); };
  // P2P signaling is allowed only in rooms that are not on the SFU.
  const allowsP2p = (server, channel) => !enabled || transports.get(roomName(server, channel))?.mode === 'p2p';
  return { enabled, credentials, sync, leave, vacate, allowsP2p, webhook, check };
}
module.exports = { mediaSfu, roomName };
