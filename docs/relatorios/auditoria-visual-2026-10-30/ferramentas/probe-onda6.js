// Fotos rápidas da onda 6: membros offline, barra da chamada no celular (setinhas de 24 px) e um menu (elevação).
const { chromium } = require('playwright');
const fs = require('fs');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const OUT = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  for (const [name, opts] of [['desk', { viewport: { width: 1440, height: 900 } }], ['cel', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const ctx = await browser.newContext({ ...opts, permissions: ['microphone', 'camera'] });
    await ctx.addInitScript(([t]) => { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); localStorage.setItem('notifyDismissed', '1'); }, [SEED.accounts.ana.token]);
    const page = await ctx.newPage();
    await page.goto(SEED.base + '/'); await page.waitForSelector('#app:not(.hidden)'); await sleep(1200);
    if (name === 'desk') {
      await page.locator('#members').screenshot({ path: `${OUT}/o6-membros.png` });
      await page.locator('#member-list .member').first().click({ button: 'right' }); await sleep(400);
      await page.screenshot({ path: `${OUT}/o6-menu.png`, clip: { x: 900, y: 0, width: 540, height: 500 } });
      await page.keyboard.press('Escape');
    }
    if (name === 'cel') { const b = page.locator('#btn-channels'); if (await b.isVisible()) { await b.click(); await sleep(500); } }
    await page.locator('#channel-groups .channel', { hasText: 'Sala da resenha' }).first().click();
    await page.waitForSelector('#voice-view:not(.hidden)'); await sleep(1500);
    await page.locator('#stage-controls').screenshot({ path: `${OUT}/o6-barra-${name}.png` });
    const r = await page.evaluate(() => ['sc-mic', 'sc-mic-devices', 'sc-cam', 'sc-cam-devices', 'sc-deaf'].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); return id + ' ' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height); }));
    console.log(name, r.join(' | '));
    await page.click('#sc-leave, .sc-btn.hangup').catch(() => {});
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
