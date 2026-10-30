// Quanto a mensagem de áudio demora para começar a gravar: do clique no microfone até o "Abrindo o microfone…" sumir
// (microfone aberto e gravador ligado), até o relógio andar e até o medidor mexer. Microfone falso do Chromium (apita).
// Uso: node probe-gravacao.js <seed.json> <base> [repeticoes] [--na-call]
const { chromium } = require('playwright');
const fs = require('fs');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const BASE = process.argv[3];
const N = Number(process.argv[4] || 5);
const IN_CALL = process.argv.includes('--na-call');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'], locale: 'pt-BR' });
  await ctx.addInitScript(([t]) => { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); localStorage.setItem('notifyDismissed', '1'); }, [SEED.accounts.ana.token]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/'); await page.waitForSelector('#app:not(.hidden)'); await sleep(1500);
  if (IN_CALL) {
    await page.locator('#channel-groups .channel', { hasText: 'Sala da resenha' }).first().click();
    await page.waitForSelector('#voice-panel:not(.hidden)'); await sleep(1500);
    await page.locator('#channel-groups .channel', { hasText: 'geral' }).first().click(); await sleep(1000);
  }
  const out = [];
  for (let i = 0; i < N; i++) {
    const r = await page.evaluate(async () => {
      const t0 = performance.now();
      const status = document.getElementById('voice-rec-status'), time = document.getElementById('voice-rec-time'), meter = document.getElementById('voice-rec-meter');
      document.getElementById('btn-voice-msg').click();
      const res = {};
      while (performance.now() - t0 < 8000) {
        await new Promise((r) => setTimeout(r, 5));
        const now = performance.now() - t0;
        if (res.aberto == null && status.textContent === '' && !document.getElementById('voice-rec').classList.contains('hidden')) res.aberto = Math.round(now);
        if (res.medidor == null && [...meter.children].some((s) => s.style.transform && s.style.transform !== 'scaleY(0.110)')) res.medidor = Math.round(now);
        if (res.relogio == null && time.textContent !== '0:00') res.relogio = Math.round(now);
        if (res.aberto != null && res.medidor != null && res.relogio != null) break;
      }
      return res;
    });
    out.push(r);
    await page.keyboard.press('Escape'); await sleep(800);
  }
  console.log(JSON.stringify({ base: BASE, naCall: IN_CALL, rodadas: out }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
