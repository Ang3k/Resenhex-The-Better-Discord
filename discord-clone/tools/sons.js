// Gera os efeitos do soundboard em public/sfx/board a partir de gravações do Freesound com licença
// CC0 (domínio público): corta, filtra e nivela cada uma (loudnorm em duas passadas) para MP3.
// Os sons da interface (entrar, sair, mutar…) continuam sintetizados em public/sounds.js.
// Uso: node tools/sons.js — precisa do ffmpeg/ffprobe no PATH e de internet (prévias HQ do Freesound).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'public', 'sfx');
const TMP = path.join(require('os').tmpdir(), 'resenhex-sons');
// Efeitos do soundboard: id do Freesound, autor, trecho usado e o volume alvo (o grilo fica mais baixo de propósito).
const BOARD = {
  grilo: { id: 495396, user: 'felix.blume', title: 'Cricket, close recording: Santiago', from: 0, dur: 4.6, fadeIn: 0.15, fadeOut: 0.8, lufs: -22, filter: 'highpass=f=900' },
  trovao: { id: 652690, user: 'AyaDrevis', title: 'Thunder strike', from: 0.4, dur: 5, fadeOut: 1.6, lufs: -17 },
  aplausos: { id: 478414, user: 'thaighaudio', title: 'Concert audience applause 1', from: 0.9, dur: 5.5, fadeIn: 0.25, fadeOut: 1.6, lufs: -18 },
  badumtss: { id: 383898, user: 'deleted_user_7146007', title: 'Rimshot Joke Funny', from: 0.38, dur: 3.6, fadeOut: 0.7, lufs: -17 },
  buzina: { id: 414208, user: 'jacksonacademyashmore', title: 'Airhorn', from: 0, dur: 1.6, fadeOut: 0.08, lufs: -19 },
  fail: { id: 175409, user: 'kirbydx', title: 'wah wah sad trombone.wav', from: 0.15, dur: 4.85, fadeOut: 0.35, lufs: -18 },
  vitoria: { id: 456966, user: 'FunWithSound', title: 'Success Fanfare Trumpets.mp3', from: 0, dur: 3.8, fadeOut: 0.7, lufs: -18 },
  suspense: { id: 513332, user: 'shelbyshark', title: 'HorrorSting1.mp3', from: 1, dur: 5.5, fadeOut: 1.8, lufs: -17 },
};

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
// ffmpeg escreve as medições no stderr, mesmo quando dá certo.
const ffmpegLog = (args) => {
  const result = require('child_process').spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.slice(-600));
  return result.stderr;
};

// Loudness integrado; sons curtos (< 400 ms) ganham silêncio em volta para a medição funcionar.
function loudness(file) {
  const log = ffmpegLog(['-nostats', '-i', file, '-af', 'adelay=500|500,apad=pad_dur=1,ebur128', '-f', 'null', '-']);
  return Number(/I:\s+(-?[\d.]+) LUFS/.exec(log.split('Summary:').pop())[1]);
}

async function download(url, file) {
  if (fs.existsSync(file)) return;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Resenhex build de sons)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function previewUrl(sound) {
  const page = await (await fetch(`https://freesound.org/people/${sound.user}/sounds/${sound.id}/`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  if (!page.includes('creativecommons.org/publicdomain/zero/1.0')) throw new Error(`O som ${sound.id} não está mais em CC0.`);
  const url = /https:\/\/cdn\.freesound\.org\/previews\/[^"]+-hq\.mp3/.exec(page)?.[0];
  if (!url) throw new Error(`Prévia do som ${sound.id} não encontrada.`);
  return url;
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  const manifest = { version: 1, board: {} };

  // ---- soundboard ----
  const boardDir = path.join(OUT, 'board');
  fs.mkdirSync(boardDir, { recursive: true });
  for (const [name, s] of Object.entries(BOARD)) {
    const raw = path.join(TMP, `${s.id}.mp3`);
    await download(await previewUrl(s), raw);
    const shape = [s.filter, `afade=t=in:d=${s.fadeIn || 0.006}`, `afade=t=out:st=${(s.dur - s.fadeOut).toFixed(3)}:d=${s.fadeOut}`].filter(Boolean).join(',');
    const input = ['-nostats', '-ss', String(s.from), '-t', String(s.dur), '-i', raw];
    const first = ffmpegLog([...input, '-af', `${shape},loudnorm=I=${s.lufs}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
    const m = JSON.parse(first.slice(first.lastIndexOf('{'), first.lastIndexOf('}') + 1));
    const norm = `loudnorm=I=${s.lufs}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    const dest = path.join(boardDir, name + '.mp3');
    run('ffmpeg', ['-y', ...input, '-af', `${shape},${norm},aresample=48000`, '-c:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', dest]);
    const duration = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]));
    manifest.board[name] = { duration: Number(duration.toFixed(2)) };
    console.log(`board ${name} <- freesound ${s.id}  ${loudness(dest)} LUFS  ${duration.toFixed(2)} s  ${(fs.statSync(dest).size / 1024).toFixed(1)} KB`);
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'CREDITOS.md'), [
    '# Sons do Resenhex',
    '',
    'Os efeitos desta pasta são de domínio público (CC0 1.0). Os créditos não são obrigatórios, mas ficam registrados.',
    'Gerados por `tools/sons.js`.',
    '',
    '## Soundboard (`board/`)',
    '',
    'Gravações do Freesound com licença CC0 1.0, cortadas e niveladas:',
    '',
    ...Object.entries(BOARD).map(([name, s]) => `- **${name}**: "${s.title}", por ${s.user} (https://freesound.org/s/${s.id}/)`),
    '',
  ].join('\n'));
  console.log('pronto:', OUT);
}

main().catch((error) => { console.error(error); process.exit(1); });
