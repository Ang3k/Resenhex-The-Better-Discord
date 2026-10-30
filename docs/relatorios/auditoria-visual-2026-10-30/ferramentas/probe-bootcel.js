// Diagnóstico da abertura no celular com rede lenta: estado das animações, da imagem e das fontes ao longo do tempo.
const { chromium } = require('playwright');
const fs = require('fs');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const BASE = process.argv[3];
const MOBILE = process.argv[4] !== 'desk';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(MOBILE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([t]) => { if (!sessionStorage.getItem('__i')) { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); sessionStorage.setItem('__i', '1'); } }, [SEED.accounts.ana.token]);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
  const t0 = Date.now();
  page.on('console', (m) => console.log('console', m.text().slice(0, 120)));
  await page.goto(BASE + '/', { waitUntil: 'commit' });
  for (const ms of [3000, 5000, 8000, 11000]) {
    await new Promise((r) => setTimeout(r, ms - (Date.now() - t0)));
    const info = await page.evaluate(() => {
      const t = document.querySelector('.boot-text'), m = document.querySelector('.boot-mark');
      const an = document.getAnimations().map((a) => `${a.animationName || a.constructor.name}:${a.playState}:${Math.round(a.currentTime ?? -1)}`).slice(0, 8);
      return { html: document.documentElement.className, sheets: document.styleSheets.length, ready: document.readyState, textOp: t && getComputedStyle(t).opacity, markOp: m && getComputedStyle(m).opacity, img: document.querySelector('.boot-mark img')?.complete, fonts: document.fonts.status, an, rm: matchMedia('(prefers-reduced-motion: reduce)').matches, vis: document.visibilityState };
    }).catch((e) => e.message);
    console.log(ms, JSON.stringify(info));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
