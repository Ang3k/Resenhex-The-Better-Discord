// Estatística do A/B por ação (saída de ab-acoes.sh): mediana, quantas passam de 100 ms e o z de Mann-Whitney.
const fs = require('fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const acc = {};
for (const { versao, dados } of rows) for (const [k, v] of Object.entries(dados.respostas)) { if (k === 'fechar' || !k) continue; acc[k] = acc[k] || { main: [], polish: [] }; acc[k][versao].push(...v); }
const med = (x) => { const s = [...x].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
function z(a, b) {
  const all = [...a.map((x) => [x, 0]), ...b.map((x) => [x, 1])].sort((p, q) => p[0] - q[0]); const ranks = [];
  for (let i = 0; i < all.length;) { let j = i; while (j < all.length && all[j][0] === all[i][0]) j++; for (let k = i; k < j; k++) ranks.push([(i + j + 1) / 2, all[k][1]]); i = j; }
  const R1 = ranks.filter((x) => x[1] === 0).reduce((s, x) => s + x[0], 0); const n1 = a.length, n2 = b.length;
  return ((R1 - n1 * (n1 + 1) / 2) - n1 * n2 / 2) / Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
}
const ORDER = ['menu do membro', 'menu do servidor', 'cartão de perfil', 'configurações', 'abrir emoji', '#memes', '#geral', 'servidor (ida)', 'servidor (volta)'];
console.log('| Ação | `main` (mediana, ms) | `visual-polish` (mediana, ms) | Acima de 100 ms | z |');
console.log('|---|---|---|---|---|');
for (const k of ORDER) { const o = acc[k]; if (!o) continue; const f = (x) => `${x.filter((v) => v > 100).length}/${x.length}`; console.log(`| ${k} | ${med(o.main)} | ${med(o.polish)} | ${f(o.main)} → ${f(o.polish)} | ${z(o.main, o.polish).toFixed(2).replace('.', ',')} |`); }
