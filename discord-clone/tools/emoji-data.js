// Gera public/emoji-data.json a partir do emojibase-data 16 (rótulos em português + inglês para a busca).
// Uso: npm pack emojibase-data@16.0.3, extraia e rode: node tools/emoji-data.js <pasta package> public/emoji-data.json
const fs = require('fs');
const path = require('path');
const [src, out] = process.argv.slice(2);
const pt = JSON.parse(fs.readFileSync(path.join(src, 'pt/compact.json'), 'utf8'));
const versions = new Map(JSON.parse(fs.readFileSync(path.join(src, 'pt/data.json'), 'utf8')).map((e) => [e.hexcode, e.version]));
const en = new Map(JSON.parse(fs.readFileSync(path.join(src, 'en/compact.json'), 'utf8')).map((e) => [e.hexcode, e]));
const GROUPS = { 0: 'smileys', 1: 'people', 3: 'nature', 4: 'food', 5: 'travel', 6: 'activities', 7: 'objects', 8: 'symbols', 9: 'flags' };
const order = [0, 1, 3, 4, 5, 6, 7, 8, 9];
const groups = Object.fromEntries(order.map((g) => [GROUPS[g], []]));
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let skipped = 0;
for (const e of pt.sort((a, b) => a.order - b.order)) {
  if (!(e.group in GROUPS) || e.order == null) continue;
  // Emojis muito novos ainda não aparecem nas fontes do Windows: viram quadradinhos.
  const english = en.get(e.hexcode);
  const version = versions.get(e.hexcode) ?? 0;
  if (version > 15) { skipped++; continue; }
  const words = new Set([e.label, ...(e.tags || []), english?.label, ...(english?.tags || [])].filter(Boolean).map(norm));
  groups[GROUPS[e.group]].push([e.unicode, e.label, [...words].join(' ')]);
}
fs.writeFileSync(out, JSON.stringify(groups));
console.log('total', Object.values(groups).reduce((n, g) => n + g.length, 0), 'skipped', skipped, 'bytes', fs.statSync(out).size);
