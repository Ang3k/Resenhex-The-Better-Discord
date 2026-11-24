#!/usr/bin/env node
// Confere, ANTES de publicar, que o catálogo novo não tira nem muda ninguém que já está no perfil de alguém.
//   node tools/mudae-conferir-publicacao.js [--novo=catalogo-expandido.json] [--antigo=server/mudae-catalogo.json] [--ids=ids-casados.json]
// Quem casou guarda só o id do personagem; o valor e a raridade são calculados na hora pela posição. Então basta provar que:
//   1. todo id do catálogo antigo existe no novo (senão a carta some do harém, álbum e ranking);
//   2. nome, obra e gênero não mudaram (a foto pode melhorar, e é contada à parte);
//   3. (opcional) todo id que alguém casou de verdade (--ids = arquivo JSON com a lista de ids, tirada do servidor) existe no novo.
// Sai com código 1 se houver qualquer id perdido ou personagem trocado por outro.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const opt = (nome, padrao) => (process.argv.find((a) => a.startsWith('--' + nome + '=')) || '').slice(nome.length + 3) || padrao;
const ler = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function conferir(antigo, novo, casados = []) {
  const porId = new Map(novo.map((r) => [String(r[0]), r]));
  const r = { antigos: antigo.length, novos: novo.length, perdidos: [], trocados: [], fotoNova: 0, saiuDaRoleta: 0, casadosPerdidos: [] };
  for (const a of antigo) {
    const b = porId.get(String(a[0]));
    if (!b) { r.perdidos.push(a[0]); continue; }
    if (a[1] !== b[1] || a[2] !== b[2] || (a[4] || '') !== (b[4] || '')) r.trocados.push({ id: a[0], antes: [a[1], a[2], a[4]], depois: [b[1], b[2], b[4]] });
    if (a[3] !== b[3]) r.fotoNova++;
    if (a[7] !== 1 && b[7] === 1) r.saiuDaRoleta++;
  }
  for (const id of casados) if (!porId.has(String(id))) r.casadosPerdidos.push(id);
  return r;
}

if (require.main === module) {
  const antigoF = path.resolve(opt('antigo', path.join(raiz, 'server', 'mudae-catalogo.json')));
  const novoF = path.resolve(opt('novo', path.join(raiz, 'tools', 'mudae-cache', 'prototipos', 'catalogo-expandido.json')));
  const idsF = opt('ids', '');
  const r = conferir(ler(antigoF), ler(novoF), idsF ? ler(idsF) : []);
  console.log('Catálogo antigo: ' + r.antigos + ' | novo: ' + r.novos + ' (+' + (r.novos - r.antigos) + ')');
  console.log('Ids perdidos:            ' + r.perdidos.length + (r.perdidos.length ? '  ex.: ' + r.perdidos.slice(0, 5).join(', ') : ''));
  console.log('Personagem trocado:      ' + r.trocados.length + (r.trocados.length ? '  ex.: ' + JSON.stringify(r.trocados[0]) : ''));
  console.log('Foto atualizada:         ' + r.fotoNova + ' (a carta continua a mesma, com imagem nova)');
  console.log('Saíram da roleta:        ' + r.saiuDaRoleta + ' (quem já tem continua com eles)');
  if (idsF) console.log('Casados de verdade:      ' + r.casadosPerdidos.length + ' perdidos de ' + ler(idsF).length);
  const ruim = r.perdidos.length || r.trocados.length || r.casadosPerdidos.length;
  console.log(ruim ? 'REPROVADO: não publique assim.' : 'APROVADO: ninguém perde personagem; só os valores acompanham a nova posição.');
  process.exitCode = ruim ? 1 : 0;
}
module.exports = { conferir };
