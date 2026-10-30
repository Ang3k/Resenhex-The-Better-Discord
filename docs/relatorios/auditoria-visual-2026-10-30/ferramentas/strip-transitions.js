// Onda 1: tira das transições tudo que não é transform/opacity (e o que é discreto: display, overlay, visibility).
// Cor, fundo, borda, sombra e raio passam a trocar na hora. Uso: node strip-transitions.js <pasta-public> [--aplicar]
// Sem --aplicar, só lista o que mudaria.
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
const APPLY = process.argv.includes('--aplicar');
const KEEP = new Set(['transform', 'opacity', 'translate', 'scale', 'rotate', 'display', 'overlay', 'visibility', 'stroke-dashoffset']);
// filter só em elementos pequenos (ícones e glifos do seletor de emoji).
const SMALL_FILTER = [/\.ep-tab-glyph/];
let changed = 0, removedItems = 0;
const report = [];
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.css')).sort()) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  // Máscara de comentários (mesmo tamanho) para achar declarações só no código.
  const masked = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const re = /(^|[{;\s])(transition(?:-property)?)\s*:\s*([^;{}]+?)\s*(!important)?\s*(?=;|})/g;
  let out = '', last = 0, m;
  while ((m = re.exec(masked))) {
    const prop = m[2], value = src.substr(m.index + m[0].indexOf(m[3]), m[3].length);
    if (/^\s*none\s*$/.test(value) || /^\s*(inherit|initial|unset)\s*$/.test(value)) continue;
    // seletor da regra (para a exceção do filter): o texto antes da última { anterior
    const before = masked.slice(0, m.index);
    const selector = before.slice(before.lastIndexOf('}') + 1, before.lastIndexOf('{')).trim();
    const items = value.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
    const kept = items.filter((it) => {
      const p = it.split(/\s+/)[0];
      if (KEEP.has(p)) return true;
      if (p === 'filter' && SMALL_FILTER.some((r) => r.test(selector))) return true;
      return false;
    });
    if (kept.length === items.length) continue;
    removedItems += items.length - kept.length;
    const next = kept.length ? kept.join(', ') : 'none';
    const start = m.index + m[0].indexOf(m[3]);
    report.push(`${file}: ${selector.replace(/\s+/g, ' ').slice(0, 70)} | ${prop}: ${value.replace(/\s+/g, ' ').slice(0, 90)} → ${next}`);
    out += src.slice(last, start) + next;
    last = start + value.length;
    changed++;
  }
  out += src.slice(last);
  if (APPLY && out !== src) fs.writeFileSync(path.join(DIR, file), out);
}
console.log(report.join('\n'));
console.log(`\n${changed} declarações alteradas, ${removedItems} itens removidos${APPLY ? ' (aplicado)' : ' (simulação)'}`);
