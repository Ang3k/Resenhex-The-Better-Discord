// Preferências do app de desktop, salvas em um JSON na pasta de dados do usuário.
const fs = require('node:fs');
const path = require('node:path');

function createStore(file, defaults) {
  let data = { ...defaults };
  try { data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* primeiro uso ou arquivo corrompido */ }
  return {
    get: (key) => data[key],
    set(key, value) {
      data[key] = value;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
        fs.renameSync(file + '.tmp', file);
      } catch (error) { console.warn('Não foi possível salvar as preferências:', error.message); }
    },
  };
}

module.exports = { createStore };
