#!/usr/bin/env node
// Mostra o andamento das coletas de personagens (AniList completo e wikis do Fandom). Só lê arquivos; pode rodar a qualquer hora.
// Uso: node tools/mudae-progresso.js        (ou: watch -n 30 node tools/mudae-progresso.js)
const fs = require('fs');
const path = require('path');
const { GRUPOS } = require('./mudae-fontes/fandom-expandido');

const CACHE = process.env.MUDAE_CACHE || path.join(__dirname, 'mudae-cache');
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const fmt = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') : m + ' min'; };
const barra = (p) => '[' + '#'.repeat(Math.round(p * 20)).padEnd(20, '.') + '] ' + Math.round(p * 100) + '%';

// ---- AniList: varre ids de 1 até ~430 mil, 50 por página, a ~28 páginas/min (limite de 30/min do AniList hoje).
const ANILIST_ULTIMO_ID = 430_000; // estimativa: nos testes, o id 450000 já não tinha ninguém
const al = read(path.join(CACHE, 'anilist-completo', 'progresso.json'));
console.log('AniList completo (anime, mangá, manhwa, manhua, +18)');
if (!al) console.log('  não iniciado: node tools/mudae-fontes/anilist-completo.js');
else {
  const fim = read(path.join(CACHE, 'anilist-completo', 'relatorio.json'));
  const p = Math.min(1, al.proximo / ANILIST_ULTIMO_ID);
  const arq = path.join(CACHE, 'anilist-completo', 'progresso.json');
  const parado = Date.now() - fs.statSync(arq).mtimeMs;
  const ritmo = al.paginas && al.iniciadoEm ? al.paginas / Math.max(1, (fs.statSync(arq).mtimeMs - Date.parse(al.iniciadoEm)) / 60000) : 28;
  console.log('  ' + barra(fim ? 1 : p) + '  id ' + al.proximo + ' de ~' + ANILIST_ULTIMO_ID);
  console.log('  personagens aceitos: ' + al.aceitos + ' (de ' + al.existem + ' que existem) | descartados: ' + JSON.stringify(al.descartados));
  if (fim) console.log('  TERMINOU em ' + fim.terminouEm + ' (' + fim.motivo + ')');
  else {
    const faltam = Math.max(0, (ANILIST_ULTIMO_ID - al.proximo) / 50);
    console.log('  falta ~' + fmt(faltam / Math.max(ritmo, 1) * 60000) + ' (a ' + ritmo.toFixed(1) + ' páginas/min)');
    if (parado > 5 * 60_000) console.log('  ATENÇÃO: sem gravar há ' + fmt(parado) + '. O processo caiu? Rode de novo: ele continua de onde parou.');
  }
}

// ---- Fandom: um relatório por grupo, com uma "unit" por wiki terminada.
console.log('\nFandom expandido (desenhos, jogos, quadrinhos, séries)');
for (const [nome, { franchises, label }] of Object.entries(GRUPOS)) {
  const rep = read(path.join(CACHE, 'relatorios', label + '-fandom.json'));
  const saida = read(path.join(CACHE, 'prototipos', 'fandom-' + nome + '.json'));
  const parcial = read(path.join(CACHE, 'prototipos', 'fandom-' + nome + '.parcial.json'));
  if (!saida && parcial) console.log('  ' + nome.padEnd(11) + 'PARCIAL: ' + parcial.length + ' personagens (alguma wiki falhou por rede; rode de novo ou use o coletar-tudo)');
  if (saida) { console.log('  ' + nome.padEnd(11) + barra(1) + '  PRONTO: ' + saida.length + ' personagens'); continue; }
  if (!rep) { console.log('  ' + nome.padEnd(11) + 'aguardando'); continue; }
  const feitas = Object.keys(rep.units || {}).length;
  const aceitos = Object.values(rep.units || {}).reduce((a, u) => a + (u.accepted || 0), 0);
  console.log('  ' + nome.padEnd(11) + barra(feitas / franchises.length) + '  ' + feitas + '/' + franchises.length + ' wikis, ' + aceitos + ' personagens, ' + (rep.counters?.requests || 0) + ' pedidos'
    + (rep.errors?.length ? ', ' + rep.errors.length + ' erro(s)' : ''));
  for (const e of (rep.errors || []).slice(0, 3)) console.log('      erro: ' + e.unit + ' — ' + e.message.slice(0, 100));
}

// ---- Candidato
const c = read(path.join(CACHE, 'prototipos', 'catalogo-expandido-relatorio.json'));
console.log('\nCatálogo candidato' + (c ? ' (montado em ' + c.geradoEm + ')' : ': ainda não montado (node tools/mudae-montar-expandido.js)'));
if (c) console.log('  ' + c.antes.total + ' -> ' + c.depois.total + ' personagens | obras ' + c.antes.obras + ' -> ' + c.depois.obras + ' | ativos na roleta: ' + c.depois.ativos);
