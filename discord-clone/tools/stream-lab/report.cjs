// Resumo dos resultados: node tools/stream-lab/report.cjs resultados.jsonl [filtro]
const fs = require('node:fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const f = (x, d = 1) => x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d);
for (const r of rows) {
  if (only && !only.test(r.name)) continue;
  if (r.error) { console.log(`\n${r.name}: ERRO ${r.error}`); continue; }
  const s = r.streamer || {}, upload = (s.senders || []).flatMap((x) => x.layers).reduce((sum, l) => sum + (l.kbps || 0), 0);
  console.log(`\n${r.name}  [CPU de quem transmite ${f(s.cpu?.streamer, 0)}% · rede ${f(s.cpu?.Utility, 0)}% · envio ${f(upload, 0)} kbps · captura ${f(s.senders?.[0]?.srcFps)} fps]`);
  if (s.app) console.log(`  app ${s.app.variant}: perfil ${s.app.preset} · troca por CPU ${s.app.fallback || 'não'} · degraus ${s.app.levels?.join('/')} · ${s.app.encoder || ''}`);
  for (const x of s.senders || []) for (const l of x.layers) {
    const limits = Object.entries(l.qld || {}).filter(([k, v]) => k !== 'none' && v > 0.05).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ');
    console.log(`  envio ${x.i}${l.rid ? '/' + l.rid : ''}: ${l.codec?.split('/')[1]} ${l.res} ${f(l.encFps)} fps ${f(l.kbps, 0)} kbps · codificação ${f(l.encodeMs)} ms${limits ? ' · limitado por ' + limits : ''}`);
  }
  for (const v of r.viewers || []) {
    const heights = Object.entries(v.heights || {}).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}p×${n}`).join(' ');
    console.log(`  espectador ${v.i} (bloco ${r.cfg.compareHeights?.[v.i] || 'cheio'}): PSNR ${f(v.psnr, 2)} dB (p10 ${f(v.psnrP10, 2)}) · SSIM ${f(v.ssim, 4)} · ${f(v.deliveredFps)} fps · ${f(v.kbps, 0)} kbps · travadas ${v.stalls} (${v.stallMs} ms) · latência ${f(v.latencyMs, 0)} ms (p95 ${f(v.latencyP95, 0)}) · ${v.codec?.split('/')[1]} · ${heights}`);
  }
}
