// Microteste: custo de estilo de 2000 botões com transição usando var() com linear() longo × cubic-bezier × literal.
// Uso: node bench-var.js
const { chromium } = require('playwright');
const LIN = 'linear(0, .066, .199, .349, .529, .702, .853, .975, 1.064, 1.117, 1.15, 1.159, 1.151, 1.131, 1.108, 1.079, 1.051, 1.027, 1.007, .992, .982, .977, .975, .976, .979, .983, .987, .991, 1)';
const CASES = {
  'sem transição': '',
  'var(cubic-bezier)': '.b { transition: transform 200ms var(--cb); }',
  'var(linear 29 pontos)': '.b { transition: transform 410ms var(--lin); }',
  'linear literal': `.b { transition: transform 410ms ${LIN}; }`,
  'cubic-bezier literal': '.b { transition: transform 410ms cubic-bezier(.34, 1.56, .64, 1); }',
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const [name, css] of Object.entries(CASES)) {
    const times = [];
    for (let r = 0; r < 7; r++) {
      const t = await page.evaluate(([css, LIN]) => {
        document.head.innerHTML = `<style>:root { --cb: cubic-bezier(.22, 1, .36, 1); --lin: ${LIN}; } ${css}</style>`;
        document.body.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 2000; i++) { const b = document.createElement('button'); b.className = 'b'; b.textContent = '😀'; frag.append(b); }
        document.body.offsetHeight;
        const t0 = performance.now();
        document.body.append(frag);
        document.body.offsetHeight; // estilo + layout
        return performance.now() - t0;
      }, [css, LIN]);
      times.push(t);
    }
    times.sort((a, b) => a - b);
    console.log(name.padEnd(24), 'mediana', times[3].toFixed(1), 'ms (CPU 4×)', times.map((x) => x.toFixed(0)).join(' '));
  }
  await browser.close();
})();
