// Real LiveKit transport + actual call UI, using synthetic sources only.
// Start an SFU on ws://127.0.0.1:17880 (tools/sfu-staging.sh via SSH).
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { AccessToken } = require('livekit-server-sdk');
const { roomName } = require('../media-sfu');
const app = express(), directory = path.join(__dirname, '../public');
app.get('/config', (_req, res) => res.json({ hasOwner: true }));
app.get('/socket.io/socket.io.js', (_req, res) => res.type('js').send(`window.io=()=>({connected:false,on(){},connect(){},disconnect(){},timeout(){return this},emit(event,payload,callback){callback?.(null,{ok:true})}});`));
app.get('/vendor/livekit-client.js', (_req, res) => res.sendFile(require.resolve('livekit-client')));
app.get('/qa/token/:identity', async (req, res) => {
  if (!['preview-self', 'preview-1', 'preview-2', 'preview-extra'].includes(req.params.identity)) return res.sendStatus(403);
  const token = new AccessToken('qa-only', 'qa-only-secret-not-for-production-1234567890', { identity: req.params.identity, ttl: '5m' });
  token.addGrant({ roomJoin: true, room: roomName('qa', 'voice'), canPublish: true, canPublishSources: [1, 2, 3, 4], canSubscribe: true, canPublishData: false });
  res.json({ transport: 'sfu', url: 'ws://127.0.0.1:17880', token: await token.toJwt() });
});
app.get('/app.js', (_req, res) => {
  let fixture = fs.readFileSync(path.join(__dirname, 'stream-preview-fixture.js'), 'utf8');
  fixture = fixture.replace(/for \(let i = 1; i <= previewCount; i\+\+\) \{[\s\S]*?\n\}/, '');
  fixture += '\n' + fs.readFileSync(path.join(__dirname, 'sfu-preview-fixture.js'), 'utf8');
  res.type('js').send(fs.readFileSync(path.join(directory, 'app.js'), 'utf8').replace(/\}\)\(\);\s*$/, fixture + '\n})();'));
});
app.get('/', (_req, res) => res.type('html').send(fs.readFileSync(path.join(directory, 'index.html'), 'utf8').replace('<head>', '<head><script>localStorage.removeItem("token");</script>').replace('<script src="media-sfu.js"></script>', '<script src="/vendor/livekit-client.js"></script><script src="media-sfu.js"></script>').replace('<script src="landing.js"></script>', '')));
app.use(express.static(directory));
app.listen(38150, '127.0.0.1', () => console.log('SFU QA: http://127.0.0.1:38150/?streams=2'));
