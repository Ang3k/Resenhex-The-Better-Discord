const fs = require('fs');
const { wait } = require('./comum');
const { writeJson } = require('./coleta');

// Registra cada tentativa, inclusive retries, para respeitar uma janela móvel de 200/h.
function hourlyPacer(file, history = [], { limit = 200, windowMs = 3_600_000, gapMs = 1000, reserve = 20, now = Date.now, sleep = wait, save = writeJson } = {}) {
  let timestamps = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).timestamps
    : [...history, ...Array.from({ length: reserve }, (_, i) => now() - i)];
  let last = 0;
  return async () => {
    if (last + gapMs > now()) await sleep(last + gapMs - now());
    let warned = false;
    for (;;) {
      timestamps = timestamps.filter((t) => t > now() - windowMs).sort((a, b) => a - b);
      if (timestamps.length < limit) break;
      if (!warned) { console.log('  Comic Vine: cota horária ocupada; aguardando a janela liberar'); warned = true; }
      await sleep(Math.min(60_000, timestamps[0] + windowMs - now() + 1));
    }
    last = now();
    timestamps.push(last);
    save(file, { timestamps });
  };
}

module.exports = { hourlyPacer };
