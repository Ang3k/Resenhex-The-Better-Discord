// `npm test` roda isto antes dos testes (pretest): monta o molde do catálogo do Mudae (server/mudae-catalogo.db,
// fora do Git) uma vez só. Cada teste que liga o servidor usa uma pasta de dados nova; sem o molde, cada um
// montaria o próprio banco (~2 s e 26 MB cada). Se o molde já está em dia com o JSON, não faz nada.
const path = require('node:path');
const { createMudae } = require('../server/mudae');

const json = path.join(__dirname, '..', 'server', 'mudae-catalogo.json');
createMudae({ catalogFile: json, catalogDb: json.replace(/\.json$/i, '') + '.db' });
process.exit(0);
