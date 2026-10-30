// Passa o mouse na sala de voz e conta as animações no ícone do alto-falante. Uso: node probe-hover-sala.js <seed.json> <base>
const { chromium } = require('playwright');
const fs = require('fs');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([t]) => { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); localStorage.setItem('notifyDismissed', '1'); }, [SEED.accounts.ana.token]);
  const page = await ctx.newPage();
  await page.goto(process.argv[3] + '/'); await page.waitForSelector('#app:not(.hidden)'); await new Promise((r) => setTimeout(r, 1200));
  const sala = page.locator('#channel-groups .channel', { hasText: 'Sala da resenha' }).first();
  await sala.hover(); await new Promise((r) => setTimeout(r, 120));
  const n = await sala.evaluate((row) => [...row.querySelectorAll('.ico-volume, .ico-volume *')].reduce((s, e) => s + e.getAnimations().length, 0));
  const paths = await sala.evaluate((row) => row.querySelector('.ico-volume')?.innerHTML);
  console.log('animações no alto-falante com o mouse em cima:', n, '|', paths);
  await browser.close();
})();
