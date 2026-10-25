// Volta de versão: grava o banco SQLite (data.db) como data.json, o único formato que as versões até a 1.9.0 leem.
// Rode com o site desligado, como o usuário do site (deploy/voltar-versao.ps1 faz isso):
//   sudo -u resenhex node /opt/resenhex/tools/banco-para-json.js /var/lib/resenhex/data.db /var/lib/resenhex/data.json
// Não sobrescreve um data.json que já exista. Se a versão com o SQLite voltar depois, ela vê o data.json ao lado do
// banco, guarda o banco com outro nome e importa o data.json de novo, com o que mudou durante a volta.
const fs = require('node:fs');
const path = require('node:path');
const { openStore, readRoot } = require('../server/store');

const [file, dest] = process.argv.slice(2);
if (!file || !dest) {
  console.error('Uso: node tools/banco-para-json.js <data.db> <data.json>');
  process.exit(2);
}
if (fs.existsSync(dest)) {
  console.error(`${dest} já existe: nada foi feito.`);
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`Banco não encontrado: ${file}`);
  process.exit(1);
}
// Um banco sem o pedaço 'root' nunca terminou de importar: gravar dele daria um site vazio.
const probe = openStore(file);
const saved = probe.saved;
probe.close();
if (!saved) {
  console.error(`${file} está vazio (a importação não terminou): nada foi feito.`);
  process.exit(1);
}

const root = readRoot(file);
const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.${process.pid}.tmp`);
const text = JSON.stringify(root);
const fd = fs.openSync(tmp, 'w', 0o640);
try {
  // writeFileSync repete até gravar tudo (writeSync pode gravar só uma parte); o tamanho é conferido antes de trocar.
  fs.writeFileSync(fd, text);
  fs.fsyncSync(fd);
  if (fs.fstatSync(fd).size !== Buffer.byteLength(text)) throw new Error(`${tmp} ficou incompleto: nada foi trocado.`);
} finally { fs.closeSync(fd); }
fs.renameSync(tmp, dest);
const count = (obj) => Object.keys(obj || {}).length;
const messages = Object.values(root.messages || {}).reduce((sum, list) => sum + list.length, 0);
console.log(`${dest}: ${count(root.accounts)} contas, ${count(root.servers)} servidores, ${messages} mensagens.`);
