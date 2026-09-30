// Registro simples em arquivo (pasta de dados do app), para entender problemas de atualização
// no computador de quem usa. O arquivo recomeça quando passa de 512 KB.
const fs = require('node:fs');

function createLog(file) {
  try { if (fs.statSync(file).size > 512 * 1024) fs.rmSync(file); } catch { /* ainda não existe */ }
  const write = (level) => (...parts) => {
    const text = parts.map((part) => (part instanceof Error ? part.stack || part.message : typeof part === 'string' ? part : JSON.stringify(part))).join(' ');
    try { fs.appendFileSync(file, `${new Date().toISOString()} [${level}] ${text}\n`); } catch { /* sem espaço ou sem permissão */ }
  };
  return { info: write('info'), warn: write('aviso'), error: write('erro'), debug: () => {} };
}

module.exports = { createLog };
