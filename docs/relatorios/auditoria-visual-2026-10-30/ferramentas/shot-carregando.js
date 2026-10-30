// Abertura com rede lenta simulada (a mesma da cena "loading" do shots.js): foto logo depois de a página terminar de
// carregar (CSS, scripts e imagens), enquanto o app ainda conecta ao servidor. Mesma condição nas duas versões.
// Uso: node shot-carregando.js <seed.json> <base> <saida-prefixo>
const { chromium } = require('playwright');
const fs = require('fs');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const BASE = process.argv[3];
const OUT = process.argv[4];
const SIZES = { desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, cel: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
(async () => {
  const browser = await chromium.launch();
  for (const size of ['desk', 'cel']) {
    const ctx = await browser.newContext({ ...SIZES[size], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.addInitScript(([t]) => { if (!sessionStorage.getItem('__i')) { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); localStorage.setItem('notifyDismissed', '1'); sessionStorage.setItem('__i', '1'); } }, [SEED.accounts.ana.token]);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
    const t0 = Date.now();
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 300));
    const conectando = await page.evaluate(() => document.getElementById('app').classList.contains('hidden'));
    await page.screenshot({ path: `${OUT}-${size}.png` });
    console.log(size, 'carregou em', ((Date.now() - t0) / 1000).toFixed(1), 's; ainda conectando:', conectando);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
