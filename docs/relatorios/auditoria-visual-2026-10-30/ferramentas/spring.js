// Gera curvas linear() de mola amortecida (massa 1). Uso: node spring.js zeta omega pontos
function spring(zeta, omega, maxT = 3) {
  const dt = 1 / 600; let x = 0, v = 0; const pts = [];
  for (let t = 0; t <= maxT; t += dt) { const a = -2 * zeta * omega * v - omega * omega * (x - 1); v += a * dt; x += v * dt; pts.push([t, x]); }
  // fim: quando fica a menos de 0,5% de 1 e com pouca velocidade dali em diante
  let end = pts.length - 1;
  for (let i = pts.length - 1; i >= 0; i--) if (Math.abs(pts[i][1] - 1) > 0.005) { end = Math.min(pts.length - 1, i + 1); break; }
  return { pts: pts.slice(0, end + 1), dur: pts[end][0] };
}
function toLinear({ pts, dur }, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = (i / n) * dur; const p = pts[Math.min(pts.length - 1, Math.round(t / (1 / 600)))]; out.push(+p[1].toFixed(3)); }
  out[out.length - 1] = 1;
  const overshoot = Math.max(...pts.map((p) => p[1])) - 1;
  return { css: `linear(${out.join(', ')})`, ms: Math.round(dur * 1000), overshoot: +(overshoot * 100).toFixed(1) };
}
for (const [name, z, w, n] of [['pop', 0.5, 22, 28], ['snappy', 0.62, 26, 22], ['soft', 0.78, 20, 18], ['press', 0.55, 30, 20]]) {
  const r = toLinear(spring(z, w), n);
  console.log(name, 'ζ=' + z, 'ω=' + w, r.ms + 'ms', 'sobra ' + r.overshoot + '%');
  console.log('  ' + r.css);
}
