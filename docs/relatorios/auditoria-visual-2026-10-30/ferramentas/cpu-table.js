// Tabela de CPU dos processos (rodada sem lentidão), antes → depois, com medianas. Uso: node cpu-table.js <antes.json> <depois.json>
const fs = require('fs');
const A = JSON.parse(fs.readFileSync(process.argv[2]));
const B = JSON.parse(fs.readFileSync(process.argv[3]));
const med = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const get = (runs, f) => med((runs || []).filter((r) => !r.erro).map(f));
const fmt = (v) => (v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ','));
const NAMES = { ocioso: 'Parado no canal', chamada_palco: 'Chamada (palco)', chamada_no_chat: 'Chamada (no chat)', chamada_sem_foco: 'Chamada sem foco' };
const cols = [
  ['Página (ms/s)', (r) => r.cpu_ms_por_s.renderer],
  ['GPU (ms/s)', (r) => r.cpu_ms_por_s.gpu],
  ['Navegador (ms/s)', (r) => r.cpu_ms_por_s.browser],
  ['Áudio/rede (ms/s)', (r) => r.cpu_ms_por_s.outros],
  ['Thread principal (ms/s)', (r) => r.thread_principal_ms_por_s],
  ['Quadros/s', (r) => r.quadros_por_s],
  ['Pinturas/s', (r) => r.pinturas_por_s],
];
console.log('| Cenário | ' + cols.map((c) => c[0]).join(' | ') + ' |');
console.log('|---|' + cols.map(() => '---').join('|') + '|');
for (const n of Object.keys(NAMES)) {
  if (!A[n] || !B[n]) continue;
  console.log(`| ${NAMES[n]} | ` + cols.map(([, f]) => `${fmt(get(A[n], f))} → ${fmt(get(B[n], f))}`).join(' | ') + ' |');
}
