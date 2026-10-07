// Inspect and exercise only the synthetic QA room, never production rooms.
const assert = require('node:assert/strict');
const { RoomServiceClient, TrackSource } = require('livekit-server-sdk');
const { mediaSfu, roomName } = require('../media-sfu');
const env = { LIVEKIT_URL: 'ws://127.0.0.1:17880', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:17880', LIVEKIT_API_KEY: 'qa-only', LIVEKIT_API_SECRET: 'qa-only-secret-not-for-production-1234567890' };
const service = new RoomServiceClient(env.LIVEKIT_INTERNAL_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
const room = roomName('qa', 'voice');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  let participants = await service.listParticipants(room);
  assert.ok(participants.length >= 3);
  assert.ok(participants.every((p) => ['preview-self', 'preview-1', 'preview-2', 'preview-extra'].includes(p.identity)));
  console.log('Participants:', JSON.stringify(participants.map((p) => ({ identity: p.identity, sources: p.tracks.map((t) => t.source) }))));
  if (process.argv[2] !== 'moderation') return;
  const membership = { server: 'qa', channel: 'voice', speak: false, stream: true, deafened: false };
  const media = mediaSfu({ env, service, membership: (sid) => sid === 'preview-1' ? membership : null });
  await media.sync('preview-1'); await pause(600);
  let participant = await service.getParticipant(room, 'preview-1');
  assert.ok(!participant.permission.canPublishSources.includes(TrackSource.MICROPHONE));
  assert.ok(participant.tracks.filter((t) => t.source === TrackSource.MICROPHONE).every((t) => t.muted));
  assert.ok(participant.tracks.some((t) => t.source === TrackSource.SCREEN_SHARE));
  console.log('Server mute confirmed; screen still published.');
  membership.speak = true;
  await media.sync('preview-1'); await pause(800);
  participant = await service.getParticipant(room, 'preview-1');
  assert.ok(participant.permission.canPublishSources.includes(TrackSource.MICROPHONE));
  // LiveKit refuses remote unmute by default; the Resenhex client unmutes itself
  // when this permission returns (public/media-sfu.js), synthetic sources do not.
  console.log('Microphone permission restored after moderation.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
