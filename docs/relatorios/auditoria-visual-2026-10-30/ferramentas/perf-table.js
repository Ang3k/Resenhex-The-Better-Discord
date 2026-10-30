// Resume um ou dois JSON de perf.js (antes/depois) em tabela Markdown com medianas das rodadas.
const fs = require('fs');
const A = JSON.parse(fs.readFileSync(process.argv[2]));
const B = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3])) : null;
const med = (xs) => { const s = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const get = (runs, f) => med((runs || []).filter((r) => !r.erro).map(f));
const cols = [
  ['Quadros/s', (r) => r.quadros_por_s],
  ['Pinturas/s', (r) => r.pinturas_por_s],
  ['Thread principal (ms/s)', (r) => r.thread_principal_ms_por_s],
  ['Estilo (ms/s)', (r) => r.estilo_ms_por_s],
  ['Timers/s', (r) => r.timers_por_s],
  ['Tarefas > 50 ms', (r) => r.tarefas_longas],
  ['Maior tarefa (ms)', (r) => r.maior_tarefa_ms],
  ['Quadros longos (LoAF)', (r) => r.loaf],
  ['Maior resposta a clique (ms)', (r) => r.maior_resposta_ms],
  ['Respostas > 100 ms', (r) => r.respostas_acima_100ms],
  ['% quadros atrasados (rAF)', (r) => r.pct_atrasados],
  ['FPS médio (rAF)', (r) => r.fps_medio],
];
const names = Object.keys(A);
const fmt = (v) => (v == null ? '—' : String(v).replace('.', ','));
console.log('| Métrica | ' + names.map((n) => n.replace(/_/g, ' ')).join(' | ') + ' |');
console.log('|---|' + names.map(() => '---').join('|') + '|');
for (const [label, f] of cols) {
  const row = names.map((n) => { const a = get(A[n], f); if (!B) return fmt(a); const b = get(B[n], f); return `${fmt(a)} → ${fmt(b)}`; });
  if (row.every((x) => x === '—' || x === '— → —')) continue;
  console.log(`| ${label} | ${row.join(' | ')} |`);
}
