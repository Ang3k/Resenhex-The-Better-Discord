// Resposta por ação (maior resposta depois de cada marca), antes → depois, como faixa mín–máx das rodadas.
// Uso: node acoes-table.js <antes.json> <depois.json>
const fs = require('fs');
const A = JSON.parse(fs.readFileSync(process.argv[2])).menus_modais.filter((r) => r.por_acao);
const B = JSON.parse(fs.readFileSync(process.argv[3])).menus_modais.filter((r) => r.por_acao);
const NAMES = { 'menu-membro': 'Menu do membro (botão direito)', emoji: 'Seletor de emoji', 'menu-servidor': 'Menu do servidor', perfil: 'Cartão de perfil', configuracoes: 'Configurações', 'canal-memes': 'Trocar para `#memes` (2 mensagens)', 'canal-geral': 'Voltar para `#geral` (221 mensagens)', 'servidor-2': 'Trocar de servidor (ida)', 'servidor-1': 'Trocar de servidor (volta)' };
const range = (runs, k) => { const v = runs.map((r) => r.por_acao[k]).filter((x) => typeof x === 'number'); if (!v.length) return '—'; const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? String(lo) : `${lo}–${hi}`; };
console.log('| Ação | Antes (ms) | Depois (ms) |');
console.log('|---|---|---|');
for (const [k, label] of Object.entries(NAMES)) console.log(`| ${label} | ${range(A, k)} | ${range(B, k)} |`);
console.log(`\n(antes: ${A.length} rodadas; depois: ${B.length} rodadas)`);
