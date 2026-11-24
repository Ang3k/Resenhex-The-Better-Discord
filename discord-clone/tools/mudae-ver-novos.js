#!/usr/bin/env node
// Galeria para CONFERIR os personagens novos do catálogo candidato (tools/mudae-montar-expandido.js) antes de publicar.
// Sorteia personagens que NÃO estão no catálogo publicado e gera uma página HTML com foto, nome, obra, fonte e marcas.
// Imagens +18 (VN adulta ou nota sexual > 0) ficam borradas até clicar. Não altera nenhum dado.
// Uso: node tools/mudae-ver-novos.js [--n=60] [--fonte=a|g|c|d|s|v] [--obra="Scooby"] [--nome="Daphne"] [--adulto] [--sem-adulto] [--fora] [--semente=1]
//      --n        quantos por fonte (padrão 40)        --obra / --nome  filtra por trecho do texto
//      --adulto   só +18      --sem-adulto  esconde +18      --fora  só os marcados "fora da roleta"
// Saída: tools/mudae-cache/prototipos/conferir-novos.html (abra no navegador).
const fs = require('fs');
const path = require('path');
const { normalize } = require('./mudae-fontes/coleta');

const CACHE = process.env.MUDAE_CACHE || path.join(__dirname, 'mudae-cache');
const PROTO = path.join(CACHE, 'prototipos');
const PUBLICADO = process.env.MUDAE_CATALOG || path.join(__dirname, '..', 'server', 'mudae-catalogo.json');
const NOMES = { a: 'Anime/Mangá/Manhwa', g: 'Jogos', c: 'Quadrinhos', d: 'Desenhos', s: 'Séries/Filmes', v: 'Visual novels' };
const IMG_ANILIST = 'https://s4.anilist.co/file/anilistcdn/character/large/';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3).replace(/^"|"$/g, '') : d; };

function rng(seed) { let t = seed >>> 0; return () => { t = (t + 0x6D2B79F5) | 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

function main() {
  const candidato = path.join(PROTO, 'catalogo-expandido.json');
  if (!fs.existsSync(candidato)) throw new Error('Rode antes: node tools/mudae-montar-expandido.js');
  const publicado = new Set(JSON.parse(fs.readFileSync(PUBLICADO, 'utf8')).map((r) => String(r[0])));
  const todas = JSON.parse(fs.readFileSync(candidato, 'utf8'));
  const meta = new Map();
  const metaFile = path.join(PROTO, 'catalogo-expandido-meta.ndjson');
  if (fs.existsSync(metaFile)) for (const l of fs.readFileSync(metaFile, 'utf8').split('\n')) if (l) { const m = JSON.parse(l); meta.set(m.id, m); }

  const nome = normalize(opt('nome', ''));
  const obra = normalize(opt('obra', ''));
  const fonteFiltro = opt('fonte', '');
  let novas = todas.filter((r) => !publicado.has(String(r[0])));
  const total = novas.length;
  const adultoDe = (r) => { const m = meta.get(String(r[0])); return !!(m && (m.adulto || m.sexual > 0)); };
  if (fonteFiltro) novas = novas.filter((r) => (r[6] || 'a') === fonteFiltro);
  if (nome) novas = novas.filter((r) => normalize(r[1]).includes(nome));
  if (obra) novas = novas.filter((r) => normalize(r[2]).includes(obra));
  if (args.includes('--adulto')) novas = novas.filter(adultoDe);
  if (args.includes('--sem-adulto')) novas = novas.filter((r) => !adultoDe(r));
  if (args.includes('--fora')) novas = novas.filter((r) => r[7] === 1);

  const rand = rng(Number(opt('semente', Date.now() % 100000)));
  const n = Number(opt('n', 40));
  const grupos = {};
  for (const r of novas) (grupos[r[6] || 'a'] ||= []).push(r);
  const escolhidos = {};
  for (const [f, list] of Object.entries(grupos)) {
    const copia = list.slice();
    for (let i = copia.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [copia[i], copia[j]] = [copia[j], copia[i]]; }
    escolhidos[f] = copia.slice(0, nome || obra ? n * 3 : n);
  }

  const carta = (r) => {
    const m = meta.get(String(r[0])) || {};
    const foto = /^https?:/.test(r[3]) ? r[3] : IMG_ANILIST + r[3];
    const adulto = adultoDe(r);
    const tags = [adulto ? '+18' : '', m.pais === 'KR' ? 'manhwa' : m.pais === 'CN' || m.pais === 'TW' ? 'manhua' : '', m.tipo === 'MANGA' && !m.pais ? 'mangá' : '', r[7] === 1 ? 'fora da roleta' : '', r[4] ? (r[4] === 'F' ? 'waifu' : 'husbando') : 'sem gênero'].filter(Boolean);
    return `<figure class="${adulto ? 'adulto' : ''}" onclick="this.classList.toggle('ver')"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(foto)}" alt="" onerror="this.parentNode.classList.add('quebrada')">
      <figcaption><b>${esc(r[1])}</b><span>${esc(r[2])}</span><small>${esc(String(r[0]))} · score ${esc(r[5])}</small><em>${tags.map(esc).join(' · ')}</em></figcaption></figure>`;
  };
  const secoes = Object.entries(escolhidos).map(([f, list]) => `<h2>${esc(NOMES[f] || f)} <small>(${list.length} de ${grupos[f].length} novos)</small></h2><div class="grid">${list.map(carta).join('')}</div>`).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Conferir personagens novos</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:16px}h1,h2{font-weight:600}h2 small{font-weight:400;color:#999}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
figure{margin:0;background:#1c1c1f;border-radius:8px;overflow:hidden;cursor:pointer}figure img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:#333}
figure.adulto:not(.ver) img{filter:blur(22px)}figure.quebrada img{opacity:.15}figure.quebrada:after{content:"foto quebrada";display:block;color:#f66;padding:4px 8px}
figcaption{padding:6px 8px;display:grid;gap:2px}figcaption span{color:#9ab}figcaption small{color:#777;word-break:break-all}figcaption em{color:#d9a;font-style:normal;font-size:12px}</style>
<h1>Personagens novos (${total} no total) — amostra</h1>
<p>Clique numa carta +18 para ver a foto. Filtros usados: ${esc(args.join(' ') || 'nenhum')}</p>
${secoes || '<p>Nada encontrado com esses filtros.</p>'}`;
  const out = path.join(PROTO, 'conferir-novos.html');
  fs.writeFileSync(out, html);
  console.log('Novos no candidato: ' + total + ' | filtrados: ' + novas.length + ' | mostrando ' + Object.values(escolhidos).reduce((a, l) => a + l.length, 0));
  console.log('Abra: ' + out);
}

try { main(); } catch (err) { console.error(err.message); process.exitCode = 1; }
