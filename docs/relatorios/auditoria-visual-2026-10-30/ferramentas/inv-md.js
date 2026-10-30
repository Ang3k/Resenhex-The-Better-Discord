// Gera o inventário em Markdown (tokens, cores, tipografia, raios, sombras, ícones, animações e transições).
// Uso: node inv-md.js <inv.json> <pasta-public> <saida.md>
const fs = require('fs');
const path = require('path');
const inv = JSON.parse(fs.readFileSync(process.argv[2]));
const PUB = process.argv[3];
const OUT = process.argv[4];
const kf = {}; for (const k of inv.keyframes) kf[k.name] = k; // a última definição vence (como no navegador)
const propsOf = (body) => [...new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]).filter((p) => p !== 'animation-timing-function'))];
const COMPOSITOR = new Set(['transform', 'opacity', 'translate', 'scale', 'rotate', 'offset']);
const esc = (s) => String(s).replace(/\|/g, '\\|');
const L = [];
const P = (s = '') => L.push(s);

// ---------- Tokens ----------
P('## Tokens definidos em `:root`');
P();
P('O tema padrão passa por três camadas: `style.css` (cores do Discord) → `experience.css` (tema "calmo") → `polish.css` (carvão com roxo, só no tema padrão). O valor que vale é o da última camada.');
P();
const tokenRules = inv.rules.filter((r) => /^:root(\[[^\]]*\]|:not\([^)]*\))*$/.test(r.selector) && r.decls.some(([k]) => k.startsWith('--')));
const tokens = new Map();
for (const r of tokenRules) for (const [k, v] of r.decls) if (k.startsWith('--')) { if (!tokens.has(k)) tokens.set(k, []); tokens.get(k).push(`${r.file}${r.selector !== ':root' ? ' `' + r.selector.replace(/:root/g, '').slice(0, 40) + '`' : ''}: \`${v.slice(0, 60)}\``); }
P('| Token | Definições (em ordem de carga) |');
P('|---|---|');
for (const [k, defs] of [...tokens].sort()) if (!/^--(ld|ov|pc|sb|dj|salon|av|art|pop|ring|cut|tile|c)\b/.test(k)) P(`| \`${k}\` | ${esc(defs.join(' → '))} |`);
P();

// ---------- Cores literais ----------
const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
const colors = {}; const colorFiles = {};
for (const r of inv.rules) for (const [k, v] of r.decls) { if (k.startsWith('--')) continue; for (const c of v.match(colorRe) || []) { const key = c.toLowerCase().replace(/\s+/g, ''); colors[key] = (colors[key] || 0) + 1; (colorFiles[key] ||= new Set()).add(r.file); } }
P('## Cores fora dos tokens');
P();
P(`${Object.keys(colors).length} cores literais distintas, ${Object.values(colors).reduce((a, b) => a + b, 0)} ocorrências fora das definições de token. As 40 mais usadas:`);
P();
P('| Cor | Usos | Arquivos |');
P('|---|---|---|');
for (const [c, n] of Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 40)) P(`| \`${c}\` | ${n} | ${[...colorFiles[c]].slice(0, 6).join(', ')}${colorFiles[c].size > 6 ? '…' : ''} |`);
P();
const discordLeft = ['#5865f2', '#4752c4', '#80848e', '#4e5058', '#1e1f22', '#2b2d31', '#313338', '#35373c', '#41434a', '#6d6f78', '#dbdee1', '#b5bac1', '#949ba4'];
P('Restos da paleta do Discord ainda escritos à mão (não seguem o tema): ' + discordLeft.filter((c) => colors[c]).map((c) => `\`${c}\` (${colors[c]}×)`).join(', ') + '.');
P();

// ---------- Tipografia, raios, sombras ----------
const tally = (prop) => { const o = {}; for (const r of inv.rules) for (const [k, v] of r.decls) if (k === prop) o[v] = (o[v] || 0) + 1; return Object.entries(o).sort((a, b) => b[1] - a[1]); };
const fs_ = tally('font-size');
P('## Tipografia');
P();
P(`${fs_.length} valores de \`font-size\` diferentes. Frações de pixel (11,5 · 12,5 · 13,5 · 14,5 · 15,5 px) e tamanhos abaixo de 11 px aparecem em vários arquivos.`);
P();
P(fs_.map(([v, n]) => `\`${v}\` ×${n}`).join(' · '));
P();
const rad = tally('border-radius');
P('## Raios');
P();
P(`${rad.length} valores de \`border-radius\` diferentes:`);
P();
P(rad.map(([v, n]) => `\`${v}\` ×${n}`).join(' · '));
P();
const sh = tally('box-shadow');
P('## Sombras');
P();
P(`${sh.length} valores de \`box-shadow\` diferentes (as 15 mais usadas):`);
P();
for (const [v, n] of sh.slice(0, 15)) P(`- ×${n} \`${v.slice(0, 110)}\``);
P();

