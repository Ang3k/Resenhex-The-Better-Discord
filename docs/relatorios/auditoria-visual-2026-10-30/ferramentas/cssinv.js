// Inventário do CSS: regras com animação/transição, keyframes, blur, cores fora dos tokens, tamanhos de fonte, raios e sombras.
const fs = require('fs'); const path = require('path');
const DIR = process.argv[2] || '/home/user/Resenhex-The-Better-Discord/discord-clone/public';
const OUT = process.argv[3] || '/tmp/inv.json';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.css')).sort();
// Parser mínimo: devolve [{file, line, media, selector, decls:[[prop,value]]}] e keyframes {name:{file, line, body}}
function parse(file) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const rules = []; const keyframes = [];
  let i = 0; const stack = [];
  const lineAt = (pos) => src.slice(0, pos).split('\n').length;
  function block(start, ctx) {
    let sel = ''; let selStart = start;
    for (let p = start; p < src.length; p++) {
      const ch = src[p];
      if (ch === '{') {
        const s = sel.trim();
        if (s.startsWith('@keyframes')) {
          // acha o fim balanceado
          let depth = 1, q = p + 1; while (depth && q < src.length) { if (src[q] === '{') depth++; else if (src[q] === '}') depth--; q++; }
          keyframes.push({ file, line: lineAt(selStart), name: s.replace('@keyframes', '').trim(), body: src.slice(p + 1, q - 1).replace(/\s+/g, ' ').trim(), media: ctx.join(' ') });
          p = q - 1; sel = ''; selStart = p + 1; continue;
        }
        if (s.startsWith('@media') || s.startsWith('@supports') || s.startsWith('@layer') || s.startsWith('@container') || s.startsWith('@scope') || s.startsWith('@starting-style')) {
          p = block(p + 1, [...ctx, s]); sel = ''; selStart = p + 1; continue;
        }
        if (s.startsWith('@font-face') || s.startsWith('@property') || s.startsWith('@page')) {
          let q = src.indexOf('}', p); p = q; sel = ''; selStart = p + 1; continue;
        }
        // regra comum (pode ter aninhamento simples; ignoramos aninhamento CSS)
        let depth = 1, q = p + 1; while (depth && q < src.length) { if (src[q] === '{') depth++; else if (src[q] === '}') depth--; q++; }
        const body = src.slice(p + 1, q - 1);
        const decls = body.split(/;(?![^(]*\))/).map((d) => d.trim()).filter(Boolean).map((d) => { const k = d.indexOf(':'); return [d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()]; }).filter(([k]) => k && !k.includes('{'));
        rules.push({ file, line: lineAt(selStart + (sel.length - sel.trimStart().length)), media: ctx.join(' '), selector: s.replace(/\s+/g, ' '), decls });
        p = q - 1; sel = ''; selStart = p + 1; continue;
      }
      if (ch === '}') return p;
      if (ch === ';' && sel.trim().startsWith('@')) { sel = ''; selStart = p + 1; continue; }
      sel += ch;
    }
    return src.length;
  }
  block(0, []);
  return { rules, keyframes };
}
const all = { rules: [], keyframes: [] };
for (const f of files) { const r = parse(f); all.rules.push(...r.rules); all.keyframes.push(...r.keyframes); }
fs.writeFileSync(OUT, JSON.stringify(all));
console.log('files', files.length, 'rules', all.rules.length, 'keyframes', all.keyframes.length);
