// `npm run check`: confere a sintaxe (node --check) de todo o JavaScript do servidor e do site.
// Arquivos novos em server/ e public/ entram sozinhos, sem precisar listar no package.json.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const extensions = new Set(['.js', '.mjs', '.cjs']);

function scripts(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : scripts(full);
    return extensions.has(path.extname(entry.name)) ? [full] : [];
  });
}

const files = [path.join(root, 'server.js'), ...scripts(path.join(root, 'server')), ...scripts(path.join(root, 'public'))];
const failed = files.filter((file) => {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'inherit'] });
  return result.status !== 0;
});

if (failed.length) {
  console.error(`Erro de sintaxe em ${failed.length} arquivo(s): ${failed.map((file) => path.relative(root, file)).join(', ')}`);
  process.exit(1);
}
console.log(`Sintaxe OK em ${files.length} arquivos.`);
