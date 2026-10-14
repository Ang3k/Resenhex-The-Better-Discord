// Gera os clipes sintéticos do laboratório: node tools/stream-lab/clips.cjs [desktop30|game60|gamehard60 ...]
// Precisa de xvfb-run e ffmpeg. Cada clipe tem ~1 GB (Y4M 1080p sem compressão) e fica em $STREAM_LAB_DIR/clips.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { CLIPS, electronPath } = require('./paths.cjs');

const JOBS = {
  desktop30: { kind: 'desktop', frames: 300, fps: 30 }, // 10 s
  game60: { kind: 'game', frames: 360, fps: 60 }, // 6 s
  gamehard60: { kind: 'game-hard', frames: 360, fps: 60 },
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['desktop30', 'game60'];
fs.mkdirSync(CLIPS, { recursive: true });
for (const name of names) {
  const job = JOBS[name];
  if (!job) { console.error(`Clipe desconhecido: ${name}. Opções: ${Object.keys(JOBS).join(', ')}`); process.exit(1); }
  const out = path.join(CLIPS, name + '.y4m');
  console.log(`Gerando ${out}…`);
  const result = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1920x1200x24', electronPath(), '--no-sandbox', path.join(__dirname, 'clip-main.cjs')],
    { stdio: 'inherit', env: { ...process.env, CLIP_JOB: JSON.stringify({ ...job, out }) } });
  if (result.status !== 0) process.exit(result.status || 1);
}