// ---------- Ícones ----------
const iconsSrc = fs.readFileSync(path.join(PUB, 'icons.js'), 'utf8');
const names = [...iconsSrc.matchAll(/^\s{4}([a-zA-Z]+): '/gm)].map((m) => m[1]);
const js = fs.readdirSync(PUB).filter((f) => f.endsWith('.js') && f !== 'icons.js').map((f) => fs.readFileSync(path.join(PUB, f), 'utf8')).join('\n') + fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const css = fs.readdirSync(PUB).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(PUB, f), 'utf8')).join('\n');
P('## Ícones (`icons.js`)');
P();
P(`${names.length} ícones, todos em traço de 2 px num quadro de 24×24 (base Lucide, ISC). "Usos" conta \`Icon('nome')\`, \`data-icon="nome"\` e nomes passados a menus. "Anima" diz se algum CSS anima o ícone ao passar o mouse ou trocar de estado.`);
P();
P('| Ícone | Usos | Anima | Observação |');
P('|---|---|---|---|');
for (const n of names) {
  const uses = (js.match(new RegExp(`Icon\\('${n}'|data-icon="${n}"|'${n}'`, 'g')) || []).length;
  const animated = new RegExp(`\\.ico-${n}\\b`).test(css);
  P(`| \`${n}\` | ${uses} | ${animated ? 'sim' : '—'} | |`);
}
P();

// ---------- Animações ----------
P('## Animações (`animation`)');
P();
P('Todas respeitam "Reduzir animações" e `prefers-reduced-motion` pela regra global do `experience.css` (`animation: none !important`), exceto as feitas em JavaScript (Web Animations API), listadas no fim.');
P();
P('| Arquivo:linha | Seletor | Keyframes | Declaração | Infinita | Propriedades | Só compositor |');
P('|---|---|---|---|---|---|---|');
let total = 0, infinite = 0, nonComp = 0;
for (const r of inv.rules) for (const [k, v] of r.decls) {
  if (k !== 'animation' && k !== 'animation-name') continue;
  if (/^none/.test(v)) continue;
  for (const part of v.split(/,(?![^(]*\))/)) {
    const n = part.trim().split(/\s+/).find((t) => kf[t]);
    if (!n) continue;
    const props = propsOf(kf[n].body);
    const comp = props.every((p) => COMPOSITOR.has(p));
    const inf = /infinite/.test(part);
    total++; if (inf) infinite++; if (!comp) nonComp++;
    P(`| ${r.file}:${r.line} | \`${esc(r.selector.slice(0, 70))}\`${r.media ? ' ' + esc(r.media.slice(0, 30)) : ''} | ${n} | \`${esc(part.trim().slice(0, 60))}\` | ${inf ? '**sim**' : 'não'} | ${props.join(', ')} | ${comp ? 'sim' : '**não**'} |`);
  }
}
P();
P(`Total: ${total} declarações de animação, ${infinite} infinitas, ${nonComp} que animam algo além de transform/opacity.`);
P();
P('Animações em JavaScript: `confetti.js` (respeita as duas preferências), `mudae-salao.js` (roleta via `element.animate`, só confere a preferência do sistema, não o "Reduzir animações" do app), `stream-zoom.js` e `mobile-stream.js` (zoom com rAF; o zoom confere as duas preferências), `music.js` (posição do player com rAF), `clip-ui.js` e `sound-trimmer.js` (cursor de reprodução com rAF).');
P();

// ---------- Transições ----------
P('## Transições (`transition`)');
P();
const tprops = {}; const nonCompT = [];
for (const r of inv.rules) for (const [k, v] of r.decls) {
  if (k !== 'transition' && k !== 'transition-property') continue;
  if (/^none/.test(v)) continue;
  const bad = [];
  for (const part of v.split(/,(?![^(]*\))/)) { const p = part.trim().split(/\s+/)[0]; tprops[p] = (tprops[p] || 0) + 1; if (!['transform', 'opacity', 'display', 'overlay', 'visibility', 'translate', 'scale', 'rotate'].includes(p) && !/^var\(|^\d/.test(p)) bad.push(p); }
  if (bad.length) nonCompT.push(`${r.file}:${r.line} \`${esc(r.selector.slice(0, 60))}\` → ${bad.join(', ')}`);
}
P('Propriedades transicionadas (número de declarações): ' + Object.entries(tprops).sort((a, b) => b[1] - a[1]).map(([p, n]) => `\`${p}\` ${n}`).join(' · ') + '.');
P();
P(`${nonCompT.length} declarações transicionam algo além de transform/opacity (repintura a cada quadro da transição):`);
P();
for (const t of nonCompT) P('- ' + t);
P();

// ---------- Desfoque ----------
P('## Desfoque (`backdrop-filter` e `filter`)');
P();
for (const r of inv.rules) for (const [k, v] of r.decls) if (/backdrop-filter|^filter$/.test(k) && /blur/.test(v)) P(`- ${r.file}:${r.line} \`${esc(r.selector.slice(0, 70))}\` — \`${k}: ${esc(v)}\``);
P();
fs.writeFileSync(OUT, L.join('\n'));
console.log('ok', OUT, L.length, 'linhas');
