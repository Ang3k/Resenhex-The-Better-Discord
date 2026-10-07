const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const normalize = (value) => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const identity = (row) => normalize(row[1]) + '|' + normalize(row[2]);
const suffix = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

function writeJson(file, value, rows = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  fs.writeFileSync(temp, rows ? '[\n' + value.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n' : JSON.stringify(value, null, 2) + '\n');
  // Antivírus/indexadores do Windows podem manter o destino aberto por alguns milissegundos.
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temp, file); break; }
    catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || attempt >= 7) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
}

// Preserva IDs publicados mesmo quando a seleção de uma fonte muda.
function preserveRows(previous, incoming) {
  const rows = new Map(previous.map((r) => [String(r[0]), r]));
  for (const row of incoming) {
    const old = rows.get(String(row[0]));
    rows.set(String(row[0]), old && !row[4] ? [...row.slice(0, 4), old[4], ...row.slice(5)] : row);
  }
  return [...rows.values()];
}

function mergeByRank(lists, previous = []) {
  const preferred = new Map(previous.map((row) => [identity(row), String(row[0])]));
  const unique = new Map();
  for (const list of lists) list.forEach((row, i) => {
    const scored = [...row.slice(0, 5), Math.round(1e6 / (i + 1)), row[6]];
    const key = identity(row);
    const old = unique.get(key);
    if (!old || String(scored[0]) === preferred.get(key)
      || (String(old[0]) !== preferred.get(key) && scored[5] > old[5])) unique.set(key, scored);
  });
  return [...unique.values()].sort((a, b) => b[5] - a[5]);
}

function createCollection(name, { cacheDir, resume = false } = {}) {
  const directory = cacheDir || path.join(__dirname, '..', 'mudae-cache');
  const report = { source: name, startedAt: new Date().toISOString(), status: 'running', scope: {}, counters: {}, skipped: {}, errors: [], units: {} };
  const count = (key, amount = 1) => { report.counters[key] = (report.counters[key] || 0) + amount; };
  const skip = (key, amount = 1) => { report.skipped[key] = (report.skipped[key] || 0) + amount; };
  const save = () => writeJson(path.join(directory, 'relatorios', name + '.json'), report);
  return {
    report, count, skip, cacheDir: directory,
    error(unit, err) { report.errors.push({ unit, message: String(err.message || err).slice(0, 300) }); save(); },
    progress(unit, details) { report.units[unit] = details; save(); },
    async unit(key, loader) {
      const file = path.join(directory, 'consultas', name, suffix(key) + '.json');
      // Identificadores de consultas não incluem chaves/tokens.
      if (resume && fs.existsSync(file)) {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (cached.key === key) { count('cacheHits'); return cached.data; }
      }
      const data = await loader();
      writeJson(file, { key, fetchedAt: new Date().toISOString(), data });
      count('requests');
      return data;
    },
    finish(rows) {
      report.accepted = rows.length;
      report.finishedAt = new Date().toISOString();
      report.status = report.errors.length ? 'partial' : 'complete';
      save();
      return rows;
    },
  };
}

function validateRows(rows, source) {
  const ids = new Set();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 7 || !String(row[0]) || !row[1] || !row[2]
      || !row[3] || !['', 'F', 'M'].includes(row[4]) || !Number.isFinite(row[5]) || row[6] !== source
      || ids.has(String(row[0]))) throw new Error('Registros inválidos ou IDs repetidos em ' + source);
    ids.add(String(row[0]));
  }
}

module.exports = { normalize, identity, suffix, writeJson, preserveRows, mergeByRank, createCollection, validateRows };
